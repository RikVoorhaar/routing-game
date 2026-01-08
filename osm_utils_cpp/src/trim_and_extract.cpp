#include "RoutableWays.h"
#include <osmium/handler.hpp>
#include <osmium/io/pbf_input.hpp>
#include <osmium/io/pbf_output.hpp>
#include <osmium/io/reader.hpp>
#include <osmium/io/writer.hpp>
#include <osmium/handler/node_locations_for_ways.hpp>
#include <osmium/index/map/sparse_file_array.hpp>
#include <osmium/osm/node.hpp>
#include <osmium/osm/way.hpp>
#include <osmium/osm/location.hpp>
#include <osmium/builder/osm_object_builder.hpp>
#include <osmium/memory/buffer.hpp>

#include <ankerl/unordered_dense.h>
#include <iostream>
#include <fstream>
#include <filesystem>
#include <string>
#include <vector>
#include <optional>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <zlib.h>
#include <cstring>
#include <algorithm>
#include <ctime>
#include <cmath>
#include <unistd.h>
#include <sys/ioctl.h>

namespace fs = std::filesystem;

static double haversine_m(const osmium::Location& a, const osmium::Location& b) {
    // Great-circle distance. Assumes inputs are valid locations.
    constexpr double R = 6371000.0;
    const double lat1 = a.lat() * M_PI / 180.0;
    const double lon1 = a.lon() * M_PI / 180.0;
    const double lat2 = b.lat() * M_PI / 180.0;
    const double lon2 = b.lon() * M_PI / 180.0;
    const double dlat = lat2 - lat1;
    const double dlon = lon2 - lon1;
    const double sin_dlat = std::sin(dlat / 2.0);
    const double sin_dlon = std::sin(dlon / 2.0);
    const double h = sin_dlat * sin_dlat + std::cos(lat1) * std::cos(lat2) * sin_dlon * sin_dlon;
    const double c = 2.0 * std::atan2(std::sqrt(h), std::sqrt(1.0 - h));
    return R * c;
}

static bool is_ferry_or_highway(const osmium::TagList& tags) {
    // Check for route=ferry
    const char* route_value = tags.get_value_by_key("route");
    if (route_value && std::strcmp(route_value, "ferry") == 0) {
        return true;
    }
    
    // Check for any highway=* tag
    const char* highway_value = tags.get_value_by_key("highway");
    if (highway_value) {
        return true;
    }
    
    return false;
}

static std::optional<double> parse_maxspeed_kmh(const osmium::TagList& tags) {
    const char* raw = tags.get_value_by_key("maxspeed");
    if (!raw) {
        return std::nullopt;
    }
    std::string s(raw);
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });

    const bool is_mph = (s.find("mph") != std::string::npos);

    // Parse leading number (handles "50", "50 km/h", "30mph", "30 mph").
    size_t i = 0;
    while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) {
        ++i;
    }
    const size_t start = i;
    while (i < s.size() && (std::isdigit(static_cast<unsigned char>(s[i])) || s[i] == '.')) {
        ++i;
    }
    if (i == start) {
        return std::nullopt;
    }

    try {
        const double value = std::stod(s.substr(start, i - start));
        if (value <= 0.0) {
            return std::nullopt;
        }
        return is_mph ? (value * 1.609344) : value;
    } catch (...) {
        return std::nullopt;
    }
}

// Memory reporting helper (Linux-specific)
struct MemoryStats {
    uint64_t rss_kb = 0;      // Resident Set Size in KB
    uint64_t peak_rss_kb = 0; // Peak RSS in KB (VmHWM)
    
    static MemoryStats get_current() {
        MemoryStats stats;
#ifdef __linux__
        std::ifstream status_file("/proc/self/status");
        if (status_file.is_open()) {
            std::string line;
            while (std::getline(status_file, line)) {
                if (line.substr(0, 6) == "VmRSS:") {
                    std::istringstream iss(line.substr(6));
                    iss >> stats.rss_kb;
                } else if (line.substr(0, 6) == "VmHWM:") {
                    std::istringstream iss(line.substr(6));
                    iss >> stats.peak_rss_kb;
                }
            }
        }
#endif
        return stats;
    }
    
