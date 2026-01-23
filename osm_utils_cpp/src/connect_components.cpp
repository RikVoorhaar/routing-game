#include "RoutingProfile.h"
#include "DiskSpatialIndex.h"
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
#include <osmium/builder/attr.hpp>
#include <osmium/memory/buffer.hpp>

#include <ankerl/unordered_dense.h>
#include <iostream>
#include <fstream>
#include <filesystem>
#include <string>
#include <vector>
#include <queue>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <algorithm>
#include <cmath>
#include <unistd.h>
#include <sys/ioctl.h>
#include <limits>
#include <sstream>
#include <cstdint>

namespace fs = std::filesystem;

// Memory reporting helper (Linux-specific, reused from trim_and_extract.cpp)
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

// Haversine distance calculation (reused from trim_and_extract.cpp)
static double haversine_m(const osmium::Location& a, const osmium::Location& b) {
    if (!a.valid() || !b.valid()) {
        return std::numeric_limits<double>::max();
    }
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

// Progress reporting helper
struct ProgressReporter {
    std::chrono::steady_clock::time_point start_time;
    std::chrono::steady_clock::time_point last_progress_time;
    
    ProgressReporter() : start_time(std::chrono::steady_clock::now()), 
                         last_progress_time(start_time) {}
    
    void update(const std::string& message, uint64_t count = 0) {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - last_progress_time);
        
        // Throttle to at most once every 10 seconds
        if (elapsed.count() < 10000) {
            return;
        }
        
        last_progress_time = now;
        auto total_elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time);
        int64_t elapsed_sec = total_elapsed.count();
        
        // Get memory stats
        MemoryStats mem = MemoryStats::get_current();
        
        std::ostringstream oss;
        oss << message;
        if (count > 0) {
            oss << " (" << count << ")";
        }
        oss << " | " << elapsed_sec << "s";
        oss << " | RSS=" << mem.format() << " Peak=" << mem.format_peak();
        
        std::string progress_str = oss.str();
        
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
    
    void finalize() {
        std::cout << "\n";
    }
};

// Union-Find (Disjoint Set Union) for connected components
class UnionFind {
private:
    ankerl::unordered_dense::map<osmium::object_id_type, osmium::object_id_type> parent_;
    ankerl::unordered_dense::map<osmium::object_id_type, size_t> rank_;
    
public:
    osmium::object_id_type find(osmium::object_id_type x) const {
        auto it = parent_.find(x);
        if (it == parent_.end()) {
            // Not found - this shouldn't happen in const context, but handle it
            return x;
        }
        
        if (it->second != x) {
            // Path compression - but we can't modify in const, so just return parent
            return find(it->second);
        }
        return it->second;
    }
    
    // Non-const version for building the structure
    osmium::object_id_type find_mutable(osmium::object_id_type x) {
        if (parent_.find(x) == parent_.end()) {
            parent_[x] = x;
            rank_[x] = 0;
            return x;
        }
        
        if (parent_[x] != x) {
            parent_[x] = find_mutable(parent_[x]); // Path compression
        }
        return parent_[x];
    }
    
    void unite(osmium::object_id_type x, osmium::object_id_type y) {
        osmium::object_id_type root_x = find_mutable(x);
        osmium::object_id_type root_y = find_mutable(y);
        
        if (root_x == root_y) return;
        
        // Union by rank
        if (rank_[root_x] < rank_[root_y]) {
            parent_[root_x] = root_y;
        } else if (rank_[root_x] > rank_[root_y]) {
            parent_[root_y] = root_x;
        } else {
            parent_[root_y] = root_x;
            rank_[root_x]++;
        }
    }
    
    const ankerl::unordered_dense::map<osmium::object_id_type, osmium::object_id_type>& get_parents() const {
        return parent_;
    }
};

// Pass 1: Extract routable graph using disk-based storage
class RoutableGraphExtractor : public osmium::handler::Handler {
private:
    // Disk-based node storage
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location> node_index_;
    
    // Way storage: just track IDs
    ankerl::unordered_dense::set<osmium::object_id_type> routable_way_ids_;
    
    // Union-Find for connected components (memory-efficient)
    UnionFind union_find_;
    
