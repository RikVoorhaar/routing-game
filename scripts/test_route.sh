#!/bin/bash

# Utrecht Central Station to Utrecht University
echo "Testing route from Utrecht Central Station to Utrecht University:"
curl -s "http://localhost:8080/api/v1/shortest_path?from=52.09253484150793,5.111520842609455&to=52.08562550008611,5.170992682974793" | python3 -m json.tool
echo ""
