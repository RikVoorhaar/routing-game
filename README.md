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
Download NUTS region boundaries from [Eurostat GISCO](https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/territorial-units-statistics).

You'll need both **2024** and **2021** versions, and choose either **01M** (1M, higher resolution) or **10M** (10M, lower resolution) scale:
- **01M**: Higher detail (~60MB), better for offline address classification
- **10M**: Lower detail (~4MB), suitable for web overlay

Download the following files and place them in `osm_files/regions/`:
- `NUTS_RG_01M_2024_3857.geojson` (or `NUTS_RG_10M_2024_3857.geojson`)
- `NUTS_RG_01M_2021_3857.geojson` (or `NUTS_RG_10M_2021_3857.geojson`)

**Note:** Due to Brexit, the UK was removed from NUTS 2024. To include UK regions, combine the datasets:

```bash
cd osm_utils
uv run scripts/combine_nuts_with_uk.py --resolution 01M  # or 10M
uv run scripts/combine_nuts_with_uk.py --resolution 10M
```

This creates `combined_01m.geojson` and `combined_10m.geojson` in `osm_files/regions/` with all 2024 regions plus UK regions from 2021.

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