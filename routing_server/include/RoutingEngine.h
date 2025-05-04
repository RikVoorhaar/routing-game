#pragma once

#include <routingkit/osm_simple.h>
#include <routingkit/contraction_hierarchy.h>
#include <routingkit/inverse_vector.h>
#include <routingkit/geo_position_to_node.h>
#include <string>
#include <vector>
#include <memory>

namespace RoutingServer {

// Results from a routing query
struct RoutingResult {
    unsigned source_node;
    unsigned target_node;
    unsigned total_travel_time_ms;
    std::vector<unsigned> node_path;
    std::vector<unsigned> arc_path;
    long long query_time_us;
    bool success;
};

// Point on the route with travel time
struct RoutePoint {
    double latitude;
    double longitude;
    unsigned node_id;
    unsigned time_ms;
};

// Main routing engine class
class RoutingEngine {
public:
    // Initialize with OSM data file
    explicit RoutingEngine(const std::string& osm_file);
    
    // Find nearest node to given coordinates
    unsigned findNearestNode(double latitude, double longitude, unsigned max_radius = 1000) const;
    
    // Compute shortest path between two nodes
    RoutingResult computeShortestPath(unsigned from_node, unsigned to_node) const;

    // Get the latitude and longitude for a node
    void getNodeCoordinates(unsigned node_id, double& latitude, double& longitude) const;
    
    // Process the path into a sequence of route points with cumulative travel times
    std::vector<RoutePoint> processPathIntoPoints(const RoutingResult& result) const;
    
    // Check if node ID is valid
    bool isValidNode(unsigned node_id) const;
    
    // Get graph node count
    unsigned getNodeCount() const;
    
    // Get graph arc count
    unsigned getArcCount() const;

private:
    // RoutingKit graph data
    RoutingKit::SimpleOSMCarRoutingGraph graph_;
    std::unique_ptr<RoutingKit::ContractionHierarchy> ch_;
    std::unique_ptr<RoutingKit::GeoPositionToNode> pos_to_node_;
};

} // namespace RoutingServer 