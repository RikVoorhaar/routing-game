cmake_minimum_required(VERSION 3.10)
project(RoutingServer)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)

# Add compile options
add_compile_options(-Wall -Wextra)

# Check for system installed RoutingKit
if(EXISTS "/usr/local/include/routingkit")
    set(ROUTINGKIT_INCLUDES "/usr/local/include")
    set(ROUTINGKIT_LIB_DIR "/usr/local/lib")
    message(STATUS "Using system-installed RoutingKit")
# Check for external RoutingKit directory
elseif(EXISTS "/external/RoutingKit")
    set(ROUTINGKIT_INCLUDES "/external/RoutingKit/include")
    set(ROUTINGKIT_LIB_DIR "/external/RoutingKit/lib")
    message(STATUS "Using mounted RoutingKit from /external/RoutingKit")
else()
    set(ROUTINGKIT_INCLUDES "${CMAKE_SOURCE_DIR}/../RoutingKit/include")
    set(ROUTINGKIT_LIB_DIR "${CMAKE_SOURCE_DIR}/../RoutingKit/lib")
    message(STATUS "Using RoutingKit from parent directory: ${CMAKE_SOURCE_DIR}/../RoutingKit")
endif()

# Include directories
include_directories(
    ${ROUTINGKIT_INCLUDES}
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
if(EXISTS "${ROUTINGKIT_LIB_DIR}/libroutingkit.a")
    message(STATUS "Using static RoutingKit library from ${ROUTINGKIT_LIB_DIR}")
    target_link_libraries(routing_server PUBLIC
        ${ROUTINGKIT_LIB_DIR}/libroutingkit.a
        ${ZLIB_LIBRARIES}
        pthread
        Crow::Crow
        ${OPENSSL_LIBRARIES}
    )
elseif(EXISTS "${ROUTINGKIT_LIB_DIR}/libroutingkit.so")
    message(STATUS "Using shared RoutingKit library from ${ROUTINGKIT_LIB_DIR}")
    target_link_libraries(routing_server PUBLIC
        ${ROUTINGKIT_LIB_DIR}/libroutingkit.so
        ${ZLIB_LIBRARIES}
        pthread
        Crow::Crow
        ${OPENSSL_LIBRARIES}
    )
else()
    message(FATAL_ERROR "RoutingKit library not found in ${ROUTINGKIT_LIB_DIR}")
endif()

# Install documentation
install(FILES
    API_DOCUMENTATION.md
    DESTINATION ${CMAKE_INSTALL_PREFIX}/share/routing_server
)

# Add tests subdirectory only if testing is enabled
include(CTest)
if(BUILD_TESTING)
    add_subdirectory(tests)
endif()