#!/usr/bin/env python3
"""
Analyze node connectivity (degree distribution) in simplified OSM files.

This script builds a graph from simplified OSM files and analyzes:
- Histogram of node degrees (connectivity)
- Pruning opportunities (e.g., degree-2 nodes that could be merged)
"""

from __future__ import annotations

import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import click
import osmium

# Allow running as a script while still using absolute imports.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from osm_utils.routable_ways import is_routable_way


class ConnectivityHandler(osmium.SimpleHandler):
    """
    Handler to extract graph structure from simplified OSM data.
    """

    def __init__(self) -> None:
        super().__init__()
        self.nodes: Dict[int, Tuple[float, float]] = {}  # node_id -> (lat, lon)
        self.ways: List[Tuple[int, List[int], Dict[str, str]]] = []  # (way_id, node_list, tags)
        self.node_degrees: Dict[int, int] = defaultdict(int)  # node_id -> degree

    def node(self, n: osmium.osm.Node) -> None:
        """Store node coordinates."""
        if n.location.valid():
            self.nodes[n.id] = (n.location.lat, n.location.lon)

    def way(self, w: osmium.osm.Way) -> None:
        """Store routable ways and count node degrees."""
        tags = {tag.k: tag.v for tag in w.tags}

        if not is_routable_way(tags):
            return

        node_list = [node.ref for node in w.nodes]
        if len(node_list) < 2:
            return

        self.ways.append((w.id, node_list, tags))

        # Count degrees: each node appears in edges
        for i in range(len(node_list) - 1):
            node1, node2 = node_list[i], node_list[i + 1]
            # Increment degree for both endpoints of each edge
            self.node_degrees[node1] += 1
            self.node_degrees[node2] += 1


def build_degree_distribution(
    handler: ConnectivityHandler,
) -> Tuple[Counter[int], Dict[int, List[int]]]:
    """
    Build degree distribution from the handler.

    Parameters
    ---------------
    handler: ConnectivityHandler
        Handler with extracted graph data.

    Returns
    ---------------
    degree_counter: Counter[int]
        Count of nodes per degree value.
    degree_to_nodes: Dict[int, List[int]]
        Mapping from degree to list of node IDs with that degree.
    """
    degree_counter: Counter[int] = Counter()
    degree_to_nodes: Dict[int, List[int]] = defaultdict(list)

    for node_id, degree in handler.node_degrees.items():
        degree_counter[degree] += 1
        degree_to_nodes[degree].append(node_id)

    return degree_counter, dict(degree_to_nodes)


def analyze_pruning_opportunities(
    handler: ConnectivityHandler,
    degree_to_nodes: Dict[int, List[int]],
) -> Dict[str, int]:
    """
    Analyze opportunities for further graph simplification.

    Parameters
    ---------------
    handler: ConnectivityHandler
        Handler with extracted graph data.
    degree_to_nodes: Dict[int, List[int]]
        Mapping from degree to list of node IDs.

    Returns
    ---------------
    Dict[str, int]
        Statistics about pruning opportunities.
    """
    stats: Dict[str, int] = {
        "degree_1_nodes": len(degree_to_nodes.get(1, [])),
        "degree_2_nodes": len(degree_to_nodes.get(2, [])),
        "degree_3_nodes": len(degree_to_nodes.get(3, [])),
        "degree_4plus_nodes": sum(
            len(degree_to_nodes.get(d, [])) for d in degree_to_nodes if d >= 4
        ),
    }

    # Degree-2 nodes can potentially be merged (simplified further)
    # Degree-1 nodes are dead ends (could be pruned if desired)
    return stats




def print_connectivity_summary(
    handler: ConnectivityHandler,
    degree_counter: Counter[int],
    pruning_stats: Dict[str, int],
) -> None:
    """
    Print summary of connectivity analysis.

    Parameters
    ---------------
    handler: ConnectivityHandler
        Handler with extracted graph data.
    degree_counter: Counter[int]
        Count of nodes per degree value.
    pruning_stats: Dict[str, int]
        Pruning opportunity statistics.
    """
    total_nodes = len(handler.node_degrees)
    total_ways = len(handler.ways)

    print("\n" + "=" * 70)
    print("CONNECTIVITY ANALYSIS SUMMARY")
    print("=" * 70)
    print(f"Total nodes in graph: {total_nodes:,}")
    print(f"Total routable ways: {total_ways:,}")

    if not degree_counter:
        print("No connectivity data available")
        return

    print("\n--- Degree Distribution ---")
    print(f"{'Degree':<10} {'Count':<15} {'Percentage':<15}")
    print("-" * 40)

    for degree in sorted(degree_counter.keys())[:20]:  # Top 20 degrees
        count = degree_counter[degree]
        percentage = (count / total_nodes * 100) if total_nodes > 0 else 0.0
        print(f"{degree:<10} {count:<15,} {percentage:>14.2f}%")

    if len(degree_counter) > 20:
        remaining_degrees = sum(
            degree_counter[d] for d in sorted(degree_counter.keys())[20:]
        )
        remaining_pct = (remaining_degrees / total_nodes * 100) if total_nodes > 0 else 0.0
        print(f"{'...':<10} {remaining_degrees:<15,} {remaining_pct:>14.2f}%")

    print("\n--- Pruning Opportunities ---")
    print(f"Degree-1 nodes (dead ends): {pruning_stats['degree_1_nodes']:,}")
    print(f"Degree-2 nodes (can merge): {pruning_stats['degree_2_nodes']:,}")
    print(f"Degree-3 nodes (simple junctions): {pruning_stats['degree_3_nodes']:,}")
    print(f"Degree-4+ nodes (complex junctions): {pruning_stats['degree_4plus_nodes']:,}")

    # Calculate potential reduction
    mergeable = pruning_stats["degree_2_nodes"]
    if mergeable > 0:
        reduction_pct = (mergeable / total_nodes * 100) if total_nodes > 0 else 0.0
        print(
            f"\nIf all degree-2 nodes were merged: "
            f"~{mergeable:,} nodes could be removed ({reduction_pct:.1f}% reduction)"
        )

    print("=" * 70)


@click.command()
@click.argument("osm_file", type=click.Path(exists=True))
def main(osm_file: str) -> None:
    """
    Analyze node connectivity in a simplified OSM file.

    Parameters
    ---------------
    osm_file: str
        Path to simplified .osm.pbf file.
    """
    input_path = Path(osm_file)

    print(f"Analyzing connectivity in: {input_path}")
    print("Loading OSM data...")

    handler = ConnectivityHandler()
    handler.apply_file(str(input_path))

    print(f"Found {len(handler.nodes):,} nodes")
    print(f"Found {len(handler.ways):,} routable ways")

    print("Building degree distribution...")
    degree_counter, degree_to_nodes = build_degree_distribution(handler)

    pruning_stats = analyze_pruning_opportunities(handler, degree_to_nodes)

    print_connectivity_summary(handler, degree_counter, pruning_stats)

    print("\nAnalysis complete!")


if __name__ == "__main__":
    main()

