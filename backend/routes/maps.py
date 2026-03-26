from __future__ import annotations

"""Map and decor-preset API routes."""

from fastapi import APIRouter, Body
from pydantic import BaseModel

import routes._helpers as _h
from game.character import get_addon_from_id, to_local_id
from game.map_engine import compile_grid
from routes._helpers import _ensure_ns, _mark_dirty, _resp

router = APIRouter()


def _get_map(map_id: str):
    """Lookup a map from staging+active. Returns None if not found or deleted."""
    from game.staging import _DELETED

    staged = _h.game_state.staging.get("maps", map_id)
    if staged is _DELETED:
        return None
    if staged is not None:
        return staged
    return _h.game_state.maps.get(map_id)


def _merged_maps() -> dict:
    return _h.game_state.staging.merged_defs("maps", _h.game_state.maps)


@router.get("/api/game/maps/raw")
async def get_maps_raw():
    """Get list of all maps (id + name only) — merged."""
    result = []
    for map_id, map_data in _merged_maps().items():
        result.append({"id": map_data["id"], "name": map_data["name"], "source": map_data.get("_source", "")})
    return {"maps": result}


@router.get("/api/game/maps/raw/{map_id:path}")
async def get_map_raw(map_id: str):
    """Get full raw map data without compiled fields — merged."""
    map_id = _ensure_ns(map_id)
    map_data = _get_map(map_id)
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
    """Create a new empty map → staging."""
    source = get_addon_from_id(req.id) or ""
    map_id = _ensure_ns(req.id, source)
    if _get_map(map_id) is not None:
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
    # Store compiled fields for editor preview, but no active-state side effects
    map_data["compiled_grid"] = compile_grid(map_data)
    map_data["cell_index"] = {c["id"]: c for c in map_data["cells"]}
    _h.game_state.staging.put("maps", map_id, map_data)
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "map"})


@router.put("/api/game/maps/raw/{map_id:path}")
async def update_map_raw(map_id: str, body: dict = Body(...)):
    """Save entire map data → staging (no immediate game effect)."""
    map_id = _ensure_ns(map_id)
    existing = _get_map(map_id)
    if not existing:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": map_id})
    source = existing.get("_source", "")
    body["id"] = map_id
    body["_local_id"] = to_local_id(map_id)
    body["_source"] = source
    # Compile grid for editor preview
    body["compiled_grid"] = compile_grid(body)
    body["cell_index"] = {c["id"]: c for c in body.get("cells", [])}
    _h.game_state.staging.put("maps", map_id, body)
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "map"})


@router.delete("/api/game/maps/{map_id:path}")
async def delete_map_endpoint(map_id: str):
    """Delete a map → staging."""
    map_id = _ensure_ns(map_id)
    if _get_map(map_id) is None:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": map_id})
    _h.game_state.staging.delete("maps", map_id)
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "map"})


@router.get("/api/game/decor-presets")
async def get_decor_presets():
    """Get decoration presets — merged."""
    return {"presets": _h.game_state.staging.merged_list("decor_presets", _h.game_state.decor_presets)}


@router.put("/api/game/decor-presets")
async def update_decor_presets(body: dict = Body(...)):
    """Save decor presets → staging."""
    presets = body.get("presets", [])
    _h.game_state.staging.set_list("decor_presets", presets)
    await _mark_dirty()
    return _resp(True, "DECOR_PRESETS_SAVED")
