#include "../include/RoutingEngine.h"
#include "../include/Logger.h"
#include <routingkit/timer.h>
#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <cstring>

namespace RoutingServer {

// Helper to check if string ends with a suffix (replacement for C++20's ends_with)
inline bool ends_with(const std::string& str, const std::string& suffix) {
    return str.size() >= suffix.size() && 
           str.compare(str.size() - suffix.size(), suffix.size(), suffix) == 0;
}

// Custom profile implementation - allows access to all road types
bool is_osm_way_used_by_custom_profile(uint64_t osm_way_id, const RoutingKit::TagMap& tags, 
                                       std::function<void(const std::string&)> log_message) {
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
    
    // Additionally check for other path types that might be useful
    const char* highway_value = tags["highway"];
    if (highway_value != nullptr && (
        strcmp(highway_value, "path") == 0 ||
        strcmp(highway_value, "footway") == 0 ||
        strcmp(highway_value, "cycleway") == 0 ||
        strcmp(highway_value, "pedestrian") == 0 ||
        strcmp(highway_value, "steps") == 0 ||
        strcmp(highway_value, "bridleway") == 0 ||
        strcmp(highway_value, "track") == 0)) {
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
        if (strcmp(highway_value, "path") == 0 || 
            strcmp(highway_value, "footway") == 0 || 
            strcmp(highway_value, "cycleway") == 0 || 
            strcmp(highway_value, "pedestrian") == 0) {
            // Cap speed at 20 km/h for shared infrastructure
            return std::min(standard_speed, 20u);
        } else if (strcmp(highway_value, "steps") == 0) {
            // Very slow traversal of steps
            return 5u;
        } else if (strcmp(highway_value, "bridleway") == 0 || 
                   strcmp(highway_value, "track") == 0) {
            // Moderate speed for tracks and bridleways
            return std::min(standard_speed, 30u);
        }
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

RoutingEngine::RoutingEngine(const std::string& osm_file) {
    LOG("Loading OSM routing graph with custom profile...");
    
    // Load the ID mapping with our custom profile
    auto mapping = RoutingKit::load_osm_id_mapping_from_pbf(
        osm_file,
        nullptr, // No special routing nodes
        [](uint64_t osm_way_id, const RoutingKit::TagMap& tags) {
            return is_osm_way_used_by_custom_profile(osm_way_id, tags);
        },
        [](const std::string& msg) { LOG(msg); }
    );
    
    LOG("ID mapping loaded, " << mapping.is_routing_way.population_count() << " routing ways found");
    
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
    
    // Build travel time array from geo_distance and way speeds
    std::vector<unsigned> travel_time(graph_.arc_count());
    for (unsigned arc_id = 0; arc_id < graph_.arc_count(); ++arc_id) {
        unsigned way_id = graph_.way[arc_id];
        unsigned speed_kmh = way_speed_[way_id];
        unsigned distance_m = graph_.geo_distance[arc_id];
        
        // Convert to travel time in milliseconds: (distance_m / speed_kmh) * 3600 * 1000
        if (speed_kmh > 0) {
            travel_time[arc_id] = (distance_m * 3600ULL * 1000ULL) / (speed_kmh * 1000ULL);
        } else {
            travel_time[arc_id] = RoutingKit::inf_weight;
        }
    }
    
    LOG("Building contraction hierarchies...");
    
    // Build the tail array from the first_out array
    auto tail = RoutingKit::invert_inverse_vector(graph_.first_out);
    
    // Build contraction hierarchy for travel time
    ch_ = std::make_unique<RoutingKit::ContractionHierarchy>(
        RoutingKit::ContractionHierarchy::build(
            graph_.node_count(),
            tail, graph_.head,
            travel_time
        )
    );
    
    // Build contraction hierarchy for geo distance
    ch_geo_ = std::make_unique<RoutingKit::ContractionHierarchy>(
        RoutingKit::ContractionHierarchy::build(
            graph_.node_count(),
            tail, graph_.head,
            graph_.geo_distance
        )
    );
    
    LOG("Contraction hierarchies built");
    
    // Create the geo position mapping
    pos_to_node_ = std::make_unique<RoutingKit::GeoPositionToNode>(
        graph_.latitude, graph_.longitude
    );
    
    LOG("Routing engine initialization complete");
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
        result.total_travel_time_ms = RoutingKit::inf_weight;
        result.total_geo_distance_m = RoutingKit::inf_weight;
        return result;
    }
    
    // Create query objects for both time and distance
    RoutingKit::ContractionHierarchyQuery ch_query(*ch_);
    RoutingKit::ContractionHierarchyQuery ch_geo_query(*ch_geo_);
    
    // Compute the route
    long long start_time = RoutingKit::get_micro_time();
    ch_query.reset().add_source(from_node).add_target(to_node).run();
    ch_geo_query.reset().add_source(from_node).add_target(to_node).run();
    
    result.total_travel_time_ms = ch_query.get_distance();
    result.total_geo_distance_m = ch_geo_query.get_distance();
    result.node_path = ch_query.get_node_path();
    result.arc_path = ch_query.get_arc_path();
    long long end_time = RoutingKit::get_micro_time();
    result.query_time_us = end_time - start_time;
    
    // Check if a path was found
    result.success = result.total_travel_time_ms != RoutingKit::inf_weight && !result.node_path.empty();
    
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

std::vector<RoutePoint> RoutingEngine::processPathIntoPoints(const RoutingResult& result) const {
    std::vector<RoutePoint> route_points;
    
    if (!result.success || result.node_path.empty()) {
        // If no path was found, just return empty vector
        return route_points;
    }
    
    // If we only have a single node, add it with zero travel time and distance
    if (result.node_path.size() == 1) {
        RoutePoint point;
        point.node_id = result.node_path[0];
        double lat, lon;
        getNodeCoordinates(point.node_id, lat, lon);
        point.latitude = static_cast<float>(lat);
        point.longitude = static_cast<float>(lon);
        point.time_ms = 0;
        point.distance_m = 0;
        route_points.push_back(point);
        return route_points;
    }
    
    // Calculate cumulative travel times and distances
    std::vector<unsigned> cumulative_times(result.node_path.size(), 0);
    std::vector<unsigned> cumulative_distances(result.node_path.size(), 0);
    cumulative_times[0] = 0; // First node is always at time 0
    cumulative_distances[0] = 0; // First node is always at distance 0
    
    // Add up travel times and distances for each arc
    for (size_t i = 0; i < result.arc_path.size(); ++i) {
        const auto arc_id = result.arc_path[i];
        unsigned way_id = graph_.way[arc_id];
        unsigned speed_kmh = way_speed_[way_id];
        unsigned distance_m = graph_.geo_distance[arc_id];
        
        // Calculate travel time for this arc
        unsigned arc_time_ms = 0;
        if (speed_kmh > 0) {
            arc_time_ms = (distance_m * 3600ULL * 1000ULL) / (speed_kmh * 1000ULL);
        }
        
        cumulative_times[i + 1] = cumulative_times[i] + arc_time_ms;
        cumulative_distances[i + 1] = cumulative_distances[i] + distance_m;
    }
    
    // Create route points with coordinates, travel times, and distances
    for (size_t i = 0; i < result.node_path.size(); ++i) {
        RoutePoint point;
        point.node_id = result.node_path[i];
        double lat, lon;
        getNodeCoordinates(point.node_id, lat, lon);
        point.latitude = static_cast<float>(lat);
        point.longitude = static_cast<float>(lon);
        point.time_ms = cumulative_times[i];
        point.distance_m = cumulative_distances[i];
        route_points.push_back(point);
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

} // namespace RoutingServer 