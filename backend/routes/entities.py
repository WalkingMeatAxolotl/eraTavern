"""Entity CRUD routes — characters, traits, clothing, items, actions, etc."""

from __future__ import annotations

import copy
import shutil
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import APIRouter, Body

import routes._helpers as _h
from game.character import get_addon_from_id, namespace_id, to_local_id
from routes._helpers import _ensure_ns, _mark_dirty, _resp, _validate_id

router = APIRouter()


# ===========================================================================
# Generic CRUD factory
# ===========================================================================


def _get_defs(attr: str) -> dict:
    return getattr(_h.game_state, attr)


def _get_merged(attr: str) -> dict:
    """Return merged (active + staged) defs for an entity type."""
    return _h.game_state.staging.merged_defs(attr, _get_defs(attr))


def _get_entity(attr: str, entity_id: str) -> Optional[dict]:
    """Lookup a single entity from staging+active. Returns None if not found or deleted."""
    from game.staging import _DELETED

    staged = _h.game_state.staging.get(attr, entity_id)
    if staged is _DELETED:
        return None
    if staged is not None:
        return staged
    return _get_defs(attr).get(entity_id)


def _register_crud(
    entity_name: str,
    defs_attr: str,
    list_key: str,
    url_prefix: str,
    on_create: Optional[Callable[[str, dict], Any]] = None,
    on_delete: Optional[Callable[[str], Any]] = None,
    list_transform: Optional[Callable[[dict], dict]] = None,
) -> None:
    """Register standard List / Create / Update / Delete routes for an entity type.

    All writes go to the staging layer; reads return merged (active + staged) data.
    """

    # --- LIST ---
    @router.get(url_prefix)
    async def list_entities(_defs_attr=defs_attr, _list_key=list_key, _transform=list_transform):
        merged = _get_merged(_defs_attr)
        items = [_transform(d) if _transform else d for d in merged.values()]
        return {_list_key: items}

    list_entities.__name__ = f"list_{entity_name}"

    # --- CREATE ---
    @router.post(url_prefix)
    async def create_entity(body: dict = Body(...), _name=entity_name, _defs_attr=defs_attr, _on_create=on_create):
        raw_id = body.get("id", "")
        if err := _validate_id(raw_id):
            return err
        source = body.get("source") or get_addon_from_id(raw_id) or ""
        eid = _ensure_ns(raw_id, source)
        if not eid:
            return _resp(False, "ENTITY_MISSING_ID", {"entity": _name})
        # Check merged (active + staged) for duplicates
        if _get_entity(_defs_attr, eid) is not None:
            return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": _name, "id": eid})
        entry = {k: v for k, v in body.items() if k != "source"}
        entry["id"] = eid
        entry["_local_id"] = to_local_id(eid)
        entry["source"] = source
        _h.game_state.staging.put(_defs_attr, eid, entry)
        if _on_create:
            _on_create(eid, entry)
        await _mark_dirty()
        return _resp(True, "ENTITY_CREATED", {"entity": _name})

    create_entity.__name__ = f"create_{entity_name}"

    # --- UPDATE ---
    @router.put(url_prefix + "/{entity_id:path}")
    async def update_entity(entity_id: str, body: dict = Body(...), _name=entity_name, _defs_attr=defs_attr):
        entity_id = _ensure_ns(entity_id)
        existing = _get_entity(_defs_attr, entity_id)
        if not existing:
            return _resp(False, "ENTITY_NOT_FOUND", {"entity": _name, "id": entity_id})
        source = existing.get("source", "")
        entry = {k: v for k, v in body.items() if k != "source"}
        entry["id"] = entity_id
        entry["_local_id"] = to_local_id(entity_id)
        entry["source"] = source
        _h.game_state.staging.put(_defs_attr, entity_id, entry)
        await _mark_dirty()
        return _resp(True, "ENTITY_UPDATED", {"entity": _name})

    update_entity.__name__ = f"update_{entity_name}"

    # --- DELETE ---
    @router.delete(url_prefix + "/{entity_id:path}")
    async def delete_entity(entity_id: str, _name=entity_name, _defs_attr=defs_attr, _on_delete=on_delete):
        entity_id = _ensure_ns(entity_id)
        if _get_entity(_defs_attr, entity_id) is None:
            return _resp(False, "ENTITY_NOT_FOUND", {"entity": _name, "id": entity_id})
        _h.game_state.staging.delete(_defs_attr, entity_id)
        if _on_delete:
            _on_delete(entity_id)
        await _mark_dirty()
        return _resp(True, "ENTITY_DELETED", {"entity": _name})

    delete_entity.__name__ = f"delete_{entity_name}"


