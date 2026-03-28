"""Condition evaluation system: recursive AND/OR/NOT condition trees, 15+ condition types."""

from __future__ import annotations

from typing import Any

from ..constants import ClothingState, CompareOp, ConditionType, CondTarget, CostType


def _resolve_fav_id(
    val: str, char_id: str, target_id: str | None, game_state: Any
) -> str:
    """Resolve a favorability participant ID (self / {{targetId}} / {{player}} / literal)."""
    if val == "self":
        return char_id
    if val == "{{targetId}}":
        return target_id or ""
    if val == "{{player}}":
        for cid, c in game_state.characters.items():
            if c.get("isPlayer"):
                return cid
        return ""
    return val


def _contains_target_dep(item: dict) -> bool:
    """Check if a condition tree contains any condTarget='target' leaf."""
    if "and" in item:
        return any(_contains_target_dep(c) for c in item["and"])
    if "or" in item:
        return any(_contains_target_dep(c) for c in item["or"])
    if "not" in item:
        return _contains_target_dep(item["not"])
    return item.get("condTarget") == CondTarget.TARGET


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
    if depth > 6:
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
    # Pre-resolve value (number or {varId, multiply} variable ref)
    cond_value = _resolve_cond_value(cond.get("value"), game_state, char_id, target_id)

    # Resolve which character to check
    cond_target = cond.get("condTarget", CondTarget.SELF)
    if cond_target == CondTarget.TARGET:
        if target_id:
            check_char = game_state.characters.get(target_id)
            if not check_char:
                return False
        else:
            return True  # No target yet, pass
    else:
        check_char = char

    # Location/npcPresent always use actor's position
    if ctype == ConditionType.LOCATION:
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

    if ctype == ConditionType.NPC_PRESENT:
        return _check_npc_present(char, game_state, cond.get("npcId"))

    if ctype == ConditionType.NPC_ABSENT:
        return not _check_npc_present(char, game_state, cond.get("npcId"))

    # Time is global, not character-specific
    if ctype == ConditionType.TIME:
        time = game_state.time
        hour_min = cond.get("hourMin")
        hour_max = cond.get("hourMax")
        if hour_min is not None and hour_max is not None:
            if hour_min <= hour_max:
                if not (hour_min <= time.hour <= hour_max):
                    return False
            else:  # cross-midnight: e.g. 22~4 means 22:00–04:00
                if not (time.hour >= hour_min or time.hour <= hour_max):
                    return False
        elif hour_min is not None:
            if time.hour < hour_min:
                return False
        elif hour_max is not None:
            if time.hour > hour_max:
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
    if ctype == ConditionType.RESOURCE:
        res = check_char.get("resources", {}).get(cond.get("key", ""))
        if not res:
            return False
        return _compare(res["value"], cond.get("op", ">="), cond_value)

    if ctype == ConditionType.ABILITY:
        for ab in check_char.get("abilities", []):
            if ab["key"] == cond.get("key"):
                return _compare(ab["exp"], cond.get("op", ">="), cond_value)
        return False

    if ctype == ConditionType.BASIC_INFO:
        info = check_char.get("basicInfo", {}).get(cond.get("key", ""))
        if not info or info.get("type") != "number":
            return False
        return _compare(info["value"], cond.get("op", ">="), cond_value)

    if ctype == ConditionType.TRAIT:
        key = cond.get("key", "")
        trait_id = cond.get("traitId", "")
        # Use character_data for raw trait IDs (display state has resolved names)
        check_char_id = char_id if cond.get("condTarget", CondTarget.SELF) == CondTarget.SELF else (target_id or "")
        raw_traits = game_state.character_data.get(check_char_id, {}).get("traits", {})
        if isinstance(raw_traits, dict):
            return trait_id in raw_traits.get(key, [])
        # Fallback: list format (display state)
        for trait in check_char.get("traits", []):
            if trait["key"] == key:
                return trait_id in trait.get("values", [])
        return False

    if ctype == ConditionType.NO_TRAIT:
        key = cond.get("key", "")
        trait_id = cond.get("traitId", "")
        check_char_id = char_id if cond.get("condTarget", CondTarget.SELF) == CondTarget.SELF else (target_id or "")
        raw_traits = game_state.character_data.get(check_char_id, {}).get("traits", {})
        if isinstance(raw_traits, dict):
            return trait_id not in raw_traits.get(key, [])
        for trait in check_char.get("traits", []):
            if trait["key"] == key:
                return trait_id not in trait.get("values", [])
        return True

    if ctype == ConditionType.EXPERIENCE:
        key = cond.get("key", "")
        check_char_id = char_id if cond.get("condTarget", CondTarget.SELF) == CondTarget.SELF else (target_id or "")
        char_data = game_state.character_data.get(check_char_id, {})
        exp_data = char_data.get("experiences", {}).get(key, {})
        count = exp_data.get("count", 0) if isinstance(exp_data, dict) else 0
        return _compare(count, cond.get("op", ">="), cond_value)

    if ctype == ConditionType.FAVORABILITY:
        # favFrom/favTo: "self" = actor, "{{targetId}}" = action target
        fav_from = cond.get("favFrom", CondTarget.SELF)
        fav_to = cond.get("favTo", "{{targetId}}")
        # Legacy: condTarget + targetId → favFrom/favTo
        if "targetId" in cond and "favFrom" not in cond:
            ct = cond.get("condTarget", CondTarget.SELF)
            if ct == CondTarget.TARGET:
                fav_from = "{{targetId}}"
                fav_to = CondTarget.SELF
            else:
                fav_from = CondTarget.SELF
                fav_to = cond.get("targetId", "{{targetId}}")
        from_id = _resolve_fav_id(fav_from, char_id, target_id, game_state)
        to_id = _resolve_fav_id(fav_to, char_id, target_id, game_state)
        from_char = game_state.characters.get(from_id, {})
        fav_data = from_char.get("favorability", [])
        fav_value = 0
        if isinstance(fav_data, list):
            for fav in fav_data:
                if fav["id"] == to_id:
                    fav_value = fav["value"]
                    break
        elif isinstance(fav_data, dict):
            fav_value = fav_data.get(to_id, 0)
        return _compare(fav_value, cond.get("op", ">="), cond_value)

    if ctype == ConditionType.OUTFIT:
        outfit_id = cond.get("outfitId", "")
        check_char_id = char_id if cond.get("condTarget", CondTarget.SELF) == CondTarget.SELF else (target_id or "")
        char_data = game_state.character_data.get(check_char_id, {})
        return char_data.get("currentOutfit", "default") == outfit_id

    if ctype == ConditionType.HAS_ITEM:
        item_id = cond.get("itemId")
        tag = cond.get("tag")
        has_op = cond.get("op")
        has_value = cond_value if cond.get("value") is not None else None
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

    if ctype == ConditionType.CLOTHING:
        slot = cond.get("slot", "")
        expected_state = cond.get("state")
        expected_item = cond.get("itemId")
        for cl in check_char.get("clothing", []):
            if cl["slot"] == slot:
                if expected_item:
                    if cl.get("itemId") != expected_item:
                        return False
                if expected_state:
                    if expected_state == ClothingState.EMPTY:
                        return cl.get("itemId") is None
                    return cl.get("state") == expected_state
                # No state specified, just check item match (already passed above)
                return True
        return False

    if ctype == ConditionType.VARIABLE:
        var_id = cond.get("varId", "")
        if not var_id or not hasattr(game_state, "variable_defs"):
            return False
        var_def = game_state.variable_defs.get(var_id)
        if not var_def:
            return False
        from ..variable_engine import evaluate_variable

        # For bidirectional variables: self=check_char, target=the other character
        cond_target = cond.get("condTarget", CondTarget.SELF)
        if cond_target == CondTarget.TARGET:
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
        return _compare(var_value, cond.get("op", ">="), cond_value)

    if ctype == ConditionType.WORLD_VAR:
        key = cond.get("key", "")
        wv = getattr(game_state, "world_variables", {})
        val = wv.get(key, 0)
        return _compare(val, cond.get("op", "=="), cond_value)

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


