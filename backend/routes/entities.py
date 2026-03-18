"""Entity CRUD routes — characters, traits, clothing, items, actions, etc."""

from __future__ import annotations

from fastapi import APIRouter, Body

import routes._helpers as _h
from game.character import get_addon_from_id, to_local_id
from routes._helpers import _ensure_ns, _mark_dirty, _resp, _validate_id

router = APIRouter()


# ---------------------------------------------------------------------------
# Definitions (read-only aggregate)
# ---------------------------------------------------------------------------


@router.get("/api/game/definitions")
async def get_definitions():
    """Get template, clothing defs, trait defs, and map summaries for the editor."""
    return _h.game_state.get_definitions()


# ---------------------------------------------------------------------------
# Character Config CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/characters/config")
async def get_character_configs():
    """Get all character raw JSON configs."""
    return {"characters": list(_h.game_state.character_data.values())}


@router.get("/api/game/characters/config/{character_id:path}")
async def get_character_config(character_id: str):
    """Get a single character raw JSON config."""
    character_id = _ensure_ns(character_id)
    char = _h.game_state.character_data.get(character_id)
    if not char:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    return char


@router.put("/api/game/characters/config/{character_id:path}")
async def update_character_config(character_id: str, body: dict = Body(...)):
    """Update a character config (in memory). Rebuilds runtime state."""
    character_id = _ensure_ns(character_id)
    if character_id not in _h.game_state.character_data:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    source = _h.game_state.character_data[character_id].get("_source", "")
    body["id"] = character_id
    body["_local_id"] = to_local_id(character_id)
    body["_source"] = source
    _h.game_state.character_data[character_id] = body
    # Rebuild runtime character state from new data
    _h.game_state.characters[character_id] = _h.game_state._build_char(character_id)
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "character"})


@router.post("/api/game/characters/config")
async def create_character_config(body: dict = Body(...)):
    """Create a new character (in memory). Builds runtime state."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    char_id = _ensure_ns(raw_id, source)
    if not char_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "character"})
    if char_id in _h.game_state.character_data:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "character", "id": char_id})
    body["id"] = char_id
    body["_local_id"] = to_local_id(char_id)
    body["_source"] = source
    _h.game_state.character_data[char_id] = body
    _h.game_state.characters[char_id] = _h.game_state._build_char(char_id)
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "character"})


@router.patch("/api/game/characters/config/{character_id:path}")
async def patch_character_config(character_id: str, body: dict = Body(...)):
    """Partial update: toggle isPlayer, active, etc. (in memory)."""
    character_id = _ensure_ns(character_id)
    if character_id not in _h.game_state.character_data:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    char = _h.game_state.character_data[character_id]

    # isPlayer is exclusive — if setting to True, clear all others
    if body.get("isPlayer") is True:
        for cid, cd in _h.game_state.character_data.items():
            if cd.get("isPlayer"):
                cd["isPlayer"] = False

    # Prevent freezing the player character
    if body.get("active") is False and char.get("isPlayer"):
        return _resp(False, "CHARACTER_CANNOT_FREEZE_PLAYER")

    for key in ("isPlayer", "active"):
        if key in body:
            char[key] = body[key]

    # Rebuild runtime characters (active only)
    _h.game_state.characters = {}
    for cid, cd in _h.game_state.character_data.items():
        if cd.get("active", True) is False:
            continue
        _h.game_state.characters[cid] = _h.game_state._build_char(cid)
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "character"})


@router.delete("/api/game/characters/config/{character_id:path}")
async def delete_character_config(character_id: str):
    """Delete a character (in memory)."""
    character_id = _ensure_ns(character_id)
    if character_id not in _h.game_state.character_data:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    del _h.game_state.character_data[character_id]
    _h.game_state.characters.pop(character_id, None)
    # Clean up references from other characters
    for cdata in _h.game_state.character_data.values():
        fav = cdata.get("favorability")
        if isinstance(fav, dict):
            fav.pop(character_id, None)
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "character"})


# ---------------------------------------------------------------------------
# Trait CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/traits")
async def get_traits():
    """Get all trait definitions (builtin + game)."""
    return {"traits": list(_h.game_state.trait_defs.values())}


@router.post("/api/game/traits")
async def create_trait(body: dict = Body(...)):
    """Create a new game trait (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    trait_id = _ensure_ns(raw_id, source)
    if not trait_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "trait"})
    if trait_id in _h.game_state.trait_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "trait", "id": trait_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = trait_id
    entry["_local_id"] = to_local_id(trait_id)
    entry["source"] = source
    _h.game_state.trait_defs[trait_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "trait"})


