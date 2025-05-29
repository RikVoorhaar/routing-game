# Routing Server

A server for routing and address-related queries based on OpenStreetMap data.

## Features

- Shortest path calculation between two points
- Random address selection
- Random address selection within an annular region (ring)
- Support for deterministic random selection with seed values

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

A test script is provided to test the API endpoints:

```bash
./test_api.sh
```

This script requires `curl` and `jq` for proper operation.

## Example Queries

1. Get a random address:
```
http://localhost:8080/api/v1/random_address
```

2. Get a random address with a seed for deterministic results:
```
http://localhost:8080/api/v1/random_address?seed=42
```

3. Get a random address within an annular region:
```
http://localhost:8080/api/v1/random_address_in_annulus?center=52.0907,5.1214&r_min=100&r_max=1000
```

4. Calculate the shortest path between two points:
```
http://localhost:8080/api/v1/shortest_path?from=52.0907,5.1214&to=52.0860,5.1207
``` 