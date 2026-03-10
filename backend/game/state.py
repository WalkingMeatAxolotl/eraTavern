"""GameState manager (singleton) - holds all maps and character data."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from .map_engine import load_map_collection, load_decor_presets
from .character import (
    load_template,
    load_clothing_defs,
    load_item_defs,
    load_item_tags,
    load_action_defs,
    load_trait_defs,
    load_trait_groups,
    load_characters,
    build_character_state,
    get_ability_defs,
    get_experience_defs,
    apply_ability_decay,
)
from .addon_loader import (
    ADDONS_DIR,
    OVERLAY_SOURCE,
    list_addons as _list_addons,
    list_worlds as _list_worlds,
    load_world_config,
    save_world_config,
    build_addon_dirs,
    load_template as _load_global_template,
    get_addon_dir,
    get_world_dir,
    create_custom_addon,
    get_write_target_dir,
    migrate_world_overlay_to_addon,
)
from .time_system import GameTime


def list_available_worlds() -> list[dict[str, Any]]:
    """List all available worlds."""
    worlds = _list_worlds()
    result: list[dict[str, Any]] = []
    for w in worlds:
        result.append({
            "id": w["id"],
            "name": w["name"],
            "addons": w.get("addons", []),
            "writeTarget": w.get("writeTarget", ""),
            "playerCharacter": w.get("playerCharacter", ""),
        })
    return result


def list_available_addons() -> list[dict[str, Any]]:
    """List all installed addons."""
    return _list_addons()


# Keep legacy function for backward compat during migration
def list_available_games() -> list[dict[str, str]]:
    """Legacy: list worlds as games."""
    return list_available_worlds()


class GameState:
    """Singleton game state holding all runtime data."""

    _instance: "GameState | None" = None

    def __new__(cls) -> "GameState":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self.world_id: str = ""
        self.world_name: str = ""
        self.addon_refs: list[dict[str, str]] = []
        self.addon_dirs: list[tuple[str, Path]] = []
        self.overlay_dir: Path = Path()  # world overlay directory
        self.write_target_id: str = ""  # addon ID for CRUD writes
        self.write_target_dir: Path = Path()  # resolved directory for write target
        self.player_character: str = ""  # player character ID from world config
        self.dirty: bool = False  # True when in-memory state has unsaved changes
        # Legacy aliases
        self.game_id: str = ""
        self.game_name: str = ""
        self.data_dir: Path = Path()  # points to write_target_dir
        self.maps: dict[str, dict] = {}
        self.template: dict = {}
        self.clothing_defs: dict[str, dict] = {}
        self.item_defs: dict[str, dict] = {}
        self.item_tags: list[str] = []
        self.trait_defs: dict[str, dict] = {}
        self.action_defs: dict[str, dict] = {}
        self.trait_groups: dict[str, dict] = {}
        self.character_data: dict[str, dict] = {}
        self.characters: dict[str, dict[str, Any]] = {}
        self.decor_presets: list[dict] = []
        self.distance_matrix: dict = {}
        self.npc_goals: dict[str, dict] = {}
        self.npc_activities: dict[str, str] = {}
        self.npc_full_log: list[dict] = []
        self.time = GameTime()

    def load_empty(self) -> None:
        """Initialize empty state with no world loaded."""
        self.world_id = ""
        self.world_name = ""
        self.addon_refs = []
        self.addon_dirs = []
        self.overlay_dir = Path()
        self.write_target_id = ""
        self.write_target_dir = Path()
        self.player_character = ""
        self.dirty = False
        self.game_id = ""
        self.game_name = ""
        self.data_dir = Path()
        self.maps = {}
        self.template = _load_global_template()
        self.clothing_defs = {}
        self.item_defs = {}
        self.item_tags = []
        self.trait_defs = {}
        self.action_defs = {}
        self.trait_groups = {}
        self.character_data = {}
        self.characters = {}
        self.decor_presets = []
        self.distance_matrix = {}
        self.npc_goals = {}
        self.npc_activities = {}
        self.npc_full_log = []
        self.time = GameTime()

    def load_session_addons(self, addon_refs: list[dict[str, str]]) -> None:
        """Load addons into session without a world. No overlay layer."""
        self.world_id = ""
        self.world_name = ""
        self.addon_refs = addon_refs
        self.addon_dirs = build_addon_dirs(addon_refs)
        self.overlay_dir = Path()
        self.write_target_id = ""
        self.write_target_dir = Path()
        self.player_character = ""
        self.dirty = False
        self.game_id = ""
        self.game_name = ""
        self.data_dir = Path()

        # Load from addons
        from .map_engine import build_distance_matrix
        collection = load_map_collection(self.addon_dirs)
        self.maps = collection["maps"]
        self.distance_matrix = build_distance_matrix(self.maps)
        self.decor_presets = load_decor_presets(self.addon_dirs)
        self.template = _load_global_template()
        self.clothing_defs = load_clothing_defs(self.addon_dirs)
        self.item_defs = load_item_defs(self.addon_dirs)
        self.item_tags = load_item_tags(self.addon_dirs)
        self.trait_defs = load_trait_defs(self.addon_dirs)
        self.action_defs = load_action_defs(self.addon_dirs)
        self.trait_groups = load_trait_groups(self.addon_dirs)
        self.character_data = load_characters(self.addon_dirs)

        self.characters = {}
        for char_id, char_data in self.character_data.items():
            self.characters[char_id] = build_character_state(
                char_data, self.template, self.clothing_defs, self.trait_defs,
                self.item_defs,
            )

        self.time = GameTime()
        self.npc_goals = {}
        self.npc_activities = {}
        self.npc_full_log = []

    def load(self, game_id: str) -> None:
        """Legacy load method — loads a world by ID."""
        self.load_world(game_id)

    def load_world(self, world_id: str) -> None:
        """Load all game data from a world configuration."""
        world_config = load_world_config(world_id)
        self.world_id = world_config["id"]
        self.world_name = world_config["name"]
        self.addon_refs = world_config.get("addons", [])
        self.player_character = world_config.get("playerCharacter", "")

        # Auto-create custom addon if writeTarget not set (migration)
        write_target = world_config.get("writeTarget", "")
        if not write_target:
            custom_id = create_custom_addon(world_id, self.addon_refs)
            custom_ref = {"id": custom_id, "version": "1.0.0"}
            # Migrate overlay entity files to custom addon
            migrate_world_overlay_to_addon(world_id, custom_id)
            # Add custom addon to refs if not already present
            if not any(r.get("id") == custom_id for r in self.addon_refs):
                self.addon_refs.append(custom_ref)
            write_target = custom_id
            # Migrate playerCharacter from initialState if present
            initial_state = world_config.get("initialState", {})
            if initial_state.get("playerCharacter"):
                world_config["playerCharacter"] = initial_state["playerCharacter"]
            # Persist the updated config
            world_config["addons"] = self.addon_refs
            world_config["writeTarget"] = write_target
            world_config.pop("initialState", None)
            save_world_config(world_id, world_config)
            # Re-read playerCharacter after migration
            self.player_character = world_config.get("playerCharacter", "")

        self.write_target_id = write_target
        self.addon_dirs = build_addon_dirs(self.addon_refs)
        self.overlay_dir = get_world_dir(world_id)

        # Resolve write target directory
        wt_dir = get_write_target_dir(self.write_target_id, self.addon_dirs)
        self.write_target_dir = wt_dir if wt_dir else self.overlay_dir

        # Legacy aliases
        self.game_id = self.world_id
        self.game_name = self.world_name
        self.data_dir = self.write_target_dir

        # Load maps from all addons
        collection = load_map_collection(self.addon_dirs)
        self.maps = collection["maps"]

        # Pre-compute distance matrix for NPC pathfinding
        from .map_engine import build_distance_matrix
        self.distance_matrix = build_distance_matrix(self.maps)

        # Load decor presets from all addons
        self.decor_presets = load_decor_presets(self.addon_dirs)

        # Load character system
        self.template = _load_global_template()
        self.clothing_defs = load_clothing_defs(self.addon_dirs)
        self.item_defs = load_item_defs(self.addon_dirs)
        self.item_tags = load_item_tags(self.addon_dirs)
        self.trait_defs = load_trait_defs(self.addon_dirs)
        self.action_defs = load_action_defs(self.addon_dirs)
        self.trait_groups = load_trait_groups(self.addon_dirs)
        self.character_data = load_characters(self.addon_dirs)

        # Build character states
        self.characters = {}
        for char_id, char_data in self.character_data.items():
            self.characters[char_id] = build_character_state(
                char_data, self.template, self.clothing_defs, self.trait_defs,
                self.item_defs,
            )

        # Reset time and NPC state
        self.time = GameTime()
        self.npc_goals = {}
        self.npc_activities = {}
        self.npc_full_log = []
        self.dirty = False

    def _persist_entity_files(self) -> None:
        """Write entities belonging to writeTarget addon to disk (no dirty clear)."""
        if not self.write_target_dir or not str(self.write_target_dir):
            return

        target_source = self.write_target_id
        if not target_source:
            return

        from .character import (
            save_clothing_defs_file, save_item_defs_file, save_item_tags_file,
            save_trait_defs_file, save_action_defs_file, save_trait_groups_file,
        )
        from .map_engine import save_map_file, save_decor_presets as _save_decor_presets

        target_dir = self.write_target_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        # Save items belonging to write target
        target_items = [
            {k: v for k, v in d.items() if k != "source"}
            for d in self.item_defs.values()
            if d.get("source") == target_source
        ]
        if target_items:
            save_item_defs_file(target_dir, target_items)

        # Save traits belonging to write target
        target_traits = [
            {k: v for k, v in d.items() if k != "source"}
            for d in self.trait_defs.values()
            if d.get("source") == target_source
        ]
        if target_traits:
            save_trait_defs_file(target_dir, target_traits)

        # Save clothing belonging to write target
        target_clothing = [
            {k: v for k, v in d.items() if k != "source"}
            for d in self.clothing_defs.values()
            if d.get("source") == target_source
        ]
        if target_clothing:
            save_clothing_defs_file(target_dir, target_clothing)

        # Save actions belonging to write target
        target_actions = [
            {k: v for k, v in d.items() if k != "source"}
            for d in self.action_defs.values()
            if d.get("source") == target_source
        ]
        if target_actions:
            save_action_defs_file(target_dir, target_actions)

        # Save trait groups belonging to write target
        target_groups = [
            {k: v for k, v in d.items() if k != "source"}
            for d in self.trait_groups.values()
            if d.get("source") == target_source
        ]
        if target_groups:
            save_trait_groups_file(target_dir, target_groups)

        # Save item tags (always save to write target)
        if self.item_tags:
            save_item_tags_file(target_dir, self.item_tags)

        # Save characters belonging to write target
        target_chars = {
            cid: cdata for cid, cdata in self.character_data.items()
            if cdata.get("_source") == target_source
        }
        if target_chars:
            chars_dir = target_dir / "characters"
            chars_dir.mkdir(parents=True, exist_ok=True)
            for cid, cdata in target_chars.items():
                char_path = chars_dir / f"{cid}.json"
                clean = {k: v for k, v in cdata.items() if not k.startswith("_")}
                with open(char_path, "w", encoding="utf-8") as f:
                    json.dump(clean, f, ensure_ascii=False, indent=2)

        # Save maps belonging to write target
        target_maps = {
            mid: mdata for mid, mdata in self.maps.items()
            if mdata.get("_source") == target_source
        }
        if target_maps:
            maps_dir = target_dir / "maps"
            maps_dir.mkdir(parents=True, exist_ok=True)
            for mid, mdata in target_maps.items():
                save_map_file(target_dir, mid, mdata)
            # Update map_collection.json
            collection_path = target_dir / "map_collection.json"
            map_entries = [f"maps/{mid.replace('-', '_')}.json" for mid in target_maps]
            # Merge with existing collection if present
            existing_collection: list[str] = []
            if collection_path.exists():
                with open(collection_path, "r", encoding="utf-8") as f:
                    existing_collection = json.load(f).get("maps", [])
            # Add new entries, avoid duplicates
            for entry in map_entries:
                if entry not in existing_collection:
                    existing_collection.append(entry)
            # Remove entries for maps no longer in overlay
            overlay_filenames = set(map_entries)
            existing_collection = [
                e for e in existing_collection
                if e in overlay_filenames
            ]
            with open(collection_path, "w", encoding="utf-8") as f:
                json.dump({"maps": existing_collection}, f, ensure_ascii=False, indent=2)

        # Save decor presets to write target
        _save_decor_presets(target_dir, self.decor_presets)

    def _snapshot_runtime(self) -> dict[str, Any]:
        """Snapshot runtime state (positions, resources, inventory, etc.)."""
        snapshot: dict[str, Any] = {
            "positions": {},
            "resources": {},
            "inventories": {},
            "abilities": {},
            "experiences": {},
            "time": self.time,
        }
        for char_id, char_state in self.characters.items():
            snapshot["positions"][char_id] = char_state.get("position", {})
            snapshot["resources"][char_id] = char_state.get("resources", {})
            snapshot["inventories"][char_id] = char_state.get("inventory", [])
            snapshot["abilities"][char_id] = char_state.get("abilities", [])
            snapshot["experiences"][char_id] = char_state.get("experiences", [])
        return snapshot

    def _rebuild_characters(self, snapshot: dict[str, Any]) -> None:
        """Rebuild character states from current defs, restoring runtime state."""
        self.characters = {}
        for char_id, char_data in self.character_data.items():
            # Restore position
            if char_id in snapshot["positions"]:
                char_data["position"] = snapshot["positions"][char_id]
            # Restore resources
            if char_id in snapshot["resources"]:
                for key, res in snapshot["resources"][char_id].items():
                    if "resources" not in char_data:
                        char_data["resources"] = {}
                    char_data["resources"][key] = {"value": res["value"], "max": res["max"]}
            # Restore abilities
            if char_id in snapshot["abilities"]:
                for ab in snapshot["abilities"][char_id]:
                    if "abilities" not in char_data:
                        char_data["abilities"] = {}
                    char_data["abilities"][ab["key"]] = ab["exp"]
            # Restore experiences
            if char_id in snapshot["experiences"]:
                for exp in snapshot["experiences"][char_id]:
                    if "experiences" not in char_data:
                        char_data["experiences"] = {}
                    char_data["experiences"][exp["key"]] = {
                        "count": exp["count"], "first": exp["first"],
                    }
            # Restore inventory
            if char_id in snapshot["inventories"]:
                char_data["inventory"] = snapshot["inventories"][char_id]

            self.characters[char_id] = build_character_state(
                char_data, self.template, self.clothing_defs, self.trait_defs,
                self.item_defs,
            )
        self.time = snapshot["time"]

    def rebuild(self, new_addon_refs: Optional[list[dict[str, str]]] = None,
                new_write_target: Optional[str] = None) -> None:
        """Rebuild game state from current in-memory definitions.

        If addon list changed, flush edits to disk first, then reload defs
        from the new addon stack. Otherwise just rebuild characters.
        Does NOT clear dirty or persist world.json.
        """
        if not self.world_id:
            return

        snapshot = self._snapshot_runtime()

        addon_list_changed = False
        if new_addon_refs is not None:
            addon_list_changed = (new_addon_refs != self.addon_refs)
            self.addon_refs = new_addon_refs
        if new_write_target is not None:
            self.write_target_id = new_write_target

        if addon_list_changed:
            # Flush current in-memory edits before reloading from new addon stack
            self._persist_entity_files()

            # Reload all definitions from disk with new addon composition
            self.addon_dirs = build_addon_dirs(self.addon_refs)
            wt_dir = get_write_target_dir(self.write_target_id, self.addon_dirs)
            self.write_target_dir = wt_dir if wt_dir else self.overlay_dir
            self.data_dir = self.write_target_dir

            collection = load_map_collection(self.addon_dirs)
            self.maps = collection["maps"]
            from .map_engine import build_distance_matrix
            self.distance_matrix = build_distance_matrix(self.maps)
            self.decor_presets = load_decor_presets(self.addon_dirs)
            self.template = _load_global_template()
            self.clothing_defs = load_clothing_defs(self.addon_dirs)
            self.item_defs = load_item_defs(self.addon_dirs)
            self.item_tags = load_item_tags(self.addon_dirs)
            self.trait_defs = load_trait_defs(self.addon_dirs)
            self.action_defs = load_action_defs(self.addon_dirs)
            self.trait_groups = load_trait_groups(self.addon_dirs)
            self.character_data = load_characters(self.addon_dirs)

        # Rebuild characters from current in-memory definitions
        self._rebuild_characters(snapshot)

    def save_to_write_target(self) -> None:
        """Rebuild + persist all changes to disk + clear dirty."""
        self.rebuild()
        self._persist_entity_files()

        # Persist world config (addon list, writeTarget, etc.)
        if self.world_id:
            world_config = load_world_config(self.world_id)
            world_config["addons"] = self.addon_refs
            world_config["writeTarget"] = self.write_target_id
            world_config["playerCharacter"] = self.player_character
            save_world_config(self.world_id, world_config)

        self.dirty = False

    def save_overlay(self) -> None:
        """Legacy: persist data to write target addon (renamed from overlay)."""
        self.save_to_write_target()

    def apply_changes(self, new_addon_refs: Optional[list[dict[str, str]]] = None,
                      new_write_target: Optional[str] = None) -> None:
        """Legacy wrapper: calls rebuild()."""
        self.rebuild(new_addon_refs, new_write_target)

    def reload_maps(self) -> None:
        """Reload map collection from disk."""
        collection = load_map_collection(self.addon_dirs)
        self.maps = collection["maps"]
        from .map_engine import build_distance_matrix
        self.distance_matrix = build_distance_matrix(self.maps)

    def get_addon_dir_for_source(self, source: str) -> Path:
        """Get the addon directory path for a given source/addon ID.

        Falls back to write_target_dir, then overlay_dir.
        """
        for addon_id, addon_path in self.addon_dirs:
            if addon_id == source:
                return addon_path
        # Fallback to write target or overlay dir
        if self.write_target_dir and str(self.write_target_dir):
            return self.write_target_dir
        return self.overlay_dir

    def get_full_state(self) -> dict[str, Any]:
        """Get the complete game state for frontend rendering."""
        # Rebuild character states to reflect any changes
        for char_id, char_data in self.character_data.items():
            # Sync position from runtime characters back
            if char_id in self.characters:
                char_data["position"] = self.characters[char_id]["position"]
                # Sync resources
                for key, res in self.characters[char_id]["resources"].items():
                    if "resources" not in char_data:
                        char_data["resources"] = {}
                    char_data["resources"][key] = {
                        "value": res["value"],
                        "max": res["max"],
                    }
                # Sync abilities (decay may have changed exp values)
                for ab in self.characters[char_id].get("abilities", []):
                    if "abilities" not in char_data:
                        char_data["abilities"] = {}
                    char_data["abilities"][ab["key"]] = ab["exp"]
                # Sync experiences
                for exp_entry in self.characters[char_id].get("experiences", []):
                    if "experiences" not in char_data:
                        char_data["experiences"] = {}
                    char_data["experiences"][exp_entry["key"]] = {
                        "count": exp_entry["count"],
                        "first": exp_entry["first"],
                    }
                # Sync inventory
                char_data["inventory"] = self.characters[char_id].get("inventory", [])

        # Rebuild character display states
        display_characters = {}
        for char_id, char_data in self.character_data.items():
            display_characters[char_id] = build_character_state(
                char_data, self.template, self.clothing_defs, self.trait_defs,
                self.item_defs,
            )
            # Copy runtime resource values
            if char_id in self.characters:
                for key in display_characters[char_id]["resources"]:
                    display_characters[char_id]["resources"][key]["value"] = (
                        self.characters[char_id]["resources"][key]["value"]
                    )
            # Include portrait from raw data
            portrait = char_data.get("portrait")
            if portrait:
                source = char_data.get("_source", "")
                if source and source != OVERLAY_SOURCE:
                    display_characters[char_id]["portrait"] = f"{source}/characters/{portrait}"
                else:
                    display_characters[char_id]["portrait"] = portrait

            # Resolve favorability: convert IDs to {id, name, value}, exclude self
            raw_fav = char_data.get("favorability", {})
            fav_list = []
            for target_id, value in raw_fav.items():
                if target_id == char_id:
                    continue
                target_data = self.character_data.get(target_id)
                target_name = (
                    target_data.get("basicInfo", {}).get("name", target_id)
                    if target_data else target_id
                )
                fav_list.append({"id": target_id, "name": target_name, "value": value})
            display_characters[char_id]["favorability"] = fav_list

        # Build maps data for frontend
        maps_data = {}
        for map_id, map_data in self.maps.items():
            # Qualify background image paths with addon source
            bg_image = map_data.get("defaultBackgroundImage")
            if bg_image:
                source = map_data.get("_source", "")
                if source and source != OVERLAY_SOURCE:
                    bg_image = f"{source}/backgrounds/{bg_image}"

            maps_data[map_id] = {
                "id": map_data["id"],
                "name": map_data["name"],
                "defaultColor": map_data.get("defaultColor", "#FFFFFF"),
                "defaultBackgroundImage": bg_image,
                "grid": map_data["compiled_grid"],
                "cells": map_data["cells"],
            }

        # Update cached characters so condition checks use fresh data
        self.characters = display_characters

        # Inject abilities/experiences derived from trait categories into template
        template_ext = {**self.template}
        template_ext["abilities"] = get_ability_defs(self.trait_defs)
        template_ext["experiences"] = get_experience_defs(self.trait_defs)

        return {
            "gameId": self.game_id,
            "worldId": self.world_id,
            "time": self.time.to_dict(),
            "maps": maps_data,
            "characters": display_characters,
            "template": template_ext,
            "dirty": self.dirty,
        }

    def _build_char(self, char_id: str) -> dict[str, Any]:
        """Build display state for a single character."""
        char_data = self.character_data[char_id]
        state = build_character_state(
            char_data, self.template, self.clothing_defs, self.trait_defs,
            self.item_defs,
        )
        portrait = char_data.get("portrait")
        if portrait:
            source = char_data.get("_source", "")
            if source and source != OVERLAY_SOURCE:
                state["portrait"] = f"{source}/characters/{portrait}"
            else:
                state["portrait"] = portrait
        return state

    def get_definitions(self) -> dict[str, Any]:
        """Get template, clothing defs, trait defs, and map summaries for the editor."""
        maps_summary: dict[str, Any] = {}
        for map_id, map_data in self.maps.items():
            cells = []
            for cell in map_data.get("cells", []):
                cells.append({"id": cell["id"], "name": cell.get("name"), "tags": cell.get("tags", [])})
            maps_summary[map_id] = {
                "id": map_data["id"],
                "name": map_data["name"],
                "cells": cells,
            }

        # Build NPC list for editors
        characters_summary: dict[str, Any] = {}
        for char_id, char_data in self.character_data.items():
            characters_summary[char_id] = {
                "id": char_id,
                "name": char_data.get("name", char_id),
                "isPlayer": char_data.get("isPlayer", False),
            }

        # Inject abilities/experiences derived from trait categories into template
        template_ext = {**self.template}
        template_ext["abilities"] = get_ability_defs(self.trait_defs)
        template_ext["experiences"] = get_experience_defs(self.trait_defs)

        return {
            "template": template_ext,
            "clothingDefs": self.clothing_defs,
            "itemDefs": self.item_defs,
            "traitDefs": self.trait_defs,
            "traitGroups": self.trait_groups,
            "actionDefs": self.action_defs,
            "maps": maps_summary,
            "characters": characters_summary,
        }
