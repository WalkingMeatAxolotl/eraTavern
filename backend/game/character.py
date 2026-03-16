"""Character template/instance loading, ability grade calculation, clothing occlusion."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"]

BUILTIN_DIR = Path(__file__).parent.parent / "data" / "builtin"  # legacy, unused

# Type alias for addon directories list: [(addon_id, addon_path), ...]
AddonDirs = list[tuple[str, Path]]

# Symbolic references in action conditions/effects — must NOT be namespaced
SYMBOLIC_REFS = {"self", "{{targetId}}", "{{player}}", ""}


# ---------------------------------------------------------------------------
# ID namespace helpers
# ---------------------------------------------------------------------------

NS_SEP = "."  # namespace separator: addonId.localId


def validate_local_id(local_id: str) -> str | None:
    """Validate a local ID. Returns error message if invalid, None if OK."""
    if not local_id:
        return "ID 不能为空"
    if NS_SEP in local_id:
        return f"ID 不能包含 '{NS_SEP}'"
    return None


def namespace_id(addon_id: str, local_id: str) -> str:
    """Create a namespaced ID: 'addon_id.local_id'."""
    if NS_SEP in local_id:
        return local_id  # already namespaced
    return f"{addon_id}{NS_SEP}{local_id}"


def to_local_id(namespaced_id: str) -> str:
    """Extract local ID from 'addon_id.local_id'."""
    if NS_SEP in namespaced_id:
        return namespaced_id.split(NS_SEP, 1)[1]
    return namespaced_id


def get_addon_from_id(namespaced_id: str) -> str:
    """Extract addon ID from 'addon_id.local_id'. Returns '' if not namespaced."""
    if NS_SEP in namespaced_id:
        return namespaced_id.split(NS_SEP, 1)[0]
    return ""


def resolve_ref(ref_id: str, defs: dict, default_addon: str = "") -> str:
    """Resolve a bare or namespaced entity reference against loaded defs.

    - Already namespaced ('addon.id') → return as-is
    - Bare ID → try default_addon first, then search all defs
    """
    if not ref_id or NS_SEP in ref_id:
        return ref_id
    # Try default addon first
    if default_addon:
        candidate = f"{default_addon}{NS_SEP}{ref_id}"
        if candidate in defs:
            return candidate
    # Search all defs for matching local ID
    for key in defs:
        if key.split(NS_SEP, 1)[1] == ref_id:
            return key
    # Not found — use default addon prefix (will fail on lookup, which is OK)
    return f"{default_addon}{NS_SEP}{ref_id}" if default_addon else ref_id


def _strip_internal_fields(entry: dict) -> dict:
    """Remove internal fields (_local_id, source) for file storage."""
    return {k: v for k, v in entry.items() if k not in ("source", "_local_id")}


def _strip_ref(ref: str, addon_id: str) -> str:
    """Strip namespace from a reference, keeping cross-addon prefixes.

    Same-addon refs → bare ID; cross-addon refs → keep namespace.
    """
    if not ref or ref in SYMBOLIC_REFS or NS_SEP not in ref:
        return ref
    prefix, local = ref.split(NS_SEP, 1)
    if not addon_id or prefix == addon_id:
        return local
    return ref

SLOT_LABELS = {
    "hat": "帽子",
    "upperBody": "上半身",
    "upperUnderwear": "上半身内衣",
    "lowerBody": "下半身",
    "lowerUnderwear": "下半身内衣",
    "hands": "手",
    "feet": "脚",
    "shoes": "鞋子",
    "accessory1": "装饰品1",
    "accessory2": "装饰品2",
    "accessory3": "装饰品3",
}


def exp_to_grade(exp: int) -> str:
    """Convert experience points to letter grade."""
    level = min(exp // 1000, len(GRADES) - 1)
    return GRADES[max(0, level)]


def load_template(data_dir_or_path: Path | None = None) -> dict:
    """Load character attribute template.

    If data_dir_or_path points to a directory, looks for character_template.json inside.
    If it points to a file, loads that file directly.
    If None, loads from the global template path.
    """
    if data_dir_or_path is None:
        from .addon_loader import TEMPLATE_PATH
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


def load_clothing_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load clothing definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "clothing.json")
        for c in data.get("clothing", []):
            ns_id = namespace_id(addon_id, c["id"])
            result[ns_id] = {**c, "id": ns_id, "_local_id": c["id"], "source": addon_id}
    return result


def save_clothing_defs_file(data_dir: Path, clothing_list: list[dict]) -> None:
    """Write game-specific clothing.json (strips internal fields)."""
    clean = []
    for c in clothing_list:
        entry = _strip_internal_fields(c)
        entry["id"] = to_local_id(entry["id"])
        clean.append(entry)
    path = data_dir / "clothing.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"clothing": clean}, f, ensure_ascii=False, indent=2)


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


def _collect_effects(
    effects_list: list[dict],
    fixed_deltas: dict[str, float],
    pct_multipliers: dict[str, list[float]],
) -> None:
    """Collect effects into accumulators (shared by traits and clothing)."""
    for effect in effects_list:
        target = effect["target"]
        direction = effect["effect"]  # "increase" or "decrease"
        mag_type = effect["magnitudeType"]  # "fixed" or "percentage"
        value = effect["value"]

        if mag_type == "fixed":
            delta = value if direction == "increase" else -value
            fixed_deltas[target] = fixed_deltas.get(target, 0) + delta
        else:
            # percentage: 90 -> x0.9, 120 -> x1.2
            multiplier = value / 100
            if direction == "decrease":
                multiplier = 2.0 - multiplier  # 120 decrease -> x0.8
            pct_multipliers.setdefault(target, []).append(multiplier)


def _apply_all_effects(
    state: dict[str, Any],
    fixed_deltas: dict[str, float],
    pct_multipliers: dict[str, list[float]],
) -> None:
    """Apply collected effects to character state.

    Percentage model: additive stacking.
    Each multiplier is already a ratio (e.g. 1.2 for +20%, 0.8 for -20%).
    Sum all (m - 1.0) deltas, then final_multiplier = 1.0 + sum_of_deltas.
    Example: two +20% effects → 1.0 + 0.2 + 0.2 = 1.4 (not 1.2 * 1.2 = 1.44).
    """
    all_targets = set(fixed_deltas.keys()) | set(pct_multipliers.keys())
    for target in all_targets:
        fd = fixed_deltas.get(target, 0)
        mults = pct_multipliers.get(target, [])
        pct_sum = sum(m - 1.0 for m in mults)
        final_multiplier = 1.0 + pct_sum
        _apply_computed_effect(state, target, fd, final_multiplier)


def apply_trait_effects(
    state: dict[str, Any],
    char_data: dict,
    trait_defs: dict[str, dict],
) -> None:
    """Apply trait effects to character state in-place."""
    fixed_deltas: dict[str, float] = {}
    pct_multipliers: dict[str, list[float]] = {}

    for trait_cat in char_data.get("traits", {}).values():
        for trait_id in trait_cat:
            trait_def = trait_defs.get(trait_id)
            if not trait_def:
                continue
            _collect_effects(trait_def.get("effects", []), fixed_deltas, pct_multipliers)

    _apply_all_effects(state, fixed_deltas, pct_multipliers)


def apply_clothing_effects(
    state: dict[str, Any],
    char_data: dict,
    clothing_defs: dict[str, dict],
) -> None:
    """Apply clothing effects to character state in-place."""
    fixed_deltas: dict[str, float] = {}
    pct_multipliers: dict[str, list[float]] = {}

    for slot_data in char_data.get("clothing", {}).values():
        item_id = slot_data.get("itemId") if isinstance(slot_data, dict) else None
        if not item_id:
            continue
        wear_state = slot_data.get("state") if isinstance(slot_data, dict) else None
        if wear_state not in ("worn", "halfWorn"):
            continue  # "off" or missing state = no effect
        clothing_def = clothing_defs.get(item_id)
        if not clothing_def:
            continue
        _collect_effects(clothing_def.get("effects", []), fixed_deltas, pct_multipliers)

    _apply_all_effects(state, fixed_deltas, pct_multipliers)


def _apply_computed_effect(
    state: dict[str, Any], target: str, fixed_delta: float, multiplier: float
) -> None:
    """Apply computed (fixed_delta, multiplier) to a target field in state."""
    # Try resources.max
    if target in state.get("resources", {}):
        res = state["resources"][target]
        new_val = int((res["max"] + fixed_delta) * multiplier)
        res["max"] = max(0, new_val)
        res["value"] = min(res["value"], res["max"])
        return

    # Try abilities.exp
    for ab in state.get("abilities", []):
        if ab["key"] == target:
            new_val = int((ab["exp"] + fixed_delta) * multiplier)
            ab["exp"] = max(0, new_val)
            ab["grade"] = exp_to_grade(ab["exp"])
            return

    # Try basicInfo number fields
    if target in state.get("basicInfo", {}):
        info = state["basicInfo"][target]
        if info["type"] == "number":
            new_val = int((info["value"] + fixed_delta) * multiplier)
            info["value"] = new_val
            return


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
            result[ns_id] = {**g, "id": ns_id, "_local_id": g["id"], "source": addon_id,
                             "traits": ns_traits, "exclusive": exclusive}
    return result


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


def get_ability_defs(trait_defs: dict[str, dict]) -> list[dict]:
    """Extract ability-category traits as ability definitions, sorted by id."""
    abilities = []
    for td in trait_defs.values():
        if td.get("category") == "ability":
            abilities.append({
                "key": td["id"],
                "label": td["name"],
                "defaultValue": td.get("defaultValue", 0),
            })
    # Stable ordering by key
    abilities.sort(key=lambda a: a["key"])
    return abilities


def get_experience_defs(trait_defs: dict[str, dict]) -> list[dict]:
    """Extract experience-category traits as experience definitions, sorted by id."""
    exps = []
    for td in trait_defs.values():
        if td.get("category") == "experience":
            exps.append({
                "key": td["id"],
                "label": td["name"],
            })
    exps.sort(key=lambda e: e["key"])
    return exps


def apply_ability_decay(
    characters: dict[str, dict[str, Any]],
    trait_defs: dict[str, dict],
    minutes_elapsed: int,
    decay_accumulators: dict[str, dict[str, int]],
) -> None:
    """Apply ability decay using accumulation. Called per-tick.

    decay_accumulators: {char_id: {ability_key: accumulated_minutes}}
    Each tick adds minutes_elapsed to the accumulator. When it reaches
    intervalMinutes, decay triggers and the accumulator resets.
    """
    # Collect decay rules from ability-category traits
    decay_rules: list[tuple[str, dict]] = []
    for td in trait_defs.values():
        if td.get("category") != "ability":
            continue
        decay = td.get("decay")
        if not decay:
            continue
        interval = decay.get("intervalMinutes", 0)
        if interval <= 0:
            continue
        decay_rules.append((td["id"], decay))

    if not decay_rules:
        return

    for char_id, char_state in characters.items():
        acc = decay_accumulators.setdefault(char_id, {})
        for ability_key, decay in decay_rules:
            interval = decay["intervalMinutes"]
            acc[ability_key] = acc.get(ability_key, 0) + minutes_elapsed

            if acc[ability_key] < interval:
                continue

            # Trigger: how many intervals accumulated
            intervals = acc[ability_key] // interval
            acc[ability_key] = acc[ability_key] % interval

            amount = decay.get("amount", 0)
            decay_type = decay.get("type", "fixed")
            for ab in char_state.get("abilities", []):
                if ab["key"] != ability_key:
                    continue
                if decay_type == "percentage":
                    factor = (1.0 - amount / 100.0) ** intervals
                    ab["exp"] = max(0, int(ab["exp"] * factor))
                else:
                    ab["exp"] = max(0, ab["exp"] - int(amount * intervals))
                ab["grade"] = exp_to_grade(ab["exp"])
                break


def build_character_state(
    char_data: dict,
    template: dict,
    clothing_defs: dict[str, dict],
    trait_defs: dict[str, dict] | None = None,
    item_defs: dict[str, dict] | None = None,
) -> dict[str, Any]:
    """Build a full character state from instance data + template defaults."""
    state: dict[str, Any] = {
        "id": char_data["id"],
        "isPlayer": char_data.get("isPlayer", False),
    }

    # Basic info
    basic_info: dict[str, Any] = {}
    for field in template["basicInfo"]:
        key = field["key"]
        value = char_data.get("basicInfo", {}).get(key, field["defaultValue"])
        basic_info[key] = {
            "label": field["label"],
            "type": field["type"],
            "value": value,
        }
    state["basicInfo"] = basic_info

    # Resources
    resources: dict[str, Any] = {}
    for field in template["resources"]:
        key = field["key"]
        char_res = char_data.get("resources", {}).get(key, {})
        resources[key] = {
            "label": field["label"],
            "value": char_res.get("value", field["defaultValue"]),
            "max": char_res.get("max", field["defaultMax"]),
            "color": field["color"],
        }
    state["resources"] = resources

    # Clothing with occlusion
    clothing_state = build_clothing_state(
        char_data.get("clothing", {}), template["clothingSlots"], clothing_defs
    )
    state["clothing"] = clothing_state

    # Traits — resolve IDs to display names via trait_defs (skip ability category)
    traits: list[dict] = []
    for field in template["traits"]:
        key = field["key"]
        if key in ("ability", "experience"):
            continue  # abilities and experiences displayed separately
        ids = char_data.get("traits", {}).get(key, [])
        if trait_defs:
            values = [trait_defs[tid]["name"] if tid in trait_defs else to_local_id(tid) for tid in ids]
        else:
            values = [to_local_id(tid) for tid in ids]
        traits.append({
            "key": key,
            "label": field["label"],
            "values": values,
            "multiple": field["multiple"],
        })
    state["traits"] = traits

    # Abilities — built from ability-category trait_defs (auto-apply to all characters)
    ability_defs = get_ability_defs(trait_defs) if trait_defs else template.get("abilities", [])
    abilities: list[dict] = []
    for field in ability_defs:
        key = field["key"]
        exp = char_data.get("abilities", {}).get(key, field["defaultValue"])
        abilities.append({
            "key": key,
            "label": field["label"],
            "exp": exp,
            "grade": exp_to_grade(exp),
        })
    state["abilities"] = abilities

    # Experiences — built from experience-category trait_defs (auto-apply to all characters)
    exp_defs = get_experience_defs(trait_defs) if trait_defs else []
    experiences: list[dict] = []
    char_exps = char_data.get("experiences", {})
    for field in exp_defs:
        key = field["key"]
        exp_data = char_exps.get(key, {})
        count = exp_data.get("count", 0) if isinstance(exp_data, dict) else 0
        first = exp_data.get("first") if isinstance(exp_data, dict) else None
        experiences.append({
            "key": key,
            "label": field["label"],
            "count": count,
            "first": first,
        })
    state["experiences"] = experiences

    # Inventory — flat list, resolve names from item_defs
    raw_inv = char_data.get("inventory", [])
    inventory: list[dict] = []
    for entry in raw_inv:
        item_id = entry.get("itemId", "")
        amount = entry.get("amount", 1)
        item_def = (item_defs or {}).get(item_id)
        inventory.append({
            "itemId": item_id,
            "name": item_def["name"] if item_def else to_local_id(item_id),
            "tags": item_def.get("tags", []) if item_def else [],
            "amount": amount,
        })
    state["inventory"] = inventory

    # Position
    state["position"] = char_data.get("position", {"mapId": "", "cellId": 0})
    state["restPosition"] = char_data.get("restPosition", {"mapId": "", "cellId": 0})

    # Favorability (raw — resolved to names in get_full_state)
    state["favorability"] = char_data.get("favorability", {})

    # Apply trait effects
    if trait_defs:
        apply_trait_effects(state, char_data, trait_defs)

    # Apply clothing effects
    apply_clothing_effects(state, char_data, clothing_defs)

    return state


def build_clothing_state(
    char_clothing: dict, slots: list[str], clothing_defs: dict[str, dict]
) -> list[dict]:
    """Build clothing display state with occlusion calculation."""
    # First pass: collect all worn items and their occlusions
    occluded_slots: set[str] = set()
    slot_items: dict[str, dict | None] = {}

    for slot in slots:
        equipped = char_clothing.get(slot)
        if equipped:
            item_id = equipped["itemId"]
            wear_state = equipped["state"]
            clothing_def = clothing_defs.get(item_id, {})
            slot_items[slot] = {
                "itemId": item_id,
                "name": clothing_def.get("name", to_local_id(item_id)),
                "state": wear_state,
                "occlusion": clothing_def.get("occlusion", []),
            }
            # Only worn (not halfWorn) items cause occlusion
            if wear_state == "worn":
                for occ_slot in clothing_def.get("occlusion", []):
                    occluded_slots.add(occ_slot)
        else:
            slot_items[slot] = None

    # Second pass: build display list
    result: list[dict] = []
    for slot in slots:
        item = slot_items[slot]
        entry: dict[str, Any] = {
            "slot": slot,
            "slotLabel": SLOT_LABELS.get(slot, slot),
            "occluded": slot in occluded_slots,
        }
        if item:
            entry["itemId"] = item["itemId"]
            entry["itemName"] = item["name"]
            entry["state"] = item["state"]
        else:
            entry["itemId"] = None
            entry["itemName"] = None
            entry["state"] = None
        result.append(entry)

    return result


# ---------------------------------------------------------------------------
# Namespace resolution for character cross-references
# ---------------------------------------------------------------------------

def namespace_character_data(
    char_data: dict,
    trait_defs: dict[str, dict],
    item_defs: dict[str, dict],
    clothing_defs: dict[str, dict],
    character_defs: dict[str, dict],
    map_defs: dict[str, dict],
) -> None:
    """Namespace all cross-references in character data in-place.

    Call this AFTER all entity defs are loaded with namespaced IDs.
    Bare IDs are resolved against the loaded defs.
    """
    default_addon = char_data.get("_source", "")

    # Traits: list of trait IDs per category
    for key in list(char_data.get("traits", {}).keys()):
        char_data["traits"][key] = [
            resolve_ref(tid, trait_defs, default_addon)
            for tid in char_data["traits"][key]
        ]

    # Clothing: itemId per slot
    for slot, data in char_data.get("clothing", {}).items():
        if isinstance(data, dict) and data.get("itemId"):
            data["itemId"] = resolve_ref(data["itemId"], clothing_defs, default_addon)

    # Inventory: itemId per entry
    for inv in char_data.get("inventory", []):
        if inv.get("itemId"):
            inv["itemId"] = resolve_ref(inv["itemId"], item_defs, default_addon)

    # Favorability: keys are character IDs
    if isinstance(char_data.get("favorability"), dict):
        new_fav: dict[str, Any] = {}
        for target_id, value in char_data["favorability"].items():
            ns_tid = resolve_ref(target_id, character_defs, default_addon)
            new_fav[ns_tid] = value
        char_data["favorability"] = new_fav

    # Abilities: keys are trait IDs (ability category)
    if isinstance(char_data.get("abilities"), dict):
        new_abs: dict[str, Any] = {}
        for key, value in char_data["abilities"].items():
            ns_key = resolve_ref(key, trait_defs, default_addon)
            new_abs[ns_key] = value
        char_data["abilities"] = new_abs

    # Experiences: keys are trait IDs (experience category)
    if isinstance(char_data.get("experiences"), dict):
        new_exps: dict[str, Any] = {}
        for key, value in char_data["experiences"].items():
            ns_key = resolve_ref(key, trait_defs, default_addon)
            new_exps[ns_key] = value
        char_data["experiences"] = new_exps

    # Position mapId — resolve against map defs
    if char_data.get("position", {}).get("mapId"):
        char_data["position"]["mapId"] = resolve_ref(
            char_data["position"]["mapId"], map_defs, default_addon
        )
    if char_data.get("restPosition", {}).get("mapId"):
        char_data["restPosition"]["mapId"] = resolve_ref(
            char_data["restPosition"]["mapId"], map_defs, default_addon
        )


def strip_character_namespaces(char_data: dict, addon_id: str = "") -> dict:
    """Strip namespace prefixes from character data for file storage.

    Same-addon refs → bare ID; cross-addon refs → keep namespace.
    """
    s = lambda ref: _strip_ref(ref, addon_id)
    result = {**char_data}

    # Traits
    if "traits" in result:
        result["traits"] = {
            k: [s(tid) for tid in v]
            for k, v in result["traits"].items()
        }

    # Clothing
    if "clothing" in result:
        new_cl: dict[str, Any] = {}
        for slot, data in result["clothing"].items():
            if isinstance(data, dict) and data.get("itemId"):
                new_cl[slot] = {**data, "itemId": s(data["itemId"])}
            else:
                new_cl[slot] = data
        result["clothing"] = new_cl

    # Inventory
    if "inventory" in result:
        result["inventory"] = [
            {**inv, "itemId": s(inv["itemId"])} if inv.get("itemId") else inv
            for inv in result["inventory"]
        ]

    # Favorability
    if isinstance(result.get("favorability"), dict):
        result["favorability"] = {
            s(k): v for k, v in result["favorability"].items()
        }

    # Abilities
    if isinstance(result.get("abilities"), dict):
        result["abilities"] = {
            s(k): v for k, v in result["abilities"].items()
        }

    # Experiences
    if isinstance(result.get("experiences"), dict):
        result["experiences"] = {
            s(k): v for k, v in result["experiences"].items()
        }

    # Position
    if result.get("position", {}).get("mapId"):
        result["position"] = {**result["position"], "mapId": s(result["position"]["mapId"])}
    if result.get("restPosition", {}).get("mapId"):
        result["restPosition"] = {**result["restPosition"], "mapId": s(result["restPosition"]["mapId"])}

    return result


# ---------------------------------------------------------------------------
# Namespace resolution for action cross-references
# ---------------------------------------------------------------------------

def namespace_action_refs(
    action_defs: dict[str, dict],
    trait_defs: dict[str, dict],
    item_defs: dict[str, dict],
    clothing_defs: dict[str, dict],
    character_defs: dict[str, dict],
    map_defs: dict[str, dict],
) -> None:
    """Namespace cross-references in action definitions in-place."""
    for action in action_defs.values():
        addon_id = action.get("source", "")
        for cond in action.get("conditions", []):
            _ns_cond(cond, trait_defs, item_defs, character_defs, addon_id, map_defs)
        for cost in action.get("costs", []):
            if cost.get("itemId") and cost["itemId"] not in SYMBOLIC_REFS:
                cost["itemId"] = resolve_ref(cost["itemId"], item_defs, addon_id)
        for outcome in action.get("outcomes", []):
            for eff in outcome.get("effects", []):
                _ns_eff(eff, trait_defs, item_defs, character_defs, map_defs, addon_id)


def _ns_cond(cond: dict, trait_defs: dict, item_defs: dict,
             character_defs: dict, default_addon: str,
             map_defs: Optional[dict] = None) -> None:
    """Namespace references in a single action condition."""
    if cond.get("mapId") and cond["mapId"] not in SYMBOLIC_REFS and map_defs is not None:
        cond["mapId"] = resolve_ref(cond["mapId"], map_defs, default_addon)
    if cond.get("traitId") and cond["traitId"] not in SYMBOLIC_REFS:
        cond["traitId"] = resolve_ref(cond["traitId"], trait_defs, default_addon)
    if cond.get("itemId") and cond["itemId"] not in SYMBOLIC_REFS:
        cond["itemId"] = resolve_ref(cond["itemId"], item_defs, default_addon)
    if cond.get("npcId") and cond["npcId"] not in SYMBOLIC_REFS:
        cond["npcId"] = resolve_ref(cond["npcId"], character_defs, default_addon)
    if cond.get("targetId") and cond["targetId"] not in SYMBOLIC_REFS:
        cond["targetId"] = resolve_ref(cond["targetId"], character_defs, default_addon)


def _ns_eff(eff: dict, trait_defs: dict, item_defs: dict,
            character_defs: dict, map_defs: dict, default_addon: str) -> None:
    """Namespace references in a single action effect."""
    if eff.get("traitId") and eff["traitId"] not in SYMBOLIC_REFS:
        eff["traitId"] = resolve_ref(eff["traitId"], trait_defs, default_addon)
    if eff.get("itemId") and eff["itemId"] not in SYMBOLIC_REFS:
        eff["itemId"] = resolve_ref(eff["itemId"], item_defs, default_addon)
    target = eff.get("target", "")
    if target and target not in SYMBOLIC_REFS:
        eff["target"] = resolve_ref(target, character_defs, default_addon)
    if eff.get("favFrom") and eff["favFrom"] not in SYMBOLIC_REFS:
        eff["favFrom"] = resolve_ref(eff["favFrom"], character_defs, default_addon)
    if eff.get("favTo") and eff["favTo"] not in SYMBOLIC_REFS:
        eff["favTo"] = resolve_ref(eff["favTo"], character_defs, default_addon)
    if eff.get("mapId") and eff["mapId"] not in SYMBOLIC_REFS:
        eff["mapId"] = resolve_ref(eff["mapId"], map_defs, default_addon)


def _strip_action_refs(action: dict, addon_id: str = "") -> None:
    """Strip namespace prefixes from action cross-references for file storage.

    Same-addon refs are stripped to bare IDs; cross-addon refs keep namespace.
    """
    for cond in action.get("conditions", []):
        for field in ("mapId", "traitId", "itemId", "npcId", "targetId"):
            if cond.get(field):
                cond[field] = _strip_ref(cond[field], addon_id)
    for cost in action.get("costs", []):
        if cost.get("itemId"):
            cost["itemId"] = _strip_ref(cost["itemId"], addon_id)
    for outcome in action.get("outcomes", []):
        for eff in outcome.get("effects", []):
            for field in ("traitId", "itemId", "target", "favFrom", "favTo", "mapId"):
                if eff.get(field):
                    eff[field] = _strip_ref(eff[field], addon_id)
