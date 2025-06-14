#pragma once

#include "RoutingEngine.h"
#include <crow.h>
#include <memory>
#include <optional>

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
    
    // Handler for the closest address endpoint
    crow::response handleClosestAddress(const crow::request& req);
    
    // Handler for the health check endpoint
    crow::response handleHealthCheck(const crow::request& req);
    
    // Handler for the address bbox endpoint
    crow::response handleAddressBbox(const crow::request& req);
    
    // Handler for the number of addresses endpoint
    crow::response handleNumAddresses(const crow::request& req);
    
    // Handler for the address sample endpoint
    crow::response handleAddressSample(const crow::request& req);
    
    // Parse coordinates from query parameters
    bool parseCoordinates(const crow::request& req, 
                          double& from_lat, double& from_lon, 
                          double& to_lat, double& to_lon);
    
    // Parse a single coordinate pair from query parameter
    bool parseCoordinate(const std::string& param, double& lat, double& lon);
    
    // Shared routing engine instance
    std::shared_ptr<RoutingEngine> engine_;
};

} // namespace RoutingServer 