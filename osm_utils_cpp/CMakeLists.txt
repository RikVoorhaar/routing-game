cmake_minimum_required(VERSION 3.10)
project(trim_and_extract)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add compile options
add_compile_options(-Wall -Wextra -O3)

# Find zlib
find_package(ZLIB REQUIRED)

# Find GEOS
find_package(GEOS REQUIRED)
if(GEOS_INCLUDE_DIRS)
    message(STATUS "GEOS_INCLUDE_DIRS: ${GEOS_INCLUDE_DIRS}")
else()
    # Fallback: GEOS headers are typically in /usr/include/geos
    set(GEOS_INCLUDE_DIRS "/usr/include")
endif()

# Find yaml-cpp
find_package(yaml-cpp REQUIRED)

# Include directories
# libosmium is header-only, installed at /usr/include/osmium
include_directories(
    /usr/include
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/third_party
    ${ZLIB_INCLUDE_DIRS}
    ${GEOS_INCLUDE_DIRS}
    ${YAML_CPP_INCLUDE_DIRS}
)

# Source files for trim_and_extract
set(TRIM_SOURCES
    src/trim_and_extract.cpp
)

# Add the trim_and_extract executable
add_executable(trim_and_extract ${TRIM_SOURCES})

# Link libraries for trim_and_extract
# libosmium is header-only, no library to link
target_link_libraries(trim_and_extract
    ${ZLIB_LIBRARIES}
    pthread
)

# Source files for extract_categorized_places
set(CATEGORIZED_SOURCES
    src/extract_categorized_places.cpp
    src/CategoryMatcher.cpp
    src/NUTSRegionLookup.cpp
    src/PlaceExtraction.cpp
)

# Add the extract_categorized_places executable
add_executable(extract_categorized_places ${CATEGORIZED_SOURCES})# Link libraries for extract_categorized_places
target_link_libraries(extract_categorized_places
    ${ZLIB_LIBRARIES}
    ${GEOS_LIBRARIES}
    geos
    yaml-cpp
    pthread
)