# ===========================================================================
# Delete hooks
# ===========================================================================


def _on_delete_trait(trait_id: str) -> None:
    """Remove trait from trait_groups. Operates on staging to avoid touching active data."""
    staging = _h.game_state.staging
    merged_groups = _get_merged("trait_groups")
    for gid, group in merged_groups.items():
        traits_list = group.get("traits", [])
        if trait_id in traits_list:
            updated = {**group, "traits": [t for t in traits_list if t != trait_id]}
            staging.put("trait_groups", gid, updated)


def _on_delete_event(_event_id: str) -> None:
    """No-op under staging. event_state is runtime data; load_world resets it."""
    pass


def _on_create_world_variable(_var_id: str, _entry: dict) -> None:
    """No-op under staging. world_variables initialized by load_world._init_world_variables."""
    pass


def _on_delete_world_variable(_var_id: str) -> None:
    """No-op under staging. Variable removed from defs; load_world won't init it."""
    pass


def _item_list_transform(d: dict) -> dict:
    item = {**d}
    item.setdefault("tags", [])
    item.setdefault("description", "")
    item.setdefault("maxStack", 1)
    item.setdefault("sellable", True)
    item.setdefault("price", 0)
    return item


# ===========================================================================
# Register all entity CRUD
# ===========================================================================

_register_crud("trait", "trait_defs", "traits", "/api/game/traits", on_delete=_on_delete_trait)
_register_crud("clothing", "clothing_defs", "clothing", "/api/game/clothing")
_register_crud("item", "item_defs", "items", "/api/game/items", list_transform=_item_list_transform)
_register_crud("action", "action_defs", "actions", "/api/game/actions")
_register_crud("traitGroup", "trait_groups", "traitGroups", "/api/game/trait-groups")
_register_crud("variable", "variable_defs", "variables", "/api/game/variables")
_register_crud("event", "event_defs", "events", "/api/game/events", on_delete=_on_delete_event)
_register_crud("lorebook", "lorebook_defs", "entries", "/api/game/lorebook")
_register_crud(
    "worldVariable",
    "world_variable_defs",
    "worldVariables",
    "/api/game/world-variables",
    on_create=_on_create_world_variable,
    on_delete=_on_delete_world_variable,
)


# ===========================================================================
# Generic clone endpoint
# ===========================================================================

# entityType → (game_state attr, source field name)
_CLONE_TYPE_MAP: dict[str, tuple[str, str]] = {
    "traits": ("trait_defs", "source"),
    "clothing": ("clothing_defs", "source"),
    "items": ("item_defs", "source"),
    "actions": ("action_defs", "source"),
    "trait-groups": ("trait_groups", "source"),
    "variables": ("variable_defs", "source"),
    "events": ("event_defs", "source"),
    "lorebooks": ("lorebook_defs", "source"),
    "world-variables": ("world_variable_defs", "source"),
}


def _get_addon_asset_root(addon_id: str) -> Optional[Path]:
    """Get the addon root directory (parent of version dir) for asset operations."""
    for aid, apath in _h.game_state.addon_dirs:
        if aid == addon_id:
            return apath.parent
    return None


def _copy_assets(
    source_addon: str,
    target_addon: str,
    subfolder: str,
    filenames: list[str],
) -> None:
    """Copy asset files between addon directories. Skips if source == target or file missing."""
    if source_addon == target_addon or not filenames:
        return
    src_root = _get_addon_asset_root(source_addon)
    dst_root = _get_addon_asset_root(target_addon)
    if not src_root or not dst_root:
        return
    dst_dir = dst_root / "assets" / subfolder
    dst_dir.mkdir(parents=True, exist_ok=True)
    for fname in filenames:
        if not fname:
            continue
        src_file = src_root / "assets" / subfolder / fname
        dst_file = dst_dir / fname
        if src_file.exists() and not dst_file.exists():
            shutil.copy2(src_file, dst_file)