    // Track which nodes are in routable ways
    ankerl::unordered_dense::set<osmium::object_id_type> routable_node_ids_;
    
    uint64_t processed_nodes_ = 0;
    uint64_t processed_ways_ = 0;
    uint64_t routable_ways_ = 0;
    ProgressReporter progress_;
    
public:
    void node(const osmium::Node& node) {
        processed_nodes_++;
        // Store all nodes in disk index (will be filtered during way processing)
        if (node.location().valid()) {
            node_index_.set(static_cast<osmium::unsigned_object_id_type>(node.id()), node.location());
        }
        
        // Update progress (throttled to every 10s, includes memory)
        if (processed_nodes_ % 100000 == 0) {
            progress_.update("Processing nodes", processed_nodes_);
        }
    }
    
    void way(const osmium::Way& way) {
        processed_ways_++;
        
        // Check if routable using RoutingKit profile
        if (!RoutingProfile::is_routable_for_routingkit(way.tags())) {
            if (processed_ways_ % 100000 == 0) {
                progress_.update("Processing ways", processed_ways_);
            }
            return;
        }
        
        routable_ways_++;
        
        // Extract node list
        std::vector<osmium::object_id_type> node_list;
        for (const auto& node_ref : way.nodes()) {
            osmium::object_id_type node_id = static_cast<osmium::object_id_type>(node_ref.ref());
            node_list.push_back(node_id);
            routable_node_ids_.insert(node_id);
        }
        
        if (node_list.size() < 2) {
            if (processed_ways_ % 100000 == 0) {
                progress_.update("Processing ways", processed_ways_);
            }
            return;
        }
        
        // Store way ID
        osmium::object_id_type way_id = static_cast<osmium::object_id_type>(way.id());
        routable_way_ids_.insert(way_id);
        
        // Connect nodes using Union-Find (for connected components)
        for (size_t i = 0; i < node_list.size() - 1; ++i) {
            union_find_.unite(node_list[i], node_list[i + 1]);
        }
        
        if (processed_ways_ % 100000 == 0) {
            progress_.update("Processing ways", processed_ways_);
        }
    }
    
    const osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location>& node_index() const {
        return node_index_;
    }
    
    const ankerl::unordered_dense::set<osmium::object_id_type>& routable_way_ids() const {
        return routable_way_ids_;
    }
    
    const ankerl::unordered_dense::set<osmium::object_id_type>& routable_node_ids() const {
        return routable_node_ids_;
    }
    
    const UnionFind& union_find() const {
        return union_find_;
    }
    
    uint64_t processed_nodes() const { return processed_nodes_; }
    uint64_t processed_ways() const { return processed_ways_; }
    uint64_t routable_ways() const { return routable_ways_; }
    
    void finalize_progress() {
        progress_.finalize();
    }
};

// Connected components analysis using Union-Find results
struct ComponentInfo {
    ankerl::unordered_dense::set<osmium::object_id_type> nodes;
    size_t size() const { return nodes.size(); }
};

std::vector<ComponentInfo> compute_connected_components(
    const UnionFind& union_find,
    const ankerl::unordered_dense::set<osmium::object_id_type>& routable_node_ids) {
    
    std::vector<ComponentInfo> components;
    ankerl::unordered_dense::map<osmium::object_id_type, size_t> root_to_component;
    
    ProgressReporter progress;
    progress.update("Computing connected components", 0);
    
    // Group nodes by their Union-Find root
    for (osmium::object_id_type node_id : routable_node_ids) {
        osmium::object_id_type root = union_find.find(node_id);
        
        size_t comp_idx;
        auto it = root_to_component.find(root);
        if (it == root_to_component.end()) {
            comp_idx = components.size();
            root_to_component[root] = comp_idx;
            components.emplace_back();
        } else {
            comp_idx = it->second;
        }
        
        components[comp_idx].nodes.insert(node_id);
    }
    
    progress.finalize();
    return components;
}

