#include "../include/ApiHandlers.h"
#include "../include/JsonBuilder.h"
#include "../include/Logger.h"
#include "../include/RoutingEngine.h"
#include <routingkit/timer.h>
#include <sstream>
#include <cstdlib>

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
        
    // Register the address bbox endpoint
    CROW_ROUTE(app, "/api/v1/bbox")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleAddressBbox(req);
        });
        
    // Register the number of addresses endpoint
    CROW_ROUTE(app, "/api/v1/numAddresses")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleNumAddresses(req);
        });
        
    // Register the address sample endpoint (using GET method)
    CROW_ROUTE(app, "/api/v1/addressSample")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleAddressSample(req);
        });
        
    // Register the uniform random address in annulus endpoint
    CROW_ROUTE(app, "/api/v1/uniformRandomAddressInAnnulus")
        .methods(crow::HTTPMethod::GET)
        ([this](const crow::request& req) {
            return this->handleUniformRandomAddressInAnnulus(req);
        });
        
    LOG("API routes registered");
}

crow::response ApiHandlers::handleShortestPath(const crow::request& req) {
    long long start_time = RoutingKit::get_micro_time();
    LOG("Received request: " + req.url);
    
    // Parse coordinates from request
    double from_lat, from_lon, to_lat, to_lon;
    if (!parseCoordinates(req, from_lat, from_lon, to_lat, to_lon)) {
        auto error_json = JsonBuilder::buildErrorResponse(
            "Invalid or missing coordinates. Format: /api/v1/shortest_path?from=latitude,longitude&to=latitude,longitude"
        );
        // Get serialized JSON string by creating a temporary response
        crow::response temp_resp(error_json);
        std::string error_string = temp_resp.body;
        auto compressed = JsonBuilder::compressGzip(error_string);
        
        crow::response resp;
        if (!compressed.empty()) {
            resp.body = std::string(reinterpret_cast<const char*>(compressed.data()), compressed.size());
            resp.add_header("Content-Encoding", "gzip");
        } else {
            resp.body = error_string;
        }
        resp.add_header("Content-Type", "application/json");
        resp.code = 400;
        
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return resp;
    }
    
    LOG("Routing from (" << from_lat << "," << from_lon << ") to (" << to_lat << "," << to_lon << ")");
    
    // Compute the shortest path with walking segments
    LOG("Computing route with walking segments...");
    long long compute_start = RoutingKit::get_micro_time();
    RoutingResult result = engine_->computeShortestPathFromCoordinates(from_lat, from_lon, to_lat, to_lon);
    long long compute_end = RoutingKit::get_micro_time();
    if (RoutingEngine::isTimingEnabled()) {
        LOG("[TIMING] computeShortestPathFromCoordinates: " << (compute_end - compute_start) / 1000.0 << " ms");
    }
    
    LOG("Route computed in " << result.query_time_us << " microseconds");
    LOG("Path length: " << result.node_path.size() << " nodes, travel time: " << result.total_travel_time_ms << " ms");
    
    if (!result.success) {
        auto error_json = JsonBuilder::buildErrorResponse(
            "No route found between coordinates"
        );
        // Get serialized JSON string by creating a temporary response
        crow::response temp_resp(error_json);
        std::string error_string = temp_resp.body;
        auto compressed = JsonBuilder::compressGzip(error_string);
        
        crow::response resp;
        if (!compressed.empty()) {
            resp.body = std::string(reinterpret_cast<const char*>(compressed.data()), compressed.size());
            resp.add_header("Content-Encoding", "gzip");
        } else {
            resp.body = error_string;
        }
        resp.add_header("Content-Type", "application/json");
        resp.code = 404;
        
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return resp;
    }
    
    // Check for optional include_path parameter (default: true, set to 0 to skip path array)
    bool include_path = true;
    std::string include_path_param = req.url_params.get("include_path") ? req.url_params.get("include_path") : "";
    if (!include_path_param.empty()) {
        if (include_path_param == "0" || include_path_param == "false") {
            include_path = false;
            LOG("include_path=0: returning metadata-only response");
        }
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
    
    // If max speed was applied, recalculate the total travel time
    RoutingResult modified_result = result;
    if (max_speed_kmh.has_value()) {
        modified_result.total_travel_time_ms = engine_->recalculateTotalTravelTime(result, max_speed_kmh.value());
        LOG("Total travel time with max speed " << max_speed_kmh.value() << " km/h: " << modified_result.total_travel_time_ms << " ms");
    }
    
    // Build JSON response (with or without path)
    LOG("Sending response");
    long long json_start = RoutingKit::get_micro_time();
    crow::json::wvalue json_response;
    std::vector<RoutePoint> route_points;
    
    if (include_path) {
        // Process the path into points with coordinates and travel times
        long long process_start = RoutingKit::get_micro_time();
        route_points = engine_->processPathIntoPoints(modified_result, max_speed_kmh);
        long long process_end = RoutingKit::get_micro_time();
        if (RoutingEngine::isTimingEnabled()) {
            LOG("[TIMING] processPathIntoPoints: " << (process_end - process_start) / 1000.0 << " ms");
        }
        json_response = JsonBuilder::buildRouteResponse(modified_result, route_points);
    } else {
        json_response = JsonBuilder::buildLiteRouteResponse(modified_result);
    }
    
    long long json_end = RoutingKit::get_micro_time();
    if (RoutingEngine::isTimingEnabled()) {
        LOG("[TIMING] JsonBuilder::buildRouteResponse: " << (json_end - json_start) / 1000.0 << " ms");
    }
    
    // Convert JSON to string and compress with gzip
    // Get serialized JSON string by creating a temporary response
    crow::response temp_resp(json_response);
    std::string json_string = temp_resp.body;
    auto compressed = JsonBuilder::compressGzip(json_string);
    
    if (compressed.empty()) {
        LOG("Warning: gzip compression failed, sending uncompressed response");
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms");
        crow::response resp(json_response);
        resp.add_header("Content-Type", "application/json");
        return resp;
    }
    
    // Create response with compressed data
    crow::response resp;
    resp.body = std::string(reinterpret_cast<const char*>(compressed.data()), compressed.size());
    resp.add_header("Content-Type", "application/json");
    resp.add_header("Content-Encoding", "gzip");
    
    long long end_time = RoutingKit::get_micro_time();
    LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (compressed: " << compressed.size() << " bytes, original: " << json_string.size() << " bytes)");
    return resp;
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

crow::response ApiHandlers::handleAddressBbox(const crow::request& req) {
    long long start_time = RoutingKit::get_micro_time();
    LOG("Received address bbox request: " + req.url);
    
    // Check if addresses are loaded
    if (engine_->getAddressCount() == 0) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No addresses loaded. Start server with address CSV file."
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(404, error_response);
    }
    
    // Get the bounding box
    auto bbox = engine_->getAddressBbox();
    
    if (!bbox) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "Failed to calculate address bounding box"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(500, error_response);
    }
    
    // Build and return the JSON response
    LOG("Sending bbox response");
    auto success_response = bbox->toJson();
    long long end_time = RoutingKit::get_micro_time();
    LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms");
    return crow::response(success_response);
}

