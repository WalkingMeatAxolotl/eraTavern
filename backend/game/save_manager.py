"""Save slot manager — CRUD for game save files."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from .addon_loader import WORLDS_DIR

MAX_SLOTS = 10


def _world_save_dir(world_id: str) -> Path:
    return WORLDS_DIR / world_id / "saves"


def list_saves(world_id: str) -> list[dict[str, Any]]:
    """Return list of save slot metadata for a world, sorted by timestamp desc."""
    d = _world_save_dir(world_id)
    if not d.exists():
        return []
    metas: list[dict[str, Any]] = []
    for f in d.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            metas.append(data.get("meta", {}))
        except (json.JSONDecodeError, OSError):
            continue
    metas.sort(key=lambda m: m.get("timestamp", ""), reverse=True)
    return metas


def create_save(
    world_id: str,
    slot_id: str,
    name: str,
    runtime: dict[str, Any],
    meta_info: dict[str, Any],
) -> dict[str, Any]:
    """Create or overwrite a save slot. Returns the meta."""
    d = _world_save_dir(world_id)
    d.mkdir(parents=True, exist_ok=True)

    meta = {
        "slotId": slot_id,
        "name": name,
        **meta_info,
    }
    save_data = {"meta": meta, "runtime": runtime}
    path = d / f"{slot_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(save_data, f, ensure_ascii=False, indent=2)
    return meta


def load_save(world_id: str, slot_id: str) -> dict[str, Any] | None:
    """Load a save file, returns full {meta, runtime} or None."""
    path = _world_save_dir(world_id) / f"{slot_id}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def delete_save(world_id: str, slot_id: str) -> bool:
    """Delete a save slot. Returns True if deleted."""
    path = _world_save_dir(world_id) / f"{slot_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False


def rename_save(world_id: str, slot_id: str, name: str) -> bool:
    """Rename a save slot. Returns True if successful."""
    path = _world_save_dir(world_id) / f"{slot_id}.json"
    if not path.exists():
        return False
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["meta"]["name"] = name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return True


def delete_world_saves(world_id: str) -> None:
    """Delete all saves for a world (call when world is deleted)."""
    d = _world_save_dir(world_id)
    if d.exists():
        shutil.rmtree(d)
