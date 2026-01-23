#ifndef DISK_SPATIAL_INDEX_H
#define DISK_SPATIAL_INDEX_H

#include <osmium/osm/location.hpp>
#include <osmium/osm/types.hpp>
#include <osmium/index/map/sparse_file_array.hpp>
#include <ankerl/unordered_dense.h>
#include <vector>
#include <string>
#include <filesystem>
#include <fstream>
#include <cmath>
#include <limits>
#include <algorithm>
#include <utility>
#include <sstream>

namespace fs = std::filesystem;

// Disk-based spatial index using a grid-based approach
// Grid cells are ~1km x 1km (0.01 degrees)
class DiskSpatialIndex {
public:
    // Grid cell coordinates (integer lat/lon * 100 to get 0.01 degree precision)
    struct GridCell {
        int32_t lat_cell;  // latitude * 100
        int32_t lon_cell;  // longitude * 100
        
        bool operator<(const GridCell& other) const {
            if (lat_cell != other.lat_cell) return lat_cell < other.lat_cell;
            return lon_cell < other.lon_cell;
        }
        
        bool operator==(const GridCell& other) const {
            return lat_cell == other.lat_cell && lon_cell == other.lon_cell;
        }
    };
    
    // Hash function for GridCell
    struct GridCellHash {
        std::size_t operator()(const GridCell& cell) const {
            // Combine lat and lon into a single hash
            return std::hash<int64_t>()(static_cast<int64_t>(cell.lat_cell) << 32 | static_cast<uint32_t>(cell.lon_cell));
        }
    };
    
    // Node entry in grid cell
    struct NodeEntry {
        osmium::object_id_type node_id;
        double lat;
        double lon;
    };
    
    DiskSpatialIndex(const std::string& temp_dir) 
        : temp_dir_(temp_dir)
        , grid_cell_size_(0.01) { // ~1km at equator
        fs::create_directories(temp_dir_);
    }
    
    // Insert a node into the index
    void insert(osmium::object_id_type node_id, double lat, double lon) {
        GridCell cell = get_grid_cell(lat, lon);
        
        // Get or create cell file
        std::string cell_file = get_cell_file_path(cell);
        std::ofstream file(cell_file, std::ios::app | std::ios::binary);
        
        if (file.is_open()) {
            NodeEntry entry;
            entry.node_id = node_id;
            entry.lat = lat;
            entry.lon = lon;
            file.write(reinterpret_cast<const char*>(&entry), sizeof(NodeEntry));
        }
        
        // Track which cells have nodes
        cells_with_nodes_.insert(cell);
    }
    
    // Find nearest node to query point
    // Returns (node_id, distance_in_meters)
    std::pair<osmium::object_id_type, double> find_nearest(
        double query_lat, 
        double query_lon,
        double max_radius_m = 10000.0) const {
        
        double min_distance = std::numeric_limits<double>::max();
        osmium::object_id_type nearest_node = 0;
        
        // Start with query cell, then expand to neighbors
        int32_t radius_cells = 1;
        constexpr int32_t max_radius_cells = 1000; // ~10km
        
        while (radius_cells <= max_radius_cells) {
            GridCell query_cell = get_grid_cell(query_lat, query_lon);
            
            // Check all cells within radius
            for (int32_t dlat = -radius_cells; dlat <= radius_cells; ++dlat) {
                for (int32_t dlon = -radius_cells; dlon <= radius_cells; ++dlon) {
                    // Only check cells on the perimeter for efficiency (skip inner cells on later iterations)
                    if (radius_cells > 1) {
                        int32_t abs_dlat = std::abs(dlat);
                        int32_t abs_dlon = std::abs(dlon);
                        if (abs_dlat < radius_cells - 1 && abs_dlon < radius_cells - 1) {
                            continue; // Skip inner cells
                        }
                    }
                    
                    GridCell cell;
                    cell.lat_cell = query_cell.lat_cell + dlat;
                    cell.lon_cell = query_cell.lon_cell + dlon;
                    
                    if (cells_with_nodes_.find(cell) == cells_with_nodes_.end()) {
                        continue;
                    }
                    
                    // Read nodes from this cell
                    std::vector<NodeEntry> nodes = read_cell_nodes(cell);
                    
                    for (const auto& entry : nodes) {
                        double dist = haversine_m(query_lat, query_lon, entry.lat, entry.lon);
                        if (dist < min_distance && dist <= max_radius_m) {
                            min_distance = dist;
                            nearest_node = entry.node_id;
                        }
                    }
                }
            }
            
            // If we found a node, return it
            if (nearest_node != 0) {
                return std::make_pair(nearest_node, min_distance);
            }
            
            // Expand search radius
            radius_cells++;
        }
        
        return std::make_pair(static_cast<osmium::object_id_type>(0), std::numeric_limits<double>::max());
    }
    
    // Clean up temporary files
    void cleanup() {
        for (const auto& cell : cells_with_nodes_) {
            std::string cell_file = get_cell_file_path(cell);
            if (fs::exists(cell_file)) {
                fs::remove(cell_file);
            }
        }
        if (fs::exists(temp_dir_)) {
            fs::remove_all(temp_dir_);
        }
    }
    
private:
    GridCell get_grid_cell(double lat, double lon) const {
        GridCell cell;
        cell.lat_cell = static_cast<int32_t>(std::floor(lat / grid_cell_size_));
        cell.lon_cell = static_cast<int32_t>(std::floor(lon / grid_cell_size_));
        return cell;
    }
    
    std::string get_cell_file_path(const GridCell& cell) const {
        std::ostringstream oss;
        oss << temp_dir_ << "/cell_" << cell.lat_cell << "_" << cell.lon_cell << ".bin";
        return oss.str();
    }
    
    std::vector<NodeEntry> read_cell_nodes(const GridCell& cell) const {
        std::vector<NodeEntry> nodes;
        std::string cell_file = get_cell_file_path(cell);
        
        if (!fs::exists(cell_file)) {
            return nodes;
        }
        
        std::ifstream file(cell_file, std::ios::binary);
        if (!file.is_open()) {
            return nodes;
        }
        
        NodeEntry entry;
        while (file.read(reinterpret_cast<char*>(&entry), sizeof(NodeEntry))) {
            nodes.push_back(entry);
        }
        
        return nodes;
    }
    
    static double haversine_m(double lat1, double lon1, double lat2, double lon2) {
        constexpr double R = 6371000.0;
        const double lat1_rad = lat1 * M_PI / 180.0;
        const double lon1_rad = lon1 * M_PI / 180.0;
        const double lat2_rad = lat2 * M_PI / 180.0;
        const double lon2_rad = lon2 * M_PI / 180.0;
        const double dlat = lat2_rad - lat1_rad;
        const double dlon = lon2_rad - lon1_rad;
        const double sin_dlat = std::sin(dlat / 2.0);
        const double sin_dlon = std::sin(dlon / 2.0);
        const double h = sin_dlat * sin_dlat + 
                        std::cos(lat1_rad) * std::cos(lat2_rad) * sin_dlon * sin_dlon;
        const double c = 2.0 * std::atan2(std::sqrt(h), std::sqrt(1.0 - h));
        return R * c;
    }
    
    std::string temp_dir_;
    double grid_cell_size_;
    ankerl::unordered_dense::set<GridCell, GridCellHash> cells_with_nodes_;
};

#endif // DISK_SPATIAL_INDEX_H
