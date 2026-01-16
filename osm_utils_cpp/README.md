# OSM Utils C++

C++ utility for extracting and categorizing places from OpenStreetMap data with region classification.

## Building the Docker Image

Build the Docker image:

```bash
cd osm_utils_cpp
docker build -t osm_utils_cpp .
```

This will:
- Install all required dependencies (libosmium, GEOS, yaml-cpp, etc.)
- Compile `extract_categorized_places` executable
- Create a Docker image ready to run

## Usage

### `extract_categorized_places`

Extracts and categorizes places from OSM data using a YAML configuration file. Performs reservoir sampling to limit the number of places per category and region.

> **Note:** `trim_and_extract` is deprecated and should not be used.

#### Arguments

```
Usage: extract_categorized_places <input.osm.pbf> --config <config.yaml> --regions-geojson <regions.geojson> [--output <output.csv.gz>]

Required:
  <input.osm.pbf>          Input OSM file in PBF format
  --config <file>           Path to YAML configuration file with category definitions
  --regions-geojson <file>  Path to NUTS regions GeoJSON file (must be combined_01m.geojson)

Optional:
  --output <file>           Output CSV file path (default: <input>.places.csv.gz)
```

#### Configuration File Format

The YAML configuration file defines categories and their matching rules:

```yaml
categories:
  - name: residential
    max_per_region: 100
    tags:
      - landuse=residential
      - building=residential
      - building=house
      - building=apartments
  - name: restaurant
    max_per_region: 100
    tags:
      - amenity=restaurant
      - amenity=cafe
      - amenity=fast_food
  # ... more categories
```

**Fields:**
- `name`: Category name (used in output CSV)
- `max_per_region`: Maximum number of places to sample per category per NUTS region (default: 100)
- `tags`: List of OSM tag patterns to match:
  - `key=value`: Exact match
  - `key=*`: Match any value for the key

#### Output Format

The output CSV file contains the following columns:
- `id`: OSM object ID
- `category`: Category name from config
- `lat`: WGS84 latitude
- `lon`: WGS84 longitude
- `x_mercator`: Web Mercator X coordinate (EPSG:3857)
- `y_mercator`: Web Mercator Y coordinate (EPSG:3857)
- `region`: NUTS2 region code (e.g., "NL31")
- `is_node`: 1 if object is a node, 0 otherwise
- `is_way`: 1 if object is a way, 0 otherwise
- `is_relation`: 1 if object is a relation, 0 otherwise
- `tags`: JSON string of all OSM tags

#### Examples

**Extract categorized places (with named container):**
```bash
docker run --name extract_places \
  -v "$(pwd)/osm_files:/data" \
  -w /app/osm_utils_cpp/build \
  osm_utils_cpp \
  ./extract_categorized_places /data/netherlands-latest.osm.pbf \
    --config /app/osm_utils_cpp/place_categories.yaml \
    --regions-geojson /data/regions/combined_01m.geojson \
    --output /data/netherlands-latest.places.csv.gz
```

**View logs from a running or completed container:**
```bash
# Follow logs in real-time (if container is running)
docker logs -f extract_places

# View all logs from a completed container
docker logs extract_places

# View last 100 lines of logs
docker logs --tail 100 extract_places

# View logs with timestamps
docker logs -t extract_places
```

**Run in detached mode and check logs later:**
```bash
# Start container in background
docker run -d --name extract_places \
  -v "$(pwd)/osm_files:/data" \
  -w /app/osm_utils_cpp/build \
  osm_utils_cpp \
  ./extract_categorized_places /data/netherlands-latest.osm.pbf \
    --config /app/osm_utils_cpp/place_categories.yaml \
    --regions-geojson /data/regions/combined_01m.geojson \
    --output /data/netherlands-latest.places.csv.gz

# Check if container is still running
docker ps -a | grep extract_places

# View logs
docker logs -f extract_places

# Clean up after completion
docker rm extract_places
```

