# %%
"""
Analyze the categorized places CSV file and create interactive visualizations
with Plotly showing distribution by category and region borders.
"""

import pandas as pd
import geopandas as gpd
import plotly.express as px
import plotly.graph_objects as go
from pathlib import Path

# %%
# Configure paths - change these to analyze different files
root_dir = Path(__file__).parent.parent.parent
csv_path = root_dir / "osm_files" / "netherlands-latest.places.csv.gz"
geojson_path = root_dir / "osm_files" / "regions" / "combined_01m.geojson"

# %%
# Load the CSV file
print(f"Loading places from: {csv_path}")
df = pd.read_csv(csv_path, compression="gzip" if csv_path.suffix == ".gz" else None)

# Filter to Netherlands regions only
df = df[df.region.str.startswith("NL")]

print(f"Total rows: {len(df):,}")
print(f"Categories: {df['category'].nunique()}")
print(f"Regions: {df['region'].nunique()}")

# %%
# Load NUTS region boundaries
print(f"\nLoading region boundaries from: {geojson_path}")
gdf_regions = gpd.read_file(geojson_path)

# The file name suggests EPSG:3857 (Web Mercator), but CRS might be wrong
# Check bounds to determine if coordinates are in meters (3857) or degrees (4326)
sample_bounds = gdf_regions.total_bounds
if sample_bounds[0] > 180 or sample_bounds[0] < -180:
    # Coordinates are in meters (Web Mercator), need to set CRS and convert
    print(f"Detected Web Mercator coordinates (bounds: {sample_bounds})")
    if gdf_regions.crs:
        gdf_regions.set_crs('EPSG:3857', inplace=True, allow_override=True)
    else:
        gdf_regions.set_crs('EPSG:3857', inplace=True)
    gdf_regions = gdf_regions.to_crs('EPSG:4326')
    print(f"Converted from EPSG:3857 to EPSG:4326")
else:
    print(f"Coordinates appear to be in degrees (bounds: {sample_bounds})")
    if gdf_regions.crs and gdf_regions.crs.to_string() != 'EPSG:4326':
        gdf_regions = gdf_regions.to_crs('EPSG:4326')

# Check which column name is used for region ID
region_id_col = 'NUTS_ID' if 'NUTS_ID' in gdf_regions.columns else 'id'

# Filter to Netherlands regions only
gdf_regions = gdf_regions[gdf_regions[region_id_col].str.startswith('NL')]

# Filter to only regions that have data in df
regions_in_df = set(df['region'].unique())
gdf_regions = gdf_regions[gdf_regions[region_id_col].isin(regions_in_df)]

print(f"Loaded {len(gdf_regions)} regions with data")
print(f"Final bounds (degrees): {gdf_regions.total_bounds}")

# %%
# Create a summary map showing all categories with different colors
print("Creating map with all categories...")

categories = sorted(df['category'].unique())
fig = go.Figure()

# Add region borders using GeoJSON
for idx, row in gdf_regions.iterrows():
    nuts_id = row[region_id_col]
    geom = row['geometry']
    
    # Convert geometry to GeoJSON format for plotly
    if geom.geom_type == 'Polygon':
        # Exterior ring
        coords = list(geom.exterior.coords)
        lons = [coord[0] for coord in coords]
        lats = [coord[1] for coord in coords]
        
        fig.add_trace(go.Scattergeo(
            lon=lons,
            lat=lats,
            mode='lines',
            line=dict(color='black', width=2),
            showlegend=False,
            hoverinfo='skip',
            fill='none',
        ))
        
        # Interior rings (holes)
        for interior in geom.interiors:
            coords = list(interior.coords)
            lons = [coord[0] for coord in coords]
            lats = [coord[1] for coord in coords]
            
            fig.add_trace(go.Scattergeo(
                lon=lons,
                lat=lats,
                mode='lines',
                line=dict(color='black', width=2),
                showlegend=False,
                hoverinfo='skip',
                fill='none',
            ))
    
    elif geom.geom_type == 'MultiPolygon':
        for poly in geom.geoms:
            # Exterior ring
            coords = list(poly.exterior.coords)
            lons = [coord[0] for coord in coords]
            lats = [coord[1] for coord in coords]
            
            fig.add_trace(go.Scattergeo(
                lon=lons,
                lat=lats,
                mode='lines',
                line=dict(color='black', width=2),
                showlegend=False,
                hoverinfo='skip',
                fill='none',
            ))
            
            # Interior rings
            for interior in poly.interiors:
                coords = list(interior.coords)
                lons = [coord[0] for coord in coords]
                lats = [coord[1] for coord in coords]
                
                fig.add_trace(go.Scattergeo(
                    lon=lons,
                    lat=lats,
                    mode='lines',
                    line=dict(color='black', width=2),
                    showlegend=False,
                    hoverinfo='skip',
                    fill='none',
                ))

# Add places for each category with different colors
colors = px.colors.qualitative.Set3
for i, category in enumerate(categories):
    df_cat = df[df['category'] == category]
    if len(df_cat) == 0:
        continue
    
    fig.add_trace(go.Scattergeo(
        lon=df_cat['lon'],
        lat=df_cat['lat'],
        mode='markers',
        marker=dict(
            size=10,
            color=colors[i % len(colors)],
            opacity=0.8,
            line=dict(width=1, color='black'),
        ),
        text=df_cat.apply(
            lambda row: f"ID: {row['id']}<br>Region: {row['region']}<br>Category: {row['category']}",
            axis=1
        ),
        hoverinfo='text',
        name=category,
    ))

# Update layout
fig.update_layout(
    geo=dict(
        projection_type='mercator',
        showland=False,
        showocean=False,
        showcountries=False,
        showlakes=False,
        showframe=False,
        bgcolor='white',
        lonaxis=dict(
            range=[gdf_regions.total_bounds[0] - 0.5, gdf_regions.total_bounds[2] + 0.5]
        ),
        lataxis=dict(
            range=[gdf_regions.total_bounds[1] - 0.5, gdf_regions.total_bounds[3] + 0.5]
        ),
    ),
    margin=dict(l=0, r=0, t=0, b=0),
    height=800,
    legend=dict(
        yanchor="top",
        y=0.99,
        xanchor="left",
        x=0.01,
        bgcolor="rgba(255,255,255,0.95)",
        bordercolor="black",
        borderwidth=2,
        font=dict(size=12),
        itemwidth=30,
    ),
)

fig.show()

# %%
df.groupby('category').is_node.mean()