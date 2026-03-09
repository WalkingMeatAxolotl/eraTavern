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

from game.state import GameState, list_available_games
from game.action import get_available_actions, execute_action
from game.map_engine import save_map_file, create_map, delete_map, save_decor_presets
from game.character import (
    save_character, delete_character,
    load_item_defs, load_item_tags, save_item_defs_file, save_item_tags_file,
    load_action_defs, save_action_defs_file,
    load_trait_defs, save_trait_defs_file,
    load_trait_groups, save_trait_groups_file,
    load_clothing_defs, save_clothing_defs_file,
)

CONFIG_PATH = Path(__file__).parent.parent / "config.json"


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global game_state
    game_state = GameState()
    # Load first available game
    games = list_available_games()
    if games:
        game_state.load(games[0]["id"])
        print(f"Loaded game: {game_state.game_name}")
        print(f"  Maps: {list(game_state.maps.keys())}")
        print(f"  Characters: {list(game_state.characters.keys())}")
    else:
        print("Warning: No game packages found.")
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


@app.get("/api/games")
async def get_games():
    """List all available game packages."""
    return {"games": list_available_games()}


class SelectGameRequest(BaseModel):
    gameId: str


@app.post("/api/games/select")
async def select_game(req: SelectGameRequest):
    """Switch to a different game package."""
    games = list_available_games()
    game_ids = [g["id"] for g in games]
    if req.gameId not in game_ids:
        return {"success": False, "message": f"Game '{req.gameId}' not found"}

    game_state.load(req.gameId)

    # Broadcast game change to all WebSocket clients
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})

    return {"success": True, "message": f"Switched to {game_state.game_name}"}


@app.post("/api/game/restart")
async def restart_game():
    """Restart current game (reload all data from disk, reset time)."""
    game_state.load(game_state.game_id)
    state = game_state.get_full_state()
    await manager.broadcast({"type": "game_changed", "data": state})
    return {"success": True, "message": f"Game '{game_state.game_name}' restarted"}


@app.get("/assets/{path:path}")
async def serve_asset(path: str):
    """Serve static assets from the current game package."""
    # Path safety: resolve and ensure it stays within assets dir
    assets_dir = game_state.data_dir / "assets"
    file_path = (assets_dir / path).resolve()
    if not str(file_path).startswith(str(assets_dir.resolve())):
        return {"error": "Invalid path"}
    if not file_path.exists():
        return {"error": "File not found"}
    return FileResponse(file_path)


@app.post("/api/assets/upload")
async def upload_asset(
    file: UploadFile = File(...),
    folder: str = Query(...),
    name: str = Query(...),
):
    """Upload an asset file. folder: 'characters' or 'backgrounds'. name: target filename (without ext)."""
    if folder not in ("characters", "backgrounds"):
        return {"success": False, "message": "Invalid folder"}
    # Determine extension from uploaded file
    original_name = file.filename or ""
    ext = Path(original_name).suffix.lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        return {"success": False, "message": f"Unsupported file type: {ext}"}

    target_dir = game_state.data_dir / "assets" / folder
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
    """Update a character config (write to file). Rebuilds runtime state."""
    if character_id not in game_state.character_data:
        return {"success": False, "message": f"Character '{character_id}' not found"}
    body["id"] = character_id
    save_character(game_state.data_dir, body)
    game_state.character_data[character_id] = body
    # Rebuild runtime character state from new data
    game_state.characters[character_id] = game_state._build_char(character_id)
    return {"success": True, "message": f"Character '{character_id}' saved"}


@app.post("/api/game/characters/config")
async def create_character_config(body: dict = Body(...)):
    """Create a new character (write file). Does not affect runtime state."""
    char_id = body.get("id")
    if not char_id:
        return {"success": False, "message": "Missing character id"}
    if char_id in game_state.character_data:
        return {"success": False, "message": f"Character '{char_id}' already exists"}
    save_character(game_state.data_dir, body)
    game_state.character_data[char_id] = body
    game_state.characters[char_id] = game_state._build_char(char_id)
    return {"success": True, "message": f"Character '{char_id}' created"}


