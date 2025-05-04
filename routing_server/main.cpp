#include <routingkit/osm_simple.h>
#include <routingkit/contraction_hierarchy.h>
#include <routingkit/inverse_vector.h>
#include <routingkit/timer.h>
#include <routingkit/geo_position_to_node.h>
#include <iostream>
#include <crow.h>
#include <string>
#include <sstream>
#include <iomanip>
#include <ctime>
using namespace RoutingKit;
using namespace std;

// Function to get current time as string
std::string current_time_string() {
	auto t = std::time(nullptr);
	auto tm = *std::localtime(&t);
	std::ostringstream oss;
	oss << std::put_time(&tm, "%H:%M:%S");
	return oss.str();
}

// Custom logger
#define LOG(msg) std::cout << "[" << current_time_string() << "] " << msg << std::endl

int main(int argc, char* argv[]){
	LOG("Starting routing server...");
	
	// Check command line arguments
	if (argc != 2) {
		LOG("Usage: " << argv[0] << " <osm_file>");
		return 1;
	}

	// Load a car routing graph from OpenStreetMap-based data
	std::string osm_file = argv[1];
	LOG("Loading OSM data from " << osm_file << "...");
	auto graph = simple_load_osm_car_routing_graph_from_pbf(osm_file);
	LOG("Loaded graph with " << graph.node_count() << " nodes and " << graph.arc_count() << " arcs");
	auto tail = invert_inverse_vector(graph.first_out);

	// Build the shortest path index
	LOG("Building contraction hierarchy (this may take a while)...");
	auto start_time = get_micro_time();
	auto ch = ContractionHierarchy::build(
		graph.node_count(), 
		tail, graph.head, 
		graph.travel_time
	);
	auto end_time = get_micro_time();
	LOG("Contraction hierarchy built in " << (end_time - start_time) / 1000000.0 << " seconds");

	// Build the index to quickly map latitudes and longitudes
	LOG("Building geo position index...");
	GeoPositionToNode map_geo_position(graph.latitude, graph.longitude);
	LOG("Geo position index built");

	// Besides the CH itself we need a query object. 
	ContractionHierarchyQuery ch_query(ch);
	LOG("Query object created");
	
	crow::SimpleApp app;

	// Define API endpoint for shortest path
	CROW_ROUTE(app, "/api/v1/shortest_path")
	.methods(crow::HTTPMethod::GET)
	([&](const crow::request& req) {
		LOG("Received request: " + req.url);
		
		// Get from parameters
		string from_param = req.url_params.get("from") ? req.url_params.get("from") : "";
		string to_param = req.url_params.get("to") ? req.url_params.get("to") : "";
		
		// Check if parameters are provided
		if (from_param.empty() || to_param.empty()) {
			LOG("Error: Missing 'from' or 'to' parameters");
			crow::json::wvalue response;
			response["error"] = "Missing 'from' or 'to' parameters. Format: /api/v1/shortest_path?from=latitude,longitude&to=latitude,longitude";
			return crow::response(400, response);
		}
		
		// Parse the coordinates
		float from_latitude, from_longitude, to_latitude, to_longitude;
		try {
			size_t comma_pos = from_param.find(',');
			if (comma_pos == string::npos) {
				LOG("Error: Invalid 'from' format");
				crow::json::wvalue response;
				response["error"] = "Invalid 'from' format. Expected: latitude,longitude";
				return crow::response(400, response);
			}
			from_latitude = stof(from_param.substr(0, comma_pos));
			from_longitude = stof(from_param.substr(comma_pos + 1));
			
			comma_pos = to_param.find(',');
			if (comma_pos == string::npos) {
				LOG("Error: Invalid 'to' format");
				crow::json::wvalue response;
				response["error"] = "Invalid 'to' format. Expected: latitude,longitude";
				return crow::response(400, response);
			}
			to_latitude = stof(to_param.substr(0, comma_pos));
			to_longitude = stof(to_param.substr(comma_pos + 1));
			
			LOG("Routing from (" << from_latitude << "," << from_longitude << ") to (" << to_latitude << "," << to_longitude << ")");
		} catch (const exception& e) {
			LOG("Error parsing coordinates: " << e.what());
			crow::json::wvalue response;
			response["error"] = string("Error parsing coordinates: ") + e.what();
			return crow::response(400, response);
		}
		
		// Find nearest nodes
		LOG("Finding nearest nodes...");
		unsigned from = map_geo_position.find_nearest_neighbor_within_radius(from_latitude, from_longitude, 1000).id;
		if (from == invalid_id) {
			LOG("Error: No node within 1000m from source position");
			crow::json::wvalue response;
			response["error"] = "No node within 1000m from source position";
			return crow::response(404, response);
		}
		
		unsigned to = map_geo_position.find_nearest_neighbor_within_radius(to_latitude, to_longitude, 1000).id;
		if (to == invalid_id) {
			LOG("Error: No node within 1000m from target position");
			crow::json::wvalue response;
			response["error"] = "No node within 1000m from target position";
			return crow::response(404, response);
		}
		
		LOG("Found nodes: from=" << from << ", to=" << to);

		// Compute the route
		LOG("Computing route...");
		long long start_time = get_micro_time();
		ch_query.reset().add_source(from).add_target(to).run();
		auto distance = ch_query.get_distance();
		auto node_path = ch_query.get_node_path();
		auto arc_path = ch_query.get_arc_path();
		long long end_time = get_micro_time();
		long long query_time = end_time - start_time;
		
		LOG("Route computed in " << query_time << " microseconds");
		LOG("Path length: " << node_path.size() << " nodes, travel time: " << distance << " ms");

		// Create JSON response
		crow::json::wvalue result;
		result["source_node"] = from;
		result["target_node"] = to;
		result["travel_time_ms"] = distance;
		result["query_time_us"] = query_time;
		
		// Add path as array of points with coordinates and cumulative travel time
		crow::json::wvalue::list path_points;
		unsigned current_travel_time = 0;

		// If we have an empty path but valid nodes, add the start and end points
		if (node_path.size() <= 1 && from != invalid_id && to != invalid_id) {
			// Add source point
			crow::json::wvalue point;
			point["lat"] = graph.latitude[from];
			point["lon"] = graph.longitude[from];
			point["time_ms"] = 0;
			point["node_id"] = from;
			path_points.push_back(std::move(point));
			
			// Add target point
			point = crow::json::wvalue();
			point["lat"] = graph.latitude[to];
			point["lon"] = graph.longitude[to];
			point["time_ms"] = distance;
			point["node_id"] = to;
			path_points.push_back(std::move(point));
		} else if (node_path.size() > 1) {
			// Calculate exact cumulative travel times using the arc path
			std::vector<unsigned> cumulative_times(node_path.size(), 0);
			
			// First node always has time 0
			cumulative_times[0] = 0;
			
			// Calculate cumulative times for each node
			for (size_t i = 0; i < arc_path.size(); ++i) {
				const auto arc_id = arc_path[i];
				cumulative_times[i + 1] = cumulative_times[i] + graph.travel_time[arc_id];
			}
			
			// Add all points in the path with exact travel times
			for (size_t i = 0; i < node_path.size(); ++i) {
				auto node_id = node_path[i];
				
				crow::json::wvalue point;
				point["lat"] = graph.latitude[node_id];
				point["lon"] = graph.longitude[node_id];
				point["time_ms"] = cumulative_times[i];
				point["node_id"] = node_id;
				path_points.push_back(std::move(point));
			}
		}

		result["path"] = std::move(path_points);
		
		LOG("Sending response");
		return crow::response(result);
	});

	// Start the server
	LOG("Starting HTTP server on port 8080...");
	app.port(8080).run();
}