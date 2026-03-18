"""Map loading, grid compilation, and movement validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional


def load_map_collection(data_dir_or_addons: "Path | AddonDirs") -> dict:
    """Load maps from addon directories (or legacy single data_dir).

    Returns {"maps": {map_id: map_data}} with all maps merged.
    """
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    all_maps: dict[str, dict] = {}

    from .character import namespace_id
    for addon_id, addon_path in addon_dirs:
        collection_path = addon_path / "map_collection.json"
        if not collection_path.exists():
            continue
        with open(collection_path, "r", encoding="utf-8") as f:
            collection = json.load(f)
        for map_file in collection.get("maps", []):
            map_path = addon_path / map_file
            if not map_path.exists():
                continue
            with open(map_path, "r", encoding="utf-8") as f:
                map_data = json.load(f)
            local_id = map_data["id"]
            ns_id = namespace_id(addon_id, local_id)
            map_data["id"] = ns_id
            map_data["_local_id"] = local_id
            map_data["compiled_grid"] = compile_grid(map_data)
            map_data["cell_index"] = {c["id"]: c for c in map_data["cells"]}
            map_data["_source"] = addon_id
            all_maps[ns_id] = map_data

    return {"maps": all_maps}


def compile_grid(map_data: dict) -> list[list[dict]]:
    """Compile the grid into a list of cell display objects for the frontend.

    Each cell becomes: { text: str, color: str, cellId: int | None }
    - cellId is set only for movable cells
    """
    default_color = map_data.get("defaultColor", "#FFFFFF")
    cell_positions: dict[tuple[int, int], int] = {}
    for cell in map_data["cells"]:
        cell_positions[(cell["row"], cell["col"])] = cell["id"]

    compiled: list[list[dict]] = []
    for row_idx, row in enumerate(map_data["grid"]):
        compiled_row: list[dict] = []
        for col_idx, cell in enumerate(row):
            if isinstance(cell, list) and len(cell) == 2:
                text, color = cell[0], cell[1]
            elif isinstance(cell, str):
                text = cell
                color = default_color
            else:
                text = ""
                color = default_color

            cell_id = cell_positions.get((row_idx, col_idx))
            compiled_row.append({
                "text": text,
                "color": color,
                "cellId": cell_id,
            })
        compiled.append(compiled_row)
    return compiled


def validate_move(
    maps: dict[str, dict],
    current_map_id: str,
    current_cell_id: int,
    target_map_id: Optional[str],
    target_cell_id: int,
) -> Optional[int]:
    """Check if a move is valid. Returns travelTime (int) on success, None on failure."""
    current_map = maps.get(current_map_id)
    if not current_map:
        return None

    current_cell = current_map["cell_index"].get(current_cell_id)
    if not current_cell:
        return None

    for conn in current_cell.get("connections", []):
        if conn.get("senseOnly"):
            continue
        conn_map = conn.get("targetMap", current_map_id)
        conn_cell = conn["targetCell"]
        effective_target_map = target_map_id or current_map_id
        if conn_map == effective_target_map and conn_cell == target_cell_id:
            # Verify target cell exists
            target_map = maps.get(effective_target_map)
            if target_map and target_cell_id in target_map["cell_index"]:
                return conn.get("travelTime", 10)

    return None


def build_distance_matrix(maps: dict[str, dict]) -> dict[tuple, dict[tuple, tuple]]:
    """Pre-compute shortest distances (in minutes) and next-hop between all cell pairs.

    Uses Dijkstra with travelTime as edge weight (default 10 min).
    Returns: { (mapId, cellId): { (mapId, cellId): (distance_minutes, next_hop_map, next_hop_cell) } }
    next_hop is the first step on the shortest path from source to dest.
    """
    import heapq

    # Collect all vertices and weighted adjacency: (mapId, cellId)
    all_nodes: list[tuple[str, int]] = []
    adjacency: dict[tuple[str, int], list[tuple[tuple[str, int], int]]] = {}
    for map_id, map_data in maps.items():
        for cell_id, cell_data in map_data["cell_index"].items():
            node = (map_id, cell_id)
            all_nodes.append(node)
            neighbors: list[tuple[tuple[str, int], int]] = []
            for conn in cell_data.get("connections", []):
                if conn.get("senseOnly"):
                    continue
                target_map = conn.get("targetMap", map_id)
                target_cell = conn["targetCell"]
                travel_time = conn.get("travelTime", 10)
                # Verify target exists
                target_map_data = maps.get(target_map)
                if target_map_data and target_cell in target_map_data["cell_index"]:
                    neighbors.append(((target_map, target_cell), travel_time))
            adjacency[node] = neighbors

    # Dijkstra from each node
    matrix: dict[tuple, dict[tuple, tuple]] = {}
    for start in all_nodes:
        dist: dict[tuple[str, int], int] = {start: 0}
        next_hop: dict[tuple[str, int], tuple[str, int]] = {start: start}
        heap: list[tuple[int, tuple[str, int]]] = [(0, start)]
        while heap:
            d, current = heapq.heappop(heap)
            if d > dist.get(current, float("inf")):
                continue
            for neighbor, weight in adjacency.get(current, []):
                nd = d + weight
                if nd < dist.get(neighbor, float("inf")):
                    dist[neighbor] = nd
                    next_hop[neighbor] = next_hop[current] if current != start else neighbor
                    heapq.heappush(heap, (nd, neighbor))
        # Store results
        row: dict[tuple, tuple] = {}
        for node in dist:
            nh = next_hop[node]
            row[node] = (dist[node], nh[0], nh[1])
        matrix[start] = row

    return matrix


MAX_SENSE_DISTANCE = 60  # minutes, hard cutoff for sense range


def build_sense_matrix(maps: dict[str, dict]) -> dict[tuple, dict[tuple, tuple]]:
    """Pre-compute sense ranges between cells, respecting senseBlocked connections.

    Like build_distance_matrix but:
    - Skips connections where senseBlocked=true
    - Enforces MAX_SENSE_DISTANCE cutoff
    - Backward-compatible: no senseBlocked fields = identical to distance_matrix (up to cutoff)

    Returns same format: { (mapId, cellId): { (mapId, cellId): (distance, next_hop_map, next_hop_cell) } }
    """
    import heapq

    all_nodes: list[tuple[str, int]] = []
    adjacency: dict[tuple[str, int], list[tuple[tuple[str, int], int]]] = {}
    for map_id, map_data in maps.items():
        for cell_id, cell_data in map_data["cell_index"].items():
            node = (map_id, cell_id)
            all_nodes.append(node)
            neighbors: list[tuple[tuple[str, int], int]] = []
            for conn in cell_data.get("connections", []):
                if conn.get("senseBlocked"):
                    continue  # skip sense-blocked connections
                target_map = conn.get("targetMap", map_id)
                target_cell = conn["targetCell"]
                travel_time = conn.get("travelTime", 10)
                target_map_data = maps.get(target_map)
                if target_map_data and target_cell in target_map_data["cell_index"]:
                    neighbors.append(((target_map, target_cell), travel_time))
            adjacency[node] = neighbors

    matrix: dict[tuple, dict[tuple, tuple]] = {}
    for start in all_nodes:
        dist: dict[tuple[str, int], int] = {start: 0}
        next_hop: dict[tuple[str, int], tuple[str, int]] = {start: start}
        heap: list[tuple[int, tuple[str, int]]] = [(0, start)]
        while heap:
            d, current = heapq.heappop(heap)
            if d > dist.get(current, float("inf")):
                continue
            for neighbor, weight in adjacency.get(current, []):
                nd = d + weight
                if nd > MAX_SENSE_DISTANCE:
                    continue  # beyond sense range
                if nd < dist.get(neighbor, float("inf")):
                    dist[neighbor] = nd
                    next_hop[neighbor] = next_hop[current] if current != start else neighbor
                    heapq.heappush(heap, (nd, neighbor))
        row: dict[tuple, tuple] = {}
        for node in dist:
            nh = next_hop[node]
            row[node] = (dist[node], nh[0], nh[1])
        matrix[start] = row

    return matrix


def save_map_file(data_dir: Path, map_id: str, map_data: dict) -> None:
    """Save map JSON to file. Strips compiled_grid/cell_index/_source/_local_id before writing."""
    from .character import to_local_id
    local_id = map_data.get("_local_id", to_local_id(map_id))
    clean = {k: v for k, v in map_data.items()
             if k not in ("compiled_grid", "cell_index", "_source", "_local_id")}
    clean["id"] = local_id
    map_path = data_dir / "maps" / f"{local_id.replace('-', '_')}.json"
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)


def create_map(data_dir: Path, map_id: str, name: str, rows: int, cols: int) -> dict:
    """Create an empty map, append to map_collection.json, return raw data."""
    grid: list[list[str]] = [["" for _ in range(cols)] for _ in range(rows)]
    map_data: dict[str, Any] = {
        "id": map_id,
        "name": name,
        "defaultColor": "#FFFFFF",
        "grid": grid,
        "cells": [],
    }
    # Write map file
    maps_dir = data_dir / "maps"
    maps_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{map_id.replace('-', '_')}.json"
    map_path = maps_dir / filename
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(map_data, f, ensure_ascii=False, indent=2)

    # Append to map_collection.json
    collection_path = data_dir / "map_collection.json"
    with open(collection_path, "r", encoding="utf-8") as f:
        collection = json.load(f)
    rel_path = f"maps/{filename}"
    if rel_path not in collection["maps"]:
        collection["maps"].append(rel_path)
    with open(collection_path, "w", encoding="utf-8") as f:
        json.dump(collection, f, ensure_ascii=False, indent=2)

    return map_data


def delete_map(data_dir: Path, map_id: str) -> bool:
    """Delete map file and remove from map_collection.json."""
    collection_path = data_dir / "map_collection.json"
    with open(collection_path, "r", encoding="utf-8") as f:
        collection = json.load(f)

    # Find and remove the map file entry
    to_remove = None
    for map_file in collection["maps"]:
        map_path = data_dir / map_file
        if map_path.exists():
            with open(map_path, "r", encoding="utf-8") as f:
                md = json.load(f)
            if md.get("id") == map_id:
                to_remove = map_file
                map_path.unlink()
                break

    if to_remove is None:
        return False

    collection["maps"] = [m for m in collection["maps"] if m != to_remove]
    with open(collection_path, "w", encoding="utf-8") as f:
        json.dump(collection, f, ensure_ascii=False, indent=2)
    return True


BUILTIN_DIR = Path(__file__).parent.parent / "data" / "builtin"  # legacy, unused

# Type alias for addon directories
AddonDirs = list[tuple[str, Path]]


def _to_addon_dirs(data_dir_or_addons: "Path | AddonDirs") -> "AddonDirs":
    """Convert legacy data_dir to addon_dirs format, or pass through."""
    if isinstance(data_dir_or_addons, Path):
        return [(data_dir_or_addons.name, data_dir_or_addons)]
    return data_dir_or_addons


def load_decor_presets(data_dir_or_addons: "Path | AddonDirs") -> list[dict]:
    """Load decor presets from addon directories, tagged with source."""
    presets: list[dict] = []
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        # Try decor_presets.json first (new format)
        presets_path = addon_path / "decor_presets.json"
        if presets_path.exists():
            with open(presets_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for p in data.get("presets", []):
                presets.append({**p, "source": addon_id})
            continue
        # Fallback: game.json decorPresets (legacy)
        game_json_path = addon_path / "game.json"
        if game_json_path.exists():
            with open(game_json_path, "r", encoding="utf-8") as f:
                game_data = json.load(f)
            for p in game_data.get("decorPresets", []):
                presets.append({**p, "source": addon_id})
    return presets


def save_decor_presets(addon_dir: Path, presets: list[dict]) -> None:
    """Save decor presets to an addon's decor_presets.json."""
    presets_path = addon_dir / "decor_presets.json"
    clean = [{"text": p["text"], "color": p["color"]} for p in presets]
    with open(presets_path, "w", encoding="utf-8") as f:
        json.dump({"presets": clean}, f, ensure_ascii=False, indent=2)


def get_connections(
    maps: dict[str, dict], map_id: str, cell_id: int
) -> list[dict[str, Any]]:
    """Get connection info for a cell, enriched with target names."""
    map_data = maps.get(map_id)
    if not map_data:
        return []

    cell = map_data["cell_index"].get(cell_id)
    if not cell:
        return []

    connections = []
    for conn in cell.get("connections", []):
        if conn.get("senseOnly"):
            continue
        target_map_id = conn.get("targetMap", map_id)
        target_cell_id = conn["targetCell"]
        target_map = maps.get(target_map_id)
        if not target_map:
            continue
        target_cell = target_map["cell_index"].get(target_cell_id)
        if not target_cell:
            continue

        info: dict[str, Any] = {
            "targetCell": target_cell_id,
            "targetCellName": target_cell.get("name", f"{target_cell_id}号"),
            "travelTime": conn.get("travelTime", 10),
        }
        if target_map_id != map_id:
            info["targetMap"] = target_map_id
            info["targetMapName"] = target_map.get("name", target_map_id)
        connections.append(info)

    return connections
