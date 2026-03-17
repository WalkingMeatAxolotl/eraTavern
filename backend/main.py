from __future__ import annotations

"""FastAPI entry point with REST API and SSE."""

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import shutil

from fastapi import Body, FastAPI, File, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from game.state import GameState, list_available_worlds, list_available_addons, list_available_games
from game.action import get_available_actions, execute_action, evaluate_events
from game.map_engine import compile_grid
from game.character import namespace_id, to_local_id, get_addon_from_id
from game.addon_loader import (
    ADDONS_DIR, get_addon_dir, fork_addon_version, list_addon_versions,
    list_addon_versions_detail, copy_addon_version, overwrite_addon_version,
    build_addon_dirs,
)
from game.llm_preset import (
    list_presets, load_preset, save_preset, delete_preset,
)
from game.llm_provider import (
    list_providers, load_provider, save_provider, delete_provider,
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


# SSE connection manager
class SSEManager:
    def __init__(self) -> None:
        self.queues: list[asyncio.Queue] = []

    def add(self, queue: asyncio.Queue) -> None:
        self.queues.append(queue)

    def remove(self, queue: asyncio.Queue) -> None:
        if queue in self.queues:
            self.queues.remove(queue)

    async def broadcast(self, event_type: str, data: dict) -> None:
        msg = {"type": event_type, "data": data}
        for q in self.queues:
            try:
                await q.put(msg)
            except Exception:
                pass


def _format_sse(event_type: str, data: dict) -> str:
    """Format a server-sent event string."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_type}\ndata: {payload}\n\n"


manager = SSEManager()
game_state: Optional[GameState] = None


def _validate_id(raw_id: str) -> Optional[dict]:
    """Validate a user-provided entity ID. Returns error response dict or None.

    Accepts both bare IDs ('sword') and namespaced IDs ('base.sword').
    Validates only the local part (after the first dot).
    """
    from game.character import NS_SEP
    if not raw_id:
        return _resp(False, "VALIDATION_ID_EMPTY")
    # Extract local part: 'base.sword' → 'sword', 'sword' → 'sword'
    local = raw_id.split(NS_SEP, 1)[1] if NS_SEP in raw_id else raw_id
    if NS_SEP in local:
        return _resp(False, "VALIDATION_ID_INVALID", {"separator": NS_SEP})
    return None


def _ensure_ns(entity_id: str, source: str = "") -> str:
    """Ensure an entity ID is namespaced. Auto-prefix with source if bare."""
    from game.character import NS_SEP
    if not entity_id or NS_SEP in entity_id:
        return entity_id
    if not source:
        return entity_id  # cannot namespace without a source
    return namespace_id(source, entity_id)


async def _mark_dirty() -> None:
    """Mark session as having unsaved changes and notify clients."""
    game_state.dirty = True
    await manager.broadcast("dirty_update", {"dirty": True})


def _resp(success: bool, error: str, params: Optional[dict] = None, **extra) -> dict:
    """Build a structured API response with error code and params for i18n."""
    result = {"success": success, "error": error}
    if params:
        result["params"] = params
    result.update(extra)
    return result


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
        default_id = "default"
        default_name = "默认世界"
        default_config = {
            "id": default_id,
            "name": default_name,
            "addons": [],
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
    return {
        "maxWidth": config.get("maxWidth", 1200),
        "defaultLlmPreset": config.get("defaultLlmPreset", ""),
    }


@app.put("/api/config")
async def update_config(body: dict = Body(...)):
    """Update frontend-relevant config fields."""
    config = load_config()
    for key in ("defaultLlmPreset",):
        if key in body:
            config[key] = body[key]
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    return _resp(True, "")


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
        return _resp(False, "WORLD_NOT_FOUND", {"id": req.worldId})

    game_state.load_world(req.worldId)
    _save_last_world(req.worldId)

    # Broadcast game change to all SSE clients
    state = game_state.get_full_state()
    await manager.broadcast("game_changed", state)

    return _resp(True, "WORLD_SWITCHED", {"name": game_state.world_name})


@app.post("/api/worlds/unload")
async def unload_world():
    """Switch to empty world (no world loaded)."""
    game_state.load_empty()
    _save_last_world("")

    state = game_state.get_full_state()
    await manager.broadcast("game_changed", state)
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
        await manager.broadcast("game_changed", state)
        return {"success": True, "staged": False}


@app.get("/api/session")
async def get_session():
    """Get current session info."""
    return {
        "worldId": game_state.world_id,
        "worldName": game_state.world_name,
        "addons": game_state.addon_refs,
        "playerCharacter": game_state.player_character,
        "dirty": game_state.dirty,
        "llmPreset": game_state.llm_preset,
    }


class CreateWorldRequest(BaseModel):
    id: str
    name: str
    addons: list


@app.post("/api/worlds")
async def create_world(req: CreateWorldRequest):
    """Create a new world. Addon versions will be forked on first load."""
    from game.addon_loader import save_world_config, WORLDS_DIR
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


@app.delete("/api/worlds/{world_id}")
async def delete_world(world_id: str):
    """Delete a world."""
    from game.addon_loader import WORLDS_DIR
    import shutil as _shutil
    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return _resp(False, "WORLD_NOT_FOUND", {"id": world_id})
    _shutil.rmtree(world_dir)
    return _resp(True, "WORLD_DELETED", {"id": world_id})


@app.put("/api/worlds/{world_id}")
async def update_world(world_id: str):
    """Update existing world config with current session state."""
    from game.addon_loader import load_world_config, save_world_config, WORLDS_DIR
    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return _resp(False, "WORLD_NOT_FOUND", {"id": world_id})
    config = load_world_config(world_id)
    config["addons"] = game_state.addon_refs
    save_world_config(world_id, config)
    return _resp(True, "WORLD_UPDATED", {"id": world_id})


@app.put("/api/worlds/{world_id}/meta")
async def update_world_meta(world_id: str, body: dict = Body(...)):
    """Update world metadata (name, description, cover)."""
    from game.addon_loader import load_world_config, save_world_config, WORLDS_DIR
    world_dir = WORLDS_DIR / world_id
    if not world_dir.exists():
        return _resp(False, "WORLD_NOT_FOUND", {"id": world_id})
    config = load_world_config(world_id)
    for key in ("name", "description", "cover", "llmPreset"):
        if key in body:
            config[key] = body[key]
    save_world_config(world_id, config)
    # Update in-memory state if this is the current world
    if game_state.world_id == world_id:
        game_state.world_name = config.get("name", game_state.world_name)
        game_state.llm_preset = config.get("llmPreset", "")
    return _resp(True, "WORLD_META_UPDATED")


@app.put("/api/addon/{addon_id}/{version}/meta")
async def update_addon_meta(addon_id: str, version: str, body: dict = Body(...)):
    """Update addon-level shared metadata (name, description, author, cover, categories).

    Writes to addons/{addonId}/meta.json (shared across all versions).
    """
    from game.addon_loader import save_addon_shared_meta, load_addon_shared_meta, ADDONS_DIR
    addon_base = ADDONS_DIR / addon_id
    if not addon_base.exists():
        return _resp(False, "ADDON_NOT_FOUND", {"id": addon_id})
    meta = load_addon_shared_meta(addon_id)
    for key in ("name", "description", "author", "cover", "categories"):
        if key in body:
            meta[key] = body[key]
    save_addon_shared_meta(addon_id, meta)
    return _resp(True, "ADDON_META_UPDATED")


@app.post("/api/addon/{addon_id}/fork")
async def fork_addon(addon_id: str, body: dict = Body(...)):
    """Fork an addon version for a specific world."""
    base_version = body.get("baseVersion", "")
    world_id = body.get("worldId", "")
    if not base_version or not world_id:
        return _resp(False, "FIELD_REQUIRED", {"fields": ["baseVersion", "worldId"]})
    try:
        new_version = fork_addon_version(addon_id, base_version, world_id)
    except FileNotFoundError as e:
        return _resp(False, "ADDON_FORK_FAILED", {"detail": str(e)})
    return {"success": True, "newVersion": new_version}


@app.post("/api/addon/{addon_id}/copy")
async def copy_addon(addon_id: str, body: dict = Body(...)):
    """Copy an addon version to create a new branch or version bump."""
    source_version = body.get("sourceVersion", "")
    new_version = body.get("newVersion", "")
    forked_from = body.get("forkedFrom", None)  # set for branches, None for version bumps
    if not source_version or not new_version:
        return _resp(False, "FIELD_REQUIRED", {"fields": ["sourceVersion", "newVersion"]})
    try:
        result = copy_addon_version(addon_id, source_version, new_version, forked_from)
    except FileExistsError as e:
        return _resp(False, "ADDON_COPY_EXISTS", {"detail": str(e)})
    except FileNotFoundError as e:
        return _resp(False, "ADDON_COPY_NOT_FOUND", {"detail": str(e)})
    return {"success": True, "newVersion": result}


@app.post("/api/addon/{addon_id}/overwrite")
async def overwrite_addon(addon_id: str, body: dict = Body(...)):
    """Overwrite target version's content with source version's files (keeps target metadata)."""
    source_version = body.get("sourceVersion", "")
    target_version = body.get("targetVersion", "")
    if not source_version or not target_version:
        return _resp(False, "FIELD_REQUIRED", {"fields": ["sourceVersion", "targetVersion"]})
    if source_version == target_version:
        return _resp(False, "ADDON_OVERWRITE_SAME")
    try:
        overwrite_addon_version(addon_id, source_version, target_version)
    except FileNotFoundError as e:
        return _resp(False, "ADDON_OVERWRITE_FAILED", {"detail": str(e)})
    return _resp(True, "ADDON_OVERWRITTEN", {"source": source_version, "target": target_version})


@app.get("/api/addon/{addon_id}/versions")
async def get_addon_versions(addon_id: str, detail: bool = False):
    """List all versions of an addon. With detail=true, includes forkedFrom/worldId."""
    if detail:
        return {"versions": list_addon_versions_detail(addon_id)}
    return {"versions": list_addon_versions(addon_id)}


@app.post("/api/addon")
async def create_addon(body: dict = Body(...)):
    """Create a new empty addon with initial version."""
    addon_id = body.get("id", "").strip()
    name = body.get("name", "").strip()
    version = body.get("version", "1.0.0").strip()
    if err := _validate_id(addon_id):
        return err
    if not addon_id:
        return _resp(False, "FIELD_REQUIRED", {"field": "id"})
    if not name:
        return _resp(False, "FIELD_REQUIRED", {"field": "name"})

    version_dir = ADDONS_DIR / addon_id / version
    if version_dir.exists():
        return _resp(False, "ADDON_ALREADY_EXISTS", {"id": addon_id, "version": version})

    version_dir.mkdir(parents=True, exist_ok=True)
    version_meta = {
        "id": addon_id,
        "version": version,
        "dependencies": [],
    }
    with open(version_dir / "addon.json", "w", encoding="utf-8") as f:
        json.dump(version_meta, f, ensure_ascii=False, indent=2)

    # Write shared addon-level metadata
    from game.addon_loader import save_addon_shared_meta
    shared_meta = {
        "name": name,
        "description": body.get("description", ""),
        "author": body.get("author", ""),
        "categories": [],
    }
    save_addon_shared_meta(addon_id, shared_meta)

    return _resp(True, "ADDON_CREATED", {"id": addon_id, "version": version})


@app.delete("/api/addon/{addon_id}")
async def delete_addon_all(addon_id: str):
    """Delete an entire addon (all versions) from disk."""
    addon_dir = ADDONS_DIR / addon_id
    if not addon_dir.exists():
        return _resp(False, "ADDON_NOT_FOUND", {"id": addon_id})

    # Don't allow if any version is currently loaded
    if any(ref.get("id") == addon_id for ref in game_state.addon_refs):
        return _resp(False, "ADDON_IN_USE", {"id": addon_id})

    shutil.rmtree(addon_dir)
    return _resp(True, "ADDON_DELETED", {"id": addon_id})


@app.delete("/api/addon/{addon_id}/{version}")
async def delete_addon(addon_id: str, version: str):
    """Delete an addon version from disk."""
    from game.addon_loader import ADDONS_DIR
    version_dir = ADDONS_DIR / addon_id / version
    if not version_dir.exists():
        return _resp(False, "ADDON_VERSION_NOT_FOUND", {"id": addon_id, "version": version})

    # Don't allow deleting if it's currently loaded
    if any(ref.get("id") == addon_id and ref.get("version") == version
           for ref in game_state.addon_refs):
        return _resp(False, "ADDON_VERSION_IN_USE", {"id": addon_id, "version": version})

    shutil.rmtree(version_dir)

    return _resp(True, "ADDON_VERSION_DELETED", {"id": addon_id, "version": version})


# Legacy game endpoints (redirect to world endpoints)
@app.get("/api/games")
async def get_games():
    """Legacy: list worlds as games."""
    return {"games": list_available_worlds()}


@app.post("/api/game/restart")
async def restart_game():
    """Restart current game (reload all data from disk, reset time)."""
    game_state.load_world(game_state.world_id)
    state = game_state.get_full_state()
    await manager.broadcast("game_changed", state)
    return _resp(True, "WORLD_RESTARTED", {"name": game_state.world_name})


# ── Save Slot endpoints ──

@app.get("/api/saves")
async def list_saves_endpoint():
    """List all save slots for the current world."""
    from game.save_manager import list_saves
    if not game_state.world_id:
        return {"saves": []}
    saves = list_saves(game_state.world_id)
    return {"saves": saves}


@app.post("/api/saves")
async def create_save_endpoint(body: dict = Body(...)):
    """Create or overwrite a save slot."""
    from game.save_manager import create_save, list_saves, MAX_SLOTS
    from datetime import datetime
    if not game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    slot_id = body.get("slotId", "")
    name = body.get("name", "")
    if not slot_id:
        slot_id = "save_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    if not name:
        name = slot_id

    # Check slot limit (only for new saves)
    existing = list_saves(game_state.world_id)
    existing_ids = {m["slotId"] for m in existing}
    if slot_id not in existing_ids and len(existing) >= MAX_SLOTS:
        return _resp(False, "SAVE_SLOTS_FULL", {"max": MAX_SLOTS})

    runtime = game_state.snapshot_save_data()
    time_dict = game_state.time.to_dict()
    meta_info = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "worldId": game_state.world_id,
        "worldName": game_state.world_name,
        "gameTimeDisplay": time_dict.get("displayText", ""),
        "addonRefs": game_state.addon_refs,
    }
    meta = create_save(game_state.world_id, slot_id, name, runtime, meta_info)
    return {"success": True, "meta": meta}


@app.post("/api/saves/{slot_id:path}/load")
async def load_save_endpoint(slot_id: str):
    """Load a save slot: reload world then restore runtime."""
    from game.save_manager import load_save
    if not game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    save_data = load_save(game_state.world_id, slot_id)
    if save_data is None:
        return _resp(False, "SAVE_NOT_FOUND", {"id": slot_id})
    # Reload world from disk (resets everything)
    game_state.load_world(game_state.world_id)
    # Restore runtime from save
    game_state.restore_save_data(save_data["runtime"])
    state = game_state.get_full_state()
    await manager.broadcast("game_changed", state)
    return _resp(True, "SAVE_LOADED", {"id": slot_id})


@app.delete("/api/saves/{slot_id:path}")
async def delete_save_endpoint(slot_id: str):
    """Delete a save slot."""
    from game.save_manager import delete_save
    if not game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    ok = delete_save(game_state.world_id, slot_id)
    if not ok:
        return _resp(False, "SAVE_NOT_FOUND", {"id": slot_id})
    return _resp(True, "SAVE_DELETED", {"id": slot_id})


@app.patch("/api/saves/{slot_id:path}")
async def rename_save_endpoint(slot_id: str, body: dict = Body(...)):
    """Rename a save slot."""
    from game.save_manager import rename_save
    if not game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    name = body.get("name", "")
    if not name:
        return _resp(False, "FIELD_REQUIRED", {"field": "name"})
    ok = rename_save(game_state.world_id, slot_id, name)
    if not ok:
        return _resp(False, "SAVE_NOT_FOUND", {"id": slot_id})
    return _resp(True, "SAVE_RENAMED", {"name": name})


@app.get("/assets/{path:path}")
async def serve_asset(path: str):
    """Serve static assets.

    Path formats:
      - world/{worldId}/{subfolder}/{filename} — world assets
      - {addonId}/{subfolder}/{filename} — addon assets
    Searches both about/ and assets/ subdirectories.
    """
    from game.addon_loader import WORLDS_DIR, ADDONS_DIR

    parts = path.split("/", 1)
    if len(parts) == 2:
        prefix, sub_path = parts

        # World assets: /assets/world/{worldId}/...
        if prefix == "world":
            world_parts = sub_path.split("/", 1)
            if len(world_parts) == 2:
                world_id, asset_sub = world_parts
                world_dir = WORLDS_DIR / world_id
                for sub_root in ("about", "assets"):
                    file_path = (world_dir / sub_root / asset_sub).resolve()
                    if str(file_path).startswith(str(world_dir.resolve())) and file_path.exists():
                        return FileResponse(file_path)
            return {"error": "FILE_NOT_FOUND"}

        # Addon assets: /assets/{addonId}/{subfolder}/{filename}
        addon_id = prefix
        addon_dir = get_addon_dir(addon_id)
        for sub_root in ("about", "assets"):
            file_path = (addon_dir / sub_root / sub_path).resolve()
            if str(file_path).startswith(str(addon_dir.resolve())) and file_path.exists():
                return FileResponse(file_path)

    # Fallback: search addon directories (legacy paths without addon prefix)
    # Check both addon-root assets/ and version-level assets/
    seen_roots: set[str] = set()
    for addon_id, addon_path in reversed(game_state.addon_dirs):
        # Version-level assets
        assets_dir = addon_path / "assets"
        file_path = (assets_dir / path).resolve()
        if str(file_path).startswith(str(assets_dir.resolve())) and file_path.exists():
            return FileResponse(file_path)
        # Addon-root shared assets (check once per addon)
        if addon_id not in seen_roots:
            seen_roots.add(addon_id)
            root_assets = ADDONS_DIR / addon_id / "assets"
            file_path = (root_assets / path).resolve()
            if str(file_path).startswith(str(root_assets.resolve())) and file_path.exists():
                return FileResponse(file_path)

    return {"error": "FILE_NOT_FOUND"}


@app.post("/api/assets")
async def upload_asset(
    file: UploadFile = File(...),
    folder: str = Query(...),
    name: str = Query(...),
    addonId: Optional[str] = Query(None),
    worldId: Optional[str] = Query(None),
):
    """Upload an asset file. folder: 'characters', 'backgrounds', or 'covers'. name: target filename (without ext)."""
    if folder not in ("characters", "backgrounds", "covers"):
        return _resp(False, "ASSET_INVALID_FOLDER")
    original_name = file.filename or ""
    ext = Path(original_name).suffix.lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        return _resp(False, "ASSET_UNSUPPORTED_TYPE", {"ext": ext})

    if folder == "covers":
        if worldId:
            # World cover → worlds/{worldId}/about/covers/
            from game.addon_loader import WORLDS_DIR
            target_dir = WORLDS_DIR / worldId / "about" / "covers"
        elif addonId:
            # Addon cover → addons/{addonId}/about/covers/ (shared across versions)
            target_dir = get_addon_dir(addonId) / "about" / "covers"
        else:
            return _resp(False, "ASSET_MISSING_OWNER")
    elif addonId:
        # Shared assets at addon root: addons/{addonId}/assets/{folder}/
        target_dir = get_addon_dir(addonId) / "assets" / folder
    elif game_state.addon_dirs:
        # Default: use last addon's root assets dir
        last_addon_id = game_state.addon_dirs[-1][0]
        target_dir = get_addon_dir(last_addon_id) / "assets" / folder
    else:
        return _resp(False, "ASSET_NO_ADDON")

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
    outfitId: Optional[str] = None
    selections: Optional[dict] = None


@app.get("/api/game/available-actions/{character_id:path}")
async def get_actions(character_id: str, target_id: Optional[str] = None):
    """Get available actions for a character."""
    character_id = _ensure_ns(character_id)
    if target_id:
        target_id = _ensure_ns(target_id)
    actions = get_available_actions(game_state, character_id, target_id)
    return {"actions": actions}


@app.post("/api/game/action")
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
    result = execute_action(game_state, _ensure_ns(req.characterId), action_data)

    if result.get("success"):
        # Evaluate global events after player action
        player_id = _ensure_ns(req.characterId)
        # Evaluate each_character events for the player
        event_results = evaluate_events(game_state, scope_filter="each_character", char_filter=player_id)
        # Evaluate scope=none events (world-level triggers)
        event_results += evaluate_events(game_state, scope_filter="none")
        if event_results:
            event_msgs = [r["output"] for r in event_results if r.get("output")]
            if event_msgs:
                existing_msg = result.get("message", "")
                result["message"] = existing_msg + "\n" + "\n".join(event_msgs) if existing_msg else "\n".join(event_msgs)
        # Append to action log for LLM / save persistence
        game_state.action_log.append({
            "message": result.get("message", ""),
            "actionId": result.get("actionId", ""),
            "actionName": result.get("actionName", ""),
            "outcomeGrade": result.get("outcomeGrade"),
            "outcomeLabel": result.get("outcomeLabel"),
            "effectsSummary": result.get("effectsSummary", []),
            "npcLog": result.get("npcLog", []),
            "totalDays": game_state.time.total_days,
        })
        # Trim action log to retention limit (30 game days)
        cutoff = game_state.time.total_days - game_state.ACTION_LOG_SAVE_DAYS
        if game_state.action_log and game_state.action_log[0].get("totalDays", 0) < cutoff:
            game_state.action_log = [
                e for e in game_state.action_log
                if e.get("totalDays", 0) >= cutoff
            ]
        # Broadcast updated state to all SSE clients
        state = game_state.get_full_state()
        await manager.broadcast("state_update", state)

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


@app.get("/api/game/characters/config/{character_id:path}")
async def get_character_config(character_id: str):
    """Get a single character raw JSON config."""
    character_id = _ensure_ns(character_id)
    char = game_state.character_data.get(character_id)
    if not char:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    return char


@app.put("/api/game/characters/config/{character_id:path}")
async def update_character_config(character_id: str, body: dict = Body(...)):
    """Update a character config (in memory). Rebuilds runtime state."""
    character_id = _ensure_ns(character_id)
    if character_id not in game_state.character_data:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    source = game_state.character_data[character_id].get("_source", "")
    body["id"] = character_id
    body["_local_id"] = to_local_id(character_id)
    body["_source"] = source
    game_state.character_data[character_id] = body
    # Rebuild runtime character state from new data
    game_state.characters[character_id] = game_state._build_char(character_id)
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "character"})


@app.post("/api/game/characters/config")
async def create_character_config(body: dict = Body(...)):
    """Create a new character (in memory). Builds runtime state."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    char_id = _ensure_ns(raw_id, source)
    if not char_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "character"})
    if char_id in game_state.character_data:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "character", "id": char_id})
    body["id"] = char_id
    body["_local_id"] = to_local_id(char_id)
    body["_source"] = source
    game_state.character_data[char_id] = body
    game_state.characters[char_id] = game_state._build_char(char_id)
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "character"})


