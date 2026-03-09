"""Action system: condition evaluation, cost checking, and execution."""

from __future__ import annotations

from typing import Any


def get_available_actions(
    game_state: Any, character_id: str, target_id: str | None = None
) -> list[dict]:
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
        actions.append({
            "id": "move",
            "name": "移动",
            "type": "move",
            "targets": connections,
        })
        actions.append({
            "id": "look",
            "name": "查看",
            "type": "look",
            "targets": connections,
        })

    # Configured actions from actions.json
    for action_def in game_state.action_defs.values():
        # If target provided, evaluate all conditions; otherwise skip target-dependent ones
        if not _evaluate_conditions(
            action_def.get("conditions", []), char, game_state,
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


def execute_action(
    game_state: Any, character_id: str, action: dict
) -> dict:
    """Execute an action and return the result."""
    action_type = action.get("type")

    if action_type == "move":
        return _execute_move(game_state, character_id, action)

    if action_type == "look":
        return _execute_look(game_state, character_id, action)

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
    conditions: list, char: dict, game_state: Any,
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
    item: dict, char: dict, game_state: Any,
    target_id: str | None = None,
    char_id: str = "",
    depth: int = 0,
) -> bool:
    """Recursively evaluate a condition item (leaf, AND, OR, or NOT)."""
    if depth > 8:
        return False  # prevent infinite recursion
    if "and" in item:
        return all(
            _evaluate_item(c, char, game_state, target_id, char_id, depth + 1)
            for c in item["and"]
        )
    if "or" in item:
        return any(
            _evaluate_item(c, char, game_state, target_id, char_id, depth + 1)
            for c in item["or"]
        )
    if "not" in item:
        return not _evaluate_item(item["not"], char, game_state, target_id, char_id, depth + 1)
    # Leaf condition
    return _evaluate_leaf(item, char, game_state, target_id, char_id)


