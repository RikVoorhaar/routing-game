cmake_minimum_required(VERSION 3.10)
project(trim_and_extract)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add compile options
add_compile_options(-Wall -Wextra)

# Find zlib
find_package(ZLIB REQUIRED)

# Include directories
# libosmium is header-only, installed at /usr/include/osmium
include_directories(
    /usr/include
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/third_party
    ${ZLIB_INCLUDE_DIRS}
)

# Source files
set(SOURCES
    src/trim_and_extract.cpp
)

# Add the executable
add_executable(trim_and_extract ${SOURCES})

# Link libraries
# libosmium is header-only, no library to link
target_link_libraries(trim_and_extract
    ${ZLIB_LIBRARIES}
    pthread
)

