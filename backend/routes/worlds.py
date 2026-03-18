from __future__ import annotations

"""World and session API routes."""

from fastapi import APIRouter, Body
from pydantic import BaseModel

import routes._helpers as _h
from game.addon_loader import fork_addon_version
from game.character import to_local_id
from game.state import list_available_addons, list_available_worlds
from routes._helpers import _resp, _save_last_world, _validate_id

router = APIRouter()


@router.get("/api/worlds")
async def get_worlds():
    """List all available worlds."""
    return {"worlds": list_available_worlds()}


@router.get("/api/addons")
async def get_addons():
    """List all installed addons."""
    return {"addons": list_available_addons()}


class SelectWorldRequest(BaseModel):
    worldId: str


@router.post("/api/worlds/select")
async def select_world(req: SelectWorldRequest):
    """Switch to a different world."""
    worlds = list_available_worlds()
    world_ids = [w["id"] for w in worlds]
    if req.worldId not in world_ids:
        return _resp(False, "WORLD_NOT_FOUND", {"id": req.worldId})

    _h.game_state.load_world(req.worldId)
    _save_last_world(req.worldId)

    # Broadcast game change to all SSE clients
    state = _h.game_state.get_full_state()
    await _h.manager.broadcast("game_changed", state)

    return _resp(True, "WORLD_SWITCHED", {"name": _h.game_state.world_name})


@router.post("/api/worlds/unload")
async def unload_world():
    """Switch to empty world (no world loaded)."""
    _h.game_state.load_empty()
    _save_last_world("")

    state = _h.game_state.get_full_state()
    await _h.manager.broadcast("game_changed", state)
    return {"success": True}


class UpdateSessionAddonsRequest(BaseModel):
    addons: list


@router.put("/api/session/addons")
async def update_session_addons(req: UpdateSessionAddonsRequest):
    """Update addon list for current session.

    In world mode: stages the change (does NOT reload — use apply-changes).
    In empty mode: immediately reloads with new addons.
    """
    if _h.game_state.world_id:
        # In a saved world - stage the change (just update refs, don't reload)
        _h.game_state.addon_refs = req.addons
        return {"success": True, "staged": True}
    else:
        # Empty world - immediate reload
        _h.game_state.load_session_addons(req.addons)
        state = _h.game_state.get_full_state()
        await _h.manager.broadcast("game_changed", state)
        return {"success": True, "staged": False}


@router.get("/api/session")
async def get_session():
    """Get current session info."""
    return {
        "worldId": _h.game_state.world_id,
        "worldName": _h.game_state.world_name,
        "addons": _h.game_state.addon_refs,
        "playerCharacter": _h.game_state.player_character,
        "dirty": _h.game_state.dirty,
        "llmPreset": _h.game_state.llm_preset,
    }


class CreateWorldRequest(BaseModel):
    id: str
    name: str
    addons: list


@router.post("/api/worlds")
async def create_world(req: CreateWorldRequest):
    """Create a new world. Addon versions will be forked on first load."""
    from game.addon_loader import WORLDS_DIR, save_world_config

    if err := _validate_id(req.id):
        return err
    world_dir = WORLDS_DIR / req.id
    if world_dir.exists():
        return _resp(False, "WORLD_ALREADY_EXISTS", {"id": req.id})

    config = {
        "id": req.id,
        "name": req.name,
        "addons": list(req.addons),
        "playerCharacter": "",
    }
    save_world_config(req.id, config)
    return _resp(True, "WORLD_CREATED", {"name": req.name})


@router.delete("/api/worlds/{world_id}")
async def delete_world(world_id: str):
    """Delete a world."""
    import shutil as _shutil

    from game.addon_loader import WORLDS_DIR

    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return _resp(False, "WORLD_NOT_FOUND", {"id": world_id})
    _shutil.rmtree(world_dir)
    return _resp(True, "WORLD_DELETED", {"id": world_id})


