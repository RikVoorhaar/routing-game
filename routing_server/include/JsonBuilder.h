#pragma once

#include "RoutingEngine.h"
#include <crow.h>

namespace RoutingServer {

// Class for building JSON responses
class JsonBuilder {
public:
    // Build a JSON response for a successful route calculation
    static crow::json::wvalue buildRouteResponse(
        const RoutingResult& result,
        const std::vector<RoutePoint>& route_points
    );
    
    // Build a JSON error response
    static crow::json::wvalue buildErrorResponse(const std::string& error_message);
};

} // namespace RoutingServer 