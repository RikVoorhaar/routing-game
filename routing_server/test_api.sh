#!/bin/bash

# Test script for routing server API endpoints
# Requires curl and jq to be installed

SERVER_URL="http://localhost:8080"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to test an API endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=$3

    echo -e "\n-------------------------------------------------------------"
    echo "Testing endpoint: $name"
    echo "URL: $url"
    echo "Expected status: $expected_status"
    echo "-------------------------------------------------------------"

    # Make the request and capture the response
    response=$(curl -s -w "%{http_code}" -o response_body.json "$url")
    
    # Check if status code matches expected
    if [ "$response" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓ Status code: $response ${NC}"
    else
        echo -e "${RED}✗ Status code: $response (expected $expected_status) ${NC}"
    fi
    
    # Pretty print the response body if jq is available
    if command -v jq &> /dev/null; then
        echo "Response body:"
        jq . response_body.json
    else
        echo "Response body (install jq for pretty printing):"
        cat response_body.json
    fi
}

# Test shortest path endpoint
test_shortest_path() {
    local from_lat=$1
    local from_lon=$2
    local to_lat=$3
    local to_lon=$4
    
    test_endpoint "Shortest Path" \
        "$SERVER_URL/api/v1/shortest_path?from=$from_lat,$from_lon&to=$to_lat,$to_lon" \
        200
}

# Test random address endpoint
test_random_address() {
    test_endpoint "Random Address" \
        "$SERVER_URL/api/v1/random_address" \
        200
        
    # Test with seed for deterministic results
    test_endpoint "Random Address with Seed" \
        "$SERVER_URL/api/v1/random_address?seed=42" \
        200
}

# Test random address in annulus endpoint
test_random_address_in_annulus() {
    local center_lat=$1
    local center_lon=$2
    local r_min=$3
    local r_max=$4
    
    test_endpoint "Random Address in Annulus" \
        "$SERVER_URL/api/v1/random_address_in_annulus?center=$center_lat,$center_lon&r_min=$r_min&r_max=$r_max" \
        200
        
    # Test with seed for deterministic results
    test_endpoint "Random Address in Annulus with Seed" \
        "$SERVER_URL/api/v1/random_address_in_annulus?center=$center_lat,$center_lon&r_min=$r_min&r_max=$r_max&seed=42" \
        200
}

echo "==================================================================="
echo "                   ROUTING SERVER API TESTS                         "
echo "==================================================================="

# Test all endpoints
test_shortest_path 52.0907 5.1214 52.0860 5.1207
test_random_address
test_random_address_in_annulus 52.0907 5.1214 100 1000

# Clean up
rm -f response_body.json

echo -e "\nAPI tests completed." 