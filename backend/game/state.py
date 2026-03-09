"""GameState manager (singleton) - holds all maps and character data."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

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
from .time_system import GameTime

GAMES_DIR = Path(__file__).parent.parent / "data" / "games"


def list_available_games() -> list[dict[str, str]]:
    """List all available game packages."""
    games: list[dict[str, str]] = []
    if not GAMES_DIR.exists():
        return games
    for game_dir in sorted(GAMES_DIR.iterdir()):
        game_json = game_dir / "game.json"
        if game_json.exists():
            with open(game_json, "r", encoding="utf-8") as f:
                info = json.load(f)
            games.append({
                "id": info["id"],
                "name": info["name"],
                "description": info.get("description", ""),
            })
    return games


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
        self.game_id: str = ""
        self.game_name: str = ""
        self.data_dir: Path = Path()
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
        self.npc_full_log: list[dict] = []  # all NPC logs for LLM
        self.time = GameTime()

    def load(self, game_id: str) -> None:
        """Load all game data from a specific game package."""
        self.data_dir = GAMES_DIR / game_id
        game_json = self.data_dir / "game.json"
        with open(game_json, "r", encoding="utf-8") as f:
            info = json.load(f)
        self.game_id = info["id"]
        self.game_name = info["name"]

        # Load maps
        collection = load_map_collection(self.data_dir)
        self.maps = collection["maps"]

        # Pre-compute distance matrix for NPC pathfinding
        from .map_engine import build_distance_matrix
        self.distance_matrix = build_distance_matrix(self.maps)

        # Load decor presets
        self.decor_presets = load_decor_presets(self.data_dir)

        # Load character system
        self.template = load_template(self.data_dir)
        self.clothing_defs = load_clothing_defs(self.data_dir)
        self.item_defs = load_item_defs(self.data_dir)
        self.item_tags = load_item_tags(self.data_dir)
        self.trait_defs = load_trait_defs(self.data_dir)
        self.action_defs = load_action_defs(self.data_dir)
        self.trait_groups = load_trait_groups(self.data_dir)
        self.character_data = load_characters(self.data_dir)

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

    def reload_maps(self) -> None:
        """Reload map collection from disk."""
        collection = load_map_collection(self.data_dir)
        self.maps = collection["maps"]
        from .map_engine import build_distance_matrix
        self.distance_matrix = build_distance_matrix(self.maps)

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
            maps_data[map_id] = {
                "id": map_data["id"],
                "name": map_data["name"],
                "defaultColor": map_data.get("defaultColor", "#FFFFFF"),
                "defaultBackgroundImage": map_data.get("defaultBackgroundImage"),
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
            "time": self.time.to_dict(),
            "maps": maps_data,
            "characters": display_characters,
            "template": template_ext,
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
