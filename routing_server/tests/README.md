# Integration Tests for Routing Server

This directory contains integration tests for the Routing Server using Google Test and libcurl.

## Requirements

To run these tests, you need:

1. Google Test (`libgtest-dev`)
2. libcurl (`libcurl4-openssl-dev`) 

These dependencies can be easily installed on Debian/Ubuntu with:

```bash
sudo apt install libgtest-dev libcurl4-openssl-dev
```

Note that the tests use Crow's built-in JSON functionality rather than requiring a separate JSON library.

## Test Data

The tests expect the following files in a `test_data` directory:
- `test_map.osm.pbf`: A small OSM file for testing
- `test_addresses.csv`: A small address dataset

You can create these files using the extraction tools:

```bash
mkdir -p test_data
# Extract a small region from a larger OSM file
osmium extract -b 5.115,52.080,5.130,52.095 utrecht-latest.osm.pbf -o test_data/test_map.osm.pbf

# Extract addresses from the test map
../osm_files/extract_addresses.sh test_data/test_map.osm.pbf
mv *.addresses.csv.gz test_data/test_addresses.csv.gz
gunzip test_data/test_addresses.csv.gz
```

## Running Tests

Build and run the tests:

```bash
mkdir -p build && cd build
cmake ..
make
./tests/integration_tests
```

## Test Coverage

The tests cover:
1. Shortest path calculation
2. Random address generation
3. Random address in annulus
4. Error handling
5. Deterministic behavior with seeds

## How It Works

The tests spin up an actual server instance with the test data files, make HTTP requests to it using libcurl, and validate the responses. This approach ensures that the entire server pipeline is working correctly, from HTTP request handling to data processing and response generation.

## Extending Tests

To add new tests:
1. Add new test cases to `integration_tests.cpp`
2. Use the `TEST_F(RoutingServerTest, NewTestName)` macro
3. Add your test logic using Google Test assertions 