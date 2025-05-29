#!/bin/bash

set -e

# Ensure RoutingKit is built
if [ ! -d "../RoutingKit" ]; then
    echo "Error: RoutingKit directory not found in parent directory!"
    echo "Please clone the RoutingKit repository to the parent directory:"
    echo "git clone https://github.com/RoutingKit/RoutingKit.git ../RoutingKit"
    exit 1
fi

# Check if RoutingKit is built
if [ ! -f "../RoutingKit/lib/libroutingkit.a" ] && [ ! -f "../RoutingKit/lib/libroutingkit.so" ]; then
    echo "Building RoutingKit..."
    cd ../RoutingKit
    make -j$(nproc)
    cd - > /dev/null
fi

# Check if osm_files directory exists
if [ ! -d "../osm_files" ]; then
    echo "Warning: osm_files directory not found in parent directory!"
    echo "Creating empty directory..."
    mkdir -p ../osm_files
fi

# Check if the OSM file exists
if [ ! -f "../osm_files/utrecht-latest.osm.pbf" ]; then
    echo "Warning: utrecht-latest.osm.pbf not found in ../osm_files directory!"
    echo "You may need to download it before running the service."
fi

# Build the routing server
echo "Building routing server..."
mkdir -p build
cd build
cmake ..
make -j$(nproc)
cd ..

# Run the service directly without Docker
echo "Starting routing server on port 8050..."
./build/routing_server ../osm_files/utrecht-latest.osm.pbf 