## Volume Mounts

When running Docker commands, mount your data directories:

- **OSM files**: Mount `osm_files/` to `/data` in the container
- **Config files**: Mount `osm_utils_cpp/` to `/app/osm_utils_cpp` to access `place_categories.yaml`
- **Output**: Write to `/data/` to save files in your `osm_files/` directory

## Processing Details

### Reservoir Sampling

The `extract_categorized_places` tool uses reservoir sampling to uniformly sample a fixed number of places per category per region in a single pass. This ensures:

- Uniform distribution of sampled places
- Memory-efficient processing (single pass)
- Configurable limits per category/region

### Region Classification

Places are classified into NUTS2 regions using:
- Point-in-polygon spatial queries (GEOS library)
- Web Mercator coordinates for efficient lookups
- Single-pass processing (no pre-computation needed)

### Coordinate Systems

- **Input**: OSM data uses WGS84 (EPSG:4326)
- **Regions**: GeoJSON uses Web Mercator (EPSG:3857)
- **Output**: Both WGS84 and Web Mercator coordinates included

## Performance

Processing times vary by file size:
- **Netherlands OSM** (~2GB): ~5-10 minutes
- Progress updates every 5 seconds
- Memory usage: ~150-200 MB

### Memory Usage for Large Files

For very large OSM files (e.g., Europe with ~450M ways), RAM usage can reach ~34-42 GB during way processing. This is caused by random reads from the `node_index_` memory-mapped file (`SparseFileArray`) touching many different pages. Both nodes and ways arrive sequentially in the OSM file, but during node processing sparse writes (many nodes skipped) only touch a small fraction of pages (~250 MB RSS). During way processing, even though ways arrive sequentially, random node ID lookups (ways reference nodes anywhere in the ID space) cause page faults that gradually touch most of the ~86 GB node_index_ file's pages, causing RSS to grow. Each accessed page becomes part of RSS (file-backed pages from mmap). This is safe behavior - RSS from file-backed pages is evictable and the OS will automatically evict pages if memory pressure occurs. The high RAM usage observed is because the system has plenty of RAM available (48GB+); on systems with less RAM, the OS would evict pages more aggressively and RAM usage would be lower. The process completes successfully regardless.

## Viewing Logs

When running containers with names, you can easily view their output:

```bash
# View all logs from a container
docker logs <container_name>

# Follow logs in real-time (like tail -f)
docker logs -f <container_name>

# View last N lines
docker logs --tail 100 <container_name>

# View logs with timestamps
docker logs -t <container_name>

# View logs since a specific time
docker logs --since 10m <container_name>
```

**Example workflow:**
```bash
# Run extraction with named container
docker run --name extract_places \
  -v "$(pwd)/osm_files:/data" \
  -w /app/osm_utils_cpp/build \
  osm_utils_cpp \
  ./extract_categorized_places /data/netherlands-latest.osm.pbf \
    --config /app/osm_utils_cpp/place_categories.yaml \
    --regions-geojson /data/regions/combined_01m.geojson \
    --output /data/netherlands-latest.places.csv.gz

# In another terminal, follow progress in real-time
docker logs -f extract_places

# After completion, save logs to file
docker logs extract_places > extraction.log

# Clean up
docker rm extract_places
```

## Troubleshooting

### Missing Dependencies

All dependencies are included in the Dockerfile:
- libosmium (header-only)
- GEOS (spatial operations)
- yaml-cpp (YAML parsing)
- nlohmann/json (JSON handling)

### Region Classification Issues

- Ensure GeoJSON file is in Web Mercator (EPSG:3857)
- Check that region codes in GeoJSON match those in your data
- Verify file paths are correct in Docker volume mounts

### Docker Build Issues

**View build logs:**
```bash
# Build and save logs to file
docker build -t osm_utils_cpp . 2>&1 | tee build.log

# Or view build progress in real-time with detailed output
docker build -t osm_utils_cpp . --progress=plain
```
