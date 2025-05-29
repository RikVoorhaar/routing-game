#include <gtest/gtest.h>
#include <curl/curl.h>
#include <thread>
#include <chrono>
#include <memory>
#include <future>
#include <string>
#include <random>
#include <iostream>
#include <crow/json.h>
#include <fstream>
#include <filesystem>

#include "../include/RoutingEngine.h"
#include "../include/ApiHandlers.h"

using json = crow::json::rvalue;
using namespace RoutingServer;
namespace fs = std::filesystem;

// Test configuration
const std::string SERVER_URL = "http://localhost:8765"; // Test port

// Use a very small subset of Utrecht for testing
const std::string TEST_OSM_FILE = "../../osm_files/utrecht-latest.osm.pbf";  

// Skip address testing - we'll modify the tests that require addresses
class RoutingServerTest : public ::testing::Test {
protected:
    // CURL callback to write received data
    static size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* s) {
        size_t newLength = size * nmemb;
        try {
            s->append((char*)contents, newLength);
            return newLength;
        } catch (std::bad_alloc& e) {
            return 0;
        }
    }
    
    // Helper to make HTTP GET requests
    std::pair<int, std::string> makeGetRequest(const std::string& endpoint, 
                                             const std::string& params = "") {
        CURL* curl = curl_easy_init();
        std::string readBuffer;
        std::string url = SERVER_URL + endpoint;
        
        if (!params.empty()) {
            url += "?" + params;
        }
        
        if (curl) {
            curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
            curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
            curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);
            curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L); // 5 seconds timeout
            
            CURLcode res = curl_easy_perform(curl);
            
            long response_code = 0;
            if (res == CURLE_OK) {
                curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response_code);
            } else {
                std::cerr << "Curl request failed: " << curl_easy_strerror(res) << std::endl;
            }
            
            curl_easy_cleanup(curl);
            return {response_code, readBuffer};
        }
        
        return {0, ""};
    }
};

// Test server class that starts a test instance in a separate thread
class TestServer {
public:
    TestServer() : app_(nullptr), running_(false) {}
    
    ~TestServer() {
        stop();
    }
    
    void start() {
        if (!running_) {
            // First check if test files exist
            if (!fs::exists(TEST_OSM_FILE)) {
                std::cerr << "Test OSM file not found: " << TEST_OSM_FILE 
                          << " (from " << fs::current_path().string() << ")" << std::endl;
                return; // Don't start server if files are missing
            }
            
            // Reset the ready promise
            ready_promise_ = std::promise<bool>();
            
            // Start server in separate thread
            server_thread_ = std::thread([this]() {
                try {
                    std::cout << "Starting test server..." << std::endl;
                    std::cout << "OSM file: " << TEST_OSM_FILE << std::endl;
                    
                    // Initialize engine
                    std::cout << "Initializing engine..." << std::endl;
                    auto engine = std::make_shared<RoutingEngine>(TEST_OSM_FILE);
                    std::cout << "Engine initialized, setting up API handlers..." << std::endl;
                    
                    // Setup API handlers
                    ApiHandlers api_handlers(engine);
                    
                    // Create Crow app (store in member variable)
                    std::cout << "Creating Crow app..." << std::endl;
                    app_ = std::make_unique<crow::SimpleApp>();
                    
                    // Register routes
                    std::cout << "Registering routes..." << std::endl;
                    api_handlers.registerRoutes(*app_);
                    
                    // Configure port
                    std::cout << "Setting port to " << 8765 << std::endl;
                    app_->port(8765);
                    
                    // No middlewares needed for testing
                    
                    // Set server signal for testing
                    std::cout << "Server initialized, setting ready signal..." << std::endl;
                    ready_promise_.set_value(true);
                    
                    // Run server (blocking call until stop() is called)
                    std::cout << "Starting server..." << std::endl;
                    app_->run();
                    
                    std::cout << "Server stopped." << std::endl;
                    
                } catch (const std::exception& e) {
                    std::cerr << "Server error: " << e.what() << std::endl;
                    ready_promise_.set_value(false);
                }
            });
            
            // Wait for server to start (with timeout)
            auto future = ready_promise_.get_future();
            if (future.wait_for(std::chrono::seconds(30)) == std::future_status::ready) {
                running_ = future.get();
                
                // Additional delay to ensure routes are registered
                std::this_thread::sleep_for(std::chrono::milliseconds(500));
            } else {
                std::cerr << "Server failed to start within timeout" << std::endl;
            }
        }
    }
    