    std::string format() const {
        std::ostringstream oss;
        if (rss_kb > 0) {
            if (rss_kb >= 1024 * 1024) {
                oss << std::fixed << std::setprecision(1) << (rss_kb / (1024.0 * 1024.0)) << " GB";
            } else if (rss_kb >= 1024) {
                oss << std::fixed << std::setprecision(1) << (rss_kb / 1024.0) << " MB";
            } else {
                oss << rss_kb << " KB";
            }
        } else {
            oss << "N/A";
        }
        return oss.str();
    }
    
    std::string format_peak() const {
        std::ostringstream oss;
        if (peak_rss_kb > 0) {
            if (peak_rss_kb >= 1024 * 1024) {
                oss << std::fixed << std::setprecision(1) << (peak_rss_kb / (1024.0 * 1024.0)) << " GB";
            } else if (peak_rss_kb >= 1024) {
                oss << std::fixed << std::setprecision(1) << (peak_rss_kb / 1024.0) << " MB";
            } else {
                oss << peak_rss_kb << " KB";
            }
        } else {
            oss << "N/A";
        }
        return oss.str();
    }
};

// Address data structure
struct Address {
    std::string id;
    double lat;
    double lon;
    std::string street;
    std::string house_number;
    std::string postcode;
    std::string city;
};

// Helper functions for address extraction (shared between handlers)
bool has_address_tags(const osmium::TagList& tags) {
    for (const auto& tag : tags) {
        if (std::strncmp(tag.key(), "addr:", 5) == 0) {
            return true;
        }
    }
    return false;
}

Address extract_address_data(const osmium::Node& node) {
    Address addr;
    addr.id = std::to_string(node.id());
    addr.lat = node.location().lat();
    addr.lon = node.location().lon();
    addr.street = "";
    addr.house_number = "";
    addr.postcode = "";
    addr.city = "";
    
    for (const auto& tag : node.tags()) {
        const char* key = tag.key();
        const char* value = tag.value();
        
        if (std::strcmp(key, "addr:street") == 0) {
            addr.street = value;
        } else if (std::strcmp(key, "addr:housenumber") == 0) {
            addr.house_number = value;
        } else if (std::strcmp(key, "addr:postcode") == 0) {
            addr.postcode = value;
        } else if (std::strcmp(key, "addr:city") == 0) {
            addr.city = value;
        }
    }
    
    return addr;
}

// Pass 1: Collect node IDs from routable ways and extract addresses
class Pass1Handler : public osmium::handler::Handler {
private:
    std::ofstream& m_csv_file;
    ankerl::unordered_dense::set<osmium::object_id_type> m_nodes_needed;
    bool m_simplify = false;
    bool m_ignore_routability = false;
    
    uint64_t m_processed_nodes = 0;
    uint64_t m_processed_ways = 0;
    uint64_t m_addresses_found = 0;
    
    // Progress tracking
    uint64_t m_file_size = 0;
    std::chrono::steady_clock::time_point m_start_time;
    std::chrono::steady_clock::time_point m_last_progress_time;
    
    // Track when we transition from nodes to ways for better estimation
    uint64_t m_nodes_at_way_start = 0;
    bool m_seen_ways = false;
    
