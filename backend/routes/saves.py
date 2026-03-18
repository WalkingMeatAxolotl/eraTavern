from __future__ import annotations

from fastapi import APIRouter, Body

import routes._helpers as _h
from routes._helpers import _resp

router = APIRouter()


@router.get("/api/saves")
async def list_saves_endpoint():
    """List all save slots for the current world."""
    from game.save_manager import list_saves

    if not _h.game_state.world_id:
        return {"saves": []}
    saves = list_saves(_h.game_state.world_id)
    return {"saves": saves}


@router.post("/api/saves")
async def create_save_endpoint(body: dict = Body(...)):
    """Create or overwrite a save slot."""
    from datetime import datetime

    from game.save_manager import MAX_SLOTS, create_save, list_saves

    if not _h.game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    slot_id = body.get("slotId", "")
    name = body.get("name", "")
    if not slot_id:
        slot_id = "save_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    if not name:
        name = slot_id

    # Check slot limit (only for new saves)
    existing = list_saves(_h.game_state.world_id)
    existing_ids = {m["slotId"] for m in existing}
    if slot_id not in existing_ids and len(existing) >= MAX_SLOTS:
        return _resp(False, "SAVE_SLOTS_FULL", {"max": MAX_SLOTS})

    runtime = _h.game_state.snapshot_save_data()
    time_dict = _h.game_state.time.to_dict()
    meta_info = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "worldId": _h.game_state.world_id,
        "worldName": _h.game_state.world_name,
        "gameTimeDisplay": time_dict.get("displayText", ""),
        "addonRefs": _h.game_state.addon_refs,
    }
    meta = create_save(_h.game_state.world_id, slot_id, name, runtime, meta_info)
    return {"success": True, "meta": meta}


@router.post("/api/saves/{slot_id:path}/load")
async def load_save_endpoint(slot_id: str):
    """Load a save slot: reload world then restore runtime."""
    from game.save_manager import load_save

    if not _h.game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    save_data = load_save(_h.game_state.world_id, slot_id)
    if save_data is None:
        return _resp(False, "SAVE_NOT_FOUND", {"id": slot_id})
    # Reload world from disk (resets everything)
    _h.game_state.load_world(_h.game_state.world_id)
    # Restore runtime from save
    _h.game_state.restore_save_data(save_data["runtime"])
    state = _h.game_state.get_full_state()
    await _h.manager.broadcast("game_changed", state)
    return _resp(True, "SAVE_LOADED", {"id": slot_id})


@router.delete("/api/saves/{slot_id:path}")
async def delete_save_endpoint(slot_id: str):
    """Delete a save slot."""
    from game.save_manager import delete_save

    if not _h.game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    ok = delete_save(_h.game_state.world_id, slot_id)
    if not ok:
        return _resp(False, "SAVE_NOT_FOUND", {"id": slot_id})
    return _resp(True, "SAVE_DELETED", {"id": slot_id})


@router.patch("/api/saves/{slot_id:path}")
async def rename_save_endpoint(slot_id: str, body: dict = Body(...)):
    """Rename a save slot."""
    from game.save_manager import rename_save

    if not _h.game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    name = body.get("name", "")
    if not name:
        return _resp(False, "FIELD_REQUIRED", {"field": "name"})
    ok = rename_save(_h.game_state.world_id, slot_id, name)
    if not ok:
        return _resp(False, "SAVE_NOT_FOUND", {"id": slot_id})
    return _resp(True, "SAVE_RENAMED", {"name": name})
