#include "CategoryMatcher.h"
#include "NUTSRegionLookup.h"
#include "PlaceExtraction.h"
#include <osmium/handler.hpp>
#include <osmium/io/pbf_input.hpp>
#include <osmium/io/reader.hpp>
#include <osmium/visitor.hpp>
#include <osmium/handler/node_locations_for_ways.hpp>
#include <osmium/index/map/sparse_file_array.hpp>
#include <osmium/osm/node.hpp>
#include <osmium/osm/way.hpp>
#include <osmium/osm/relation.hpp>
#include <osmium/osm/location.hpp>
#include <osmium/memory/buffer.hpp>

#include <ankerl/unordered_dense.h>
#include <nlohmann/json.hpp>
#include <iostream>
#include <fstream>
#include <filesystem>
#include <string>
#include <vector>
#include <queue>
#include <random>
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

// Data structures for disk indices (POD only - no std::string)
struct NodeData {
    osmium::Location location_wgs84;
    double x_mercator;
    double y_mercator;
    
    NodeData() : location_wgs84(), x_mercator(0.0), y_mercator(0.0) {}
    
    bool operator==(const NodeData& other) const {
        return location_wgs84 == other.location_wgs84 &&
               x_mercator == other.x_mercator &&
               y_mercator == other.y_mercator;
    }
    
    bool operator<(const NodeData& other) const {
        if (location_wgs84 != other.location_wgs84) {
            return location_wgs84 < other.location_wgs84;
        }
        if (x_mercator != other.x_mercator) {
            return x_mercator < other.x_mercator;
        }
        return y_mercator < other.y_mercator;
    }
};

struct WayData {
    osmium::Location centroid_wgs84;
    double x_mercator;
    double y_mercator;
    
    WayData() : centroid_wgs84(), x_mercator(0.0), y_mercator(0.0) {}
    
    bool operator==(const WayData& other) const {
        return centroid_wgs84 == other.centroid_wgs84 &&
               x_mercator == other.x_mercator &&
               y_mercator == other.y_mercator;
    }
    
    bool operator<(const WayData& other) const {
        if (centroid_wgs84 != other.centroid_wgs84) {
            return centroid_wgs84 < other.centroid_wgs84;
        }
        if (x_mercator != other.x_mercator) {
            return x_mercator < other.x_mercator;
        }
        return y_mercator < other.y_mercator;
    }
};

struct RelationData {
    osmium::Location centroid_wgs84;
    double x_mercator;
    double y_mercator;
    
    RelationData() : centroid_wgs84(), x_mercator(0.0), y_mercator(0.0) {}
    
    bool operator==(const RelationData& other) const {
        return centroid_wgs84 == other.centroid_wgs84 &&
               x_mercator == other.x_mercator &&
               y_mercator == other.y_mercator;
    }
    
    bool operator<(const RelationData& other) const {
        if (centroid_wgs84 != other.centroid_wgs84) {
            return centroid_wgs84 < other.centroid_wgs84;
        }
        if (x_mercator != other.x_mercator) {
            return x_mercator < other.x_mercator;
        }
        return y_mercator < other.y_mercator;
    }
};

// Data structure for priority queue
struct PlaceQueueData {
    osmium::object_id_type id;
    std::string tags_json;
    
    bool operator==(const PlaceQueueData& other) const {
        return id == other.id && tags_json == other.tags_json;
    }
    
    bool operator<(const PlaceQueueData& other) const {
        if (id != other.id) {
            return id < other.id;
        }
        return tags_json < other.tags_json;
    }
};

// Memory reporting helper (Linux-specific)
struct MemoryStats {
    uint64_t rss_kb = 0;
    uint64_t peak_rss_kb = 0;
    
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
};

// Single-pass handler
class SinglePassHandler : public osmium::handler::Handler {
private:
    CategoryMatcher::CategoryMatcher* category_matcher_;
    NUTSRegionLookup::NUTSIndex* nuts_index_;
    