    void update_file_position_estimate(uint64_t& bytes_read) {
        if (m_file_size == 0) return;
        
        if (!m_seen_ways) {
            if (m_processed_nodes < 10000) {
                bytes_read = static_cast<uint64_t>(0.05 * m_file_size);
            } else if (m_processed_nodes < 100000) {
                double progress_through_nodes = std::min(0.3, static_cast<double>(m_processed_nodes) / 500000.0);
                bytes_read = static_cast<uint64_t>(0.7 * m_file_size * progress_through_nodes);
            } else {
                double progress_through_nodes = std::min(0.95, 0.6 + (static_cast<double>(m_processed_nodes - 100000) / 2000000.0));
                bytes_read = static_cast<uint64_t>(0.7 * m_file_size * progress_through_nodes);
            }
        } else {
            if (m_nodes_at_way_start == 0) {
                m_nodes_at_way_start = m_processed_nodes;
            }
            double estimated_total_ways = static_cast<double>(m_nodes_at_way_start) / 15.0;
            if (estimated_total_ways > 0 && m_processed_ways > 0) {
                double way_progress = std::min(1.0, static_cast<double>(m_processed_ways) / estimated_total_ways);
                bytes_read = static_cast<uint64_t>(0.7 * m_file_size + 0.3 * m_file_size * way_progress);
            } else {
                bytes_read = static_cast<uint64_t>(0.7 * m_file_size);
            }
        }
        bytes_read = std::min(bytes_read, m_file_size);
    }
    
    void update_progress() {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - m_last_progress_time);
        
        if (elapsed.count() < 100 && m_processed_nodes % 10000 != 0 && m_processed_ways % 1000 != 0) {
            return;
        }
        
        m_last_progress_time = now;
        
        auto total_elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - m_start_time);
        int64_t elapsed_sec = total_elapsed.count();
        double nodes_per_sec = elapsed_sec > 0 ? static_cast<double>(m_processed_nodes) / static_cast<double>(elapsed_sec) : 0.0;
        
        int64_t hours_spent = elapsed_sec / 3600;
        int64_t minutes_spent = (elapsed_sec % 3600) / 60;
        int64_t seconds_spent = elapsed_sec % 60;
        
        std::ostringstream time_oss;
        if (hours_spent > 0) {
            time_oss << hours_spent << "h" << minutes_spent << "m" << seconds_spent << "s";
        } else if (minutes_spent > 0) {
            time_oss << minutes_spent << "m" << seconds_spent << "s";
        } else {
            time_oss << seconds_spent << "s";
        }
        
        std::ostringstream progress_oss;
        progress_oss << "Pass 1/2: Nodes " << m_processed_nodes
                     << " | Ways " << m_processed_ways
                     << " | " << (m_simplify ? "Kept " : "Needed ") << m_nodes_needed.size() << " nodes"
                     << " | Addr " << m_addresses_found
                     << " | " << std::fixed << std::setprecision(0) << nodes_per_sec << " nodes/s"
                     << " | " << time_oss.str();
        
        std::string progress_str = progress_oss.str();
        
        static bool is_tty = isatty(STDOUT_FILENO);
        if (is_tty) {
            winsize ws{};
            size_t cols = 0;
            if (ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws) == 0 && ws.ws_col > 0) {
                cols = static_cast<size_t>(ws.ws_col);
            }
            if (cols > 0 && progress_str.size() >= cols) {
                const size_t keep = (cols > 4) ? (cols - 4) : 0;
                progress_str = progress_str.substr(0, keep) + "...";
            }
            std::cout << "\r\033[2K" << progress_str << std::flush;
        } else {
            std::cout << progress_str << "\n" << std::flush;
        }
    }
    
    void write_address_csv(const Address& addr) {
        m_csv_file << addr.id << ","
                   << std::fixed << std::setprecision(7) << addr.lat << ","
                   << addr.lon << ","
                   << "\"" << addr.street << "\","
                   << "\"" << addr.house_number << "\","
                   << "\"" << addr.postcode << "\","
                   << "\"" << addr.city << "\"\n";
    }
    
