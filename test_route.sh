#!/bin/bash

# Utrecht Central Station to Utrecht University
echo "Testing route from Utrecht Central Station to Utrecht University:"
curl -s "http://localhost:8080/api/v1/shortest_path?from=52.0894,5.1102&to=52.0842,5.1722" | python3 -m json.tool

echo ""
echo "Done!" 