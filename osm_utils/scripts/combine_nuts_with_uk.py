"""
Combine NUTS 2024 regions with UK regions from 2021.

Due to Brexit, the UK was removed from NUTS 2024. This script extracts UK regions
from the 2021 dataset and adds them to the 2024 dataset to create a combined file.
"""

from __future__ import annotations

import json
from pathlib import Path

import click


@click.command()
@click.option(
    "--resolution",
    type=click.Choice(["01M", "10M"], case_sensitive=False),
    default="01M",
    help="Resolution: 01M (1M) or 10M (10M)",
)
@click.option(
    "--output-dir",
    type=click.Path(path_type=Path, file_okay=False, dir_okay=True),
    default=Path("../osm_files/regions"),
    help="Output directory for combined files",
)
def main(resolution: str, output_dir: Path) -> None:
    """
    Combine NUTS 2024 regions with UK regions from 2021.

    Creates combined_01m.geojson and combined_10m.geojson files that include
    all 2024 regions plus UK regions from 2021.
    """
    # Normalize resolution to match filename format
    resolution_upper = resolution.upper()

    # File paths
    base_dir = Path(__file__).parent.parent.parent / "osm_files" / "regions"
    file_2024 = base_dir / f"NUTS_RG_{resolution_upper}_2024_3857.geojson"
    file_2021 = base_dir / f"NUTS_RG_{resolution_upper}_2021_3857.geojson"
    output_file = output_dir / f"combined_{resolution.lower()}.geojson"

    # Check files exist
    if not file_2024.exists():
        raise click.ClickException(f"2024 file not found: {file_2024}")
    if not file_2021.exists():
        raise click.ClickException(f"2021 file not found: {file_2021}")

    click.echo(f"Loading 2024 regions from {file_2024.name}...")
    with file_2024.open("r", encoding="utf-8") as f:
        data_2024 = json.load(f)

    click.echo(f"Loading 2021 regions from {file_2021.name}...")
    with file_2021.open("r", encoding="utf-8") as f:
        data_2021 = json.load(f)

    # Filter to only NUTS level 2 regions (LEVL_CODE === 2)
    # Extract UK regions from 2021 (CNTR_CODE can be "UK" or "GB")
    uk_regions_2021 = []
    for feature in data_2021.get("features", []):
        props = feature.get("properties", {})
        levl_code = props.get("LEVL_CODE")
        cntr_code = props.get("CNTR_CODE", "")
        # Only include level 2 UK regions
        if levl_code == 2 and cntr_code in ("UK", "GB"):
            uk_regions_2021.append(feature)

    # Filter 2024 regions to only level 2
    regions_2024_level2 = []
    for feature in data_2024.get("features", []):
        props = feature.get("properties", {})
        levl_code = props.get("LEVL_CODE")
        if levl_code == 2:
            regions_2024_level2.append(feature)

    click.echo(f"Found {len(uk_regions_2021)} UK level 2 regions in 2021 dataset")
    click.echo(f"Found {len(regions_2024_level2)} level 2 regions in 2024 dataset")

    # Combine: 2024 level 2 features + UK level 2 features from 2021
    combined_features = regions_2024_level2 + uk_regions_2021

    # Create combined GeoJSON
    combined_data = {
        "type": "FeatureCollection",
        "name": f"NUTS_RG_{resolution_upper}_2024_3857_with_UK_2021.geojson",
        "crs": data_2024.get("crs", {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::3857"}}),
        "features": combined_features,
    }

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Write combined file
    click.echo(f"Writing combined file: {output_file}")
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(combined_data, f, ensure_ascii=False, indent=2)

    click.echo(
        f"✓ Created {output_file.name} with {len(combined_features)} regions "
        f"({len(data_2024.get('features', []))} from 2024 + {len(uk_regions_2021)} UK from 2021)"
    )


if __name__ == "__main__":
    main()

