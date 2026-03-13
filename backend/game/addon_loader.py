"""Add-on and World loading utilities.

Supports versioned addon directories: addons/<addon_id>/<version>/
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

# Directory constants — use resolve() to avoid relative path issues
_BACKEND_DIR = Path(__file__).resolve().parent.parent
ADDONS_DIR = _BACKEND_DIR.parent / "addons"
DATA_DIR = _BACKEND_DIR / "data"
WORLDS_DIR = DATA_DIR / "worlds"
SAVES_DIR = DATA_DIR / "saves"
TEMPLATE_PATH = DATA_DIR / "character_template.json"


def _load_json_safe(path: Path) -> dict:
    """Load a JSON file, returning empty dict if not found."""
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_addons() -> list[dict[str, Any]]:
    """Scan addons/<id>/<version>/ and return list of addon metadata.

    Returns all installed addon versions.
    """
    addons: list[dict[str, Any]] = []
    if not ADDONS_DIR.exists():
        return addons
    for addon_dir in sorted(ADDONS_DIR.iterdir()):
        if not addon_dir.is_dir():
            continue
        for version_dir in sorted(addon_dir.iterdir()):
            if not version_dir.is_dir():
                continue
            meta_path = version_dir / "addon.json"
            if meta_path.exists():
                meta = _load_json_safe(meta_path)
                addons.append(meta)
    return addons


def list_worlds() -> list[dict[str, Any]]:
    """Scan worlds/ directory and return list of world configs."""
    worlds: list[dict[str, Any]] = []
    if not WORLDS_DIR.exists():
        return worlds
    for world_dir in sorted(WORLDS_DIR.iterdir()):
        if not world_dir.is_dir():
            continue
        config_path = world_dir / "world.json"
        if config_path.exists():
            config = _load_json_safe(config_path)
            worlds.append(config)
    return worlds


def load_world_config(world_id: str) -> dict[str, Any]:
    """Load a specific world's config."""
    config_path = WORLDS_DIR / world_id / "world.json"
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_world_config(world_id: str, config: dict[str, Any]) -> None:
    """Save a world config to disk."""
    world_dir = WORLDS_DIR / world_id
    world_dir.mkdir(parents=True, exist_ok=True)
    config_path = world_dir / "world.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def get_addon_version_dir(addon_id: str, version: str) -> Path:
    """Get the versioned directory path for an addon."""
    return ADDONS_DIR / addon_id / version


def get_addon_dir(addon_id: str, version: str | None = None) -> Path:
    """Get addon directory. If version given, returns versioned path.

    If version is None, returns the addon base dir (for listing versions).
    """
    if version:
        return ADDONS_DIR / addon_id / version
    return ADDONS_DIR / addon_id


def get_world_dir(world_id: str) -> Path:
    """Get the world directory path (overlay + config)."""
    return WORLDS_DIR / world_id


def build_addon_dirs(
    addon_refs: list[dict[str, str]] | list[str],
) -> list[tuple[str, Path]]:
    """Build ordered list of (addon_id, addon_path) from addon references.

    Args:
        addon_refs: List of {"id": str, "version": str} dicts, or legacy string list.

    Returns:
        Ordered list of (source_tag, directory_path) tuples.
    """
    result: list[tuple[str, Path]] = []

    for ref in addon_refs:
        if isinstance(ref, str):
            # Legacy format: bare addon ID — find latest version
            addon_id = ref
            version = _find_latest_version(addon_id)
            if version is None:
                continue
        else:
            addon_id = ref["id"]
            version = ref["version"]

        addon_path = ADDONS_DIR / addon_id / version
        if addon_path.exists():
            result.append((addon_id, addon_path))

    return result


def _find_latest_version(addon_id: str) -> str | None:
    """Find the latest version directory for an addon (by sorted name)."""
    addon_base = ADDONS_DIR / addon_id
    if not addon_base.exists():
        return None
    versions = sorted(
        (d.name for d in addon_base.iterdir() if d.is_dir()),
        reverse=True,
    )
    return versions[0] if versions else None


def fork_addon_version(addon_id: str, base_version: str, world_id: str) -> str:
    """Create a world-specific fork of an addon version.

    Copies addons/{addon_id}/{base_version}/ → addons/{addon_id}/{base_version}-{world_id}/
    Updates addon.json version field in the fork.
    Returns the fork version string. Idempotent (returns existing fork if present).
    """
    fork_version = f"{base_version}-{world_id}"
    src = ADDONS_DIR / addon_id / base_version
    dst = ADDONS_DIR / addon_id / fork_version
    if dst.exists():
        return fork_version  # already forked
    if not src.exists():
        raise FileNotFoundError(f"Addon {addon_id}@{base_version} not found")
    shutil.copytree(str(src), str(dst))
    # Update version in forked addon.json
    meta_path = dst / "addon.json"
    if meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        meta["version"] = fork_version
        meta["_forkedFrom"] = base_version
        meta["_worldId"] = world_id
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    return fork_version


def is_world_fork(version: str, world_id: str) -> bool:
    """Check if a version string is a fork for the given world."""
    return version.endswith(f"-{world_id}")


def get_base_version(version: str) -> str:
    """Extract the base version from a fork version string.

    '1.0.0-myworld' → '1.0.0', '1.0.0' → '1.0.0'
    """
    # Find the last '-' that separates version from world_id
    # Version format: X.Y.Z or X.Y.Z-worldId
    parts = version.rsplit("-", 1)
    if len(parts) == 2 and "." in parts[0]:
        return parts[0]
    return version


def list_addon_versions(addon_id: str) -> list[str]:
    """List all version directories for an addon."""
    addon_base = ADDONS_DIR / addon_id
    if not addon_base.exists():
        return []
    return sorted(d.name for d in addon_base.iterdir() if d.is_dir())


def load_template() -> dict:
    """Load the global character template."""
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def resolve_asset_path(
    filename: str, subfolder: str, addon_dirs: list[tuple[str, Path]]
) -> Path | None:
    """Resolve an asset file by searching addon directories in reverse order."""
    for addon_id, addon_path in reversed(addon_dirs):
        candidate = addon_path / "assets" / subfolder / filename
        if candidate.exists():
            return candidate
    return None


def find_addon_for_asset(
    filename: str, subfolder: str, addon_dirs: list[tuple[str, Path]]
) -> str | None:
    """Find which addon contains an asset file. Returns addon_id or None."""
    for addon_id, addon_path in reversed(addon_dirs):
        candidate = addon_path / "assets" / subfolder / filename
        if candidate.exists():
            return addon_id
    return None


