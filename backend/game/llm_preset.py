from __future__ import annotations

"""LLM preset management — file I/O for llm-presets/ directory."""

import json
from pathlib import Path
from typing import Optional

PRESETS_DIR = Path(__file__).resolve().parent.parent.parent / "user" / "llm-presets"


def _preset_path(preset_id: str) -> Path:
    return PRESETS_DIR / preset_id / "preset.json"


def list_presets() -> list[dict]:
    """Return list of {id, name, description} for all presets."""
    if not PRESETS_DIR.exists():
        return []
    result = []
    for d in sorted(PRESETS_DIR.iterdir()):
        if not d.is_dir():
            continue
        p = d / "preset.json"
        if not p.exists():
            continue
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            result.append(
                {
                    "id": data.get("id", d.name),
                    "name": data.get("name", d.name),
                    "description": data.get("description", ""),
                }
            )
        except (json.JSONDecodeError, OSError):
            continue
    return result


def load_preset(preset_id: str) -> Optional[dict]:
    """Load full preset data. Returns None if not found."""
    p = _preset_path(preset_id)
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def save_preset(preset_id: str, data: dict) -> None:
    """Save preset data to disk. Creates directory if needed."""
    p = _preset_path(preset_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    data["id"] = preset_id
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def delete_preset(preset_id: str) -> bool:
    """Delete preset directory. Returns True if deleted, False if not found."""
    d = PRESETS_DIR / preset_id
    if not d.exists():
        return False
    import shutil

    shutil.rmtree(d)
    return True
