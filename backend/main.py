from __future__ import annotations

"""FastAPI entry point — app setup, lifespan, and route registration."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from game.state import GameState, list_available_worlds
from routes import register_routes
from routes._helpers import _save_last_world, load_config


@asynccontextmanager
async def lifespan(app: FastAPI):
    import routes._helpers as helpers
    from game.addon_loader import save_world_config

    helpers.game_state = GameState()

    config = load_config()
    last_world_id = config.get("lastWorldId", "")
    worlds = list_available_worlds()
    world_ids = [w["id"] for w in worlds]

    if last_world_id and last_world_id in world_ids:
        helpers.game_state.load_world(last_world_id)
        print(f"Resumed last world: {helpers.game_state.world_name}")
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
        helpers.game_state.load_world(default_id)
        _save_last_world(default_id)
        print(f"Auto-created default world: {default_name}")
    else:
        helpers.game_state.load_empty()
        print("Started with empty world")

    yield


app = FastAPI(title="AaaliceTavern", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_routes(app)


if __name__ == "__main__":
    import uvicorn

    config = load_config()
    port = config.get("backendPort", 18000)
    import sys

    use_reload = "--reload" in sys.argv
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=use_reload)