crow::response ApiHandlers::handleNumAddresses(const crow::request& req) {
    long long start_time = RoutingKit::get_micro_time();
    LOG("Received num addresses request: " + req.url);
    
    // Get the number of addresses
    unsigned address_count = engine_->getAddressCount();
    
    // Build and return the JSON response
    crow::json::wvalue response;
    response["count"] = address_count;
    
    LOG("Sending num addresses response: " << address_count);
    long long end_time = RoutingKit::get_micro_time();
    LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms");
    return crow::response(response);
}

crow::response ApiHandlers::handleAddressSample(const crow::request& req) {
    long long start_time = RoutingKit::get_micro_time();
    LOG("Received address sample request: " + req.url);
    
    // Check if addresses are loaded
    if (engine_->getAddressCount() == 0) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No addresses loaded. Start server with address CSV file."
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(404, error_response);
    }
    
    // Parse query parameters with defaults
    std::string number_param = req.url_params.get("number") ? req.url_params.get("number") : "100";
    std::string seed_param = req.url_params.get("seed") ? req.url_params.get("seed") : "42";
    std::string page_size_param = req.url_params.get("page_size") ? req.url_params.get("page_size") : "20";
    std::string page_num_param = req.url_params.get("page_num") ? req.url_params.get("page_num") : "0";
    
    unsigned number, seed, page_size, page_num;
    
    try {
        number = std::stoul(number_param);
        seed = std::stoul(seed_param);
        page_size = std::stoul(page_size_param);
        page_num = std::stoul(page_num_param);
    } catch (const std::exception& e) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "Invalid parameter format. All parameters must be valid unsigned integers."
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(400, error_response);
    }
    
    LOG("Address sample parameters: number=" << number << ", seed=" << seed 
        << ", page_size=" << page_size << ", page_num=" << page_num);
    
    // Validate parameters
    if (page_size == 0) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "page_size must be greater than 0"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(400, error_response);
    }
    
    if (number == 0) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "number must be greater than 0"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(400, error_response);
    }
    
    // Get the address sample
    auto addresses = engine_->getAddressSample(number, seed, page_size, page_num);
    
    // Build JSON response
    crow::json::wvalue response;
    response["addresses"] = crow::json::wvalue::list();
    
    for (size_t i = 0; i < addresses.size(); ++i) {
        response["addresses"][i] = addresses[i].toJson();
    }
    
    // Add pagination info
    response["pagination"]["page_num"] = page_num;
    response["pagination"]["page_size"] = page_size;
    response["pagination"]["total_requested"] = number;
    response["pagination"]["returned"] = addresses.size();
    
    LOG("Sending address sample response with " << addresses.size() << " addresses");
    long long end_time = RoutingKit::get_micro_time();
    LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms");
    return crow::response(response);
}

