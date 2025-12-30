#include "../include/RoutingEngine.h"
#include "../include/Logger.h"
#include <routingkit/timer.h>
#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <cstring>
#include <set>
#include <limits>
#include <numeric>
#include <filesystem>
#include <iomanip>

namespace RoutingServer {

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

// Helper to check if string ends with a suffix (replacement for C++20's ends_with)
inline bool ends_with(const std::string& str, const std::string& suffix) {
    return str.size() >= suffix.size() && 
           str.compare(str.size() - suffix.size(), suffix.size(), suffix) == 0;
}

// Custom profile implementation - allows access to all road types
bool is_osm_way_used_by_custom_profile(uint64_t osm_way_id, const RoutingKit::TagMap& tags, 
                                       std::function<void(const std::string&)> log_message) {
    // Log highway types for analysis (static set to avoid duplicates)
    static std::set<std::string> highway_types_seen;
    static std::set<std::string> other_tags_seen;
    
    const char* highway_value = tags["highway"];
    if (highway_value != nullptr) {
        std::string highway_str(highway_value);
        if (highway_types_seen.insert(highway_str).second) {
            if (log_message) {
                log_message("Found highway type: " + highway_str);
            }
        }
    }
    
    // Also log other relevant tags
    const char* railway_value = tags["railway"];
    if (railway_value != nullptr) {
        std::string tag_str = "railway=" + std::string(railway_value);
        if (other_tags_seen.insert(tag_str).second) {
            if (log_message) {
                log_message("Found tag: " + tag_str);
            }
        }
    }
    
    const char* public_transport_value = tags["public_transport"];
    if (public_transport_value != nullptr) {
        std::string tag_str = "public_transport=" + std::string(public_transport_value);
        if (other_tags_seen.insert(tag_str).second) {
            if (log_message) {
                log_message("Found tag: " + tag_str);
            }
        }
    }

    // Include all roads that cars, bicycles, or pedestrians can use
    if (RoutingKit::is_osm_way_used_by_cars(osm_way_id, tags, log_message)) {
        return true;
    }
    
    if (RoutingKit::is_osm_way_used_by_bicycles(osm_way_id, tags, log_message)) {
        return true;
    }
    
    if (RoutingKit::is_osm_way_used_by_pedestrians(osm_way_id, tags, log_message)) {
        return true;
    }
    
    // Include ALL possible highway types from OSM documentation
    if (highway_value != nullptr) {
        std::string highway_str(highway_value);
        
        // Main road types
        if (highway_str == "motorway" || highway_str == "trunk" || highway_str == "primary" ||
            highway_str == "secondary" || highway_str == "tertiary" || highway_str == "unclassified" ||
            highway_str == "residential") {
            return true;
        }
        
        // Link roads
        if (highway_str == "motorway_link" || highway_str == "trunk_link" || highway_str == "primary_link" ||
            highway_str == "secondary_link" || highway_str == "tertiary_link") {
            return true;
        }
        
        // Special road types
        if (highway_str == "living_street" || highway_str == "service" || highway_str == "pedestrian" ||
            highway_str == "track" || highway_str == "bus_guideway" || highway_str == "busway" ||
            highway_str == "raceway" || highway_str == "road" || highway_str == "construction" ||
            highway_str == "escape") {
            return true;
        }
        
        // Paths
        if (highway_str == "path" || highway_str == "footway" || highway_str == "cycleway" ||
            highway_str == "bridleway" || highway_str == "steps" || highway_str == "corridor") {
            return true;
        }
        
        // Other highway features mentioned in documentation
        if (highway_str == "bus_stop" || highway_str == "crossing" || highway_str == "emergency_access_point" ||
            highway_str == "give_way" || highway_str == "mini_roundabout" || highway_str == "motorway_junction" ||
            highway_str == "passing_place" || highway_str == "platform" || highway_str == "rest_area" ||
            highway_str == "services" || highway_str == "speed_camera" || highway_str == "stop" ||
            highway_str == "street_lamp" || highway_str == "traffic_signals" || highway_str == "turning_circle" ||
            highway_str == "turning_loop") {
            return true;
        }
        
        // Lifecycle states
        if (highway_str == "proposed" || highway_str == "planned" || highway_str == "abandoned" ||
            highway_str == "disused" || highway_str == "razed") {
            return true;
        }
        
        // Additional types that might exist
        if (highway_str == "via_ferrata" || highway_str == "elevator" || highway_str == "escalator") {
            return true;
        }
    }
    
    // Also include railway platforms and other transport infrastructure
    const char* railway_value_check = tags["railway"];
    if (railway_value_check != nullptr && strcmp(railway_value_check, "platform") == 0) {
        return true;
    }
    
    // Include public transport platforms
    const char* public_transport_value_check = tags["public_transport"];
    if (public_transport_value_check != nullptr && strcmp(public_transport_value_check, "platform") == 0) {
        return true;
    }
    
    return false;
}

unsigned get_custom_profile_speed(uint64_t osm_way_id, const RoutingKit::TagMap& tags,
                                  std::function<void(const std::string&)> log_message) {
    // First try to get the standard speed from OSM maxspeed tags
    unsigned standard_speed = RoutingKit::get_osm_way_speed(osm_way_id, tags, log_message);
    
    // For non-car infrastructure, apply conservative speed limits
    const char* highway_value = tags["highway"];
    if (highway_value != nullptr) {
        std::string highway_str(highway_value);
        
        // Very slow infrastructure (walking pace)
        if (highway_str == "steps" || highway_str == "via_ferrata" || highway_str == "elevator" ||
            highway_str == "escalator") {
            return 5u; // 5 km/h
        }
        
        // Pedestrian and shared infrastructure (slow)
        if (highway_str == "path" || highway_str == "footway" || highway_str == "cycleway" || 
            highway_str == "pedestrian" || highway_str == "platform" || highway_str == "corridor") {
            return std::min(standard_speed, 20u); // Max 20 km/h
        }
        
        // Service roads and tracks (moderate)
        if (highway_str == "service" || highway_str == "living_street" || highway_str == "track" ||
            highway_str == "bridleway") {
            return std::min(standard_speed, 30u); // Max 30 km/h
        }
        
        // Construction and lifecycle states (conservative)
        if (highway_str == "construction" || highway_str == "proposed" || highway_str == "planned") {
            return std::min(standard_speed, 30u); // Max 30 km/h
        }
        
        // Abandoned/disused (very slow)
        if (highway_str == "abandoned" || highway_str == "disused" || highway_str == "razed") {
            return 10u; // 10 km/h
        }
        
        // Residential areas
        if (highway_str == "residential" || highway_str == "unclassified") {
            return std::min(standard_speed, 50u); // Max 50 km/h
        }
        
        // Special purpose roads
        if (highway_str == "bus_guideway" || highway_str == "busway") {
            return std::min(standard_speed, 60u); // Max 60 km/h
        }
        
        // Racing tracks (but still reasonable for routing)
        if (highway_str == "raceway") {
            return std::min(standard_speed, 80u); // Max 80 km/h
        }
        
        // Emergency and escape roads
        if (highway_str == "escape" || highway_str == "emergency_access_point") {
            return std::min(standard_speed, 40u); // Max 40 km/h
        }
        
        // Highway features (usually not routable, but just in case)
        if (highway_str == "bus_stop" || highway_str == "crossing" || highway_str == "give_way" ||
            highway_str == "mini_roundabout" || highway_str == "motorway_junction" || 
            highway_str == "passing_place" || highway_str == "rest_area" || highway_str == "services" ||
            highway_str == "speed_camera" || highway_str == "stop" || highway_str == "street_lamp" ||
            highway_str == "traffic_signals" || highway_str == "turning_circle" || highway_str == "turning_loop") {
            return 10u; // 10 km/h (these are usually point features anyway)
        }
        
        // Unknown road type (for "road" and any others)
        if (highway_str == "road") {
            return std::min(standard_speed, 50u); // Max 50 km/h
        }
    }
    
    // Handle railway and public transport platforms
    const char* railway_value = tags["railway"];
    const char* public_transport_value = tags["public_transport"];
    if ((railway_value != nullptr && strcmp(railway_value, "platform") == 0) ||
        (public_transport_value != nullptr && strcmp(public_transport_value, "platform") == 0)) {
        return 10u; // Very slow walking speed on platforms
    }
    
    return standard_speed;
}

RoutingKit::OSMWayDirectionCategory get_custom_profile_direction_category(uint64_t osm_way_id, const RoutingKit::TagMap& tags,
                                                                          std::function<void(const std::string&)> log_message) {
    // For most pedestrian and cycling infrastructure, allow bidirectional access unless explicitly restricted
    const char* highway_value = tags["highway"];
    if (highway_value != nullptr && (
        strcmp(highway_value, "path") == 0 ||
        strcmp(highway_value, "footway") == 0 ||
        strcmp(highway_value, "cycleway") == 0 ||
        strcmp(highway_value, "pedestrian") == 0 ||
        strcmp(highway_value, "bridleway") == 0)) {
        
        // Check for explicit oneway restrictions
        const char* oneway_value = tags["oneway"];
        if (oneway_value != nullptr) {
            if (strcmp(oneway_value, "yes") == 0 || strcmp(oneway_value, "true") == 0 || strcmp(oneway_value, "1") == 0) {
                return RoutingKit::OSMWayDirectionCategory::only_open_forwards;
            } else if (strcmp(oneway_value, "-1") == 0 || strcmp(oneway_value, "reverse") == 0) {
                return RoutingKit::OSMWayDirectionCategory::only_open_backwards;
            }
        }
        
        // Default to bidirectional for pedestrian/cycling infrastructure
        return RoutingKit::OSMWayDirectionCategory::open_in_both;
    }
    
    // For car roads and other infrastructure, use the standard car direction logic
    return RoutingKit::get_osm_car_direction_category(osm_way_id, tags, log_message);
}

// Helper method to process a line from the address CSV
static void processAddressLine(const std::string& line, std::vector<Address>& addresses, 
                       std::vector<float>& lat_vec, std::vector<float>& lon_vec) {
    if (line.empty()) {
        return;
    }
    
    std::istringstream ss(line);
    std::string id, lon, lat, street, housenumber, postcode, city;
    
    // Parse whitespace-separated values (OSM extract format)
    // First read the numeric fields
    if (!(ss >> id >> lon >> lat)) {
        return; // Must have at least id, lon, lat
    }
    
    // Now read the string fields, which might be missing
    std::getline(ss >> std::ws, street, '\t');    // Read until tab or end
    std::getline(ss >> std::ws, housenumber, '\t');
    std::getline(ss >> std::ws, postcode, '\t');
    std::getline(ss >> std::ws, city);
    
    // Create address object
    Address addr;
    addr.id = addresses.size();
    
    // Handle the numeric fields carefully to avoid stod exceptions
    try {
        addr.longitude = std::stod(lon);
        addr.latitude = std::stod(lat);
    } catch (const std::exception&) {
        return; // Skip this address if coordinates aren't valid numbers
    }
    
    // Set string fields (empty strings are OK)
    addr.street = street;
    addr.housenumber = housenumber;
    addr.postcode = postcode;
    addr.city = city;
    
    // Add to the vectors for spatial indexing
    lat_vec.push_back(static_cast<float>(addr.latitude));
    lon_vec.push_back(static_cast<float>(addr.longitude));
    
    // Add to the addresses vector
    addresses.push_back(addr);
}

RoutingEngine::RoutingEngine(const std::string& osm_file, const std::string& ch_geo_file) {
    LOG("Loading OSM routing graph with custom profile...");
    
    // Determine CH file path: use provided path, or derive from OSM file name
    std::string ch_file_path = ch_geo_file;
    if (ch_file_path.empty()) {
        // Derive CH filename from OSM filename by replacing extension
        std::filesystem::path osm_path(osm_file);
        std::filesystem::path ch_path = osm_path;
        ch_path.replace_extension(".ch_geo.bin");
        ch_file_path = ch_path.string();
        LOG("Auto-derived CH file path: " << ch_file_path);
    }
    
    MemoryStats mem_before = MemoryStats::get_current();
    LOG("Memory before loading: RSS=" << mem_before.format() << ", Peak=" << mem_before.format_peak());
    
    // Load the ID mapping with our custom profile
    auto mapping = RoutingKit::load_osm_id_mapping_from_pbf(
        osm_file,
        nullptr, // No special routing nodes
        [](uint64_t osm_way_id, const RoutingKit::TagMap& tags) {
            return is_osm_way_used_by_custom_profile(osm_way_id, tags);
        },
        [](const std::string& msg) { LOG(msg); }
    );
    
    MemoryStats mem_after_mapping = MemoryStats::get_current();
    LOG("ID mapping loaded, " << mapping.is_routing_way.population_count() << " routing ways found");
    LOG("Memory after ID mapping: RSS=" << mem_after_mapping.format() << ", Peak=" << mem_after_mapping.format_peak());
    
    // Prepare speed storage
    unsigned routing_way_count = mapping.is_routing_way.population_count();
    way_speed_.resize(routing_way_count);
    
    // Load the routing graph with custom callbacks
    graph_ = RoutingKit::load_osm_routing_graph_from_pbf(
        osm_file,
        mapping,
        [this](uint64_t osm_way_id, unsigned routing_way_id, const RoutingKit::TagMap& way_tags) {
            // Store the speed for this way
            way_speed_[routing_way_id] = get_custom_profile_speed(osm_way_id, way_tags);
            return get_custom_profile_direction_category(osm_way_id, way_tags);
        },
        nullptr, // No turn restrictions for now
        [](const std::string& msg) { LOG(msg); }
    );
    
    LOG("Routing graph loaded with " << graph_.node_count() << " nodes and " << graph_.arc_count() << " arcs");
    
    MemoryStats mem_after_graph = MemoryStats::get_current();
    LOG("Memory after graph loading: RSS=" << mem_after_graph.format() << ", Peak=" << mem_after_graph.format_peak());
    
    // Build travel time array from geo_distance and way speeds
    std::vector<unsigned> travel_time(graph_.arc_count());
    LOG("Processing " << graph_.arc_count() << " arcs for travel time calculation...");
    
    for (unsigned arc_id = 0; arc_id < graph_.arc_count(); ++arc_id) {
        unsigned way_id = graph_.way[arc_id];
        unsigned speed_kmh = way_speed_[way_id];
        unsigned distance_m = graph_.geo_distance[arc_id];
        
        // Convert to travel time in seconds, then to milliseconds
        // time_sec = distance_m / (speed_kmh * 1000 / 3600) = distance_m * 3600 / (speed_kmh * 1000)
        if (speed_kmh > 0 && distance_m > 0) {
            // Calculate time in seconds first to avoid overflow
            unsigned long long time_seconds = (static_cast<unsigned long long>(distance_m) * 3600ULL) / (static_cast<unsigned long long>(speed_kmh) * 1000ULL);
            
            // Cap at 24 hours (86400 seconds) per arc - anything longer is unrealistic for routing
            const unsigned long long MAX_ARC_TIME_SECONDS = 86400ULL;  // 24 hours
            if (time_seconds > MAX_ARC_TIME_SECONDS) {
                time_seconds = MAX_ARC_TIME_SECONDS;
            }
            
            // Convert to milliseconds
            unsigned long long time_ms = time_seconds * 1000ULL;
            travel_time[arc_id] = static_cast<unsigned>(time_ms);
        } else {
            travel_time[arc_id] = RoutingKit::inf_weight;
        }
    }
    
    LOG("Travel time calculation completed successfully");
    
    // Add statistics about travel times
    unsigned min_time = std::numeric_limits<unsigned>::max();
    unsigned max_time = 0;
    unsigned inf_count = 0;
    unsigned zero_count = 0;
    
    for (unsigned arc_id = 0; arc_id < graph_.arc_count(); ++arc_id) {
        unsigned time = travel_time[arc_id];
        if (time == RoutingKit::inf_weight) {
            inf_count++;
        } else if (time == 0) {
            zero_count++;
        } else {
            min_time = std::min(min_time, time);
            max_time = std::max(max_time, time);
        }
    }
    
    LOG("Travel time statistics: min=" << min_time << "ms, max=" << max_time << "ms, inf_count=" << inf_count << ", zero_count=" << zero_count);
    
    LOG("Building/loading contraction hierarchies...");
    
    try {
        // Build the tail array from the first_out array
        LOG("Building tail array...");
        auto tail = RoutingKit::invert_inverse_vector(graph_.first_out);
        LOG("Tail array built successfully");
        
        // Try to load pre-built CH, or build it if not available
        if (std::filesystem::exists(ch_file_path)) {
            LOG("Loading pre-built contraction hierarchy from: " << ch_file_path);
            MemoryStats mem_before_ch_load = MemoryStats::get_current();
            ch_geo_ = std::make_unique<RoutingKit::ContractionHierarchy>(
                RoutingKit::ContractionHierarchy::load_file(ch_file_path)
            );
            MemoryStats mem_after_ch_load = MemoryStats::get_current();
            LOG("Contraction hierarchy loaded successfully");
            LOG("Memory before CH load: RSS=" << mem_before_ch_load.format() << ", Peak=" << mem_before_ch_load.format_peak());
            LOG("Memory after CH load: RSS=" << mem_after_ch_load.format() << ", Peak=" << mem_after_ch_load.format_peak());
        } else {
            LOG("CH file not found: " << ch_file_path << ", building instead...");
            // Build contraction hierarchy for geo distance
            LOG("Building contraction hierarchy for geo distance...");
            MemoryStats mem_before_ch_build = MemoryStats::get_current();
            ch_geo_ = std::make_unique<RoutingKit::ContractionHierarchy>(
                RoutingKit::ContractionHierarchy::build(
                    graph_.node_count(),
                    tail, graph_.head,
                    graph_.geo_distance
                )
            );
            MemoryStats mem_after_ch_build = MemoryStats::get_current();
            LOG("Geo distance contraction hierarchy built successfully");
            LOG("Memory before CH build: RSS=" << mem_before_ch_build.format() << ", Peak=" << mem_before_ch_build.format_peak());
            LOG("Memory after CH build: RSS=" << mem_after_ch_build.format() << ", Peak=" << mem_after_ch_build.format_peak());
            
            // Save the CH to disk for future use
            LOG("Saving contraction hierarchy to: " << ch_file_path);
            try {
                // Ensure parent directory exists
                std::filesystem::path ch_path_obj(ch_file_path);
                if (ch_path_obj.has_parent_path()) {
                    std::filesystem::create_directories(ch_path_obj.parent_path());
                }
                ch_geo_->save_file(ch_file_path);
                LOG("Contraction hierarchy saved successfully");
            } catch (const std::exception& e) {
                LOG("Warning: Failed to save contraction hierarchy: " << e.what());
                // Don't fail the entire initialization if saving fails
            }
        }
        
        // Build contraction hierarchy for travel time
        LOG("Skipping travel time contraction hierarchy for now due to crash");
        // TODO: Fix travel time CH building crash
        /*
        LOG("Building contraction hierarchy for travel time...");
        ch_ = std::make_unique<RoutingKit::ContractionHierarchy>(
            RoutingKit::ContractionHierarchy::build(
                graph_.node_count(),
                tail, graph_.head,
                travel_time
            )
        );
        LOG("Travel time contraction hierarchy built successfully");
        */
        
        LOG("Contraction hierarchies built");
    } catch (const std::exception& e) {
        LOG("Error building contraction hierarchies: " << e.what());
        throw;
    } catch (...) {
        LOG("Unknown error building contraction hierarchies");
        throw;
    }
    
    // Create the geo position mapping
    pos_to_node_ = std::make_unique<RoutingKit::GeoPositionToNode>(
        graph_.latitude, graph_.longitude
    );
    
    MemoryStats mem_final = MemoryStats::get_current();
    LOG("Routing engine initialization complete");
    LOG("Final memory: RSS=" << mem_final.format() << ", Peak=" << mem_final.format_peak());
}

unsigned RoutingEngine::findNearestNode(double latitude, double longitude, unsigned max_radius) const {
    auto node = pos_to_node_->find_nearest_neighbor_within_radius(latitude, longitude, max_radius);
    return node.id;
}

RoutingResult RoutingEngine::computeShortestPath(unsigned from_node, unsigned to_node) const {
    RoutingResult result;
    result.source_node = from_node;
    result.target_node = to_node;
    result.success = false;
    
    // Check if both nodes are valid
    if (!isValidNode(from_node) || !isValidNode(to_node)) {
        LOG("Invalid nodes: from=" << from_node << " (valid: " << isValidNode(from_node) << "), to=" << to_node << " (valid: " << isValidNode(to_node) << ")");
        result.total_travel_time_ms = RoutingKit::inf_weight;
        result.total_geo_distance_m = RoutingKit::inf_weight;
        return result;
    }
    
    // Special case: if source and target are the same node, return a successful single-node route
    if (from_node == to_node) {
        LOG("Same source and target node: " << from_node << ", returning single-node route");
        result.total_travel_time_ms = 0;
        result.total_geo_distance_m = 0;
        result.node_path = {from_node};
        result.arc_path = {}; // No arcs for single node
        result.query_time_us = 0;
        result.success = true;
        return result;
    }
    
    // Create query objects - only use geo distance for now since travel time CH crashes
    // RoutingKit::ContractionHierarchyQuery ch_query(*ch_);
    RoutingKit::ContractionHierarchyQuery ch_geo_query(*ch_geo_);
    
    // Compute the route
    long long start_time = RoutingKit::get_micro_time();
    // ch_query.reset().add_source(from_node).add_target(to_node).run();
    ch_geo_query.reset().add_source(from_node).add_target(to_node).run();
    
    // Use geo distance for both time and distance for now
    // result.total_travel_time_ms = ch_query.get_distance();
    result.total_geo_distance_m = ch_geo_query.get_distance();
    result.node_path = ch_geo_query.get_node_path();
    result.arc_path = ch_geo_query.get_arc_path();
    
    // Check if a path was found (use geo distance since we don't have travel time CH)
    result.success = result.total_geo_distance_m != RoutingKit::inf_weight && !result.node_path.empty();
    
    // Calculate travel time manually based on path and speeds
    if (result.total_geo_distance_m != RoutingKit::inf_weight && !result.arc_path.empty()) {
        // Use a very high speed limit (effectively no limit) to get natural travel times
        result.total_travel_time_ms = recalculateTotalTravelTime(result, 300); // 300 km/h max (effectively unlimited)
        LOG("Calculated travel time: " << result.total_travel_time_ms << " ms for " << result.arc_path.size() << " arcs");
    } else {
        result.total_travel_time_ms = result.total_geo_distance_m; // Fallback
        LOG("Using fallback travel time: " << result.total_travel_time_ms << " ms");
    }
    
    long long end_time = RoutingKit::get_micro_time();
    result.query_time_us = end_time - start_time;
    
    // No fallback needed - use computeShortestPathFromCoordinates for better handling
    return result;
}

RoutingResult RoutingEngine::computeShortestPathFromCoordinates(double from_lat, double from_lon, 
                                                                double to_lat, double to_lon) const {
    RoutingResult result;
    result.success = false;
    
    // Find nearest nodes
    unsigned from_node = findNearestNode(from_lat, from_lon);
    unsigned to_node = findNearestNode(to_lat, to_lon);
    
    if (from_node == RoutingKit::invalid_id || to_node == RoutingKit::invalid_id) {
        LOG("Failed to find nodes within range");
        result.total_travel_time_ms = RoutingKit::inf_weight;
        result.total_geo_distance_m = RoutingKit::inf_weight;
        return result;
    }
    
    // Get node coordinates
    double from_node_lat, from_node_lon, to_node_lat, to_node_lon;
    getNodeCoordinates(from_node, from_node_lat, from_node_lon);
    getNodeCoordinates(to_node, to_node_lat, to_node_lon);
    
    // Calculate walking distances (in meters)
    double start_walking_distance = haversineDistance(from_lat, from_lon, from_node_lat, from_node_lon);
    double end_walking_distance = haversineDistance(to_lat, to_lon, to_node_lat, to_node_lon);
    
    // Calculate walking times (6 km/h = 1.67 m/s)
    unsigned start_walking_time_ms = static_cast<unsigned>(start_walking_distance * 1000.0 / 1.67); // 6 km/h walking speed
    unsigned end_walking_time_ms = static_cast<unsigned>(end_walking_distance * 1000.0 / 1.67);
    
    result.source_node = from_node;
    result.target_node = to_node;
    
    // Special case: if both coordinates map to the same node
    if (from_node == to_node) {
        LOG("Start and end coordinates map to same node: " << from_node);
        result.total_travel_time_ms = start_walking_time_ms + end_walking_time_ms;
        result.total_geo_distance_m = static_cast<unsigned>(start_walking_distance + end_walking_distance);
        result.node_path = {from_node};
        result.arc_path = {};
        result.query_time_us = 0;
        result.success = true;
        
        // Store walking segment info for later processing
        result.start_walking_distance = start_walking_distance;
        result.end_walking_distance = end_walking_distance;
        result.start_lat = from_lat;
        result.start_lon = from_lon;
        result.end_lat = to_lat;
        result.end_lon = to_lon;
        return result;
    }
    
    // Compute route between nodes
    RoutingResult node_result = computeShortestPath(from_node, to_node);
    
    if (!node_result.success) {
        LOG("Failed to find route between nodes");
        return node_result;
    }
    
    // Combine walking times and distances with route
    result = node_result; // Copy all fields
    result.total_travel_time_ms += start_walking_time_ms + end_walking_time_ms;
    result.total_geo_distance_m += static_cast<unsigned>(start_walking_distance + end_walking_distance);
    
    // Store walking segment info for later processing
    result.start_walking_distance = start_walking_distance;
    result.end_walking_distance = end_walking_distance;
    result.start_lat = from_lat;
    result.start_lon = from_lon;
    result.end_lat = to_lat;
    result.end_lon = to_lon;
    
    LOG("Route with walking segments: start_walk=" << start_walking_distance << "m, end_walk=" << end_walking_distance << "m");
    
    return result;
}

void RoutingEngine::getNodeCoordinates(unsigned node_id, double& latitude, double& longitude) const {
    if (isValidNode(node_id)) {
        latitude = graph_.latitude[node_id];
        longitude = graph_.longitude[node_id];
    } else {
        latitude = 0.0;
        longitude = 0.0;
    }
}

std::vector<RoutePoint> RoutingEngine::processPathIntoPoints(const RoutingResult& result, 
                                                             std::optional<unsigned> max_speed_kmh) const {
    std::vector<RoutePoint> route_points;
    
    if (!result.success || result.node_path.empty()) {
        // If no path was found, just return empty vector
        return route_points;
    }
    
    // Check if we have walking segments
    bool has_start_walking = result.start_walking_distance > 0.0;
    bool has_end_walking = result.end_walking_distance > 0.0;
    
    // Add start walking segment if needed
    if (has_start_walking) {
        RoutePoint start_point;
        start_point.latitude = static_cast<float>(result.start_lat);
        start_point.longitude = static_cast<float>(result.start_lon);
        start_point.node_id = RoutingKit::invalid_id;
        start_point.time_ms = 0;
        start_point.distance_m = 0;
        start_point.max_speed_kmh = 6; // Walking speed
        start_point.is_walking_segment = true;
        route_points.push_back(start_point);
    }
    
    // If we only have a single node, add it 
    if (result.node_path.size() == 1) {
        RoutePoint node_point;
        node_point.node_id = result.node_path[0];
        double lat, lon;
        getNodeCoordinates(node_point.node_id, lat, lon);
        node_point.latitude = static_cast<float>(lat);
        node_point.longitude = static_cast<float>(lon);
        
        if (has_start_walking) {
            // Time and distance to walk to this node
            node_point.time_ms = static_cast<unsigned>(result.start_walking_distance * 1000.0 / 1.67);
            node_point.distance_m = static_cast<unsigned>(result.start_walking_distance);
        } else {
            node_point.time_ms = 0;
            node_point.distance_m = 0;
        }
        node_point.max_speed_kmh = 6; // Walking speed to reach this node
        node_point.is_walking_segment = false;
        route_points.push_back(node_point);
        
        // Add end walking segment if needed
        if (has_end_walking) {
            RoutePoint end_point;
            end_point.latitude = static_cast<float>(result.end_lat);
            end_point.longitude = static_cast<float>(result.end_lon);
            end_point.node_id = RoutingKit::invalid_id;
            end_point.time_ms = node_point.time_ms + static_cast<unsigned>(result.end_walking_distance * 1000.0 / 1.67);
            end_point.distance_m = node_point.distance_m + static_cast<unsigned>(result.end_walking_distance);
            end_point.max_speed_kmh = 6; // Walking speed
            end_point.is_walking_segment = true;
            route_points.push_back(end_point);
        }
        
        return route_points;
    }
    
    // Calculate cumulative travel times and distances for the route between nodes
    std::vector<unsigned> cumulative_times(result.node_path.size(), 0);
    std::vector<unsigned> cumulative_distances(result.node_path.size(), 0);
    std::vector<unsigned> arc_speeds(result.arc_path.size());
    
    // Start with walking time/distance if needed
    unsigned start_walking_time = has_start_walking ? static_cast<unsigned>(result.start_walking_distance * 1000.0 / 1.67) : 0;
    unsigned start_walking_dist = has_start_walking ? static_cast<unsigned>(result.start_walking_distance) : 0;
    
    cumulative_times[0] = start_walking_time;
    cumulative_distances[0] = start_walking_dist;
    
    // Add up travel times and distances for each arc
    for (size_t i = 0; i < result.arc_path.size(); ++i) {
        const auto arc_id = result.arc_path[i];
        unsigned way_id = graph_.way[arc_id];
        unsigned original_speed_kmh = way_speed_[way_id];
        unsigned distance_m = graph_.geo_distance[arc_id];
        
        // Apply maximum speed limit if specified
        unsigned effective_speed_kmh = original_speed_kmh;
        if (max_speed_kmh.has_value()) {
            effective_speed_kmh = std::min(original_speed_kmh, max_speed_kmh.value());
        }
        
        // Store the effective speed for this arc
        arc_speeds[i] = effective_speed_kmh;
        
        // Calculate travel time for this arc with effective speed
        unsigned arc_time_ms = 0;
        if (effective_speed_kmh > 0) {
            arc_time_ms = (distance_m * 3600ULL * 1000ULL) / (effective_speed_kmh * 1000ULL);
        }
        
        cumulative_times[i + 1] = cumulative_times[i] + arc_time_ms;
        cumulative_distances[i + 1] = cumulative_distances[i] + distance_m;
    }
    
    // Create route points with coordinates, travel times, distances, and speeds
    for (size_t i = 0; i < result.node_path.size(); ++i) {
        RoutePoint point;
        point.node_id = result.node_path[i];
        double lat, lon;
        getNodeCoordinates(point.node_id, lat, lon);
        point.latitude = static_cast<float>(lat);
        point.longitude = static_cast<float>(lon);
        point.time_ms = cumulative_times[i];
        point.distance_m = cumulative_distances[i];
        point.is_walking_segment = false;
        
        // For the first node, use walking speed if we have a walking segment, otherwise 0
        // For subsequent nodes, use the speed of the arc that leads to this node
        if (i == 0) {
            point.max_speed_kmh = has_start_walking ? 6 : 0; // Walking speed if walking segment
        } else {
            point.max_speed_kmh = arc_speeds[i - 1]; // Speed of arc leading to this node
        }
        
        route_points.push_back(point);
    }
    
    // Add end walking segment if needed
    if (has_end_walking) {
        RoutePoint end_point;
        end_point.latitude = static_cast<float>(result.end_lat);
        end_point.longitude = static_cast<float>(result.end_lon);
        end_point.node_id = RoutingKit::invalid_id;
        
        // Add walking time and distance to the last node's cumulative values
        unsigned last_time = cumulative_times[result.node_path.size() - 1];
        unsigned last_dist = cumulative_distances[result.node_path.size() - 1];
        end_point.time_ms = last_time + static_cast<unsigned>(result.end_walking_distance * 1000.0 / 1.67);
        end_point.distance_m = last_dist + static_cast<unsigned>(result.end_walking_distance);
        end_point.max_speed_kmh = 6; // Walking speed
        end_point.is_walking_segment = true;
        route_points.push_back(end_point);
    }
    
    return route_points;
}

bool RoutingEngine::isValidNode(unsigned node_id) const {
    return node_id < graph_.node_count() && node_id != RoutingKit::invalid_id;
}

unsigned RoutingEngine::getNodeCount() const {
    return graph_.node_count();
}

unsigned RoutingEngine::getArcCount() const {
    return graph_.arc_count();
}

unsigned RoutingEngine::getAddressCount() const {
    return addresses_.size();
}

bool RoutingEngine::loadAddressesFromCSV(const std::string& csv_file) {
    LOG("Loading addresses from " << csv_file);
    
    addresses_.clear();
    std::vector<float> lat_vec, lon_vec;
    
    if (ends_with(csv_file, ".gz")) {
        // Handle gzipped files using zcat
        std::string cmd = "zcat " + csv_file;
        FILE* pipe = popen(cmd.c_str(), "r");
        if (!pipe) {
            LOG("Error opening pipe to zcat");
            return false;
        }
        
        char buffer[4096];
        size_t line_count = 0;
        
        // Skip header if present (first line starting with non-digit)
        if (fgets(buffer, sizeof(buffer), pipe)) {
            std::string first_line(buffer);
            if (!first_line.empty() && !std::isdigit(first_line[0])) {
                LOG("Skipping header: " << first_line);
            } else {
                processAddressLine(first_line, addresses_, lat_vec, lon_vec);
                line_count++;
            }
        }
        
        // Process remaining lines
        while (fgets(buffer, sizeof(buffer), pipe)) {
            processAddressLine(buffer, addresses_, lat_vec, lon_vec);
            line_count++;
        }
        
        pclose(pipe);
        LOG("Processed " << line_count << " lines from gzipped file");
    } else {
        // Regular file
        std::ifstream in_file(csv_file);
        if (!in_file) {
            LOG("Failed to open address file: " << csv_file);
            return false;
        }
        
        std::string line;
        size_t line_count = 0;
        
        // Skip header if present (first line starting with non-digit)
        if (std::getline(in_file, line)) {
            if (!line.empty() && !std::isdigit(line[0])) {
                LOG("Skipping header: " << line);
            } else {
                processAddressLine(line, addresses_, lat_vec, lon_vec);
                line_count++;
            }
        }
        
        // Process remaining lines
        while (std::getline(in_file, line)) {
            processAddressLine(line, addresses_, lat_vec, lon_vec);
            line_count++;
        }
        
        LOG("Processed " << line_count << " lines from file");
    }
    
    // Build spatial index if we have addresses
    if (!addresses_.empty()) {
        addr_index_ = std::make_unique<RoutingKit::GeoPositionToNode>(lat_vec, lon_vec);
        LOG("Loaded " << addresses_.size() << " addresses");
        return true;
    } else {
        LOG("No addresses loaded");
        return false;
    }
}

Address RoutingEngine::findNearestAddress(double latitude, double longitude, float max_radius) const {
    Address result;
    
    // Check if we have addresses loaded
    if (addresses_.empty() || !addr_index_) {
        LOG("No addresses loaded");
        return result;
    }
    
    // Find the nearest address
    auto nearest = addr_index_->find_nearest_neighbor_within_radius(
        latitude, longitude, max_radius
    );
    
    if (nearest.id != RoutingKit::invalid_id && nearest.id < addresses_.size()) {
        return addresses_[nearest.id];
    }
    
    // Return an empty address if none found
    return result;
}

std::optional<Address> RoutingEngine::getClosestAddress(double latitude, double longitude) const {
    // Check if we have addresses loaded
    if (addresses_.empty() || !addr_index_) {
        LOG("No addresses loaded");
        return std::nullopt;
    }
    
    // Use a large radius to make sure we find something
    constexpr float MAX_SEARCH_RADIUS = 5000.0f;  // 5km radius
    
    // Find the nearest address
    auto nearest = addr_index_->find_nearest_neighbor_within_radius(
        latitude, longitude, MAX_SEARCH_RADIUS
    );
    
    if (nearest.id != RoutingKit::invalid_id && nearest.id < addresses_.size()) {
        return addresses_[nearest.id];
    }
    
    // Return nullopt if no address found within radius
    return std::nullopt;
}

Address RoutingEngine::getRandomAddress(std::optional<unsigned> seed) const {
    // Check if we have addresses loaded
    if (addresses_.empty()) {
        LOG("No addresses loaded");
        return Address();
    }
    
    // Initialize random generator with seed if provided
    std::mt19937 gen;
    if (seed) {
        gen.seed(*seed);
    } else {
        std::random_device rd;
        gen.seed(rd());
    }
    
    // Generate a random index
    std::uniform_int_distribution<unsigned> dist(0, addresses_.size() - 1);
    unsigned index = dist(gen);
    
    return addresses_[index];
}

Address RoutingEngine::getRandomAddressInAnnulus(double center_lat, double center_lon, 
                                               float r_min, float r_max,
                                               std::optional<unsigned> seed) const {
    // Check if we have addresses loaded
    if (addresses_.empty() || !addr_index_) {
        LOG("No addresses loaded");
        return Address();
    }
    
    // Initialize random generator with seed if provided
    std::mt19937 gen;
    if (seed) {
        gen.seed(*seed);
    } else {
        std::random_device rd;
        gen.seed(rd());
    }
    
    // Use r_max as the search radius to find a nearby address
    // We're ignoring the annulus requirements as requested
    auto [rand_lat, rand_lon] = generateAnnulusPoint(center_lat, center_lon, r_min, r_max, gen);
    
    // Find the nearest address to this random point
    auto nearest = addr_index_->find_nearest_neighbor_within_radius(
        rand_lat, rand_lon, 1.5f * r_max
    );
    
    if (nearest.id != RoutingKit::invalid_id && nearest.id < addresses_.size()) {
        return addresses_[nearest.id];
    }
    
    // If no address found, try another random point (up to 5 attempts)
    for (int i = 0; i < 4; ++i) {
        auto [retry_lat, retry_lon] = generateAnnulusPoint(center_lat, center_lon, r_min, r_max, gen);
        
        nearest = addr_index_->find_nearest_neighbor_within_radius(
            retry_lat, retry_lon, 1.5f * r_max
        );
        
        if (nearest.id != RoutingKit::invalid_id && nearest.id < addresses_.size()) {
            return addresses_[nearest.id];
        }
    }
    
    // If all attempts failed, return a random address
    return getRandomAddress(seed);
}

std::pair<double, double> RoutingEngine::generateAnnulusPoint(
    double center_lat, double center_lon, float r_min, float r_max, std::mt19937& gen) const {
    
    // Polar coordinate sampling with Earth curvature compensation
    std::uniform_real_distribution<float> theta_dist(0, 2 * M_PI);
    std::uniform_real_distribution<float> r_squared_dist(r_min * r_min, r_max * r_max);
    
    float theta = theta_dist(gen);
    float r = std::sqrt(r_squared_dist(gen));
    
    double lat = center_lat + (r * std::sin(theta)) / METER_PER_DEGREE;
    double lon = center_lon + (r * std::cos(theta)) / (METER_PER_DEGREE * std::cos(toRadians(center_lat)));
    
    return {lat, lon};
}

double RoutingEngine::haversineDistance(double lat1, double lon1, double lat2, double lon2) {
    // Convert to radians
    lat1 = toRadians(lat1);
    lon1 = toRadians(lon1);
    lat2 = toRadians(lat2);
    lon2 = toRadians(lon2);
    
    // Haversine formula
    double dLat = lat2 - lat1;
    double dLon = lon2 - lon1;
    
    double a = std::sin(dLat/2) * std::sin(dLat/2) +
               std::cos(lat1) * std::cos(lat2) * 
               std::sin(dLon/2) * std::sin(dLon/2);
    
    double c = 2 * std::atan2(std::sqrt(a), std::sqrt(1-a));
    
    // Earth radius in meters
    const double R = 6371000.0;
    
    return R * c;
}

unsigned RoutingEngine::recalculateTotalTravelTime(const RoutingResult& result, unsigned max_speed_kmh) const {
    if (!result.success || result.arc_path.empty()) {
        LOG("recalculateTotalTravelTime: returning 0 due to !success or empty arc_path");
        return 0;
    }
    
    unsigned total_time_ms = 0;
    LOG("recalculateTotalTravelTime: processing " << result.arc_path.size() << " arcs with max_speed=" << max_speed_kmh);
    
    // Add walking segment times first (these are not affected by maxSpeed)
    unsigned start_walking_time_ms = 0;
    unsigned end_walking_time_ms = 0;
    
    if (result.start_walking_distance > 0.0) {
        start_walking_time_ms = static_cast<unsigned>(result.start_walking_distance * 1000.0 / 1.67); // 6 km/h walking speed
        total_time_ms += start_walking_time_ms;
        LOG("Adding start walking time: " << start_walking_time_ms << "ms");
    }
    
    if (result.end_walking_distance > 0.0) {
        end_walking_time_ms = static_cast<unsigned>(result.end_walking_distance * 1000.0 / 1.67); // 6 km/h walking speed
        total_time_ms += end_walking_time_ms;
        LOG("Adding end walking time: " << end_walking_time_ms << "ms");
    }
    
    // Add road segment times with maxSpeed applied
    for (size_t i = 0; i < result.arc_path.size(); ++i) {
        const auto arc_id = result.arc_path[i];
        unsigned way_id = graph_.way[arc_id];
        unsigned original_speed_kmh = way_speed_[way_id];
        unsigned distance_m = graph_.geo_distance[arc_id];
        
        // Apply maximum speed limit
        unsigned effective_speed_kmh = std::min(original_speed_kmh, max_speed_kmh);
        
        // Calculate travel time for this arc with effective speed
        if (effective_speed_kmh > 0) {
            unsigned arc_time_ms = (distance_m * 3600ULL * 1000ULL) / (effective_speed_kmh * 1000ULL);
            total_time_ms += arc_time_ms;
            if (i < 3) { // Log first few arcs for debugging
                LOG("Arc " << i << ": distance=" << distance_m << "m, original_speed=" << original_speed_kmh << ", effective_speed=" << effective_speed_kmh << ", time=" << arc_time_ms << "ms");
            }
        } else {
            if (i < 3) {
                LOG("Arc " << i << ": distance=" << distance_m << "m, speed=0, skipping");
            }
        }
    }
    
    LOG("recalculateTotalTravelTime: total=" << total_time_ms << "ms (including walking: start=" << start_walking_time_ms << "ms, end=" << end_walking_time_ms << "ms)");
    return total_time_ms;
}

std::optional<RoutingEngine::AddressBbox> RoutingEngine::getAddressBbox() const {
    // Check if we have addresses loaded
    if (addresses_.empty()) {
        LOG("No addresses loaded for bbox calculation");
        return std::nullopt;
    }
    
    AddressBbox bbox;
    bbox.min_lat = addresses_[0].latitude;
    bbox.max_lat = addresses_[0].latitude;
    bbox.min_lon = addresses_[0].longitude;
    bbox.max_lon = addresses_[0].longitude;
    
    // Find min/max coordinates
    for (const auto& addr : addresses_) {
        bbox.min_lat = std::min(bbox.min_lat, addr.latitude);
        bbox.max_lat = std::max(bbox.max_lat, addr.latitude);
        bbox.min_lon = std::min(bbox.min_lon, addr.longitude);
        bbox.max_lon = std::max(bbox.max_lon, addr.longitude);
    }
    
    LOG("Address bbox: lat[" << bbox.min_lat << ", " << bbox.max_lat << "], lon[" << bbox.min_lon << ", " << bbox.max_lon << "]");
    return bbox;
}

std::vector<Address> RoutingEngine::getAddressSample(unsigned number, unsigned seed, 
                                                     unsigned page_size, unsigned page_num) const {
    std::vector<Address> result;
    
    // Check if we have addresses loaded
    if (addresses_.empty()) {
        LOG("No addresses loaded for sampling");
        return result;
    }
    
    // Initialize random generator with seed
    std::mt19937 gen(seed);
    
    // Calculate the actual sample size we need
    unsigned start_index = page_num * page_size;
    unsigned end_index = std::min(start_index + page_size, number);
    
    if (start_index >= number) {
        LOG("Page out of range: start_index=" << start_index << ", number=" << number);
        return result;
    }
    
    // Generate a shuffled list of indices for reproducible random sampling
    std::vector<unsigned> indices(addresses_.size());
    std::iota(indices.begin(), indices.end(), 0);
    std::shuffle(indices.begin(), indices.end(), gen);
    
    // Take only the number of indices we need
    if (number < indices.size()) {
        indices.resize(number);
    }
    
    // Sort the indices to make pagination consistent
    std::sort(indices.begin(), indices.end());
    
    // Extract the page we want
    for (unsigned i = start_index; i < end_index && i < indices.size(); ++i) {
        result.push_back(addresses_[indices[i]]);
    }
    
    LOG("Address sample: requested=" << number << ", seed=" << seed << ", page_size=" << page_size 
        << ", page_num=" << page_num << ", returned=" << result.size());
    
    return result;
}

std::optional<Address> RoutingEngine::getUniformRandomAddressInAnnulus(double center_lat, double center_lon, 
                                                                         float min_distance_km, float max_distance_km,
                                                                         unsigned seed) const {
    // Check if we have addresses loaded
    if (addresses_.empty() || !addr_index_) {
        LOG("No addresses loaded for uniform annulus sampling");
        return std::nullopt;
    }
    
    // Convert distances from kilometers to meters
    float min_distance_m = min_distance_km * 1000.0f;
    float max_distance_m = max_distance_km * 1000.0f;
    
    // Validate inputs
    if (min_distance_m < 0.0f || max_distance_m <= min_distance_m) {
        LOG("Invalid distance parameters: min_distance=" << min_distance_m << "m, max_distance=" << max_distance_m << "m");
        return std::nullopt;
    }
    
    // Find all addresses within max_distance
    auto candidates = addr_index_->find_all_nodes_within_radius(
        static_cast<float>(center_lat), 
        static_cast<float>(center_lon), 
        max_distance_m
    );
    
    // Filter to only those >= min_distance
    std::vector<unsigned> valid_indices;
    for (const auto& candidate : candidates) {
        if (candidate.distance >= min_distance_m && candidate.id < addresses_.size()) {
            valid_indices.push_back(candidate.id);
        }
    }
    
    if (valid_indices.empty()) {
        LOG("No addresses found in annulus: center=(" << center_lat << "," << center_lon 
            << "), min_dist=" << min_distance_km << "km, max_dist=" << max_distance_km << "km");
        return std::nullopt;
    }
    
    // Uniformly sample one address using the seed
    std::mt19937 gen(seed);
    std::uniform_int_distribution<size_t> dist(0, valid_indices.size() - 1);
    size_t selected_index = dist(gen);
    
    LOG("Uniform annulus sampling: found " << valid_indices.size() << " candidates, selected index " 
        << selected_index << " (address id " << valid_indices[selected_index] << ")");
    
    return addresses_[valid_indices[selected_index]];
}

} // namespace RoutingServer 