@app.patch("/api/game/characters/config/{character_id:path}")
async def patch_character_config(character_id: str, body: dict = Body(...)):
    """Partial update: toggle isPlayer, active, etc. (in memory)."""
    character_id = _ensure_ns(character_id)
    if character_id not in game_state.character_data:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    char = game_state.character_data[character_id]

    # isPlayer is exclusive — if setting to True, clear all others
    if body.get("isPlayer") is True:
        for cid, cd in game_state.character_data.items():
            if cd.get("isPlayer"):
                cd["isPlayer"] = False

    # Prevent freezing the player character
    if body.get("active") is False and char.get("isPlayer"):
        return _resp(False, "CHARACTER_CANNOT_FREEZE_PLAYER")

    for key in ("isPlayer", "active"):
        if key in body:
            char[key] = body[key]

    # Rebuild runtime characters (active only)
    game_state.characters = {}
    for cid, cd in game_state.character_data.items():
        if cd.get("active", True) is False:
            continue
        game_state.characters[cid] = game_state._build_char(cid)
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "character"})


@app.delete("/api/game/characters/config/{character_id:path}")
async def delete_character_config(character_id: str):
    """Delete a character (in memory)."""
    character_id = _ensure_ns(character_id)
    if character_id not in game_state.character_data:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": character_id})
    del game_state.character_data[character_id]
    game_state.characters.pop(character_id, None)
    # Clean up references from other characters
    for cdata in game_state.character_data.values():
        fav = cdata.get("favorability")
        if isinstance(fav, dict):
            fav.pop(character_id, None)
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "character"})