def _resolve_cond_value(
    raw: Any, game_state: Any, char_id: str, target_id: str | None
) -> float:
    """Resolve a condition comparison value — number or {varId, multiply} variable ref."""
    if isinstance(raw, dict):
        var_id = raw.get("varId", "")
        multiply = raw.get("multiply", 1)
        if var_id and hasattr(game_state, "variable_defs"):
            var_def = game_state.variable_defs.get(var_id)
            if var_def:
                from ..variable_engine import evaluate_variable

                char = game_state.characters.get(char_id, {})
                target = game_state.characters.get(target_id, {}) if target_id else None
                val = evaluate_variable(
                    var_def, char, game_state.variable_defs,
                    target_state=target, game_state=game_state,
                    char_id=char_id, target_id=target_id,
                )
                return val * multiply
        return 0.0
    return float(raw) if raw is not None else 0.0


def _compare(left: float, op: str, right: float) -> bool:
    """Compare two values with given operator."""
    if op == CompareOp.GTE:
        return left >= right
    if op == CompareOp.LTE:
        return left <= right
    if op == CompareOp.GT:
        return left > right
    if op == CompareOp.LT:
        return left < right
    if op == CompareOp.EQ:
        return left == right
    if op == CompareOp.NE:
        return left != right
    return False


def _check_costs(costs: list[dict], char: dict) -> tuple[bool, str]:
    """Check if character can afford all costs. Returns (enabled, reason)."""
    for cost in costs:
        ctype = cost.get("type")
        amount = cost.get("amount", 0)

        if ctype == CostType.RESOURCE:
            res = char.get("resources", {}).get(cost.get("key", ""))
            if not res or res["value"] < amount:
                label = res["label"] if res else cost.get("key", "")
                return False, f"{label}不足"

        elif ctype == CostType.BASIC_INFO:
            info = char.get("basicInfo", {}).get(cost.get("key", ""))
            if not info or info["value"] < amount:
                label = info["label"] if info else cost.get("key", "")
                return False, f"{label}不足"

        elif ctype == CostType.ITEM:
            item_id = cost.get("itemId", "")
            found = 0
            for inv in char.get("inventory", []):
                if inv["itemId"] == item_id:
                    found = inv["amount"]
                    break
            if found < amount:
                return False, "物品不足"

    return True, ""