    // Disk-backed indices (POD data only)
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, NodeData> node_index_;
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, WayData> way_index_;
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, RelationData> relation_index_;
    
    // Separate maps for region codes (id -> region_code)
    ankerl::unordered_dense::map<osmium::unsigned_object_id_type, std::string> node_regions_;
    ankerl::unordered_dense::map<osmium::unsigned_object_id_type, std::string> way_regions_;
    ankerl::unordered_dense::map<osmium::unsigned_object_id_type, std::string> relation_regions_;
    
    // Reservoir sampling: 2D queue structure [category_idx][region_idx]
    using QueueType = std::priority_queue<std::pair<double, PlaceQueueData>, 
                                         std::vector<std::pair<double, PlaceQueueData>>,
                                         std::greater<std::pair<double, PlaceQueueData>>>;
    std::vector<std::vector<QueueType>> node_queues_;
    std::vector<std::vector<QueueType>> way_queues_;
    std::vector<std::vector<QueueType>> relation_queues_;
    
    // Mappings
    std::vector<std::string> category_names_;
    std::vector<std::string> region_codes_;
    ankerl::unordered_dense::map<std::string, size_t> region_code_to_index_;
    
    // Random number generator
    std::mt19937 rng_;
    std::uniform_real_distribution<double> dist_;
    
    // Statistics
    uint64_t processed_nodes_ = 0;
    uint64_t processed_ways_ = 0;
    uint64_t processed_relations_ = 0;
    uint64_t matched_nodes_ = 0;
    uint64_t matched_ways_ = 0;
    uint64_t matched_relations_ = 0;
    
    // Progress tracking
    uint64_t file_size_ = 0;
    std::chrono::steady_clock::time_point start_time_;
    std::chrono::steady_clock::time_point last_progress_time_;
    
    // Get or create region index
    size_t get_or_create_region_index(const std::string& region_code) {
        auto it = region_code_to_index_.find(region_code);
        if (it != region_code_to_index_.end()) {
            return it->second;
        }
        
        size_t idx = region_codes_.size();
        region_codes_.push_back(region_code);
        region_code_to_index_[region_code] = idx;
        
        // Expand queues for new region
        for (auto& cat_queues : node_queues_) {
            cat_queues.resize(idx + 1);
        }
        for (auto& cat_queues : way_queues_) {
            cat_queues.resize(idx + 1);
        }
        for (auto& cat_queues : relation_queues_) {
            cat_queues.resize(idx + 1);
        }
        
        return idx;
    }
    
    // Apply reservoir sampling
    void apply_reservoir_sampling(QueueType& queue, const PlaceQueueData& data, int max_per_region) {
        double random = dist_(rng_);
        
        if (queue.size() < static_cast<size_t>(max_per_region)) {
            queue.push({random, data});
        } else if (random > queue.top().first) {
            queue.pop();
            queue.push({random, data});
        }
    }
    
    void update_progress() {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - last_progress_time_);
        
        // Only log every 5 seconds
        if (elapsed.count() < 5000) {
            return;
        }
        
        last_progress_time_ = now;
        