# --- Trait CRUD ---


@app.get("/api/game/traits")
async def get_traits():
    """Get all trait definitions (builtin + game)."""
    return {"traits": list(game_state.trait_defs.values())}


@app.post("/api/game/traits")
async def create_trait(body: dict = Body(...)):
    """Create a new game trait (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    trait_id = _ensure_ns(raw_id, source)
    if not trait_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "trait"})
    if trait_id in game_state.trait_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "trait", "id": trait_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = trait_id
    entry["_local_id"] = to_local_id(trait_id)
    entry["source"] = source
    game_state.trait_defs[trait_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "trait"})


@app.put("/api/game/traits/{trait_id:path}")
async def update_trait(trait_id: str, body: dict = Body(...)):
    """Update a game trait (in memory)."""
    trait_id = _ensure_ns(trait_id)
    td = game_state.trait_defs.get(trait_id)
    if not td:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "trait", "id": trait_id})
    source = td.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = trait_id
    entry["_local_id"] = to_local_id(trait_id)
    entry["source"] = source
    game_state.trait_defs[trait_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "trait"})


@app.delete("/api/game/traits/{trait_id:path}")
async def delete_trait(trait_id: str):
    """Delete a game trait (in memory)."""
    trait_id = _ensure_ns(trait_id)
    td = game_state.trait_defs.get(trait_id)
    if not td:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "trait", "id": trait_id})
    del game_state.trait_defs[trait_id]
    # Remove from all trait groups that reference this trait
    for group in game_state.trait_groups.values():
        traits_list = group.get("traits", [])
        if trait_id in traits_list:
            group["traits"] = [t for t in traits_list if t != trait_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "trait"})


# --- Clothing CRUD ---


@app.get("/api/game/clothing")
async def get_clothing():
    """Get all clothing definitions (builtin + game)."""
    return {"clothing": list(game_state.clothing_defs.values())}


@app.post("/api/game/clothing")
async def create_clothing(body: dict = Body(...)):
    """Create a new game clothing item (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    item_id = _ensure_ns(raw_id, source)
    if not item_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "clothing"})
    if item_id in game_state.clothing_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "clothing", "id": item_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["_local_id"] = to_local_id(item_id)
    entry["source"] = source
    game_state.clothing_defs[item_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "clothing"})