@router.put("/api/worlds/{world_id}")
async def update_world(world_id: str):
    """Update existing world config with current session state."""
    from game.addon_loader import WORLDS_DIR, load_world_config, save_world_config

    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return _resp(False, "WORLD_NOT_FOUND", {"id": world_id})
    config = load_world_config(world_id)
    config["addons"] = _h.game_state.addon_refs
    save_world_config(world_id, config)
    return _resp(True, "WORLD_UPDATED", {"id": world_id})


@router.put("/api/worlds/{world_id}/meta")
async def update_world_meta(world_id: str, body: dict = Body(...)):
    """Update world metadata (name, description, cover)."""
    from game.addon_loader import WORLDS_DIR, load_world_config, save_world_config

    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return _resp(False, "WORLD_NOT_FOUND", {"id": world_id})
    config = load_world_config(world_id)
    for key in ("name", "description", "cover", "llmPreset"):
        if key in body:
            config[key] = body[key]
    save_world_config(world_id, config)
    # Update in-memory state if this is the current world
    if _h.game_state.world_id == world_id:
        _h.game_state.world_name = config.get("name", _h.game_state.world_name)
        _h.game_state.llm_preset = config.get("llmPreset", "")
    return _resp(True, "WORLD_META_UPDATED")


# Legacy game endpoints (redirect to world endpoints)
@router.get("/api/games")
async def get_games():
    """Legacy: list worlds as games."""
    return {"games": list_available_worlds()}


@router.post("/api/game/restart")
async def restart_game():
    """Restart current game (reload all data from disk, reset time)."""
    _h.game_state.load_world(_h.game_state.world_id)
    state = _h.game_state.get_full_state()
    await _h.manager.broadcast("game_changed", state)
    return _resp(True, "WORLD_RESTARTED", {"name": _h.game_state.world_name})


@router.post("/api/session/save")
async def save_session(body: dict = Body({})):
    """Save all changes: rebuild + persist to all addon dirs + clear dirty.

    Optional body: { addons: [...] } to update addon list before saving.
    """
    if not _h.game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    new_addons = body.get("addons")
    _h.game_state.save_all(new_addon_refs=new_addons)
    state = _h.game_state.get_full_state()
    await _h.manager.broadcast("game_changed", state)
    return _resp(True, "SESSION_SAVED")


@router.post("/api/session/save-as")
async def save_session_as(body: dict = Body(...)):
    """Create a new world from current in-memory state, fork addons, and save."""
    from game.addon_loader import WORLDS_DIR, save_world_config

    world_id = body.get("id", "").strip()
    world_name = body.get("name", "").strip()
    if not world_id or not world_name:
        return _resp(False, "FIELD_REQUIRED", {"fields": ["id", "name"]})
    world_dir = WORLDS_DIR / world_id
    if world_dir.exists():
        return _resp(False, "WORLD_ALREADY_EXISTS", {"id": world_id})

    # Fork addon versions for the new world
    new_addon_refs = []
    for ref in _h.game_state.addon_refs:
        if isinstance(ref, dict):
            from game.addon_loader import get_base_version, is_world_fork

            base_ver = (
                get_base_version(ref["version"])
                if is_world_fork(ref["version"], _h.game_state.world_id)
                else ref["version"]
            )
            fork_ver = fork_addon_version(ref["id"], base_ver, world_id)
            new_addon_refs.append({"id": ref["id"], "version": fork_ver})
        else:
            new_addon_refs.append(ref)

    # Create world config
    config = {
        "id": world_id,
        "name": world_name,
        "addons": new_addon_refs,
        "playerCharacter": to_local_id(_h.game_state.player_character),
    }
    save_world_config(world_id, config)

    # Switch to new world
    _h.game_state.load_world(world_id)
    _save_last_world(world_id)

    state = _h.game_state.get_full_state()
    await _h.manager.broadcast("game_changed", state)

    return _resp(True, "WORLD_SAVE_AS_SUCCESS", {"name": world_name})
