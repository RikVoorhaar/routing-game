#!/usr/bin/env python3
"""
Simplify routable ways in an OSM PBF by keeping only endpoints + junction-proxy nodes.

This is a memory-reduction preprocessing step intended for game/POC usage where it is
acceptable that routing may be slightly suboptimal if the router uses simplified
geometry distances, as long as the dataset fits in memory.

The script:
- Pass 1: scans routable ways and records a set of "kept" node IDs.
  - Always keeps the first/last node of each routable way.
  - Also keeps any node that is an endpoint of any routable way (acts as a practical
    proxy for junctions in typical OSM, where ways are usually split at intersections).
- Pass 2: builds a disk-backed node location index, writes kept nodes, and rewrites each
  routable way so it only references kept nodes. While simplifying, it computes the true
  polyline length over the original node sequence and stores it in tags.

Output tags (string values):
- length_m: integer meters of total polyline length (over original geometry)
- duration_s: integer seconds based on maxspeed if parseable, else omitted
- orig_nodes: original node count
- kept_nodes: simplified node count
- seg_length_m: semicolon-separated integer meters per simplified segment (optional debug)
"""

from __future__ import annotations
import os
import sys
from pathlib import Path
from typing import Dict, Optional

import click
import osmium
from tqdm import tqdm

# Allow running as a script while still using absolute imports.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from osm_utils.routable_ways import is_routable_way
from osm_utils.way_simplifier import (
    SimplifyConfig,
    compute_segment_lengths_m,
    parse_maxspeed_kmh,
    simplify_node_refs,
)


class KeepNodeCollector(osmium.SimpleHandler):
    """
    Collect kept node IDs from routable ways (endpoints + junction proxy).
    """

    def __init__(self, progress: Optional[tqdm] = None) -> None:
        super().__init__()
        self._progress = progress
        self.kept_nodes: set[int] = set()
        self.routable_way_count: int = 0
        self.processed_nodes: int = 0
        self.processed_ways: int = 0

    def node(self, n: osmium.osm.Node) -> None:
        self.processed_nodes += 1
        if self._progress is not None and self.processed_nodes % 200_000 == 0:
            # No total; just provide a heartbeat + live counters.
            self._progress.update(200_000)
            self._progress.set_description(
                f"Pass1 nodes={self.processed_nodes:,} ways={self.processed_ways:,} routable_ways={self.routable_way_count:,} kept_nodes={len(self.kept_nodes):,}"
            )

    def way(self, w: osmium.osm.Way) -> None:
        self.processed_ways += 1
        tags = {tag.k: tag.v for tag in w.tags}
        if not is_routable_way(tags):
            return

        node_refs = [int(n.ref) for n in w.nodes]
        if len(node_refs) < 2:
            return

        self.routable_way_count += 1
        self.kept_nodes.add(node_refs[0])
        self.kept_nodes.add(node_refs[-1])

        if self._progress is not None and self.processed_ways % 50_000 == 0:
            # Also refresh description based on ways processed.
            self._progress.set_description(
                f"Pass1 nodes={self.processed_nodes:,} ways={self.processed_ways:,} routable_ways={self.routable_way_count:,} kept_nodes={len(self.kept_nodes):,}"
            )