@app.put("/api/game/clothing/{item_id:path}")
async def update_clothing(item_id: str, body: dict = Body(...)):
    """Update a game clothing item (in memory)."""
    item_id = _ensure_ns(item_id)
    cd = game_state.clothing_defs.get(item_id)
    if not cd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "clothing", "id": item_id})
    source = cd.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["_local_id"] = to_local_id(item_id)
    entry["source"] = source
    game_state.clothing_defs[item_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "clothing"})


@app.delete("/api/game/clothing/{item_id:path}")
async def delete_clothing(item_id: str):
    """Delete a game clothing item (in memory)."""
    item_id = _ensure_ns(item_id)
    cd = game_state.clothing_defs.get(item_id)
    if not cd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "clothing", "id": item_id})
    del game_state.clothing_defs[item_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "clothing"})


# --- Outfit Types ---


@app.get("/api/game/outfit-types")
async def get_outfit_types():
    """Get all outfit type names."""
    return {"outfitTypes": game_state.outfit_types}


@app.put("/api/game/outfit-types")
async def update_outfit_types(body: dict = Body(...)):
    """Replace the full outfit types list."""
    types = body.get("outfitTypes", [])
    if not isinstance(types, list):
        return _resp(False, "VALIDATION_INVALID_TYPE")
    # Filter out 默认服装 (always implicit), ensure valid objects
    cleaned = []
    seen = set()
    for t in types:
        if isinstance(t, dict) and t.get("id") and t["id"] != "default":
            oid = t["id"]
            if oid not in seen:
                seen.add(oid)
                cleaned.append({
                    "id": oid,
                    "name": t.get("name", oid),
                    "description": t.get("description", ""),
                    "copyDefault": bool(t.get("copyDefault", True)),
                    "slots": t.get("slots", {}),
                })
    game_state.outfit_types = cleaned
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "outfitTypes"})


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
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    item_id = _ensure_ns(raw_id, source)
    if not item_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "item"})
    if item_id in game_state.item_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "item", "id": item_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["_local_id"] = to_local_id(item_id)
    entry["source"] = source
    game_state.item_defs[item_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "item"})


