#pragma once

#include <routingkit/osm_graph_builder.h>
#include <routingkit/osm_profile.h>
#include <routingkit/contraction_hierarchy.h>
#include <routingkit/inverse_vector.h>
#include <routingkit/geo_position_to_node.h>
#include <crow/json.h>
#include <string>
#include <vector>
#include <memory>
#include <random>
#include <cmath>
#include <optional>
#include <functional>

namespace RoutingServer {

// Results from a routing query
struct RoutingResult {
    unsigned source_node;
    unsigned target_node;
    unsigned total_travel_time_ms;
    unsigned total_geo_distance_m;
    std::vector<unsigned> node_path;
    std::vector<unsigned> arc_path;
    long long query_time_us;
    bool success;
    
    // Walking segment information (for exact coordinate routing)
    double start_walking_distance = 0.0;
    double end_walking_distance = 0.0;
    double start_lat = 0.0;
    double start_lon = 0.0;
    double end_lat = 0.0;
    double end_lon = 0.0;
};

// Point on the route with travel time and distance
struct RoutePoint {
    float latitude;
    float longitude;
    unsigned node_id; // Will be RoutingKit::invalid_id for walking segments
    unsigned time_ms;
    unsigned distance_m;
    unsigned max_speed_kmh; // Maximum speed on the arc leading to this point (6 for walking)
    bool is_walking_segment; // True if this is a walking segment to/from exact coordinates
};

// Address information
struct Address {
    unsigned id;
    double latitude;
    double longitude;
    std::string street;
    std::string housenumber;
    std::string postcode;
    std::string city;
    
    // Convert to JSON representation
    crow::json::wvalue toJson() const {
        crow::json::wvalue json;
        json["id"] = id;
        json["lat"] = latitude;
        json["lon"] = longitude;
        json["street"] = street;
        json["house_number"] = housenumber;
        json["postcode"] = postcode;
        json["city"] = city;
        return json;
    }
};

// Custom routing profile functions
bool is_osm_way_used_by_custom_profile(uint64_t osm_way_id, const RoutingKit::TagMap& tags, 
                                       std::function<void(const std::string&)> log_message = nullptr);

unsigned get_custom_profile_speed(uint64_t osm_way_id, const RoutingKit::TagMap& tags,
                                  std::function<void(const std::string&)> log_message = nullptr);

RoutingKit::OSMWayDirectionCategory get_custom_profile_direction_category(uint64_t osm_way_id, const RoutingKit::TagMap& tags,
                                                                          std::function<void(const std::string&)> log_message = nullptr);

// Main routing engine class
class RoutingEngine {
public:
    // Initialize with OSM data file
    // Optionally provide path to pre-built contraction hierarchy file (for geo distance)
    explicit RoutingEngine(const std::string& osm_file, const std::string& ch_geo_file = "");
    
    // Load addresses from CSV file
    bool loadAddressesFromCSV(const std::string& csv_file);
    
    // Find nearest node to given coordinates
    unsigned findNearestNode(double latitude, double longitude, unsigned max_radius = 1000) const;
    
    // Find nearest address to given coordinates
    Address findNearestAddress(double latitude, double longitude, float max_radius = 1000.0f) const;
    
    // Get closest address to a coordinate (returns nullopt if none found)
    std::optional<Address> getClosestAddress(double latitude, double longitude) const;
    
    // Get a random address (with optional seed)
    Address getRandomAddress(std::optional<unsigned> seed = std::nullopt) const;
    
    // Get a random address in an annulus (with optional seed)
    Address getRandomAddressInAnnulus(double center_lat, double center_lon, 
                                      float r_min, float r_max, 
                                      std::optional<unsigned> seed = std::nullopt) const;
    
    // Compute shortest path between two nodes
    RoutingResult computeShortestPath(unsigned from_node, unsigned to_node) const;
    
    // Compute shortest path between two coordinates (includes walking segments)
    RoutingResult computeShortestPathFromCoordinates(double from_lat, double from_lon, 
                                                     double to_lat, double to_lon) const;
    
    // Recalculate total travel time with maximum speed limit applied
    unsigned recalculateTotalTravelTime(const RoutingResult& result, unsigned max_speed_kmh) const;

    // Get the latitude and longitude for a node
    void getNodeCoordinates(unsigned node_id, double& latitude, double& longitude) const;
    
    // Process the path into a sequence of route points with cumulative travel times and distances
    std::vector<RoutePoint> processPathIntoPoints(const RoutingResult& result, 
                                                   std::optional<unsigned> max_speed_kmh = std::nullopt) const;
    
    // Check if node ID is valid
    bool isValidNode(unsigned node_id) const;
    
    // Get graph node count
    unsigned getNodeCount() const;
    
    // Get graph arc count
    unsigned getArcCount() const;
    
    // Get address count
    unsigned getAddressCount() const;
    
    // Get bounding box of all addresses
    struct AddressBbox {
        double min_lat;
        double max_lat;
        double min_lon;
        double max_lon;
        
        crow::json::wvalue toJson() const {
            crow::json::wvalue json;
            json["min_lat"] = min_lat;
            json["max_lat"] = max_lat;
            json["min_lon"] = min_lon;
            json["max_lon"] = max_lon;
            return json;
        }
    };
    
    std::optional<AddressBbox> getAddressBbox() const;
    
    // Get a sample of addresses with pagination
    std::vector<Address> getAddressSample(unsigned number, unsigned seed, 
                                          unsigned page_size, unsigned page_num) const;
    
    // Get a uniformly random address in an annulus (ring between min and max distance)
    std::optional<Address> getUniformRandomAddressInAnnulus(double center_lat, double center_lon, 
                                                             float min_distance_km, float max_distance_km,
                                                             unsigned seed) const;

private:
    // Generate a point in an annulus
    std::pair<double, double> generateAnnulusPoint(double center_lat, double center_lon, 
                                                 float r_min, float r_max, 
                                                 std::mt19937& gen) const;
    
    // Calculate haversine distance between two coordinates (in meters)
    static double haversineDistance(double lat1, double lon1, double lat2, double lon2);
    
    // Convert degrees to radians
    static constexpr double toRadians(double degrees) { return degrees * M_PI / 180.0; }
    
    // Custom routing graph data
    RoutingKit::OSMRoutingGraph graph_;
    std::vector<unsigned> way_speed_;
    std::unique_ptr<RoutingKit::ContractionHierarchy> ch_;
    std::unique_ptr<RoutingKit::ContractionHierarchy> ch_geo_;
    std::unique_ptr<RoutingKit::GeoPositionToNode> pos_to_node_;
    
    // Address data
    std::vector<Address> addresses_;
    std::unique_ptr<RoutingKit::GeoPositionToNode> addr_index_;
    
    // Static earth-related constants
    static constexpr float METER_PER_DEGREE = 111111.0f; // Approximation at equator
};

} // namespace RoutingServer 