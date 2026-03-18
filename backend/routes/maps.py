from __future__ import annotations

"""Map and decor-preset API routes."""

from fastapi import APIRouter, Body
from pydantic import BaseModel

import routes._helpers as _h
from game.character import get_addon_from_id, to_local_id
from game.map_engine import compile_grid
from routes._helpers import _ensure_ns, _mark_dirty, _resp

router = APIRouter()


@router.get("/api/game/maps/raw")
async def get_maps_raw():
    """Get list of all maps (id + name only)."""
    result = []
    for map_id, map_data in _h.game_state.maps.items():
        result.append({"id": map_data["id"], "name": map_data["name"], "source": map_data.get("_source", "")})
    return {"maps": result}


@router.get("/api/game/maps/raw/{map_id:path}")
async def get_map_raw(map_id: str):
    """Get full raw map data (grid + cells + metadata) without compiled fields."""
    map_id = _ensure_ns(map_id)
    map_data = _h.game_state.maps.get(map_id)
    if not map_data:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": map_id})
    return {k: v for k, v in map_data.items() if k not in ("compiled_grid", "cell_index")}


class CreateMapRequest(BaseModel):
    id: str
    name: str
    rows: int
    cols: int


@router.post("/api/game/maps")
async def create_map_endpoint(req: CreateMapRequest):
    """Create a new empty map (in memory)."""
    source = get_addon_from_id(req.id) or ""
    map_id = _ensure_ns(req.id, source)
    if map_id in _h.game_state.maps:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "map", "id": map_id})
    grid = [["" for _ in range(req.cols)] for _ in range(req.rows)]
    map_data = {
        "id": map_id,
        "_local_id": to_local_id(map_id),
        "name": req.name,
        "defaultColor": "#FFFFFF",
        "grid": grid,
        "cells": [],
        "_source": source,
    }
    map_data["compiled_grid"] = compile_grid(map_data)
    map_data["cell_index"] = {c["id"]: c for c in map_data["cells"]}
    _h.game_state.maps[map_id] = map_data
    from game.map_engine import build_distance_matrix

    _h.game_state.distance_matrix = build_distance_matrix(_h.game_state.maps)
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "map"})


@router.put("/api/game/maps/raw/{map_id:path}")
async def update_map_raw(map_id: str, body: dict = Body(...)):
    """Save entire map data (in memory)."""
    map_id = _ensure_ns(map_id)
    if map_id not in _h.game_state.maps:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": map_id})
    source = _h.game_state.maps[map_id].get("_source", "")
    body["id"] = map_id
    body["_local_id"] = to_local_id(map_id)
    body["_source"] = source
    body["compiled_grid"] = compile_grid(body)
    body["cell_index"] = {c["id"]: c for c in body.get("cells", [])}
    _h.game_state.maps[map_id] = body
    from game.map_engine import build_distance_matrix

    _h.game_state.distance_matrix = build_distance_matrix(_h.game_state.maps)
    await _mark_dirty()
    state = _h.game_state.get_full_state()
    await _h.manager.broadcast("state_update", state)
    return _resp(True, "ENTITY_UPDATED", {"entity": "map"})


@router.delete("/api/game/maps/{map_id:path}")
async def delete_map_endpoint(map_id: str):
    """Delete a map (in memory)."""
    map_id = _ensure_ns(map_id)
    if map_id not in _h.game_state.maps:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": map_id})
    del _h.game_state.maps[map_id]
    from game.map_engine import build_distance_matrix

    _h.game_state.distance_matrix = build_distance_matrix(_h.game_state.maps)
    await _mark_dirty()
    state = _h.game_state.get_full_state()
    await _h.manager.broadcast("state_update", state)
    return _resp(True, "ENTITY_DELETED", {"entity": "map"})


@router.get("/api/game/decor-presets")
async def get_decor_presets():
    """Get decoration presets for the map editor."""
    return {"presets": _h.game_state.decor_presets}


@router.put("/api/game/decor-presets")
async def update_decor_presets(body: dict = Body(...)):
    """Save game-specific decor presets (in memory)."""
    presets = body.get("presets", [])
    _h.game_state.decor_presets = presets
    await _mark_dirty()
    return _resp(True, "DECOR_PRESETS_SAVED")
