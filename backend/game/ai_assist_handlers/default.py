"""Default entity handlers — create, update, validate for all entity types.

Handles type-specific logic (outfitType list storage, character init hooks,
worldVariable post-create) within the unified create/update flow.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from game.character.namespace import namespace_id
from game.state import GameState


def normalize_entity_id(raw: str) -> str:
    """Normalize an entity ID: lowercase, replace illegal chars, strip edge underscores."""
    s = raw.strip().lower()
    s = re.sub(r"[^a-z0-9_]", "_", s)
    s = re.sub(r"_+", "_", s)
    s = s.strip("_")
    return s


# ---------------------------------------------------------------------------
# Entity defaults — ensures editors don't crash on missing fields
# ---------------------------------------------------------------------------

ENTITY_DEFAULTS: dict[str, dict[str, Any]] = {
    "item": {"tags": [], "description": "", "maxStack": 1, "sellable": False, "price": 0},
    "trait": {"description": "", "effects": [], "decay": None},
    "clothing": {"occlusion": [], "effects": []},
    "traitGroup": {"traits": [], "exclusive": False},
    "outfitType": {"description": "", "copyDefault": True, "slots": {}},
    "lorebook": {
        "keywords": [],
        "content": "",
        "enabled": True,
        "priority": 0,
        "insertMode": "keyword",
    },
    "worldVariable": {"description": "", "type": "number", "default": 0},
    "character": {
        "active": True,
        "isPlayer": False,
        "traits": {},
        "clothing": {},
        "inventory": [],
        "abilities": {},
        "outfits": {},
        "favorability": {},
        "llm": {},
    },
}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

# Reference validation rules — data-driven, not hardcoded per entity type.
# Each rule: (entity_type, field_path, resolver)
_REF_RULES: list[tuple[str, str, Any]] = [
    ("trait", "category", "template.traits[].key"),
    ("clothing", "slots[]", "template.clothingSlots"),
    ("clothing", "occlusion[]", "template.clothingSlots"),
    ("trait", "effects[].target", "effect_targets"),
    ("clothing", "effects[].target", "effect_targets"),
    ("traitGroup", "category", "template.traits[].key"),
    ("traitGroup", "traits[]", "trait_defs"),
    ("lorebook", "insertMode", "static:keyword,always"),
    ("worldVariable", "type", "static:number,boolean"),
    ("character", "clothing.*.state", "static:worn,half_worn,off"),
]


def _resolve_valid_values(gs: GameState, resolver: str) -> set[str]:
    """Resolve a set of valid values from game state using a resolver string."""
    if resolver.startswith("static:"):
        return set(resolver[7:].split(","))

    template = getattr(gs, "template", {})

    if resolver == "variable_defs":
        return set(gs.variable_defs.keys()) if gs.variable_defs else set()
    if resolver == "trait_defs":
        return set(gs.trait_defs.keys()) if gs.trait_defs else set()
    if resolver == "effect_targets":
        targets: set[str] = set()
        if gs.variable_defs:
            targets.update(gs.variable_defs.keys())
        if gs.trait_defs:
            targets.update(tid for tid, t in gs.trait_defs.items() if t.get("category") == "ability")
        for field in template.get("resources", []):
            if field.get("key"):
                targets.add(field["key"])
        for field in template.get("basicInfo", []):
            if field.get("type") == "number" and field.get("key"):
                targets.add(field["key"])
        return targets
    if resolver == "template.clothingSlots":
        return set(template.get("clothingSlots", []))
    if resolver == "template.traits[].key":
        return {c["key"] for c in template.get("traits", [])}
    return set()


def _validate_field_values(gs: GameState, entity_type: str, data: dict) -> Optional[str]:
    """Validate field values against game state using reference rules."""
    for rule_type, field_path, resolver in _REF_RULES:
        if rule_type != entity_type:
            continue

        valid = _resolve_valid_values(gs, resolver)
        if not valid:
            continue

        # Parse field path: "field", "field[]", "field[].subfield", "field.*.subfield"
        if ".*." in field_path:
            top_field, sub_field = field_path.split(".*.", 1)
        else:
            parts = field_path.split("[]")
            top_field = parts[0]
            sub_field = parts[1].lstrip(".") if len(parts) > 1 else ""

        value = data.get(top_field)
        if value is None:
            continue

        if sub_field:
            # "field.*.subfield" — dict of objects
            if ".*." in field_path and isinstance(value, dict):
                for key, item in value.items():
                    if isinstance(item, dict):
                        v = item.get(sub_field, "")
                        if v and v not in valid:
                            hint = ", ".join(sorted(valid))
                            return f"{top_field}.{key}.{sub_field} '{v}' is invalid. Valid: {hint}"
            # "field[].subfield" — array of objects
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    if isinstance(item, dict):
                        v = item.get(sub_field, "")
                        if v and v not in valid:
                            hint = ", ".join(list(valid)[:10])
                            return f"{top_field}[{i}].{sub_field} '{v}' is invalid. Valid: {hint}"
        elif isinstance(value, list):
            invalid = [v for v in value if v not in valid]
            if invalid:
                hint = ", ".join(list(valid)[:10])
                return f"{top_field} contains invalid values: {invalid}. Valid: {hint}"
        elif isinstance(value, str):
            if value not in valid:
                hint = ", ".join(sorted(valid))
                return f"{top_field} '{value}' is invalid. Valid: {hint}"

    # Character-specific validation
    if entity_type == "character":
        err = _validate_character_refs(gs, data)
        if err:
            return err

    return None


def _validate_character_refs(gs: GameState, data: dict) -> Optional[str]:
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
# Character init
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


# ---------------------------------------------------------------------------
# Source addon resolution
# ---------------------------------------------------------------------------


def _resolve_source_addon(gs: GameState) -> str:
    """Determine which addon to create entities in."""
    if gs.addon_refs:
        first = gs.addon_refs[0]
        addon_id = first.get("id", "")
        if addon_id:
            return addon_id
    return ""


# ---------------------------------------------------------------------------
# Create / Update
# ---------------------------------------------------------------------------


def execute_tool_create_entity(gs: GameState, entity_type: str, entity_data: dict) -> dict[str, Any]:
    """Validate and create a single entity."""
    from game.ai_assist import ENTITY_SCHEMAS, _get_defs, _summarize_entity

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
    # Update entity_data with normalized ID
    entity_data = {**entity_data, "id": normalized}

    source = _resolve_source_addon(gs)
    if not source:
        return {"success": False, "error": "No addon available for creating entities"}

    # outfitType: stored as list, no namespacing
    if entity_type == "outfitType":
        if any(t.get("id") == normalized for t in gs.outfit_types if isinstance(t, dict)):
            return {"success": False, "error": f"Entity '{normalized}' already exists"}
        defaults = ENTITY_DEFAULTS.get(entity_type, {})
        entry = {**defaults, **entity_data}
        gs.outfit_types.append(entry)
        gs.dirty = True
        return {"success": True, "entity": _summarize_entity(entity_type, entry)}

    eid = namespace_id(source, normalized)
    defs = _get_defs(gs, entity_type)
    if eid in defs:
        return {"success": False, "error": f"Entity '{normalized}' already exists"}

    defaults = ENTITY_DEFAULTS.get(entity_type, {})
    entry = {**defaults, **entity_data, "id": eid, "_local_id": normalized, "source": source}
    defs[eid] = entry

    # Post-create hooks
    if entity_type == "worldVariable":
        gs.world_variables[eid] = entry.get("default", 0)
    elif entity_type == "character":
        _init_character_entry(gs, entry)
        if entry.get("active", True) is not False:
            gs.characters[eid] = gs._build_char(eid)

    gs.dirty = True
    result: dict[str, Any] = {"success": True, "entity": _summarize_entity(entity_type, entry)}
    if normalized != raw_id:
        result["normalizedId"] = normalized
    return result


def execute_tool_batch_create(gs: GameState, entity_type: str, entities_data: list[dict]) -> dict[str, Any]:
    """Create multiple entities at once."""
    created = []
    errors = []
    for i, entity_data in enumerate(entities_data):
        result = execute_tool_create_entity(gs, entity_type, entity_data)
        if result.get("success"):
            created.append(result["entity"])
        else:
            label = entity_data.get("id", f"#{i}")
            errors.append(f"{label}: {result.get('error', 'unknown')}")
    return {"created": created, "errors": errors, "total": len(created)}


def execute_tool_update_entity(gs: GameState, entity_type: str, entity_id: str, fields: dict) -> dict[str, Any]:
    """Validate and update fields on an existing entity."""
    from game.ai_assist import _get_defs, _summarize_entity

    # outfitType: find in list by id
    if entity_type == "outfitType":
        fields.pop("id", None)
        val_error = _validate_field_values(gs, entity_type, fields)
        if val_error:
            return {"success": False, "error": val_error}
        for t in gs.outfit_types:
            if isinstance(t, dict) and t.get("id") == entity_id:
                t.update(fields)
                gs.dirty = True
                return {"success": True, "entity": _summarize_entity(entity_type, t)}
        return {"success": False, "error": f"Entity '{entity_id}' not found"}

    defs = _get_defs(gs, entity_type)
    if entity_id not in defs:
        return {"success": False, "error": f"Entity '{entity_id}' not found"}

    fields.pop("id", None)
    fields.pop("_local_id", None)
    fields.pop("source", None)

    val_error = _validate_field_values(gs, entity_type, fields)
    if val_error:
        return {"success": False, "error": val_error}

    existing = defs[entity_id]
    if entity_type == "character" and "name" in fields:
        bi = existing.get("basicInfo", {})
        bi["name"] = fields["name"]
        existing["basicInfo"] = bi
    existing.update(fields)

    # Post-update hooks
    if entity_type == "character":
        if existing.get("active", True) is not False:
            gs.characters[entity_id] = gs._build_char(entity_id)
        elif entity_id in gs.characters:
            del gs.characters[entity_id]

    gs.dirty = True
    return {"success": True, "entity": _summarize_entity(entity_type, existing)}


def execute_tool_batch_update(gs: GameState, entity_type: str, updates: list[dict]) -> dict[str, Any]:
    """Update multiple entities at once."""
    updated = []
    errors = []
    for i, item in enumerate(updates):
        entity_id = item.get("entityId", "")
        fields = item.get("fields", {})
        result = execute_tool_update_entity(gs, entity_type, entity_id, fields)
        if result.get("success"):
            updated.append(result["entity"])
        else:
            label = entity_id or f"#{i}"
            errors.append(f"{label}: {result.get('error', 'unknown')}")
    return {"updated": updated, "errors": errors, "total": len(updated)}
