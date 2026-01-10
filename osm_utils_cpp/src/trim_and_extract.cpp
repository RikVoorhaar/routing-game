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
#include <osmium/osm/relation.hpp>
#include <osmium/osm/location.hpp>
#include <osmium/builder/osm_object_builder.hpp>
#include <osmium/memory/buffer.hpp>

#include <ankerl/unordered_dense.h>
#include <nlohmann/json.hpp>
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
#include <memory>
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

// Address/Building data structure
struct Address {
    std::string id;
    bool is_building;
    bool is_addr;
    bool is_relation;
    bool is_node;
    bool is_way;
    double lat;
    double lon;
    std::string city;
    std::string tags_json;
};

// Helper functions for address/building extraction (shared between handlers)
bool has_address_tags(const osmium::TagList& tags) {
    for (const auto& tag : tags) {
        if (std::strncmp(tag.key(), "addr:", 5) == 0) {
            return true;
        }
    }
    return false;
}

bool has_building_tag(const osmium::TagList& tags) {
    return tags.get_value_by_key("building") != nullptr;
}

bool has_address_or_building_tags(const osmium::TagList& tags) {
    return has_address_tags(tags) || has_building_tag(tags);
}

// Serialize tags to JSON object using nlohmann/json
std::string tags_to_json(const osmium::TagList& tags) {
    nlohmann::json j;
    for (const auto& tag : tags) {
        j[tag.key()] = tag.value();
    }
    return j.dump();
}

// Escape CSV field - double quotes inside quoted fields
std::string csv_escape(const std::string& str) {
    std::string result;
    result.reserve(str.size() + 10); // Reserve some extra space
    for (char c : str) {
        if (c == '"') {
            result += "\"\""; // Double the quote
        } else {
            result += c;
        }
    }
    return result;
}

// Compute centroid from a list of locations
osmium::Location compute_centroid(const std::vector<osmium::Location>& locations) {
    if (locations.empty()) {
        return osmium::Location();
    }
    
    double sum_lat = 0.0;
    double sum_lon = 0.0;
    size_t valid_count = 0;
    
    for (const auto& loc : locations) {
        if (loc.valid()) {
            sum_lat += loc.lat();
            sum_lon += loc.lon();
            valid_count++;
        }
    }
    
    if (valid_count == 0) {
        return osmium::Location();
    }
    
    // osmium::Location constructor takes (lon, lat), not (lat, lon)
    return osmium::Location(sum_lon / valid_count, sum_lat / valid_count);
}

// Extract address/building data from a node
Address extract_address_data(const osmium::Node& node) {
    Address addr;
    addr.id = std::to_string(node.id());
    addr.is_addr = has_address_tags(node.tags());
    addr.is_building = has_building_tag(node.tags());
    addr.is_relation = false;
    addr.is_node = true;
    addr.is_way = false;
    addr.lat = node.location().lat();
    addr.lon = node.location().lon();
    addr.city = "";
    
    const char* city_value = node.tags().get_value_by_key("addr:city");
    if (city_value) {
        addr.city = city_value;
    }
    
    addr.tags_json = tags_to_json(node.tags());
    
    return addr;
}

// Extract address/building data from a way (requires node locations)
Address extract_address_data_from_way(const osmium::Way& way, 
                                       const std::vector<osmium::Location>& node_locations) {
    Address addr;
    addr.id = std::to_string(way.id());
    addr.is_addr = has_address_tags(way.tags());
    addr.is_building = has_building_tag(way.tags());
    addr.is_relation = false;
    addr.is_node = false;
    addr.is_way = true;
    addr.city = "";
    
    const char* city_value = way.tags().get_value_by_key("addr:city");
    if (city_value) {
        addr.city = city_value;
    }
    
    // Compute centroid from node locations
    osmium::Location centroid = compute_centroid(node_locations);
    if (centroid.valid()) {
        addr.lat = centroid.lat();
        addr.lon = centroid.lon();
    } else {
        addr.lat = 0.0;
        addr.lon = 0.0;
    }
    
    addr.tags_json = tags_to_json(way.tags());
    
    return addr;
}

