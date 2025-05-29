cmake_minimum_required(VERSION 3.10)

# Source files for the server implementation
set(SERVER_SRC
    ${CMAKE_SOURCE_DIR}/src/RoutingEngine.cpp
    ${CMAKE_SOURCE_DIR}/src/ApiHandlers.cpp
    ${CMAKE_SOURCE_DIR}/src/JsonBuilder.cpp
)

# Find GTest
find_package(GTest REQUIRED)
find_package(Threads REQUIRED)

# Find libcurl
find_package(CURL REQUIRED)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/../
    ${CMAKE_SOURCE_DIR}/../include
    ${CMAKE_SOURCE_DIR}
    ${GTEST_INCLUDE_DIRS}
    ${CURL_INCLUDE_DIRS}
)

# Test executable
add_executable(integration_tests 
    integration_tests.cpp
    ${SERVER_SRC}
)

# Find and link dependencies
find_package(ZLIB REQUIRED)
find_package(Crow)
find_package(OpenSSL REQUIRED)

target_link_libraries(integration_tests
    ${GTEST_BOTH_LIBRARIES}
    ${CMAKE_THREAD_LIBS_INIT}
    ${CURL_LIBRARIES}
    ${CMAKE_SOURCE_DIR}/../RoutingKit/lib/libroutingkit.a
    ${ZLIB_LIBRARIES}
    Crow::Crow
    ${OPENSSL_LIBRARIES}
    pthread
)

# Enable testing
enable_testing()
add_test(NAME IntegrationTests COMMAND integration_tests) 