"""Action system: condition evaluation, cost checking, and execution."""

from __future__ import annotations

from typing import Any

from .character import apply_ability_decay


def get_available_actions(game_state: Any, character_id: str, target_id: str | None = None) -> list[dict]:
    """Get list of available actions for a character."""
    char = game_state.characters.get(character_id)
    if not char:
        return []

    actions: list[dict] = []

    # Built-in actions (move, look)
    pos = char["position"]
    from .map_engine import get_connections

    connections = get_connections(game_state.maps, pos["mapId"], pos["cellId"])
    if connections:
        actions.append(
            {
                "id": "move",
                "name": "移动",
                "type": "move",
                "targets": connections,
            }
        )
        actions.append(
            {
                "id": "look",
                "name": "查看",
                "type": "look",
                "targets": connections,
            }
        )

    # Built-in: changeOutfit (only if outfit types exist)
    if game_state.outfit_types:
        char_data = game_state.character_data.get(character_id, {})
        current_outfit = char_data.get("currentOutfit", "default")
        outfits_data = char_data.get("outfits", {})
        outfit_targets = []

        def _resolve_slot_names(slots_data: dict) -> dict:
            """Convert {slot: [id, ...]} to {slot: [{id, name}, ...]}."""
            result = {}
            for slot, ids in slots_data.items():
                result[slot] = []
                for cid in ids:
                    cdef = game_state.clothing_defs.get(cid, {})
                    result[slot].append({"id": cid, "name": cdef.get("name", cid)})
            return result

        # Always include default
        default_items = outfits_data.get("default", {})
        outfit_targets.append(
            {
                "outfitId": "default",
                "outfitName": "默认服装",
                "current": current_outfit == "default",
                "slots": _resolve_slot_names(default_items),
            }
        )
        # Add all global outfit types
        for ot in game_state.outfit_types:
            oid = ot.get("id", "")
            custom = outfits_data.get(oid)
            if custom:
                resolved = custom
            elif ot.get("copyDefault"):
                resolved = default_items
            else:
                resolved = ot.get("slots", {})
            outfit_targets.append(
                {
                    "outfitId": oid,
                    "outfitName": ot.get("name", oid),
                    "current": current_outfit == oid,
                    "slots": _resolve_slot_names(resolved),
                }
            )
        actions.append(
            {
                "id": "changeOutfit",
                "name": "换装",
                "type": "changeOutfit",
                "outfitTargets": outfit_targets,
            }
        )

    # Configured actions from actions.json
    for action_def in game_state.action_defs.values():
        # If target provided, evaluate all conditions; otherwise skip target-dependent ones
        if not _evaluate_conditions(
            action_def.get("conditions", []),
            char,
            game_state,
            target_id=target_id,
            skip_target_conds=(target_id is None),
            char_id=character_id,
        ):
            continue

        # Check costs
        costs = action_def.get("costs", [])
        enabled, reason = _check_costs(costs, char)

        entry: dict[str, Any] = {
            "id": action_def["id"],
            "name": action_def["name"],
            "type": "configured",
            "category": action_def.get("category", ""),
            "targetType": action_def.get("targetType", "none"),
            "enabled": enabled,
        }
        if not enabled:
            entry["disabledReason"] = reason
        actions.append(entry)

    return actions


def execute_action(game_state: Any, character_id: str, action: dict) -> dict:
    """Execute an action and return the result."""
    action_type = action.get("type")

    if action_type == "move":
        return _execute_move(game_state, character_id, action)

    if action_type == "look":
        return _execute_look(game_state, character_id, action)

    if action_type == "changeOutfit":
        return _execute_change_outfit(game_state, character_id, action)

    # Configured action
    action_id = action.get("actionId") or action.get("type")
    action_def = game_state.action_defs.get(action_id)
    if not action_def:
        return {"success": False, "message": f"未知行动: {action_id}"}

    return _execute_configured(game_state, character_id, action_def, action)


# ========================
# Condition evaluation
# ========================


def _contains_target_dep(item: dict) -> bool:
    """Check if a condition tree contains any condTarget='target' leaf."""
    if "and" in item:
        return any(_contains_target_dep(c) for c in item["and"])
    if "or" in item:
        return any(_contains_target_dep(c) for c in item["or"])
    if "not" in item:
        return _contains_target_dep(item["not"])
    return item.get("condTarget") == "target"


def _evaluate_conditions(
    conditions: list,
    char: dict,
    game_state: Any,
    target_id: str | None = None,
    skip_target_conds: bool = False,
    char_id: str = "",
) -> bool:
    """Evaluate AND-list of conditions (recursive, supports AND/OR/NOT)."""
    for item in conditions:
        if skip_target_conds and _contains_target_dep(item):
            continue  # skip entire top-level item that depends on target
        if not _evaluate_item(item, char, game_state, target_id, char_id):
            return False
    return True


def _evaluate_item(
    item: dict,
    char: dict,
    game_state: Any,
    target_id: str | None = None,
    char_id: str = "",
    depth: int = 0,
) -> bool:
    """Recursively evaluate a condition item (leaf, AND, OR, or NOT)."""
    if depth > 8:
        return False  # prevent infinite recursion
    if "and" in item:
        return all(_evaluate_item(c, char, game_state, target_id, char_id, depth + 1) for c in item["and"])
    if "or" in item:
        return any(_evaluate_item(c, char, game_state, target_id, char_id, depth + 1) for c in item["or"])
    if "not" in item:
        return not _evaluate_item(item["not"], char, game_state, target_id, char_id, depth + 1)
    # Leaf condition
    return _evaluate_leaf(item, char, game_state, target_id, char_id)


def _evaluate_leaf(
    cond: dict,
    char: dict,
    game_state: Any,
    target_id: str | None = None,
    char_id: str = "",
) -> bool:
    """Evaluate a single leaf condition."""
    ctype = cond.get("type")

    # Resolve which character to check
    cond_target = cond.get("condTarget", "self")
    if cond_target == "target":
        if target_id:
            check_char = game_state.characters.get(target_id)
            if not check_char:
                return False
        else:
            return True  # No target yet, pass
    else:
        check_char = char

    # Location/npcPresent always use actor's position
    if ctype == "location":
        pos = char["position"]
        if cond.get("mapId") and pos["mapId"] != cond["mapId"]:
            return False
        cell_ids = cond.get("cellIds", [])
        cell_tags = cond.get("cellTags", [])
        # Expand tags to cell IDs
        if cell_tags:
            map_data = game_state.maps.get(pos["mapId"])
            if map_data:
                for cell_data in map_data.get("cells", []):
                    cell_t = cell_data.get("tags", [])
                    if any(t in cell_t for t in cell_tags):
                        if cell_data["id"] not in cell_ids:
                            cell_ids = list(cell_ids) + [cell_data["id"]]
        if cell_ids and pos["cellId"] not in cell_ids:
            return False
        return True

    if ctype == "npcPresent":
        return _check_npc_present(char, game_state, cond.get("npcId"))

    if ctype == "npcAbsent":
        return not _check_npc_present(char, game_state, cond.get("npcId"))

    # Time is global, not character-specific
    if ctype == "time":
        time = game_state.time
        hour_min = cond.get("hourMin")
        hour_max = cond.get("hourMax")
        if hour_min is not None and time.hour < hour_min:
            return False
        if hour_max is not None and time.hour > hour_max:
            return False
        season = cond.get("season")
        if season is not None and time.season_name != season:
            return False
        day_of_week = cond.get("dayOfWeek")
        if day_of_week is not None and time.weekday != day_of_week:
            return False
        weather = cond.get("weather")
        if weather is not None and time.weather != weather:
            return False
        return True

    # All other conditions use check_char (actor or target based on condTarget)
    if ctype == "resource":
        res = check_char.get("resources", {}).get(cond.get("key", ""))
        if not res:
            return False
        return _compare(res["value"], cond.get("op", ">="), cond.get("value", 0))

    if ctype == "ability":
        for ab in check_char.get("abilities", []):
            if ab["key"] == cond.get("key"):
                return _compare(ab["exp"], cond.get("op", ">="), cond.get("value", 0))
        return False

    if ctype == "basicInfo":
        info = check_char.get("basicInfo", {}).get(cond.get("key", ""))
        if not info or info.get("type") != "number":
            return False
        return _compare(info["value"], cond.get("op", ">="), cond.get("value", 0))

    if ctype == "trait":
        key = cond.get("key", "")
        trait_id = cond.get("traitId", "")
        # Use character_data for raw trait IDs (display state has resolved names)
        check_char_id = char_id if cond.get("condTarget", "self") == "self" else (target_id or "")
        raw_traits = game_state.character_data.get(check_char_id, {}).get("traits", {})
        if isinstance(raw_traits, dict):
            return trait_id in raw_traits.get(key, [])
        # Fallback: list format (display state)
        for trait in check_char.get("traits", []):
            if trait["key"] == key:
                return trait_id in trait.get("values", [])
        return False

    if ctype == "noTrait":
        key = cond.get("key", "")
        trait_id = cond.get("traitId", "")
        check_char_id = char_id if cond.get("condTarget", "self") == "self" else (target_id or "")
        raw_traits = game_state.character_data.get(check_char_id, {}).get("traits", {})
        if isinstance(raw_traits, dict):
            return trait_id not in raw_traits.get(key, [])
        for trait in check_char.get("traits", []):
            if trait["key"] == key:
                return trait_id not in trait.get("values", [])
        return True

    if ctype == "experience":
        key = cond.get("key", "")
        check_char_id = char_id if cond.get("condTarget", "self") == "self" else (target_id or "")
        char_data = game_state.character_data.get(check_char_id, {})
        exp_data = char_data.get("experiences", {}).get(key, {})
        count = exp_data.get("count", 0) if isinstance(exp_data, dict) else 0
        return _compare(count, cond.get("op", ">="), cond.get("value", 0))

    if ctype == "favorability":
        raw_tid = cond.get("targetId", "")
        # Resolve symbolic target
        if raw_tid == "self":
            fav_tid = char_id
        elif raw_tid == "{{targetId}}":
            fav_tid = target_id or ""
        elif raw_tid == "{{player}}":
            fav_tid = ""
            for cid, c in game_state.characters.items():
                if c.get("isPlayer"):
                    fav_tid = cid
                    break
        else:
            fav_tid = raw_tid
        fav_data = check_char.get("favorability", [])
        fav_value = 0
        if isinstance(fav_data, list):
            # Display format: [{id, name, value}, ...]
            for fav in fav_data:
                if fav["id"] == fav_tid:
                    fav_value = fav["value"]
                    break
        elif isinstance(fav_data, dict):
            # Raw format: {npcId: value, ...}
            fav_value = fav_data.get(fav_tid, 0)
        return _compare(fav_value, cond.get("op", ">="), cond.get("value", 0))

    if ctype == "outfit":
        outfit_id = cond.get("outfitId", "")
        check_char_id = char_id if cond.get("condTarget", "self") == "self" else (target_id or "")
        char_data = game_state.character_data.get(check_char_id, {})
        return char_data.get("currentOutfit", "default") == outfit_id

    if ctype == "hasItem":
        item_id = cond.get("itemId")
        tag = cond.get("tag")
        has_op = cond.get("op")
        has_value = cond.get("value")
        total = 0
        for inv in check_char.get("inventory", []):
            match = False
            if item_id and inv["itemId"] == item_id:
                match = True
            elif tag and tag in inv.get("tags", []):
                match = True
            elif not item_id and not tag:
                match = True
            if match:
                if has_op is not None and has_value is not None:
                    total += inv.get("amount", 1)
                else:
                    return True
        if has_op is not None and has_value is not None:
            return _compare(total, has_op, has_value)
        return False

    if ctype == "clothing":
        slot = cond.get("slot", "")
        expected_state = cond.get("state")
        expected_item = cond.get("itemId")
        for cl in check_char.get("clothing", []):
            if cl["slot"] == slot:
                if expected_item:
                    if cl.get("itemId") != expected_item:
                        return False
                if expected_state:
                    if expected_state == "empty":
                        return cl.get("itemId") is None
                    return cl.get("state") == expected_state
                # No state specified, just check item match (already passed above)
                return True
        return False

    if ctype == "variable":
        var_id = cond.get("varId", "")
        if not var_id or not hasattr(game_state, "variable_defs"):
            return False
        var_def = game_state.variable_defs.get(var_id)
        if not var_def:
            return False
        from .variable_engine import evaluate_variable

        # For bidirectional variables: self=check_char, target=the other character
        cond_target = cond.get("condTarget", "self")
        if cond_target == "target":
            var_self_id, var_target_id = target_id or "", char_id
            var_target_state = char
        else:
            var_self_id, var_target_id = char_id, target_id
            var_target_state = game_state.characters.get(target_id) if target_id else None
        var_value = evaluate_variable(
            var_def,
            check_char,
            game_state.variable_defs,
            target_state=var_target_state,
            game_state=game_state,
            char_id=var_self_id,
            target_id=var_target_id,
        )
        return _compare(var_value, cond.get("op", ">="), cond.get("value", 0))

    if ctype == "worldVar":
        key = cond.get("key", "")
        wv = getattr(game_state, "world_variables", {})
        val = wv.get(key, 0)
        return _compare(val, cond.get("op", "=="), cond.get("value", 0))

    # Unknown condition type → pass
    return True


