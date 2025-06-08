#include "../include/ApiHandlers.h"
#include "../include/JsonBuilder.h"
#include "../include/Logger.h"
#include <routingkit/timer.h>
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
    long long start_time = RoutingKit::get_micro_time();
    LOG("Received request: " + req.url);
    
    // Parse coordinates from request
    double from_lat, from_lon, to_lat, to_lon;
    if (!parseCoordinates(req, from_lat, from_lon, to_lat, to_lon)) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "Invalid or missing coordinates. Format: /api/v1/shortest_path?from=latitude,longitude&to=latitude,longitude"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(400, error_response);
    }
    
    LOG("Routing from (" << from_lat << "," << from_lon << ") to (" << to_lat << "," << to_lon << ")");
    
    // Compute the shortest path with walking segments
    LOG("Computing route with walking segments...");
    RoutingResult result = engine_->computeShortestPathFromCoordinates(from_lat, from_lon, to_lat, to_lon);
    
    LOG("Route computed in " << result.query_time_us << " microseconds");
    LOG("Path length: " << result.node_path.size() << " nodes, travel time: " << result.total_travel_time_ms << " ms");
    
    if (!result.success) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No route found between coordinates"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(404, error_response);
    }
    
    // Check for optional max_speed parameter
    std::optional<unsigned> max_speed_kmh;
    std::string max_speed_param = req.url_params.get("max_speed") ? req.url_params.get("max_speed") : "";
    if (!max_speed_param.empty()) {
        try {
            unsigned max_speed = std::stoul(max_speed_param);
            if (max_speed > 0) {
                max_speed_kmh = max_speed;
                LOG("Applying maximum speed limit: " << max_speed << " km/h");
            }
        } catch (const std::exception& e) {
            LOG("Invalid max_speed parameter: " << e.what());
        }
    }
    
    // Process the path into points with coordinates and travel times
    auto route_points = engine_->processPathIntoPoints(result, max_speed_kmh);
    
    // If max speed was applied, recalculate the total travel time
    RoutingResult modified_result = result;
    if (max_speed_kmh.has_value()) {
        modified_result.total_travel_time_ms = engine_->recalculateTotalTravelTime(result, max_speed_kmh.value());
        LOG("Total travel time with max speed " << max_speed_kmh.value() << " km/h: " << modified_result.total_travel_time_ms << " ms");
    }
    
    // Build and return the JSON response
    LOG("Sending response");
    auto success_response = JsonBuilder::buildRouteResponse(modified_result, route_points);
    long long end_time = RoutingKit::get_micro_time();
    LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms");
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
    long long start_time = RoutingKit::get_micro_time();
    LOG("Received health check request: " + req.url);
    
    crow::json::wvalue response;
    response["status"] = "ok";
    response["engine_initialized"] = true;
    response["node_count"] = engine_->getNodeCount();
    response["arc_count"] = engine_->getArcCount();
    response["address_count"] = engine_->getAddressCount();
    
    LOG("Sending health check response");
    long long end_time = RoutingKit::get_micro_time();
    LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms");
    return crow::response(200, response);
}

crow::response ApiHandlers::handleClosestAddress(const crow::request& req) {
    long long start_time = RoutingKit::get_micro_time();
    LOG("Received request: " + req.url);
    
    // Check if addresses are loaded
    if (engine_->getAddressCount() == 0) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No addresses loaded. Start server with address CSV file."
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(404, error_response);
    }
    
    // Parse location parameter
    std::string location_param = req.url_params.get("location") ? req.url_params.get("location") : "";
    double lat, lon;
    
    if (!parseCoordinate(location_param, lat, lon)) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "Invalid or missing location parameter. Format: /api/v1/closest_address?location=latitude,longitude"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(400, error_response);
    }
    
    // Get the closest address
    LOG("Finding closest address to (" << lat << "," << lon << ")...");
    auto address = engine_->getClosestAddress(lat, lon);
    
    if (!address) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No address found"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(404, error_response);
    }
    
    // Build and return the JSON response
    LOG("Sending response");
    auto success_response = address->toJson();
    long long end_time = RoutingKit::get_micro_time();
    LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms");
    return crow::response(success_response);
}

} // namespace RoutingServer 