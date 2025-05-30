#include "../include/JsonBuilder.h"

namespace RoutingServer {

crow::json::wvalue JsonBuilder::buildRouteResponse(
    const RoutingResult& result,
    const std::vector<RoutePoint>& route_points
) {
    crow::json::wvalue response;
    
    // Add basic info about the route
    response["success"] = result.success;
    response["travel_time_seconds"] = result.total_travel_time_ms / 1000.0; // Convert to seconds
    
    // Add route points as array of coordinates
    crow::json::wvalue::list path_list;
    for (const auto& point : route_points) {
        crow::json::wvalue::list coord = {point.latitude, point.longitude};
        path_list.push_back(std::move(coord));
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