crow::response ApiHandlers::handleUniformRandomAddressInAnnulus(const crow::request& req) {
    long long start_time = RoutingKit::get_micro_time();
    LOG("Received uniform random address in annulus request: " + req.url);
    
    // Check if addresses are loaded
    if (engine_->getAddressCount() == 0) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No addresses loaded. Start server with address CSV file."
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(404, error_response);
    }
    
    // Parse query parameters
    std::string lat_param = req.url_params.get("lat") ? req.url_params.get("lat") : "";
    std::string lon_param = req.url_params.get("lon") ? req.url_params.get("lon") : "";
    std::string min_distance_param = req.url_params.get("min_distance") ? req.url_params.get("min_distance") : "";
    std::string max_distance_param = req.url_params.get("max_distance") ? req.url_params.get("max_distance") : "";
    std::string seed_param = req.url_params.get("seed") ? req.url_params.get("seed") : "42";
    
    double lat, lon;
    float min_distance, max_distance;
    unsigned seed;
    
    try {
        lat = std::stod(lat_param);
        lon = std::stod(lon_param);
        min_distance = std::stof(min_distance_param);
        max_distance = std::stof(max_distance_param);
        seed = std::stoul(seed_param);
    } catch (const std::exception& e) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "Invalid parameter format. Required: lat, lon, min_distance, max_distance (all numeric). Optional: seed (numeric)"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(400, error_response);
    }
    
    // Check for missing required parameters
    if (lat_param.empty() || lon_param.empty() || min_distance_param.empty() || max_distance_param.empty()) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "Missing required parameters. Format: /api/v1/uniformRandomAddressInAnnulus?lat=X&lon=Y&min_distance=Z&max_distance=W&seed=S"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(400, error_response);
    }
    
    LOG("Uniform random address in annulus: center=(" << lat << "," << lon 
        << "), min_dist=" << min_distance << "km, max_dist=" << max_distance << "km, seed=" << seed);
    
    // Get a uniform random address in the annulus
    auto address = engine_->getUniformRandomAddressInAnnulus(lat, lon, min_distance, max_distance, seed);
    
    if (!address) {
        auto error_response = JsonBuilder::buildErrorResponse(
            "No address found in the specified annulus"
        );
        long long end_time = RoutingKit::get_micro_time();
        LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms (error)");
        return crow::response(404, error_response);
    }
    
    // Build and return the JSON response
    LOG("Sending uniform random address response");
    auto success_response = address->toJson();
    long long end_time = RoutingKit::get_micro_time();
    LOG("Request completed in " << (end_time - start_time) / 1000.0 << " ms");
    return crow::response(success_response);
}

} // namespace RoutingServer 