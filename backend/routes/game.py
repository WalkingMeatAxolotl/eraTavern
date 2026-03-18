from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

import routes._helpers as _h
from game.action import evaluate_events, execute_action, get_available_actions
from routes._helpers import _ensure_ns

router = APIRouter()


@router.get("/api/game/state")
async def get_game_state():
    """Get the complete game state."""
    return _h.game_state.get_full_state()


class ActionRequest(BaseModel):
    characterId: str
    type: str
    actionId: Optional[str] = None
    targetCell: Optional[int] = None
    targetMap: Optional[str] = None
    targetId: Optional[str] = None
    outfitId: Optional[str] = None
    selections: Optional[dict] = None


@router.get("/api/game/available-actions/{character_id:path}")
async def get_actions(character_id: str, target_id: Optional[str] = None):
    """Get available actions for a character."""
    character_id = _ensure_ns(character_id)
    if target_id:
        target_id = _ensure_ns(target_id)
    actions = get_available_actions(_h.game_state, character_id, target_id)
    return {"actions": actions}


@router.post("/api/game/action")
async def perform_action(req: ActionRequest):
    """Execute a game action."""
    action_data = {
        "type": req.type,
        "actionId": _ensure_ns(req.actionId) if req.actionId else req.actionId,
        "targetCell": req.targetCell,
        "targetMap": _ensure_ns(req.targetMap) if req.targetMap else req.targetMap,
        "targetId": _ensure_ns(req.targetId) if req.targetId else req.targetId,
        "outfitId": req.outfitId,
        "selections": req.selections,
    }
    result = execute_action(_h.game_state, _ensure_ns(req.characterId), action_data)

    if result.get("success"):
        # Evaluate global events after player action
        player_id = _ensure_ns(req.characterId)
        # Evaluate each_character events for the player
        event_results = evaluate_events(_h.game_state, scope_filter="each_character", char_filter=player_id)
        # Evaluate scope=none events (world-level triggers)
        event_results += evaluate_events(_h.game_state, scope_filter="none")
        if event_results:
            event_msgs = [r["output"] for r in event_results if r.get("output")]
            if event_msgs:
                existing_msg = result.get("message", "")
                result["message"] = (
                    existing_msg + "\n" + "\n".join(event_msgs) if existing_msg else "\n".join(event_msgs)
                )
        # Append to action log for LLM / save persistence
        _h.game_state.action_log.append(
            {
                "message": result.get("message", ""),
                "actionId": result.get("actionId", ""),
                "actionName": result.get("actionName", ""),
                "outcomeGrade": result.get("outcomeGrade"),
                "outcomeLabel": result.get("outcomeLabel"),
                "effectsSummary": result.get("effectsSummary", []),
                "npcLog": result.get("npcLog", []),
                "totalDays": _h.game_state.time.total_days,
            }
        )
        # Trim action log to retention limit (30 game days)
        cutoff = _h.game_state.time.total_days - _h.game_state.ACTION_LOG_SAVE_DAYS
        if _h.game_state.action_log and _h.game_state.action_log[0].get("totalDays", 0) < cutoff:
            _h.game_state.action_log = [e for e in _h.game_state.action_log if e.get("totalDays", 0) >= cutoff]
        # Broadcast updated state to all SSE clients
        state = _h.game_state.get_full_state()
        await _h.manager.broadcast("state_update", state)

    return result


@router.get("/api/game/definitions")
async def get_definitions():
    """Get template, clothing defs, trait defs, and map summaries for the editor."""
    return _h.game_state.get_definitions()
