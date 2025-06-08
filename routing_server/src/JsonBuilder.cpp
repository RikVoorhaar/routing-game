#include "../include/JsonBuilder.h"
#include <iostream>

namespace RoutingServer {

crow::json::wvalue JsonBuilder::buildRouteResponse(
    const RoutingResult& result,
    const std::vector<RoutePoint>& route_points
) {
    crow::json::wvalue response;
    
    // Add basic info about the route
    response["success"] = result.success;
    response["travel_time_seconds"] = result.total_travel_time_ms / 1000.0; // Convert to seconds
    response["total_distance_meters"] = result.total_geo_distance_m; // Distance in meters
    
    // Add route points as array of coordinates with cumulative times and distances
    crow::json::wvalue::list path_list;
    for (const auto& point : route_points) {
        crow::json::wvalue point_obj;
        crow::json::wvalue coord_obj;
        coord_obj["lat"] = static_cast<double>(point.latitude);
        coord_obj["lon"] = static_cast<double>(point.longitude);
        point_obj["coordinates"] = std::move(coord_obj);
        point_obj["cumulative_time_seconds"] = point.time_ms / 1000.0; // Convert to seconds
        point_obj["cumulative_distance_meters"] = point.distance_m; // Distance in meters
        point_obj["max_speed_kmh"] = point.max_speed_kmh; // Maximum speed on arc leading to this point
        point_obj["is_walking_segment"] = point.is_walking_segment; // Whether this is a walking segment
        path_list.push_back(std::move(point_obj));
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