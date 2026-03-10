"""Character template/instance loading, ability grade calculation, clothing occlusion."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"]

BUILTIN_DIR = Path(__file__).parent.parent / "data" / "builtin"  # legacy, unused

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
    """Load trait definitions from addon directories (or legacy data_dir), merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "traits.json")
        for t in data.get("traits", []):
            result[t["id"]] = {**t, "source": addon_id}
    return result


def load_item_defs(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load item definitions from addon directories, merged by id."""
    result: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        data = _load_json_safe(addon_path / "items.json")
        for item in data.get("items", []):
            result[item["id"]] = {**item, "source": addon_id}
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
    """Write game-specific items.json (strips 'source' field), preserving tags."""
    clean = []
    for item in items_list:
        entry = {k: v for k, v in item.items() if k != "source"}
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
            result[a["id"]] = {**a, "source": addon_id}
    return result


def save_action_defs_file(data_dir: Path, actions_list: list[dict]) -> None:
    """Write game-specific actions.json (strips 'source' field)."""
    clean = []
    for a in actions_list:
        entry = {k: v for k, v in a.items() if k != "source"}
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
            result[c["id"]] = {**c, "source": addon_id}
    return result


def save_clothing_defs_file(data_dir: Path, clothing_list: list[dict]) -> None:
    """Write game-specific clothing.json (strips 'source' field)."""
    clean = []
    for c in clothing_list:
        entry = {k: v for k, v in c.items() if k != "source"}
        clean.append(entry)
    path = data_dir / "clothing.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"clothing": clean}, f, ensure_ascii=False, indent=2)


def load_characters(data_dir_or_addons: Path | AddonDirs) -> dict[str, dict]:
    """Load all character JSON files from addon directories."""
    characters: dict[str, dict] = {}
    addon_dirs = _to_addon_dirs(data_dir_or_addons)
    for addon_id, addon_path in addon_dirs:
        chars_dir = addon_path / "characters"
        if not chars_dir.exists():
            continue
        for f in chars_dir.glob("*.json"):
            with open(f, "r", encoding="utf-8") as fh:
                char = json.load(fh)
            char["_source"] = addon_id
            characters[char["id"]] = char
    return characters


def save_character(data_dir: Path, char_data: dict) -> None:
    """Save a character JSON file to data/characters/."""
    chars_dir = data_dir / "characters"
    chars_dir.mkdir(parents=True, exist_ok=True)
    path = chars_dir / f"{char_data['id']}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(char_data, f, ensure_ascii=False, indent=2)


def delete_character(data_dir: Path, char_id: str) -> bool:
    """Delete a character JSON file. Returns True if file existed."""
    path = data_dir / "characters" / f"{char_id}.json"
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
    """Apply collected effects to character state."""
    all_targets = set(fixed_deltas.keys()) | set(pct_multipliers.keys())
    for target in all_targets:
        fd = fixed_deltas.get(target, 0)
        mults = pct_multipliers.get(target, [])
        product = 1.0
        for m in mults:
            product *= m
        _apply_computed_effect(state, target, fd, product)


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
            result[g["id"]] = {**g, "source": addon_id}
    return result


def save_trait_defs_file(data_dir: Path, traits_list: list[dict]) -> None:
    """Write game-specific traits.json (strips 'source' field), preserving traitGroups."""
    clean = []
    for t in traits_list:
        entry = {k: v for k, v in t.items() if k != "source"}
        clean.append(entry)
    path = data_dir / "traits.json"
    existing = _load_json_safe(path)
    existing["traits"] = clean
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def save_trait_groups_file(data_dir: Path, groups_list: list[dict]) -> None:
    """Write game-specific traitGroups in traits.json (strips 'source'), preserving traits."""
    clean = []
    for g in groups_list:
        entry = {k: v for k, v in g.items() if k != "source"}
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
) -> None:
    """Apply ability decay to all characters based on elapsed game-time minutes."""
    for td in trait_defs.values():
        if td.get("category") != "ability":
            continue
        decay = td.get("decay")
        if not decay:
            continue
        interval = decay.get("intervalMinutes", 0)
        if interval <= 0:
            continue
        intervals = minutes_elapsed // interval
        if intervals <= 0:
            continue
        amount = decay.get("amount", 0)
        decay_type = decay.get("type", "fixed")
        ability_key = td["id"]

        for char_state in characters.values():
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
            values = [trait_defs[tid]["name"] if tid in trait_defs else tid for tid in ids]
        else:
            values = ids
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
            "name": item_def["name"] if item_def else item_id,
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
                "name": clothing_def.get("name", item_id),
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
