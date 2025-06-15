# Address Distribution Analysis Tool

This tool analyzes the spatial distribution of addresses across a configurable grid system using the routing server's API endpoints.

## Usage

```bash
npm run analyze-addresses [chunk_size_km]
```

Where `chunk_size_km` is the optional chunk size in kilometers (default: 0.5km).

## Examples

```bash
# Analyze with default 500m × 500m chunks
npm run analyze-addresses

# Analyze with 1km × 1km chunks
npm run analyze-addresses 1.0

# Analyze with 250m × 250m chunks  
npm run analyze-addresses 0.25
```

## How it Works

1. **Fetches Address Bounding Box**: Gets the min/max coordinates of all addresses
2. **Creates Chunk Grid**: Divides the area into a grid of equal-sized chunks
3. **Samples Addresses**: Uses pagination to analyze 0.1% of all addresses with a consistent seed
4. **Bins Addresses**: Assigns each address to its corresponding chunk
5. **Analyzes Distribution**: Calculates statistics and generates reports

## Output

The tool provides:

- **Grid Statistics**: Total chunks, occupancy rate, grid dimensions
- **Distribution Statistics**: Min/max/mean/median addresses per chunk
- **Top 10 Chunks**: The chunks with the highest address density
- **ASCII Histogram**: Visual distribution of address counts per chunk

## Configuration

Key parameters can be modified in the script:

- `SAMPLE_PERCENTAGE`: Percentage of addresses to analyze (default: 0.1%)
- `CONSISTENT_SEED`: Random seed for reproducible results (default: 42)
- Chunk size: Configurable via command line argument

## Technical Details

- Uses the `ChunkGrid` class from `coordinateGrid.ts` for spatial indexing
- Leverages the routing server's API endpoints:
  - `getAddressBbox()`: Address bounding box
  - `getNumAddresses()`: Total address count
  - `getAddressSample()`: Paginated address sampling
- Processes addresses in batches of 1000 for efficient memory usage
- Creates an ASCII histogram with adaptive binning

## Example Output

```
🚀 Address Distribution Analysis Tool
Chunk size: 0.5km × 0.5km
Sample rate: 0.1%
Random seed: 42

📐 Fetching address bounding box...
Bounding box: lat[51.856195, 52.304860], lon[4.791870, 5.627450]

🗺️  Creating 0.5km × 0.5km chunk grid...
Grid dimensions: 115 × 100 = 11500 chunks

📊 DISTRIBUTION STATISTICS
════════════════════════════
Total addresses analyzed: 754
Total chunks in grid: 11,500
Chunks with addresses: 552 (4.8%)
Chunk occupancy rate: 4.8%

Addresses per chunk (for occupied chunks):
  Min: 1
  Max: 6
  Mean: 1.37
  Median: 1.00
  Std Dev: 0.71

🏆 TOP 10 CHUNKS BY ADDRESS COUNT:
══════════════════════════════════
 1. Chunk ( 44,  46):    6 addresses [52.0958, 5.1175]
 2. Chunk ( 53,  40):    5 addresses [52.1227, 5.1833]
 ...

📊 HISTOGRAM: Address Count Distribution
════════════════════════════════════════
       1 addresses: ██████████████████████████████████████████████████  408 chunks
       2 addresses: ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  101 chunks
       3 addresses: ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   31 chunks
```

This analysis helps understand the spatial density patterns of addresses across the region. 