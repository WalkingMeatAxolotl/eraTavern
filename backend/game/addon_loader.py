"""Add-on and World loading utilities.

Supports versioned addon directories: addons/<addon_id>/<version>/
and writeTarget addon for CRUD writes.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

# Directory constants
_BACKEND_DIR = Path(__file__).parent.parent
ADDONS_DIR = _BACKEND_DIR.parent / "addons"
DATA_DIR = _BACKEND_DIR / "data"
WORLDS_DIR = DATA_DIR / "worlds"
TEMPLATE_PATH = DATA_DIR / "character_template.json"

# Source tag for world overlay entities
OVERLAY_SOURCE = "_overlay"


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
    world_id: str | None = None,
) -> list[tuple[str, Path]]:
    """Build ordered list of (addon_id, addon_path) from addon references.

    Args:
        addon_refs: List of {"id": str, "version": str} dicts, or legacy string list.
        world_id: Deprecated, ignored. Overlay is no longer appended.

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


def create_custom_addon(
    world_id: str,
    addon_refs: list[dict[str, str]],
    version: str = "1.0.0",
) -> str:
    """Create a world-custom addon. Returns the addon ID.

    The custom addon depends on all addons currently in the world.
    """
    addon_id = f"{world_id}-custom"
    addon_path = ADDONS_DIR / addon_id / version
    addon_path.mkdir(parents=True, exist_ok=True)

    meta = {
        "id": addon_id,
        "name": f"{world_id} custom",
        "version": version,
        "description": "Auto-created addon for world-specific edits",
        "categories": [],
        "dependencies": [
            {"id": ref["id"], "version": ref["version"]}
            for ref in addon_refs
            if isinstance(ref, dict)
        ],
    }
    meta_path = addon_path / "addon.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    return addon_id


def migrate_world_overlay_to_addon(world_id: str, addon_id: str, version: str = "1.0.0") -> bool:
    """Migrate overlay entity files from world directory to custom addon.

    Moves: characters/, items.json, traits.json, clothing.json, actions.json,
           trait_groups.json, item_tags.json, map_collection.json, maps/,
           decor_presets.json, assets/
    Keeps in world dir: world.json, save/
    Returns True if any files were migrated.
    """
    world_dir = WORLDS_DIR / world_id
    addon_dir = ADDONS_DIR / addon_id / version
    addon_dir.mkdir(parents=True, exist_ok=True)

    migrated = False
    # Files to move
    entity_files = [
        "items.json", "traits.json", "clothing.json", "actions.json",
        "trait_groups.json", "item_tags.json", "map_collection.json",
        "decor_presets.json",
    ]
    for fname in entity_files:
        src = world_dir / fname
        if src.exists():
            dst = addon_dir / fname
            shutil.copy2(str(src), str(dst))
            src.unlink()
            migrated = True

    # Directories to move
    entity_dirs = ["characters", "maps", "assets"]
    for dname in entity_dirs:
        src = world_dir / dname
        if src.exists() and src.is_dir():
            dst = addon_dir / dname
            if dst.exists():
                shutil.rmtree(str(dst))
            shutil.copytree(str(src), str(dst))
            shutil.rmtree(str(src))
            migrated = True

    return migrated


def get_write_target_dir(
    write_target_id: str,
    addon_dirs: list[tuple[str, Path]],
) -> Path | None:
    """Resolve the write target addon directory from addon_dirs."""
    for addon_id, addon_path in addon_dirs:
        if addon_id == write_target_id:
            return addon_path
    return None


MAX_BACKUPS = 5


def create_backup(world_id: str) -> str | None:
    """Create a backup snapshot of the world's save directory.

    Returns the backup name (timestamp) or None if nothing to backup.
    """
    world_dir = WORLDS_DIR / world_id
    save_dir = world_dir / "save"

    # Nothing to backup if no save dir
    if not save_dir.exists():
        return None

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backups_dir = world_dir / "backups"
    backup_path = backups_dir / timestamp
    backup_path.mkdir(parents=True, exist_ok=True)

    # Copy save/ contents to backup
    shutil.copytree(str(save_dir), str(backup_path / "save"), dirs_exist_ok=True)

    # Also backup world.json
    world_json = world_dir / "world.json"
    if world_json.exists():
        shutil.copy2(str(world_json), str(backup_path / "world.json"))

    # Prune old backups
    _prune_backups(backups_dir)

    return timestamp


def _prune_backups(backups_dir: Path) -> None:
    """Keep only the most recent MAX_BACKUPS backups."""
    if not backups_dir.exists():
        return
    backups = sorted(
        (d for d in backups_dir.iterdir() if d.is_dir()),
        key=lambda d: d.name,
        reverse=True,
    )
    for old in backups[MAX_BACKUPS:]:
        shutil.rmtree(str(old))


def list_backups(world_id: str) -> list[str]:
    """List available backup timestamps for a world."""
    backups_dir = WORLDS_DIR / world_id / "backups"
    if not backups_dir.exists():
        return []
    return sorted(
        (d.name for d in backups_dir.iterdir() if d.is_dir()),
        reverse=True,
    )


def restore_backup(world_id: str, timestamp: str) -> bool:
    """Restore a world backup. Returns True on success."""
    world_dir = WORLDS_DIR / world_id
    backup_path = world_dir / "backups" / timestamp
    if not backup_path.exists():
        return False

    # Restore save/
    save_backup = backup_path / "save"
    if save_backup.exists():
        save_dir = world_dir / "save"
        if save_dir.exists():
            shutil.rmtree(str(save_dir))
        shutil.copytree(str(save_backup), str(save_dir))

    # Restore world.json if present in backup
    world_json_backup = backup_path / "world.json"
    if world_json_backup.exists():
        shutil.copy2(str(world_json_backup), str(world_dir / "world.json"))

    return True