class SimplifyHandler(osmium.SimpleHandler):
    """
    Pass 2 handler: index node locations, write kept nodes, and rewrite routable ways.
    """

    def __init__(
        self,
        output_writer: osmium.SimpleWriter,
        kept_nodes: "set[int]",
        config: SimplifyConfig,
        progress: Optional[tqdm],
    ) -> None:
        super().__init__()
        self._writer = output_writer
        self._kept_nodes = kept_nodes
        self._config = config
        self._progress = progress

        # Disk-backed node index (as supported by this pyosmium build).
        # Note: in this environment, `create_map()` only accepts the type string.
        self._location_index = osmium.index.create_map("sparse_file_array")

        self._written_nodes: set[int] = set()
        self.processed_nodes: int = 0
        self.processed_ways: int = 0
        self.written_nodes: int = 0
        self.written_ways: int = 0
        self.skipped_ways_too_short: int = 0

    def node(self, n: osmium.osm.Node) -> None:
        self.processed_nodes += 1
        self._location_index.set(n.id, n.location)

        if int(n.id) in self._kept_nodes and int(n.id) not in self._written_nodes:
            if hasattr(n, "location") and n.location.valid():
                node = osmium.osm.mutable.Node()
                node.id = n.id
                node.location = n.location
                self._writer.add_node(node)
                self._written_nodes.add(int(n.id))
                self.written_nodes += 1

        if self._progress is not None and self.processed_nodes % 200_000 == 0:
            self._progress.set_description(
                f"Pass2 nodes={self.processed_nodes:,} ways={self.processed_ways:,} wrote_n={self.written_nodes:,} wrote_w={self.written_ways:,}"
            )

    def way(self, w: osmium.osm.Way) -> None:
        self.processed_ways += 1

        tags = {tag.k: tag.v for tag in w.tags}
        if not is_routable_way(tags):
            return

        node_refs = [int(n.ref) for n in w.nodes]
        if len(node_refs) < 2:
            return

        simplified_refs = simplify_node_refs(node_refs, self._kept_nodes)
        if len(simplified_refs) < 2:
            self.skipped_ways_too_short += 1
            return

        total_len_m, seg_lens_m = compute_segment_lengths_m(node_refs, simplified_refs, self._location_index)

        # Build new tags. Keep original tags for routing profile logic.
        out_tags: Dict[str, str] = dict(tags)
        out_tags["length_m"] = str(total_len_m)
        out_tags["orig_nodes"] = str(len(node_refs))
        out_tags["kept_nodes"] = str(len(simplified_refs))

        speed_kmh = parse_maxspeed_kmh(tags)
        if speed_kmh is not None and speed_kmh > 0:
            duration_s = int(round((total_len_m / 1000.0) / speed_kmh * 3600.0))
            out_tags["duration_s"] = str(duration_s)

        if self._config.write_segment_lengths:
            out_tags["seg_length_m"] = ";".join(str(x) for x in seg_lens_m)

        out_way = osmium.osm.mutable.Way()
        out_way.id = w.id
        out_way.tags = out_tags
        out_way.nodes = list(simplified_refs)
        self._writer.add_way(out_way)
        self.written_ways += 1

        if self._progress is not None and self.processed_ways % 50_000 == 0:
            self._progress.set_description(
                f"Pass2 nodes={self.processed_nodes:,} ways={self.processed_ways:,} wrote_n={self.written_nodes:,} wrote_w={self.written_ways:,}"
            )


@click.command()
@click.argument("input_file", type=click.Path(exists=True, dir_okay=False))
@click.option("--output", "-o", type=click.Path(dir_okay=False), help="Output .osm.pbf path.")
@click.option(
    "--no-seg-lengths",
    is_flag=True,
    default=False,
    help="Do not write seg_length_m tag (slightly smaller output).",
)
def main(input_file: str, output: Optional[str], no_seg_lengths: bool) -> None:
    """
    Simplify routable ways from an OSM PBF into a smaller .osm.pbf.

    Parameters
    ---------------
    input_file: str
        Input `.osm.pbf`.
    output: str | None
        Output `.osm.pbf` path. Defaults to `<input>.simplified.osm.pbf`.
    no_seg_lengths: bool
        Disable writing per-segment lengths tag.
    """
    input_path = Path(input_file)
    if output is None:
        stem = input_path.stem.replace(".osm", "")
        output_path = input_path.parent / f"{stem}.simplified.osm.pbf"
    else:
        output_path = Path(output)

    if output_path.exists():
        output_path.unlink()

    config = SimplifyConfig(write_segment_lengths=not no_seg_lengths)

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")

    print("\nPass 1/2: Collect kept nodes from routable ways (endpoints + junction proxy)...")
    progress1 = tqdm(desc="Pass1", unit="elements")
    collector = KeepNodeCollector(progress=progress1)
    collector.apply_file(str(input_path), locations=False)
    progress1.close()
    kept_nodes = collector.kept_nodes
    print(f"Routable ways: {collector.routable_way_count:,}")
    print(f"Kept nodes:   {len(kept_nodes):,}")

    print("\nPass 2/2: Write kept nodes and simplified routable ways...")
    with osmium.SimpleWriter(str(output_path)) as writer:
        progress = tqdm(desc="Simplifying", unit="elements")
        handler = SimplifyHandler(
            output_writer=writer,
            kept_nodes=kept_nodes,
            config=config,
            progress=progress,
        )
        handler.apply_file(str(input_path), locations=True)
        progress.close()

    print("\nDone.")
    print(
        "Stats: "
        f"processed_nodes={handler.processed_nodes:,} processed_ways={handler.processed_ways:,} "
        f"written_nodes={handler.written_nodes:,} written_ways={handler.written_ways:,} "
        f"skipped_ways_too_short={handler.skipped_ways_too_short:,}"
    )


if __name__ == "__main__":
    main()