@router.post("/api/game/clone")
async def clone_entity(body: dict = Body(...)):
    """Clone any entity: deep-copy source in memory, assign new id/source."""
    entity_type = body.get("entityType", "")
    source_id = _ensure_ns(body.get("sourceId", ""))
    target_addon = body.get("targetAddon", "")
    new_local_id = body.get("newLocalId", "")

    if not all([entity_type, source_id, target_addon, new_local_id]):
        return _resp(False, "CLONE_MISSING_PARAMS")
    if err := _validate_id(new_local_id):
        return err

    new_id = namespace_id(target_addon, new_local_id)
    gs = _h.game_state

    # ── Map → staging (no distance_matrix rebuild) ──
    if entity_type == "maps":
        src = _get_entity("maps", source_id)
        if not src:
            return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": source_id})
        if _get_entity("maps", new_id) is not None:
            return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "map", "id": new_id})
        clone = copy.deepcopy(src)
        clone["id"] = new_id
        clone["_local_id"] = new_local_id
        clone["_source"] = target_addon
        from game.map_engine import compile_grid

        clone["compiled_grid"] = compile_grid(clone)
        clone["cell_index"] = {c["id"]: c for c in clone.get("cells", [])}
        gs.staging.put("maps", new_id, clone)
        # Copy background images across addons
        source_addon = src.get("_source", "")
        bg_files = [f for f in [clone.get("backgroundImage")] if f]
        bg_files += [c.get("backgroundImage", "") for c in clone.get("cells", [])]
        _copy_assets(source_addon, target_addon, "backgrounds", bg_files)
        await _mark_dirty()
        return _resp(True, "ENTITY_CLONED", {"entity": "map", "id": new_id})

    # ── Character → staging (no _build_char) ──
    if entity_type == "characters":
        src = _get_entity("character_data", source_id)
        if not src:
            return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": source_id})
        if _get_entity("character_data", new_id) is not None:
            return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "character", "id": new_id})
        clone = copy.deepcopy(src)
        clone["id"] = new_id
        clone["_local_id"] = new_local_id
        clone["_source"] = target_addon
        clone["isPlayer"] = False
        gs.staging.put("character_data", new_id, clone)
        # Copy portrait across addons
        source_addon = src.get("_source", "")
        _copy_assets(source_addon, target_addon, "characters", [clone.get("portrait", "")])
        await _mark_dirty()
        return _resp(True, "ENTITY_CLONED", {"entity": "character", "id": new_id})

    # ── Generic entities → staging ──
    type_info = _CLONE_TYPE_MAP.get(entity_type)
    if not type_info:
        return _resp(False, "CLONE_INVALID_TYPE", {"entityType": entity_type})

    defs_attr, source_field = type_info
    src = _get_entity(defs_attr, source_id)
    if not src:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": entity_type, "id": source_id})
    if _get_entity(defs_attr, new_id) is not None:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": entity_type, "id": new_id})

    clone = copy.deepcopy(src)
    clone["id"] = new_id
    clone["_local_id"] = new_local_id
    clone[source_field] = target_addon
    gs.staging.put(defs_attr, new_id, clone)

    # on_create hooks
    if entity_type == "world-variables":
        gs.world_variables[new_id] = clone.get("default", 0)

    await _mark_dirty()
    return _resp(True, "ENTITY_CLONED", {"entity": entity_type, "id": new_id})


# ===========================================================================
# Raw JSON file read/write (direct disk access + reload)
# ===========================================================================

_ALLOWED_RAW_FILES = {
    "traits.json",
    "items.json",
    "clothing.json",
    "actions.json",
    "variables.json",
    "events.json",
    "lorebook.json",
}


def _resolve_addon_file(addon_id: str, filename: str):
    """Resolve addon file path. Returns (path, error_resp) tuple."""
    if filename not in _ALLOWED_RAW_FILES:
        return None, _resp(False, "RAW_FILE_NOT_ALLOWED", {"filename": filename})
    gs = _h.game_state
    target_dir = None
    for aid, apath in gs.addon_dirs:
        if aid == addon_id:
            target_dir = apath
            break
    if target_dir is None:
        return None, _resp(False, "ADDON_NOT_FOUND", {"id": addon_id})
    return target_dir / filename, None


@router.get("/api/game/raw-file/{addon_id}/{filename}")
async def read_raw_file(addon_id: str, filename: str):
    """Read a raw JSON file from an addon directory."""
    filepath, err = _resolve_addon_file(addon_id, filename)
    if err:
        return err
    if not filepath.exists():
        return {"content": "{}"}
    with open(filepath, "r", encoding="utf-8") as f:
        return {"content": f.read()}


