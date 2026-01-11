# %%
"""
Notebook-style utilities for converting addresses/buildings CSV to GeoParquet
and performing spatial queries with NUTS2 boundaries.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

# %%
def csv_to_geoparquet_by_region(
    csv_path: str | Path,
    output_dir: Optional[str | Path] = None,
    crs: str = "EPSG:4326",
    target_crs: str = "EPSG:3857",
    batch_size: int = 100000,
    geojson_path: Optional[str | Path] = None,
) -> dict[str, Path]:
    """
    Convert addresses/buildings CSV to GeoParquet files, one per NUTS2 region.
    
    Processes in batches to minimize memory usage and creates separate parquet files
    for each NUTS2 region.
    
    Returns
    -------
    dict[str, Path]
        Dictionary mapping NUTS2 region codes to their parquet file paths
    """
    csv_path = Path(csv_path)
    
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")
    
    # Determine output directory - use subdirectory for region files
    if output_dir is None:
        output_dir = csv_path.parent / "addresses_by_region"
    else:
        output_dir = Path(output_dir) / "addresses_by_region"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Converting {csv_path.name} to GeoParquet files (one per NUTS2 region)...")
    
    # Load NUTS2 boundaries for spatial lookups
    print("Loading NUTS2 boundaries...")
    gdf_nuts2 = load_nuts2_boundaries(geojson_path)
    id_col = "id" if "id" in gdf_nuts2.columns else "NUTS_ID"
    
    # Spatial index is created automatically by GeoPandas sjoin
    
    # Track parquet files per region
    region_files: dict[str, Path] = {}
    region_writers: dict[str, list[gpd.GeoDataFrame]] = {}
    region_counts: dict[str, int] = {}
    
    # Process CSV in batches
    print(f"Processing CSV in batches of {batch_size:,} rows...")
    
    chunk_iter = pd.read_csv(
        csv_path if csv_path.suffix != ".gz" else gzip.open(csv_path, "rt", encoding="utf-8"),
        chunksize=batch_size
    )
    
    total_processed = 0
    
    for chunk_num, df_chunk in enumerate(chunk_iter):
        total_processed += len(df_chunk)
        
        # Validate required columns
        required_cols = ["id", "is_building", "is_addr", "lat", "lon"]
        missing_cols = [col for col in required_cols if col not in df_chunk.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")
        
        # Create Point geometries
        geometry = [Point(lon, lat) for lon, lat in zip(df_chunk["lon"], df_chunk["lat"])]
        gdf_chunk = gpd.GeoDataFrame(df_chunk, geometry=geometry, crs=crs)
        
        # Reproject to target CRS
        if target_crs != crs:
            gdf_chunk = gdf_chunk.to_crs(target_crs)
        
        # Spatial join to find NUTS2 region for each point
        gdf_with_regions = gpd.sjoin(
            gdf_chunk,
            gdf_nuts2[[id_col, "geometry"]],
            how="left",
            predicate="within",
        )
        
        # Remove the index_right column
        if "index_right" in gdf_with_regions.columns:
            gdf_with_regions = gdf_with_regions.drop(columns=["index_right"])
        
        # Rename NUTS ID column to nuts_region_code
        if id_col in gdf_with_regions.columns:
            gdf_with_regions = gdf_with_regions.rename(columns={id_col: "nuts_region_code"})
        
        # Group by region and accumulate
        for nuts_code, group in gdf_with_regions.groupby("nuts_region_code", dropna=False):
            if pd.isna(nuts_code):
                continue  # Skip addresses without a region
            
            nuts_code_str = str(nuts_code)
            
            # Initialize region file if needed
            if nuts_code_str not in region_files:
                region_file = output_dir / f"addresses_{nuts_code_str}.parquet"
                region_files[nuts_code_str] = region_file
                region_writers[nuts_code_str] = []
                region_counts[nuts_code_str] = 0
            
            # Accumulate data for this region
            region_writers[nuts_code_str].append(group)
            region_counts[nuts_code_str] += len(group)
        
        # Write batches when they get large
        if (chunk_num + 1) % 10 == 0:
            _flush_region_batches(region_writers, region_files, target_crs)
            print(f"  Processed {total_processed:,} rows, found {len(region_files)} regions")
    
    # Flush remaining batches
    _flush_region_batches(region_writers, region_files, target_crs)
    
    print(f"\n✓ Created {len(region_files)} GeoParquet files")
    for nuts_code, count in sorted(region_counts.items()):
        print(f"  {nuts_code}: {count:,} addresses -> {region_files[nuts_code].name}")
    
    return region_files


def _flush_region_batches(
    region_writers: dict[str, list[gpd.GeoDataFrame]],
    region_files: dict[str, Path],
    crs: str,
) -> None:
    """Flush accumulated batches to parquet files."""
    for nuts_code, batches in region_writers.items():
        if not batches:
            continue
        
        # Concatenate batches
        gdf_combined = gpd.GeoDataFrame(pd.concat(batches, ignore_index=True), crs=crs)
        
        # Append or create file
        region_file = region_files[nuts_code]
        if region_file.exists():
            # Append to existing file
            gdf_existing = gpd.read_parquet(region_file)
            gdf_combined = gpd.GeoDataFrame(
                pd.concat([gdf_existing, gdf_combined], ignore_index=True),
                crs=crs
            )
        
        # Write (overwrite if appending)
        gdf_combined.to_parquet(region_file, index=False)
        
        # Clear batches
        region_writers[nuts_code] = []


def load_addresses_geoparquet(parquet_path: str | Path) -> gpd.GeoDataFrame:
    """Load addresses/buildings from GeoParquet file."""
    parquet_path = Path(parquet_path)
    
    if not parquet_path.exists():
        raise FileNotFoundError(f"GeoParquet file not found: {parquet_path}")
    
    print(f"Loading GeoParquet from {parquet_path}...")
    gdf = gpd.read_parquet(parquet_path)
    print(f"✓ Loaded {len(gdf):,} addresses/buildings")
    print(f"  CRS: {gdf.crs}")
    
    return gdf


def load_addresses_by_nuts2(
    nuts_code: str,
    base_dir: Optional[str | Path] = None,
) -> gpd.GeoDataFrame:
    """
    Load addresses/buildings for a specific NUTS2 region from its parquet file.
    
    This is memory-efficient as it only loads one region at a time.
    
    Parameters
    ----------
    nuts_code
        NUTS2 region code (e.g., "NL31")
    base_dir
        Base directory containing the addresses_by_region subdirectory. 
        If None, uses osm_files directory.
    
    Returns
    -------
    GeoDataFrame with addresses/buildings for the specified region
    """
    if base_dir is None:
        script_dir = Path(__file__).parent
        base_dir = script_dir.parent.parent / "osm_files"
    else:
        base_dir = Path(base_dir)
    
    parquet_path = base_dir / "addresses_by_region" / f"addresses_{nuts_code}.parquet"
    
    if not parquet_path.exists():
        raise FileNotFoundError(
            f"Parquet file not found for NUTS2 region {nuts_code}: {parquet_path}"
        )
    
    print(f"Loading addresses for NUTS2 region {nuts_code}...")
    gdf = gpd.read_parquet(parquet_path)
    print(f"✓ Loaded {len(gdf):,} addresses/buildings for {nuts_code}")
    print(f"  CRS: {gdf.crs}")
    
    return gdf


def load_nuts2_boundaries(
    geojson_path: Optional[str | Path] = None,
    base_dir: Optional[str | Path] = None,
) -> gpd.GeoDataFrame:
    """Load NUTS2 boundaries from GeoJSON file."""
    if geojson_path is None:
        if base_dir is None:
            # Assume script is in osm_utils/scripts/, go up to project root
            script_dir = Path(__file__).parent
            base_dir = script_dir.parent.parent
        else:
            base_dir = Path(base_dir)
        
        geojson_path = base_dir / "osm_files" / "regions" / "combined_01m.geojson"
    
    geojson_path = Path(geojson_path)
    
    if not geojson_path.exists():
        raise FileNotFoundError(f"GeoJSON file not found: {geojson_path}")
    
    print(f"Loading NUTS boundaries from {geojson_path.name}...")
    
    # Load GeoJSON
    gdf = gpd.read_file(geojson_path)
    
    # Filter to NUTS level 2
    # Support both property names: "LEVL_CODE" (Eurostat) or "id" length check
    if "LEVL_CODE" in gdf.columns:
        gdf_nuts2 = gdf[gdf["LEVL_CODE"] == 2].copy()
    elif "id" in gdf.columns:
        # NUTS2 codes are 4 characters (e.g., "NL31")
        gdf_nuts2 = gdf[gdf["id"].str.len() == 4].copy()
    else:
        print("Warning: Could not determine NUTS level. Using all regions.")
        gdf_nuts2 = gdf.copy()
    
    # Ensure CRS is EPSG:3857 (Web Mercator)
    if gdf_nuts2.crs is None:
        # Try to infer from file
        with geojson_path.open("r") as f:
            data = json.load(f)
            crs_info = data.get("crs", {})
            if "properties" in crs_info:
                crs_name = crs_info["properties"].get("name", "")
                if "3857" in crs_name:
                    gdf_nuts2.set_crs("EPSG:3857", inplace=True)
    
    if gdf_nuts2.crs is None or str(gdf_nuts2.crs) != "EPSG:3857":
        print("Warning: CRS is not EPSG:3857. Reprojecting...")
        if gdf_nuts2.crs is None:
            gdf_nuts2.set_crs("EPSG:3857", inplace=True)
        else:
            gdf_nuts2 = gdf_nuts2.to_crs("EPSG:3857")
    
    print(f"✓ Loaded {len(gdf_nuts2):,} NUTS2 regions")
    print(f"  CRS: {gdf_nuts2.crs}")
    
    return gdf_nuts2


def query_by_nuts2_code(
    gdf_addresses: gpd.GeoDataFrame,
    gdf_nuts2: gpd.GeoDataFrame,
    nuts_code: str,
) -> gpd.GeoDataFrame:
    """Extract addresses/buildings within a specific NUTS2 region."""
    # Ensure both are in same CRS
    if gdf_addresses.crs != gdf_nuts2.crs:
        print(f"Reprojecting addresses from {gdf_addresses.crs} to {gdf_nuts2.crs}...")
        gdf_addresses = gdf_addresses.to_crs(gdf_nuts2.crs)
    
    # Find the NUTS2 region
    # Support both "id" and "NUTS_ID" column names
    id_col = "id" if "id" in gdf_nuts2.columns else "NUTS_ID"
    
    region = gdf_nuts2[gdf_nuts2[id_col] == nuts_code]
    if len(region) == 0:
        raise ValueError(f"NUTS2 code '{nuts_code}' not found in boundaries")
    
    region_geom = region.geometry.iloc[0]
    
    # Spatial join: points within polygon
    result = gdf_addresses[gdf_addresses.geometry.within(region_geom)]
    
    print(f"✓ Found {len(result):,} addresses/buildings in NUTS2 region {nuts_code}")
    
    return result


def query_by_polygon(
    gdf_addresses: gpd.GeoDataFrame,
    polygon: gpd.GeoSeries | gpd.GeoDataFrame | Point,
) -> gpd.GeoDataFrame:
    """Extract addresses/buildings within a polygon."""
    from shapely.geometry.base import BaseGeometry
    
    # Extract geometry
    if isinstance(polygon, gpd.GeoDataFrame):
        if len(polygon) != 1:
            raise ValueError("Polygon GeoDataFrame must contain exactly one geometry")
        geom = polygon.geometry.iloc[0]
        polygon_crs = polygon.crs
    elif isinstance(polygon, gpd.GeoSeries):
        if len(polygon) != 1:
            raise ValueError("Polygon GeoSeries must contain exactly one geometry")
        geom = polygon.iloc[0]
        polygon_crs = polygon.crs
    elif isinstance(polygon, BaseGeometry):
        geom = polygon
        polygon_crs = None
    else:
        raise TypeError(f"Unsupported polygon type: {type(polygon)}")
    
    # Ensure same CRS
    if polygon_crs is not None and gdf_addresses.crs != polygon_crs:
        print(f"Reprojecting addresses from {gdf_addresses.crs} to {polygon_crs}...")
        gdf_addresses = gdf_addresses.to_crs(polygon_crs)
    
    # Spatial query: points within polygon
    result = gdf_addresses[gdf_addresses.geometry.within(geom)]
    
    print(f"✓ Found {len(result):,} addresses/buildings within polygon")
    
    return result


def query_by_multiple_nuts2(
    gdf_addresses: gpd.GeoDataFrame,
    gdf_nuts2: gpd.GeoDataFrame,
    nuts_codes: list[str],
) -> gpd.GeoDataFrame:
    """Extract addresses/buildings within multiple NUTS2 regions."""
    # Ensure both are in same CRS
    if gdf_addresses.crs != gdf_nuts2.crs:
        print(f"Reprojecting addresses from {gdf_addresses.crs} to {gdf_nuts2.crs}...")
        gdf_addresses = gdf_addresses.to_crs(gdf_nuts2.crs)
    
    # Find the NUTS2 regions
    id_col = "id" if "id" in gdf_nuts2.columns else "NUTS_ID"
    
    regions = gdf_nuts2[gdf_nuts2[id_col].isin(nuts_codes)]
    if len(regions) == 0:
        raise ValueError(f"None of the NUTS2 codes found: {nuts_codes}")
    
    if len(regions) < len(nuts_codes):
        found_codes = set(regions[id_col].unique())
        missing = set(nuts_codes) - found_codes
        print(f"Warning: Some NUTS2 codes not found: {missing}")
    
    # Spatial join: points within any of the polygons
    result = gpd.sjoin(
        gdf_addresses,
        regions[[id_col, "geometry"]],
        how="inner",
        predicate="within",
    )
    
    # Remove the index_right column added by sjoin
    if "index_right" in result.columns:
        result = result.drop(columns=["index_right"])
    
    print(f"✓ Found {len(result):,} addresses/buildings in {len(regions)} NUTS2 regions")
    
    return result

# %%
# Convert addresses CSV to GeoParquet files (one per NUTS2 region)
# Files will be saved to osm_files/addresses_by_region/
osm_files_folder = Path(__file__).parent.parent.parent / "osm_files"
csv_path = osm_files_folder / "europe-latest.addresses_20260110_222142.csv.gz"
region_files = csv_to_geoparquet_by_region(csv_path, output_dir=osm_files_folder)

# %%
# Load addresses for a specific NUTS2 region (Utrecht, NL35)
# This only loads that region's data, keeping memory usage low
# utrecht_addresses = load_addresses_by_nuts2("NL35")
nuts_codes = [k for k in region_files.keys()]

# %%
from tqdm import tqdm
from collections import Counter
region_counters = {}
for region_code in tqdm(nuts_codes):
    region_addresses = load_addresses_by_nuts2(region_code)
    region_counter = Counter()
    for row in tqdm(region_addresses.itertuples(index=False)):
        if row.tags is None:
            continue
        row_tags = json.loads(row.tags)
        region_counter.update(row_tags.keys())
    region_counters[region_code] = region_counter

# %%
combined_counter = Counter()
for region_counter in region_counters.values():
    combined_counter.update(region_counter)

for key, count in combined_counter.most_common():
    print(f"{key}: {count}")

# %%
"""
Interesting tags to look deeper in
amenity
shop
name
operator
office
cuisine
tourism
healthcare
leasure
sport
clothes
club
craft
religion
fuel: ... 
school
military
brewery

