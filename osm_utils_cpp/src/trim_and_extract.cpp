#include "RoutableWays.h"
#include <osmium/handler.hpp>
#include <osmium/io/pbf_input.hpp>
#include <osmium/io/pbf_output.hpp>
#include <osmium/io/reader.hpp>
#include <osmium/io/writer.hpp>
#include <osmium/index/map/sparse_mem_map.hpp>
#include <osmium/osm/node.hpp>
#include <osmium/osm/way.hpp>
#include <osmium/osm/location.hpp>
#include <osmium/builder/osm_object_builder.hpp>
#include <osmium/memory/buffer.hpp>

#include <iostream>
#include <fstream>
#include <filesystem>
#include <string>
#include <unordered_set>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <zlib.h>
#include <cstring>
#include <algorithm>
#include <ctime>
#include <unistd.h>
#include <sys/ioctl.h>
#include <unistd.h>

namespace fs = std::filesystem;

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

class WayProcessor : public osmium::handler::Handler {
private:
    osmium::io::Writer& m_writer;
    std::ofstream& m_csv_file;
    
    // Node location index (sparse, only stores nodes we need)
    // Uses sparsehash internally for memory efficiency
    osmium::index::map::SparseMemMap<osmium::unsigned_object_id_type, osmium::Location> m_location_handler;
    
    // Tracking
    std::unordered_set<osmium::object_id_type> m_nodes_written;
    uint64_t m_processed_nodes = 0;
    uint64_t m_processed_ways = 0;
    uint64_t m_written_ways = 0;
    uint64_t m_written_nodes = 0;
    uint64_t m_addresses_found = 0;
    
    // Progress tracking
    uint64_t m_file_size = 0;
    uint64_t m_bytes_read = 0;
    std::chrono::steady_clock::time_point m_start_time;
    std::chrono::steady_clock::time_point m_last_progress_time;
    
    // Track when we transition from nodes to ways for better estimation
    uint64_t m_nodes_at_way_start = 0;
    bool m_seen_ways = false;
    
public:
    // Getter for start time (needed for final statistics)
    std::chrono::steady_clock::time_point start_time() const { return m_start_time; }
    
    // File position tracking - we'll update this based on elements processed
    // Since osmium doesn't expose file position directly, we estimate based on
    // typical PBF file structure: nodes (~70% of file) come first, then ways (~30%)
    void update_file_position_estimate() {
        if (m_file_size == 0) return;
        
        if (!m_seen_ways) {
            // Still processing nodes - estimate based on node count
            // In typical OSM files, nodes:ways ratio is roughly 10:1 to 20:1
            // We'll estimate progress through the node section (70% of file)
            // Use a heuristic: assume we're roughly halfway through nodes when we've processed
            // enough nodes. As we process more, gradually increase estimate.
            if (m_processed_nodes < 10000) {
                // Very early: conservative estimate
                m_bytes_read = static_cast<uint64_t>(0.05 * m_file_size);
            } else if (m_processed_nodes < 100000) {
                // Early processing: estimate 10-30% through node section
                double progress_through_nodes = std::min(0.3, static_cast<double>(m_processed_nodes) / 500000.0);
                m_bytes_read = static_cast<uint64_t>(0.7 * m_file_size * progress_through_nodes);
            } else {
                // Later in node processing: use a more dynamic estimate
                // Estimate total nodes based on typical ratios (assume ~15 nodes per way)
                // Since we haven't seen ways yet, estimate we're 60-95% through nodes
                double progress_through_nodes = std::min(0.95, 0.6 + (static_cast<double>(m_processed_nodes - 100000) / 2000000.0));
                m_bytes_read = static_cast<uint64_t>(0.7 * m_file_size * progress_through_nodes);
            }
        } else {
            // Processing ways - we're past the node section
            // Store node count when we first see ways for better estimation
            if (m_nodes_at_way_start == 0) {
                m_nodes_at_way_start = m_processed_nodes;
            }
            
            // Estimate total ways based on node count (typical ratio: 10-20 nodes per way, use 15 as average)
            // This gives us a reasonable estimate of total ways
            double estimated_total_ways = static_cast<double>(m_nodes_at_way_start) / 15.0;
            
            if (estimated_total_ways > 0 && m_processed_ways > 0) {
                // Calculate progress through ways section (30% of file)
                double way_progress = std::min(1.0, static_cast<double>(m_processed_ways) / estimated_total_ways);
                // Nodes section (70%) + ways progress (30%)
                m_bytes_read = static_cast<uint64_t>(0.7 * m_file_size + 0.3 * m_file_size * way_progress);
            } else {
                // Fallback: we're in the ways section, so at least 70% done
                m_bytes_read = static_cast<uint64_t>(0.7 * m_file_size);
            }
        }
        
        // Cap at file size
        m_bytes_read = std::min(m_bytes_read, m_file_size);
    }
    