// Extract address/building data from a relation (requires node locations from outer ring)
Address extract_address_data_from_relation(const osmium::Relation& relation,
                                           const std::vector<osmium::Location>& outer_ring_locations) {
    Address addr;
    addr.id = std::to_string(relation.id());
    addr.is_addr = has_address_tags(relation.tags());
    addr.is_building = has_building_tag(relation.tags());
    addr.is_relation = true;
    addr.is_node = false;
    addr.is_way = false;
    addr.city = "";
    
    const char* city_value = relation.tags().get_value_by_key("addr:city");
    if (city_value) {
        addr.city = city_value;
    }
    
    // Compute centroid from outer ring locations
    osmium::Location centroid = compute_centroid(outer_ring_locations);
    if (centroid.valid()) {
        addr.lat = centroid.lat();
        addr.lon = centroid.lon();
    } else {
        addr.lat = 0.0;
        addr.lon = 0.0;
    }
    
    addr.tags_json = tags_to_json(relation.tags());
    
    return addr;
}

// Shared helper function to write address CSV
void write_address_csv(std::ofstream* csv_file, const Address& addr) {
    if (csv_file && csv_file->is_open()) {
        *csv_file << addr.id << ","
                  << (addr.is_building ? "1" : "0") << ","
                  << (addr.is_addr ? "1" : "0") << ","
                  << (addr.is_relation ? "1" : "0") << ","
                  << (addr.is_node ? "1" : "0") << ","
                  << (addr.is_way ? "1" : "0") << ","
                  << std::fixed << std::setprecision(7) << addr.lat << ","
                  << addr.lon << ","
                  << "\"" << csv_escape(addr.city) << "\","
                  << "\"" << csv_escape(addr.tags_json) << "\"\n";
    }
}

// Pass 1: Collect node IDs from routable ways and extract addresses/buildings
class Pass1Handler : public osmium::handler::Handler {
private:
    std::ofstream* m_csv_file;
    ankerl::unordered_dense::set<osmium::object_id_type> m_nodes_needed;
    ankerl::unordered_dense::set<osmium::object_id_type> m_relation_way_ids;
    bool m_routable_only = false;
    bool m_extract_addresses = true;
    
    uint64_t m_processed_nodes = 0;
    uint64_t m_processed_ways = 0;
    uint64_t m_processed_relations = 0;
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
                     << " | Needed " << m_nodes_needed.size() << " nodes"
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
    
public:
    Pass1Handler(std::ofstream* csv_file, uint64_t file_size, bool routable_only, bool extract_addresses = true)
        : m_csv_file(csv_file)
        , m_routable_only(routable_only)
        , m_extract_addresses(extract_addresses)
        , m_file_size(file_size)
        , m_start_time(std::chrono::steady_clock::now())
        , m_last_progress_time(m_start_time) {
    }
    
