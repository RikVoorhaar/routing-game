#include "../include/RoutingEngine.h"
#include <routingkit/timer.h>
#include <iostream>

namespace RoutingServer {

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

} // namespace RoutingServer 