It's probably also interesting to find coverage, so find which
tag occurs at least 10x for each region. 


I think what we have to do is make a table where each row is a tag value, and each column is a region. We can just encode that easily as a dictionary first. 
We hvave to exclude addr: tags, because they are too often unique. I think perhaps we should do the     opposite: for amenity, shop, building, we should consider also storing the values, but for all other tags we just store the tag key. 
"""

# %%
from collections import defaultdict

# Dictionary: tag_name -> defaultdict(region_code -> count)
tag_counts_by_region: dict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))

# Tags where we include the value (key=value format)
tags_with_values = {"building", "amenity", "shop"}

# Process all NL regions
for region_code in tqdm(nuts_codes, desc="Processing regions"):
    region_addresses = load_addresses_by_nuts2(region_code)
    
    for row in tqdm(region_addresses.itertuples(index=False), 
                    desc=f"Processing {region_code}",
                    leave=False,
                    total=len(region_addresses)):
        if row.tags is None:
            continue
        
        try:
            row_tags = json.loads(row.tags)
        except json.JSONDecodeError:
            continue
        
        for tag_key, tag_value in row_tags.items():
            # Skip addr: tags as they're too unique
            if tag_key.startswith("addr:"):
                continue
            
            # For building, amenity, shop: use "key=value" format
            if tag_key in tags_with_values:
                tag_identifier = f"{tag_key}={tag_value}"
            else:
                # For other tags: just use the key
                tag_identifier = tag_key
            
            # Increment count for this tag in this region
            tag_counts_by_region[tag_identifier][region_code] += 1

# %%
# Display summary statistics
print(f"\nFound {len(tag_counts_by_region)} unique tags across {len(nuts_codes)} regions")
print("\nTop tags by total count across all regions:")
tag_totals = {
    tag: sum(region_counts.values()) 
    for tag, region_counts in tag_counts_by_region.items()
}
for tag, total in sorted(tag_totals.items(), key=lambda x: x[1], reverse=True)[:20]:
    print(f"  {tag}: {total:,}")