@router.put("/api/game/traits/{trait_id:path}")
async def update_trait(trait_id: str, body: dict = Body(...)):
    """Update a game trait (in memory)."""
    trait_id = _ensure_ns(trait_id)
    td = _h.game_state.trait_defs.get(trait_id)
    if not td:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "trait", "id": trait_id})
    source = td.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = trait_id
    entry["_local_id"] = to_local_id(trait_id)
    entry["source"] = source
    _h.game_state.trait_defs[trait_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "trait"})


@router.delete("/api/game/traits/{trait_id:path}")
async def delete_trait(trait_id: str):
    """Delete a game trait (in memory)."""
    trait_id = _ensure_ns(trait_id)
    td = _h.game_state.trait_defs.get(trait_id)
    if not td:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "trait", "id": trait_id})
    del _h.game_state.trait_defs[trait_id]
    # Remove from all trait groups that reference this trait
    for group in _h.game_state.trait_groups.values():
        traits_list = group.get("traits", [])
        if trait_id in traits_list:
            group["traits"] = [t for t in traits_list if t != trait_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "trait"})


# ---------------------------------------------------------------------------
# Clothing CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/clothing")
async def get_clothing():
    """Get all clothing definitions (builtin + game)."""
    return {"clothing": list(_h.game_state.clothing_defs.values())}


@router.post("/api/game/clothing")
async def create_clothing(body: dict = Body(...)):
    """Create a new game clothing item (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    item_id = _ensure_ns(raw_id, source)
    if not item_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "clothing"})
    if item_id in _h.game_state.clothing_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "clothing", "id": item_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["_local_id"] = to_local_id(item_id)
    entry["source"] = source
    _h.game_state.clothing_defs[item_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "clothing"})


@router.put("/api/game/clothing/{item_id:path}")
async def update_clothing(item_id: str, body: dict = Body(...)):
    """Update a game clothing item (in memory)."""
    item_id = _ensure_ns(item_id)
    cd = _h.game_state.clothing_defs.get(item_id)
    if not cd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "clothing", "id": item_id})
    source = cd.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["_local_id"] = to_local_id(item_id)
    entry["source"] = source
    _h.game_state.clothing_defs[item_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "clothing"})


@router.delete("/api/game/clothing/{item_id:path}")
async def delete_clothing(item_id: str):
    """Delete a game clothing item (in memory)."""
    item_id = _ensure_ns(item_id)
    cd = _h.game_state.clothing_defs.get(item_id)
    if not cd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "clothing", "id": item_id})
    del _h.game_state.clothing_defs[item_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "clothing"})


# ---------------------------------------------------------------------------
# Outfit Types
# ---------------------------------------------------------------------------


@router.get("/api/game/outfit-types")
async def get_outfit_types():
    """Get all outfit type names."""
    return {"outfitTypes": _h.game_state.outfit_types}


@router.put("/api/game/outfit-types")
async def update_outfit_types(body: dict = Body(...)):
    """Replace the full outfit types list."""
    types = body.get("outfitTypes", [])
    if not isinstance(types, list):
        return _resp(False, "VALIDATION_INVALID_TYPE")
    # Filter out 默认服装 (always implicit), ensure valid objects
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
    _h.game_state.outfit_types = cleaned
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "outfitTypes"})


# ---------------------------------------------------------------------------
# Item CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/items")
async def get_items():
    """Get all item definitions (builtin + game)."""
    items = []
    for d in _h.game_state.item_defs.values():
        item = {**d}
        item.setdefault("tags", [])
        item.setdefault("description", "")
        item.setdefault("maxStack", 1)
        item.setdefault("sellable", True)
        item.setdefault("price", 0)
        items.append(item)
    return {"items": items}


@router.post("/api/game/items")
async def create_item(body: dict = Body(...)):
    """Create a new game item (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    item_id = _ensure_ns(raw_id, source)
    if not item_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "item"})
    if item_id in _h.game_state.item_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "item", "id": item_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["_local_id"] = to_local_id(item_id)
    entry["source"] = source
    _h.game_state.item_defs[item_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "item"})


