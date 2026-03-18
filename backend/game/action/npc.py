"""NPC autonomous behavior: decision loop, pathfinding, action execution, sense filtering."""

from __future__ import annotations

import random
from typing import Any

from ..constants import ConditionType, CondTarget, TargetType
from .conditions import _evaluate_conditions
from .effects import _apply_costs, _apply_effects, _check_costs
from .events import evaluate_events
from .helpers import DISTANCE_PENALTY, TICK_MINUTES, _snap_to_tick
from .modifiers import _calc_modifier_bonus, _roll_outcome
from .templates import _resolve_template, _select_output_template


def _split_conditions(conditions: list) -> tuple[dict | None, dict | None, list]:
    """Split conditions into (location_cond, npc_present_cond, hard_conds)."""
    location_cond = None
    npc_present_cond = None
    hard_conds: list[dict] = []
    for item in conditions:
        if (
            isinstance(item, dict)
            and item.get("type") == ConditionType.LOCATION
            and item.get("condTarget", CondTarget.SELF) == CondTarget.SELF
        ):
            location_cond = item
        elif isinstance(item, dict) and item.get("type") == ConditionType.NPC_PRESENT:
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
    from ..character import apply_ability_decay

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
    from ..state import GameState

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
            target_type = action_def.get("targetType", TargetType.NONE)
            _, npc_present_cond, hard_conds = _split_conditions(action_def.get("conditions", []))

            # Hard conditions (self-only check) — early exit
            if hard_conds and not _evaluate_conditions(
                hard_conds, npc, game_state, char_id=npc_id, skip_target_conds=True
            ):
                continue

            if target_type == TargetType.NPC or npc_present_cond:
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
        target_type = action_def.get("targetType", TargetType.NONE)
        conditions = action_def.get("conditions", [])
        _, npc_present_cond, hard_conds = _split_conditions(conditions)

        # Hard conditions (self-only) first
        if hard_conds and not _evaluate_conditions(hard_conds, npc, game_state, char_id=npc_id, skip_target_conds=True):
            continue

        if target_type == TargetType.NPC or npc_present_cond:
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