    void node(const osmium::Node& node) {
        m_processed_nodes++;
        
        // Extract addresses/buildings if present and location is valid
        if (m_extract_addresses && has_address_or_building_tags(node.tags()) && node.location().valid()) {
            Address addr = extract_address_data(node);
            if (addr.lat != 0.0 || addr.lon != 0.0) {
                write_address_csv(m_csv_file, addr);
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
        
        // Collect node IDs: by default include routable ways + ferry/highway, or only routable if flag is set
        bool should_include = RoutableWays::is_routable_way(way.tags());
        if (!m_routable_only && !should_include) {
            should_include = is_ferry_or_highway(way.tags());
        }
        if (should_include) {
            for (const auto& node_ref : way.nodes()) {
                m_nodes_needed.insert(static_cast<osmium::object_id_type>(node_ref.ref()));
            }
        }
        
        if (m_processed_ways % 1000 == 0) {
            update_progress();
        }
    }
    
    void relation(const osmium::Relation& relation) {
        m_processed_relations++;
        
        // Collect way IDs from relations with address/building tags for Pass2 processing
        if (m_extract_addresses && has_address_or_building_tags(relation.tags())) {
            for (const auto& member : relation.members()) {
                if (member.type() == osmium::item_type::way && 
                    std::strcmp(member.role(), "outer") == 0) {
                    m_relation_way_ids.insert(static_cast<osmium::object_id_type>(member.ref()));
                }
            }
        }
        
        if (m_processed_relations % 1000 == 0) {
            update_progress();
        }
    }
    
    // Getters
    const ankerl::unordered_dense::set<osmium::object_id_type>& nodes_needed() const { return m_nodes_needed; }
    const ankerl::unordered_dense::set<osmium::object_id_type>& relation_way_ids() const { return m_relation_way_ids; }
    uint64_t processed_nodes() const { return m_processed_nodes; }
    uint64_t processed_ways() const { return m_processed_ways; }
    uint64_t processed_relations() const { return m_processed_relations; }
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

// Pass 2: Write nodes (if in set) and routable ways, extract addresses from ways/relations
class Pass2Handler : public osmium::handler::Handler {
private:
    const ankerl::unordered_dense::set<osmium::object_id_type>& m_nodes_needed;
    const ankerl::unordered_dense::set<osmium::object_id_type>& m_relation_way_ids;
    osmium::io::Writer* m_writer;
    std::ofstream* m_csv_file;
    bool m_routable_only = false;
    bool m_extract_addresses = false;
    
    uint64_t m_processed_nodes = 0;
    uint64_t m_processed_ways = 0;
    uint64_t m_processed_relations = 0;
    uint64_t m_written_ways = 0;
    uint64_t m_written_nodes = 0;
    uint64_t m_addresses_found = 0;
    
    // Disk-based storage for way centroids and node counts (only for relation ways)
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location> m_way_centroids;
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, uint32_t> m_way_node_counts;
    
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
                     << " | Wrote " << m_written_ways << "w/" << m_written_nodes << "n";
        if (m_extract_addresses) {
            progress_oss << " | Addr " << m_addresses_found;
        }
        progress_oss << " | " << std::fixed << std::setprecision(0) << nodes_per_sec << " nodes/s"
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
    Pass2Handler(const ankerl::unordered_dense::set<osmium::object_id_type>& nodes_needed,
                 const ankerl::unordered_dense::set<osmium::object_id_type>& relation_way_ids,
                 osmium::io::Writer* writer,
                 std::ofstream* csv_file,
                 uint64_t file_size,
                 bool routable_only,
                 bool extract_addresses)
        : m_nodes_needed(nodes_needed)
        , m_relation_way_ids(relation_way_ids)
        , m_writer(writer)
        , m_csv_file(csv_file)
        , m_routable_only(routable_only)
        , m_extract_addresses(extract_addresses)
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
                if (m_writer) {
                    (*m_writer)(minimal_node);
                }
                m_written_nodes++;
            }
        }
        
        if (m_processed_nodes % 10000 == 0) {
            update_progress();
        }
    }
    
