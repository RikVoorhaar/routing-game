#include "../include/JsonBuilder.h"

namespace RoutingServer {

crow::json::wvalue JsonBuilder::buildRouteResponse(
    const RoutingResult& result,
    const std::vector<RoutePoint>& route_points
) {
    crow::json::wvalue response;
    
    // Add basic info about the route
    response["source_node"] = result.source_node;
    response["target_node"] = result.target_node;
    response["travel_time_ms"] = result.total_travel_time_ms;
    response["query_time_us"] = result.query_time_us;
    response["success"] = result.success;
    
    // Add route points as array
    crow::json::wvalue::list path_list;
    for (const auto& point : route_points) {
        crow::json::wvalue point_json;
        point_json["lat"] = point.latitude;
        point_json["lon"] = point.longitude;
        point_json["time_ms"] = point.time_ms;
        point_json["node_id"] = point.node_id;
        path_list.push_back(std::move(point_json));
    }
    response["path"] = std::move(path_list);
    
    return response;
}

crow::json::wvalue JsonBuilder::buildErrorResponse(const std::string& error_message) {
    crow::json::wvalue response;
    response["error"] = error_message;
    response["success"] = false;
    return response;
}

} // namespace RoutingServer 