        auto total_elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - start_time_);
        int64_t elapsed_sec = total_elapsed.count();
        
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
        progress_oss << "Processing: Nodes " << processed_nodes_ 
                     << " (" << matched_nodes_ << " matched)"
                     << " | Ways " << processed_ways_ 
                     << " (" << matched_ways_ << " matched)"
                     << " | Relations " << processed_relations_
                     << " (" << matched_relations_ << " matched)"
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
    SinglePassHandler(CategoryMatcher::CategoryMatcher* category_matcher,
                     NUTSRegionLookup::NUTSIndex* nuts_index,
                     uint64_t file_size,
                     unsigned int seed = std::random_device{}())
        : category_matcher_(category_matcher)
        , nuts_index_(nuts_index)
        , rng_(seed)
        , dist_(0.0, 1.0)
        , file_size_(file_size)
        , start_time_(std::chrono::steady_clock::now())
        , last_progress_time_(start_time_) {
        
        // Initialize category names
        category_names_ = category_matcher_->get_category_names();
        
        // Initialize 2D queue structures
        size_t num_categories = category_matcher_->category_count();
        node_queues_.resize(num_categories);
        way_queues_.resize(num_categories);
        relation_queues_.resize(num_categories);
        
        for (size_t i = 0; i < num_categories; ++i) {
            node_queues_[i].resize(1);  // Will grow as regions are encountered
            way_queues_[i].resize(1);
            relation_queues_[i].resize(1);
        }
    }
    
    void node(const osmium::Node& node) {
        processed_nodes_++;
        
        if (!node.location().valid()) {
            if (processed_nodes_ % 10000 == 0) {
                update_progress();
            }
            return;
        }
        
        int category_idx = category_matcher_->match_category(node.tags());
        if (category_idx < 0) {
            if (processed_nodes_ % 10000 == 0) {
                update_progress();
            }
            return;
        }
        
        matched_nodes_++;
        
        // Lookup region
        std::string region_code = nuts_index_->lookup_wgs84(node.location().lat(), node.location().lon());
        if (region_code.empty()) {
            if (processed_nodes_ % 10000 == 0) {
                update_progress();
            }
            return;
        }
        
        // Compute Web Mercator coordinates
        auto mercator = PlaceExtraction::wgs84_to_web_mercator(node.location().lat(), node.location().lon());
        
        // Store in disk index
        NodeData node_data;
        node_data.location_wgs84 = node.location();
        node_data.x_mercator = mercator.first;
        node_data.y_mercator = mercator.second;
        node_index_.set(static_cast<osmium::unsigned_object_id_type>(node.id()), node_data);
        node_regions_[static_cast<osmium::unsigned_object_id_type>(node.id())] = region_code;
        
        // Get or create region index
        size_t region_idx = get_or_create_region_index(region_code);
        
        // Serialize tags
        std::string tags_json = PlaceExtraction::tags_to_json(node.tags());
        
        // Apply reservoir sampling
        PlaceQueueData queue_data;
        queue_data.id = node.id();
        queue_data.tags_json = std::move(tags_json);
        
        const auto& category = category_matcher_->get_category(category_idx);
        apply_reservoir_sampling(node_queues_[category_idx][region_idx], queue_data, category.max_per_region);
        
        if (processed_nodes_ % 10000 == 0) {
            update_progress();
        }
    }
    
    void way(const osmium::Way& way) {
        processed_ways_++;
        
        int category_idx = category_matcher_->match_category(way.tags());
        if (category_idx < 0) {
            if (processed_ways_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        matched_ways_++;
        
        // Load node locations from disk index
        std::vector<osmium::Location> node_locations;
        for (const auto& node_ref : way.nodes()) {
            try {
                NodeData node_data = node_index_.get(static_cast<osmium::unsigned_object_id_type>(node_ref.ref()));
                if (node_data.location_wgs84.valid()) {
                    node_locations.push_back(node_data.location_wgs84);
                }
            } catch (...) {
                // Node not found in index, skip
            }
        }
        
        if (node_locations.empty()) {
            if (processed_ways_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        // Compute centroid
        osmium::Location centroid = PlaceExtraction::compute_centroid(node_locations);
        if (!centroid.valid()) {
            if (processed_ways_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        // Compute Web Mercator coordinates
        auto mercator = PlaceExtraction::wgs84_to_web_mercator(centroid.lat(), centroid.lon());
        
        // Determine region (use centroid's region)
        std::string region_code = nuts_index_->lookup_wgs84(centroid.lat(), centroid.lon());
        if (region_code.empty()) {
            // Fallback: use majority region from nodes
            ankerl::unordered_dense::map<std::string, int> region_counts;
            for (const auto& node_ref : way.nodes()) {
                auto it = node_regions_.find(static_cast<osmium::unsigned_object_id_type>(node_ref.ref()));
                if (it != node_regions_.end() && !it->second.empty()) {
                    region_counts[it->second]++;
                }
            }
            
            if (!region_counts.empty()) {
                auto max_it = std::max_element(region_counts.begin(), region_counts.end(),
                    [](const auto& a, const auto& b) { return a.second < b.second; });
                region_code = max_it->first;
            }
        }
        
        if (region_code.empty()) {
            if (processed_ways_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        // Store in disk index
        WayData way_data;
        way_data.centroid_wgs84 = centroid;
        way_data.x_mercator = mercator.first;
        way_data.y_mercator = mercator.second;
        way_index_.set(static_cast<osmium::unsigned_object_id_type>(way.id()), way_data);
        way_regions_[static_cast<osmium::unsigned_object_id_type>(way.id())] = region_code;
        
        // Get or create region index
        size_t region_idx = get_or_create_region_index(region_code);
        
        // Serialize tags
        std::string tags_json = PlaceExtraction::tags_to_json(way.tags());
        
        // Apply reservoir sampling
        PlaceQueueData queue_data;
        queue_data.id = way.id();
        queue_data.tags_json = std::move(tags_json);
        
        const auto& category = category_matcher_->get_category(category_idx);
        apply_reservoir_sampling(way_queues_[category_idx][region_idx], queue_data, category.max_per_region);
        
        if (processed_ways_ % 1000 == 0) {
            update_progress();
        }
    }
    
    void relation(const osmium::Relation& relation) {
        processed_relations_++;
        
        int category_idx = category_matcher_->match_category(relation.tags());
        if (category_idx < 0) {
            if (processed_relations_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        matched_relations_++;
        
        // Load way centroids from disk index (for outer ring ways)
        std::vector<osmium::Location> way_centroids;
        std::vector<uint32_t> way_node_counts;  // For weighted centroid
        
        for (const auto& member : relation.members()) {
            if (member.type() == osmium::item_type::way && 
                std::strcmp(member.role(), "outer") == 0) {
                try {
                    WayData way_data = way_index_.get(static_cast<osmium::unsigned_object_id_type>(member.ref()));
                    if (way_data.centroid_wgs84.valid()) {
                        way_centroids.push_back(way_data.centroid_wgs84);
                        // Estimate node count (we don't store this, use 1 as default)
                        way_node_counts.push_back(1);
                    }
                } catch (...) {
                    // Way not found in index, skip
                }
            }
        }
        
        if (way_centroids.empty()) {
            if (processed_relations_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        // Compute weighted centroid
        double sum_lat = 0.0;
        double sum_lon = 0.0;
        uint64_t total_weight = 0;
        
        for (size_t i = 0; i < way_centroids.size(); ++i) {
            if (way_centroids[i].valid()) {
                uint32_t weight = way_node_counts[i];
                sum_lat += way_centroids[i].lat() * weight;
                sum_lon += way_centroids[i].lon() * weight;
                total_weight += weight;
            }
        }
        
        if (total_weight == 0) {
            if (processed_relations_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        osmium::Location centroid(sum_lon / total_weight, sum_lat / total_weight);
        if (!centroid.valid()) {
            if (processed_relations_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        // Compute Web Mercator coordinates
        auto mercator = PlaceExtraction::wgs84_to_web_mercator(centroid.lat(), centroid.lon());
        
        // Determine region (use centroid's region)
        std::string region_code = nuts_index_->lookup_wgs84(centroid.lat(), centroid.lon());
        if (region_code.empty()) {
            // Fallback: use majority region from ways
            ankerl::unordered_dense::map<std::string, int> region_counts;
            for (const auto& member : relation.members()) {
                if (member.type() == osmium::item_type::way && 
                    std::strcmp(member.role(), "outer") == 0) {
                    auto it = way_regions_.find(static_cast<osmium::unsigned_object_id_type>(member.ref()));
                    if (it != way_regions_.end() && !it->second.empty()) {
                        region_counts[it->second]++;
                    }
                }
            }
            
            if (!region_counts.empty()) {
                auto max_it = std::max_element(region_counts.begin(), region_counts.end(),
                    [](const auto& a, const auto& b) { return a.second < b.second; });
                region_code = max_it->first;
            }
        }
        
        if (region_code.empty()) {
            if (processed_relations_ % 1000 == 0) {
                update_progress();
            }
            return;
        }
        
        // Store in disk index
        RelationData relation_data;
        relation_data.centroid_wgs84 = centroid;
        relation_data.x_mercator = mercator.first;
        relation_data.y_mercator = mercator.second;
        relation_index_.set(static_cast<osmium::unsigned_object_id_type>(relation.id()), relation_data);
        relation_regions_[static_cast<osmium::unsigned_object_id_type>(relation.id())] = region_code;
        
        // Get or create region index
        size_t region_idx = get_or_create_region_index(region_code);
        
        // Serialize tags
        std::string tags_json = PlaceExtraction::tags_to_json(relation.tags());
        
        // Apply reservoir sampling
        PlaceQueueData queue_data;
        queue_data.id = relation.id();
        queue_data.tags_json = std::move(tags_json);
        
        const auto& category = category_matcher_->get_category(category_idx);
        apply_reservoir_sampling(relation_queues_[category_idx][region_idx], queue_data, category.max_per_region);
        
        if (processed_relations_ % 1000 == 0) {
            update_progress();
        }
    }
    
    void finalize_progress() {
        update_progress();
        std::cout << "\n";
        MemoryStats mem = MemoryStats::get_current();
        std::cout << "Memory: RSS=" << mem.format() << "\n";
    }
    
    // Getters for CSV writing
    std::vector<std::vector<QueueType>>& get_node_queues() { return node_queues_; }
    std::vector<std::vector<QueueType>>& get_way_queues() { return way_queues_; }
    std::vector<std::vector<QueueType>>& get_relation_queues() { return relation_queues_; }
    const std::vector<std::string>& get_category_names() const { return category_names_; }
    const std::vector<std::string>& get_region_codes() const { return region_codes_; }
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, NodeData>& get_node_index() { return node_index_; }
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, WayData>& get_way_index() { return way_index_; }
    osmium::index::map::SparseFileArray<osmium::unsigned_object_id_type, RelationData>& get_relation_index() { return relation_index_; }
    const ankerl::unordered_dense::map<osmium::unsigned_object_id_type, std::string>& get_node_regions() const { return node_regions_; }
    const ankerl::unordered_dense::map<osmium::unsigned_object_id_type, std::string>& get_way_regions() const { return way_regions_; }
    const ankerl::unordered_dense::map<osmium::unsigned_object_id_type, std::string>& get_relation_regions() const { return relation_regions_; }
};

// Helper to extract all items from a priority queue (destructive - empties the queue)
template<typename QueueType>
std::vector<PlaceQueueData> extract_queue_items(QueueType& queue) {
    std::vector<PlaceQueueData> items;
    while (!queue.empty()) {
        items.push_back(queue.top().second);
        queue.pop();
    }
    return items;
}

// Compress CSV file
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

int main(int argc, char* argv[]) {
    if (argc < 4) {
        std::cerr << "Usage: " << argv[0] << " <input.osm.pbf> --config <config.yaml> --regions-geojson <regions.geojson> [--output <output.csv.gz>]\n";
        return 1;
    }
    
    std::string input_file;
    std::string config_file;
    std::string regions_geojson;
    std::string output_file;
    
    // Parse command line arguments
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--config" && i + 1 < argc) {
            config_file = argv[++i];
        } else if (arg == "--regions-geojson" && i + 1 < argc) {
            regions_geojson = argv[++i];
        } else if (arg == "--output" && i + 1 < argc) {
            output_file = argv[++i];
        } else if (arg[0] != '-') {
            input_file = arg;
        }
    }
    
    if (input_file.empty() || config_file.empty() || regions_geojson.empty()) {
        std::cerr << "Error: Missing required arguments\n";
        std::cerr << "Usage: " << argv[0] << " <input.osm.pbf> --config <config.yaml> --regions-geojson <regions.geojson> [--output <output.csv.gz>]\n";
        return 1;
    }
    
    // Determine output file
    if (output_file.empty()) {
        fs::path input_path(input_file);
        std::string stem = input_path.stem().string();
        size_t pos = stem.find(".osm");
        if (pos != std::string::npos) {
            stem = stem.substr(0, pos);
        }
        output_file = (input_path.parent_path() / (stem + ".places.csv.gz")).string();
    }
    
    // Get file size
    uint64_t file_size = 0;
    try {
        file_size = fs::file_size(input_file);
    } catch (const fs::filesystem_error& e) {
        std::cerr << "Error: Failed to get file size: " << e.what() << "\n";
        return 1;
    }
    
    std::cout << "Loading category matcher from: " << config_file << "\n";
    auto category_matcher = CategoryMatcher::CategoryMatcher::from_yaml_file(config_file);
    
    std::cout << "Loading NUTS regions from: " << regions_geojson << "\n";
    auto nuts_index = NUTSRegionLookup::NUTSIndex::from_geojson_file(regions_geojson);
    
    std::cout << "Processing OSM file: " << input_file << "\n";
    std::cout << "Output file: " << output_file << "\n";
    std::cout << "Input file size: " << std::fixed << std::setprecision(1) 
              << (file_size / (1024.0 * 1024.0)) << " MB\n";
    
    // Remove output file if it exists
    if (fs::exists(output_file)) {
        std::cout << "Output file already exists, removing: " << output_file << "\n";
        fs::remove(output_file);
    }
    
    // Create temporary CSV file
    fs::path temp_csv = fs::temp_directory_path() / ("places_" + std::to_string(std::time(nullptr)) + ".csv");
    std::ofstream csv_file(temp_csv);
    if (!csv_file) {
        std::cerr << "Error: Failed to open temporary CSV file\n";
        return 1;
    }
    
    // Write CSV header
    csv_file << "id,category,lat,lon,x_mercator,y_mercator,region,is_node,is_way,is_relation,tags\n";
    
    std::cout << "Processing places (single pass)...\n";
    std::cout.setf(std::ios::unitbuf);
    
    try {
        // Single pass processing
        osmium::io::Reader reader(input_file);
        SinglePassHandler handler(category_matcher.get(), nuts_index.get(), file_size);
        osmium::apply(reader, handler);
        reader.close();
        handler.finalize_progress();
        
        std::cout << "\nWriting CSV...\n";
        
        // Write all sampled places to CSV
        const auto& category_names = handler.get_category_names();
        const auto& region_codes = handler.get_region_codes();
        
        // Process nodes
        auto& node_queues = handler.get_node_queues();
        for (size_t cat_idx = 0; cat_idx < node_queues.size(); ++cat_idx) {
            for (size_t reg_idx = 0; reg_idx < node_queues[cat_idx].size(); ++reg_idx) {
                auto items = extract_queue_items(node_queues[cat_idx][reg_idx]);
                
                for (const auto& item : items) {
                    try {
                        NodeData node_data = handler.get_node_index().get(static_cast<osmium::unsigned_object_id_type>(item.id));
                        auto region_it = handler.get_node_regions().find(static_cast<osmium::unsigned_object_id_type>(item.id));
                        std::string region_code = (region_it != handler.get_node_regions().end()) ? region_it->second : "";
                        
                        csv_file << item.id << ","
                                << "\"" << PlaceExtraction::csv_escape(category_names[cat_idx]) << "\","
                                << std::fixed << std::setprecision(7) << node_data.location_wgs84.lat() << ","
                                << node_data.location_wgs84.lon() << ","
                                << node_data.x_mercator << ","
                                << node_data.y_mercator << ","
                                << "\"" << PlaceExtraction::csv_escape(region_code) << "\","
                                << "1,0,0,"
                                << "\"" << PlaceExtraction::csv_escape(item.tags_json) << "\"\n";
                    } catch (...) {
                        // Skip if not found
                    }
                }
            }
        }
        
        // Process ways
        auto& way_queues = handler.get_way_queues();
        for (size_t cat_idx = 0; cat_idx < way_queues.size(); ++cat_idx) {
            for (size_t reg_idx = 0; reg_idx < way_queues[cat_idx].size(); ++reg_idx) {
                auto items = extract_queue_items(way_queues[cat_idx][reg_idx]);
                
                for (const auto& item : items) {
                    try {
                        WayData way_data = handler.get_way_index().get(static_cast<osmium::unsigned_object_id_type>(item.id));
                        auto region_it = handler.get_way_regions().find(static_cast<osmium::unsigned_object_id_type>(item.id));
                        std::string region_code = (region_it != handler.get_way_regions().end()) ? region_it->second : "";
                        
                        csv_file << item.id << ","
                                << "\"" << PlaceExtraction::csv_escape(category_names[cat_idx]) << "\","
                                << std::fixed << std::setprecision(7) << way_data.centroid_wgs84.lat() << ","
                                << way_data.centroid_wgs84.lon() << ","
                                << way_data.x_mercator << ","
                                << way_data.y_mercator << ","
                                << "\"" << PlaceExtraction::csv_escape(region_code) << "\","
                                << "0,1,0,"
                                << "\"" << PlaceExtraction::csv_escape(item.tags_json) << "\"\n";
                    } catch (...) {
                        // Skip if not found
                    }
                }
            }
        }
        
        // Process relations
        auto& relation_queues = handler.get_relation_queues();
        for (size_t cat_idx = 0; cat_idx < relation_queues.size(); ++cat_idx) {
            for (size_t reg_idx = 0; reg_idx < relation_queues[cat_idx].size(); ++reg_idx) {
                auto items = extract_queue_items(relation_queues[cat_idx][reg_idx]);
                
                for (const auto& item : items) {
                    try {
                        RelationData relation_data = handler.get_relation_index().get(static_cast<osmium::unsigned_object_id_type>(item.id));
                        auto region_it = handler.get_relation_regions().find(static_cast<osmium::unsigned_object_id_type>(item.id));
                        std::string region_code = (region_it != handler.get_relation_regions().end()) ? region_it->second : "";
                        
                        csv_file << item.id << ","
                                << "\"" << PlaceExtraction::csv_escape(category_names[cat_idx]) << "\","
                                << std::fixed << std::setprecision(7) << relation_data.centroid_wgs84.lat() << ","
                                << relation_data.centroid_wgs84.lon() << ","
                                << relation_data.x_mercator << ","
                                << relation_data.y_mercator << ","
                                << "\"" << PlaceExtraction::csv_escape(region_code) << "\","
                                << "0,0,1,"
                                << "\"" << PlaceExtraction::csv_escape(item.tags_json) << "\"\n";
                    } catch (...) {
                        // Skip if not found
                    }
                }
            }
        }
        
        csv_file.close();
        
        // Compress CSV file
        std::cout << "Compressing CSV...\n";
        compress_csv(temp_csv.string(), output_file);
        
        // Remove temporary CSV
        fs::remove(temp_csv);
        
        std::cout << "Processing complete!\n";
        std::cout << "Output written to: " << output_file << "\n";
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << "\n";
        if (fs::exists(temp_csv)) {
            fs::remove(temp_csv);
        }
        return 1;
    }
    
    return 0;
}
