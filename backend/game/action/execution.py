"""Action execution entry point: receive player commands, dispatch to specific executors."""

from __future__ import annotations

from typing import Any

from .conditions import _check_costs, _evaluate_conditions
from .effects import _apply_costs, _apply_effects
from .helpers import _snap_to_tick
from .modifiers import _roll_outcome
from .npc import filter_visible_npc_log, simulate_npc_ticks
from .templates import _resolve_template, _select_output_template


def get_available_actions(game_state: Any, character_id: str, target_id: str | None = None) -> list[dict]:
    """Get list of available actions for a character."""
    char = game_state.characters.get(character_id)
    if not char:
        return []

    actions: list[dict] = []

    # Built-in actions (move, look)
    pos = char["position"]
    from ..map_engine import get_connections

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


def _execute_move(game_state: Any, character_id: str, action: dict) -> dict:
    """Execute a move action."""
    from ..map_engine import validate_move

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
