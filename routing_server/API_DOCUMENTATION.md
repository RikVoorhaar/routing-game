# Routing Server API Documentation

## Endpoints

### 1. Shortest Path

Find the shortest path between two geographic coordinates.

**URL:** `/api/v1/shortest_path`

**Method:** GET

**Parameters:**
- `from` (required): Source coordinates in format `latitude,longitude`
- `to` (required): Target coordinates in format `latitude,longitude`

**Example Request:**
```
GET /api/v1/shortest_path?from=52.0907,5.1214&to=52.0860,5.1207
```

**Example Response:**
```json
{
  "success": true,
  "travel_time_seconds": 123.4,
  "path": [
    [52.0907, 5.1214],
    [52.0890, 5.1210],
    [52.0860, 5.1207]
  ]
}
```

**Error Response:**
```json
{
  "error": "No node within 1000m from source position",
  "success": false
}
```

### 2. Closest Address

Find the closest address to a geographic coordinate.

**URL:** `/api/v1/closest_address`

**Method:** GET

**Parameters:**
- `location` (required): Coordinates in format `latitude,longitude`

**Example Request:**
```
GET /api/v1/closest_address?location=52.0907,5.1214
```

**Example Response:**
```json
{
  "id": 12345,
  "lat": 52.0872,
  "lon": 5.1198,
  "street": "Main Street",
  "housenumber": "42",
  "postcode": "3511AB",
  "city": "Utrecht"
}
```

**Error Response:**
```json
{
  "error": "No addresses loaded. Start server with address CSV file.",
  "success": false
}
```

### 3. Health Check

Check the health and status of the routing server.

**URL:** `/health`

**Method:** GET

**Parameters:** None

**Example Request:**
```
GET /health
```

**Example Response:**
```json
{
  "status": "ok",
  "engine_initialized": true,
  "node_count": 123456,
  "arc_count": 234567,
  "address_count": 34567
}
```

## Address CSV Format

The address CSV file should have the following format:
```
id lon lat street housenumber postcode city
```

You can use the provided `extract_addresses.sh` script in the `osm_files` directory to extract addresses from an OSM PBF file:

```bash
./extract_addresses.sh utrecht-latest.osm.pbf
``` 