@app.patch("/api/game/characters/config/{character_id}")
async def patch_character_config(character_id: str, body: dict = Body(...)):
    """Partial update: toggle isPlayer, active, etc. Does not affect runtime state."""
    if character_id not in game_state.character_data:
        return {"success": False, "message": f"Character '{character_id}' not found"}
    char = game_state.character_data[character_id]

    # isPlayer is exclusive — if setting to True, clear all others
    if body.get("isPlayer") is True:
        for cid, cd in game_state.character_data.items():
            if cd.get("isPlayer"):
                cd["isPlayer"] = False
                save_character(game_state.data_dir, cd)

    for key in ("isPlayer", "active"):
        if key in body:
            char[key] = body[key]

    save_character(game_state.data_dir, char)
    # Rebuild runtime for all affected characters
    for cid in game_state.character_data:
        game_state.characters[cid] = game_state._build_char(cid)
    return {"success": True, "message": f"Character '{character_id}' updated"}


@app.delete("/api/game/characters/config/{character_id}")
async def delete_character_config(character_id: str):
    """Delete a character (remove file). Does not affect runtime state."""
    if character_id not in game_state.character_data:
        return {"success": False, "message": f"Character '{character_id}' not found"}
    delete_character(game_state.data_dir, character_id)
    del game_state.character_data[character_id]
    game_state.characters.pop(character_id, None)
    return {"success": True, "message": f"Character '{character_id}' deleted"}


# --- Trait CRUD ---


@app.get("/api/game/traits")
async def get_traits():
    """Get all trait definitions (builtin + game)."""
    return {"traits": list(game_state.trait_defs.values())}