// Find closest node pair between two components using disk-based spatial index
// comp1: smaller component (we iterate over its nodes)
// index: disk-based spatial index built from comp2 (primary component) nodes
// node_index: disk-based node location index
std::pair<osmium::object_id_type, osmium::object_id_type> find_closest_nodes(
    const ComponentInfo& comp1,
    const DiskSpatialIndex& index,
    const osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location>& node_index) {
    
    double min_distance = std::numeric_limits<double>::max();
    osmium::object_id_type node1 = 0;
    osmium::object_id_type node2 = 0;
    
    // For each node in comp1, query the spatial index to find nearest node in comp2
    for (osmium::object_id_type n1 : comp1.nodes) {
        try {
            osmium::Location loc = node_index.get(static_cast<osmium::unsigned_object_id_type>(n1));
            if (!loc.valid()) {
                continue;
            }
            
            // Query spatial index for nearest neighbor
            std::pair<osmium::object_id_type, double> result = index.find_nearest(loc.lat(), loc.lon());
            osmium::object_id_type nearest_n2 = result.first;
            double dist = result.second;
            
            if (nearest_n2 != 0 && dist < min_distance) {
                min_distance = dist;
                node1 = n1;
                node2 = nearest_n2;
            }
        } catch (...) {
            // Node not found in index, skip
            continue;
        }
    }
    
    return {node1, node2};
}

// Synthetic way structure
struct SyntheticWay {
    osmium::object_id_type way_id;
    osmium::object_id_type node1;
    osmium::object_id_type node2;
    double distance_m;
};

// Pass 2: Write connected graph with synthetic bridges
class ConnectedGraphWriter : public osmium::handler::Handler {
private:
    const osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location>& node_index_;
    const ankerl::unordered_dense::set<osmium::object_id_type>& routable_way_ids_;
    const ankerl::unordered_dense::set<osmium::object_id_type>& primary_component_nodes_;
    const std::vector<SyntheticWay>& synthetic_ways_;
    
    osmium::io::Writer* writer_;
    ankerl::unordered_dense::set<osmium::object_id_type> written_node_ids_;
    
    uint64_t written_nodes_ = 0;
    uint64_t written_ways_ = 0;
    uint64_t written_synthetic_ways_ = 0;
    ProgressReporter progress_;
    
public:
    ConnectedGraphWriter(
        const osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location>& node_index,
        const ankerl::unordered_dense::set<osmium::object_id_type>& routable_way_ids,
        const ankerl::unordered_dense::set<osmium::object_id_type>& primary_component_nodes,
        const std::vector<SyntheticWay>& synthetic_ways,
        osmium::io::Writer* writer)
        : node_index_(node_index)
        , routable_way_ids_(routable_way_ids)
        , primary_component_nodes_(primary_component_nodes)
        , synthetic_ways_(synthetic_ways)
        , writer_(writer) {
    }
    
    void node(const osmium::Node& node) {
        osmium::object_id_type node_id = static_cast<osmium::object_id_type>(node.id());
        
        // Write node if it's in primary component or referenced by synthetic ways
        bool should_write = false;
        
        if (primary_component_nodes_.find(node_id) != primary_component_nodes_.end()) {
            should_write = true;
        } else {
            // Check if referenced by synthetic way
            for (const auto& synth_way : synthetic_ways_) {
                if (synth_way.node1 == node_id || synth_way.node2 == node_id) {
                    should_write = true;
                    break;
                }
            }
        }
        
        if (should_write && node.location().valid() && 
            written_node_ids_.find(node_id) == written_node_ids_.end()) {
            osmium::memory::Buffer buffer(1024, osmium::memory::Buffer::auto_grow::yes);
            {
                osmium::builder::NodeBuilder builder(buffer);
                builder.set_id(node.id());
                builder.set_location(node.location());
            }
            osmium::Node& minimal_node = static_cast<osmium::Node&>(buffer.get<osmium::memory::Item>(0));
            if (writer_) {
                (*writer_)(minimal_node);
            }
            written_nodes_++;
            written_node_ids_.insert(node_id);
        }
    }
    
    void way(const osmium::Way& way) {
        osmium::object_id_type way_id = static_cast<osmium::object_id_type>(way.id());
        
        // Write if it's a routable way
        if (routable_way_ids_.find(way_id) != routable_way_ids_.end() && writer_) {
            (*writer_)(way);
            written_ways_++;
        }
    }
    