@router.put("/api/game/items/{item_id:path}")
async def update_item(item_id: str, body: dict = Body(...)):
    """Update a game item (in memory)."""
    item_id = _ensure_ns(item_id)
    item_def = _h.game_state.item_defs.get(item_id)
    if not item_def:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "item", "id": item_id})
    source = item_def.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["_local_id"] = to_local_id(item_id)
    entry["source"] = source
    _h.game_state.item_defs[item_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "item"})


@router.delete("/api/game/items/{item_id:path}")
async def delete_item(item_id: str):
    """Delete a game item (in memory)."""
    item_id = _ensure_ns(item_id)
    item_def = _h.game_state.item_defs.get(item_id)
    if not item_def:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "item", "id": item_id})
    del _h.game_state.item_defs[item_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "item"})


# ---------------------------------------------------------------------------
# Item Tag pool
# ---------------------------------------------------------------------------


@router.get("/api/game/item-tags")
async def get_item_tags():
    """Get item tag pool."""
    return {"tags": _h.game_state.item_tags}


@router.post("/api/game/item-tags")
async def create_item_tag(body: dict = Body(...)):
    """Add a tag to the pool."""
    tag = body.get("tag", "").strip()
    if not tag:
        return _resp(False, "TAG_EMPTY")
    if tag in _h.game_state.item_tags:
        return _resp(False, "TAG_ALREADY_EXISTS", {"tag": tag})
    _h.game_state.item_tags.append(tag)
    await _mark_dirty()
    return _resp(True, "TAG_ADDED", {"tag": tag})


@router.delete("/api/game/item-tags/{tag}")
async def delete_item_tag(tag: str):
    """Remove a tag from the pool."""
    if tag not in _h.game_state.item_tags:
        return _resp(False, "TAG_NOT_FOUND", {"tag": tag})
    _h.game_state.item_tags.remove(tag)
    await _mark_dirty()
    return _resp(True, "TAG_DELETED", {"tag": tag})


# ---------------------------------------------------------------------------
# Action CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/actions")
async def get_actions_defs():
    """Get all action definitions (builtin + game)."""
    return {"actions": list(_h.game_state.action_defs.values())}


@router.post("/api/game/actions")
async def create_action_def(body: dict = Body(...)):
    """Create a new game action (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    action_id = _ensure_ns(raw_id, source)
    if not action_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "action"})
    if action_id in _h.game_state.action_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "action", "id": action_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = action_id
    entry["_local_id"] = to_local_id(action_id)
    entry["source"] = source
    _h.game_state.action_defs[action_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "action"})


@router.put("/api/game/actions/{action_id:path}")
async def update_action_def(action_id: str, body: dict = Body(...)):
    """Update a game action (in memory)."""
    action_id = _ensure_ns(action_id)
    action_def = _h.game_state.action_defs.get(action_id)
    if not action_def:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "action", "id": action_id})
    source = action_def.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = action_id
    entry["_local_id"] = to_local_id(action_id)
    entry["source"] = source
    _h.game_state.action_defs[action_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "action"})


@router.delete("/api/game/actions/{action_id:path}")
async def delete_action_def(action_id: str):
    """Delete a game action (in memory)."""
    action_id = _ensure_ns(action_id)
    action_def = _h.game_state.action_defs.get(action_id)
    if not action_def:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "action", "id": action_id})
    del _h.game_state.action_defs[action_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "action"})


# ---------------------------------------------------------------------------
# Trait Group CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/trait-groups")
async def get_trait_groups():
    """Get all trait group definitions (builtin + game)."""
    return {"traitGroups": list(_h.game_state.trait_groups.values())}


@router.post("/api/game/trait-groups")
async def create_trait_group(body: dict = Body(...)):
    """Create a new game trait group (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    group_id = _ensure_ns(raw_id, source)
    if not group_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "traitGroup"})
    if group_id in _h.game_state.trait_groups:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "traitGroup", "id": group_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = group_id
    entry["_local_id"] = to_local_id(group_id)
    entry["source"] = source
    _h.game_state.trait_groups[group_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "traitGroup"})


