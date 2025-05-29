#include "../include/RoutingEngine.h"
#include "../include/Logger.h"
#include <routingkit/timer.h>
#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>

namespace RoutingServer {

// Helper to check if string ends with a suffix (replacement for C++20's ends_with)
inline bool ends_with(const std::string& str, const std::string& suffix) {
    return str.size() >= suffix.size() && 
           str.compare(str.size() - suffix.size(), suffix.size(), suffix) == 0;
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
    // Load the graph from the OSM file
    graph_ = RoutingKit::simple_load_osm_car_routing_graph_from_pbf(osm_file);
    
    // Build the tail array from the first_out array
    auto tail = RoutingKit::invert_inverse_vector(graph_.first_out);
    
    // Build the contraction hierarchy
    ch_ = std::make_unique<RoutingKit::ContractionHierarchy>(
        RoutingKit::ContractionHierarchy::build(
            graph_.node_count(),
            tail, graph_.head,
            graph_.travel_time
        )
    );
    
    // Create the geo position mapping
    pos_to_node_ = std::make_unique<RoutingKit::GeoPositionToNode>(
        graph_.latitude, graph_.longitude
    );
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
        return result;
    }
    
    // Create a query object
    RoutingKit::ContractionHierarchyQuery ch_query(*ch_);
    
    // Compute the route
    long long start_time = RoutingKit::get_micro_time();
    ch_query.reset().add_source(from_node).add_target(to_node).run();
    
    result.total_travel_time_ms = ch_query.get_distance();
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
    
    // If we only have a single node, add it with zero travel time
    if (result.node_path.size() == 1) {
        RoutePoint point;
        point.node_id = result.node_path[0];
        getNodeCoordinates(point.node_id, point.latitude, point.longitude);
        point.time_ms = 0;
        route_points.push_back(point);
        return route_points;
    }
    
    // Calculate cumulative travel times
    std::vector<unsigned> cumulative_times(result.node_path.size(), 0);
    cumulative_times[0] = 0; // First node is always at time 0
    
    // Add up travel times for each arc
    for (size_t i = 0; i < result.arc_path.size(); ++i) {
        const auto arc_id = result.arc_path[i];
        cumulative_times[i + 1] = cumulative_times[i] + graph_.travel_time[arc_id];
    }
    
    // Create route points with coordinates and travel times
    for (size_t i = 0; i < result.node_path.size(); ++i) {
        RoutePoint point;
        point.node_id = result.node_path[i];
        getNodeCoordinates(point.node_id, point.latitude, point.longitude);
        point.time_ms = cumulative_times[i];
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