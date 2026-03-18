"""Entity definition loading and saving: traits, items, clothing, actions, variables, events, characters."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from .namespace import (
    _strip_action_refs,
    _strip_internal_fields,
    _strip_ref,
    namespace_id,
    strip_character_namespaces,
    to_local_id,
)

# Type alias for addon directories list: [(addon_id, addon_path), ...]
AddonDirs = list[tuple[str, Path]]

SLOT_LABELS = {
    "hat": "帽子",
    "upperBody": "上半身",
    "upperUnderwear": "上半身内衣",
    "lowerBody": "下半身",
    "lowerUnderwear": "下半身内衣",
    "hands": "手",
    "feet": "脚",
    "shoes": "鞋子",
    "mainHand": "主手",
    "offHand": "副手",
    "back": "背部",
    "accessory1": "装饰品1",
    "accessory2": "装饰品2",
    "accessory3": "装饰品3",
}


def load_template(data_dir_or_path: Path | None = None) -> dict:
    """Load character attribute template.

    If data_dir_or_path points to a directory, looks for character_template.json inside.
    If it points to a file, loads that file directly.
    If None, loads from the global template path.
    """
    if data_dir_or_path is None:
        from ..addon_loader import TEMPLATE_PATH

        path = TEMPLATE_PATH
    elif data_dir_or_path.is_file():
        path = data_dir_or_path
    else:
        path = data_dir_or_path / "character_template.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_json_safe(path: Path) -> dict:
    """Load a JSON file, returning empty dict if not found."""
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _to_addon_dirs(data_dir_or_addons: Path | AddonDirs) -> AddonDirs:
    """Convert legacy data_dir to addon_dirs format, or pass through."""
    if isinstance(data_dir_or_addons, Path):
        # Legacy: single data_dir — treat as a single addon with id from directory name
        return [(data_dir_or_addons.name, data_dir_or_addons)]
    return data_dir_or_addons


def load_trait_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load trait definitions from addon directories (or legacy data_dir), merged by id.

    Keys and 'id' fields are namespaced as 'addon_id.local_id'.
    """
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "traits.json")
        for t in data.get("traits", []):
            ns_id = namespace_id(addon_id, t["id"])
            result[ns_id] = {**t, "id": ns_id, "_local_id": t["id"], "source": addon_id}
    return result


def load_item_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load item definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "items.json")
        for item in data.get("items", []):
            ns_id = namespace_id(addon_id, item["id"])
            result[ns_id] = {**item, "id": ns_id, "_local_id": item["id"], "source": addon_id}
    return result


def load_item_tags(data_dir_or_addons: Path | AddonDirs) -> list[str]:
    """Load item tag pool from all addon directories (union)."""
    tags: list[str] = []
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for _, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "items.json")
        for tag in data.get("tags", []):
            if tag not in tags:
                tags.append(tag)
    return tags


def load_action_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load action definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "actions.json")
        for a in data.get("actions", []):
            ns_id = namespace_id(addon_id, a["id"])
            result[ns_id] = {**a, "id": ns_id, "_local_id": a["id"], "source": addon_id}
    return result


def load_variable_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load derived variable definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "variables.json")
        for v in data.get("variables", []):
            ns_id = namespace_id(addon_id, v["id"])
            result[ns_id] = {**v, "id": ns_id, "_local_id": v["id"], "source": addon_id}
    return result


def load_variable_tags(data_dir_or_addons: Path | AddonDirs) -> list[str]:
    """Load variable tag pool from all addon directories (union)."""
    tags: list[str] = []
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for _, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "variables.json")
        for tag in data.get("tags", []):
            if tag not in tags:
                tags.append(tag)
    return tags


def load_event_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load global event definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "events.json")
        for e in data.get("events", []):
            ns_id = namespace_id(addon_id, e["id"])
            result[ns_id] = {**e, "id": ns_id, "_local_id": e["id"], "source": addon_id}
    return result


def load_world_variable_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load world variable definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "events.json")
        for v in data.get("worldVariables", []):
            ns_id = namespace_id(addon_id, v["id"])
            result[ns_id] = {**v, "id": ns_id, "_local_id": v["id"], "source": addon_id}
    return result