    void update_progress() {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - m_last_progress_time);
        
        // Update progress every 100ms or every 10k nodes / 1k ways
        if (elapsed.count() < 100 && m_processed_nodes % 10000 != 0 && m_processed_ways % 1000 != 0) {
            return;
        }
        
        m_last_progress_time = now;
        
        auto total_elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - m_start_time);
        int64_t elapsed_sec = total_elapsed.count();
        
        // Calculate nodes per second
        double nodes_per_sec = elapsed_sec > 0 ? static_cast<double>(m_processed_nodes) / static_cast<double>(elapsed_sec) : 0.0;
        
        // Format time spent as hh:mm:ss (e.g., 10s, 4m2s, 1h21m3s)
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
        
        // Build the progress string (no percentage, just element counts and stats)
        std::ostringstream progress_oss;
        progress_oss << "Nodes " << m_processed_nodes
                     << " | Ways " << m_processed_ways
                     << " | Wrote " << m_written_ways << "w/" << m_written_nodes << "n"
                     << " | Addr " << m_addresses_found
                     << " | " << std::fixed << std::setprecision(0) << nodes_per_sec << " nodes/s"
                     << " | " << time_oss.str();
        
        std::string progress_str = progress_oss.str();
        
        // Check if stdout is a TTY before trying to overwrite line
        static bool is_tty = isatty(STDOUT_FILENO);
        
        if (is_tty) {
            // Truncate to terminal width to avoid wrapping (wrapping looks like "printing every line")
            winsize ws{};
            size_t cols = 0;
            if (ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws) == 0 && ws.ws_col > 0) {
                cols = static_cast<size_t>(ws.ws_col);
            }
            if (cols > 0 && progress_str.size() >= cols) {
                const size_t keep = (cols > 4) ? (cols - 4) : 0;
                progress_str = progress_str.substr(0, keep) + "...";
            }

            // Clear entire line then rewrite it.
            std::cout << "\r\033[2K" << progress_str << std::flush;
        } else {
            // Not a TTY, just print new line
            std::cout << progress_str << "\n" << std::flush;
        }
    }
    
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
    WayProcessor(osmium::io::Writer& writer, std::ofstream& csv_file, uint64_t file_size)
        : m_writer(writer)
        , m_csv_file(csv_file)
        , m_file_size(file_size)
        , m_start_time(std::chrono::steady_clock::now())
        , m_last_progress_time(m_start_time) {
    }
    
    void node(const osmium::Node& node) {
        m_processed_nodes++;
        
        // Store node location in sparse index
        if (node.location().valid()) {
            m_location_handler.set(node.id(), node.location());
        }
        
        // Extract addresses if present and location is valid
        if (has_address_tags(node.tags()) && node.location().valid()) {
            Address addr = extract_address_data(node);
            if (addr.lat != 0.0 || addr.lon != 0.0) {  // Valid coordinates
                write_address_csv(addr);
                m_addresses_found++;
            }
        }
        
        // Update progress periodically
        if (m_processed_nodes % 10000 == 0) {
            update_file_position_estimate();
            update_progress();
        }
    }
    
    void way(const osmium::Way& way) {
        m_processed_ways++;
        
        // Mark that we've seen ways (transition from node to way processing)
        if (!m_seen_ways) {
            m_seen_ways = true;
        }
        
        // Extract tags and check if routable
        if (!RoutableWays::is_routable_way(way.tags())) {
            // Update progress estimate
            if (m_processed_ways % 1000 == 0) {
                update_file_position_estimate();
                update_progress();
            }
            return;
        }
        
        // Get node references
        if (way.nodes().size() < 2) {
            return;  // Need at least 2 nodes for a valid way
        }
        
        // Write nodes that haven't been written yet
        // Note: OSM files are structured with nodes first, then ways, so all node
        // locations have already been stored in the index by the time we process ways.
        for (const auto& node_ref : way.nodes()) {
            if (m_nodes_written.find(node_ref.ref()) == m_nodes_written.end()) {
                try {
                    osmium::Location location = m_location_handler.get(node_ref.ref());
                    if (location.valid()) {
                        // Create node object and write it
                        osmium::memory::Buffer buffer(1024, osmium::memory::Buffer::auto_grow::yes);
                        {
                            osmium::builder::NodeBuilder builder(buffer);
                            builder.set_id(node_ref.ref());
                            builder.set_location(location);
                        }
                        osmium::Node& node = static_cast<osmium::Node&>(buffer.get<osmium::memory::Item>(0));
                        m_writer(node);
                        m_nodes_written.insert(node_ref.ref());
                        m_written_nodes++;
                    }
                } catch (...) {
                    // Node location not found in index
                }
            }
        }
        
        // Write the way
        m_writer(way);
        m_written_ways++;
        
        // Update progress
        if (m_processed_ways % 1000 == 0) {
            update_file_position_estimate();
            update_progress();
        }
    }
    
    // Getters for statistics
    uint64_t processed_nodes() const { return m_processed_nodes; }
    uint64_t processed_ways() const { return m_processed_ways; }
    uint64_t written_ways() const { return m_written_ways; }
    uint64_t written_nodes() const { return m_written_nodes; }
    uint64_t addresses_found() const { return m_addresses_found; }
    
    void finalize_progress() {
        // Set to 100% when done
        m_bytes_read = m_file_size;
        update_progress();
        std::cout << "\n";  // New line after progress
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
        std::cerr << "Usage: " << argv[0] << " <input_file> [--output <osm_file>] [--output-dir <dir>]\n";
        return 1;
    }
    
    std::string input_file = argv[1];
    std::string output_file;
    std::string output_dir;
    
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
    
    std::cout << "Processing ways and extracting addresses...\n";
    
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
        
        // Open OSM files
        osmium::io::Reader reader(input_file);
        osmium::io::Writer writer(output_file);
        
        // Create processor
        WayProcessor processor(writer, csv_file, file_size);
        
        // Process file
        osmium::apply(reader, processor);
        
        // Finalize progress (set to 100%)
        processor.finalize_progress();
        
        // Close files
        reader.close();
        writer.close();
        csv_file.close();
        
        // Print final progress
        std::cout << "\n";
        
        // Compress CSV file
        std::cout << "\nCompressing addresses CSV...\n";
        compress_csv(temp_csv.string(), csv_output_path.string());
        
        // Remove temporary CSV
        fs::remove(temp_csv);
        
        // Calculate final statistics
        auto final_time = std::chrono::steady_clock::now();
        auto total_elapsed = std::chrono::duration_cast<std::chrono::seconds>(final_time - processor.start_time());
        int64_t total_seconds = total_elapsed.count();
        double nodes_per_sec = total_seconds > 0 ? static_cast<double>(processor.processed_nodes()) / static_cast<double>(total_seconds) : 0.0;
        
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
        std::cout << "Processed: " << processor.processed_nodes() << " nodes, " 
                  << processor.processed_ways() << " ways\n";
        std::cout << "Written: " << processor.written_ways() << " ways, " 
                  << processor.written_nodes() << " nodes\n";
        std::cout << "Found: " << processor.addresses_found() << " addresses\n";
        std::cout << "Speed: " << std::fixed << std::setprecision(0) << nodes_per_sec << " nodes/s\n";
        std::cout << "Time: " << time_oss.str() << "\n";
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

