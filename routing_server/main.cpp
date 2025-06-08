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
	if (argc < 2 || argc > 3) {
		LOG("Usage: " << argv[0] << " <osm_file> [addresses_csv_file]");
		LOG("  osm_file: Path to the OSM data file in PBF format");
		LOG("  addresses_csv_file: Optional path to a CSV file with address data");
		return 1;
	}
	
	// Get OSM file path from arguments
	std::string osm_file = argv[1];
	LOG("Using OSM data from " << osm_file);
	
	// Get optional addresses file
	std::string addresses_file;
	if (argc == 3) {
		addresses_file = argv[2];
		LOG("Using address data from " << addresses_file);
	}
	
	try {
		// Initialize the routing engine
		LOG("Initializing routing engine...");
		LOG("Starting RoutingEngine constructor with file: " << osm_file);
		auto engine = std::make_shared<RoutingEngine>(osm_file);
		LOG("RoutingEngine constructor completed successfully");
		LOG("Routing engine initialized with " << engine->getNodeCount() << " nodes and " 
			<< engine->getArcCount() << " arcs");
		
		// Load addresses if provided
		if (!addresses_file.empty()) {
			LOG("Loading addresses...");
			if (engine->loadAddressesFromCSV(addresses_file)) {
				LOG("Loaded " << engine->getAddressCount() << " addresses");
			} else {
				LOG("Failed to load addresses from " << addresses_file);
			}
		}
		
		// Create API handlers
		LOG("Creating API handlers...");
		ApiHandlers api_handlers(engine);
		
		// Create and configure the Crow app
		LOG("Setting up Crow application...");
		crow::SimpleApp app;
		
		// Register API routes
		LOG("Registering API routes...");
		api_handlers.registerRoutes(app);
		
		// Start the server
		LOG("Starting HTTP server on port 8080...");
		app.port(8080).run();
	} catch (const std::exception& e) {
		LOG("Error: " << e.what());
		return 1;
	} catch (...) {
		LOG("Unknown error occurred");
		return 1;
	}
	
	return 0;
}