from __future__ import annotations

"""LLM provider management — file I/O for user/llm-providers/ directory."""

import json
from pathlib import Path
from typing import Optional

PROVIDERS_DIR = Path(__file__).resolve().parent.parent.parent / "user" / "llm-providers"


def _provider_path(provider_id: str) -> Path:
    return PROVIDERS_DIR / f"{provider_id}.json"


def list_providers() -> list[dict]:
    """Return list of {id, name} for all providers."""
    if not PROVIDERS_DIR.exists():
        return []
    result = []
    for f in sorted(PROVIDERS_DIR.iterdir()):
        if not f.suffix == ".json":
            continue
        try:
            with open(f, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            result.append(
                {
                    "id": data.get("id", f.stem),
                    "name": data.get("name", f.stem),
                }
            )
        except (json.JSONDecodeError, OSError):
            continue
    return result


def load_provider(provider_id: str) -> Optional[dict]:
    """Load full provider data. Returns None if not found."""
    p = _provider_path(provider_id)
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def save_provider(provider_id: str, data: dict) -> None:
    """Save provider data to disk. Creates directory if needed."""
    p = _provider_path(provider_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    data["id"] = provider_id
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def delete_provider(provider_id: str) -> bool:
    """Delete provider file. Returns True if deleted, False if not found."""
    p = _provider_path(provider_id)
    if not p.exists():
        return False
    p.unlink()
    return True
