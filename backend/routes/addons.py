from __future__ import annotations

"""Addon management API routes."""

import json
import shutil

from fastapi import APIRouter, Body

import routes._helpers as _h
from game.addon_loader import (
    ADDONS_DIR,
    copy_addon_version,
    fork_addon_version,
    list_addon_versions,
    list_addon_versions_detail,
    overwrite_addon_version,
)
from routes._helpers import _resp, _validate_id

router = APIRouter()


@router.put("/api/addon/{addon_id}/{version}/meta")
async def update_addon_meta(addon_id: str, version: str, body: dict = Body(...)):
    """Update addon-level shared metadata (name, description, author, cover, categories).

    Writes to addons/{addonId}/meta.json (shared across all versions).
    """
    from game.addon_loader import ADDONS_DIR, load_addon_shared_meta, save_addon_shared_meta

    addon_base = ADDONS_DIR / addon_id
    if not addon_base.exists():
        return _resp(False, "ADDON_NOT_FOUND", {"id": addon_id})
    meta = load_addon_shared_meta(addon_id)
    for key in ("name", "description", "author", "cover", "categories"):
        if key in body:
            meta[key] = body[key]
    save_addon_shared_meta(addon_id, meta)
    return _resp(True, "ADDON_META_UPDATED")


@router.post("/api/addon/{addon_id}/fork")
async def fork_addon(addon_id: str, body: dict = Body(...)):
    """Fork an addon version for a specific world."""
    base_version = body.get("baseVersion", "")
    world_id = body.get("worldId", "")
    if not base_version or not world_id:
        return _resp(False, "FIELD_REQUIRED", {"fields": ["baseVersion", "worldId"]})
    try:
        new_version = fork_addon_version(addon_id, base_version, world_id)
    except FileNotFoundError as e:
        return _resp(False, "ADDON_FORK_FAILED", {"detail": str(e)})
    return {"success": True, "newVersion": new_version}


@router.post("/api/addon/{addon_id}/copy")
async def copy_addon(addon_id: str, body: dict = Body(...)):
    """Copy an addon version to create a new branch or version bump."""
    source_version = body.get("sourceVersion", "")
    new_version = body.get("newVersion", "")
    forked_from = body.get("forkedFrom", None)  # set for branches, None for version bumps
    if not source_version or not new_version:
        return _resp(False, "FIELD_REQUIRED", {"fields": ["sourceVersion", "newVersion"]})
    try:
        result = copy_addon_version(addon_id, source_version, new_version, forked_from)
    except FileExistsError as e:
        return _resp(False, "ADDON_COPY_EXISTS", {"detail": str(e)})
    except FileNotFoundError as e:
        return _resp(False, "ADDON_COPY_NOT_FOUND", {"detail": str(e)})
    return {"success": True, "newVersion": result}


@router.post("/api/addon/{addon_id}/overwrite")
async def overwrite_addon(addon_id: str, body: dict = Body(...)):
    """Overwrite target version's content with source version's files (keeps target metadata)."""
    source_version = body.get("sourceVersion", "")
    target_version = body.get("targetVersion", "")
    if not source_version or not target_version:
        return _resp(False, "FIELD_REQUIRED", {"fields": ["sourceVersion", "targetVersion"]})
    if source_version == target_version:
        return _resp(False, "ADDON_OVERWRITE_SAME")
    try:
        overwrite_addon_version(addon_id, source_version, target_version)
    except FileNotFoundError as e:
        return _resp(False, "ADDON_OVERWRITE_FAILED", {"detail": str(e)})
    return _resp(True, "ADDON_OVERWRITTEN", {"source": source_version, "target": target_version})


@router.get("/api/addon/{addon_id}/versions")
async def get_addon_versions(addon_id: str, detail: bool = False):
    """List all versions of an addon. With detail=true, includes forkedFrom/worldId."""
    if detail:
        return {"versions": list_addon_versions_detail(addon_id)}
    return {"versions": list_addon_versions(addon_id)}


@router.post("/api/addon")
async def create_addon(body: dict = Body(...)):
    """Create a new empty addon with initial version."""
    addon_id = body.get("id", "").strip()
    name = body.get("name", "").strip()
    version = body.get("version", "1.0.0").strip()
    if err := _validate_id(addon_id):
        return err
    if not addon_id:
        return _resp(False, "FIELD_REQUIRED", {"field": "id"})
    if not name:
        return _resp(False, "FIELD_REQUIRED", {"field": "name"})

    version_dir = ADDONS_DIR / addon_id / version
    if version_dir.exists():
        return _resp(False, "ADDON_ALREADY_EXISTS", {"id": addon_id, "version": version})

    version_dir.mkdir(parents=True, exist_ok=True)
    version_meta = {
        "id": addon_id,
        "version": version,
        "dependencies": [],
    }
    with open(version_dir / "addon.json", "w", encoding="utf-8") as f:
        json.dump(version_meta, f, ensure_ascii=False, indent=2)

    # Write shared addon-level metadata
    from game.addon_loader import save_addon_shared_meta

    shared_meta = {
        "name": name,
        "description": body.get("description", ""),
        "author": body.get("author", ""),
        "categories": [],
    }
    save_addon_shared_meta(addon_id, shared_meta)

    return _resp(True, "ADDON_CREATED", {"id": addon_id, "version": version})


@router.delete("/api/addon/{addon_id}")
async def delete_addon_all(addon_id: str):
    """Delete an entire addon (all versions) from disk."""
    addon_dir = ADDONS_DIR / addon_id
    if not addon_dir.exists():
        return _resp(False, "ADDON_NOT_FOUND", {"id": addon_id})

    # Don't allow if any version is currently loaded
    if any(ref.get("id") == addon_id for ref in _h.game_state.addon_refs):
        return _resp(False, "ADDON_IN_USE", {"id": addon_id})

    shutil.rmtree(addon_dir)
    return _resp(True, "ADDON_DELETED", {"id": addon_id})


@router.delete("/api/addon/{addon_id}/{version}")
async def delete_addon(addon_id: str, version: str):
    """Delete an addon version from disk."""
    from game.addon_loader import ADDONS_DIR

    version_dir = ADDONS_DIR / addon_id / version
    if not version_dir.exists():
        return _resp(False, "ADDON_VERSION_NOT_FOUND", {"id": addon_id, "version": version})

    # Don't allow deleting if it's currently loaded
    if any(ref.get("id") == addon_id and ref.get("version") == version for ref in _h.game_state.addon_refs):
        return _resp(False, "ADDON_VERSION_IN_USE", {"id": addon_id, "version": version})

    shutil.rmtree(version_dir)

    return _resp(True, "ADDON_VERSION_DELETED", {"id": addon_id, "version": version})
