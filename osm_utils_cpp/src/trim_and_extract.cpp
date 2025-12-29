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
    
    // File position tracking - we'll update this based on elements processed
    // Since osmium doesn't expose file position directly, we estimate based on
    // typical PBF file structure: nodes (~70% of file) come first, then ways (~30%)
    void update_file_position_estimate() {
        if (m_file_size == 0) return;
        
        // Estimate based on elements processed
        // In typical OSM files, nodes take up most of the space
        // We process nodes first, then ways
        if (m_processed_ways == 0) {
            // Still processing nodes - estimate based on node count
            // Assume nodes are ~70% of file, estimate progress within that section
            double estimated_total_nodes = m_processed_nodes * 1.5; // Rough estimate
            if (estimated_total_nodes > 0) {
                double node_progress = std::min(1.0, static_cast<double>(m_processed_nodes) / estimated_total_nodes);
                m_bytes_read = static_cast<uint64_t>(0.7 * m_file_size * node_progress);
            }
        } else {
            // Processing ways - we're past the node section
            // Estimate: nodes section (70%) + ways progress (30%)
            double estimated_total_ways = m_processed_ways * 2.0; // Rough estimate
            if (estimated_total_ways > 0) {
                double way_progress = std::min(1.0, static_cast<double>(m_processed_ways) / estimated_total_ways);
                m_bytes_read = static_cast<uint64_t>(0.7 * m_file_size + 0.3 * m_file_size * way_progress);
            } else {
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
        
        double percent = m_file_size > 0 ? (100.0 * m_bytes_read) / m_file_size : 0.0;
        double mb_read = m_bytes_read / (1024.0 * 1024.0);
        double mb_total = m_file_size / (1024.0 * 1024.0);
        
        auto total_elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - m_start_time);
        double mb_per_sec = total_elapsed.count() > 0 ? mb_read / (total_elapsed.count() / 1000.0) : 0.0;
        
        std::cout << "\rProcessing: " << std::fixed << std::setprecision(1) << percent << "% "
                  << "(" << std::setprecision(1) << mb_read << " MB / " << mb_total << " MB) | "
                  << "Nodes: " << std::setprecision(0) << m_processed_nodes << " | "
                  << "Ways: " << m_processed_ways << " | "
                  << "Written: " << m_written_ways << " ways, " << m_written_nodes << " nodes | "
                  << "Addresses: " << m_addresses_found << " | "
                  << "Speed: " << std::setprecision(1) << mb_per_sec << " MB/s" << std::flush;
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
    
    std::cout << "\nProcessing ways and extracting addresses...\n";
    
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
        
        // Print statistics
        std::cout << "\nProcessing complete!\n";
        std::cout << "Processed: " << processor.processed_nodes() << " nodes, " 
                  << processor.processed_ways() << " ways\n";
        std::cout << "Written: " << processor.written_ways() << " ways, " 
                  << processor.written_nodes() << " nodes\n";
        std::cout << "Found: " << processor.addresses_found() << " addresses\n";
        
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