@app.post("/api/game/traits")
async def create_trait(body: dict = Body(...)):
    """Create a new game trait."""
    trait_id = body.get("id")
    if not trait_id:
        return {"success": False, "message": "Missing trait id"}
    if trait_id in game_state.trait_defs:
        return {"success": False, "message": f"Trait '{trait_id}' already exists"}
    # Read current game traits file, add, write back
    game_traits_path = game_state.data_dir / "traits.json"
    existing = []
    if game_traits_path.exists():
        import json as _json
        with open(game_traits_path, "r", encoding="utf-8") as f:
            existing = _json.load(f).get("traits", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    existing.append(entry)
    save_trait_defs_file(game_state.data_dir, existing)
    game_state.trait_defs = load_trait_defs(game_state.data_dir)
    return {"success": True, "message": f"Trait '{trait_id}' created"}


@app.put("/api/game/traits/{trait_id}")
async def update_trait(trait_id: str, body: dict = Body(...)):
    """Update a game trait. Rejects builtin traits."""
    td = game_state.trait_defs.get(trait_id)
    if not td:
        return {"success": False, "message": f"Trait '{trait_id}' not found"}
    if td.get("source") == "builtin":
        return {"success": False, "message": "Cannot modify builtin trait"}
    # Read game traits, update matching entry, write back
    game_traits_path = game_state.data_dir / "traits.json"
    existing = []
    if game_traits_path.exists():
        import json as _json
        with open(game_traits_path, "r", encoding="utf-8") as f:
            existing = _json.load(f).get("traits", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = trait_id
    existing = [t for t in existing if t["id"] != trait_id]
    existing.append(entry)
    save_trait_defs_file(game_state.data_dir, existing)
    game_state.trait_defs = load_trait_defs(game_state.data_dir)
    return {"success": True, "message": f"Trait '{trait_id}' updated"}


@app.delete("/api/game/traits/{trait_id}")
async def delete_trait(trait_id: str):
    """Delete a game trait. Rejects builtin traits."""
    td = game_state.trait_defs.get(trait_id)
    if not td:
        return {"success": False, "message": f"Trait '{trait_id}' not found"}
    if td.get("source") == "builtin":
        return {"success": False, "message": "Cannot delete builtin trait"}
    # Read game traits, remove matching entry, write back
    game_traits_path = game_state.data_dir / "traits.json"
    existing = []
    if game_traits_path.exists():
        import json as _json
        with open(game_traits_path, "r", encoding="utf-8") as f:
            existing = _json.load(f).get("traits", [])
    existing = [t for t in existing if t["id"] != trait_id]
    save_trait_defs_file(game_state.data_dir, existing)
    game_state.trait_defs = load_trait_defs(game_state.data_dir)
    return {"success": True, "message": f"Trait '{trait_id}' deleted"}


# --- Clothing CRUD ---


@app.get("/api/game/clothing")
async def get_clothing():
    """Get all clothing definitions (builtin + game)."""
    return {"clothing": list(game_state.clothing_defs.values())}


@app.post("/api/game/clothing")
async def create_clothing(body: dict = Body(...)):
    """Create a new game clothing item."""
    item_id = body.get("id")
    if not item_id:
        return {"success": False, "message": "Missing clothing id"}
    if item_id in game_state.clothing_defs:
        return {"success": False, "message": f"Clothing '{item_id}' already exists"}
    game_path = game_state.data_dir / "clothing.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("clothing", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    existing.append(entry)
    save_clothing_defs_file(game_state.data_dir, existing)
    game_state.clothing_defs = load_clothing_defs(game_state.data_dir)
    return {"success": True, "message": f"Clothing '{item_id}' created"}


@app.put("/api/game/clothing/{item_id}")
async def update_clothing(item_id: str, body: dict = Body(...)):
    """Update a game clothing item. Rejects builtin."""
    cd = game_state.clothing_defs.get(item_id)
    if not cd:
        return {"success": False, "message": f"Clothing '{item_id}' not found"}
    if cd.get("source") == "builtin":
        return {"success": False, "message": "Cannot modify builtin clothing"}
    game_path = game_state.data_dir / "clothing.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("clothing", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    existing = [c for c in existing if c["id"] != item_id]
    existing.append(entry)
    save_clothing_defs_file(game_state.data_dir, existing)
    game_state.clothing_defs = load_clothing_defs(game_state.data_dir)
    return {"success": True, "message": f"Clothing '{item_id}' updated"}


@app.delete("/api/game/clothing/{item_id}")
async def delete_clothing(item_id: str):
    """Delete a game clothing item. Rejects builtin."""
    cd = game_state.clothing_defs.get(item_id)
    if not cd:
        return {"success": False, "message": f"Clothing '{item_id}' not found"}
    if cd.get("source") == "builtin":
        return {"success": False, "message": "Cannot delete builtin clothing"}
    game_path = game_state.data_dir / "clothing.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("clothing", [])
    existing = [c for c in existing if c["id"] != item_id]
    save_clothing_defs_file(game_state.data_dir, existing)
    game_state.clothing_defs = load_clothing_defs(game_state.data_dir)
    return {"success": True, "message": f"Clothing '{item_id}' deleted"}


# --- Item CRUD ---


@app.get("/api/game/items")
async def get_items():
    """Get all item definitions (builtin + game)."""
    return {"items": list(game_state.item_defs.values())}


@app.post("/api/game/items")
async def create_item(body: dict = Body(...)):
    """Create a new game item."""
    item_id = body.get("id")
    if not item_id:
        return {"success": False, "message": "Missing item id"}
    if item_id in game_state.item_defs:
        return {"success": False, "message": f"Item '{item_id}' already exists"}
    game_path = game_state.data_dir / "items.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("items", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    existing.append(entry)
    save_item_defs_file(game_state.data_dir, existing)
    game_state.item_defs = load_item_defs(game_state.data_dir)
    return {"success": True, "message": f"Item '{item_id}' created"}


@app.put("/api/game/items/{item_id}")
async def update_item(item_id: str, body: dict = Body(...)):
    """Update a game item. Rejects builtin items."""
    item_def = game_state.item_defs.get(item_id)
    if not item_def:
        return {"success": False, "message": f"Item '{item_id}' not found"}
    if item_def.get("source") == "builtin":
        return {"success": False, "message": "Cannot modify builtin item"}
    game_path = game_state.data_dir / "items.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("items", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = item_id
    existing = [i for i in existing if i["id"] != item_id]
    existing.append(entry)
    save_item_defs_file(game_state.data_dir, existing)
    game_state.item_defs = load_item_defs(game_state.data_dir)
    return {"success": True, "message": f"Item '{item_id}' updated"}


@app.delete("/api/game/items/{item_id}")
async def delete_item(item_id: str):
    """Delete a game item. Rejects builtin items."""
    item_def = game_state.item_defs.get(item_id)
    if not item_def:
        return {"success": False, "message": f"Item '{item_id}' not found"}
    if item_def.get("source") == "builtin":
        return {"success": False, "message": "Cannot delete builtin item"}
    game_path = game_state.data_dir / "items.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("items", [])
    existing = [i for i in existing if i["id"] != item_id]
    save_item_defs_file(game_state.data_dir, existing)
    game_state.item_defs = load_item_defs(game_state.data_dir)
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
    save_item_tags_file(game_state.data_dir, game_state.item_tags)
    return {"success": True, "message": f"Tag '{tag}' added"}


@app.delete("/api/game/item-tags/{tag}")
async def delete_item_tag(tag: str):
    """Remove a tag from the pool."""
    if tag not in game_state.item_tags:
        return {"success": False, "message": f"Tag '{tag}' not found"}
    game_state.item_tags.remove(tag)
    save_item_tags_file(game_state.data_dir, game_state.item_tags)
    return {"success": True, "message": f"Tag '{tag}' deleted"}


# --- Action CRUD ---


@app.get("/api/game/actions")
async def get_actions_defs():
    """Get all action definitions (builtin + game)."""
    return {"actions": list(game_state.action_defs.values())}


@app.post("/api/game/actions")
async def create_action_def(body: dict = Body(...)):
    """Create a new game action."""
    action_id = body.get("id")
    if not action_id:
        return {"success": False, "message": "Missing action id"}
    if action_id in game_state.action_defs:
        return {"success": False, "message": f"Action '{action_id}' already exists"}
    game_path = game_state.data_dir / "actions.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("actions", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    existing.append(entry)
    save_action_defs_file(game_state.data_dir, existing)
    game_state.action_defs = load_action_defs(game_state.data_dir)
    return {"success": True, "message": f"Action '{action_id}' created"}


@app.put("/api/game/actions/{action_id}")
async def update_action_def(action_id: str, body: dict = Body(...)):
    """Update a game action. Rejects builtin."""
    action_def = game_state.action_defs.get(action_id)
    if not action_def:
        return {"success": False, "message": f"Action '{action_id}' not found"}
    if action_def.get("source") == "builtin":
        return {"success": False, "message": "Cannot modify builtin action"}
    game_path = game_state.data_dir / "actions.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("actions", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = action_id
    existing = [a for a in existing if a["id"] != action_id]
    existing.append(entry)
    save_action_defs_file(game_state.data_dir, existing)
    game_state.action_defs = load_action_defs(game_state.data_dir)
    return {"success": True, "message": f"Action '{action_id}' updated"}


@app.delete("/api/game/actions/{action_id}")
async def delete_action_def(action_id: str):
    """Delete a game action. Rejects builtin."""
    action_def = game_state.action_defs.get(action_id)
    if not action_def:
        return {"success": False, "message": f"Action '{action_id}' not found"}
    if action_def.get("source") == "builtin":
        return {"success": False, "message": "Cannot delete builtin action"}
    game_path = game_state.data_dir / "actions.json"
    existing = []
    if game_path.exists():
        with open(game_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("actions", [])
    existing = [a for a in existing if a["id"] != action_id]
    save_action_defs_file(game_state.data_dir, existing)
    game_state.action_defs = load_action_defs(game_state.data_dir)
    return {"success": True, "message": f"Action '{action_id}' deleted"}


# --- Trait Group CRUD ---


@app.get("/api/game/trait-groups")
async def get_trait_groups():
    """Get all trait group definitions (builtin + game)."""
    return {"traitGroups": list(game_state.trait_groups.values())}


@app.post("/api/game/trait-groups")
async def create_trait_group(body: dict = Body(...)):
    """Create a new game trait group."""
    group_id = body.get("id")
    if not group_id:
        return {"success": False, "message": "Missing group id"}
    if group_id in game_state.trait_groups:
        return {"success": False, "message": f"Trait group '{group_id}' already exists"}
    # Read current game trait groups, add, write back
    game_traits_path = game_state.data_dir / "traits.json"
    existing = []
    if game_traits_path.exists():
        with open(game_traits_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("traitGroups", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    existing.append(entry)
    save_trait_groups_file(game_state.data_dir, existing)
    game_state.trait_groups = load_trait_groups(game_state.data_dir)
    return {"success": True, "message": f"Trait group '{group_id}' created"}


@app.put("/api/game/trait-groups/{group_id}")
async def update_trait_group(group_id: str, body: dict = Body(...)):
    """Update a game trait group. Rejects builtin groups."""
    tg = game_state.trait_groups.get(group_id)
    if not tg:
        return {"success": False, "message": f"Trait group '{group_id}' not found"}
    if tg.get("source") == "builtin":
        return {"success": False, "message": "Cannot modify builtin trait group"}
    game_traits_path = game_state.data_dir / "traits.json"
    existing = []
    if game_traits_path.exists():
        with open(game_traits_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("traitGroups", [])
    entry = {k: v for k, v in body.items() if k != "source"}
    entry["id"] = group_id
    existing = [g for g in existing if g["id"] != group_id]
    existing.append(entry)
    save_trait_groups_file(game_state.data_dir, existing)
    game_state.trait_groups = load_trait_groups(game_state.data_dir)
    return {"success": True, "message": f"Trait group '{group_id}' updated"}


@app.delete("/api/game/trait-groups/{group_id}")
async def delete_trait_group(group_id: str):
    """Delete a game trait group. Rejects builtin groups."""
    tg = game_state.trait_groups.get(group_id)
    if not tg:
        return {"success": False, "message": f"Trait group '{group_id}' not found"}
    if tg.get("source") == "builtin":
        return {"success": False, "message": "Cannot delete builtin trait group"}
    game_traits_path = game_state.data_dir / "traits.json"
    existing = []
    if game_traits_path.exists():
        with open(game_traits_path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("traitGroups", [])
    existing = [g for g in existing if g["id"] != group_id]
    save_trait_groups_file(game_state.data_dir, existing)
    game_state.trait_groups = load_trait_groups(game_state.data_dir)
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
    """Create a new empty map."""
    if req.id in game_state.maps:
        return {"success": False, "message": f"Map '{req.id}' already exists"}
    create_map(game_state.data_dir, req.id, req.name, req.rows, req.cols)
    game_state.reload_maps()
    return {"success": True, "message": f"Map '{req.id}' created"}


@app.put("/api/game/maps/raw/{map_id}")
async def update_map_raw(map_id: str, body: dict = Body(...)):
    """Save entire map data (grid + cells + metadata)."""
    if map_id not in game_state.maps:
        return {"success": False, "message": f"Map '{map_id}' not found"}
    body["id"] = map_id
    save_map_file(game_state.data_dir, map_id, body)
    game_state.reload_maps()
    state = game_state.get_full_state()
    await manager.broadcast({"type": "state_update", "data": state})
    return {"success": True, "message": f"Map '{map_id}' saved"}


@app.delete("/api/game/maps/{map_id}")
async def delete_map_endpoint(map_id: str):
    """Delete a map."""
    if map_id not in game_state.maps:
        return {"success": False, "message": f"Map '{map_id}' not found"}
    deleted = delete_map(game_state.data_dir, map_id)
    if not deleted:
        return {"success": False, "message": f"Failed to delete map '{map_id}'"}
    game_state.reload_maps()
    state = game_state.get_full_state()
    await manager.broadcast({"type": "state_update", "data": state})
    return {"success": True, "message": f"Map '{map_id}' deleted"}


@app.get("/api/game/decor-presets")
async def get_decor_presets():
    """Get decoration presets for the map editor."""
    return {"presets": game_state.decor_presets}


@app.put("/api/game/decor-presets")
async def update_decor_presets(body: dict = Body(...)):
    """Save game-specific decor presets."""
    presets = body.get("presets", [])
    save_decor_presets(game_state.data_dir, presets)
    from game.map_engine import load_decor_presets
    game_state.decor_presets = load_decor_presets(game_state.data_dir)
    return {"success": True, "message": "Decor presets saved"}


async def _broadcast_state():
    """Broadcast updated game state to all WebSocket clients."""
    state = game_state.get_full_state()
    await manager.broadcast({"type": "state_update", "data": state})


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


if __name__ == "__main__":
    import uvicorn
    config = load_config()
    port = config.get("backendPort", 18000)
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