def _check_npc_present(char: dict, game_state: Any, npc_id: str | None) -> bool:
    """Check if NPC is at the same location as character."""
    pos = char["position"]
    for cid, c in game_state.characters.items():
        if c.get("isPlayer"):
            continue
        if c["position"]["mapId"] == pos["mapId"] and c["position"]["cellId"] == pos["cellId"]:
            if npc_id is None or cid == npc_id:
                return True
    return False


def _compare(left: float, op: str, right: float) -> bool:
    """Compare two values with given operator."""
    if op == ">=":
        return left >= right
    if op == "<=":
        return left <= right
    if op == ">":
        return left > right
    if op == "<":
        return left < right
    if op == "==":
        return left == right
    if op == "!=":
        return left != right
    return False


# ========================
# Cost checking
# ========================


def _check_costs(costs: list[dict], char: dict) -> tuple[bool, str]:
    """Check if character can afford all costs. Returns (enabled, reason)."""
    for cost in costs:
        ctype = cost.get("type")
        amount = cost.get("amount", 0)

        if ctype == "resource":
            res = char.get("resources", {}).get(cost.get("key", ""))
            if not res or res["value"] < amount:
                label = res["label"] if res else cost.get("key", "")
                return False, f"{label}不足"

        elif ctype == "basicInfo":
            info = char.get("basicInfo", {}).get(cost.get("key", ""))
            if not info or info["value"] < amount:
                label = info["label"] if info else cost.get("key", "")
                return False, f"{label}不足"

        elif ctype == "item":
            item_id = cost.get("itemId", "")
            found = 0
            for inv in char.get("inventory", []):
                if inv["itemId"] == item_id:
                    found = inv["amount"]
                    break
            if found < amount:
                return False, "物品不足"

    return True, ""


# ========================
# Template resolution
# ========================


def _select_output_template(
    obj: dict,
    char: dict,
    game_state: Any,
    char_id: str,
    target_id: str | None,
) -> str:
    """Select an output template from obj.outputTemplate / obj.outputTemplates.

    If outputTemplates is a list of {text, conditions?, weight?}, evaluate
    conditions and weighted-random among matching entries.
    Falls back to the legacy outputTemplate string.
    """
    import random

    templates = obj.get("outputTemplates")
    if not templates or not isinstance(templates, list):
        return obj.get("outputTemplate", "")

    # Filter by conditions
    matching: list[tuple[str, float]] = []
    for entry in templates:
        text = entry.get("text", "")
        conds = entry.get("conditions", [])
        if conds:
            if not _evaluate_conditions(
                conds,
                char,
                game_state,
                target_id=target_id,
                char_id=char_id,
            ):
                continue
        weight = entry.get("weight", 1)
        if weight > 0:
            matching.append((text, weight))

    if not matching:
        # No entry matched → fall back to legacy field
        return obj.get("outputTemplate", "")

    if len(matching) == 1:
        return matching[0][0]

    # Weighted random
    total = sum(w for _, w in matching)
    roll = random.random() * total
    cumulative = 0.0
    for text, w in matching:
        cumulative += w
        if roll < cumulative:
            return text
    return matching[-1][0]


def _resolve_template(
    template: str,
    char: dict,
    target_char: dict | None,
    game_state: Any,
    outcome: dict | None,
    effects_summary: list[str],
) -> str:
    """Resolve template variables like {{self.clothing.上衣}}."""
    import re

    if not template:
        return ""

    def _char_var(c: dict | None, path: str) -> str:
        """Resolve a character variable path like 'name', 'resource.体力', 'clothing.上衣'."""
        if not c:
            return ""

        # Single-part shorthand
        if path == "name":
            return str(c.get("basicInfo", {}).get("name", {}).get("value", ""))

        parts = path.split(".", 1)
        if len(parts) < 2:
            return ""
        category, key = parts

        if category == "name":
            return str(c.get("basicInfo", {}).get("name", {}).get("value", ""))

        if category == "resource":
            res = c.get("resources", {}).get(key)
            return str(res["value"]) if res else ""

        if category == "ability":
            for ab in c.get("abilities", []):
                if ab["key"] == key:
                    return ab.get("grade", "")
            return ""

        if category == "abilityExp":
            for ab in c.get("abilities", []):
                if ab["key"] == key:
                    return str(ab.get("exp", 0))
            return ""

        if category == "basicInfo":
            info = c.get("basicInfo", {}).get(key)
            return str(info["value"]) if info else ""

        if category == "clothing":
            for cl in c.get("clothing", []):
                if cl["slot"] == key:
                    if cl.get("itemId"):
                        name = cl.get("itemName", cl["itemId"])
                        if cl.get("state") == "halfWorn":
                            return f"{name}(半穿)"
                        if cl.get("state") == "off":
                            return f"{name}(脱下)"
                        return name
                    return "无"
            return ""

        if category == "trait":
            for t in c.get("traits", []):
                if t["key"] == key:
                    vals = t.get("values", [])
                    return ", ".join(vals) if vals else "无"
            return ""

        if category == "favorability":
            fav_data = c.get("favorability", [])
            if isinstance(fav_data, list):
                for fav in fav_data:
                    if fav["id"] == key:
                        return str(fav["value"])
            elif isinstance(fav_data, dict):
                return str(fav_data.get(key, 0))
            return "0"

        if category == "inventory":
            for inv in c.get("inventory", []):
                if inv["itemId"] == key:
                    return str(inv.get("amount", 0))
            return "0"

        if category == "experience":
            for exp_entry in c.get("experiences", []):
                if exp_entry["key"] == key:
                    return str(exp_entry.get("count", 0))
            return "0"

        return ""

    def _replace_var(m: re.Match) -> str:
        var = m.group(1)

        # Simple variables
        if var == "player" or var == "self":
            return str(char.get("basicInfo", {}).get("name", {}).get("value", ""))
        if var == "target":
            return str(target_char.get("basicInfo", {}).get("name", {}).get("value", "")) if target_char else ""
        if var == "outcome":
            return outcome.get("label", "") if outcome else ""
        if var == "outcomeGrade":
            return outcome.get("grade", "") if outcome else ""
        if var == "effects":
            return ", ".join(effects_summary) if effects_summary else ""
        if var == "time":
            return str(game_state.time) if hasattr(game_state, "time") else ""
        if var == "weather":
            return getattr(game_state.time, "weather", "") if hasattr(game_state, "time") else ""
        if var == "location":
            pos = char.get("position", {})
            m_data = game_state.maps.get(pos.get("mapId", ""), {})
            for cell in m_data.get("cells", []):
                if cell["id"] == pos.get("cellId"):
                    return cell.get("name", "")
            return ""

        # Dot-notation: self.X.Y or target.X.Y
        if var.startswith("self."):
            return _char_var(char, var[5:])
        if var.startswith("target."):
            return _char_var(target_char, var[7:])

        return m.group(0)  # Keep unrecognized

    return re.sub(r"\{\{(\w+(?:\.\w+)*)\}\}", _replace_var, template)