    void write_synthetic_ways() {
        progress_.update("Writing synthetic bridging ways", 0);
        
        osmium::object_id_type synthetic_way_id = -1; // Start from -1
        
        for (const auto& synth_way : synthetic_ways_) {
            // Ensure both nodes exist in index
            bool node1_exists = false;
            bool node2_exists = false;
            try {
                node_index_.get(static_cast<osmium::unsigned_object_id_type>(synth_way.node1));
                node1_exists = true;
            } catch (...) {}
            try {
                node_index_.get(static_cast<osmium::unsigned_object_id_type>(synth_way.node2));
                node2_exists = true;
            } catch (...) {}
            
            if (!node1_exists || !node2_exists) {
                continue;
            }
            
            // Create synthetic way
            osmium::memory::Buffer buffer(1024, osmium::memory::Buffer::auto_grow::yes);
            {
                osmium::builder::WayBuilder builder(buffer);
                builder.set_id(synthetic_way_id--);
                
                // Add tags
                {
                    osmium::builder::TagListBuilder tl_builder(buffer, &builder);
                    tl_builder.add_tag("highway", "service");
                    tl_builder.add_tag("synthetic", "yes");
                    tl_builder.add_tag("bridge_component", "yes");
                }
                
                // Add nodes
                {
                    osmium::builder::WayNodeListBuilder wnl_builder(buffer, &builder);
                    wnl_builder.add_node_ref(synth_way.node1);
                    wnl_builder.add_node_ref(synth_way.node2);
                }
            }
            
            osmium::Way& synthetic_way = static_cast<osmium::Way&>(buffer.get<osmium::memory::Item>(0));
            if (writer_) {
                (*writer_)(synthetic_way);
            }
            written_synthetic_ways_++;
        }
        
        progress_.finalize();
    }
    
