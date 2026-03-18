"""Character state building, effect application, ability decay, and grade calculation."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .entity_loader import SLOT_LABELS
from .namespace import to_local_id

GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"]

BUILTIN_DIR = Path(__file__).parent.parent / "data" / "builtin"  # legacy, unused


def exp_to_grade(exp: int) -> str:
    """Convert experience points to letter grade."""
    level = min(exp // 1000, len(GRADES) - 1)
    return GRADES[max(0, level)]


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


def _apply_computed_effect(state: dict[str, Any], target: str, fixed_delta: float, multiplier: float) -> None:
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
    seen_items: set[str] = set()  # Avoid double-counting multi-slot clothing

    for slot_data in char_data.get("clothing", {}).values():
        item_id = slot_data.get("itemId") if isinstance(slot_data, dict) else None
        if not item_id or item_id in seen_items:
            continue
        seen_items.add(item_id)
        wear_state = slot_data.get("state") if isinstance(slot_data, dict) else None
        if wear_state not in ("worn", "halfWorn"):
            continue  # "off" or missing state = no effect
        clothing_def = clothing_defs.get(item_id)
        if not clothing_def:
            continue
        _collect_effects(clothing_def.get("effects", []), fixed_deltas, pct_multipliers)

    _apply_all_effects(state, fixed_deltas, pct_multipliers)


def get_ability_defs(trait_defs: dict[str, dict]) -> list[dict]:
    """Extract ability-category traits as ability definitions, sorted by id."""
    abilities = []
    for td in trait_defs.values():
        if td.get("category") == "ability":
            abilities.append(
                {
                    "key": td["id"],
                    "label": td["name"],
                    "defaultValue": td.get("defaultValue", 0),
                }
            )
    # Stable ordering by key
    abilities.sort(key=lambda a: a["key"])
    return abilities


def get_experience_defs(trait_defs: dict[str, dict]) -> list[dict]:
    """Extract experience-category traits as experience definitions, sorted by id."""
    exps = []
    for td in trait_defs.values():
        if td.get("category") == "experience":
            exps.append(
                {
                    "key": td["id"],
                    "label": td["name"],
                }
            )
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
    clothing_state = build_clothing_state(char_data.get("clothing", {}), template["clothingSlots"], clothing_defs)
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
        traits.append(
            {
                "key": key,
                "label": field["label"],
                "values": values,
                "multiple": field["multiple"],
            }
        )
    state["traits"] = traits

    # Abilities — built from ability-category trait_defs (auto-apply to all characters)
    ability_defs = get_ability_defs(trait_defs) if trait_defs else template.get("abilities", [])
    abilities: list[dict] = []
    for field in ability_defs:
        key = field["key"]
        exp = char_data.get("abilities", {}).get(key, field["defaultValue"])
        abilities.append(
            {
                "key": key,
                "label": field["label"],
                "exp": exp,
                "grade": exp_to_grade(exp),
            }
        )
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
        experiences.append(
            {
                "key": key,
                "label": field["label"],
                "count": count,
                "first": first,
            }
        )
    state["experiences"] = experiences

    # Inventory — flat list, resolve names from item_defs
    raw_inv = char_data.get("inventory", [])
    inventory: list[dict] = []
    for entry in raw_inv:
        item_id = entry.get("itemId", "")
        amount = entry.get("amount", 1)
        item_def = (item_defs or {}).get(item_id)
        inventory.append(
            {
                "itemId": item_id,
                "name": item_def["name"] if item_def else to_local_id(item_id),
                "tags": item_def.get("tags", []) if item_def else [],
                "amount": amount,
            }
        )
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


def build_clothing_state(char_clothing: dict, slots: list[str], clothing_defs: dict[str, dict]) -> list[dict]:
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
