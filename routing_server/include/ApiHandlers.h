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
    
    // Handler for the random address endpoint
    crow::response handleRandomAddress(const crow::request& req);
    
    // Handler for the random address in annulus endpoint
    crow::response handleRandomAddressInAnnulus(const crow::request& req);
    
    // Parse coordinates from query parameters
    bool parseCoordinates(const crow::request& req, 
                          double& from_lat, double& from_lon, 
                          double& to_lat, double& to_lon);
    
    // Parse optional seed from query parameters
    std::optional<unsigned> parseSeed(const crow::request& req);
    
    // Parse annulus parameters from query parameters
    bool parseAnnulusParams(const crow::request& req,
                           double& lat, double& lon,
                           float& r_min, float& r_max);
    
    // Shared routing engine instance
    std::shared_ptr<RoutingEngine> engine_;
};

} // namespace RoutingServer 