def load_lorebook_entries(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load lorebook entries from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "lorebook.json")
        for entry in data if isinstance(data, list) else data.get("entries", []):
            ns_id = namespace_id(addon_id, entry["id"])
            result[ns_id] = {**entry, "id": ns_id, "_local_id": entry["id"], "source": addon_id}
    return result


def load_clothing_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load clothing definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "clothing.json")
        for c in data.get("clothing", []):
            ns_id = namespace_id(addon_id, c["id"])
            entry = {**c, "id": ns_id, "_local_id": c["id"], "source": addon_id}
            # Compat: "slot" (string) → "slots" (list)
            if "slots" not in entry:
                entry["slots"] = [entry.pop("slot")] if "slot" in entry else []
            elif "slot" in entry:
                del entry["slot"]
            result[ns_id] = entry
    return result


def load_outfit_types(data_dir_or_addons: Path | AddonDirs) -> list[dict]:
    """Load outfit types from all addon clothing.json files, merged by id."""
    by_id: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for _addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "clothing.json")
        for t in data.get("outfitTypes", []):
            if isinstance(t, str):
                # Legacy: plain string → convert to object
                if t != "default" and t != "默认服装" and t not in by_id:
                    by_id[t] = {"id": t, "name": t, "copyDefault": True, "slots": {}}
            elif isinstance(t, dict) and t.get("id"):
                oid = t["id"]
                if oid != "default":
                    by_id[oid] = t
    return list(by_id.values())