# ========================
# NPC autonomous behavior
# ========================

TICK_MINUTES = 5
DISTANCE_PENALTY = 0.5  # desire reduction per minute of travel distance


def _snap_to_tick(minutes: int | float) -> int:
    """Snap a minute value up to the nearest multiple of TICK_MINUTES."""
    import math

    return max(TICK_MINUTES, math.ceil(minutes / TICK_MINUTES) * TICK_MINUTES)


def _split_conditions(conditions: list) -> tuple[dict | None, dict | None, list]:
    """Split conditions into (location_cond, npc_present_cond, hard_conds)."""
    location_cond = None
    npc_present_cond = None
    hard_conds: list[dict] = []
    for item in conditions:
        if isinstance(item, dict) and item.get("type") == "location" and item.get("condTarget", "self") == "self":
            location_cond = item
        elif isinstance(item, dict) and item.get("type") == "npcPresent":
            npc_present_cond = item
        else:
            hard_conds.append(item)
    return location_cond, npc_present_cond, hard_conds


def _expand_location_cells(location_cond: dict, maps: dict) -> list[tuple[str, int]]:
    """Expand a location condition to a list of (mapId, cellId) tuples."""
    target_map = location_cond.get("mapId", "")
    if not target_map:
        return []
    target_cells = list(location_cond.get("cellIds", []))
    cell_tags = location_cond.get("cellTags", [])
    if cell_tags:
        map_data = maps.get(target_map)
        if map_data:
            for cd in map_data.get("cells", []):
                if any(t in cd.get("tags", []) for t in cell_tags):
                    if cd["id"] not in target_cells:
                        target_cells.append(cd["id"])
    if not target_cells:
        # No specific cells = any cell in the map
        map_data = maps.get(target_map)
        if map_data:
            target_cells = [cd["id"] for cd in map_data.get("cells", [])]
    return [(target_map, cid) for cid in target_cells]


def build_cell_action_index(action_defs: dict, maps: dict) -> tuple[dict[tuple, list[dict]], list[dict]]:
    """Build cell->actions inverted index and no-location actions list.

    Returns (cell_action_index, no_location_actions).
    cell_action_index: {(mapId, cellId): [action_def, ...]}
    no_location_actions: [action_def, ...] (actions without location conditions)
    """
    index: dict[tuple, list[dict]] = {}
    no_location: list[dict] = []

    for action_def in action_defs.values():
        if action_def.get("npcWeight", 0) <= 0:
            continue
        location_cond, _, _ = _split_conditions(action_def.get("conditions", []))
        if location_cond:
            cells = _expand_location_cells(location_cond, maps)
            for cell_key in cells:
                if cell_key not in index:
                    index[cell_key] = []
                index[cell_key].append(action_def)
        else:
            no_location.append(action_def)

    return index, no_location


def _build_suggest_map(game_state: Any, npc_id: str) -> tuple[dict[str, float], dict[str, float]]:
    """Build suggest maps from NPC action history (suggestNext bonuses).

    Returns (action_suggest, category_suggest):
      action_suggest: actionId -> bonus (exact match)
      category_suggest: category -> bonus (category match)
    """
    action_suggest: dict[str, float] = {}
    category_suggest: dict[str, float] = {}
    current_time = game_state.time.total_minutes
    for record in game_state.npc_action_history.get(npc_id, []):
        elapsed = current_time - record.get("completedAt", 0)
        for s in record.get("suggestNext", []):
            decay = _snap_to_tick(s.get("decay", 0))
            if decay > 0 and elapsed < decay:
                bonus = s.get("bonus", 0) * (1 - elapsed / decay)
                aid = s.get("actionId", "")
                cat = s.get("category", "")
                if aid:
                    action_suggest[aid] = action_suggest.get(aid, 0) + bonus
                elif cat:
                    category_suggest[cat] = category_suggest.get(cat, 0) + bonus
    return action_suggest, category_suggest