@app.put("/api/game/items/{item_id:path}")
async def update_item(item_id: str, body: dict = Body(...)):
    """Update a game item (in memory)."""
    item_id = _ensure_ns(item_id)
    item_def = game_state.item_defs.get(item_id)
    if not item_def:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "item", "id": item_id})
    source = item_def.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    entry["_local_id"] = to_local_id(item_id)
    entry["source"] = source
    game_state.item_defs[item_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "item"})


@app.delete("/api/game/items/{item_id:path}")
async def delete_item(item_id: str):
    """Delete a game item (in memory)."""
    item_id = _ensure_ns(item_id)
    item_def = game_state.item_defs.get(item_id)
    if not item_def:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "item", "id": item_id})
    del game_state.item_defs[item_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "item"})


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
        return _resp(False, "TAG_EMPTY")
    if tag in game_state.item_tags:
        return _resp(False, "TAG_ALREADY_EXISTS", {"tag": tag})
    game_state.item_tags.append(tag)
    await _mark_dirty()
    return _resp(True, "TAG_ADDED", {"tag": tag})


@app.delete("/api/game/item-tags/{tag}")
async def delete_item_tag(tag: str):
    """Remove a tag from the pool."""
    if tag not in game_state.item_tags:
        return _resp(False, "TAG_NOT_FOUND", {"tag": tag})
    game_state.item_tags.remove(tag)
    await _mark_dirty()
    return _resp(True, "TAG_DELETED", {"tag": tag})


# --- Action CRUD ---


@app.get("/api/game/actions")
async def get_actions_defs():
    """Get all action definitions (builtin + game)."""
    return {"actions": list(game_state.action_defs.values())}


@app.post("/api/game/actions")
async def create_action_def(body: dict = Body(...)):
    """Create a new game action (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    action_id = _ensure_ns(raw_id, source)
    if not action_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "action"})
    if action_id in game_state.action_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "action", "id": action_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = action_id
    entry["_local_id"] = to_local_id(action_id)
    entry["source"] = source
    game_state.action_defs[action_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "action"})


@app.put("/api/game/actions/{action_id:path}")
async def update_action_def(action_id: str, body: dict = Body(...)):
    """Update a game action (in memory)."""
    action_id = _ensure_ns(action_id)
    action_def = game_state.action_defs.get(action_id)
    if not action_def:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "action", "id": action_id})
    source = action_def.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = action_id
    entry["_local_id"] = to_local_id(action_id)
    entry["source"] = source
    game_state.action_defs[action_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "action"})


@app.delete("/api/game/actions/{action_id:path}")
async def delete_action_def(action_id: str):
    """Delete a game action (in memory)."""
    action_id = _ensure_ns(action_id)
    action_def = game_state.action_defs.get(action_id)
    if not action_def:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "action", "id": action_id})
    del game_state.action_defs[action_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "action"})


# --- Trait Group CRUD ---


@app.get("/api/game/trait-groups")
async def get_trait_groups():
    """Get all trait group definitions (builtin + game)."""
    return {"traitGroups": list(game_state.trait_groups.values())}


@app.post("/api/game/trait-groups")
async def create_trait_group(body: dict = Body(...)):
    """Create a new game trait group (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    group_id = _ensure_ns(raw_id, source)
    if not group_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "traitGroup"})
    if group_id in game_state.trait_groups:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "traitGroup", "id": group_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = group_id
    entry["_local_id"] = to_local_id(group_id)
    entry["source"] = source
    game_state.trait_groups[group_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "traitGroup"})


@app.put("/api/game/trait-groups/{group_id:path}")
async def update_trait_group(group_id: str, body: dict = Body(...)):
    """Update a game trait group (in memory)."""
    group_id = _ensure_ns(group_id)
    tg = game_state.trait_groups.get(group_id)
    if not tg:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "traitGroup", "id": group_id})
    source = tg.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = group_id
    entry["_local_id"] = to_local_id(group_id)
    entry["source"] = source
    game_state.trait_groups[group_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "traitGroup"})


@app.delete("/api/game/trait-groups/{group_id:path}")
async def delete_trait_group(group_id: str):
    """Delete a game trait group (in memory)."""
    group_id = _ensure_ns(group_id)
    tg = game_state.trait_groups.get(group_id)
    if not tg:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "traitGroup", "id": group_id})
    del game_state.trait_groups[group_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "traitGroup"})


# --- Variable CRUD ---


@app.get("/api/game/variables")
async def get_variables():
    """Get all derived variable definitions."""
    return {"variables": list(game_state.variable_defs.values())}


