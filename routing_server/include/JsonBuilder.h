#pragma once

#include "RoutingEngine.h"
#include <crow.h>
#include <string>
#include <vector>

namespace RoutingServer {

// Class for building JSON responses
class JsonBuilder {
public:
    // Build a JSON response for a successful route calculation
    static crow::json::wvalue buildRouteResponse(
        const RoutingResult& result,
        const std::vector<RoutePoint>& route_points
    );
    
    // Build a lite JSON response without path array (for metadata-only requests)
    static crow::json::wvalue buildLiteRouteResponse(const RoutingResult& result);
    
    // Build a JSON error response
    static crow::json::wvalue buildErrorResponse(const std::string& error_message);
    
    // Compress JSON string using gzip
    static std::vector<unsigned char> compressGzip(const std::string& json_string);
};

} // namespace RoutingServer 