def simulate_npc_ticks(
    game_state: Any,
    elapsed_minutes: int,
    exclude_id: str = "",
    exclude_ids: list[str] | None = None,
) -> list[dict]:
    """Simulate NPC ticks for elapsed time.

    Returns structured log entries: [{npcId, text, mapId, cellId}, ...].
    Also appends all entries to game_state.npc_full_log for LLM use.
    exclude_id: single ID to skip (typically the player).
    exclude_ids: additional IDs to skip (e.g. action target NPC).
    """
    skip = {exclude_id} if exclude_id else set()
    if exclude_ids:
        skip.update(exclude_ids)
    ticks = max(1, elapsed_minutes // TICK_MINUTES)
    current_days = game_state.time.total_days
    log: list[dict] = []
    has_events = bool(getattr(game_state, "event_defs", {}))
    for _ in range(ticks):
        # Advance time by one tick
        game_state.time.advance(TICK_MINUTES)
        # Apply ability decay for all characters each tick
        apply_ability_decay(
            game_state.characters,
            game_state.trait_defs,
            TICK_MINUTES,
            game_state.decay_accumulators,
        )
        for npc_id, npc in list(game_state.characters.items()):
            if npc.get("isPlayer") or npc_id in skip:
                continue
            tick_log = _npc_tick(game_state, npc_id)
            if tick_log:
                pos = npc.get("position", {})
                entry = {
                    "npcId": npc_id,
                    "text": tick_log,
                    "mapId": pos.get("mapId", ""),
                    "cellId": pos.get("cellId", 0),
                    "totalDays": current_days,
                }
                log.append(entry)
            # Evaluate events for this NPC after its tick
            if has_events:
                evaluate_events(
                    game_state,
                    scope_filter="each_character",
                    char_filter=npc_id,
                )
    # Store entries for LLM, trim to cache limit (60 game days)
    game_state.npc_full_log.extend(log)
    from .state import GameState

    cutoff = current_days - GameState.NPC_LOG_CACHE_DAYS
    if game_state.npc_full_log and game_state.npc_full_log[0].get("totalDays", 0) < cutoff:
        game_state.npc_full_log = [e for e in game_state.npc_full_log if e.get("totalDays", 0) >= cutoff]
    return log


def filter_visible_npc_log(log: list[dict], player_pos: dict, game_state: Any, player_id: str) -> list[str]:
    """Filter NPC log entries to only those visible to the player.

    Visible if NPC is within the player's sense range (sense_matrix).
    """
    visible: list[str] = []
    p_key = (player_pos.get("mapId", ""), player_pos.get("cellId", -1))
    sense_row = getattr(game_state, "sense_matrix", {}).get(p_key, {})
    for entry in log:
        e_key = (entry["mapId"], entry["cellId"])
        if e_key == p_key or e_key in sense_row:
            visible.append(entry["text"])
    return visible


def _npc_tick(game_state: Any, npc_id: str) -> str | None:
    """Process one tick for a single NPC. Returns activity text or None."""

    npc = game_state.characters.get(npc_id)
    if not npc:
        return None

    goal = game_state.npc_goals.get(npc_id)

    # Step 1: If NPC has an ongoing action, check if it completes this tick
    if goal and goal.get("busy_ticks", 0) > 0:
        goal["busy_ticks"] -= 1
        if goal["busy_ticks"] > 0:
            return None  # still busy
        # Action completes — apply effects and generate text
        result = _npc_complete_action(game_state, npc_id, goal)
        game_state.npc_goals.pop(npc_id, None)
        return result

    # Step 2: If NPC is moving towards a target, advance one cell
    if goal and goal.get("targetPos"):
        pos = npc["position"]
        target = goal["targetPos"]
        if pos["mapId"] == target["mapId"] and pos["cellId"] == target["cellId"]:
            # Arrived — try to execute the action
            goal.pop("targetPos", None)
            # Fall through to re-evaluate below
        else:
            # Move one step closer
            moved = _npc_move_step(game_state, npc_id, target)
            if not moved:
                # Path blocked or unreachable, abandon goal
                game_state.npc_goals.pop(npc_id, None)
            return None  # spent this tick moving

    # Step 3: Choose next action
    return _npc_choose_action(game_state, npc_id)


def _npc_choose_action(game_state: Any, npc_id: str) -> str | None:
    """Evaluate actions using cell-first traversal + per-target evaluation."""
    import random

    npc = game_state.characters.get(npc_id)
    if not npc:
        return None

    pos = npc["position"]
    pos_key = (pos["mapId"], pos["cellId"])

    # 1. Build suggest maps (behavior memory)
    action_suggest, category_suggest = _build_suggest_map(game_state, npc_id)

    # 2. Distance matrix row
    dm = getattr(game_state, "distance_matrix", {})
    dist_row = dm.get(pos_key, {})

    # 3. Group sensed characters by cell (sense_matrix limits NPC awareness)
    sense_row = getattr(game_state, "sense_matrix", {}).get(pos_key, {})
    cell_npcs: dict[tuple, list[tuple[str, dict]]] = {}
    for cid, c in game_state.characters.items():
        if cid == npc_id:
            continue
        c_pos = (c["position"]["mapId"], c["position"]["cellId"])
        if c_pos not in sense_row:
            continue  # not within sense range
        if c_pos not in cell_npcs:
            cell_npcs[c_pos] = []
        cell_npcs[c_pos].append((cid, c))

    candidates: list[tuple[float, dict, int, tuple, str | None]] = []

    # ========== A. Cell-first: iterate reachable cells ==========
    cell_action_index = getattr(game_state, "cell_action_index", {})

    for cell_key, entry in dist_row.items():
        distance = entry[0]
        cell_actions = cell_action_index.get(cell_key, [])
        if not cell_actions:
            continue

        npcs_here = cell_npcs.get(cell_key, [])

        for action_def in cell_actions:
            npc_weight = action_def.get("npcWeight", 0)
            target_type = action_def.get("targetType", "none")
            _, npc_present_cond, hard_conds = _split_conditions(action_def.get("conditions", []))

            # Hard conditions (self-only check) — early exit
            if hard_conds and not _evaluate_conditions(
                hard_conds, npc, game_state, char_id=npc_id, skip_target_conds=True
            ):
                continue

            if target_type == "npc" or npc_present_cond:
                # === Per-Target evaluation ===
                required_npc = npc_present_cond.get("npcId") if npc_present_cond else None
                for tid, tchar in npcs_here:
                    if required_npc and tid != required_npc:
                        continue
                    # Re-check hard_conds with target (for condTarget="target" conditions)
                    if hard_conds and not _evaluate_conditions(
                        hard_conds, npc, game_state, target_id=tid, char_id=npc_id
                    ):
                        continue
                    add, mul = _calc_modifier_bonus(
                        action_def.get("npcWeightModifiers", []),
                        npc,
                        game_state,
                        npc_id,
                        tid,
                    )
                    desire = (npc_weight + add) * mul
                    desire += action_suggest.get(action_def["id"], 0) + category_suggest.get(
                        action_def.get("category", ""), 0
                    )
                    effective = desire - distance * DISTANCE_PENALTY
                    if effective > 0:
                        candidates.append((effective, action_def, distance, cell_key, tid))
            else:
                # === No-target location action ===
                add, mul = _calc_modifier_bonus(
                    action_def.get("npcWeightModifiers", []),
                    npc,
                    game_state,
                    npc_id,
                    None,
                )
                desire = (npc_weight + add) * mul
                desire += action_suggest.get(action_def["id"], 0) + category_suggest.get(
                    action_def.get("category", ""), 0
                )
                effective = desire - distance * DISTANCE_PENALTY
                if effective > 0:
                    candidates.append((effective, action_def, distance, cell_key, None))

    # ========== B. No-location actions ==========
    no_location_actions = getattr(game_state, "no_location_actions", [])

    for action_def in no_location_actions:
        npc_weight = action_def.get("npcWeight", 0)
        target_type = action_def.get("targetType", "none")
        conditions = action_def.get("conditions", [])
        _, npc_present_cond, hard_conds = _split_conditions(conditions)

        # Hard conditions (self-only) first
        if hard_conds and not _evaluate_conditions(hard_conds, npc, game_state, char_id=npc_id, skip_target_conds=True):
            continue

        if target_type == "npc" or npc_present_cond:
            # Per-target: iterate all cells with NPCs
            required_npc = npc_present_cond.get("npcId") if npc_present_cond else None
            for cell_key, npcs_in_cell in cell_npcs.items():
                cell_dist = dist_row.get(cell_key, (9999,))[0]
                for tid, tchar in npcs_in_cell:
                    if required_npc and tid != required_npc:
                        continue
                    if hard_conds and not _evaluate_conditions(
                        hard_conds, npc, game_state, target_id=tid, char_id=npc_id
                    ):
                        continue
                    add, mul = _calc_modifier_bonus(
                        action_def.get("npcWeightModifiers", []),
                        npc,
                        game_state,
                        npc_id,
                        tid,
                    )
                    desire = (npc_weight + add) * mul
                    desire += action_suggest.get(action_def["id"], 0) + category_suggest.get(
                        action_def.get("category", ""), 0
                    )
                    effective = desire - cell_dist * DISTANCE_PENALTY
                    if effective > 0:
                        candidates.append((effective, action_def, cell_dist, cell_key, tid))
        else:
            # No target, no location — evaluate at current position (distance=0)
            if not _evaluate_conditions(conditions, npc, game_state, char_id=npc_id):
                continue
            add, mul = _calc_modifier_bonus(
                action_def.get("npcWeightModifiers", []),
                npc,
                game_state,
                npc_id,
                None,
            )
            desire = (npc_weight + add) * mul
            desire += action_suggest.get(action_def["id"], 0) + category_suggest.get(action_def.get("category", ""), 0)
            if desire > 0:
                candidates.append((desire, action_def, 0, pos_key, None))

    # 4. Select from top-N candidates by weighted random
    NPC_TOP_N = 5
    if not candidates:
        game_state.npc_activities[npc_id] = "待机中"
        return None

    candidates.sort(key=lambda x: -x[0])
    top = candidates[:NPC_TOP_N]
    weights = [c[0] for c in top]
    chosen = random.choices(top, weights=weights, k=1)[0]
    _, best_def, best_dist, target_pos, target_npc_id = chosen

    if best_dist == 0:
        return _npc_start_action(game_state, npc_id, best_def, target_npc_id)
    else:
        game_state.npc_goals[npc_id] = {
            "actionId": best_def["id"],
            "targetPos": {"mapId": target_pos[0], "cellId": target_pos[1]} if target_pos else None,
            "targetNpcId": target_npc_id,
        }
        game_state.npc_activities[npc_id] = "正在前往..."
        return None


def _npc_start_action(game_state: Any, npc_id: str, action_def: dict, target_npc_id: str | None) -> str | None:
    """Start executing an action for this NPC."""
    npc = game_state.characters.get(npc_id)
    if not npc:
        return None

    # Final condition check
    if not _evaluate_conditions(
        action_def.get("conditions", []),
        npc,
        game_state,
        target_id=target_npc_id,
        char_id=npc_id,
    ):
        game_state.npc_goals.pop(npc_id, None)
        return None

    # Check and apply costs
    costs = action_def.get("costs", [])
    enabled, _ = _check_costs(costs, npc)
    if not enabled:
        game_state.npc_goals.pop(npc_id, None)
        return None
    _apply_costs(costs, npc)

    time_cost = _snap_to_tick(action_def.get("timeCost", TICK_MINUTES))
    busy_ticks = time_cost // TICK_MINUTES

    # Roll outcome now
    outcomes = action_def.get("outcomes", [])
    outcome = _roll_outcome(outcomes, npc, game_state, npc_id, target_npc_id) if outcomes else None

    game_state.npc_goals[npc_id] = {
        "actionId": action_def["id"],
        "targetNpcId": target_npc_id,
        "busy_ticks": busy_ticks,
        "outcome": outcome,
    }

    # Set activity text (what NPC is currently doing)
    action_tpl = _select_output_template(action_def, npc, game_state, npc_id, target_npc_id)
    target_char = game_state.characters.get(target_npc_id) if target_npc_id else None
    activity_text = _resolve_template(action_tpl, npc, target_char, game_state, None, [])
    game_state.npc_activities[npc_id] = activity_text or action_def["name"]

    return None  # Action just started, no completion log yet


def _npc_complete_action(game_state: Any, npc_id: str, goal: dict) -> str | None:
    """Complete an NPC's action: apply effects, return activity text."""
    npc = game_state.characters.get(npc_id)
    if not npc:
        return None

    action_def = game_state.action_defs.get(goal.get("actionId", ""))
    if not action_def:
        return None

    target_npc_id = goal.get("targetNpcId")
    outcome = goal.get("outcome")

    # Apply effects
    effects = outcome["effects"] if outcome else []
    applied = _apply_effects(effects, npc, game_state, npc_id, target_npc_id)

    # Resolve templates for activity text
    action_tpl = _select_output_template(action_def, npc, game_state, npc_id, target_npc_id)
    outcome_tpl = _select_output_template(outcome, npc, game_state, npc_id, target_npc_id) if outcome else ""
    parts = [p for p in (action_tpl, outcome_tpl) if p]
    template = "\n".join(parts)

    target_char = game_state.characters.get(target_npc_id) if target_npc_id else None
    text = _resolve_template(template, npc, target_char, game_state, outcome, applied)

    # Auto-append outcome label and effects summary
    auto_parts: list[str] = []
    if outcome:
        auto_parts.append(f"[{outcome.get('label', '')}]")
    if applied:
        auto_parts.append(" ".join(applied))
    if auto_parts:
        auto_line = " ".join(auto_parts)
        text = f"{text}\n{auto_line}" if text else auto_line

    game_state.npc_activities[npc_id] = text or action_def["name"]

    # Record suggestNext from outcome into action history
    if outcome:
        suggest_next = outcome.get("suggestNext")
        if suggest_next:
            current_time = game_state.time.total_minutes
            history = game_state.npc_action_history.get(npc_id, [])
            # Clean expired records (all suggestNext past their decay)
            history = [
                r
                for r in history
                if any((current_time - r.get("completedAt", 0)) < s.get("decay", 0) for s in r.get("suggestNext", []))
            ]
            history.append(
                {
                    "actionId": action_def["id"],
                    "suggestNext": suggest_next,
                    "completedAt": current_time,
                }
            )
            game_state.npc_action_history[npc_id] = history

    return text


def _npc_move_step(game_state: Any, npc_id: str, target: dict) -> bool:
    """Move NPC one cell closer to target. Returns True if moved."""
    npc = game_state.characters.get(npc_id)
    if not npc:
        return False

    pos = npc["position"]
    pos_key = (pos["mapId"], pos["cellId"])
    dest_key = (target["mapId"], target["cellId"])

    dm = getattr(game_state, "distance_matrix", {})
    row = dm.get(pos_key, {})
    entry = row.get(dest_key)
    if not entry:
        return False  # unreachable

    _, next_map, next_cell = entry
    new_pos = {"mapId": next_map, "cellId": next_cell}
    npc["position"] = new_pos
    game_state.character_data[npc_id]["position"] = new_pos
    return True


# ========================
# Execution
# ========================


def _execute_configured(game_state: Any, character_id: str, action_def: dict, action: dict) -> dict:
    """Execute a configured action from actions.json."""

    char = game_state.characters.get(character_id)
    if not char:
        return {"success": False, "message": "角色不存在"}

    # Re-check conditions (including target-dependent ones)
    target_id = action.get("targetId")
    if not _evaluate_conditions(
        action_def.get("conditions", []),
        char,
        game_state,
        target_id=target_id,
        char_id=character_id,
    ):
        return {"success": False, "message": "条件不满足"}

    # Re-check costs
    costs = action_def.get("costs", [])
    enabled, reason = _check_costs(costs, char)
    if not enabled:
        return {"success": False, "message": reason}

    # Apply costs
    _apply_costs(costs, char)

    # If targeting an NPC, interrupt their current autonomous action
    if target_id and target_id in game_state.npc_goals:
        game_state.npc_goals.pop(target_id, None)

    # Simulate NPC ticks (time advances per-tick inside simulate_npc_ticks)
    time_cost = _snap_to_tick(action_def.get("timeCost", 0))
    npc_log_raw: list[dict] = []
    if time_cost > 0:
        exclude = [target_id] if target_id else None
        npc_log_raw = simulate_npc_ticks(game_state, time_cost, character_id, exclude_ids=exclude)

    # Roll outcome
    outcomes = action_def.get("outcomes", [])
    outcome = _roll_outcome(outcomes, char, game_state, character_id, target_id) if outcomes else None

    # Apply effects
    effects = outcome["effects"] if outcome else []
    applied = _apply_effects(effects, char, game_state, character_id, target_id)

    # Build result text: action template + outcome template + auto effects
    action_tpl = _select_output_template(action_def, char, game_state, character_id, target_id)
    outcome_tpl = _select_output_template(outcome, char, game_state, character_id, target_id) if outcome else ""
    parts = [p for p in (action_tpl, outcome_tpl) if p]
    template = "\n".join(parts)

    target_char = game_state.characters.get(target_id) if target_id else None
    text = _resolve_template(template, char, target_char, game_state, outcome, applied)

    # Auto-append outcome label and effects summary
    auto_parts: list[str] = []
    if outcome:
        auto_parts.append(f"[{outcome.get('label', '')}]")
    if applied:
        auto_parts.append(" ".join(applied))
    if auto_parts:
        auto_line = " ".join(auto_parts)
        text = f"{text}\n{auto_line}" if text else auto_line

    result: dict[str, Any] = {
        "success": True,
        "message": text or f"执行了 {action_def['name']}",
        "actionId": action_def["id"],
        "actionName": action_def["name"],
        "triggerLLM": bool(action_def.get("triggerLLM")),
        "llmPreset": action_def.get("llmPreset", ""),
    }
    if outcome:
        result["outcomeGrade"] = outcome.get("grade")
        result["outcomeLabel"] = outcome.get("label")
    if applied:
        result["effectsSummary"] = applied
    # Filter NPC logs by visibility (same cell as player)
    npc_log = filter_visible_npc_log(npc_log_raw, char["position"], game_state, character_id)
    if npc_log:
        result["npcLog"] = npc_log

    return result


def _calc_modifier_bonus(
    modifiers: list[dict], char: dict, game_state: Any, char_id: str, target_id: str | None
) -> tuple[int, float]:
    """Calculate additive and multiplicative bonuses from modifiers.

    Returns (additive_total, multiplier_total) where multiplier_total is
    the product of all (1 + bonus/100) for multiply-mode modifiers.
    """
    add_total = 0
    mul_total = 1.0
    for mod in modifiers:
        mtype = mod.get("type")
        bonus = mod.get("bonus", 0)
        mode = mod.get("bonusMode", "add")
        raw_bonus = 0

        # Resolve which character to check (modTarget: "self" or "target")
        mod_target = mod.get("modTarget", "self")
        if mod_target == "target" and target_id:
            check_char = game_state.characters.get(target_id, char)
            check_char_id = target_id
        else:
            check_char = char
            check_char_id = char_id

        if mtype == "resource":
            res = check_char.get("resources", {}).get(mod.get("key", ""))
            if res:
                per = mod.get("per", 1)
                if per > 0:
                    raw_bonus = (int(res["value"]) // per) * bonus
        elif mtype == "basicInfo":
            info = check_char.get("basicInfo", {}).get(mod.get("key", ""))
            if info and info.get("type") == "number":
                per = mod.get("per", 1)
                if per > 0:
                    raw_bonus = (int(info["value"]) // per) * bonus
        elif mtype == "ability":
            for ab in check_char.get("abilities", []):
                if ab["key"] == mod["key"]:
                    per = mod.get("per", 1)
                    if per > 0:
                        raw_bonus = (ab["exp"] // per) * bonus
                    break
        elif mtype == "experience":
            for exp_entry in check_char.get("experiences", []):
                if exp_entry["key"] == mod.get("key"):
                    per = mod.get("per", 1)
                    if per > 0:
                        raw_bonus = (exp_entry["count"] // per) * bonus
                    break
        elif mtype == "trait":
            trait_key = mod.get("key", "")
            trait_value = mod.get("value", "")
            for t in check_char.get("traits", []):
                if t["key"] == trait_key and trait_value in t.get("values", []):
                    raw_bonus = bonus
                    break
        elif mtype == "hasItem":
            item_id = mod.get("itemId", "")
            for inv in check_char.get("inventory", []):
                if inv["itemId"] == item_id:
                    raw_bonus = bonus
                    break
        elif mtype == "outfit":
            outfit_id = mod.get("outfitId", "")
            check_data = game_state.character_data.get(check_char_id, {})
            if check_data.get("currentOutfit", "default") == outfit_id:
                raw_bonus = bonus
        elif mtype == "clothing":
            slot = mod.get("slot", "")
            expected_item = mod.get("itemId")
            for cl in check_char.get("clothing", []):
                if cl["slot"] == slot:
                    if expected_item:
                        if cl.get("itemId") == expected_item:
                            raw_bonus = bonus
                    elif cl.get("itemId"):
                        raw_bonus = bonus
                    break
        elif mtype == "favorability":
            fav_source = mod.get("source", "target")
            if fav_source == "target" and target_id:
                npc_data = game_state.character_data.get(target_id, {})
                fav_val = npc_data.get("favorability", {}).get(char_id, 0)
            else:
                own_data = game_state.character_data.get(char_id, {})
                fav_val = own_data.get("favorability", {}).get(target_id or "", 0)
            per = mod.get("per", 1)
            if per > 0:
                raw_bonus = (fav_val // per) * bonus
        elif mtype == "variable":
            var_id = mod.get("varId", "")
            if var_id and hasattr(game_state, "variable_defs"):
                var_def = game_state.variable_defs.get(var_id)
                if var_def:
                    from .variable_engine import evaluate_variable

                    # For bidirectional: modTarget determines direction
                    if mod_target == "target" and target_id:
                        var_self = game_state.characters.get(target_id, check_char)
                        var_target = char
                        var_self_id, var_target_id = target_id, char_id
                    else:
                        var_self = check_char
                        var_target = game_state.characters.get(target_id) if target_id else None
                        var_self_id, var_target_id = char_id, target_id
                    var_value = evaluate_variable(
                        var_def,
                        var_self,
                        game_state.variable_defs,
                        target_state=var_target,
                        game_state=game_state,
                        char_id=var_self_id,
                        target_id=var_target_id,
                    )
                    per = mod.get("per", 1)
                    if per > 0:
                        raw_bonus = (int(var_value) // per) * bonus
        elif mtype == "worldVar":
            key = mod.get("key", "")
            wv = getattr(game_state, "world_variables", {})
            val = wv.get(key, 0)
            per = mod.get("per", 1)
            if per > 0:
                raw_bonus = (int(val) // per) * bonus

        if mode == "multiply":
            mul_total *= 1 + raw_bonus / 100
        else:
            add_total += raw_bonus
    return add_total, mul_total


def _roll_outcome(outcomes: list[dict], char: dict, game_state: Any, char_id: str, target_id: str | None) -> dict:
    """Roll a weighted random outcome, with modifiers from ability/trait/favorability."""
    import random

    weights = []
    for o in outcomes:
        w = o.get("weight", 1)
        w_add, w_mul = _calc_modifier_bonus(o.get("weightModifiers", []), char, game_state, char_id, target_id)
        w = (w + w_add) * w_mul
        weights.append(max(0, w))

    total = sum(weights)
    if total <= 0:
        return outcomes[0]

    roll = random.random() * total
    cumulative = 0
    for i, w in enumerate(weights):
        cumulative += w
        if roll < cumulative:
            return outcomes[i]
    return outcomes[-1]


def _apply_costs(costs: list[dict], char: dict) -> None:
    """Deduct costs from character."""
    for cost in costs:
        ctype = cost.get("type")
        amount = cost.get("amount", 0)

        if ctype == "resource":
            res = char.get("resources", {}).get(cost.get("key", ""))
            if res:
                res["value"] = max(0, res["value"] - amount)

        elif ctype == "basicInfo":
            info = char.get("basicInfo", {}).get(cost.get("key", ""))
            if info and info.get("type") == "number":
                info["value"] -= amount

        elif ctype == "item":
            item_id = cost.get("itemId", "")
            inventory = char.get("inventory", [])
            for inv in inventory:
                if inv["itemId"] == item_id:
                    inv["amount"] -= amount
                    if inv["amount"] <= 0:
                        inventory.remove(inv)
                    break


def _resolve_effect_value(eff: dict, char: dict, game_state: Any) -> float:
    """Resolve effect value: if it's a dict with varId, evaluate the variable; otherwise return the number."""
    raw = eff.get("value", 0)
    if isinstance(raw, dict):
        var_id = raw.get("varId", "")
        if var_id and hasattr(game_state, "variable_defs"):
            var_def = game_state.variable_defs.get(var_id)
            if var_def:
                from .variable_engine import evaluate_variable

                result = evaluate_variable(var_def, char, game_state.variable_defs)
                return result * raw.get("multiply", 1)
        return 0
    return raw


def _resolve_effect_targets(
    target: Any,
    char: dict,
    char_id: str,
    target_id: str | None,
    game_state: Any,
) -> list[str]:
    """Resolve effect target to a list of character IDs."""
    if target == "self" or not target:
        return [char_id]
    if target == "{{targetId}}":
        return [target_id] if target_id else []
    if isinstance(target, dict) and "filter" in target:
        f = target["filter"]
        candidates = list(game_state.characters.keys())

        # cell filter
        cell_f = f.get("cell")
        if cell_f == "current":
            pos = char["position"]
            candidates = [
                c
                for c in candidates
                if game_state.characters[c]["position"]["mapId"] == pos["mapId"]
                and game_state.characters[c]["position"]["cellId"] == pos["cellId"]
            ]
        elif isinstance(cell_f, dict):
            candidates = [
                c
                for c in candidates
                if game_state.characters[c]["position"]["mapId"] == cell_f.get("mapId")
                and game_state.characters[c]["position"]["cellId"] == cell_f.get("cellId")
            ]

        # trait filter
        trait_f = f.get("trait")
        if trait_f:
            key, tid = trait_f.get("key", ""), trait_f.get("traitId", "")
            candidates = [
                c for c in candidates if tid in game_state.character_data.get(c, {}).get("traits", {}).get(key, [])
            ]

        # variable filter (bidirectional)
        var_f = f.get("variable")
        if var_f:
            var_def = game_state.variable_defs.get(var_f.get("varId", ""))
            if var_def:
                from .variable_engine import evaluate_variable

                filtered = []
                for c in candidates:
                    c_state = game_state.characters.get(c)
                    if c_state:
                        val = evaluate_variable(
                            var_def,
                            char,
                            game_state.variable_defs,
                            target_state=c_state,
                            game_state=game_state,
                            char_id=char_id,
                            target_id=c,
                        )
                        if _compare(val, var_f.get("op", ">="), var_f.get("value", 0)):
                            filtered.append(c)
                candidates = filtered

        # excludeSelf
        if f.get("excludeSelf"):
            candidates = [c for c in candidates if c != char_id]

        return candidates

    # Legacy: specific character ID
    if isinstance(target, str) and target:
        return [target]
    return []


def _apply_effects(effects: list[dict], char: dict, game_state: Any, char_id: str, target_id: str | None) -> list[str]:
    """Apply effects and return human-readable summaries."""
    summaries: list[str] = []

    for eff in effects:
        etype = eff.get("type")
        target = eff.get("target", "self")
        op = eff.get("op", "add")

        # Resolve target(s)
        target_ids = _resolve_effect_targets(target, char, char_id, target_id, game_state)

        for resolved_tid in target_ids:
            target_char = game_state.characters.get(resolved_tid)
            if not target_char:
                continue

            _apply_single_effect(
                eff, etype, op, char, target_char, char_id, resolved_tid, target_id, game_state, summaries
            )

    return summaries


def _apply_single_effect(
    eff: dict,
    etype: str,
    op: str,
    char: dict,
    target_char: dict,
    char_id: str,
    target_id: str,
    action_target_id: str | None,
    game_state: Any,
    summaries: list[str],
) -> None:
    """Apply a single effect to a single target character."""
    # Build target name prefix for summaries (empty for self)
    target_prefix = ""
    if target_char is not char:
        t_name = target_char.get("basicInfo", {}).get("name", {})
        if isinstance(t_name, dict):
            t_name = t_name.get("value", "")
        target_prefix = f"[{t_name}] " if t_name else ""

    # Apply valueModifiers to the effect value
    value_mod_add, value_mod_mul = _calc_modifier_bonus(
        eff.get("valueModifiers", []), char, game_state, char_id, target_id
    )

    if etype == "resource":
        key = eff.get("key", "")
        value = int((_resolve_effect_value(eff, char, game_state) + value_mod_add) * value_mod_mul)
        is_pct = eff.get("valuePercent", False)
        res = target_char.get("resources", {}).get(key)
        if res:
            if op == "add":
                delta = int(res["value"] * value / 100) if is_pct else value
                res["value"] = min(res["max"], max(0, res["value"] + delta))
                suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                summaries.append(f"{target_prefix}{res['label']} {suffix}")
            elif op == "set":
                new_val = int(res["max"] * value / 100) if is_pct else value
                res["value"] = min(res["max"], max(0, new_val))
                suffix = f"{value}{'%' if is_pct else ''}"
                summaries.append(f"{target_prefix}{res['label']} → {suffix}")

    elif etype == "ability":
        key = eff.get("key", "")
        value = int((_resolve_effect_value(eff, char, game_state) + value_mod_add) * value_mod_mul)
        is_pct = eff.get("valuePercent", False)
        for ab in target_char.get("abilities", []):
            if ab["key"] == key:
                if op == "add":
                    delta = int(ab["exp"] * value / 100) if is_pct else value
                    ab["exp"] = max(0, ab["exp"] + delta)
                    suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                    summaries.append(f"{target_prefix}{ab['label']} {suffix}")
                elif op == "set":
                    new_val = int(ab["exp"] * value / 100) if is_pct else value
                    ab["exp"] = max(0, new_val)
                    suffix = f"{value}{'%' if is_pct else ''}"
                    summaries.append(f"{target_prefix}{ab['label']} → {suffix}")
                from .character import exp_to_grade

                ab["grade"] = exp_to_grade(ab["exp"])
                break

    elif etype == "basicInfo":
        key = eff.get("key", "")
        value = int((_resolve_effect_value(eff, char, game_state) + value_mod_add) * value_mod_mul)
        is_pct = eff.get("valuePercent", False)
        info = target_char.get("basicInfo", {}).get(key)
        if info and info.get("type") == "number":
            if op == "add":
                delta = int(info["value"] * value / 100) if is_pct else value
                info["value"] += delta
                suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                summaries.append(f"{target_prefix}{info['label']} {suffix}")
            elif op == "set":
                new_val = int(info["value"] * value / 100) if is_pct else value
                info["value"] = new_val
                suffix = f"{value}{'%' if is_pct else ''}"
                summaries.append(f"{target_prefix}{info['label']} → {suffix}")

    elif etype == "favorability":
        # Resolve favFrom (whose fav data) and favTo (towards whom)
        raw_from = eff.get("favFrom", "{{targetId}}")
        raw_to = eff.get("favTo", "self")
        # Also support legacy targetId field
        if "targetId" in eff and "favFrom" not in eff:
            raw_from = eff["targetId"]
            raw_to = "self"

        def _resolve_fav_id(val: str) -> str:
            if val == "self":
                return char_id
            if val == "{{targetId}}":
                return action_target_id or ""
            if val == "{{player}}":
                for cid, c in game_state.characters.items():
                    if c.get("isPlayer"):
                        return cid
                return ""
            return val

        fav_from_id = _resolve_fav_id(raw_from)
        fav_to_id = _resolve_fav_id(raw_to)
        if not fav_from_id or not fav_to_id:
            return

        value = int((_resolve_effect_value(eff, char, game_state) + value_mod_add) * value_mod_mul)
        is_pct = eff.get("valuePercent", False)
        # Update: fav_from's favorability towards fav_to
        from_data = game_state.character_data.get(fav_from_id, {})
        fav = from_data.setdefault("favorability", {})
        # Build favorability summary with from→to names
        from_name_data = game_state.character_data.get(fav_from_id, {}).get("basicInfo", {}).get("name", "")
        to_name_data = game_state.character_data.get(fav_to_id, {}).get("basicInfo", {}).get("name", "")
        fav_label = f"[{from_name_data}→{to_name_data}] 好感度" if from_name_data and to_name_data else "好感度"
        if op == "add":
            old = fav.get(fav_to_id, 0)
            delta = int(old * value / 100) if is_pct else value
            fav[fav_to_id] = old + delta
            suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
            summaries.append(f"{fav_label} {suffix}")
        elif op == "set":
            old = fav.get(fav_to_id, 0)
            new_val = int(old * value / 100) if is_pct else value
            fav[fav_to_id] = new_val
            suffix = f"{value}{'%' if is_pct else ''}"
            summaries.append(f"{fav_label} → {suffix}")

    elif etype == "item":
        item_id = eff.get("itemId", "")
        amount = eff.get("amount", 1)
        inventory = target_char.setdefault("inventory", [])
        if op in ("add", "addItem"):
            found = False
            for inv in inventory:
                if inv["itemId"] == item_id:
                    inv["amount"] += amount
                    found = True
                    break
            if not found:
                item_def = game_state.item_defs.get(item_id, {})
                inventory.append(
                    {
                        "itemId": item_id,
                        "name": item_def.get("name", item_id),
                        "tags": item_def.get("tags", []),
                        "amount": amount,
                    }
                )
            summaries.append(f"{target_prefix}获得 {item_id} x{amount}")
        elif op in ("remove", "removeItem"):
            for inv in inventory:
                if inv["itemId"] == item_id:
                    inv["amount"] -= amount
                    if inv["amount"] <= 0:
                        inventory.remove(inv)
                    break
            summaries.append(f"{target_prefix}失去 {item_id} x{amount}")

    elif etype == "trait":
        key = eff.get("key", "")
        trait_id = eff.get("traitId", "")
        # Resolve target for trait effects
        trait_target = eff.get("target", "self")
        if trait_target == "{{targetId}}" and action_target_id:
            t_char_data = game_state.character_data.get(action_target_id, {})
        elif trait_target == "self" or not trait_target:
            t_char_data = game_state.character_data.get(char_id, {})
        else:
            t_char_data = game_state.character_data.get(trait_target, {})
        traits = t_char_data.get("traits", {})
        if op in ("add", "addTrait"):
            vals = traits.get(key, [])
            if trait_id not in vals:
                # Check exclusive trait groups: remove other members
                for grp in game_state.trait_groups.values():
                    if grp.get("exclusive", True) and trait_id in grp.get("traits", []):
                        removed = [t for t in vals if t in grp["traits"]]
                        for t in removed:
                            vals.remove(t)
                        break
                vals.append(trait_id)
                traits[key] = vals
            summaries.append(f"{target_prefix}获得特质 [{trait_id}]")
        elif op in ("remove", "removeTrait"):
            vals = traits.get(key, [])
            if trait_id in vals:
                vals.remove(trait_id)
                traits[key] = vals
            summaries.append(f"{target_prefix}失去特质 [{trait_id}]")

    elif etype == "clothing":
        slot = eff.get("slot", "")
        new_state = eff.get("state", "worn")
        # Resolve target for clothing effects
        cl_target = eff.get("target", "self")
        if cl_target == "{{targetId}}" and target_id:
            cl_char_data = game_state.character_data.get(target_id, {})
        elif cl_target == "self" or not cl_target:
            cl_char_data = game_state.character_data.get(char_id, {})
        else:
            cl_char_data = game_state.character_data.get(cl_target, {})
        cl = cl_char_data.get("clothing", {})
        if slot in cl:
            if op == "remove" or new_state == "empty":
                item_name = cl[slot].get("itemId", slot)
                cl[slot] = {"itemId": None, "state": "off"}
                summaries.append(f"{target_prefix}移除 [{item_name}]")
            else:
                cl[slot]["state"] = new_state
                item_name = cl[slot].get("itemId", slot)
                summaries.append(f"{target_prefix}[{item_name}] → {new_state}")

    elif etype == "outfit":
        import random

        # Resolve target (same pattern as clothing)
        out_target = eff.get("target", "self")
        if out_target == "{{targetId}}" and action_target_id:
            tgt_cd = game_state.character_data.get(action_target_id, {})
        elif out_target == "self" or not out_target:
            tgt_cd = game_state.character_data.get(char_id, {})
        else:
            tgt_cd = game_state.character_data.get(out_target, {})
        if not tgt_cd:
            return

        if op == "switch":
            outfit_key = eff.get("outfitKey", "")
            outfit = tgt_cd.get("outfits", {}).get(outfit_key)
            # Fallback: resolve from outfit type definition
            if not outfit and outfit_key != "default":
                for ot in game_state.outfit_types:
                    if ot.get("id") == outfit_key:
                        if ot.get("copyDefault"):
                            outfit = tgt_cd.get("outfits", {}).get("default")
                        else:
                            outfit = ot.get("slots", {})
                        break
            if not outfit:
                return
            cl = tgt_cd.setdefault("clothing", {})
            occupied: set[str] = set()  # Slots occupied by multi-slot items
            for slot, candidates in outfit.items():
                if slot in occupied:
                    continue
                if not candidates:
                    cl[slot] = {"itemId": None, "state": "off"}
                else:
                    chosen = random.choice(candidates)
                    cl[slot] = {"itemId": chosen, "state": "worn"}
                    # Multi-slot: occupy all slots this clothing uses
                    cdef = game_state.clothing_defs.get(chosen, {})
                    for extra_slot in cdef.get("slots", []):
                        if extra_slot != slot:
                            cl[extra_slot] = {"itemId": chosen, "state": "worn"}
                            occupied.add(extra_slot)
            tgt_cd["currentOutfit"] = outfit_key
            summaries.append(f"{target_prefix}换装 → {outfit_key}")

        elif op == "add":
            outfit_key = eff.get("outfitKey", "")
            slot = eff.get("slot", "")
            item_id = eff.get("itemId", "")
            if not outfit_key or not slot or not item_id:
                return
            outfits = tgt_cd.setdefault("outfits", {})
            outfit = outfits.setdefault(outfit_key, {})
            slot_list = outfit.setdefault(slot, [])
            if item_id not in slot_list:
                slot_list.append(item_id)
            summaries.append(f"{target_prefix}预设[{outfit_key}] +{item_id}")

        elif op == "remove":
            outfit_key = eff.get("outfitKey")
            slot_filter = eff.get("slot")
            outfits = tgt_cd.get("outfits", {})
            current_outfit = tgt_cd.get("currentOutfit", "default")
            cl = tgt_cd.get("clothing", {})
            removed = []
            for ok, outfit in outfits.items():
                if outfit_key and ok != outfit_key:
                    continue
                for sl, candidates in list(outfit.items()):
                    if slot_filter and sl != slot_filter:
                        continue
                    if not candidates:
                        continue
                    worn_id = None
                    if ok == current_outfit:
                        worn_id = cl.get(sl, {}).get("itemId")
                    removable = [c for c in candidates if c != worn_id]
                    if removable:
                        victim = random.choice(removable)
                        candidates.remove(victim)
                        removed.append(victim)
            if removed:
                summaries.append(f"{target_prefix}移除{len(removed)}件预设服装")

    elif etype == "position":
        map_id = eff.get("mapId", "")
        cell_id = eff.get("cellId")
        if not map_id or cell_id is None:
            return
        # Skip if target map doesn't exist (addon disabled)
        if map_id not in game_state.maps:
            return
        # Resolve target character for position change
        pos_target = eff.get("target", "self")
        if pos_target == "{{targetId}}" and action_target_id:
            pos_char_id = action_target_id
        elif pos_target == "self" or not pos_target:
            pos_char_id = char_id
        else:
            pos_char_id = pos_target
        pos_char = game_state.characters.get(pos_char_id)
        pos_char_data = game_state.character_data.get(pos_char_id)
        if pos_char and pos_char_data:
            new_pos = {"mapId": map_id, "cellId": cell_id}
            pos_char["position"] = new_pos
            pos_char_data["position"] = new_pos
            # Get cell name for summary
            map_data = game_state.maps.get(map_id)
            cell_name = ""
            if map_data:
                cell_info = map_data.get("cell_index", {}).get(cell_id)
                if cell_info:
                    cell_name = cell_info.get("name", f"#{cell_id}")
            summaries.append(f"{target_prefix}移动到 {cell_name or map_id}")

    elif etype == "worldVar":
        key = eff.get("key", "")
        value = eff.get("value", 0)
        wv = getattr(game_state, "world_variables", {})
        if op == "set":
            wv[key] = value
            summaries.append(f"世界变量 {key} → {value}")
        elif op == "add":
            wv[key] = wv.get(key, 0) + value
            summaries.append(f"世界变量 {key} {'+' if value >= 0 else ''}{value}")
        return

    elif etype == "experience":
        key = eff.get("key", "")
        amount = eff.get("value", 1)
        for exp_entry in target_char.get("experiences", []):
            if exp_entry["key"] != key:
                continue
            old_count = exp_entry["count"]
            exp_entry["count"] = max(0, old_count + amount)
            # Record first occurrence info (overwrite placeholder if count was 0)
            if old_count == 0 and exp_entry["count"] > 0:
                # Build location string
                pos = char.get("position", {})
                map_data = game_state.maps.get(pos.get("mapId", ""))
                loc_name = ""
                if map_data:
                    cell_info = map_data.get("cell_index", {}).get(pos.get("cellId"))
                    if cell_info:
                        loc_name = cell_info.get("name", "")
                    map_name = map_data.get("name", pos.get("mapId", ""))
                    loc_name = f"{map_name}/{loc_name}" if loc_name else map_name
                # Build partner name: the "other person" from target_char's perspective
                # Figure out who target_char is
                eff_target = eff.get("target", "self")
                if eff_target == "self" or (not eff_target):
                    # target_char is the actor → partner is the action target
                    partner_id = action_target_id
                elif eff_target == "{{targetId}}":
                    # target_char is the action target → partner is the actor
                    partner_id = char_id
                else:
                    # target_char is a specific NPC → partner is the actor
                    partner_id = char_id
                partner_name = ""
                if partner_id:
                    p_char_data = game_state.character_data.get(partner_id, {})
                    partner_name = p_char_data.get("basicInfo", {}).get("name", partner_id)
                # Build time string
                t = game_state.time
                time_str = f"{t.year}年{t.season_name}{t.day}日{t.hour:02d}时"
                exp_entry["first"] = {
                    "event": eff.get("eventLabel", key),
                    "location": loc_name,
                    "target": partner_name,
                    "time": time_str,
                }
            summaries.append(f"{target_prefix}{exp_entry['label']} +{amount}")
            break

    return summaries


# ========================
# Built-in: Move
# ========================


def _execute_move(game_state: Any, character_id: str, action: dict) -> dict:
    """Execute a move action."""
    from .map_engine import validate_move

    char = game_state.characters.get(character_id)
    if not char:
        return {"success": False, "message": "角色不存在"}

    pos = char["position"]
    target_map = action.get("targetMap")
    target_cell = action.get("targetCell")

    if target_cell is None:
        return {"success": False, "message": "未指定目标方格"}

    travel_time = validate_move(game_state.maps, pos["mapId"], pos["cellId"], target_map, target_cell)
    if travel_time is None:
        return {"success": False, "message": "无法移动到目标方格"}

    # Update position
    new_map_id = target_map or pos["mapId"]
    char["position"] = {"mapId": new_map_id, "cellId": target_cell}

    # Also update raw character data
    game_state.character_data[character_id]["position"] = char["position"]

    # Get target cell name
    target_map_data = game_state.maps.get(new_map_id)
    cell_name = ""
    if target_map_data:
        cell_info = target_map_data["cell_index"].get(target_cell)
        if cell_info:
            cell_name = cell_info.get("name", f"{target_cell}号")

    # Simulate NPC ticks (time advances per-tick inside simulate_npc_ticks)
    npc_log_raw = simulate_npc_ticks(game_state, travel_time, character_id)

    result: dict[str, Any] = {
        "success": True,
        "message": f"{char.get('basicInfo', {}).get('name', {}).get('value', character_id)} 移动到了 {cell_name}",
        "newPosition": char["position"],
    }
    # Filter NPC logs: show only NPCs at player's new position
    npc_log = filter_visible_npc_log(npc_log_raw, char["position"], game_state, character_id)
    if npc_log:
        result["npcLog"] = npc_log
    return result


# ========================
# Built-in: Look
# ========================


def _execute_look(game_state: Any, character_id: str, action: dict) -> dict:
    """Look at a nearby cell and report what NPCs are doing there."""
    char = game_state.characters.get(character_id)
    if not char:
        return {"success": False, "message": "角色不存在"}

    target_map_id = action.get("targetMap") or char["position"]["mapId"]
    target_cell = action.get("targetCell")
    if target_cell is None:
        return {"success": False, "message": "未指定目标方格"}

    # Get cell name
    map_data = game_state.maps.get(target_map_id, {})
    cell_info = map_data.get("cell_index", {}).get(target_cell, {})
    cell_name = cell_info.get("name", f"#{target_cell}")

    # Build message: action description + location header + each NPC's activity
    char = game_state.characters.get(character_id, {})
    char_name = char.get("basicInfo", {}).get("name", {}).get("value", character_id)
    lines = [f"{char_name} 查看了 {cell_name}。"]
    found_npc = False
    for cid, c in game_state.characters.items():
        if cid == character_id:
            continue
        cpos = c.get("position", {})
        if cpos.get("mapId") == target_map_id and cpos.get("cellId") == target_cell:
            found_npc = True
            npc_name = c.get("basicInfo", {}).get("name", {}).get("value", cid)
            activity = game_state.npc_activities.get(cid, "待机中")
            lines.append(f"{npc_name}: {activity}")

    if not found_npc:
        lines.append("那里没有人。")

    return {
        "success": True,
        "message": "\n".join(lines),
    }


def _execute_change_outfit(game_state: Any, character_id: str, action: dict) -> dict:
    """Execute a player outfit change. Fixed 5-minute time cost."""
    char = game_state.characters.get(character_id)
    if not char:
        return {"success": False, "message": "角色不存在"}

    outfit_id = action.get("outfitId", "")
    selections = action.get("selections", {})  # {slot: clothingId}

    if not outfit_id:
        return {"success": False, "message": "未指定预设"}

    char_data = game_state.character_data.get(character_id, {})
    cl = char_data.setdefault("clothing", {})

    # Apply selections: each slot gets the player-chosen clothing item
    occupied: set[str] = set()
    for slot, item_id in selections.items():
        if slot in occupied:
            continue
        if item_id:
            cl[slot] = {"itemId": item_id, "state": "worn"}
            # Multi-slot: occupy all slots this clothing uses
            cdef = game_state.clothing_defs.get(item_id, {})
            for extra_slot in cdef.get("slots", []):
                if extra_slot != slot:
                    cl[extra_slot] = {"itemId": item_id, "state": "worn"}
                    occupied.add(extra_slot)
        else:
            cl[slot] = {"itemId": None, "state": "off"}

    char_data["currentOutfit"] = outfit_id

    # Find outfit name for message
    outfit_name = "默认服装" if outfit_id == "default" else outfit_id
    for ot in game_state.outfit_types:
        if ot.get("id") == outfit_id:
            outfit_name = ot.get("name", outfit_id)
            break

    # Simulate NPC ticks (5 minutes)
    time_cost = _snap_to_tick(5)
    npc_log_raw = simulate_npc_ticks(game_state, time_cost, character_id)

    result: dict[str, Any] = {
        "success": True,
        "message": f"换装 → {outfit_name}",
    }
    npc_log = filter_visible_npc_log(npc_log_raw, char["position"], game_state, character_id)
    if npc_log:
        result["npcLog"] = npc_log
    return result


# ========================
# Global event evaluation
# ========================


def _should_fire_event(
    mode: str,
    state: dict,
    key: str,
    matched: bool,
    current_time: int,
    event_def: dict,
) -> bool:
    """Determine whether an event should fire based on triggerMode."""
    if mode == "once":
        if key == "__global__":
            if state.get("fired", False):
                return False
        else:
            if key in state.get("fired_chars", []):
                return False
        return matched

    if mode == "on_change":
        last = state.get("last_match", {}).get(key, False)
        return matched and not last

    if mode == "while":
        if not matched:
            return False
        cooldown = _snap_to_tick(event_def.get("cooldown", 10))
        last_trigger = state.get("last_trigger", {}).get(key, -999999)
        return (current_time - last_trigger) >= cooldown

    return False


def _update_event_state(
    mode: str,
    state: dict,
    key: str,
    matched: bool,
    current_time: int,
    fired: bool,
) -> None:
    """Update event runtime state after evaluation."""
    if mode == "on_change":
        state.setdefault("last_match", {})[key] = matched

    if mode == "while" and fired:
        state.setdefault("last_trigger", {})[key] = current_time

    if mode == "once" and fired:
        if key == "__global__":
            state["fired"] = True
        else:
            state.setdefault("fired_chars", [])
            if key not in state["fired_chars"]:
                state["fired_chars"].append(key)


def evaluate_events(
    game_state: Any,
    scope_filter: str | None = None,
    char_filter: str | None = None,
) -> list[dict]:
    """Evaluate global events.

    scope_filter: only evaluate events with this targetScope ("each_character" / "none")
    char_filter: only evaluate this character (used inside NPC tick)

    Returns list of {event, charId, effects_summary, output} for each firing.
    """
    current_time = game_state.time.total_minutes
    results: list[dict] = []

    for event_def in game_state.event_defs.values():
        if not event_def.get("enabled", True):
            continue
        mode = event_def["triggerMode"]
        scope = event_def.get("targetScope", "none")
        if scope_filter and scope != scope_filter:
            continue

        event_id = event_def["id"]
        state = game_state.event_state.setdefault(event_id, {})

        if scope == "each_character":
            chars = (
                {char_filter: game_state.characters[char_filter]}
                if char_filter and char_filter in game_state.characters
                else game_state.characters
            )
            for char_id, char in chars.items():
                matched = _evaluate_conditions(
                    event_def.get("conditions", []),
                    char,
                    game_state,
                    char_id=char_id,
                )
                if _should_fire_event(mode, state, char_id, matched, current_time, event_def):
                    summaries = _apply_effects(
                        event_def.get("effects", []),
                        char,
                        game_state,
                        char_id,
                        None,
                    )
                    # Resolve output template
                    tpl = _select_output_template(event_def, char, game_state, char_id, None)
                    output = _resolve_template(tpl, char, None, game_state, None, summaries)
                    results.append(
                        {
                            "event": event_def["name"],
                            "charId": char_id,
                            "effectsSummary": summaries,
                            "output": output,
                        }
                    )
                    _update_event_state(mode, state, char_id, matched, current_time, True)
                else:
                    _update_event_state(mode, state, char_id, matched, current_time, False)

        elif scope == "none":
            # No character context — only global conditions (time, weather, worldVar)
            matched = _evaluate_global_conditions(event_def.get("conditions", []), game_state)
            if _should_fire_event(mode, state, "__global__", matched, current_time, event_def):
                summaries = _apply_effects(
                    event_def.get("effects", []),
                    {},
                    game_state,
                    "",
                    None,
                )
                tpl = _select_output_template(event_def, {}, game_state, "", None)
                output = _resolve_template(tpl, {}, None, game_state, None, summaries)
                results.append(
                    {
                        "event": event_def["name"],
                        "charId": None,
                        "effectsSummary": summaries,
                        "output": output,
                    }
                )
                _update_event_state(mode, state, "__global__", matched, current_time, True)
            else:
                _update_event_state(mode, state, "__global__", matched, current_time, False)

    return results


def _evaluate_global_conditions(
    conditions: list,
    game_state: Any,
) -> bool:
    """Evaluate conditions that don't require a character context.

    Only time, weather, and worldVar conditions are meaningful here.
    Other condition types that need a character will pass by default.
    """
    # Use an empty dict as the "character" — leaf conditions that need
    # character data will simply not match, which is correct for scope=none.
    return _evaluate_conditions(conditions, {}, game_state)
