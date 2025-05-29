#include "../include/ApiHandlers.h"
#include "../include/JsonBuilder.h"
#include "../include/Logger.h"
#include <sstream>

namespace RoutingServer {

ApiHandlers::ApiHandlers(std::shared_ptr<RoutingEngine> engine)
    : engine_(std::move(engine)) {
}

void ApiHandlers::registerRoutes(crow::SimpleApp& app) {
    // Register the shortest path endpoint
    CROW_ROUTE(app, "/api/v1/shortest_path")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleShortestPath(req);
        });
    
    // Register the closest address endpoint
    CROW_ROUTE(app, "/api/v1/closest_address")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleClosestAddress(req);
        });
        
    // Register the health check endpoint
    CROW_ROUTE(app, "/health")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleHealthCheck(req);
        });
        
    LOG("API routes registered");
}

crow::response ApiHandlers::handleShortestPath(const crow::request& req) {
    LOG("Received request: " + req.url);
    
    // Parse coordinates from request
    double from_lat, from_lon, to_lat, to_lon;
    if (!parseCoordinates(req, from_lat, from_lon, to_lat, to_lon)) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "Invalid or missing coordinates. Format: /api/v1/shortest_path?from=latitude,longitude&to=latitude,longitude"
        );
        return crow::response(400, error_response);
    }
    
    LOG("Routing from (" << from_lat << "," << from_lon << ") to (" << to_lat << "," << to_lon << ")");
    
    // Find nearest nodes
    LOG("Finding nearest nodes...");
    unsigned from_node = engine_->findNearestNode(from_lat, from_lon);
    if (from_node == RoutingKit::invalid_id) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No node within 1000m from source position"
        );
        return crow::response(404, error_response);
    }
    
    unsigned to_node = engine_->findNearestNode(to_lat, to_lon);
    if (to_node == RoutingKit::invalid_id) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No node within 1000m from target position"
        );
        return crow::response(404, error_response);
    }
    
    LOG("Found nodes: from=" << from_node << ", to=" << to_node);
    
    // Compute the shortest path
    LOG("Computing route...");
    RoutingResult result = engine_->computeShortestPath(from_node, to_node);
    
    LOG("Route computed in " << result.query_time_us << " microseconds");
    LOG("Path length: " << result.node_path.size() << " nodes, travel time: " << result.total_travel_time_ms << " ms");
    
    // Process the path into points with coordinates and travel times
    auto route_points = engine_->processPathIntoPoints(result);
    
    // Build and return the JSON response
    LOG("Sending response");
    auto success_response = JsonBuilder::buildRouteResponse(result, route_points);
    return crow::response(success_response);
}

bool ApiHandlers::parseCoordinates(const crow::request& req, 
                          double& from_lat, double& from_lon, 
                          double& to_lat, double& to_lon) {
    // Get from and to parameters
    std::string from_param = req.url_params.get("from") ? req.url_params.get("from") : "";
    std::string to_param = req.url_params.get("to") ? req.url_params.get("to") : "";
    
    // Check if parameters are provided
    if (from_param.empty() || to_param.empty()) {
        LOG("Error: Missing 'from' or 'to' parameters");
        return false;
    }
    
    try {
        // Parse from coordinates
        size_t comma_pos = from_param.find(',');
        if (comma_pos == std::string::npos) {
            LOG("Error: Invalid 'from' format");
            return false;
        }
        from_lat = std::stod(from_param.substr(0, comma_pos));
        from_lon = std::stod(from_param.substr(comma_pos + 1));
        
        // Parse to coordinates
        comma_pos = to_param.find(',');
        if (comma_pos == std::string::npos) {
            LOG("Error: Invalid 'to' format");
            return false;
        }
        to_lat = std::stod(to_param.substr(0, comma_pos));
        to_lon = std::stod(to_param.substr(comma_pos + 1));
        
        return true;
    } catch (const std::exception& e) {
        LOG("Error parsing coordinates: " << e.what());
        return false;
    }
}

bool ApiHandlers::parseCoordinate(const std::string& param, double& lat, double& lon) {
    if (param.empty()) {
        return false;
    }
    
    try {
        // Parse coordinates
        size_t comma_pos = param.find(',');
        if (comma_pos == std::string::npos) {
            LOG("Error: Invalid coordinate format");
            return false;
        }
        lat = std::stod(param.substr(0, comma_pos));
        lon = std::stod(param.substr(comma_pos + 1));
        return true;
    } catch (const std::exception& e) {
        LOG("Error parsing coordinates: " << e.what());
        return false;
    }
}

crow::response ApiHandlers::handleHealthCheck(const crow::request& req) {
    LOG("Received health check request: " + req.url);
    
    crow::json::wvalue response;
    response["status"] = "ok";
    response["engine_initialized"] = true;
    response["node_count"] = engine_->getNodeCount();
    response["arc_count"] = engine_->getArcCount();
    response["address_count"] = engine_->getAddressCount();
    
    LOG("Sending health check response");
    return crow::response(200, response);
}

crow::response ApiHandlers::handleClosestAddress(const crow::request& req) {
    LOG("Received request: " + req.url);
    
    // Check if addresses are loaded
    if (engine_->getAddressCount() == 0) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No addresses loaded. Start server with address CSV file."
        );
        return crow::response(404, error_response);
    }
    
    // Parse location parameter
    std::string location_param = req.url_params.get("location") ? req.url_params.get("location") : "";
    double lat, lon;
    
    if (!parseCoordinate(location_param, lat, lon)) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "Invalid or missing location parameter. Format: /api/v1/closest_address?location=latitude,longitude"
        );
        return crow::response(400, error_response);
    }
    
    // Get the closest address
    LOG("Finding closest address to (" << lat << "," << lon << ")...");
    auto address = engine_->getClosestAddress(lat, lon);
    
    if (!address) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No address found"
        );
        return crow::response(404, error_response);
    }
    
    // Build and return the JSON response
    LOG("Sending response");
    auto success_response = address->toJson();
    return crow::response(success_response);
}

} // namespace RoutingServer 