def load_characters(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load all character JSON files from addon directories.

    Character IDs are namespaced as 'addon_id.local_id'.
    Cross-references (traits, items, etc.) are NOT resolved here —
    call namespace_character_data() after all defs are loaded.
    """
    characters: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        chars_dir = addon_path / "characters"
        if not chars_dir.exists():
            continue
        for f in chars_dir.glob("*.json"):
            with open(f, "r", encoding="utf-8") as fh:
                char = json.load(fh)
            local_id = char["id"]
            ns_id = namespace_id(addon_id, local_id)
            char["id"] = ns_id
            char["_local_id"] = local_id
            char["_source"] = addon_id
            characters[ns_id] = char
    return characters


def load_trait_groups(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load trait group definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "traits.json")
        for g in data.get("traitGroups", []):
            ns_id = namespace_id(addon_id, g["id"])
            # Also namespace trait references within the group
            ns_traits = [namespace_id(addon_id, tid) for tid in g.get("traits", [])]
            exclusive = g.get("exclusive", True)
            result[ns_id] = {
                **g,
                "id": ns_id,
                "_local_id": g["id"],
                "source": addon_id,
                "traits": ns_traits,
                "exclusive": exclusive,
            }
    return result


# ---------------------------------------------------------------------------
# Save functions
# ---------------------------------------------------------------------------


def save_item_defs_file(data_dir: Path, items_list: list[dict]) -> None:
    """Write game-specific items.json (strips internal fields), preserving tags."""
    clean = []
    for item in items_list:
        entry = _strip_internal_fields(item)
        entry["id"] = to_local_id(entry["id"])
        clean.append(entry)
    path = data_dir / "items.json"
    existing = _load_json_safe(path)
    existing["items"] = clean
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def save_item_tags_file(data_dir: Path, tags: list[str]) -> None:
    """Write item tag pool to game-specific items.json, preserving items."""
    path = data_dir / "items.json"
    existing = _load_json_safe(path)
    existing["tags"] = tags
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def save_variable_defs_file(data_dir: Path, variables_list: list[dict]) -> None:
    """Write variables.json (strips internal fields), preserving tags."""
    clean = []
    for v in variables_list:
        entry = _strip_internal_fields(v)
        entry["id"] = to_local_id(entry["id"])
        clean.append(entry)
    path = data_dir / "variables.json"
    existing = _load_json_safe(path)
    existing["variables"] = clean
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def save_variable_tags_file(data_dir: Path, tags: list[str]) -> None:
    """Write variable tag pool to variables.json, preserving variables."""
    path = data_dir / "variables.json"
    existing = _load_json_safe(path)
    existing["tags"] = tags
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def save_event_defs_file(data_dir: Path, events_list: list[dict]) -> None:
    """Write events to events.json (strips internal fields), preserving worldVariables."""
    clean = []
    for e in events_list:
        entry = _strip_internal_fields(e)
        entry["id"] = to_local_id(entry["id"])
        clean.append(entry)
    path = data_dir / "events.json"
    existing = _load_json_safe(path)
    existing["events"] = clean
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def save_lorebook_file(data_dir: Path, entries_list: list[dict]) -> None:
    """Write lorebook entries to lorebook.json (strips internal fields)."""
    clean = []
    for e in entries_list:
        entry = _strip_internal_fields(e)
        entry["id"] = to_local_id(entry["id"])
        clean.append(entry)
    path = data_dir / "lorebook.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)


def save_world_variable_defs_file(data_dir: Path, variables_list: list[dict]) -> None:
    """Write world variables to events.json (strips internal fields), preserving events."""
    clean = []
    for v in variables_list:
        entry = _strip_internal_fields(v)
        entry["id"] = to_local_id(entry["id"])
        clean.append(entry)
    path = data_dir / "events.json"
    existing = _load_json_safe(path)
    existing["worldVariables"] = clean
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def save_action_defs_file(data_dir: Path, actions_list: list[dict], addon_id: str = "") -> None:
    """Write game-specific actions.json (strips internal fields + de-namespaces refs)."""
    clean = []
    for a in actions_list:
        entry = _strip_internal_fields(a)
        entry["id"] = to_local_id(entry["id"])
        _strip_action_refs(entry, addon_id)
        clean.append(entry)
    path = data_dir / "actions.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"actions": clean}, f, ensure_ascii=False, indent=2)


def save_clothing_defs_file(
    data_dir: Path, clothing_list: list[dict], outfit_types: Optional[list[dict]] = None
) -> None:
    """Write game-specific clothing.json (strips internal fields)."""
    clean = []
    for c in clothing_list:
        entry = _strip_internal_fields(c)
        entry["id"] = to_local_id(entry["id"])
        clean.append(entry)
    out: dict[str, Any] = {}
    if outfit_types:
        out["outfitTypes"] = outfit_types
    out["clothing"] = clean
    path = data_dir / "clothing.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


def save_character(data_dir: Path, char_data: dict, addon_id: str = "") -> None:
    """Save a character JSON file to data/characters/.

    Strips namespace from character ID and cross-references for file storage.
    Same-addon refs → bare ID; cross-addon refs → keep namespace.
    """
    chars_dir = data_dir / "characters"
    chars_dir.mkdir(parents=True, exist_ok=True)
    local_id = char_data.get("_local_id", to_local_id(char_data["id"]))
    path = chars_dir / f"{local_id}.json"
    clean = {k: v for k, v in char_data.items() if not k.startswith("_")}
    clean["id"] = local_id
    clean = strip_character_namespaces(clean, addon_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)


def delete_character(data_dir: Path, char_id: str) -> bool:
    """Delete a character JSON file. Returns True if file existed."""
    local_id = to_local_id(char_id)
    path = data_dir / "characters" / f"{local_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False


def save_trait_defs_file(data_dir: Path, traits_list: list[dict]) -> None:
    """Write game-specific traits.json (strips internal fields), preserving traitGroups."""
    clean = []
    for t in traits_list:
        entry = _strip_internal_fields(t)
        entry["id"] = to_local_id(entry["id"])
        clean.append(entry)
    path = data_dir / "traits.json"
    existing = _load_json_safe(path)
    existing["traits"] = clean
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def save_trait_groups_file(data_dir: Path, groups_list: list[dict], addon_id: str = "") -> None:
    """Write game-specific traitGroups in traits.json (strips internal fields), preserving traits."""
    clean = []
    for g in groups_list:
        entry = _strip_internal_fields(g)
        entry["id"] = to_local_id(entry["id"])
        # Strip namespace from trait references, keeping cross-addon refs
        entry["traits"] = [_strip_ref(tid, addon_id) for tid in entry.get("traits", [])]
        clean.append(entry)
    path = data_dir / "traits.json"
    existing = _load_json_safe(path)
    existing["traitGroups"] = clean
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