public:
    Pass1Handler(std::ofstream& csv_file, uint64_t file_size, bool simplify, bool ignore_routability)
        : m_csv_file(csv_file)
        , m_simplify(simplify)
        , m_ignore_routability(ignore_routability)
        , m_file_size(file_size)
        , m_start_time(std::chrono::steady_clock::now())
        , m_last_progress_time(m_start_time) {
    }
    
    void node(const osmium::Node& node) {
        m_processed_nodes++;
        
        // Extract addresses if present and location is valid
        if (has_address_tags(node.tags()) && node.location().valid()) {
            Address addr = extract_address_data(node);
            if (addr.lat != 0.0 || addr.lon != 0.0) {
                write_address_csv(addr);
                m_addresses_found++;
            }
        }
        
        if (m_processed_nodes % 10000 == 0) {
            update_progress();
        }
    }
    
    void way(const osmium::Way& way) {
        m_processed_ways++;
        
        if (!m_seen_ways) {
            m_seen_ways = true;
        }
        
        // Collect node IDs from routable ways (or ferry/highway ways if ignore_routability is set)
        bool should_include = RoutableWays::is_routable_way(way.tags());
        if (m_ignore_routability && !should_include) {
            should_include = is_ferry_or_highway(way.tags());
        }
        if (should_include) {
            if (!m_simplify) {
                for (const auto& node_ref : way.nodes()) {
                    m_nodes_needed.insert(static_cast<osmium::object_id_type>(node_ref.ref()));
                }
            } else {
                const auto& nodes = way.nodes();
                if (nodes.size() >= 2) {
                    m_nodes_needed.insert(static_cast<osmium::object_id_type>(nodes.front().ref()));
                    m_nodes_needed.insert(static_cast<osmium::object_id_type>(nodes.back().ref()));
                }
            }
        }
        
        if (m_processed_ways % 1000 == 0) {
            update_progress();
        }
    }
    
    // Getters
    const ankerl::unordered_dense::set<osmium::object_id_type>& nodes_needed() const { return m_nodes_needed; }
    uint64_t processed_nodes() const { return m_processed_nodes; }
    uint64_t processed_ways() const { return m_processed_ways; }
    uint64_t addresses_found() const { return m_addresses_found; }
    std::chrono::steady_clock::time_point start_time() const { return m_start_time; }
    
    void finalize_progress() {
        update_progress();
        std::cout << "\n";
        // Report memory usage at end of pass 1
        MemoryStats mem = MemoryStats::get_current();
        std::cout << "Pass 1 memory: RSS=" << mem.format() << ", Peak=" << mem.format_peak() << "\n";
    }
};

// Pass 2: Write nodes (if in set) and routable ways
class Pass2Handler : public osmium::handler::Handler {
private:
    const ankerl::unordered_dense::set<osmium::object_id_type>& m_nodes_needed;
    osmium::io::Writer& m_writer;
    bool m_simplify = false;
    bool m_ignore_routability = false;
    
    uint64_t m_processed_nodes = 0;
    uint64_t m_processed_ways = 0;
    uint64_t m_written_ways = 0;
    uint64_t m_written_nodes = 0;
    
    // Progress tracking
    uint64_t m_file_size = 0;
    std::chrono::steady_clock::time_point m_start_time;
    std::chrono::steady_clock::time_point m_last_progress_time;
    
    void update_progress() {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - m_last_progress_time);
        
        if (elapsed.count() < 100 && m_processed_nodes % 10000 != 0 && m_processed_ways % 1000 != 0) {
            return;
        }
        
        m_last_progress_time = now;
        
        auto total_elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - m_start_time);
        int64_t elapsed_sec = total_elapsed.count();
        double nodes_per_sec = elapsed_sec > 0 ? static_cast<double>(m_processed_nodes) / static_cast<double>(elapsed_sec) : 0.0;
        
        int64_t hours_spent = elapsed_sec / 3600;
        int64_t minutes_spent = (elapsed_sec % 3600) / 60;
        int64_t seconds_spent = elapsed_sec % 60;
        
        std::ostringstream time_oss;
        if (hours_spent > 0) {
            time_oss << hours_spent << "h" << minutes_spent << "m" << seconds_spent << "s";
        } else if (minutes_spent > 0) {
            time_oss << minutes_spent << "m" << seconds_spent << "s";
        } else {
            time_oss << seconds_spent << "s";
        }
        
        std::ostringstream progress_oss;
        progress_oss << "Pass 2/2: Nodes " << m_processed_nodes
                     << " | Ways " << m_processed_ways
                     << " | Wrote " << m_written_ways << "w/" << m_written_nodes << "n"
                     << " | " << std::fixed << std::setprecision(0) << nodes_per_sec << " nodes/s"
                     << " | " << time_oss.str();
        
        std::string progress_str = progress_oss.str();
        
        static bool is_tty = isatty(STDOUT_FILENO);
        if (is_tty) {
            winsize ws{};
            size_t cols = 0;
            if (ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws) == 0 && ws.ws_col > 0) {
                cols = static_cast<size_t>(ws.ws_col);
            }
            if (cols > 0 && progress_str.size() >= cols) {
                const size_t keep = (cols > 4) ? (cols - 4) : 0;
                progress_str = progress_str.substr(0, keep) + "...";
            }
            std::cout << "\r\033[2K" << progress_str << std::flush;
        } else {
            std::cout << progress_str << "\n" << std::flush;
        }
    }
    
