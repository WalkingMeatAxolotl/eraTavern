"""Shared state and utilities for all route modules."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Optional

from game.character import namespace_id
from game.state import GameState

CONFIG_PATH = Path(__file__).parent.parent.parent / "config.json"


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
    """Validate a user-provided entity ID. Returns error response dict or None."""
    from game.character import NS_SEP

    if not raw_id:
        return _resp(False, "VALIDATION_ID_EMPTY")
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
        return entity_id
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


async def _broadcast_state() -> None:
    """Broadcast updated game state to all SSE clients."""
    if game_state:
        state = game_state.get_full_state()
        await manager.broadcast("state_update", state)


def _get_addon_dir_or_404(addon_id: str, version: str):
    """Get addon directory, return None if not found."""
    from game.addon_loader import get_addon_version_dir

    d = get_addon_version_dir(addon_id, version)
    return d if d.exists() else None
