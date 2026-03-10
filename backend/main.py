"""FastAPI entry point with REST API and WebSocket."""

import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import shutil

from fastapi import Body, FastAPI, File, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from game.state import GameState, list_available_worlds, list_available_addons, list_available_games
from game.action import get_available_actions, execute_action
from game.map_engine import compile_grid
from game.addon_loader import (
    ADDONS_DIR, OVERLAY_SOURCE, get_addon_dir, create_custom_addon,
    build_addon_dirs, list_backups as _list_backups, restore_backup as _restore_backup,
)

CONFIG_PATH = Path(__file__).parent.parent / "config.json"


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_last_world(world_id: str) -> None:
    """Persist lastWorldId to config.json."""
    config = load_config()
    config["lastWorldId"] = world_id
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


# WebSocket connection manager
class ConnectionManager:
    def __init__(self) -> None:
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.connections.remove(ws)

    async def broadcast(self, data: dict) -> None:
        for ws in self.connections:
            try:
                await ws.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()
game_state: Optional[GameState] = None


def _write_source() -> str:
    """Get the current source tag for CRUD writes."""
    return game_state.write_target_id or OVERLAY_SOURCE


async def _mark_dirty() -> None:
    """Mark session as having unsaved changes and notify clients."""
    game_state.dirty = True
    await manager.broadcast({"type": "dirty_update", "dirty": True})


@asynccontextmanager
async def lifespan(app: FastAPI):
    global game_state
    from game.addon_loader import save_world_config, WORLDS_DIR
    game_state = GameState()

    config = load_config()
    last_world_id = config.get("lastWorldId", "")
    worlds = list_available_worlds()
    world_ids = [w["id"] for w in worlds]

    if last_world_id and last_world_id in world_ids:
        game_state.load_world(last_world_id)
        print(f"Resumed last world: {game_state.world_name}")
    elif not worlds:
        # No worlds exist at all — auto-create a default world
        from game.addon_loader import create_custom_addon
        default_id = "default"
        default_name = "默认世界"
        custom_id = create_custom_addon(default_id, [])
        custom_ref = {"id": custom_id, "version": "1.0.0"}
        default_config = {
            "id": default_id,
            "name": default_name,
            "addons": [custom_ref],
            "writeTarget": custom_id,
            "playerCharacter": "",
        }
        save_world_config(default_id, default_config)
        game_state.load_world(default_id)
        _save_last_world(default_id)
        print(f"Auto-created default world: {default_name}")
    else:
        game_state.load_empty()
        print("Started with empty world")

    yield


app = FastAPI(title="AI Tavern Game", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- REST API ---


@app.get("/api/config")
async def get_config():
    """Get frontend-relevant config."""
    config = load_config()
    return {"maxWidth": config.get("maxWidth", 1200)}


@app.get("/api/worlds")
async def get_worlds():
    """List all available worlds."""
    return {"worlds": list_available_worlds()}


@app.get("/api/addons")
async def get_addons():
    """List all installed addons."""
    return {"addons": list_available_addons()}


class SelectWorldRequest(BaseModel):
    worldId: str


@app.post("/api/worlds/select")
async def select_world(req: SelectWorldRequest):
    """Switch to a different world."""
    worlds = list_available_worlds()
    world_ids = [w["id"] for w in worlds]
    if req.worldId not in world_ids:
        return {"success": False, "message": f"World '{req.worldId}' not found"}

    game_state.load_world(req.worldId)
    _save_last_world(req.worldId)

    # Broadcast game change to all WebSocket clients
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})

    return {"success": True, "message": f"Switched to {game_state.world_name}"}


@app.post("/api/worlds/unload")
async def unload_world():
    """Switch to empty world (no world loaded)."""
    game_state.load_empty()
    _save_last_world("")

    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})
    return {"success": True}


class UpdateSessionAddonsRequest(BaseModel):
    addons: list


@app.put("/api/session/addons")
async def update_session_addons(req: UpdateSessionAddonsRequest):
    """Update addon list for current session.

    In world mode: stages the change (does NOT reload — use apply-changes).
    In empty mode: immediately reloads with new addons.
    """
    if game_state.world_id:
        # In a saved world - stage the change (just update refs, don't reload)
        game_state.addon_refs = req.addons
        return {"success": True, "staged": True}
    else:
        # Empty world - immediate reload
        game_state.load_session_addons(req.addons)
        state = game_state.get_full_state()
        await manager.broadcast({"type": "game_changed", "data": state})
        return {"success": True, "staged": False}


@app.get("/api/session")
async def get_session():
    """Get current session info."""
    return {
        "worldId": game_state.world_id,
        "worldName": game_state.world_name,
        "addons": game_state.addon_refs,
        "writeTarget": game_state.write_target_id,
        "playerCharacter": game_state.player_character,
        "dirty": game_state.dirty,
    }


class CreateWorldRequest(BaseModel):
    id: str
    name: str
    addons: list


@app.post("/api/worlds")
async def create_world(req: CreateWorldRequest):
    """Create a new world with auto-created custom addon."""
    from game.addon_loader import save_world_config, WORLDS_DIR
    world_dir = WORLDS_DIR / req.id
    if world_dir.exists():
        return {"success": False, "message": f"World '{req.id}' already exists"}

    # Auto-create custom addon
    custom_id = create_custom_addon(req.id, req.addons)
    custom_ref = {"id": custom_id, "version": "1.0.0"}
    addon_list = list(req.addons)
    if not any(r.get("id") == custom_id for r in addon_list if isinstance(r, dict)):
        addon_list.append(custom_ref)

    config = {
        "id": req.id,
        "name": req.name,
        "addons": addon_list,
        "writeTarget": custom_id,
        "playerCharacter": "",
    }
    save_world_config(req.id, config)
    return {"success": True, "message": f"World '{req.name}' created"}


@app.delete("/api/worlds/{world_id}")
async def delete_world(world_id: str):
    """Delete a world."""
    from game.addon_loader import WORLDS_DIR
    import shutil as _shutil
    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return {"success": False, "message": f"World '{world_id}' not found"}
    _shutil.rmtree(world_dir)
    return {"success": True, "message": f"World '{world_id}' deleted"}


@app.put("/api/worlds/{world_id}")
async def update_world(world_id: str):
    """Update existing world config with current session state."""
    from game.addon_loader import load_world_config, save_world_config, WORLDS_DIR
    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return {"success": False, "message": f"World '{world_id}' not found"}
    config = load_world_config(world_id)
    config["addons"] = game_state.addon_refs
    save_world_config(world_id, config)
    return {"success": True, "message": f"World '{world_id}' updated"}