    uint64_t written_nodes() const { return written_nodes_; }
    uint64_t written_ways() const { return written_ways_; }
    uint64_t written_synthetic_ways() const { return written_synthetic_ways_; }
};

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <input.osm.pbf> [--output <output.osm.pbf>] [--verbose]\n";
        return 1;
    }
    
    std::string input_file = argv[1];
    std::string output_file;
    bool verbose = false;
    
    // Parse arguments
    for (int i = 2; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--output" || arg == "-o") {
            if (i + 1 < argc) {
                output_file = argv[++i];
            } else {
                std::cerr << "Error: --output requires a filename\n";
                return 1;
            }
        } else if (arg == "--verbose" || arg == "-v") {
            verbose = true;
        }
    }
    
    // Determine output filename
    if (output_file.empty()) {
        fs::path input_path(input_file);
        std::string stem = input_path.stem().string();
        size_t pos = stem.find(".osm");
        if (pos != std::string::npos) {
            stem = stem.substr(0, pos);
        }
        output_file = (input_path.parent_path() / (stem + ".connected.osm.pbf")).string();
    }
    
    std::cout << "Connecting OSM components for RoutingKit\n";
    std::cout << "Input:  " << input_file << "\n";
    std::cout << "Output: " << output_file << "\n";
    
    // Remove output file if exists
    if (fs::exists(output_file)) {
        std::cout << "Removing existing output file: " << output_file << "\n";
        fs::remove(output_file);
    }
    
    try {
        // ===== PASS 1: Extract routable graph =====
        std::cout << "\nPass 1: Extracting routable graph...\n";
        osmium::io::Reader reader1(input_file);
        RoutableGraphExtractor extractor;
        osmium::apply(reader1, extractor);
        reader1.close();
        extractor.finalize_progress();
        
        std::cout << "Processed: " << extractor.processed_nodes() << " nodes, " 
                  << extractor.processed_ways() << " ways\n";
        std::cout << "Found: " << extractor.routable_ways() << " routable ways\n";
        
        const auto& node_index = extractor.node_index();
        const auto& routable_way_ids = extractor.routable_way_ids();
        const auto& routable_node_ids = extractor.routable_node_ids();
        const auto& union_find = extractor.union_find();
        
        std::cout << "Routable nodes: " << routable_node_ids.size() << "\n";
        std::cout << "Routable ways: " << routable_way_ids.size() << "\n";
        
        // Log memory after graph extraction
        {
            MemoryStats mem = MemoryStats::get_current();
            std::cout << "Memory after graph extraction: RSS=" << mem.format() 
                      << ", Peak=" << mem.format_peak() << "\n";
        }
        
        // ===== COMPUTE CONNECTED COMPONENTS =====
        std::cout << "\nComputing connected components...\n";
        {
            MemoryStats mem = MemoryStats::get_current();
            std::cout << "Memory before component computation: RSS=" << mem.format() 
                      << ", Peak=" << mem.format_peak() << "\n";
        }
        
        std::vector<ComponentInfo> components = compute_connected_components(union_find, routable_node_ids);
        
        std::cout << "Found " << components.size() << " connected components\n";
        
        // Sort by size
        std::vector<std::pair<size_t, size_t>> component_sizes;
        for (size_t i = 0; i < components.size(); ++i) {
            component_sizes.push_back({components[i].size(), i});
        }
        std::sort(component_sizes.begin(), component_sizes.end(), 
                  [](const auto& a, const auto& b) { return a.first > b.first; });
        
        if (verbose) {
            std::cout << "Component sizes (top 10):\n";
            for (size_t i = 0; i < std::min(10UL, component_sizes.size()); ++i) {
                std::cout << "  " << (i + 1) << ". " << component_sizes[i].first << " nodes\n";
            }
        }
        
        if (components.empty()) {
            std::cerr << "Error: No components found!\n";
            return 1;
        }
        
        // Identify primary component (largest)
        size_t primary_idx = component_sizes[0].second;
        const ComponentInfo& primary_component = components[primary_idx];
        ankerl::unordered_dense::set<osmium::object_id_type> primary_component_nodes(
            primary_component.nodes.begin(), primary_component.nodes.end());
        
        std::cout << "Primary component: " << primary_component.size() << " nodes\n";
        
        // Log memory after component computation
        {
            MemoryStats mem = MemoryStats::get_current();
            std::cout << "Memory after component computation: RSS=" << mem.format() 
                      << ", Peak=" << mem.format_peak() << "\n";
        }
        
        // ===== BUILD DISK-BASED SPATIAL INDEX FOR PRIMARY COMPONENT =====
        std::cout << "\nBuilding disk-based spatial index for primary component (" 
                  << primary_component.size() << " nodes)...\n";
        
        {
            MemoryStats mem = MemoryStats::get_current();
            std::cout << "Memory before spatial index building: RSS=" << mem.format() 
                      << ", Peak=" << mem.format_peak() << "\n";
        }
        
        // Create temporary directory for spatial index
        fs::path temp_index_dir = fs::temp_directory_path() / ("spatial_index_" + std::to_string(std::time(nullptr)));
        DiskSpatialIndex primary_index(temp_index_dir.string());
        
        ProgressReporter index_progress;
        size_t indexed_count = 0;
        
        for (osmium::object_id_type node_id : primary_component.nodes) {
            try {
                osmium::Location loc = node_index.get(static_cast<osmium::unsigned_object_id_type>(node_id));
                if (loc.valid()) {
                    primary_index.insert(node_id, loc.lat(), loc.lon());
                    indexed_count++;
                }
            } catch (...) {
                // Node not found, skip
            }
            
            if (indexed_count % 100000 == 0) {
                index_progress.update("Indexing nodes", indexed_count);
            }
        }
        
        index_progress.finalize();
        std::cout << "Indexed " << indexed_count << " nodes\n";
        
        // Log memory after index building
        {
            MemoryStats mem = MemoryStats::get_current();
            std::cout << "Memory after spatial index building: RSS=" << mem.format() 
                      << ", Peak=" << mem.format_peak() << "\n";
        }
        
        // ===== BRIDGE COMPONENTS =====
        std::cout << "\nBridging " << (components.size() - 1) << " non-primary components...\n";
        std::vector<SyntheticWay> synthetic_ways;
        ProgressReporter bridge_progress;
        
        for (size_t i = 0; i < components.size(); ++i) {
            if (i == primary_idx) {
                continue; // Skip primary component
            }
            
            const ComponentInfo& comp = components[i];
            auto [node1, node2] = find_closest_nodes(comp, primary_index, node_index);
            
            if (node1 != 0 && node2 != 0) {
                SyntheticWay synth_way;
                synth_way.way_id = -1; // Will be assigned later
                synth_way.node1 = node1;
                synth_way.node2 = node2;
                
                try {
                    osmium::Location loc1 = node_index.get(static_cast<osmium::unsigned_object_id_type>(node1));
                    osmium::Location loc2 = node_index.get(static_cast<osmium::unsigned_object_id_type>(node2));
                    if (loc1.valid() && loc2.valid()) {
                        synth_way.distance_m = haversine_m(loc1, loc2);
                    } else {
                        synth_way.distance_m = 0.0;
                    }
                } catch (...) {
                    synth_way.distance_m = 0.0;
                }
                
                synthetic_ways.push_back(synth_way);
            }
            
            if ((i + 1) % 100 == 0) {
                bridge_progress.update("Bridging components", i + 1);
                // Log memory periodically during bridging
                MemoryStats mem = MemoryStats::get_current();
                std::cout << "  Memory: RSS=" << mem.format() << ", Peak=" << mem.format_peak() << "\n";
            }
        }
        
        bridge_progress.finalize();
        std::cout << "Created " << synthetic_ways.size() << " synthetic bridging ways\n";
        
        // Log memory after bridging
        {
            MemoryStats mem = MemoryStats::get_current();
            std::cout << "Memory after bridging: RSS=" << mem.format() 
                      << ", Peak=" << mem.format_peak() << "\n";
        }
        
        if (verbose && !synthetic_ways.empty()) {
            double total_bridge_distance = 0.0;
            double max_bridge_distance = 0.0;
            for (const auto& synth : synthetic_ways) {
                total_bridge_distance += synth.distance_m;
                max_bridge_distance = std::max(max_bridge_distance, synth.distance_m);
            }
            std::cout << "Bridge distances: total=" << (total_bridge_distance / 1000.0) << " km, "
                      << "max=" << (max_bridge_distance / 1000.0) << " km, "
                      << "avg=" << (total_bridge_distance / synthetic_ways.size() / 1000.0) << " km\n";
        }
        
        // Clean up spatial index temporary files
        primary_index.cleanup();
        
        {
            MemoryStats mem = MemoryStats::get_current();
            std::cout << "Memory after cleanup, before Pass 2: RSS=" << mem.format() 
                      << ", Peak=" << mem.format_peak() << "\n";
        }
        
        // ===== PASS 2: Write connected graph =====
        std::cout << "\nPass 2: Writing connected graph...\n";
        osmium::io::Reader reader2(input_file);
        osmium::io::Writer writer(output_file);
        
        ConnectedGraphWriter graph_writer(node_index, routable_way_ids, primary_component_nodes, synthetic_ways, &writer);
        
        // Use NodeLocationsForWays to get node locations for ways
        using index_type = osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, osmium::Location>;
        index_type index;
        osmium::handler::NodeLocationsForWays<index_type> location_handler(index);
        location_handler.ignore_errors();
        
        osmium::apply(reader2, location_handler, graph_writer);
        reader2.close();
        
        // Write synthetic ways
        graph_writer.write_synthetic_ways();
        
        writer.close();
        
        std::cout << "\nComplete!\n";
        std::cout << "Written: " << graph_writer.written_nodes() << " nodes, "
                  << graph_writer.written_ways() << " ways, "
                  << graph_writer.written_synthetic_ways() << " synthetic bridges\n";
        
        // Log final memory usage
        {
            MemoryStats mem = MemoryStats::get_current();
            std::cout << "Final memory: RSS=" << mem.format() 
                      << ", Peak=" << mem.format_peak() << "\n";
        }
        
        // File size info
        if (fs::exists(output_file)) {
            double input_size_mb = fs::file_size(input_file) / (1024.0 * 1024.0);
            double output_size_mb = fs::file_size(output_file) / (1024.0 * 1024.0);
            std::cout << "File sizes: input=" << std::fixed << std::setprecision(1) << input_size_mb
                      << " MB, output=" << output_size_mb << " MB\n";
        }
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << "\n";
        return 1;
    }
    
    return 0;
}
