"""Route registration — include all sub-routers into the FastAPI app."""

from __future__ import annotations

from fastapi import FastAPI

from . import addons, assets, config, entities, game, llm, maps, saves, sse, worlds


def register_routes(app: FastAPI) -> None:
    """Register all route modules with the app."""
    app.include_router(config.router)
    app.include_router(worlds.router)
    app.include_router(addons.router)
    app.include_router(saves.router)
    app.include_router(assets.router)
    app.include_router(game.router)
    app.include_router(entities.router)
    app.include_router(maps.router)
    app.include_router(llm.router)
    app.include_router(sse.router)
