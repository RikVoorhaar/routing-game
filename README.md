# routing-game

A routing-based game where players manage employees with different vehicles and licenses to complete delivery jobs.

## Project Setup

Follow these steps to initialize the project:

### 1. Download OSM Data
Download an OpenStreetMap file for your desired region (e.g., from [Geofabrik](https://download.geofabrik.de/)):
```bash
# Example: Download a city or region OSM file
wget https://download.geofabrik.de/europe/netherlands/your-region-latest.osm.pbf
# Place the file in the osm_files/ directory
mv your-region-latest.osm.pbf osm_files/
```

### 1b. Download NUTS boundaries (GeoJSON, optional)
If you need NUTS boundaries for mapping/overlays, you can download them from [eurostat/Nuts2json](https://github.com/eurostat/Nuts2json).

This downloads **Year 2024**, **EPSG:3857 (Web Mercator)**, **scale 60M**, **type `nutsrg`**, **NUTS level 2**, in **GeoJSON**:

```bash
mkdir -p osm_files
wget -O osm_files/nutsrg_2024_3857_60M_level2.geojson \
  "https://raw.githubusercontent.com/eurostat/Nuts2json/master/pub/v2/2024/3857/60M/nutsrg_2.json"
```

### 2. Trim OSM File to Largest Component
Use the OSM utilities to extract the largest connected component:
```bash
cd osm_utils
uv run scripts/trim_to_largest_component.py ../osm_files/your-region-latest.osm.pbf -o ../osm_files/trimmed-region.osm.pbf
```

### 3. Start Routing Server and Database
Spin up the routing server and PostgreSQL database using Docker Compose:
```bash
cd routing_server
docker compose up -d
```

Wait for the containers to be healthy (you can check with `docker compose ps`).

### 4. Initialize Database Schema
Create the database tables and schema:
```bash
cd routing-app
npm install  # if not already done
npm run init-db:force
```

This will:
- Drop any existing tables
- Create all required tables (users, employees, jobs, routes, addresses, etc.)
- Set up PostGIS extensions
- Create a test user (username: `testuser`, password: `password123`)

### 5. Populate Database with Addresses
Extract addresses from the OSM file and populate the database:
```bash
cd osm_utils
uv run scripts/extract_addresses.py ../osm_files/region.osm.pbf
```
(Adjust the path to the OSM file as needed, for dev we use `utrecht-latest.osm.pbf`)

> **Note:** This will take a while to complete, depending on the size of the OSM file. In addition, _do not use the trimmed version of the OSM file_, since the trimming gets rid of most of the address nodes.

### 6. Generate Jobs
Populate the database with delivery jobs:
```bash
cd routing-app
npm run job-generator  # Generates jobs for 1% of addresses by default

# Or generate jobs for a specific fraction of addresses (use -- to pass arguments through npm)
npm run job-generator -- -f 0.002  # 0.2% of addresses
npm run job-generator -- --fraction=0.005  # 0.5% of addresses
```

### 7. Start Development Server
Start the web application:
```bash
cd routing-app
npm run dev
```

The application will be available at `http://localhost:5173`.

## Development

- **Routing Server**: Runs on `http://localhost:8050`
- **Database**: PostgreSQL with PostGIS on `localhost:5432`
- **Web App**: SvelteKit development server on `http://localhost:5173`

## Login

Use the test account to get started:
- **Username**: `testuser`
- **Password**: `password123`

Or register a new account through the web interface.

## Troubleshooting

### PostGIS Warnings
If you see warnings like "OGC WKT expected, EWKT provided" during job generation, your spatial indexes may need to be recreated. Simply run:
```bash
cd routing-app
npm run init-db:force
```

This will recreate the database with the correct PostGIS functions.