@router.put("/api/game/trait-groups/{group_id:path}")
async def update_trait_group(group_id: str, body: dict = Body(...)):
    """Update a game trait group (in memory)."""
    group_id = _ensure_ns(group_id)
    tg = _h.game_state.trait_groups.get(group_id)
    if not tg:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "traitGroup", "id": group_id})
    source = tg.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = group_id
    entry["_local_id"] = to_local_id(group_id)
    entry["source"] = source
    _h.game_state.trait_groups[group_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "traitGroup"})


@router.delete("/api/game/trait-groups/{group_id:path}")
async def delete_trait_group(group_id: str):
    """Delete a game trait group (in memory)."""
    group_id = _ensure_ns(group_id)
    tg = _h.game_state.trait_groups.get(group_id)
    if not tg:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "traitGroup", "id": group_id})
    del _h.game_state.trait_groups[group_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "traitGroup"})


# ---------------------------------------------------------------------------
# Variable CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/variables")
async def get_variables():
    """Get all derived variable definitions."""
    return {"variables": list(_h.game_state.variable_defs.values())}


@router.post("/api/game/variables")
async def create_variable(body: dict = Body(...)):
    """Create a new derived variable (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    var_id = _ensure_ns(raw_id, source)
    if not var_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "variable"})
    if var_id in _h.game_state.variable_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "variable", "id": var_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = var_id
    entry["_local_id"] = to_local_id(var_id)
    entry["source"] = source
    _h.game_state.variable_defs[var_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "variable"})


@router.put("/api/game/variables/{var_id:path}")
async def update_variable(var_id: str, body: dict = Body(...)):
    """Update a derived variable (in memory)."""
    var_id = _ensure_ns(var_id)
    vd = _h.game_state.variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "variable", "id": var_id})
    source = vd.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = var_id
    entry["_local_id"] = to_local_id(var_id)
    entry["source"] = source
    _h.game_state.variable_defs[var_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "variable"})


@router.delete("/api/game/variables/{var_id:path}")
async def delete_variable(var_id: str):
    """Delete a derived variable (in memory)."""
    var_id = _ensure_ns(var_id)
    vd = _h.game_state.variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "variable", "id": var_id})
    del _h.game_state.variable_defs[var_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "variable"})


@router.post("/api/game/variables/{var_id:path}/evaluate")
async def evaluate_variable_endpoint(var_id: str, body: dict = Body(...)):
    """Evaluate a derived variable against a character's state.

    Body: {"characterId": "addon.charId"}
    Returns: {"result": float, "steps": [...debug trace...]}
    """
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


# ---------------------------------------------------------------------------
# Variable Tag pool
# ---------------------------------------------------------------------------


@router.get("/api/game/variable-tags")
async def get_variable_tags():
    """Get variable tag pool."""
    return {"tags": _h.game_state.variable_tags}


@router.post("/api/game/variable-tags")
async def create_variable_tag(body: dict = Body(...)):
    """Add a tag to the variable tag pool."""
    tag = body.get("tag", "").strip()
    if not tag:
        return _resp(False, "TAG_EMPTY")
    if tag in _h.game_state.variable_tags:
        return _resp(False, "TAG_ALREADY_EXISTS", {"tag": tag})
    _h.game_state.variable_tags.append(tag)
    await _mark_dirty()
    return _resp(True, "TAG_ADDED", {"tag": tag})


@router.delete("/api/game/variable-tags/{tag}")
async def delete_variable_tag(tag: str):
    """Remove a tag from the variable tag pool."""
    if tag not in _h.game_state.variable_tags:
        return _resp(False, "TAG_NOT_FOUND", {"tag": tag})
    _h.game_state.variable_tags.remove(tag)
    await _mark_dirty()
    return _resp(True, "TAG_DELETED", {"tag": tag})


# ---------------------------------------------------------------------------
# Event Definition CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/events")
async def get_events():
    """Get all global event definitions."""
    return {"events": list(_h.game_state.event_defs.values())}


@router.post("/api/game/events")
async def create_event(body: dict = Body(...)):
    """Create a new global event (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    event_id = _ensure_ns(raw_id, source)
    if not event_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "event"})
    if event_id in _h.game_state.event_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "event", "id": event_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = event_id
    entry["_local_id"] = to_local_id(event_id)
    entry["source"] = source
    _h.game_state.event_defs[event_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "event"})


