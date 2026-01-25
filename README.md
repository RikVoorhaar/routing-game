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

### 1b. Download NUTS boundaries (GeoJSON)
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

### 2. Trim OSM File and Extract Addresses
Compile the C++ trimming tool, then use it to trim the OSM file to the largest connected component and extract addresses:
```bash
# First, compile the C++ tool
cd osm_utils_cpp
cmake -B build
cmake --build build

# Then run it to trim and extract addresses
cd build
./trim_and_extract ../../osm_files/your-region-latest.osm.pbf --output ../../osm_files/trimmed-region.osm.pbf --output-dir ../../osm_files
```

This will:
- Generate a trimmed OSM file with only the necessary nodes and ways, in PBF format
- Extract addresses to a CSV file (compressed as `.csv.gz`)

**Note:** The routing server requires the trimmed OSM file, so this step must be completed before starting the server.

### 2b. Configure Docker Compose
Update the `routing_server/docker-compose.yml` file to point to your trimmed OSM file and address CSV file. Edit the `environment` section of the `routing-server` service:

```yaml
environment:
  - OSM_FILE=/data/osm/trimmed-region.osm.pbf  # Update to your trimmed OSM file name
  - ADDRESS_FILE=/data/osm/your-region-latest.addresses.csv.gz  # Update to your address CSV file name
  - ROUTING_TIMING=1
```

The paths are relative to `/data/osm` inside the container, which maps to `osm_files/` on your host machine.

### 3. Start Routing Server and Database
Spin up the routing server and PostgreSQL database using Docker Compose:
```bash
cd routing_server
docker compose up -d
```

Wait for the containers to be healthy (you can check with `docker compose ps`).

> **Note on Memory Requirements:** The first time the routing server starts, it needs significantly more memory because it builds the contraction hierarchy (CH) data structure. For the Europe map, this requires approximately **62GB of RAM at peak** during CH construction. Once the CH has been built and the server is running, it only requires around **32GB of RAM**. If memory is tight, we recommend building the CH on a machine with more memory, then copying the generated files to your target machine.

### 4. Initialize Database Schema
Create the database tables and schema:
```bash
cd routing-app
npm install  # if not already done
npm run init-db:force
```

This will:
- Drop any existing tables
- Create all required tables (users, employees, jobs, routes, addresses, regions, etc.)
- Set up PostGIS extensions
- Create a test user (username: `testuser`, password: `password123`)

### 4c. Seed Database with Regions
Populate the regions table from the combined GeoJSON file:
```bash
cd osm_utils
uv run scripts/seed_regions_from_geojson.py ../osm_files/regions/combined_10m.geojson
```

This extracts unique NUTS regions (code, country code, and Latin name) from the GeoJSON and inserts them into the database.

### 5. Populate Database with Addresses
Extract addresses from the CSV file and populate the database with per-region sampling:
```bash
cd osm_utils
uv run scripts/extract_addresses_from_csv.py ../osm_files/europe-latest.addresses_with_regions.csv.gz --region-counts-file ../osm_files/europe-latest.addresses_with_regions_region_counts.csv
```

This will:
- Sample addresses per region (default: up to 1000 addresses per region)
- Exclude ES63 and ES64 by default (small, geographically isolated regions)
- Use the region counts file to compute per-region sampling probabilities
- Insert addresses with their `nuts_region_code` as the `region` foreign key

> **Note:** This will take a while to complete, depending on the size of the CSV file. The script samples addresses uniformly within each region to keep the dataset manageable.


### 6. Load osm data into postgis
Install `osm2pgsql` and run `./scripts/ingest_osm.sh osm_files/europe-latest.osm.pbf europe 2>&1 | tee scripts/logs/europe-import.log`. This will need around 300GB of disk space free during processing (but will only take up around 100GB of space in the database).

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