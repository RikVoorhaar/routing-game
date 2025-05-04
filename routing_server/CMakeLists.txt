cmake_minimum_required(VERSION 3.10)
project(RoutingServer)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/../RoutingKit/include
    ${CMAKE_SOURCE_DIR}
)

# Source files
set(SOURCES
    main.cpp
    src/RoutingEngine.cpp
    src/ApiHandlers.cpp
    src/JsonBuilder.cpp
)

# Add the executable
add_executable(routing_server ${SOURCES})

# Find and link zlib
find_package(ZLIB REQUIRED)
include_directories(${ZLIB_INCLUDE_DIRS})

# Find Crow
find_package(Crow)

# Find OpenSSL
find_package(OpenSSL REQUIRED)
include_directories(${OPENSSL_INCLUDE_DIR})

# Link RoutingKit and zlib libraries
target_link_libraries(routing_server PUBLIC
    ${CMAKE_SOURCE_DIR}/../RoutingKit/lib/libroutingkit.a
    ${ZLIB_LIBRARIES}
    pthread
    Crow::Crow
    ${OPENSSL_LIBRARIES}
)