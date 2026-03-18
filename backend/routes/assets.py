from __future__ import annotations

import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import FileResponse

import routes._helpers as _h
from game.addon_loader import ADDONS_DIR, get_addon_dir
from routes._helpers import _resp

router = APIRouter()


@router.get("/assets/{path:path}")
async def serve_asset(path: str):
    """Serve static assets.

    Path formats:
      - world/{worldId}/{subfolder}/{filename} — world assets
      - {addonId}/{subfolder}/{filename} — addon assets
    Searches both about/ and assets/ subdirectories.
    """
    from game.addon_loader import WORLDS_DIR

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
    for addon_id, addon_path in reversed(_h.game_state.addon_dirs):
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


@router.post("/api/assets")
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
    elif _h.game_state.addon_dirs:
        # Default: use last addon's root assets dir
        last_addon_id = _h.game_state.addon_dirs[-1][0]
        target_dir = get_addon_dir(last_addon_id) / "assets" / folder
    else:
        return _resp(False, "ASSET_NO_ADDON")

    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{name}{ext}"

    with open(target_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {"success": True, "filename": f"{name}{ext}"}
