#pragma once

#include "RoutingEngine.h"
#include <crow.h>
#include <memory>

namespace RoutingServer {

// Class for handling API endpoints
class ApiHandlers {
public:
    // Constructor with routing engine
    explicit ApiHandlers(std::shared_ptr<RoutingEngine> engine);
    
    // Register all API endpoints with the Crow app
    void registerRoutes(crow::SimpleApp& app);

private:
    // Handler for the shortest path endpoint
    crow::response handleShortestPath(const crow::request& req);
    
    // Parse coordinates from query parameters
    bool parseCoordinates(const crow::request& req, 
                          double& from_lat, double& from_lon, 
                          double& to_lat, double& to_lon);
    
    // Shared routing engine instance
    std::shared_ptr<RoutingEngine> engine_;
};

} // namespace RoutingServer 