    void way(const osmium::Way& way) {
        m_processed_ways++;
        
        // Extract addresses/buildings from ways
        if (m_extract_addresses && has_address_or_building_tags(way.tags())) {
            // Collect node locations for centroid computation
            std::vector<osmium::Location> node_locations;
            for (const auto& node_ref : way.nodes()) {
                if (node_ref.location().valid()) {
                    node_locations.push_back(node_ref.location());
                }
            }
            
            if (!node_locations.empty()) {
                Address addr = extract_address_data_from_way(way, node_locations);
                if (addr.lat != 0.0 || addr.lon != 0.0) {
                    write_address_csv(m_csv_file, addr);
                    m_addresses_found++;
                }
            }
        }
        
        // Store way centroid + node count if this way is referenced by a relation
        osmium::object_id_type way_id = static_cast<osmium::object_id_type>(way.id());
        if (m_extract_addresses && m_relation_way_ids.find(way_id) != m_relation_way_ids.end()) {
            std::vector<osmium::Location> node_locations;
            for (const auto& node_ref : way.nodes()) {
                if (node_ref.location().valid()) {
                    node_locations.push_back(node_ref.location());
                }
            }
            
            if (!node_locations.empty()) {
                osmium::Location centroid = compute_centroid(node_locations);
                if (centroid.valid()) {
                    m_way_centroids.set(static_cast<osmium::unsigned_object_id_type>(way.id()), centroid);
                    m_way_node_counts.set(static_cast<osmium::unsigned_object_id_type>(way.id()), static_cast<uint32_t>(node_locations.size()));
                }
            }
        }
        
        // Write ways: by default include routable ways + ferry/highway, or only routable if flag is set
        bool should_include = RoutableWays::is_routable_way(way.tags());
        if (!m_routable_only && !should_include) {
            should_include = is_ferry_or_highway(way.tags());
        }
        if (should_include && m_writer) {
            (*m_writer)(way);
            m_written_ways++;
        }
        
        if (m_processed_ways % 1000 == 0) {
            update_progress();
        }
    }
    
    void relation(const osmium::Relation& relation) {
        m_processed_relations++;
        
        // Extract addresses/buildings from relations
        if (m_extract_addresses && has_address_or_building_tags(relation.tags())) {
            // Collect way centroids and node counts for outer ring ways
            std::vector<osmium::Location> way_centroids;
            std::vector<uint32_t> way_node_counts;
            
            for (const auto& member : relation.members()) {
                if (member.type() == osmium::item_type::way && 
                    std::strcmp(member.role(), "outer") == 0) {
                    osmium::unsigned_object_id_type way_id = static_cast<osmium::unsigned_object_id_type>(member.ref());
                    
                    try {
                        osmium::Location centroid = m_way_centroids.get(way_id);
                        uint32_t node_count = m_way_node_counts.get(way_id);
                        
                        if (centroid.valid() && node_count > 0) {
                            way_centroids.push_back(centroid);
                            way_node_counts.push_back(node_count);
                        }
                    } catch (...) {
                        // Way centroid not found, skip this way
                    }
                }
            }
            
            if (!way_centroids.empty()) {
                // Compute weighted centroid: sum(centroid * node_count) / sum(node_count)
                double sum_lat = 0.0;
                double sum_lon = 0.0;
                uint64_t total_nodes = 0;
                
                for (size_t i = 0; i < way_centroids.size(); ++i) {
                    if (way_centroids[i].valid()) {
                        sum_lat += way_centroids[i].lat() * way_node_counts[i];
                        sum_lon += way_centroids[i].lon() * way_node_counts[i];
                        total_nodes += way_node_counts[i];
                    }
                }
                
                if (total_nodes > 0) {
                    // osmium::Location constructor takes (lon, lat), not (lat, lon)
                    osmium::Location weighted_centroid(sum_lon / total_nodes, sum_lat / total_nodes);
                    std::vector<osmium::Location> outer_ring_locations;
                    outer_ring_locations.push_back(weighted_centroid);
                    
                    Address addr = extract_address_data_from_relation(relation, outer_ring_locations);
                    if (addr.lat != 0.0 || addr.lon != 0.0) {
                        write_address_csv(m_csv_file, addr);
                        m_addresses_found++;
                    }
                }
            }
        }
        
        if (m_processed_relations % 1000 == 0) {
            update_progress();
        }
    }
    