@router.put("/api/game/raw-file/{addon_id}/{filename}")
async def write_raw_file(addon_id: str, filename: str, body: dict = Body(...)):
    """Write a raw JSON file to an addon directory, then reload game state."""
    filepath, err = _resolve_addon_file(addon_id, filename)
    if err:
        return err

    content = body.get("content", "")
    # Basic JSON validity check
    import json as _json

    try:
        _json.loads(content)
    except _json.JSONDecodeError as e:
        return _resp(False, "RAW_FILE_INVALID_JSON", {"error": str(e)})

    # Write to disk
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    # Reload all definitions from disk
    gs = _h.game_state
    snapshot = gs._snapshot_runtime()
    gs._load_maps_and_matrices()
    gs._load_all_defs()
    gs._resolve_namespaces()
    gs._build_cell_action_index()
    gs.npc_goals = {}
    gs._rebuild_characters(snapshot)
    gs.dirty = False

    # Notify frontend of state change
    state = gs.get_full_state()
    await _h.manager.broadcast("game_changed", state)
    await _h.manager.broadcast("dirty_update", {"dirty": False})

    return _resp(True, "RAW_FILE_SAVED")


# ===========================================================================
# Definitions (read-only aggregate)
# ===========================================================================


@router.get("/api/game/definitions")
async def get_definitions():
    """Get template, clothing defs, trait defs, and map summaries for the editor (merged)."""
    return _h.game_state.get_definitions(merged=True)


# ===========================================================================
# Character Config CRUD (non-standard — has patch, build_char, favorability cleanup)
# ===========================================================================


@router.get("/api/game/characters/config")
async def get_character_configs():
    """Get all character raw JSON configs (merged: active + staged)."""
    merged = _get_merged("character_data")
    return {"characters": list(merged.values())}


@router.get("/api/game/characters/config/{character_id:path}")
async def get_character_config(character_id: str):
    """Get a single character raw JSON config (merged)."""
    character_id = _ensure_ns(character_id)
    char = _get_entity("character_data", character_id)
    if not char:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    return char


@router.put("/api/game/characters/config/{character_id:path}")
async def update_character_config(character_id: str, body: dict = Body(...)):
    """Update a character config → staging (no immediate game effect)."""
    character_id = _ensure_ns(character_id)
    existing = _get_entity("character_data", character_id)
    if not existing:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    source = existing.get("_source", "")
    body["id"] = character_id
    body["_local_id"] = to_local_id(character_id)
    body["_source"] = source
    _h.game_state.staging.put("character_data", character_id, body)
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "character"})


