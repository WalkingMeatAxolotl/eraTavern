"""Character-specific entity handler — validate, create, update.

Handles character init hooks, cross-reference namespacing, and
character-specific validation (trait categories, clothing slots, map refs).
"""

from __future__ import annotations

from typing import Any, Optional

from game.state import GameState

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def char_validate(gs: GameState, data: dict) -> Optional[str]:
    """Validate character-specific cross-entity references."""
    template = getattr(gs, "template", {})

    traits = data.get("traits")
    if isinstance(traits, dict):
        valid_cats = {c["key"] for c in template.get("traits", [])}
        if valid_cats:
            invalid = [k for k in traits if k not in valid_cats]
            if invalid:
                hint = ", ".join(sorted(valid_cats))
                return f"traits contains invalid categories: {invalid}. Valid: {hint}"

    clothing = data.get("clothing")
    if isinstance(clothing, dict):
        valid_slots = set(template.get("clothingSlots", []))
        if valid_slots:
            invalid = [k for k in clothing if k not in valid_slots]
            if invalid:
                hint = ", ".join(sorted(valid_slots))
                return f"clothing contains invalid slots: {invalid}. Valid: {hint}"

    for field in ("position", "restPosition"):
        pos = data.get(field)
        if isinstance(pos, dict) and pos.get("mapId"):
            map_id = pos["mapId"]
            if gs.maps and map_id not in gs.maps:
                valid_maps = ", ".join(list(gs.maps.keys())[:10])
                return f"{field}.mapId '{map_id}' not found. Available: {valid_maps}"

    return None


# ---------------------------------------------------------------------------
# Init & namespace helpers
# ---------------------------------------------------------------------------


def _init_character_entry(gs: GameState, entry: dict) -> None:
    """Initialize a new character entry with template defaults."""
    template = getattr(gs, "template", {})
    source = entry.get("source", "")

    bi = entry.get("basicInfo", {})
    if "name" not in bi:
        bi["name"] = entry.get("name", "")
    for field in template.get("basicInfo", []):
        key = field.get("key", "")
        if key and key not in bi:
            bi[key] = field.get("defaultValue", "" if field.get("type") == "string" else 0)
    entry["basicInfo"] = bi

    if "resources" not in entry:
        resources = {}
        for field in template.get("resources", []):
            key = field.get("key", "")
            if key:
                resources[key] = {
                    "value": field.get("defaultValue", 0),
                    "max": field.get("defaultMax", 0),
                }
        entry["resources"] = resources

    entry["_source"] = source


def _namespace_character_refs(gs: GameState, entry: dict) -> None:
    """Namespace cross-references in character data (traits, clothing, inventory, etc.)."""
    from game.character.namespace import namespace_character_data

    namespace_character_data(
        entry,
        gs.trait_defs,
        gs.item_defs,
        gs.clothing_defs,
        gs.character_data,
        gs.maps,
    )


# ---------------------------------------------------------------------------
# Create / Update
# ---------------------------------------------------------------------------


def char_create(gs: GameState, entity_type: str, entity_data: dict, *, target_addon: str = "") -> dict[str, Any]:
    """Create a character entity with init hooks and reference namespacing."""
    from game.ai_assist import _ENTITY_TYPE_ATTR, ENTITY_SCHEMAS, _get_defs, _summarize_entity
    from game.ai_assist_handlers.default import (
        ENTITY_DEFAULTS,
        _resolve_source_addon,
        _validate_field_values,
        normalize_entity_id,
    )
    from game.character.namespace import namespace_id

    schema = ENTITY_SCHEMAS.get(entity_type)
    if not schema:
        return {"success": False, "error": f"Unknown entity type: {entity_type}"}

    for field in schema["required"]:
        if not entity_data.get(field):
            return {"success": False, "error": f"Missing required field: {field}"}

    val_error = _validate_field_values(gs, entity_type, entity_data)
    if val_error:
        return {"success": False, "error": val_error}

    raw_id = entity_data.get("id", "")
    normalized = normalize_entity_id(raw_id)
    if not normalized:
        return {"success": False, "error": "ID is empty or contains only invalid characters"}
    entity_data = {**entity_data, "id": normalized}

    source = _resolve_source_addon(gs, target_addon)
    if not source:
        return {"success": False, "error": "No addon available for creating entities"}

    eid = namespace_id(source, normalized)
    defs = _get_defs(gs, entity_type)
    if eid in defs:
        return {"success": False, "error": f"Entity '{normalized}' already exists"}

    attr = _ENTITY_TYPE_ATTR.get(entity_type)
    if not attr:
        return {"success": False, "error": f"Unknown entity type: {entity_type}"}

    defaults = ENTITY_DEFAULTS.get(entity_type, {})
    entry = {**defaults, **entity_data, "id": eid, "_local_id": normalized, "source": source}

    _namespace_character_refs(gs, entry)
    _init_character_entry(gs, entry)

    gs.staging.put(attr, eid, entry)
    gs.dirty = True
    result: dict[str, Any] = {"success": True, "entity": _summarize_entity(entity_type, entry)}
    if normalized != raw_id:
        result["normalizedId"] = normalized
    return result


def char_update(gs: GameState, entity_type: str, entity_id: str, fields: dict) -> dict[str, Any]:
    """Update a character entity — handles basicInfo.name sync."""
    from game.ai_assist import _ENTITY_TYPE_ATTR, _get_defs, _summarize_entity
    from game.ai_assist_handlers.default import _validate_field_values

    defs = _get_defs(gs, entity_type)
    if entity_id not in defs:
        return {"success": False, "error": f"Entity '{entity_id}' not found"}

    attr = _ENTITY_TYPE_ATTR.get(entity_type)
    if not attr:
        return {"success": False, "error": f"Unknown entity type: {entity_type}"}

    fields.pop("id", None)
    fields.pop("_local_id", None)
    fields.pop("source", None)

    val_error = _validate_field_values(gs, entity_type, fields)
    if val_error:
        return {"success": False, "error": val_error}

    updated = {**defs[entity_id]}
    if "name" in fields:
        bi = {**updated.get("basicInfo", {})}
        bi["name"] = fields["name"]
        updated["basicInfo"] = bi
    updated.update(fields)

    gs.staging.put(attr, entity_id, updated)
    gs.dirty = True
    return {"success": True, "entity": _summarize_entity(entity_type, updated)}
