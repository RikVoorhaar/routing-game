#!/usr/bin/env python3
"""
Analyze road type distribution in simplified OSM files.

Counts ways and nodes by highway type to help inform pruning strategies.
"""

from __future__ import annotations

import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Set

import click
import osmium

# Allow running as a script while still using absolute imports.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from osm_utils.routable_ways import is_routable_way


class RoadTypeHandler(osmium.SimpleHandler):
    """
    Handler to count ways and nodes by highway type.
    """

    def __init__(self) -> None:
        super().__init__()
        self.way_counts: Counter[str] = Counter()  # highway type -> count
        self.node_to_types: Dict[int, Set[str]] = defaultdict(set)  # node_id -> set of highway types
        self.total_ways = 0
        self.total_nodes = 0

    def node(self, n: osmium.osm.Node) -> None:
        """Count nodes."""
        if n.location.valid():
            self.total_nodes += 1

    def way(self, w: osmium.osm.Way) -> None:
        """Count ways by highway type and track which nodes are used by which types."""
        tags = {tag.k: tag.v for tag in w.tags}

        if not is_routable_way(tags):
            return

        highway_type = tags.get("highway", "unknown")
        self.way_counts[highway_type] += 1
        self.total_ways += 1

        # Track which highway types each node is connected to
        for node_ref in w.nodes:
            self.node_to_types[node_ref.ref].add(highway_type)


def categorize_highway_type(highway: str) -> str:
    """
    Categorize highway type into major groups.

    Parameters
    ---------------
    highway: str
        Highway type value.

    Returns
    ---------------
    str
        Category name.
    """
    major_roads = {"motorway", "trunk", "primary", "secondary"}
    minor_roads = {"tertiary", "unclassified", "residential"}
    links = {
        "motorway_link",
        "trunk_link",
        "primary_link",
        "secondary_link",
        "tertiary_link",
    }
    paths = {"path", "footway", "cycleway", "bridleway", "steps", "pedestrian"}
    service = {"service", "living_street", "track", "busway"}

    if highway in major_roads:
        return "Major roads"
    elif highway in minor_roads:
        return "Minor roads"
    elif highway in links:
        return "Link roads"
    elif highway in paths:
        return "Paths/pedestrian"
    elif highway in service:
        return "Service/other"
    else:
        return "Other/unknown"


def print_road_type_summary(handler: RoadTypeHandler) -> None:
    """
    Print summary of road type distribution.

    Parameters
    ---------------
    handler: RoadTypeHandler
        Handler with extracted data.
    """
    print("\n" + "=" * 80)
    print("ROAD TYPE DISTRIBUTION")
    print("=" * 80)
    print(f"Total ways: {handler.total_ways:,}")
    print(f"Total nodes: {handler.total_nodes:,}")

    print("\n--- Ways by Highway Type ---")
    print(f"{'Highway Type':<25} {'Count':<15} {'Percentage':<15} {'Category':<20}")
    print("-" * 80)

    # Sort by count descending
    sorted_types = sorted(handler.way_counts.items(), key=lambda x: x[1], reverse=True)

    for highway_type, count in sorted_types:
        percentage = (count / handler.total_ways * 100) if handler.total_ways > 0 else 0.0
        category = categorize_highway_type(highway_type)
        print(
            f"{highway_type:<25} {count:<15,} {percentage:>14.2f}% {category:<20}"
        )

    # Summary by category
    print("\n--- Ways by Category ---")
    category_counts: Counter[str] = Counter()
    for highway_type, count in handler.way_counts.items():
        category = categorize_highway_type(highway_type)
        category_counts[category] += count

    for category, count in sorted(category_counts.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / handler.total_ways * 100) if handler.total_ways > 0 else 0.0
        print(f"{category:<30} {count:<15,} {percentage:>14.2f}%")

    # Node analysis: count nodes by the types of roads they're on
    print("\n--- Nodes by Road Type (nodes can appear in multiple categories) ---")
    node_type_counts: Counter[str] = Counter()
    for node_id, types in handler.node_to_types.items():
        # If node is on multiple types, count it in each category
        for highway_type in types:
            category = categorize_highway_type(highway_type)
            node_type_counts[category] += 1

    # Also count unique nodes per category
    nodes_by_category: Dict[str, Set[int]] = defaultdict(set)
    for node_id, types in handler.node_to_types.items():
        for highway_type in types:
            category = categorize_highway_type(highway_type)
            nodes_by_category[category].add(node_id)

    print(f"{'Category':<30} {'Unique Nodes':<15} {'Percentage':<15}")
    print("-" * 60)
    for category in sorted(nodes_by_category.keys(), key=lambda x: len(nodes_by_category[x]), reverse=True):
        unique_count = len(nodes_by_category[category])
        percentage = (unique_count / handler.total_nodes * 100) if handler.total_nodes > 0 else 0.0
        print(f"{category:<30} {unique_count:<15,} {percentage:>14.2f}%")

    # Pruning scenarios
    print("\n--- Pruning Scenarios ---")
    major_nodes = nodes_by_category.get("Major roads", set())
    major_minor_nodes = (
        nodes_by_category.get("Major roads", set())
        | nodes_by_category.get("Minor roads", set())
    )
    major_minor_link_nodes = (
        nodes_by_category.get("Major roads", set())
        | nodes_by_category.get("Minor roads", set())
        | nodes_by_category.get("Link roads", set())
    )

    print(f"Keep only Major roads: {len(major_nodes):,} nodes ({len(major_nodes)/handler.total_nodes*100:.1f}%)")
    print(
        f"Keep Major + Minor roads: {len(major_minor_nodes):,} nodes ({len(major_minor_nodes)/handler.total_nodes*100:.1f}%)"
    )
    print(
        f"Keep Major + Minor + Links: {len(major_minor_link_nodes):,} nodes ({len(major_minor_link_nodes)/handler.total_nodes*100:.1f}%)"
    )

    print("=" * 80)


@click.command()
@click.argument("osm_file", type=click.Path(exists=True))
def main(osm_file: str) -> None:
    """
    Analyze road type distribution in a simplified OSM file.

    Parameters
    ---------------
    osm_file: str
        Path to simplified .osm.pbf file.
    """
    input_path = Path(osm_file)

    print(f"Analyzing road types in: {input_path}")
    print("Loading OSM data...")

    handler = RoadTypeHandler()
    handler.apply_file(str(input_path))

    print_road_type_summary(handler)

    print("\nAnalysis complete!")


if __name__ == "__main__":
    main()