    // Getters
    uint64_t processed_nodes() const { return m_processed_nodes; }
    uint64_t processed_ways() const { return m_processed_ways; }
    uint64_t processed_relations() const { return m_processed_relations; }
    uint64_t written_ways() const { return m_written_ways; }
    uint64_t written_nodes() const { return m_written_nodes; }
    uint64_t addresses_found() const { return m_addresses_found; }
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
        std::cerr << "Usage: " << argv[0] << " <input_file> [--output <osm_file>] [--output-dir <dir>] [--routable-only] [--addresses-only] [--osm-only]\n";
        return 1;
    }
    
    std::string input_file = argv[1];
    std::string output_file;
    std::string output_dir;
    bool routable_only = false;
    bool addresses_only = false;
    bool osm_only = false;
    
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
        } else if (arg == "--routable-only") {
            routable_only = true;
        } else if (arg == "--addresses-only") {
            addresses_only = true;
        } else if (arg == "--osm-only") {
            osm_only = true;
        }
    }
    
    // Validate mutually exclusive options
    if (addresses_only && osm_only) {
        std::cerr << "Error: --addresses-only and --osm-only are mutually exclusive\n";
        return 1;
    }
    
    bool extract_osm = !addresses_only;
    bool extract_addresses = !osm_only;
    
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
    if (extract_osm) {
        std::cout << "Output OSM file: " << output_file << "\n";
    }
    if (extract_addresses) {
        std::cout << "Output addresses CSV: " << csv_output_path.string() << "\n";
    }
    std::cout << "Input file size: " << std::fixed << std::setprecision(1) 
              << (file_size / (1024.0 * 1024.0)) << " MB\n";
    
    // Remove output files if they already exist
    if (extract_osm && fs::exists(output_file)) {
        std::cout << "Output file already exists, removing: " << output_file << "\n";
        fs::remove(output_file);
    }
    if (extract_addresses && fs::exists(csv_output_path)) {
        std::cout << "Addresses CSV file already exists, removing: " << csv_output_path.string() << "\n";
        fs::remove(csv_output_path);
    }
    
    // Create temporary CSV file (only if extracting addresses)
    fs::path temp_csv;
    std::ofstream csv_file;
    if (extract_addresses) {
        temp_csv = fs::temp_directory_path() / ("addresses_" + std::to_string(std::time(nullptr)) + ".csv");
        csv_file.open(temp_csv);
        if (!csv_file) {
            std::cerr << "Error: Failed to open temporary CSV file\n";
            return 1;
        }
        
        // Write CSV header
        csv_file << "id,is_building,is_addr,is_relation,is_node,is_way,lat,lon,city,tags\n";
    }
    
    std::cout << "Processing ways and extracting addresses/buildings (two-pass approach)...\n";
    
    // Ensure stdout is unbuffered for proper line overwriting
    std::cout.setf(std::ios::unitbuf);
    
    try {
        // ===== PASS 1: Collect node IDs and extract addresses/buildings =====
        std::string pass1_desc = extract_osm ? "\nPass 1/2: Collecting node IDs from routable ways and extracting addresses/buildings...\n" 
                                             : "\nPass 1/1: Extracting addresses/buildings...\n";
        std::cout << pass1_desc;
        osmium::io::Reader reader1(input_file);
        Pass1Handler pass1_handler(extract_addresses ? &csv_file : nullptr, file_size, routable_only, extract_addresses);
        osmium::apply(reader1, pass1_handler);
        reader1.close();
        pass1_handler.finalize_progress();
        
        if (extract_osm) {
            std::cout << "Pass 1 complete. Found " << pass1_handler.nodes_needed().size()
                      << " nodes needed for routable ways.\n";
        }
        
        if (extract_addresses) {
            std::cout << "Pass 1 complete. Found " << pass1_handler.addresses_found()
                      << " addresses/buildings.\n";
        }
        
        // ===== PASS 2: Write nodes and ways, extract addresses from ways/relations =====
        Pass2Handler* pass2_handler = nullptr;
        if (extract_osm || extract_addresses) {
            std::cout << "\nPass 2/2: Writing nodes and routable ways";
            if (extract_addresses) {
                std::cout << " and extracting addresses from ways/relations";
            }
            std::cout << "...\n";
            osmium::io::Reader reader2(input_file);
            osmium::io::Writer* writer = nullptr;
            std::unique_ptr<osmium::io::Writer> writer_ptr;
            if (extract_osm) {
                writer_ptr = std::make_unique<osmium::io::Writer>(output_file);
                writer = writer_ptr.get();
            }
            Pass2Handler handler(pass1_handler.nodes_needed(), 
                                pass1_handler.relation_way_ids(),
                                writer,
                                extract_addresses ? &csv_file : nullptr,
                                file_size,
                                routable_only,
                                extract_addresses);
            pass2_handler = &handler;
            
            // Always use NodeLocationsForWays when extracting addresses (needed for way centroids)
            if (extract_addresses) {
                using index_type = osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location>;
                index_type index;
                osmium::handler::NodeLocationsForWays<index_type> location_handler(index);
                location_handler.ignore_errors();
                osmium::apply(reader2, location_handler, handler);
            } else {
                osmium::apply(reader2, handler);
            }
            reader2.close();
            if (writer_ptr) {
                writer_ptr->close();
            }
            handler.finalize_progress();
            
            if (extract_osm) {
                // Debug: Check if we wrote all expected nodes
                std::cout << "Debug: Expected " << pass1_handler.nodes_needed().size() 
                          << " nodes, wrote " << handler.written_nodes() << " nodes\n";
            }
        }
        
        if (extract_addresses) {
            csv_file.close();
            
            // Compress CSV file
            std::cout << "\nCompressing addresses CSV...\n";
            compress_csv(temp_csv.string(), csv_output_path.string());
            
            // Remove temporary CSV
            fs::remove(temp_csv);
        }
        
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
                  << pass1_handler.processed_ways() << " ways";
        if (pass1_handler.processed_relations() > 0) {
            std::cout << ", " << pass1_handler.processed_relations() << " relations";
        }
        std::cout << "\n";
        
        if (extract_osm && pass2_handler) {
            std::cout << "Written: " << pass2_handler->written_ways() << " ways, " 
                      << pass2_handler->written_nodes() << " nodes\n";
        }
        
        if (extract_addresses) {
            uint64_t total_addresses = pass1_handler.addresses_found();
            if (pass2_handler) {
                total_addresses += pass2_handler->addresses_found();
            }
            std::cout << "Found: " << total_addresses << " addresses/buildings";
            if (pass2_handler && pass2_handler->addresses_found() > 0) {
                std::cout << " (Pass1: " << pass1_handler.addresses_found() 
                          << ", Pass2: " << pass2_handler->addresses_found() << ")";
            }
            std::cout << "\n";
        }
        
        std::cout << "Speed: " << std::fixed << std::setprecision(0) << nodes_per_sec << " nodes/s\n";
        std::cout << "Time: " << time_oss.str() << "\n";
        
        // Calculate file sizes
        double input_size_mb = file_size / (1024.0 * 1024.0);
        
        std::cout << "\nFile sizes:\n";
        std::cout << "Input:  " << std::fixed << std::setprecision(1) << input_size_mb << " MB\n";
        
        if (extract_osm && fs::exists(output_file)) {
            double output_size_mb = fs::file_size(output_file) / (1024.0 * 1024.0);
            std::cout << "Output OSM: " << output_size_mb << " MB\n";
            if (input_size_mb > 0) {
                std::cout << "OSM ratio: " << std::setprecision(1) 
                          << (output_size_mb / input_size_mb * 100.0) << "%\n";
            }
        }
        
        if (extract_addresses && fs::exists(csv_output_path)) {
            double csv_size_mb = fs::file_size(csv_output_path) / (1024.0 * 1024.0);
            std::cout << "Output CSV: " << csv_size_mb << " MB\n";
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