@app.post("/api/game/variables")
async def create_variable(body: dict = Body(...)):
    """Create a new derived variable (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    var_id = _ensure_ns(raw_id, source)
    if not var_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "variable"})
    if var_id in game_state.variable_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "variable", "id": var_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = var_id
    entry["_local_id"] = to_local_id(var_id)
    entry["source"] = source
    game_state.variable_defs[var_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "variable"})


@app.put("/api/game/variables/{var_id:path}")
async def update_variable(var_id: str, body: dict = Body(...)):
    """Update a derived variable (in memory)."""
    var_id = _ensure_ns(var_id)
    vd = game_state.variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "variable", "id": var_id})
    source = vd.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = var_id
    entry["_local_id"] = to_local_id(var_id)
    entry["source"] = source
    game_state.variable_defs[var_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "variable"})


@app.delete("/api/game/variables/{var_id:path}")
async def delete_variable(var_id: str):
    """Delete a derived variable (in memory)."""
    var_id = _ensure_ns(var_id)
    vd = game_state.variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "variable", "id": var_id})
    del game_state.variable_defs[var_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "variable"})


@app.post("/api/game/variables/{var_id:path}/evaluate")
async def evaluate_variable_endpoint(var_id: str, body: dict = Body(...)):
    """Evaluate a derived variable against a character's state.

    Body: {"characterId": "addon.charId"}
    Returns: {"result": float, "steps": [...debug trace...]}
    """
    from game.variable_engine import evaluate_variable_debug

    var_id = _ensure_ns(var_id)
    vd = game_state.variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "variable", "id": var_id})

    char_id = body.get("characterId", "")
    char_id = _ensure_ns(char_id)
    char_state = game_state.characters.get(char_id)
    if not char_state:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "character", "id": char_id})

    result = evaluate_variable_debug(vd, char_state, game_state.variable_defs)
    return {"success": True, **result}


# --- Variable Tag pool ---


@app.get("/api/game/variable-tags")
async def get_variable_tags():
    """Get variable tag pool."""
    return {"tags": game_state.variable_tags}


@app.post("/api/game/variable-tags")
async def create_variable_tag(body: dict = Body(...)):
    """Add a tag to the variable tag pool."""
    tag = body.get("tag", "").strip()
    if not tag:
        return _resp(False, "TAG_EMPTY")
    if tag in game_state.variable_tags:
        return _resp(False, "TAG_ALREADY_EXISTS", {"tag": tag})
    game_state.variable_tags.append(tag)
    await _mark_dirty()
    return _resp(True, "TAG_ADDED", {"tag": tag})


@app.delete("/api/game/variable-tags/{tag}")
async def delete_variable_tag(tag: str):
    """Remove a tag from the variable tag pool."""
    if tag not in game_state.variable_tags:
        return _resp(False, "TAG_NOT_FOUND", {"tag": tag})
    game_state.variable_tags.remove(tag)
    await _mark_dirty()
    return _resp(True, "TAG_DELETED", {"tag": tag})


# --- Event Definition CRUD ---


@app.get("/api/game/events")
async def get_events():
    """Get all global event definitions."""
    return {"events": list(game_state.event_defs.values())}


@app.post("/api/game/events")
async def create_event(body: dict = Body(...)):
    """Create a new global event (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    event_id = _ensure_ns(raw_id, source)
    if not event_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "event"})
    if event_id in game_state.event_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "event", "id": event_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = event_id
    entry["_local_id"] = to_local_id(event_id)
    entry["source"] = source
    game_state.event_defs[event_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "event"})


@app.put("/api/game/events/{event_id:path}")
async def update_event(event_id: str, body: dict = Body(...)):
    """Update a global event (in memory)."""
    event_id = _ensure_ns(event_id)
    ed = game_state.event_defs.get(event_id)
    if not ed:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "event", "id": event_id})
    source = ed.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = event_id
    entry["_local_id"] = to_local_id(event_id)
    entry["source"] = source
    game_state.event_defs[event_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "event"})


@app.delete("/api/game/events/{event_id:path}")
async def delete_event(event_id: str):
    """Delete a global event (in memory)."""
    event_id = _ensure_ns(event_id)
    ed = game_state.event_defs.get(event_id)
    if not ed:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "event", "id": event_id})
    del game_state.event_defs[event_id]
    # Clean up event state
    game_state.event_state.pop(event_id, None)
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "event"})


# --- Lorebook CRUD ---


@app.get("/api/game/lorebook")
async def get_lorebook():
    """Get all lorebook entries."""
    return {"entries": list(game_state.lorebook_defs.values())}