public:
    Pass2Handler(const ankerl::unordered_dense::set<osmium::object_id_type>& nodes_needed, osmium::io::Writer& writer, uint64_t file_size, bool simplify, bool ignore_routability)
        : m_nodes_needed(nodes_needed)
        , m_writer(writer)
        , m_simplify(simplify)
        , m_ignore_routability(ignore_routability)
        , m_file_size(file_size)
        , m_start_time(std::chrono::steady_clock::now())
        , m_last_progress_time(m_start_time) {
    }
    
    void node(const osmium::Node& node) {
        m_processed_nodes++;
        
        // Write node if it's referenced by a routable way
        // Ensure we use the same type for comparison
        osmium::object_id_type node_id = static_cast<osmium::object_id_type>(node.id());
        if (m_nodes_needed.find(node_id) != m_nodes_needed.end()) {
            // Only write nodes with valid locations (matching Python behavior)
            if (node.location().valid()) {
                // Create minimal node with just ID and location (matching Python implementation)
                osmium::memory::Buffer buffer(1024, osmium::memory::Buffer::auto_grow::yes);
                {
                    osmium::builder::NodeBuilder builder(buffer);
                    builder.set_id(node.id());
                    builder.set_location(node.location());
                    // No tags - minimal node like Python implementation
                }
                osmium::Node& minimal_node = static_cast<osmium::Node&>(buffer.get<osmium::memory::Item>(0));
                m_writer(minimal_node);
                m_written_nodes++;
            }
        }
        
        if (m_processed_nodes % 10000 == 0) {
            update_progress();
        }
    }
    
    void way(const osmium::Way& way) {
        m_processed_ways++;
        
        // Write routable ways (or ferry/highway ways if ignore_routability is set)
        bool should_include = RoutableWays::is_routable_way(way.tags());
        if (m_ignore_routability && !should_include) {
            should_include = is_ferry_or_highway(way.tags());
        }
        if (should_include) {
            if (!m_simplify) {
                m_writer(way);
                m_written_ways++;
                return;
            }

            const auto& nodes = way.nodes();
            if (nodes.size() < 2) {
                return;
            }

            // Rewrite node list to only kept nodes (endpoints always included).
            std::vector<osmium::object_id_type> simplified_refs;
            simplified_refs.reserve(16);

            const osmium::object_id_type first = static_cast<osmium::object_id_type>(nodes.front().ref());
            const osmium::object_id_type last = static_cast<osmium::object_id_type>(nodes.back().ref());

            simplified_refs.push_back(first);
            if (nodes.size() > 2) {
                for (auto it = std::next(nodes.begin()); it != std::prev(nodes.end()); ++it) {
                    const osmium::object_id_type ref = static_cast<osmium::object_id_type>(it->ref());
                    if (m_nodes_needed.find(ref) != m_nodes_needed.end() && ref != simplified_refs.back()) {
                        simplified_refs.push_back(ref);
                    }
                }
            }
            if (last != simplified_refs.back()) {
                simplified_refs.push_back(last);
            }
            if (simplified_refs.size() < 2) {
                return;
            }

            // Compute true polyline length across all original nodes (requires NodeLocationsForWays).
            double total_m = 0.0;
            for (auto it = nodes.begin(); std::next(it) != nodes.end(); ++it) {
                const auto& a = it->location();
                const auto& b = std::next(it)->location();
                if (a.valid() && b.valid()) {
                    total_m += haversine_m(a, b);
                }
            }
            const auto length_m = static_cast<unsigned long long>(std::llround(total_m));

            osmium::memory::Buffer buffer(1024, osmium::memory::Buffer::auto_grow::yes);
            {
                osmium::builder::WayBuilder way_builder(buffer);
                way_builder.set_id(way.id());

                {
                    osmium::builder::WayNodeListBuilder wnl_builder(buffer, &way_builder);
                    for (const auto ref : simplified_refs) {
                        wnl_builder.add_node_ref(ref);
                    }
                }

                {
                    osmium::builder::TagListBuilder tag_builder(buffer, &way_builder);
                    for (const auto& tag : way.tags()) {
                        tag_builder.add_tag(tag.key(), tag.value());
                    }
                    tag_builder.add_tag("length_m", std::to_string(length_m));
                    tag_builder.add_tag("orig_nodes", std::to_string(nodes.size()));
                    tag_builder.add_tag("kept_nodes", std::to_string(simplified_refs.size()));

                    if (const auto speed_kmh = parse_maxspeed_kmh(way.tags())) {
                        if (*speed_kmh > 0.0) {
                            const double duration_s = (static_cast<double>(length_m) / 1000.0) / (*speed_kmh) * 3600.0;
                            const auto dur = static_cast<unsigned long long>(std::llround(duration_s));
                            tag_builder.add_tag("duration_s", std::to_string(dur));
                        }
                    }
                }
            }

            osmium::Way& out_way = static_cast<osmium::Way&>(buffer.get<osmium::memory::Item>(0));
            m_writer(out_way);
            m_written_ways++;
        }
        
        if (m_processed_ways % 1000 == 0) {
            update_progress();
        }
    }
    
    // Getters
    uint64_t processed_nodes() const { return m_processed_nodes; }
    uint64_t processed_ways() const { return m_processed_ways; }
    uint64_t written_ways() const { return m_written_ways; }
    uint64_t written_nodes() const { return m_written_nodes; }
    std::chrono::steady_clock::time_point start_time() const { return m_start_time; }
    
    void finalize_progress() {
        update_progress();
        std::cout << "\n";
        // Report memory usage at end of pass 2
        MemoryStats mem = MemoryStats::get_current();
        std::cout << "Pass 2 memory: RSS=" << mem.format() << ", Peak=" << mem.format_peak() << "\n";
    }
};

