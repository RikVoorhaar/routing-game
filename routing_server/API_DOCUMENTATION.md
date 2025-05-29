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
  "source_node": 123456,
  "target_node": 789012,
  "travel_time_ms": 1234,
  "query_time_us": 456,
  "success": true,
  "path": [
    {
      "lat": 52.0907,
      "lon": 5.1214,
      "time_ms": 0,
      "node_id": 123456
    },
    {
      "lat": 52.0890,
      "lon": 5.1210,
      "time_ms": 578,
      "node_id": 345678
    },
    {
      "lat": 52.0860,
      "lon": 5.1207,
      "time_ms": 1234,
      "node_id": 789012
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

### 2. Random Address

Get a random address from the loaded address dataset.

**URL:** `/api/v1/random_address`

**Method:** GET

**Parameters:**
- `seed` (optional): Integer seed for the random number generator to get deterministic results

**Example Request:**
```
GET /api/v1/random_address
```

**Example Request with Seed:**
```
GET /api/v1/random_address?seed=42
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

### 3. Random Address in Annulus

Get a random address within an annular region (ring) around a center point.

**URL:** `/api/v1/random_address_in_annulus`

**Method:** GET

**Parameters:**
- `center` (required): Center coordinates in format `latitude,longitude`
- `r_min` (required): Minimum radius in meters
- `r_max` (required): Maximum radius in meters
- `seed` (optional): Integer seed for the random number generator to get deterministic results

**Example Request:**
```
GET /api/v1/random_address_in_annulus?center=52.0907,5.1214&r_min=100&r_max=1000
```

**Example Request with Seed:**
```
GET /api/v1/random_address_in_annulus?center=52.0907,5.1214&r_min=100&r_max=1000&seed=42
```

**Example Response:**
```json
{
  "id": 23456,
  "lat": 52.0945,
  "lon": 5.1275,
  "street": "Park Avenue",
  "housenumber": "17",
  "postcode": "3512CD",
  "city": "Utrecht"
}
```

**Error Response:**
```json
{
  "error": "Invalid or missing annulus parameters. Format: /api/v1/random_address_in_annulus?center=latitude,longitude&r_min=min_radius&r_max=max_radius[&seed=random_seed]",
  "success": false
}
```

## Address CSV Format

The address CSV file should have the following format:
```
id lon lat street housenumber postcode city
```

For example:
```
1 5.1214 52.0907 Main 42 3511AB Utrecht
2 5.1275 52.0945 Park 17 3512CD Utrecht
```

The server supports both regular CSV files and gzipped CSV files (with `.gz` extension). 