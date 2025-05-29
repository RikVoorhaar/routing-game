cmake_minimum_required(VERSION 3.10)
project(RoutingServer)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)

# Add compile options
add_compile_options(-Wall -Wextra)

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

# Install documentation and test scripts
install(FILES
    API_DOCUMENTATION.md
    DESTINATION ${CMAKE_INSTALL_PREFIX}/share/routing_server
)

install(FILES
    test_api.sh
    DESTINATION ${CMAKE_INSTALL_PREFIX}/share/routing_server/tests
    PERMISSIONS OWNER_READ OWNER_WRITE OWNER_EXECUTE GROUP_READ GROUP_EXECUTE WORLD_READ WORLD_EXECUTE
)

# Add tests subdirectory
add_subdirectory(tests)