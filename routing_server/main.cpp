#include "include/RoutingEngine.h"
#include "include/ApiHandlers.h"
#include "include/Logger.h"
#include <crow.h>
#include <memory>
#include <string>
#include <iostream>

using namespace RoutingServer;

int main(int argc, char* argv[]) {
	LOG("Starting routing server...");
	
	// Check command line arguments
	if (argc != 2) {
		LOG("Usage: " << argv[0] << " <osm_file>");
		return 1;
	}
	
	// Get OSM file path from arguments
	std::string osm_file = argv[1];
	LOG("Using OSM data from " << osm_file);
	
	try {
		// Initialize the routing engine
		LOG("Initializing routing engine...");
		auto engine = std::make_shared<RoutingEngine>(osm_file);
		LOG("Routing engine initialized with " << engine->getNodeCount() << " nodes and " 
			<< engine->getArcCount() << " arcs");
		
		// Create API handlers
		ApiHandlers api_handlers(engine);
		
		// Create and configure the Crow app
		crow::SimpleApp app;
		
		// Register API routes
		api_handlers.registerRoutes(app);
		
		// Start the server
		LOG("Starting HTTP server on port 8080...");
		app.port(8080).run();
	} catch (const std::exception& e) {
		LOG("Error: " << e.what());
		return 1;
	}
	
	return 0;
}