@router.post("/api/game/characters/config")
async def create_character_config(body: dict = Body(...)):
    """Create a new character → staging."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    char_id = _ensure_ns(raw_id, source)
    if not char_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "character"})
    if _get_entity("character_data", char_id) is not None:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "character", "id": char_id})
    body["id"] = char_id
    body["_local_id"] = to_local_id(char_id)
    body["_source"] = source
    _h.game_state.staging.put("character_data", char_id, body)
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "character"})


@router.patch("/api/game/characters/config/{character_id:path}")
async def patch_character_config(character_id: str, body: dict = Body(...)):
    """Partial update: toggle isPlayer, active, etc. → staging."""
    character_id = _ensure_ns(character_id)
    char = _get_entity("character_data", character_id)
    if not char:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})

    # Work on a copy to avoid mutating active or staged data
    updated = {**char}

    # isPlayer is exclusive — if setting to True, clear all others in merged view
    if body.get("isPlayer") is True:
        merged = _get_merged("character_data")
        for cid, cd in merged.items():
            if cid != character_id and cd.get("isPlayer"):
                cleared = {**cd, "isPlayer": False}
                _h.game_state.staging.put("character_data", cid, cleared)

    # Prevent freezing the player character
    if body.get("active") is False and updated.get("isPlayer"):
        return _resp(False, "CHARACTER_CANNOT_FREEZE_PLAYER")

    for key in ("isPlayer", "active"):
        if key in body:
            updated[key] = body[key]

    _h.game_state.staging.put("character_data", character_id, updated)
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "character"})


@router.delete("/api/game/characters/config/{character_id:path}")
async def delete_character_config(character_id: str):
    """Delete a character → staging."""
    character_id = _ensure_ns(character_id)
    if _get_entity("character_data", character_id) is None:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    _h.game_state.staging.delete("character_data", character_id)
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "character"})


# ===========================================================================
# Outfit Types (non-standard — PUT replaces full list)
# ===========================================================================


@router.get("/api/game/outfit-types")
async def get_outfit_types():
    """Get all outfit type names."""
    return {"outfitTypes": _h.game_state.staging.merged_list("outfit_types", _h.game_state.outfit_types)}


@router.put("/api/game/outfit-types")
async def update_outfit_types(body: dict = Body(...)):
    """Replace the full outfit types list."""
    types = body.get("outfitTypes", [])
    if not isinstance(types, list):
        return _resp(False, "VALIDATION_INVALID_TYPE")
    cleaned = []
    seen = set()
    for t in types:
        if isinstance(t, dict) and t.get("id") and t["id"] != "default":
            oid = t["id"]
            if oid not in seen:
                seen.add(oid)
                cleaned.append(
                    {
                        "id": oid,
                        "name": t.get("name", oid),
                        "description": t.get("description", ""),
                        "copyDefault": bool(t.get("copyDefault", True)),
                        "slots": t.get("slots", {}),
                    }
                )
    _h.game_state.staging.set_list("outfit_types", cleaned)
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "outfitTypes"})


# ===========================================================================
# Tag pools (non-standard — simple append/remove, no namespace)
# ===========================================================================


def _register_tag_crud(tag_name: str, attr: str, url_prefix: str) -> None:
    """Register tag pool CRUD routes — uses staging."""

    @router.get(url_prefix)
    async def get_tags(_attr=attr):
        return {"tags": _h.game_state.staging.merged_list(_attr, getattr(_h.game_state, _attr))}

    get_tags.__name__ = f"get_{tag_name}_tags"

    @router.post(url_prefix)
    async def create_tag(body: dict = Body(...), _attr=attr):
        tag = body.get("tag", "").strip()
        if not tag:
            return _resp(False, "TAG_EMPTY")
        merged = _h.game_state.staging.merged_list(_attr, getattr(_h.game_state, _attr))
        if tag in merged:
            return _resp(False, "TAG_ALREADY_EXISTS", {"tag": tag})
        updated = list(merged) + [tag]
        _h.game_state.staging.set_list(_attr, updated)
        await _mark_dirty()
        return _resp(True, "TAG_ADDED", {"tag": tag})

    create_tag.__name__ = f"create_{tag_name}_tag"

    @router.delete(url_prefix + "/{tag}")
    async def delete_tag(tag: str, _attr=attr):
        merged = _h.game_state.staging.merged_list(_attr, getattr(_h.game_state, _attr))
        if tag not in merged:
            return _resp(False, "TAG_NOT_FOUND", {"tag": tag})
        updated = [t for t in merged if t != tag]
        _h.game_state.staging.set_list(_attr, updated)
        await _mark_dirty()
        return _resp(True, "TAG_DELETED", {"tag": tag})

    delete_tag.__name__ = f"delete_{tag_name}_tag"


_register_tag_crud("item", "item_tags", "/api/game/item-tags")
_register_tag_crud("variable", "variable_tags", "/api/game/variable-tags")


# ===========================================================================
# Variable evaluate (standalone endpoint)
# ===========================================================================


@router.post("/api/game/variables/{var_id:path}/evaluate")
async def evaluate_variable_endpoint(var_id: str, body: dict = Body(...)):
    """Evaluate a derived variable against a character's state."""
    from game.variable_engine import evaluate_variable_debug

    var_id = _ensure_ns(var_id)
    vd = _h.game_state.variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "variable", "id": var_id})

    char_id = body.get("characterId", "")
    char_id = _ensure_ns(char_id)
    char_state = _h.game_state.characters.get(char_id)
    if not char_state:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": char_id})

    target_id = body.get("targetId", "")
    if target_id:
        target_id = _ensure_ns(target_id)
    target_state = _h.game_state.characters.get(target_id) if target_id else None
    result = evaluate_variable_debug(
        vd,
        char_state,
        _h.game_state.variable_defs,
        target_state=target_state,
        game_state=_h.game_state,
        char_id=char_id,
        target_id=target_id or None,
    )
    return {"success": True, **result}
