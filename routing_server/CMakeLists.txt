cmake_minimum_required(VERSION 3.10)
project(RoutingServer)

# Set C++ standard
set(CMAKE_CXX_STANDARD 14)

# Include RoutingKit headers
include_directories(../RoutingKit/include)

# Add the executable
add_executable(routing_server main.cpp)

# Find and link zlib
find_package(ZLIB REQUIRED)
include_directories(${ZLIB_INCLUDE_DIRS})

# Link RoutingKit and zlib libraries
target_link_libraries(routing_server
    ${CMAKE_SOURCE_DIR}/../RoutingKit/lib/libroutingkit.a
    ${ZLIB_LIBRARIES}
    pthread  # Add any other necessary libraries here
)