def _evaluate_leaf(
    cond: dict, char: dict, game_state: Any,
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
        if cell_ids and pos["cellId"] not in cell_ids:
            return False
        return True

    if ctype == "npcPresent":
        return _check_npc_present(char, game_state, cond.get("npcId"))

    if ctype == "npcAbsent":
        return not _check_npc_present(char, game_state, None)

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
        for trait in check_char.get("traits", []):
            if trait["key"] == key:
                return trait_id in trait.get("values", [])
        return False

    if ctype == "noTrait":
        key = cond.get("key", "")
        trait_id = cond.get("traitId", "")
        for trait in check_char.get("traits", []):
            if trait["key"] == key:
                return trait_id not in trait.get("values", [])
        return True

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
        fav_list = check_char.get("favorability", [])
        fav_value = 0
        for fav in fav_list:
            if fav["id"] == fav_tid:
                fav_value = fav["value"]
                break
        return _compare(fav_value, cond.get("op", ">="), cond.get("value", 0))

    if ctype == "hasItem":
        item_id = cond.get("itemId")
        tag = cond.get("tag")
        for inv in check_char.get("inventory", []):
            if item_id and inv["itemId"] == item_id:
                return True
            if tag and tag in inv.get("tags", []):
                return True
            if not item_id and not tag:
                return True
        return False

    if ctype == "clothing":
        slot = cond.get("slot", "")
        expected_state = cond.get("state", "worn")
        for cl in check_char.get("clothing", []):
            if cl["slot"] == slot:
                if expected_state == "empty":
                    return cl.get("itemId") is None
                return cl.get("state") == expected_state
        return False

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
                return False, f"物品不足"

    return True, ""


# ========================
# Template resolution
# ========================

def _resolve_template(
    template: str, char: dict, target_char: dict | None,
    game_state: Any, outcome: dict | None, effects_summary: list[str]
) -> str:
    """Resolve template variables like {{self.clothing.上衣}}."""
    import re

    if not template:
        return ""

    def _char_var(c: dict | None, path: str) -> str:
        """Resolve a character variable path like 'resource.体力', 'clothing.上衣'."""
        if not c:
            return ""
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
                        return name
                    return "无"
            return ""

        if category == "trait":
            for t in c.get("traits", []):
                if t["key"] == key:
                    vals = t.get("values", [])
                    return ", ".join(vals) if vals else "无"
            return ""

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


def simulate_npc_ticks(game_state: Any, elapsed_minutes: int, exclude_id: str = "") -> list[str]:
    """Simulate NPC ticks for elapsed time. Returns activity log lines."""
    ticks = max(1, elapsed_minutes // TICK_MINUTES)
    log: list[str] = []
    for _ in range(ticks):
        for npc_id, npc in list(game_state.characters.items()):
            if npc.get("isPlayer") or npc_id == exclude_id:
                continue
            tick_log = _npc_tick(game_state, npc_id)
            if tick_log:
                log.append(tick_log)
    return log


def _npc_tick(game_state: Any, npc_id: str) -> str | None:
    """Process one tick for a single NPC. Returns activity text or None."""
    import random

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
    """Evaluate all actions and pick the best one for this NPC."""
    import random

    npc = game_state.characters.get(npc_id)
    if not npc:
        return None

    pos = npc["position"]
    pos_key = (pos["mapId"], pos["cellId"])
    dm = getattr(game_state, "distance_matrix", {})
    distances_from_here = dm.get(pos_key, {})

    candidates: list[tuple[float, dict, int, tuple | None, str | None]] = []
    # (effective_desire, action_def, distance, target_pos, target_npc_id)

    for action_def in game_state.action_defs.values():
        npc_weight = action_def.get("npcWeight", 0)
        if npc_weight <= 0:
            continue

        desire = npc_weight + _calc_modifier_bonus(
            action_def.get("npcWeightModifiers", []), npc,
            game_state, npc_id, None
        )
        if desire <= 0:
            continue

        # Evaluate conditions, categorize failures
        target_type = action_def.get("targetType", "none")
        conditions = action_def.get("conditions", [])

        # Try to find a viable way to execute this action
        result = _evaluate_action_viability(
            action_def, conditions, npc, game_state, npc_id,
            pos_key, distances_from_here, target_type
        )
        if result is None:
            continue  # impossible (hard condition failure)

        distance, target_pos, target_npc_id = result
        effective = desire - distance * DISTANCE_PENALTY
        if effective <= 0:
            continue

        # Add random jitter (±10%) to break ties
        jitter = effective * random.uniform(-0.1, 0.1)
        candidates.append((effective + jitter, action_def, distance, target_pos, target_npc_id))

    if not candidates:
        game_state.npc_activities[npc_id] = "待机中"
        return None

    # Sort by effective desire descending, pick the best
    candidates.sort(key=lambda x: -x[0])
    _, best_def, best_dist, target_pos, target_npc_id = candidates[0]

    if best_dist == 0:
        # Can execute immediately
        return _npc_start_action(game_state, npc_id, best_def, target_npc_id)
    else:
        # Need to move first
        game_state.npc_goals[npc_id] = {
            "actionId": best_def["id"],
            "targetPos": {"mapId": target_pos[0], "cellId": target_pos[1]} if target_pos else None,
            "targetNpcId": target_npc_id,
        }
        game_state.npc_activities[npc_id] = f"正在前往..."
        return None


def _evaluate_action_viability(
    action_def: dict, conditions: list, npc: dict, game_state: Any,
    npc_id: str, pos_key: tuple, distances: dict,
    target_type: str,
) -> tuple[int, tuple | None, str | None] | None:
    """Check if an NPC can do this action (possibly after moving).

    Returns (distance, target_pos, target_npc_id) or None if impossible.
    """
    # Separate conditions into location-resolvable and hard requirements
    location_cond = None
    npc_present_cond = None
    hard_conds: list[dict] = []

    for item in conditions:
        # Only handle leaf conditions for location/npcPresent detection
        if isinstance(item, dict) and item.get("type") == "location" and item.get("condTarget", "self") == "self":
            location_cond = item
        elif isinstance(item, dict) and item.get("type") == "npcPresent":
            npc_present_cond = item
        else:
            hard_conds.append(item)

    # Check hard conditions first (can't be solved by moving)
    if hard_conds:
        if not _evaluate_conditions(hard_conds, npc, game_state, char_id=npc_id):
            return None

    # Determine target position and distance
    target_npc_id: str | None = None

    if location_cond:
        target_map = location_cond.get("mapId", "")
        target_cells = location_cond.get("cellIds", [])
        if not target_map:
            return None
        # Find closest matching cell
        best_dist = float("inf")
        best_pos = None
        check_cells = target_cells if target_cells else [
            cid for cid in game_state.maps.get(target_map, {}).get("cell_index", {})
        ]
        for cell_id in check_cells:
            dest_key = (target_map, cell_id)
            if dest_key in distances:
                d = distances[dest_key][0]
                if d < best_dist:
                    best_dist = d
                    best_pos = dest_key
        if best_pos is None:
            return None  # unreachable
        return (int(best_dist), best_pos, None)

    if target_type == "npc" or npc_present_cond:
        # Find an NPC to interact with
        required_npc = npc_present_cond.get("npcId") if npc_present_cond else None
        best_dist = float("inf")
        best_pos = None
        best_npc = None
        for cid, c in game_state.characters.items():
            if cid == npc_id or c.get("isPlayer"):
                continue
            if required_npc and cid != required_npc:
                continue
            cpos = c["position"]
            dest_key = (cpos["mapId"], cpos["cellId"])
            if dest_key in distances:
                d = distances[dest_key][0]
                if d < best_dist:
                    best_dist = d
                    best_pos = dest_key
                    best_npc = cid
        # Also consider player as potential target
        for cid, c in game_state.characters.items():
            if not c.get("isPlayer"):
                continue
            if required_npc and cid != required_npc:
                continue
            cpos = c["position"]
            dest_key = (cpos["mapId"], cpos["cellId"])
            if dest_key in distances:
                d = distances[dest_key][0]
                if d < best_dist:
                    best_dist = d
                    best_pos = dest_key
                    best_npc = cid
        if best_npc is None:
            return None
        target_npc_id = best_npc
        return (int(best_dist), best_pos, target_npc_id)

    # No location/npc requirement — check all conditions at current position
    if not _evaluate_conditions(conditions, npc, game_state, char_id=npc_id):
        return None
    return (0, None, None)


def _npc_start_action(
    game_state: Any, npc_id: str, action_def: dict, target_npc_id: str | None
) -> str | None:
    """Start executing an action for this NPC."""
    npc = game_state.characters.get(npc_id)
    if not npc:
        return None

    # Final condition check
    if not _evaluate_conditions(
        action_def.get("conditions", []), npc, game_state,
        target_id=target_npc_id, char_id=npc_id,
    ):
        game_state.npc_goals.pop(npc_id, None)
        return None

    time_cost = action_def.get("timeCost", TICK_MINUTES)
    busy_ticks = max(1, time_cost // TICK_MINUTES)

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
    action_tpl = action_def.get("outputTemplate", "")
    target_char = game_state.characters.get(target_npc_id) if target_npc_id else None
    activity_text = _resolve_template(action_tpl, npc, target_char, game_state, None, [])
    game_state.npc_activities[npc_id] = activity_text or action_def["name"]

    return None  # Action just started, no completion log yet


def _npc_complete_action(
    game_state: Any, npc_id: str, goal: dict
) -> str | None:
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
    action_tpl = action_def.get("outputTemplate", "")
    outcome_tpl = outcome.get("outputTemplate", "") if outcome else ""
    parts = [p for p in (action_tpl, outcome_tpl) if p]
    template = "\n".join(parts)

    target_char = game_state.characters.get(target_npc_id) if target_npc_id else None
    text = _resolve_template(template, npc, target_char, game_state, outcome, applied)
    game_state.npc_activities[npc_id] = text or action_def["name"]

    return text


def _npc_move_step(
    game_state: Any, npc_id: str, target: dict
) -> bool:
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

def _execute_configured(
    game_state: Any, character_id: str, action_def: dict, action: dict
) -> dict:
    """Execute a configured action from actions.json."""
    import random

    char = game_state.characters.get(character_id)
    if not char:
        return {"success": False, "message": "角色不存在"}

    # Re-check conditions (including target-dependent ones)
    target_id = action.get("targetId")
    if not _evaluate_conditions(
        action_def.get("conditions", []), char, game_state,
        target_id=target_id, char_id=character_id,
    ):
        return {"success": False, "message": "条件不满足"}

    # Re-check costs
    costs = action_def.get("costs", [])
    enabled, reason = _check_costs(costs, char)
    if not enabled:
        return {"success": False, "message": reason}

    # Apply costs
    _apply_costs(costs, char)

    # Advance time
    time_cost = action_def.get("timeCost", 0)
    npc_log: list[str] = []
    if time_cost > 0:
        game_state.time.advance(time_cost)
        npc_log = simulate_npc_ticks(game_state, time_cost, character_id)

    # Roll outcome
    target_id = action.get("targetId")
    outcomes = action_def.get("outcomes", [])
    outcome = _roll_outcome(outcomes, char, game_state, character_id, target_id) if outcomes else None

    # Apply effects
    effects = outcome["effects"] if outcome else []
    applied = _apply_effects(effects, char, game_state, character_id, target_id)

    # Build result text: action template + outcome template
    action_tpl = action_def.get("outputTemplate", "")
    outcome_tpl = outcome.get("outputTemplate", "") if outcome else ""
    parts = [p for p in (action_tpl, outcome_tpl) if p]
    template = "\n".join(parts)

    target_char = game_state.characters.get(target_id) if target_id else None
    text = _resolve_template(template, char, target_char, game_state, outcome, applied)

    result: dict[str, Any] = {
        "success": True,
        "message": text or f"执行了 {action_def['name']}",
        "actionId": action_def["id"],
        "actionName": action_def["name"],
    }
    if outcome:
        result["outcomeGrade"] = outcome.get("grade")
        result["outcomeLabel"] = outcome.get("label")
    if applied:
        result["effectsSummary"] = applied
    if npc_log:
        result["npcLog"] = npc_log

    return result


def _calc_modifier_bonus(
    modifiers: list[dict], char: dict,
    game_state: Any, char_id: str, target_id: str | None
) -> int:
    """Calculate total bonus from a list of modifiers (ability/trait/favorability)."""
    total = 0
    for mod in modifiers:
        mtype = mod.get("type")
        if mtype == "ability":
            for ab in char.get("abilities", []):
                if ab["key"] == mod["key"]:
                    per = mod.get("per", 1)
                    if per > 0:
                        total += (ab["exp"] // per) * mod.get("bonus", 0)
                    break
        elif mtype == "trait":
            # bonus if character has the specified trait value
            trait_key = mod.get("key", "")
            trait_value = mod.get("value", "")
            for t in char.get("traits", []):
                if t["key"] == trait_key and trait_value in t.get("values", []):
                    total += mod.get("bonus", 0)
                    break
        elif mtype == "favorability":
            # Use NPC's favorability towards player (or player towards NPC)
            fav_source = mod.get("source", "target")  # "target" = target's fav towards self
            if fav_source == "target" and target_id:
                npc_data = game_state.character_data.get(target_id, {})
                fav_val = npc_data.get("favorability", {}).get(char_id, 0)
            else:
                own_data = game_state.character_data.get(char_id, {})
                fav_val = own_data.get("favorability", {}).get(target_id or "", 0)
            per = mod.get("per", 1)
            if per > 0:
                total += (fav_val // per) * mod.get("bonus", 0)
    return total


def _roll_outcome(
    outcomes: list[dict], char: dict,
    game_state: Any, char_id: str, target_id: str | None
) -> dict:
    """Roll a weighted random outcome, with modifiers from ability/trait/favorability."""
    import random

    weights = []
    for o in outcomes:
        w = o.get("weight", 1)
        w += _calc_modifier_bonus(
            o.get("weightModifiers", []), char,
            game_state, char_id, target_id
        )
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


def _apply_effects(
    effects: list[dict], char: dict, game_state: Any,
    char_id: str, target_id: str | None
) -> list[str]:
    """Apply effects and return human-readable summaries."""
    summaries: list[str] = []

    for eff in effects:
        etype = eff.get("type")
        target = eff.get("target", "self")
        op = eff.get("op", "add")

        # Resolve target character
        if target == "{{targetId}}" and target_id:
            target_char = game_state.characters.get(target_id)
        elif target == "self" or not target:
            target_char = char
        else:
            # Specific character ID
            target_char = game_state.characters.get(target)

        if not target_char:
            continue

        # Apply valueModifiers to the effect value
        value_mod_bonus = _calc_modifier_bonus(
            eff.get("valueModifiers", []), char,
            game_state, char_id, target_id
        )

        if etype == "resource":
            key = eff.get("key", "")
            value = eff.get("value", 0) + value_mod_bonus
            is_pct = eff.get("valuePercent", False)
            res = target_char.get("resources", {}).get(key)
            if res:
                if op == "add":
                    delta = int(res["value"] * value / 100) if is_pct else value
                    res["value"] = min(res["max"], max(0, res["value"] + delta))
                    suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                    summaries.append(f"{res['label']} {suffix}")
                elif op == "set":
                    new_val = int(res["max"] * value / 100) if is_pct else value
                    res["value"] = min(res["max"], max(0, new_val))
                    suffix = f"{value}{'%' if is_pct else ''}"
                    summaries.append(f"{res['label']} → {suffix}")

        elif etype == "ability":
            key = eff.get("key", "")
            value = eff.get("value", 0) + value_mod_bonus
            is_pct = eff.get("valuePercent", False)
            for ab in target_char.get("abilities", []):
                if ab["key"] == key:
                    if op == "add":
                        delta = int(ab["exp"] * value / 100) if is_pct else value
                        ab["exp"] = max(0, ab["exp"] + delta)
                        suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                        summaries.append(f"{ab['label']} {suffix}")
                    elif op == "set":
                        new_val = int(ab["exp"] * value / 100) if is_pct else value
                        ab["exp"] = max(0, new_val)
                        suffix = f"{value}{'%' if is_pct else ''}"
                        summaries.append(f"{ab['label']} → {suffix}")
                    from .character import exp_to_grade
                    ab["grade"] = exp_to_grade(ab["exp"])
                    break

        elif etype == "basicInfo":
            key = eff.get("key", "")
            value = eff.get("value", 0) + value_mod_bonus
            is_pct = eff.get("valuePercent", False)
            info = target_char.get("basicInfo", {}).get(key)
            if info and info.get("type") == "number":
                if op == "add":
                    delta = int(info["value"] * value / 100) if is_pct else value
                    info["value"] += delta
                    suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                    summaries.append(f"{info['label']} {suffix}")
                elif op == "set":
                    new_val = int(info["value"] * value / 100) if is_pct else value
                    info["value"] = new_val
                    suffix = f"{value}{'%' if is_pct else ''}"
                    summaries.append(f"{info['label']} → {suffix}")

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
                    return target_id or ""
                if val == "{{player}}":
                    for cid, c in game_state.characters.items():
                        if c.get("isPlayer"):
                            return cid
                    return ""
                return val

            fav_from_id = _resolve_fav_id(raw_from)
            fav_to_id = _resolve_fav_id(raw_to)
            if not fav_from_id or not fav_to_id:
                continue

            value = eff.get("value", 0) + value_mod_bonus
            is_pct = eff.get("valuePercent", False)
            # Update: fav_from's favorability towards fav_to
            from_data = game_state.character_data.get(fav_from_id, {})
            fav = from_data.setdefault("favorability", {})
            if op == "add":
                old = fav.get(fav_to_id, 0)
                delta = int(old * value / 100) if is_pct else value
                fav[fav_to_id] = old + delta
                suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                summaries.append(f"好感度 {suffix}")
            elif op == "set":
                old = fav.get(fav_to_id, 0)
                new_val = int(old * value / 100) if is_pct else value
                fav[fav_to_id] = new_val
                suffix = f"{value}{'%' if is_pct else ''}"
                summaries.append(f"好感度 → {suffix}")

        elif etype == "item":
            item_id = eff.get("itemId", "")
            amount = eff.get("amount", 1)
            inventory = target_char.setdefault("inventory", [])
            if op == "addItem":
                found = False
                for inv in inventory:
                    if inv["itemId"] == item_id:
                        inv["amount"] += amount
                        found = True
                        break
                if not found:
                    item_def = game_state.item_defs.get(item_id, {})
                    inventory.append({
                        "itemId": item_id,
                        "name": item_def.get("name", item_id),
                        "tags": item_def.get("tags", []),
                        "amount": amount,
                    })
                summaries.append(f"获得 {item_id} x{amount}")
            elif op == "removeItem":
                for inv in inventory:
                    if inv["itemId"] == item_id:
                        inv["amount"] -= amount
                        if inv["amount"] <= 0:
                            inventory.remove(inv)
                        break
                summaries.append(f"失去 {item_id} x{amount}")

        elif etype == "trait":
            key = eff.get("key", "")
            trait_id = eff.get("traitId", "")
            # Resolve target for trait effects
            trait_target = eff.get("target", "self")
            if trait_target == "{{targetId}}" and target_id:
                t_char_data = game_state.character_data.get(target_id, {})
            elif trait_target == "self" or not trait_target:
                t_char_data = game_state.character_data.get(char_id, {})
            else:
                t_char_data = game_state.character_data.get(trait_target, {})
            traits = t_char_data.get("traits", {})
            if op == "addTrait":
                vals = traits.get(key, [])
                if trait_id not in vals:
                    vals.append(trait_id)
                    traits[key] = vals
                summaries.append(f"获得特质 [{trait_id}]")
            elif op == "removeTrait":
                vals = traits.get(key, [])
                if trait_id in vals:
                    vals.remove(trait_id)
                    traits[key] = vals
                summaries.append(f"失去特质 [{trait_id}]")

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
                if new_state == "empty":
                    item_name = cl[slot].get("itemId", slot)
                    cl[slot] = {"itemId": None, "state": "none"}
                    summaries.append(f"移除 [{item_name}]")
                else:
                    cl[slot]["state"] = new_state
                    item_name = cl[slot].get("itemId", slot)
                    summaries.append(f"[{item_name}] → {new_state}")

        elif etype == "position":
            map_id = eff.get("mapId", "")
            cell_id = eff.get("cellId")
            if not map_id or cell_id is None:
                continue
            # Resolve target character for position change
            pos_target = eff.get("target", "self")
            if pos_target == "{{targetId}}" and target_id:
                pos_char_id = target_id
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
                summaries.append(f"移动到 {cell_name or map_id}")

    return summaries


# ========================
# Built-in: Move
# ========================

def _execute_move(
    game_state: Any, character_id: str, action: dict
) -> dict:
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

    if not validate_move(
        game_state.maps, pos["mapId"], pos["cellId"], target_map, target_cell
    ):
        return {"success": False, "message": "无法移动到目标方格"}

    # Look up travel time from the connection
    travel_time = 10  # default
    current_map_data = game_state.maps.get(pos["mapId"])
    if current_map_data:
        current_cell = current_map_data["cell_index"].get(pos["cellId"])
        if current_cell:
            effective_target_map = target_map or pos["mapId"]
            for conn in current_cell.get("connections", []):
                conn_map = conn.get("targetMap", pos["mapId"])
                if conn_map == effective_target_map and conn["targetCell"] == target_cell:
                    travel_time = conn.get("travelTime", 10)
                    break

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

    # Advance time by travel time
    game_state.time.advance(travel_time)
    npc_log = simulate_npc_ticks(game_state, travel_time, character_id)

    result: dict[str, Any] = {
        "success": True,
        "message": f"移动到了 {cell_name}",
        "newPosition": char["position"],
    }
    if npc_log:
        result["npcLog"] = npc_log
    return result


# ========================
# Built-in: Look
# ========================

def _execute_look(
    game_state: Any, character_id: str, action: dict
) -> dict:
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

    # Build message: location header + each NPC's activity
    lines = [f"在{cell_name}。"]
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