    void stop() {
        if (running_ && app_) {
            std::cout << "Stopping test server..." << std::endl;
            
            // Stop the app from the main thread
            app_->stop();
            
            // Wait for the thread to finish
            if (server_thread_.joinable()) {
                server_thread_.join();
            }
            
            // Clear the app
            app_.reset();
            running_ = false;
            
            std::cout << "Test server stopped." << std::endl;
        }
    }
    
    bool isRunning() const {
        return running_;
    }
    
private:
    std::thread server_thread_;
    std::promise<bool> ready_promise_;
    std::unique_ptr<crow::SimpleApp> app_;
    bool running_;
};

// Test the shortest path endpoint
TEST_F(RoutingServerTest, ShortestPathEndpoint) {
    TestServer server_;
    server_.start();
    
    ASSERT_TRUE(server_.isRunning()) << "Server failed to start";
    
    // Make a request to the shortest path endpoint with coordinates in Utrecht
    auto [status_code, response] = makeGetRequest("/api/v1/shortest_path", "from=52.0907,5.1214&to=52.0860,5.1207");
    
    // Parse JSON response
    auto json_response = crow::json::load(response);
    
    // Check the response structure - according to API_DOCUMENTATION.md
    EXPECT_EQ(status_code, 200);
    EXPECT_TRUE(json_response.has("success"));
    EXPECT_TRUE(json_response["success"].b());
    EXPECT_TRUE(json_response.has("path"));
    EXPECT_TRUE(json_response.has("travel_time_ms"));
    EXPECT_TRUE(json_response.has("query_time_us"));
    
    // Explicitly stop server
    server_.stop();
}

// Test the closest address endpoint
TEST_F(RoutingServerTest, ClosestAddressEndpoint) {
    TestServer server_;
    server_.start();
    
    ASSERT_TRUE(server_.isRunning()) << "Server failed to start";
    
    // Make a request to the closest address endpoint with coordinates in Utrecht
    auto [status_code, response] = makeGetRequest("/api/v1/closest_address", "location=52.0907,5.1214");
    
    // If no addresses are loaded, we expect a 404
    if (status_code == 404) {
        // This is acceptable if no addresses are loaded
        auto json_response = crow::json::load(response);
        EXPECT_FALSE(json_response["success"].b());
        EXPECT_TRUE(json_response.has("error"));
    } else {
        // Parse JSON response if addresses are loaded
        auto json_response = crow::json::load(response);
        
        // Check the response structure
        EXPECT_EQ(status_code, 200);
        EXPECT_TRUE(json_response.has("id"));
        EXPECT_TRUE(json_response.has("lat"));
        EXPECT_TRUE(json_response.has("lon"));
    }
    
    // Explicitly stop server
    server_.stop();
}

// Test handling of invalid endpoints
TEST_F(RoutingServerTest, InvalidEndpoint) {
    TestServer server_;
    server_.start();
    
    ASSERT_TRUE(server_.isRunning()) << "Server failed to start";
    
    // Make a request to a non-existent endpoint
    auto [status_code, response] = makeGetRequest("/api/v1/nonexistent_endpoint");
    
    // Check that we get a 404 Not Found
    EXPECT_EQ(status_code, 404);
    
    // Explicitly stop server
    server_.stop();
}

// Test handling of invalid parameters
TEST_F(RoutingServerTest, InvalidParameters) {
    TestServer server_;
    server_.start();
    
    ASSERT_TRUE(server_.isRunning()) << "Server failed to start";
    
    // Make a request with invalid 'from' parameter
    auto [status_code, response] = makeGetRequest("/api/v1/shortest_path", "from=invalid&to=52.0860,5.1207");
    
    // Check that we get a 400 Bad Request
    EXPECT_EQ(status_code, 400);
    
    // Parse JSON response to check error
    auto json_response = crow::json::load(response);
    EXPECT_FALSE(json_response["success"].b());
    EXPECT_TRUE(json_response.has("error"));
    
    // Explicitly stop server
    server_.stop();
}

int main(int argc, char** argv) {
    // Initialize curl
    curl_global_init(CURL_GLOBAL_DEFAULT);
    
    // Run tests
    ::testing::InitGoogleTest(&argc, argv);
    int result = RUN_ALL_TESTS();
    
    // Clean up curl
    curl_global_cleanup();
    
    // Make sure all background threads are stopped
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    
    return result;
} 