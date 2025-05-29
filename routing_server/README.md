# Routing Server

A server for routing and address-related queries based on OpenStreetMap data.

## Features

- Shortest path calculation between two points
- Finding the closest address to a location
- Support for OpenStreetMap PBF data files
- Support for address databases in CSV format

## Building

1. Make sure you have the required dependencies:
   - CMake 3.10+
   - C++17 compiler
   - Crow HTTP framework
   - OpenSSL
   - ZLib
   - RoutingKit library

2. Build using CMake:
```bash
mkdir -p build
cd build
cmake ..
make
```

## Running

The server requires an OSM file in PBF format and optionally an address CSV file:

```bash
./routing_server <osm_file> [addresses_csv_file]
```

Example:
```bash
./routing_server utrecht-latest.osm.pbf utrecht.addresses.csv.gz
```

The server will start on port 8080 by default.

## Quick Start with docker-run.sh

For a quick setup without Docker, you can use the provided script that:
1. Checks for and builds RoutingKit if needed
2. Builds the routing server
3. Runs the server on port 8050

```bash
./docker-run.sh
```

This script assumes:
- The RoutingKit repository is in the parent directory (`../RoutingKit`)
- The OpenStreetMap data is in `../osm_files/utrecht-latest.osm.pbf`

## Docker

You can also run the routing server using Docker:

### Building the Docker image

```bash
cd routing_server
docker build -t routing-server .
```

### Running with Docker

```bash
docker run -p 8050:8080 \
  -v /path/to/osm_files:/data/osm \
  -e OSM_FILE=/data/osm/utrecht-latest.osm.pbf \
  -e ADDRESS_FILE=/data/osm/utrecht.addresses.csv.gz \
  routing-server
```

### Using Docker Compose

A docker-compose.yml file is provided for convenience:

```bash
cd routing_server
docker-compose up -d
```

This will:
1. Build the Docker image if not already built
2. Mount the ../osm_files directory to /data/osm in the container
3. Configure the server to use utrecht-latest.osm.pbf
4. Start the server on port 8050

## Address CSV Format

The address CSV file should have the following format:
```
id lon lat street housenumber postcode city
```

You can use the provided `extract_addresses.sh` script in the `osm_files` directory to extract addresses from an OSM PBF file:

```bash
./extract_addresses.sh utrecht-latest.osm.pbf
```

## API Documentation

See the [API_DOCUMENTATION.md](API_DOCUMENTATION.md) file for detailed API documentation.

## Testing

Integration tests are provided in the `tests/` directory and can be run after building:

```bash
cd build
ctest
```

## Example Queries

1. Find the closest address to a location:
```
http://localhost:8080/api/v1/closest_address?location=52.0907,5.1214
```

2. Calculate the shortest path between two points:
```
http://localhost:8080/api/v1/shortest_path?from=52.0907,5.1214&to=52.0860,5.1207
``` 