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
    
    // Register the random address endpoint
    CROW_ROUTE(app, "/api/v1/random_address")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleRandomAddress(req);
        });
    
    // Register the random address in annulus endpoint
    CROW_ROUTE(app, "/api/v1/random_address_in_annulus")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleRandomAddressInAnnulus(req);
        });
        
    LOG("API routes registered");
}

crow::response ApiHandlers::handleShortestPath(const crow::request& req) {
    LOG("Received request: " + req.url);
    
    // Parse coordinates from request
    double from_lat, from_lon, to_lat, to_lon;
    if (!parseCoordinates(req, from_lat, from_lon, to_lat, to_lon)) {
        return crow::response(400, JsonBuilder::buildErrorResponse(
            "Invalid or missing coordinates. Format: /api/v1/shortest_path?from=latitude,longitude&to=latitude,longitude"
        ));
    }
    
    LOG("Routing from (" << from_lat << "," << from_lon << ") to (" << to_lat << "," << to_lon << ")");
    
    // Find nearest nodes
    LOG("Finding nearest nodes...");
    unsigned from_node = engine_->findNearestNode(from_lat, from_lon);
    if (from_node == RoutingKit::invalid_id) {
        return crow::response(404, JsonBuilder::buildErrorResponse(
            "No node within 1000m from source position"
        ));
    }
    
    unsigned to_node = engine_->findNearestNode(to_lat, to_lon);
    if (to_node == RoutingKit::invalid_id) {
        return crow::response(404, JsonBuilder::buildErrorResponse(
            "No node within 1000m from target position"
        ));
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
    return crow::response(JsonBuilder::buildRouteResponse(result, route_points));
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

std::optional<unsigned> ApiHandlers::parseSeed(const crow::request& req) {
    std::string seed_param = req.url_params.get("seed") ? req.url_params.get("seed") : "";
    
    if (!seed_param.empty()) {
        try {
            return std::stoul(seed_param);
        } catch (const std::exception& e) {
            LOG("Error parsing seed: " << e.what());
        }
    }
    
    return std::nullopt;
}

bool ApiHandlers::parseAnnulusParams(const crow::request& req,
                           double& lat, double& lon,
                           float& r_min, float& r_max) {
    // Get center coordinates
    std::string center_param = req.url_params.get("center") ? req.url_params.get("center") : "";
    if (center_param.empty()) {
        LOG("Error: Missing 'center' parameter");
        return false;
    }
    
    // Parse center coordinates
    try {
        size_t comma_pos = center_param.find(',');
        if (comma_pos == std::string::npos) {
            LOG("Error: Invalid 'center' format");
            return false;
        }
        lat = std::stod(center_param.substr(0, comma_pos));
        lon = std::stod(center_param.substr(comma_pos + 1));
    } catch (const std::exception& e) {
        LOG("Error parsing center coordinates: " << e.what());
        return false;
    }
    
    // Get radius parameters
    std::string r_min_param = req.url_params.get("r_min") ? req.url_params.get("r_min") : "";
    std::string r_max_param = req.url_params.get("r_max") ? req.url_params.get("r_max") : "";
    
    if (r_min_param.empty() || r_max_param.empty()) {
        LOG("Error: Missing 'r_min' or 'r_max' parameter");
        return false;
    }
    
    // Parse radius parameters
    try {
        r_min = std::stof(r_min_param);
        r_max = std::stof(r_max_param);
        
        // Validate radius values
        if (r_min < 0 || r_max < 0 || r_min > r_max) {
            LOG("Error: Invalid radius values (must be positive and r_min <= r_max)");
            return false;
        }
    } catch (const std::exception& e) {
        LOG("Error parsing radius parameters: " << e.what());
        return false;
    }
    
    return true;
}

crow::response ApiHandlers::handleRandomAddress(const crow::request& req) {
    LOG("Received request: " + req.url);
    
    // Check if addresses are loaded
    if (engine_->getAddressCount() == 0) {
        return crow::response(404, JsonBuilder::buildErrorResponse(
            "No addresses loaded. Start server with address CSV file."
        ));
    }
    
    // Parse optional seed parameter
    auto seed = parseSeed(req);
    
    // Get a random address
    LOG("Finding random address...");
    auto address = engine_->getRandomAddress(seed);
    
    // Build and return the JSON response
    LOG("Sending response");
    return crow::response(address.toJson());
}

crow::response ApiHandlers::handleRandomAddressInAnnulus(const crow::request& req) {
    LOG("Received request: " + req.url);
    
    // Check if addresses are loaded
    if (engine_->getAddressCount() == 0) {
        return crow::response(404, JsonBuilder::buildErrorResponse(
            "No addresses loaded. Start server with address CSV file."
        ));
    }
    
    // Parse annulus parameters
    double center_lat, center_lon;
    float r_min, r_max;
    if (!parseAnnulusParams(req, center_lat, center_lon, r_min, r_max)) {
        return crow::response(400, JsonBuilder::buildErrorResponse(
            "Invalid or missing annulus parameters. Format: /api/v1/random_address_in_annulus?center=latitude,longitude&r_min=min_radius&r_max=max_radius[&seed=random_seed]"
        ));
    }
    
    // Parse optional seed parameter
    auto seed = parseSeed(req);
    
    // Get a random address in the annulus
    LOG("Finding random address in annulus...");
    auto address = engine_->getRandomAddressInAnnulus(
        center_lat, center_lon, r_min, r_max, seed
    );
    
    // Build and return the JSON response
    LOG("Sending response");
    return crow::response(address.toJson());
}

} // namespace RoutingServer 