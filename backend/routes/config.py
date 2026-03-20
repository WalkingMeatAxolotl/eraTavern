from __future__ import annotations

"""Config API routes."""

import json

from fastapi import APIRouter, Body

from routes._helpers import CONFIG_PATH, _resp, load_config

router = APIRouter()


@router.get("/api/config")
async def get_config():
    """Get frontend-relevant config."""
    config = load_config()
    return {
        "maxWidth": config.get("maxWidth", 1200),
        "defaultLlmPreset": config.get("defaultLlmPreset", ""),
        "aiAssistPresetId": config.get("aiAssistPresetId", ""),
    }


@router.put("/api/config")
async def update_config(body: dict = Body(...)):
    """Update frontend-relevant config fields."""
    config = load_config()
    for key in ("defaultLlmPreset", "aiAssistPresetId"):
        if key in body:
            config[key] = body[key]
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    return _resp(True, "")