@app.post("/api/game/lorebook")
async def create_lorebook_entry(body: dict = Body(...)):
    """Create a new lorebook entry (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    entry_id = _ensure_ns(raw_id, source)
    if not entry_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "lorebook"})
    if entry_id in game_state.lorebook_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "lorebook", "id": entry_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = entry_id
    entry["_local_id"] = to_local_id(entry_id)
    entry["source"] = source
    game_state.lorebook_defs[entry_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "lorebook"})


@app.put("/api/game/lorebook/{entry_id:path}")
async def update_lorebook_entry(entry_id: str, body: dict = Body(...)):
    """Update a lorebook entry (in memory)."""
    entry_id = _ensure_ns(entry_id)
    ed = game_state.lorebook_defs.get(entry_id)
    if not ed:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "lorebook", "id": entry_id})
    source = ed.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = entry_id
    entry["_local_id"] = to_local_id(entry_id)
    entry["source"] = source
    game_state.lorebook_defs[entry_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "lorebook"})


@app.delete("/api/game/lorebook/{entry_id:path}")
async def delete_lorebook_entry(entry_id: str):
    """Delete a lorebook entry (in memory)."""
    entry_id = _ensure_ns(entry_id)
    if entry_id not in game_state.lorebook_defs:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "lorebook", "id": entry_id})
    del game_state.lorebook_defs[entry_id]
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "lorebook"})


# --- World Variable Definition CRUD ---


@app.get("/api/game/world-variables")
async def get_world_variables():
    """Get all world variable definitions."""
    return {"worldVariables": list(game_state.world_variable_defs.values())}


@app.post("/api/game/world-variables")
async def create_world_variable(body: dict = Body(...)):
    """Create a new world variable (in memory)."""
    raw_id = body.get("id", "")
    if err := _validate_id(raw_id):
        return err
    source = body.get("source") or get_addon_from_id(raw_id) or ""
    var_id = _ensure_ns(raw_id, source)
    if not var_id:
        return _resp(False, "ENTITY_MISSING_ID", {"entity": "worldVariable"})
    if var_id in game_state.world_variable_defs:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "worldVariable", "id": var_id})
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = var_id
    entry["_local_id"] = to_local_id(var_id)
    entry["source"] = source
    game_state.world_variable_defs[var_id] = entry
    # Initialize runtime value
    game_state.world_variables[var_id] = entry.get("default", 0)
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "worldVariable"})


@app.put("/api/game/world-variables/{var_id:path}")
async def update_world_variable(var_id: str, body: dict = Body(...)):
    """Update a world variable definition (in memory)."""
    var_id = _ensure_ns(var_id)
    vd = game_state.world_variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "worldVariable", "id": var_id})
    source = vd.get("source", "")
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = var_id
    entry["_local_id"] = to_local_id(var_id)
    entry["source"] = source
    game_state.world_variable_defs[var_id] = entry
    await _mark_dirty()
    return _resp(True, "ENTITY_UPDATED", {"entity": "worldVariable"})


@app.delete("/api/game/world-variables/{var_id:path}")
async def delete_world_variable(var_id: str):
    """Delete a world variable definition (in memory)."""
    var_id = _ensure_ns(var_id)
    vd = game_state.world_variable_defs.get(var_id)
    if not vd:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "worldVariable", "id": var_id})
    del game_state.world_variable_defs[var_id]
    game_state.world_variables.pop(var_id, None)
    await _mark_dirty()
    return _resp(True, "ENTITY_DELETED", {"entity": "worldVariable"})


# --- Map CRUD ---


@app.get("/api/game/maps/raw")
async def get_maps_raw():
    """Get list of all maps (id + name only)."""
    result = []
    for map_id, map_data in game_state.maps.items():
        result.append({"id": map_data["id"], "name": map_data["name"], "source": map_data.get("_source", "")})
    return {"maps": result}


@app.get("/api/game/maps/raw/{map_id:path}")
async def get_map_raw(map_id: str):
    """Get full raw map data (grid + cells + metadata) without compiled fields."""
    map_id = _ensure_ns(map_id)
    map_data = game_state.maps.get(map_id)
    if not map_data:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": map_id})
    return {k: v for k, v in map_data.items() if k not in ("compiled_grid", "cell_index")}


class CreateMapRequest(BaseModel):
    id: str
    name: str
    rows: int
    cols: int


@app.post("/api/game/maps")
async def create_map_endpoint(req: CreateMapRequest):
    """Create a new empty map (in memory)."""
    source = get_addon_from_id(req.id) or ""
    map_id = _ensure_ns(req.id, source)
    if map_id in game_state.maps:
        return _resp(False, "ENTITY_ALREADY_EXISTS", {"entity": "map", "id": map_id})
    grid = [["" for _ in range(req.cols)] for _ in range(req.rows)]
    map_data = {
        "id": map_id,
        "_local_id": to_local_id(map_id),
        "name": req.name,
        "defaultColor": "#FFFFFF",
        "grid": grid,
        "cells": [],
        "_source": source,
    }
    map_data["compiled_grid"] = compile_grid(map_data)
    map_data["cell_index"] = {c["id"]: c for c in map_data["cells"]}
    game_state.maps[map_id] = map_data
    from game.map_engine import build_distance_matrix
    game_state.distance_matrix = build_distance_matrix(game_state.maps)
    await _mark_dirty()
    return _resp(True, "ENTITY_CREATED", {"entity": "map"})


@app.put("/api/game/maps/raw/{map_id:path}")
async def update_map_raw(map_id: str, body: dict = Body(...)):
    """Save entire map data (in memory)."""
    map_id = _ensure_ns(map_id)
    if map_id not in game_state.maps:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": map_id})
    source = game_state.maps[map_id].get("_source", "")
    body["id"] = map_id
    body["_local_id"] = to_local_id(map_id)
    body["_source"] = source
    body["compiled_grid"] = compile_grid(body)
    body["cell_index"] = {c["id"]: c for c in body.get("cells", [])}
    game_state.maps[map_id] = body
    from game.map_engine import build_distance_matrix
    game_state.distance_matrix = build_distance_matrix(game_state.maps)
    await _mark_dirty()
    state = game_state.get_full_state()
    await manager.broadcast("state_update", state)
    return _resp(True, "ENTITY_UPDATED", {"entity": "map"})


@app.delete("/api/game/maps/{map_id:path}")
async def delete_map_endpoint(map_id: str):
    """Delete a map (in memory)."""
    map_id = _ensure_ns(map_id)
    if map_id not in game_state.maps:
        return _resp(False, "ENTITY_NOT_FOUND", {"entity": "map", "id": map_id})
    del game_state.maps[map_id]
    from game.map_engine import build_distance_matrix
    game_state.distance_matrix = build_distance_matrix(game_state.maps)
    await _mark_dirty()
    state = game_state.get_full_state()
    await manager.broadcast("state_update", state)
    return _resp(True, "ENTITY_DELETED", {"entity": "map"})


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
    return _resp(True, "DECOR_PRESETS_SAVED")


@app.post("/api/session/save")
async def save_session(body: dict = Body({})):
    """Save all changes: rebuild + persist to all addon dirs + clear dirty.

    Optional body: { addons: [...] } to update addon list before saving.
    """
    if not game_state.world_id:
        return _resp(False, "NO_WORLD_LOADED")
    new_addons = body.get("addons")
    game_state.save_all(new_addon_refs=new_addons)
    state = game_state.get_full_state()
    await manager.broadcast("game_changed", state)
    return _resp(True, "SESSION_SAVED")


@app.post("/api/session/save-as")
async def save_session_as(body: dict = Body(...)):
    """Create a new world from current in-memory state, fork addons, and save."""
    from game.addon_loader import save_world_config, WORLDS_DIR
    world_id = body.get("id", "").strip()
    world_name = body.get("name", "").strip()
    if not world_id or not world_name:
        return _resp(False, "FIELD_REQUIRED", {"fields": ["id", "name"]})
    world_dir = WORLDS_DIR / world_id
    if world_dir.exists():
        return _resp(False, "WORLD_ALREADY_EXISTS", {"id": world_id})

    # Fork addon versions for the new world
    new_addon_refs = []
    for ref in game_state.addon_refs:
        if isinstance(ref, dict):
            from game.addon_loader import get_base_version, is_world_fork
            base_ver = get_base_version(ref["version"]) if is_world_fork(ref["version"], game_state.world_id) else ref["version"]
            fork_ver = fork_addon_version(ref["id"], base_ver, world_id)
            new_addon_refs.append({"id": ref["id"], "version": fork_ver})
        else:
            new_addon_refs.append(ref)

    # Create world config
    config = {
        "id": world_id,
        "name": world_name,
        "addons": new_addon_refs,
        "playerCharacter": to_local_id(game_state.player_character),
    }
    save_world_config(world_id, config)

    # Switch to new world
    game_state.load_world(world_id)
    _save_last_world(world_id)

    state = game_state.get_full_state()
    await manager.broadcast("game_changed", state)

    return _resp(True, "WORLD_SAVE_AS_SUCCESS", {"name": world_name})


async def _broadcast_state():
    """Broadcast updated game state to all SSE clients."""
    state = game_state.get_full_state()
    await manager.broadcast("state_update", state)


# --- Apply Changes & Backup ---


# --- SSE ---


@app.get("/api/events")
async def sse_events(request: Request):
    """SSE endpoint for real-time server→client push."""
    async def event_stream():
        queue: asyncio.Queue = asyncio.Queue()
        manager.add(queue)
        try:
            # Send initial state
            state = game_state.get_full_state()
            yield _format_sse("state_update", state)
            # Keep streaming events
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30)
                    yield _format_sse(msg["type"], msg["data"])
                except asyncio.TimeoutError:
                    # Send keepalive comment to prevent connection timeout
                    yield ": keepalive\n\n"
        finally:
            manager.remove(queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- LLM Preset API ---


@app.get("/api/llm/presets")
async def get_llm_presets():
    """List all LLM presets."""
    return {"presets": list_presets()}


@app.get("/api/llm/presets/{preset_id:path}")
async def get_llm_preset(preset_id: str):
    """Get full preset data."""
    data = load_preset(preset_id)
    if data is None:
        return _resp(False, "LLM_PRESET_NOT_FOUND")
    return _resp(True, "", preset=data)


@app.put("/api/llm/presets/{preset_id:path}")
async def put_llm_preset(preset_id: str, request: Request):
    """Create or update a preset."""
    data = await request.json()
    save_preset(preset_id, data)
    return _resp(True, "")


@app.delete("/api/llm/presets/{preset_id:path}")
async def delete_llm_preset(preset_id: str):
    """Delete a preset."""
    if not delete_preset(preset_id):
        return _resp(False, "LLM_PRESET_NOT_FOUND")
    return _resp(True, "")


# --- LLM Provider API ---


@app.get("/api/llm/providers")
async def get_llm_providers():
    """List all LLM providers."""
    return {"providers": list_providers()}


@app.get("/api/llm/providers/{provider_id:path}")
async def get_llm_provider(provider_id: str):
    """Get full provider data."""
    data = load_provider(provider_id)
    if data is None:
        return _resp(False, "LLM_PROVIDER_NOT_FOUND")
    return _resp(True, "", provider=data)


@app.put("/api/llm/providers/{provider_id:path}")
async def put_llm_provider(provider_id: str, request: Request):
    """Create or update a provider."""
    data = await request.json()
    save_provider(provider_id, data)
    return _resp(True, "")


@app.delete("/api/llm/providers/{provider_id:path}")
async def delete_llm_provider(provider_id: str):
    """Delete a provider."""
    if not delete_provider(provider_id):
        return _resp(False, "LLM_PROVIDER_NOT_FOUND")
    return _resp(True, "")


@app.get("/api/llm/models")
async def get_llm_models(base_url: str = Query(...), api_key: str = Query("")):
    """Proxy request to get available models from an OpenAI-compatible API."""
    import httpx
    url = base_url.rstrip("/") + "/models"
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            return _resp(False, "LLM_MODELS_FETCH_FAILED", {
                "status": resp.status_code,
                "detail": resp.text[:500],
            })
        body = resp.json()
        models = [m.get("id", "") for m in body.get("data", [])]
        return _resp(True, "", models=models)
    except httpx.ConnectError:
        return _resp(False, "LLM_CONNECTION_FAILED")
    except httpx.TimeoutException:
        return _resp(False, "LLM_CONNECTION_TIMEOUT")
    except Exception as e:
        return _resp(False, "LLM_CONNECTION_FAILED", {"detail": str(e)})


@app.post("/api/llm/test")
async def test_llm_connection(request: Request):
    """Test LLM API connection by sending a minimal chat completion request."""
    import httpx
    data = await request.json()
    api = data.get("api", {})
    base_url = api.get("baseUrl", "").rstrip("/")
    api_key = api.get("apiKey", "")
    model = api.get("model", "")

    if not base_url:
        return _resp(False, "LLM_BASE_URL_EMPTY")
    if not model:
        return _resp(False, "LLM_MODEL_EMPTY")

    url = base_url + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code == 200:
            return _resp(True, "")
        return _resp(False, "LLM_TEST_FAILED", {
            "status": resp.status_code,
            "detail": resp.text[:500],
        })
    except httpx.ConnectError:
        return _resp(False, "LLM_CONNECTION_FAILED")
    except httpx.TimeoutException:
        return _resp(False, "LLM_CONNECTION_TIMEOUT")
    except Exception as e:
        return _resp(False, "LLM_CONNECTION_FAILED", {"detail": str(e)})


@app.post("/api/llm/generate")
async def llm_generate(request: Request):
    """Trigger LLM generation. Returns SSE stream with llm_chunk/llm_done/llm_error events."""
    from game.llm_engine import (
        build_raw_output, collect_variables, assemble_messages,
        resolve_preset_id, call_llm_streaming,
    )
    data = await request.json()

    # Accept either a preset id to load, or explicit raw_output + preset_id
    raw_output = data.get("rawOutput", "")
    target_id = data.get("targetId")
    preset_id = data.get("presetId") or resolve_preset_id(game_state)

    if not preset_id:
        return _resp(False, "LLM_NO_PRESET")
    preset = load_preset(preset_id)
    if preset is None:
        return _resp(False, "LLM_PRESET_NOT_FOUND")

    # Load provider (API config)
    provider_id = preset.get("providerId", "")
    if not provider_id:
        # Migration: old preset with embedded api block
        api_config = preset.get("api", {})
    else:
        provider = load_provider(provider_id)
        if provider is None:
            return _resp(False, "LLM_PROVIDER_NOT_FOUND")
        api_config = provider

    if not api_config.get("baseUrl"):
        return _resp(False, "LLM_BASE_URL_EMPTY")
    if not api_config.get("model"):
        return _resp(False, "LLM_MODEL_EMPTY")

    # Merge preset-level parameters into api_config for the call
    preset_params = preset.get("parameters")
    if preset_params:
        api_config = {**api_config, "parameters": preset_params}

    # Collect variables and assemble messages
    if target_id:
        target_id = _ensure_ns(target_id)
    action_id = data.get("actionId")
    action_def = game_state.action_defs.get(action_id) if action_id else None
    variables = collect_variables(game_state, raw_output, target_id=target_id, action_def=action_def)
    context = {"previousNarratives": data.get("previousNarratives", [])}
    messages = assemble_messages(preset, variables, game_state, context)

    # Scan preset entries for referenced variable names
    import re as _re
    _var_pattern = _re.compile(r"\{\{([\w.]+(?::[\w.=]+)*)\}\}")
    referenced_vars: set[str] = set()
    for entry in preset.get("promptEntries", []):
        if entry.get("enabled", True):
            for m in _var_pattern.finditer(entry.get("content", "")):
                raw = m.group(1)
                name = raw.split(":")[0]  # strip params
                referenced_vars.add(name)
    used_variables = {k: variables.get(k, "") for k in referenced_vars}

    async def event_stream():
        # Send debug info before generation starts
        debug_info = {
            "presetId": preset_id,
            "presetName": preset.get("name", preset_id),
            "model": api_config.get("model", ""),
            "baseUrl": api_config.get("baseUrl", ""),
            "parameters": api_config.get("parameters", {}),
            "messages": messages,
            "variables": used_variables,
        }
        yield _format_sse("llm_debug", debug_info)

        async for event_type, event_data in call_llm_streaming(api_config, messages):
            yield _format_sse(event_type, event_data)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _get_addon_dir_or_404(addon_id: str, version: str):
    """Get addon directory, return None if not found."""
    from game.addon_loader import get_addon_version_dir
    d = get_addon_version_dir(addon_id, version)
    return d if d.exists() else None


if __name__ == "__main__":
    import uvicorn
    config = load_config()
    port = config.get("backendPort", 18000)
    import sys
    use_reload = "--reload" in sys.argv
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=use_reload)