@app.put("/api/worlds/{world_id}/meta")
async def update_world_meta(world_id: str, body: dict = Body(...)):
    """Update world metadata (name, description, cover)."""
    from game.addon_loader import load_world_config, save_world_config, WORLDS_DIR
    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return {"success": False, "message": f"World '{world_id}' not found"}
    config = load_world_config(world_id)
    for key in ("name", "description", "cover"):
        if key in body:
            config[key] = body[key]
    save_world_config(world_id, config)
    # Update in-memory state if this is the current world
    if game_state.world_id == world_id:
        game_state.world_name = config.get("name", game_state.world_name)
    return {"success": True, "message": "World metadata updated"}


@app.put("/api/addon/{addon_id}/{version}/meta")
async def update_addon_meta(addon_id: str, version: str, body: dict = Body(...)):
    """Update addon.json metadata (name, description, author, cover)."""
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.addon_loader import _load_json_safe
    meta_path = addon_dir / "addon.json"
    meta = _load_json_safe(meta_path)
    for key in ("name", "description", "author", "cover"):
        if key in body:
            meta[key] = body[key]
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    return {"success": True, "message": "Addon metadata updated"}


# Legacy game endpoints (redirect to world endpoints)
@app.get("/api/games")
async def get_games():
    """Legacy: list worlds as games."""
    return {"games": list_available_worlds()}


class SelectGameRequest(BaseModel):
    gameId: str


@app.post("/api/games/select")
async def select_game(req: SelectGameRequest):
    """Legacy: switch world."""
    worlds = list_available_worlds()
    world_ids = [w["id"] for w in worlds]
    if req.gameId not in world_ids:
        return {"success": False, "message": f"Game '{req.gameId}' not found"}
    game_state.load_world(req.gameId)
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})
    return {"success": True, "message": f"Switched to {game_state.world_name}"}


@app.post("/api/game/restart")
async def restart_game():
    """Restart current game (reload all data from disk, reset time)."""
    game_state.load_world(game_state.world_id)
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})
    return {"success": True, "message": f"World '{game_state.world_name}' restarted"}


@app.get("/assets/{path:path}")
async def serve_asset(path: str):
    """Serve static assets. Path format: {addonId}/{subfolder}/{filename}."""
    parts = path.split("/", 1)
    if len(parts) == 2:
        addon_id, sub_path = parts
        # Try to serve from specific addon
        addon_dir = get_addon_dir(addon_id)
        file_path = (addon_dir / "assets" / sub_path).resolve()
        if not str(file_path).startswith(str(addon_dir.resolve())):
            return {"error": "Invalid path"}
        if file_path.exists():
            return FileResponse(file_path)

    # Fallback: search all addon directories (legacy paths without addon prefix)
    for _, addon_path in reversed(game_state.addon_dirs):
        assets_dir = addon_path / "assets"
        file_path = (assets_dir / path).resolve()
        if str(file_path).startswith(str(assets_dir.resolve())) and file_path.exists():
            return FileResponse(file_path)

    return {"error": "File not found"}