@router.put("/api/game/events/{event_id:path}")
async def update_event(event_id: str, body: dict = Body(...)):
    """Update a global event (in memory)."""
    event_id = _ensure_ns(event_id)
    ed = _h.game_state.event_defs.get(event_id)
    if not ed:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "event", "id": event_id})
    source = ed.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = event_id
    entry["_local_id"] = to_local_id(event_id)
    entry["source"] = source
    _h.game_state.event_defs[event_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "event"})


@router.delete("/api/game/events/{event_id:path}")
async def delete_event(event_id: str):
    """Delete a global event (in memory)."""
    event_id = _ensure_ns(event_id)
    ed = _h.game_state.event_defs.get(event_id)
    if not ed:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "event", "id": event_id})
    del _h.game_state.event_defs[event_id]
    # Clean up event state
    _h.game_state.event_state.pop(event_id, None)
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "event"})


# ---------------------------------------------------------------------------
# Lorebook CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/lorebook")
async def get_lorebook():
    """Get all lorebook entries."""
    return {"entries": list(_h.game_state.lorebook_defs.values())}


@router.post("/api/game/lorebook")
async def create_lorebook_entry(body: dict = Body(...)):
    """Create a new lorebook entry (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    entry_id = _ensure_ns(raw_id, source)
    if not entry_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "lorebook"})
    if entry_id in _h.game_state.lorebook_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "lorebook", "id": entry_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = entry_id
    entry["_local_id"] = to_local_id(entry_id)
    entry["source"] = source
    _h.game_state.lorebook_defs[entry_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "lorebook"})


@router.put("/api/game/lorebook/{entry_id:path}")
async def update_lorebook_entry(entry_id: str, body: dict = Body(...)):
    """Update a lorebook entry (in memory)."""
    entry_id = _ensure_ns(entry_id)
    ed = _h.game_state.lorebook_defs.get(entry_id)
    if not ed:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "lorebook", "id": entry_id})
    source = ed.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = entry_id
    entry["_local_id"] = to_local_id(entry_id)
    entry["source"] = source
    _h.game_state.lorebook_defs[entry_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "lorebook"})


@router.delete("/api/game/lorebook/{entry_id:path}")
async def delete_lorebook_entry(entry_id: str):
    """Delete a lorebook entry (in memory)."""
    entry_id = _ensure_ns(entry_id)
    if entry_id not in _h.game_state.lorebook_defs:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "lorebook", "id": entry_id})
    del _h.game_state.lorebook_defs[entry_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "lorebook"})


# ---------------------------------------------------------------------------
# World Variable Definition CRUD
# ---------------------------------------------------------------------------


@router.get("/api/game/world-variables")
async def get_world_variables():
    """Get all world variable definitions."""
    return {"worldVariables": list(_h.game_state.world_variable_defs.values())}


@router.post("/api/game/world-variables")
async def create_world_variable(body: dict = Body(...)):
    """Create a new world variable (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    var_id = _ensure_ns(raw_id, source)
    if not var_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "worldVariable"})
    if var_id in _h.game_state.world_variable_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "worldVariable", "id": var_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = var_id
    entry["_local_id"] = to_local_id(var_id)
    entry["source"] = source
    _h.game_state.world_variable_defs[var_id] = entry
    # Initialize runtime value
    _h.game_state.world_variables[var_id] = entry.get("default", 0)
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "worldVariable"})


@router.put("/api/game/world-variables/{var_id:path}")
async def update_world_variable(var_id: str, body: dict = Body(...)):
    """Update a world variable definition (in memory)."""
    var_id = _ensure_ns(var_id)
    vd = _h.game_state.world_variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "worldVariable", "id": var_id})
    source = vd.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = var_id
    entry["_local_id"] = to_local_id(var_id)
    entry["source"] = source
    _h.game_state.world_variable_defs[var_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "worldVariable"})


@router.delete("/api/game/world-variables/{var_id:path}")
async def delete_world_variable(var_id: str):
    """Delete a world variable definition (in memory)."""
    var_id = _ensure_ns(var_id)
    vd = _h.game_state.world_variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "worldVariable", "id": var_id})
    del _h.game_state.world_variable_defs[var_id]
    _h.game_state.world_variables.pop(var_id, None)
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "worldVariable"})