void compress_csv(const std::string& input_file, const std::string& output_file) {
    std::ifstream in(input_file, std::ios::binary);
    if (!in) {
        throw std::runtime_error("Failed to open CSV file for compression: " + input_file);
    }
    
    gzFile out = gzopen(output_file.c_str(), "wb");
    if (!out) {
        throw std::runtime_error("Failed to open output file for compression: " + output_file);
    }
    
    char buffer[8192];
    while (in.read(buffer, sizeof(buffer)) || in.gcount() > 0) {
        int written = gzwrite(out, buffer, static_cast<unsigned>(in.gcount()));
        if (written == 0) {
            gzclose(out);
            throw std::runtime_error("Failed to write compressed data");
        }
    }
    
    gzclose(out);
}

std::string get_default_output_name(const std::string& input_file) {
    fs::path input_path(input_file);
    std::string stem = input_path.stem().string();
    
    // Remove .osm if present
    size_t pos = stem.find(".osm");
    if (pos != std::string::npos) {
        stem = stem.substr(0, pos);
    }
    
    return (input_path.parent_path() / (stem + ".ways.osm.pbf")).string();
}

std::string get_default_csv_name(const std::string& input_file) {
    fs::path input_path(input_file);
    std::string stem = input_path.stem().string();
    
    // Remove .osm if present
    size_t pos = stem.find(".osm");
    if (pos != std::string::npos) {
        stem = stem.substr(0, pos);
    }
    
    return (input_path.parent_path() / (stem + ".addresses.csv.gz")).string();
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <input_file> [--output <osm_file>] [--output-dir <dir>] [--simplify] [--ignore-routability]\n";
        return 1;
    }
    
    std::string input_file = argv[1];
    std::string output_file;
    std::string output_dir;
    bool simplify = false;
    bool ignore_routability = false;
    
    // Parse command line arguments
    for (int i = 2; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--output" || arg == "-o") {
            if (i + 1 < argc) {
                output_file = argv[++i];
            } else {
                std::cerr << "Error: --output requires a filename\n";
                return 1;
            }
        } else if (arg == "--output-dir" || arg == "--output_dir" || arg == "-d") {
            if (i + 1 < argc) {
                output_dir = argv[++i];
            } else {
                std::cerr << "Error: --output-dir requires a directory\n";
                return 1;
            }
        } else if (arg == "--simplify") {
            simplify = true;
        } else if (arg == "--ignore-routability") {
            ignore_routability = true;
        }
    }
    
    // Determine output paths
    if (output_file.empty()) {
        output_file = get_default_output_name(input_file);
    }
    
    fs::path input_path(input_file);
    fs::path csv_output_path;
    if (output_dir.empty()) {
        csv_output_path = fs::path(get_default_csv_name(input_file));
    } else {
        fs::path output_dir_path(output_dir);
        fs::create_directories(output_dir_path);
        
        std::string stem = input_path.stem().string();
        size_t pos = stem.find(".osm");
        if (pos != std::string::npos) {
            stem = stem.substr(0, pos);
        }
        csv_output_path = output_dir_path / (stem + ".addresses.csv.gz");
    }
    
    // Get file size
    uint64_t file_size = 0;
    try {
        file_size = fs::file_size(input_file);
    } catch (const fs::filesystem_error& e) {
        std::cerr << "Error: Failed to get file size: " << e.what() << "\n";
        return 1;
    }
    
    std::cout << "Processing routable ways from: " << input_file << "\n";
    std::cout << "Output OSM file: " << output_file << "\n";
    std::cout << "Output addresses CSV: " << csv_output_path.string() << "\n";
    std::cout << "Simplify ways: " << (simplify ? "yes" : "no") << "\n";
    std::cout << "Input file size: " << std::fixed << std::setprecision(1) 
              << (file_size / (1024.0 * 1024.0)) << " MB\n";
    
    // Remove output files if they already exist
    if (fs::exists(output_file)) {
        std::cout << "Output file already exists, removing: " << output_file << "\n";
        fs::remove(output_file);
    }
    if (fs::exists(csv_output_path)) {
        std::cout << "Addresses CSV file already exists, removing: " << csv_output_path.string() << "\n";
        fs::remove(csv_output_path);
    }
    
    // Create temporary CSV file
    fs::path temp_csv = fs::temp_directory_path() / ("addresses_" + std::to_string(std::time(nullptr)) + ".csv");
    
    std::cout << "Processing ways and extracting addresses (two-pass approach)...\n";
    
    // Ensure stdout is unbuffered for proper line overwriting
    std::cout.setf(std::ios::unitbuf);
    
    try {
        // Open CSV file for writing
        std::ofstream csv_file(temp_csv);
        if (!csv_file) {
            throw std::runtime_error("Failed to open temporary CSV file");
        }
        
        // Write CSV header
        csv_file << "id,lat,lon,street,house_number,postcode,city\n";
        
        // ===== PASS 1: Collect node IDs and extract addresses =====
        std::cout << "\nPass 1/2: Collecting node IDs from routable ways and extracting addresses...\n";
        osmium::io::Reader reader1(input_file);
        Pass1Handler pass1_handler(csv_file, file_size, simplify, ignore_routability);
        osmium::apply(reader1, pass1_handler);
        reader1.close();
        pass1_handler.finalize_progress();
        
        if (simplify) {
            std::cout << "Pass 1 complete. Found " << pass1_handler.nodes_needed().size()
                      << " kept endpoint nodes for simplified routable ways.\n";
        } else {
            std::cout << "Pass 1 complete. Found " << pass1_handler.nodes_needed().size()
                      << " nodes needed for routable ways.\n";
        }
        
        // ===== PASS 2: Write nodes and ways =====
        std::cout << "\nPass 2/2: Writing nodes and routable ways...\n";
        osmium::io::Reader reader2(input_file);
        osmium::io::Writer writer(output_file);
        Pass2Handler pass2_handler(pass1_handler.nodes_needed(), writer, file_size, simplify, ignore_routability);
        if (simplify) {
            using index_type = osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location>;
            index_type index;
            osmium::handler::NodeLocationsForWays<index_type> location_handler(index);
            location_handler.ignore_errors();
            osmium::apply(reader2, location_handler, pass2_handler);
        } else {
            osmium::apply(reader2, pass2_handler);
        }
        reader2.close();
        writer.close();
        pass2_handler.finalize_progress();
        
        // Debug: Check if we wrote all expected nodes
        std::cout << "Debug: Expected " << pass1_handler.nodes_needed().size() 
                  << " nodes, wrote " << pass2_handler.written_nodes() << " nodes\n";
        
        csv_file.close();
        
        // Compress CSV file
        std::cout << "\nCompressing addresses CSV...\n";
        compress_csv(temp_csv.string(), csv_output_path.string());
        
        // Remove temporary CSV
        fs::remove(temp_csv);
        
        // Calculate final statistics (total time from pass 1 start)
        auto final_time = std::chrono::steady_clock::now();
        auto total_elapsed = std::chrono::duration_cast<std::chrono::seconds>(final_time - pass1_handler.start_time());
        int64_t total_seconds = total_elapsed.count();
        double nodes_per_sec = total_seconds > 0 ? static_cast<double>(pass1_handler.processed_nodes()) / static_cast<double>(total_seconds) : 0.0;
        
        // Format total time as hh:mm:ss (e.g., 10s, 4m2s, 1h21m3s)
        int64_t hours = total_seconds / 3600;
        int64_t minutes = (total_seconds % 3600) / 60;
        int64_t seconds = total_seconds % 60;
        
        std::ostringstream time_oss;
        if (hours > 0) {
            time_oss << hours << "h" << minutes << "m" << seconds << "s";
        } else if (minutes > 0) {
            time_oss << minutes << "m" << seconds << "s";
        } else {
            time_oss << seconds << "s";
        }
        
        // Print statistics
        std::cout << "\nProcessing complete!\n";
        std::cout << "Processed: " << pass1_handler.processed_nodes() << " nodes, " 
                  << pass1_handler.processed_ways() << " ways\n";
        std::cout << "Written: " << pass2_handler.written_ways() << " ways, " 
                  << pass2_handler.written_nodes() << " nodes\n";
        std::cout << "Found: " << pass1_handler.addresses_found() << " addresses\n";
        std::cout << "Speed: " << std::fixed << std::setprecision(0) << nodes_per_sec << " nodes/s\n";
        std::cout << "Time: " << time_oss.str() << "\n";
        
        // Calculate file sizes
        double input_size_mb = file_size / (1024.0 * 1024.0);
        double output_size_mb = fs::file_size(output_file) / (1024.0 * 1024.0);
        double csv_size_mb = fs::file_size(csv_output_path) / (1024.0 * 1024.0);
        
        std::cout << "\nFile sizes:\n";
        std::cout << "Input:  " << std::fixed << std::setprecision(1) << input_size_mb << " MB\n";
        std::cout << "Output OSM: " << output_size_mb << " MB\n";
        std::cout << "Output CSV: " << csv_size_mb << " MB\n";
        if (input_size_mb > 0) {
            std::cout << "OSM ratio: " << std::setprecision(1) 
                      << (output_size_mb / input_size_mb * 100.0) << "%\n";
        }
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << "\n";
        if (fs::exists(temp_csv)) {
            fs::remove(temp_csv);
        }
        return 1;
    }
    
    return 0;
}