@app.post("/api/assets/upload")
async def upload_asset(
    file: UploadFile = File(...),
    folder: str = Query(...),
    name: str = Query(...),
    addonId: Optional[str] = Query(None),
):
    """Upload an asset file. folder: 'characters' or 'backgrounds'. name: target filename (without ext)."""
    if folder not in ("characters", "backgrounds"):
        return {"success": False, "message": "Invalid folder"}
    original_name = file.filename or ""
    ext = Path(original_name).suffix.lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        return {"success": False, "message": f"Unsupported file type: {ext}"}

    # Determine target addon directory
    if addonId:
        target_base = get_addon_dir(addonId)
    else:
        target_base = game_state.data_dir  # legacy: last addon

    target_dir = target_base / "assets" / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{name}{ext}"

    with open(target_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {"success": True, "filename": f"{name}{ext}"}


@app.get("/api/game/state")
async def get_game_state():
    """Get the complete game state."""
    return game_state.get_full_state()


class ActionRequest(BaseModel):
    characterId: str
    type: str
    actionId: Optional[str] = None
    targetCell: Optional[int] = None
    targetMap: Optional[str] = None
    targetId: Optional[str] = None


@app.get("/api/game/available-actions/{character_id}")
async def get_actions(character_id: str, target_id: Optional[str] = None):
    """Get available actions for a character."""
    actions = get_available_actions(game_state, character_id, target_id)
    return {"actions": actions}


@app.post("/api/game/action")
async def perform_action(req: ActionRequest):
    """Execute a game action."""
    action_data = {
        "type": req.type,
        "actionId": req.actionId,
        "targetCell": req.targetCell,
        "targetMap": req.targetMap,
        "targetId": req.targetId,
    }
    result = execute_action(game_state, req.characterId, action_data)

    if result.get("success"):
        # Broadcast updated state to all WebSocket clients
        state = game_state.get_full_state()
        await manager.broadcast({"type": "state_update", "data": state})

    return result


# --- Character Config CRUD ---


@app.get("/api/game/definitions")
async def get_definitions():
    """Get template, clothing defs, trait defs, and map summaries for the editor."""
    return game_state.get_definitions()


@app.get("/api/game/characters/config")
async def get_character_configs():
    """Get all character raw JSON configs."""
    return {"characters": list(game_state.character_data.values())}


@app.get("/api/game/characters/config/{character_id}")
async def get_character_config(character_id: str):
    """Get a single character raw JSON config."""
    char = game_state.character_data.get(character_id)
    if not char:
        return {"error": f"Character '{character_id}' not found"}
    return char


@app.put("/api/game/characters/config/{character_id}")
async def update_character_config(character_id: str, body: dict = Body(...)):
    """Update a character config (in memory). Rebuilds runtime state."""
    if character_id not in game_state.character_data:
        return {"success": False, "message": f"Character '{character_id}' not found"}
    body["id"] = character_id
    body["_source"] = _write_source()
    game_state.character_data[character_id] = body
    # Rebuild runtime character state from new data
    game_state.characters[character_id] = game_state._build_char(character_id)
    await _mark_dirty()
    return {"success": True, "message": f"Character '{character_id}' saved"}


@app.post("/api/game/characters/config")
async def create_character_config(body: dict = Body(...)):
    """Create a new character (in memory). Builds runtime state."""
    char_id = body.get("id")
    if not char_id:
        return {"success": False, "message": "Missing character id"}
    if char_id in game_state.character_data:
        return {"success": False, "message": f"Character '{char_id}' already exists"}
    body["_source"] = _write_source()
    game_state.character_data[char_id] = body
    game_state.characters[char_id] = game_state._build_char(char_id)
    await _mark_dirty()
    return {"success": True, "message": f"Character '{char_id}' created"}


@app.patch("/api/game/characters/config/{character_id}")
async def patch_character_config(character_id: str, body: dict = Body(...)):
    """Partial update: toggle isPlayer, active, etc. (in memory)."""
    if character_id not in game_state.character_data:
        return {"success": False, "message": f"Character '{character_id}' not found"}
    char = game_state.character_data[character_id]

    # isPlayer is exclusive — if setting to True, clear all others
    if body.get("isPlayer") is True:
        for cid, cd in game_state.character_data.items():
            if cd.get("isPlayer"):
                cd["isPlayer"] = False
                cd["_source"] = _write_source()

    for key in ("isPlayer", "active"):
        if key in body:
            char[key] = body[key]

    char["_source"] = _write_source()
    # Rebuild runtime for all affected characters
    for cid in game_state.character_data:
        game_state.characters[cid] = game_state._build_char(cid)
    await _mark_dirty()
    return {"success": True, "message": f"Character '{character_id}' updated"}


@app.delete("/api/game/characters/config/{character_id}")
async def delete_character_config(character_id: str):
    """Delete a character (in memory)."""
    if character_id not in game_state.character_data:
        return {"success": False, "message": f"Character '{character_id}' not found"}
    source = game_state.character_data[character_id].get("_source", "")
    if source != _write_source():
        return {"success": False, "message": f"Cannot delete addon entity '{character_id}' (source: {source}). Use addon editor."}
    del game_state.character_data[character_id]
    game_state.characters.pop(character_id, None)
    # Clean up references from other characters
    for cdata in game_state.character_data.values():
        fav = cdata.get("favorability")
        if isinstance(fav, dict):
            fav.pop(character_id, None)
    await _mark_dirty()
    return {"success": True, "message": f"Character '{character_id}' deleted"}


# --- Trait CRUD ---


@app.get("/api/game/traits")
async def get_traits():
    """Get all trait definitions (builtin + game)."""
    return {"traits": list(game_state.trait_defs.values())}


@app.post("/api/game/traits")
async def create_trait(body: dict = Body(...)):
    """Create a new game trait (in memory)."""
    trait_id = body.get("id")
    if not trait_id:
        return {"success": False, "message": "Missing trait id"}
    if trait_id in game_state.trait_defs:
        return {"success": False, "message": f"Trait '{trait_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["source"] = _write_source()
    game_state.trait_defs[trait_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Trait '{trait_id}' created"}


@app.put("/api/game/traits/{trait_id}")
async def update_trait(trait_id: str, body: dict = Body(...)):
    """Update a game trait (in memory)."""
    td = game_state.trait_defs.get(trait_id)
    if not td:
        return {"success": False, "message": f"Trait '{trait_id}' not found"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = trait_id
    entry["source"] = _write_source()
    game_state.trait_defs[trait_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Trait '{trait_id}' updated"}


@app.delete("/api/game/traits/{trait_id}")
async def delete_trait(trait_id: str):
    """Delete a game trait (in memory)."""
    td = game_state.trait_defs.get(trait_id)
    if not td:
        return {"success": False, "message": f"Trait '{trait_id}' not found"}
    source = td.get("source", "")
    if source != _write_source():
        return {"success": False, "message": f"Cannot delete addon entity '{trait_id}' (source: {source}). Use addon editor."}
    del game_state.trait_defs[trait_id]
    await _mark_dirty()
    return {"success": True, "message": f"Trait '{trait_id}' deleted"}


# --- Clothing CRUD ---


@app.get("/api/game/clothing")
async def get_clothing():
    """Get all clothing definitions (builtin + game)."""
    return {"clothing": list(game_state.clothing_defs.values())}


@app.post("/api/game/clothing")
async def create_clothing(body: dict = Body(...)):
    """Create a new game clothing item (in memory)."""
    item_id = body.get("id")
    if not item_id:
        return {"success": False, "message": "Missing clothing id"}
    if item_id in game_state.clothing_defs:
        return {"success": False, "message": f"Clothing '{item_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["source"] = _write_source()
    game_state.clothing_defs[item_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Clothing '{item_id}' created"}


@app.put("/api/game/clothing/{item_id}")
async def update_clothing(item_id: str, body: dict = Body(...)):
    """Update a game clothing item (in memory)."""
    cd = game_state.clothing_defs.get(item_id)
    if not cd:
        return {"success": False, "message": f"Clothing '{item_id}' not found"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["source"] = _write_source()
    game_state.clothing_defs[item_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Clothing '{item_id}' updated"}


@app.delete("/api/game/clothing/{item_id}")
async def delete_clothing(item_id: str):
    """Delete a game clothing item (in memory)."""
    cd = game_state.clothing_defs.get(item_id)
    if not cd:
        return {"success": False, "message": f"Clothing '{item_id}' not found"}
    source = cd.get("source", "")
    if source != _write_source():
        return {"success": False, "message": f"Cannot delete addon entity '{item_id}' (source: {source}). Use addon editor."}
    del game_state.clothing_defs[item_id]
    await _mark_dirty()
    return {"success": True, "message": f"Clothing '{item_id}' deleted"}


# --- Item CRUD ---


@app.get("/api/game/items")
async def get_items():
    """Get all item definitions (builtin + game)."""
    items = []
    for d in game_state.item_defs.values():
        item = {**d}
        item.setdefault("tags", [])
        item.setdefault("description", "")
        item.setdefault("maxStack", 1)
        item.setdefault("sellable", True)
        item.setdefault("price", 0)
        items.append(item)
    return {"items": items}


@app.post("/api/game/items")
async def create_item(body: dict = Body(...)):
    """Create a new game item (in memory)."""
    item_id = body.get("id")
    if not item_id:
        return {"success": False, "message": "Missing item id"}
    if item_id in game_state.item_defs:
        return {"success": False, "message": f"Item '{item_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["source"] = _write_source()
    game_state.item_defs[item_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Item '{item_id}' created"}


@app.put("/api/game/items/{item_id}")
async def update_item(item_id: str, body: dict = Body(...)):
    """Update a game item (in memory)."""
    item_def = game_state.item_defs.get(item_id)
    if not item_def:
        return {"success": False, "message": f"Item '{item_id}' not found"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["source"] = _write_source()
    game_state.item_defs[item_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Item '{item_id}' updated"}


@app.delete("/api/game/items/{item_id}")
async def delete_item(item_id: str):
    """Delete a game item (in memory)."""
    item_def = game_state.item_defs.get(item_id)
    if not item_def:
        return {"success": False, "message": f"Item '{item_id}' not found"}
    source = item_def.get("source", "")
    if source != _write_source():
        return {"success": False, "message": f"Cannot delete addon entity '{item_id}' (source: {source}). Use addon editor."}
    del game_state.item_defs[item_id]
    await _mark_dirty()
    return {"success": True, "message": f"Item '{item_id}' deleted"}


# --- Item Tag pool ---


@app.get("/api/game/item-tags")
async def get_item_tags():
    """Get item tag pool."""
    return {"tags": game_state.item_tags}


@app.post("/api/game/item-tags")
async def create_item_tag(body: dict = Body(...)):
    """Add a tag to the pool."""
    tag = body.get("tag", "").strip()
    if not tag:
        return {"success": False, "message": "Tag cannot be empty"}
    if tag in game_state.item_tags:
        return {"success": False, "message": f"Tag '{tag}' already exists"}
    game_state.item_tags.append(tag)
    await _mark_dirty()
    return {"success": True, "message": f"Tag '{tag}' added"}


@app.delete("/api/game/item-tags/{tag}")
async def delete_item_tag(tag: str):
    """Remove a tag from the pool."""
    if tag not in game_state.item_tags:
        return {"success": False, "message": f"Tag '{tag}' not found"}
    game_state.item_tags.remove(tag)
    await _mark_dirty()
    return {"success": True, "message": f"Tag '{tag}' deleted"}


# --- Action CRUD ---


@app.get("/api/game/actions")
async def get_actions_defs():
    """Get all action definitions (builtin + game)."""
    return {"actions": list(game_state.action_defs.values())}


@app.post("/api/game/actions")
async def create_action_def(body: dict = Body(...)):
    """Create a new game action (in memory)."""
    action_id = body.get("id")
    if not action_id:
        return {"success": False, "message": "Missing action id"}
    if action_id in game_state.action_defs:
        return {"success": False, "message": f"Action '{action_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["source"] = _write_source()
    game_state.action_defs[action_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Action '{action_id}' created"}


@app.put("/api/game/actions/{action_id}")
async def update_action_def(action_id: str, body: dict = Body(...)):
    """Update a game action (in memory)."""
    action_def = game_state.action_defs.get(action_id)
    if not action_def:
        return {"success": False, "message": f"Action '{action_id}' not found"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = action_id
    entry["source"] = _write_source()
    game_state.action_defs[action_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Action '{action_id}' updated"}


@app.delete("/api/game/actions/{action_id}")
async def delete_action_def(action_id: str):
    """Delete a game action (in memory)."""
    action_def = game_state.action_defs.get(action_id)
    if not action_def:
        return {"success": False, "message": f"Action '{action_id}' not found"}
    source = action_def.get("source", "")
    if source != _write_source():
        return {"success": False, "message": f"Cannot delete addon entity '{action_id}' (source: {source}). Use addon editor."}
    del game_state.action_defs[action_id]
    await _mark_dirty()
    return {"success": True, "message": f"Action '{action_id}' deleted"}


# --- Trait Group CRUD ---


@app.get("/api/game/trait-groups")
async def get_trait_groups():
    """Get all trait group definitions (builtin + game)."""
    return {"traitGroups": list(game_state.trait_groups.values())}


@app.post("/api/game/trait-groups")
async def create_trait_group(body: dict = Body(...)):
    """Create a new game trait group (in memory)."""
    group_id = body.get("id")
    if not group_id:
        return {"success": False, "message": "Missing group id"}
    if group_id in game_state.trait_groups:
        return {"success": False, "message": f"Trait group '{group_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["source"] = _write_source()
    game_state.trait_groups[group_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Trait group '{group_id}' created"}


@app.put("/api/game/trait-groups/{group_id}")
async def update_trait_group(group_id: str, body: dict = Body(...)):
    """Update a game trait group (in memory)."""
    tg = game_state.trait_groups.get(group_id)
    if not tg:
        return {"success": False, "message": f"Trait group '{group_id}' not found"}
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = group_id
    entry["source"] = _write_source()
    game_state.trait_groups[group_id] = entry
    await _mark_dirty()
    return {"success": True, "message": f"Trait group '{group_id}' updated"}


@app.delete("/api/game/trait-groups/{group_id}")
async def delete_trait_group(group_id: str):
    """Delete a game trait group (in memory)."""
    tg = game_state.trait_groups.get(group_id)
    if not tg:
        return {"success": False, "message": f"Trait group '{group_id}' not found"}
    source = tg.get("source", "")
    if source != _write_source():
        return {"success": False, "message": f"Cannot delete addon entity '{group_id}' (source: {source}). Use addon editor."}
    del game_state.trait_groups[group_id]
    await _mark_dirty()
    return {"success": True, "message": f"Trait group '{group_id}' deleted"}


# --- Map CRUD ---


@app.get("/api/game/maps/raw")
async def get_maps_raw():
    """Get list of all maps (id + name only)."""
    result = []
    for map_id, map_data in game_state.maps.items():
        result.append({"id": map_data["id"], "name": map_data["name"]})
    return {"maps": result}


@app.get("/api/game/maps/raw/{map_id}")
async def get_map_raw(map_id: str):
    """Get full raw map data (grid + cells + metadata) without compiled fields."""
    map_data = game_state.maps.get(map_id)
    if not map_data:
        return {"error": f"Map '{map_id}' not found"}
    return {k: v for k, v in map_data.items() if k not in ("compiled_grid", "cell_index")}


class CreateMapRequest(BaseModel):
    id: str
    name: str
    rows: int
    cols: int


@app.post("/api/game/maps")
async def create_map_endpoint(req: CreateMapRequest):
    """Create a new empty map (in memory)."""
    if req.id in game_state.maps:
        return {"success": False, "message": f"Map '{req.id}' already exists"}
    grid = [["" for _ in range(req.cols)] for _ in range(req.rows)]
    map_data = {
        "id": req.id,
        "name": req.name,
        "defaultColor": "#FFFFFF",
        "grid": grid,
        "cells": [],
        "_source": _write_source(),
    }
    map_data["compiled_grid"] = compile_grid(map_data)
    map_data["cell_index"] = {c["id"]: c for c in map_data["cells"]}
    game_state.maps[req.id] = map_data
    from game.map_engine import build_distance_matrix
    game_state.distance_matrix = build_distance_matrix(game_state.maps)
    await _mark_dirty()
    return {"success": True, "message": f"Map '{req.id}' created"}


@app.put("/api/game/maps/raw/{map_id}")
async def update_map_raw(map_id: str, body: dict = Body(...)):
    """Save entire map data (in memory)."""
    if map_id not in game_state.maps:
        return {"success": False, "message": f"Map '{map_id}' not found"}
    body["id"] = map_id
    body["_source"] = _write_source()
    body["compiled_grid"] = compile_grid(body)
    body["cell_index"] = {c["id"]: c for c in body.get("cells", [])}
    game_state.maps[map_id] = body
    from game.map_engine import build_distance_matrix
    game_state.distance_matrix = build_distance_matrix(game_state.maps)
    await _mark_dirty()
    state = game_state.get_full_state()
    await manager.broadcast({"type": "state_update", "data": state})
    return {"success": True, "message": f"Map '{map_id}' saved"}


@app.delete("/api/game/maps/{map_id}")
async def delete_map_endpoint(map_id: str):
    """Delete a map (in memory)."""
    if map_id not in game_state.maps:
        return {"success": False, "message": f"Map '{map_id}' not found"}
    source = game_state.maps[map_id].get("_source", "")
    if source != _write_source():
        return {"success": False, "message": f"Cannot delete addon entity '{map_id}' (source: {source}). Use addon editor."}
    del game_state.maps[map_id]
    from game.map_engine import build_distance_matrix
    game_state.distance_matrix = build_distance_matrix(game_state.maps)
    await _mark_dirty()
    state = game_state.get_full_state()
    await manager.broadcast({"type": "state_update", "data": state})
    return {"success": True, "message": f"Map '{map_id}' deleted"}


@app.get("/api/game/decor-presets")
async def get_decor_presets():
    """Get decoration presets for the map editor."""
    return {"presets": game_state.decor_presets}


@app.put("/api/game/decor-presets")
async def update_decor_presets(body: dict = Body(...)):
    """Save game-specific decor presets (in memory)."""
    presets = body.get("presets", [])
    game_state.decor_presets = presets
    await _mark_dirty()
    return {"success": True, "message": "Decor presets saved"}


@app.post("/api/session/rebuild")
async def rebuild_session(body: dict = Body({})):
    """Rebuild game state from current in-memory definitions.

    If addon list changed, loads new addon files then rebuilds.
    Does NOT write to disk; dirty stays true.
    """
    if not game_state.world_id:
        return {"success": False, "message": "No world loaded"}
    new_addons = body.get("addons")
    new_wt = body.get("writeTarget")
    game_state.rebuild(new_addon_refs=new_addons, new_write_target=new_wt)
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})
    return {"success": True, "message": "已应用世界变更"}


@app.post("/api/session/save")
async def save_session():
    """Rebuild + persist all changes to disk."""
    if not game_state.world_id:
        return {"success": False, "message": "No world loaded. Save as new world first."}
    game_state.save_to_write_target()
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})
    return {"success": True, "message": "已应用并保存世界变更"}


@app.post("/api/session/save-as")
async def save_session_as(body: dict = Body(...)):
    """Create a new world from current in-memory state and save to it."""
    from game.addon_loader import save_world_config, get_world_dir, get_write_target_dir, WORLDS_DIR
    world_id = body.get("id", "").strip()
    world_name = body.get("name", "").strip()
    if not world_id or not world_name:
        return {"success": False, "message": "Missing world id or name"}
    world_dir = WORLDS_DIR / world_id
    if world_dir.exists():
        return {"success": False, "message": f"World '{world_id}' already exists"}

    # Auto-create custom addon for this world
    custom_id = create_custom_addon(world_id, game_state.addon_refs)
    custom_ref = {"id": custom_id, "version": "1.0.0"}
    addon_refs = list(game_state.addon_refs)
    if not any(r.get("id") == custom_id for r in addon_refs):
        addon_refs.append(custom_ref)

    # Create world config
    config = {
        "id": world_id,
        "name": world_name,
        "addons": addon_refs,
        "writeTarget": custom_id,
        "playerCharacter": game_state.player_character,
    }
    save_world_config(world_id, config)

    # Update game state
    game_state.world_id = world_id
    game_state.world_name = world_name
    game_state.game_id = world_id
    game_state.game_name = world_name
    game_state.addon_refs = addon_refs
    game_state.overlay_dir = get_world_dir(world_id)
    game_state.write_target_id = custom_id
    game_state.addon_dirs = build_addon_dirs(addon_refs)
    wt_dir = get_write_target_dir(custom_id, game_state.addon_dirs)
    game_state.write_target_dir = wt_dir if wt_dir else game_state.overlay_dir
    game_state.data_dir = game_state.write_target_dir

    # Re-tag all in-memory entities from old writeTarget (or OVERLAY_SOURCE) to new custom addon
    old_wt = game_state.write_target_id  # previous writeTarget before switching
    _retag_sources = {OVERLAY_SOURCE}
    if old_wt:
        _retag_sources.add(old_wt)
    _new_source = custom_id
    for d in game_state.item_defs.values():
        if d.get("source") in _retag_sources:
            d["source"] = _new_source
    for d in game_state.trait_defs.values():
        if d.get("source") in _retag_sources:
            d["source"] = _new_source
    for d in game_state.clothing_defs.values():
        if d.get("source") in _retag_sources:
            d["source"] = _new_source
    for d in game_state.action_defs.values():
        if d.get("source") in _retag_sources:
            d["source"] = _new_source
    for d in game_state.trait_groups.values():
        if d.get("source") in _retag_sources:
            d["source"] = _new_source
    for cdata in game_state.character_data.values():
        if cdata.get("_source") in _retag_sources:
            cdata["_source"] = _new_source
    for mdata in game_state.maps.values():
        if mdata.get("_source") in _retag_sources:
            mdata["_source"] = _new_source

    game_state.save_to_write_target()
    _save_last_world(world_id)

    # Broadcast updated state
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})

    return {"success": True, "message": f"World '{world_name}' created and saved"}


async def _broadcast_state():
    """Broadcast updated game state to all WebSocket clients."""
    state = game_state.get_full_state()
    await manager.broadcast({"type": "state_update", "data": state})


# --- Apply Changes & Backup ---


@app.post("/api/session/apply-changes")
async def apply_changes(body: dict = Body({})):
    """Apply all staged changes: reload definitions while preserving runtime state.

    Optional body fields:
    - addons: new addon list (if changed)
    - writeTarget: new write target addon ID
    """
    if not game_state.world_id:
        return {"success": False, "message": "No world loaded"}

    new_addons = body.get("addons")
    new_wt = body.get("writeTarget")

    game_state.apply_changes(
        new_addon_refs=new_addons,
        new_write_target=new_wt,
    )

    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})
    return {"success": True, "message": "Changes applied"}


@app.get("/api/session/backups")
async def get_backups():
    """List available backups for current world."""
    if not game_state.world_id:
        return {"backups": []}
    return {"backups": _list_backups(game_state.world_id)}


@app.post("/api/session/restore-backup")
async def restore_backup_endpoint(body: dict = Body(...)):
    """Restore a world backup by timestamp."""
    if not game_state.world_id:
        return {"success": False, "message": "No world loaded"}
    timestamp = body.get("timestamp", "")
    if not timestamp:
        return {"success": False, "message": "Missing timestamp"}
    ok = _restore_backup(game_state.world_id, timestamp)
    if not ok:
        return {"success": False, "message": f"Backup '{timestamp}' not found"}
    # Reload world from disk after restore
    game_state.load_world(game_state.world_id)
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})
    return {"success": True, "message": f"Restored backup from {timestamp}"}


# --- WebSocket ---


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        # Send initial state
        state = game_state.get_full_state()
        await ws.send_json({"type": "state_update", "data": state})

        # Keep connection alive, listen for pings
        while True:
            data = await ws.receive_text()
            # Simple ping/pong
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(ws)


# --- Addon Editor API ---


def _load_addon_entities(addon_id: str, version: str):
    """Load all entities from an addon + its dependencies.

    Returns dict with all entity categories, each entry tagged with source.
    Also includes which IDs are overrides (same ID exists in a dependency).
    """
    from game.addon_loader import get_addon_version_dir, _load_json_safe
    from game.character import (
        load_trait_defs, load_clothing_defs, load_item_defs,
        load_item_tags, load_action_defs, load_trait_groups, load_characters,
    )
    from game.map_engine import load_map_collection

    addon_dir = get_addon_version_dir(addon_id, version)
    if not addon_dir.exists():
        return None

    # Load addon.json metadata
    meta = _load_json_safe(addon_dir / "addon.json")
    deps = meta.get("dependencies", [])

    # Build addon_dirs for dependencies only (for read-only context)
    dep_dirs = build_addon_dirs(deps)

    # Load dependency entities
    dep_traits = load_trait_defs(dep_dirs) if dep_dirs else {}
    dep_clothing = load_clothing_defs(dep_dirs) if dep_dirs else {}
    dep_items = load_item_defs(dep_dirs) if dep_dirs else {}
    dep_actions = load_action_defs(dep_dirs) if dep_dirs else {}
    dep_groups = load_trait_groups(dep_dirs) if dep_dirs else {}
    dep_characters = load_characters(dep_dirs) if dep_dirs else {}
    dep_maps_data = load_map_collection(dep_dirs) if dep_dirs else {"maps": {}}

    # Load this addon's own entities (single addon dir)
    own_dirs = [(addon_id, addon_dir)]
    own_traits = load_trait_defs(own_dirs)
    own_clothing = load_clothing_defs(own_dirs)
    own_items = load_item_defs(own_dirs)
    own_actions = load_action_defs(own_dirs)
    own_groups = load_trait_groups(own_dirs)
    own_characters = load_characters(own_dirs)
    own_maps_data = load_map_collection(own_dirs)
    own_item_tags = load_item_tags(own_dirs)

    # Detect overrides: own IDs that also exist in dependencies
    def find_overrides(own: dict, deps: dict) -> list[str]:
        return [eid for eid in own if eid in deps]

    return {
        "meta": meta,
        "traits": {
            "own": list(own_traits.values()),
            "deps": list(dep_traits.values()),
            "overrides": find_overrides(own_traits, dep_traits),
        },
        "clothing": {
            "own": list(own_clothing.values()),
            "deps": list(dep_clothing.values()),
            "overrides": find_overrides(own_clothing, dep_clothing),
        },
        "items": {
            "own": list(own_items.values()),
            "deps": list(dep_items.values()),
            "overrides": find_overrides(own_items, dep_items),
        },
        "actions": {
            "own": list(own_actions.values()),
            "deps": list(dep_actions.values()),
            "overrides": find_overrides(own_actions, dep_actions),
        },
        "traitGroups": {
            "own": list(own_groups.values()),
            "deps": list(dep_groups.values()),
            "overrides": find_overrides(own_groups, dep_groups),
        },
        "characters": {
            "own": list(own_characters.values()),
            "deps": list(dep_characters.values()),
            "overrides": find_overrides(own_characters, dep_characters),
        },
        "maps": {
            "own": [
                {k: v for k, v in m.items() if k not in ("compiled_grid", "cell_index")}
                for m in own_maps_data["maps"].values()
            ],
            "deps": [
                {k: v for k, v in m.items() if k not in ("compiled_grid", "cell_index")}
                for m in dep_maps_data["maps"].values()
            ],
            "overrides": find_overrides(own_maps_data["maps"], dep_maps_data["maps"]),
        },
        "itemTags": own_item_tags,
    }


@app.get("/api/addon/{addon_id}/{version}/data")
async def get_addon_data(addon_id: str, version: str):
    """Load all entities from an addon + its dependency context."""
    data = _load_addon_entities(addon_id, version)
    if data is None:
        return {"error": f"Addon '{addon_id}@{version}' not found"}
    return data


def _get_addon_dir_or_404(addon_id: str, version: str):
    """Get addon directory, return None if not found."""
    from game.addon_loader import get_addon_version_dir
    d = get_addon_version_dir(addon_id, version)
    return d if d.exists() else None


# --- Addon Trait CRUD ---

@app.post("/api/addon/{addon_id}/{version}/traits")
async def addon_create_trait(addon_id: str, version: str, body: dict = Body(...)):
    """Create a trait in an addon (writes directly to file)."""
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    trait_id = body.get("id")
    if not trait_id:
        return {"success": False, "message": "Missing trait id"}
    from game.character import load_trait_defs, save_trait_defs_file
    existing = load_trait_defs([(addon_id, addon_dir)])
    if trait_id in existing:
        return {"success": False, "message": f"Trait '{trait_id}' already exists in this addon"}
    entry = {k: v for k, v in body.items() if k != "source"}
    all_traits = [
        {k: v for k, v in t.items() if k != "source"}
        for t in existing.values()
    ]
    all_traits.append(entry)
    save_trait_defs_file(addon_dir, all_traits)
    await _mark_dirty()
    return {"success": True, "message": f"Trait '{trait_id}' created"}


@app.put("/api/addon/{addon_id}/{version}/traits/{trait_id}")
async def addon_update_trait(addon_id: str, version: str, trait_id: str, body: dict = Body(...)):
    """Update a trait in an addon (writes directly to file)."""
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_trait_defs, save_trait_defs_file
    existing = load_trait_defs([(addon_id, addon_dir)])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = trait_id
    all_traits = []
    for t in existing.values():
        clean = {k: v for k, v in t.items() if k != "source"}
        if clean["id"] == trait_id:
            all_traits.append(entry)
        else:
            all_traits.append(clean)
    if trait_id not in existing:
        all_traits.append(entry)
    save_trait_defs_file(addon_dir, all_traits)
    await _mark_dirty()
    return {"success": True, "message": f"Trait '{trait_id}' updated"}


@app.delete("/api/addon/{addon_id}/{version}/traits/{trait_id}")
async def addon_delete_trait(addon_id: str, version: str, trait_id: str):
    """Delete a trait from an addon (writes directly to file)."""
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_trait_defs, save_trait_defs_file
    existing = load_trait_defs([(addon_id, addon_dir)])
    if trait_id not in existing:
        return {"success": False, "message": f"Trait '{trait_id}' not found"}
    all_traits = [
        {k: v for k, v in t.items() if k != "source"}
        for t in existing.values() if t["id"] != trait_id
    ]
    save_trait_defs_file(addon_dir, all_traits)
    await _mark_dirty()
    return {"success": True, "message": f"Trait '{trait_id}' deleted"}


# --- Addon Trait Group CRUD ---

@app.post("/api/addon/{addon_id}/{version}/trait-groups")
async def addon_create_trait_group(addon_id: str, version: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    group_id = body.get("id")
    if not group_id:
        return {"success": False, "message": "Missing group id"}
    from game.character import load_trait_groups, save_trait_groups_file
    existing = load_trait_groups([(addon_id, addon_dir)])
    if group_id in existing:
        return {"success": False, "message": f"Trait group '{group_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    all_groups = [{k: v for k, v in g.items() if k != "source"} for g in existing.values()]
    all_groups.append(entry)
    save_trait_groups_file(addon_dir, all_groups)
    await _mark_dirty()
    return {"success": True, "message": f"Trait group '{group_id}' created"}


@app.put("/api/addon/{addon_id}/{version}/trait-groups/{group_id}")
async def addon_update_trait_group(addon_id: str, version: str, group_id: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_trait_groups, save_trait_groups_file
    existing = load_trait_groups([(addon_id, addon_dir)])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = group_id
    all_groups = []
    for g in existing.values():
        clean = {k: v for k, v in g.items() if k != "source"}
        if clean["id"] == group_id:
            all_groups.append(entry)
        else:
            all_groups.append(clean)
    if group_id not in existing:
        all_groups.append(entry)
    save_trait_groups_file(addon_dir, all_groups)
    await _mark_dirty()
    return {"success": True, "message": f"Trait group '{group_id}' updated"}


@app.delete("/api/addon/{addon_id}/{version}/trait-groups/{group_id}")
async def addon_delete_trait_group(addon_id: str, version: str, group_id: str):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_trait_groups, save_trait_groups_file
    existing = load_trait_groups([(addon_id, addon_dir)])
    if group_id not in existing:
        return {"success": False, "message": f"Trait group '{group_id}' not found"}
    all_groups = [{k: v for k, v in g.items() if k != "source"} for g in existing.values() if g["id"] != group_id]
    save_trait_groups_file(addon_dir, all_groups)
    await _mark_dirty()
    return {"success": True, "message": f"Trait group '{group_id}' deleted"}


# --- Addon Clothing CRUD ---

@app.post("/api/addon/{addon_id}/{version}/clothing")
async def addon_create_clothing(addon_id: str, version: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    item_id = body.get("id")
    if not item_id:
        return {"success": False, "message": "Missing clothing id"}
    from game.character import load_clothing_defs, save_clothing_defs_file
    existing = load_clothing_defs([(addon_id, addon_dir)])
    if item_id in existing:
        return {"success": False, "message": f"Clothing '{item_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    all_items = [{k: v for k, v in c.items() if k != "source"} for c in existing.values()]
    all_items.append(entry)
    save_clothing_defs_file(addon_dir, all_items)
    await _mark_dirty()
    return {"success": True, "message": f"Clothing '{item_id}' created"}


@app.put("/api/addon/{addon_id}/{version}/clothing/{item_id}")
async def addon_update_clothing(addon_id: str, version: str, item_id: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_clothing_defs, save_clothing_defs_file
    existing = load_clothing_defs([(addon_id, addon_dir)])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    all_items = []
    for c in existing.values():
        clean = {k: v for k, v in c.items() if k != "source"}
        if clean["id"] == item_id:
            all_items.append(entry)
        else:
            all_items.append(clean)
    if item_id not in existing:
        all_items.append(entry)
    save_clothing_defs_file(addon_dir, all_items)
    await _mark_dirty()
    return {"success": True, "message": f"Clothing '{item_id}' updated"}


@app.delete("/api/addon/{addon_id}/{version}/clothing/{item_id}")
async def addon_delete_clothing(addon_id: str, version: str, item_id: str):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_clothing_defs, save_clothing_defs_file
    existing = load_clothing_defs([(addon_id, addon_dir)])
    if item_id not in existing:
        return {"success": False, "message": f"Clothing '{item_id}' not found"}
    all_items = [{k: v for k, v in c.items() if k != "source"} for c in existing.values() if c["id"] != item_id]
    save_clothing_defs_file(addon_dir, all_items)
    await _mark_dirty()
    return {"success": True, "message": f"Clothing '{item_id}' deleted"}


# --- Addon Item CRUD ---

@app.post("/api/addon/{addon_id}/{version}/items")
async def addon_create_item(addon_id: str, version: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    item_id = body.get("id")
    if not item_id:
        return {"success": False, "message": "Missing item id"}
    from game.character import load_item_defs, save_item_defs_file
    existing = load_item_defs([(addon_id, addon_dir)])
    if item_id in existing:
        return {"success": False, "message": f"Item '{item_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    all_items = [{k: v for k, v in d.items() if k != "source"} for d in existing.values()]
    all_items.append(entry)
    save_item_defs_file(addon_dir, all_items)
    await _mark_dirty()
    return {"success": True, "message": f"Item '{item_id}' created"}


@app.put("/api/addon/{addon_id}/{version}/items/{item_id}")
async def addon_update_item(addon_id: str, version: str, item_id: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_item_defs, save_item_defs_file
    existing = load_item_defs([(addon_id, addon_dir)])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    all_items = []
    for d in existing.values():
        clean = {k: v for k, v in d.items() if k != "source"}
        if clean["id"] == item_id:
            all_items.append(entry)
        else:
            all_items.append(clean)
    if item_id not in existing:
        all_items.append(entry)
    save_item_defs_file(addon_dir, all_items)
    await _mark_dirty()
    return {"success": True, "message": f"Item '{item_id}' updated"}


@app.delete("/api/addon/{addon_id}/{version}/items/{item_id}")
async def addon_delete_item(addon_id: str, version: str, item_id: str):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_item_defs, save_item_defs_file
    existing = load_item_defs([(addon_id, addon_dir)])
    if item_id not in existing:
        return {"success": False, "message": f"Item '{item_id}' not found"}
    all_items = [{k: v for k, v in d.items() if k != "source"} for d in existing.values() if d["id"] != item_id]
    save_item_defs_file(addon_dir, all_items)
    await _mark_dirty()
    return {"success": True, "message": f"Item '{item_id}' deleted"}


# --- Addon Action CRUD ---

@app.post("/api/addon/{addon_id}/{version}/actions")
async def addon_create_action(addon_id: str, version: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    action_id = body.get("id")
    if not action_id:
        return {"success": False, "message": "Missing action id"}
    from game.character import load_action_defs, save_action_defs_file
    existing = load_action_defs([(addon_id, addon_dir)])
    if action_id in existing:
        return {"success": False, "message": f"Action '{action_id}' already exists"}
    entry = {k: v for k, v in body.items() if k != "source"}
    all_actions = [{k: v for k, v in a.items() if k != "source"} for a in existing.values()]
    all_actions.append(entry)
    save_action_defs_file(addon_dir, all_actions)
    await _mark_dirty()
    return {"success": True, "message": f"Action '{action_id}' created"}


@app.put("/api/addon/{addon_id}/{version}/actions/{action_id}")
async def addon_update_action(addon_id: str, version: str, action_id: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_action_defs, save_action_defs_file
    existing = load_action_defs([(addon_id, addon_dir)])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = action_id
    all_actions = []
    for a in existing.values():
        clean = {k: v for k, v in a.items() if k != "source"}
        if clean["id"] == action_id:
            all_actions.append(entry)
        else:
            all_actions.append(clean)
    if action_id not in existing:
        all_actions.append(entry)
    save_action_defs_file(addon_dir, all_actions)
    await _mark_dirty()
    return {"success": True, "message": f"Action '{action_id}' updated"}


@app.delete("/api/addon/{addon_id}/{version}/actions/{action_id}")
async def addon_delete_action(addon_id: str, version: str, action_id: str):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    from game.character import load_action_defs, save_action_defs_file
    existing = load_action_defs([(addon_id, addon_dir)])
    if action_id not in existing:
        return {"success": False, "message": f"Action '{action_id}' not found"}
    all_actions = [{k: v for k, v in a.items() if k != "source"} for a in existing.values() if a["id"] != action_id]
    save_action_defs_file(addon_dir, all_actions)
    await _mark_dirty()
    return {"success": True, "message": f"Action '{action_id}' deleted"}


# --- Addon Character CRUD ---

@app.post("/api/addon/{addon_id}/{version}/characters")
async def addon_create_character(addon_id: str, version: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    char_id = body.get("id")
    if not char_id:
        return {"success": False, "message": "Missing character id"}
    chars_dir = addon_dir / "characters"
    char_path = chars_dir / f"{char_id}.json"
    if char_path.exists():
        return {"success": False, "message": f"Character '{char_id}' already exists"}
    chars_dir.mkdir(parents=True, exist_ok=True)
    clean = {k: v for k, v in body.items() if not k.startswith("_")}
    with open(char_path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    await _mark_dirty()
    return {"success": True, "message": f"Character '{char_id}' created"}


@app.put("/api/addon/{addon_id}/{version}/characters/{char_id}")
async def addon_update_character(addon_id: str, version: str, char_id: str, body: dict = Body(...)):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    chars_dir = addon_dir / "characters"
    chars_dir.mkdir(parents=True, exist_ok=True)
    body["id"] = char_id
    clean = {k: v for k, v in body.items() if not k.startswith("_")}
    char_path = chars_dir / f"{char_id}.json"
    with open(char_path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    await _mark_dirty()
    return {"success": True, "message": f"Character '{char_id}' updated"}


@app.delete("/api/addon/{addon_id}/{version}/characters/{char_id}")
async def addon_delete_character(addon_id: str, version: str, char_id: str):
    addon_dir = _get_addon_dir_or_404(addon_id, version)
    if not addon_dir:
        return {"success": False, "message": "Addon not found"}
    char_path = addon_dir / "characters" / f"{char_id}.json"
    if not char_path.exists():
        return {"success": False, "message": f"Character '{char_id}' not found"}
    char_path.unlink()
    await _mark_dirty()
    return {"success": True, "message": f"Character '{char_id}' deleted"}


if __name__ == "__main__":
    import uvicorn
    config = load_config()
    port = config.get("backendPort", 18000)
    import sys
    use_reload = "--reload" in sys.argv
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=use_reload)
