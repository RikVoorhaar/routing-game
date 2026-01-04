# Routing Server API Documentation

## Endpoints

### 1. Shortest Path

Find the shortest path between two geographic coordinates.

**URL:** `/api/v1/shortest_path`

**Method:** GET

**Parameters:**
- `from` (required): Source coordinates in format `latitude,longitude`
- `to` (required): Target coordinates in format `latitude,longitude`
- `max_speed` (optional): Maximum speed limit in km/h to apply to the route

**Example Request:**
```
GET /api/v1/shortest_path?from=52.0907,5.1214&to=52.0860,5.1207
```

**Example Request with Speed Limit:**
```
GET /api/v1/shortest_path?from=52.0907,5.1214&to=52.0860,5.1207&max_speed=20
```

**Example Response:**
```json
{
  "success": true,
  "travel_time_seconds": 123.4,
  "total_distance_meters": 1850,
  "path": [
    {
      "coordinates": {
        "lat": 52.0907,
        "lon": 5.1214
      },
      "cumulative_time_seconds": 0.0,
      "cumulative_distance_meters": 0,
      "max_speed_kmh": 0
    },
    {
      "coordinates": {
        "lat": 52.0890,
        "lon": 5.1210
      },
      "cumulative_time_seconds": 45.2,
      "cumulative_distance_meters": 950,
      "max_speed_kmh": 30
    },
    {
      "coordinates": {
        "lat": 52.0860,
        "lon": 5.1207
      },
      "cumulative_time_seconds": 123.4,
      "cumulative_distance_meters": 1850,
      "max_speed_kmh": 50
    }
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

### 2. Complete Job Route

Compute a complete route from employee start location → job pickup → job delivery. This endpoint combines two route legs (start→pickup and pickup→delivery) into a single route, applies speed limits and multipliers, and returns the concatenated result. This is more efficient than making two separate `/api/v1/shortest_path` calls and concatenating on the client side.

**URL:** `/api/v1/complete_job_route`

**Method:** GET

**Parameters:**
- `from` (required): Start coordinates in format `latitude,longitude` (employee/start location)
- `via` (required): Intermediate coordinates in format `latitude,longitude` (pickup location)
- `to` (required): Destination coordinates in format `latitude,longitude` (delivery location)
- `max_speed` (optional): Maximum speed limit in km/h to apply to both route legs
- `speed_multiplier` (optional): Time multiplier to apply to all segments (default: 1.0). Values < 1.0 make the route faster, > 1.0 make it slower. Applied to both walking and road segments.
- `include_path` (optional): Set to `0` or `false` to return metadata only (no path array)

**Example Request:**
```
GET /api/v1/complete_job_route?from=52.0907,5.1214&via=52.09,5.12&to=52.092,5.123
```

**Example Request with Speed Limit and Multiplier:**
```
GET /api/v1/complete_job_route?from=52.0907,5.1214&via=52.09,5.12&to=52.092,5.123&max_speed=20&speed_multiplier=0.5
```

**Example Response:**
```json
{
  "success": true,
  "travel_time_seconds": 245.8,
  "total_distance_meters": 3700,
  "path": [
    {
      "coordinates": {
        "lat": 52.0907,
        "lon": 5.1214
      },
      "cumulative_time_seconds": 0.0,
      "cumulative_distance_meters": 0,
      "max_speed_kmh": 0,
      "is_walking_segment": false
    },
    {
      "coordinates": {
        "lat": 52.09,
        "lon": 5.12
      },
      "cumulative_time_seconds": 123.4,
      "cumulative_distance_meters": 1850,
      "max_speed_kmh": 30,
      "is_walking_segment": false
    },
    {
      "coordinates": {
        "lat": 52.092,
        "lon": 5.123
      },
      "cumulative_time_seconds": 245.8,
      "cumulative_distance_meters": 3700,
      "max_speed_kmh": 50,
      "is_walking_segment": false
    }
  ]
}
```

**Error Responses:**

If no route is found from start to pickup:
```json
{
  "error": "No route found from start to pickup location",
  "success": false
}
```

If no route is found from pickup to delivery:
```json
{
  "error": "No route found from pickup to delivery location",
  "success": false
}
```

If coordinates are invalid or missing:
```json
{
  "error": "Invalid or missing coordinates. Format: /api/v1/complete_job_route?from=latitude,longitude&via=latitude,longitude&to=latitude,longitude",
  "success": false
}
```

**Notes:**
- The route is computed as two legs: `from→via` and `via→to`
- Both legs are computed independently, so if either fails, the entire request fails
- The `cumulative_time_seconds` and `cumulative_distance_meters` in the path are offset so that the second leg continues from where the first leg ends
- The `speed_multiplier` is applied to all cumulative times (both walking and road segments)
- The response format matches `/api/v1/shortest_path` for consistency

### 3. Closest Address

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

### 4. Health Check

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

## Response Format Details

### Path Points
Each point in the path array contains:
- `coordinates`: Object with `lat` and `lon` values
- `cumulative_time_seconds`: Total travel time from start to this point (in seconds)
- `cumulative_distance_meters`: Total distance from start to this point (in meters)
- `max_speed_kmh`: Speed limit on the road segment leading to this point (in km/h, 0 for starting point)

### Speed Limiting
When the `max_speed` parameter is provided:
- All road segments are capped at the specified speed limit
- Travel times are recalculated based on the effective speeds
- The `max_speed_kmh` field shows the effective speed used (original speed or the limit, whichever is lower)
- The total `travel_time_seconds` reflects the adjusted travel time

## Address CSV Format

The address CSV file should have the following format:
```
id lon lat street housenumber postcode city
```

You can use the provided `extract_addresses.sh` script in the `osm_files` directory to extract addresses from an OSM PBF file:

```bash
./extract_addresses.sh utrecht-latest.osm.pbf
``` 