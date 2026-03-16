"""GameState manager (singleton) - holds all maps and character data."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from .map_engine import load_map_collection, load_decor_presets
from .character import (
    load_template,
    load_clothing_defs,
    load_outfit_types,
    load_item_defs,
    load_item_tags,
    load_action_defs,
    load_trait_defs,
    load_trait_groups,
    load_variable_defs,
    load_variable_tags,
    load_event_defs,
    load_world_variable_defs,
    load_characters,
    build_character_state,
    get_ability_defs,
    get_experience_defs,
    apply_ability_decay,
    namespace_character_data,
    namespace_action_refs,
    namespace_id,
    to_local_id,
    resolve_ref,
    get_addon_from_id,
)
from .addon_loader import (
    ADDONS_DIR,
    list_addons as _list_addons,
    list_worlds as _list_worlds,
    load_world_config,
    save_world_config,
    build_addon_dirs,
    load_template as _load_global_template,
    get_addon_dir,
    get_world_dir,
    fork_addon_version,
    is_world_fork,
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
            "description": w.get("description", ""),
            "cover": w.get("cover", ""),
            "addons": w.get("addons", []),
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
        self.player_character: str = ""  # player character ID from world config
        self.dirty: bool = False  # True when in-memory state has unsaved changes
        self.maps: dict[str, dict] = {}
        self.template: dict = {}
        self.clothing_defs: dict[str, dict] = {}
        self.outfit_types: list[dict] = []
        self.item_defs: dict[str, dict] = {}
        self.item_tags: list[str] = []
        self.trait_defs: dict[str, dict] = {}
        self.action_defs: dict[str, dict] = {}
        self.trait_groups: dict[str, dict] = {}
        self.variable_defs: dict[str, dict] = {}
        self.variable_tags: list[str] = []
        self.event_defs: dict[str, dict] = {}
        self.world_variable_defs: dict[str, dict] = {}
        self.world_variables: dict[str, float] = {}
        self.event_state: dict[str, dict] = {}
        self.character_data: dict[str, dict] = {}
        self.characters: dict[str, dict[str, Any]] = {}
        self.decor_presets: list[dict] = []
        self.distance_matrix: dict = {}
        self.sense_matrix: dict = {}
        self.npc_goals: dict[str, dict] = {}
        self.npc_activities: dict[str, str] = {}
        self.npc_full_log: list[dict] = []
        self.npc_action_history: dict[str, list[dict]] = {}
        self.decay_accumulators: dict[str, dict[str, int]] = {}
        self.action_log: list[dict] = []
        self.cell_action_index: dict[tuple, list[dict]] = {}
        self.no_location_actions: list[dict] = []
        self.time = GameTime()

    # Log retention limits (in game days)
    NPC_LOG_CACHE_DAYS = 60   # runtime buffer
    NPC_LOG_SAVE_DAYS = 30    # persisted to save file
    ACTION_LOG_SAVE_DAYS = 30

    def load_empty(self) -> None:
        """Initialize empty state with no world loaded."""
        self.world_id = ""
        self.world_name = ""
        self.addon_refs = []
        self.addon_dirs = []
        self.player_character = ""
        self.dirty = False
        self.maps = {}
        self.template = _load_global_template()
        self.clothing_defs = {}
        self.outfit_types = ["default"]
        self.item_defs = {}
        self.item_tags = []
        self.trait_defs = {}
        self.action_defs = {}
        self.trait_groups = {}
        self.variable_defs = {}
        self.variable_tags = []
        self.event_defs = {}
        self.world_variable_defs = {}
        self.world_variables = {}
        self.event_state = {}
        self.character_data = {}
        self.characters = {}
        self.decor_presets = []
        self.distance_matrix = {}
        self.sense_matrix = {}
        self.npc_goals = {}
        self.npc_activities = {}
        self.npc_full_log = []
        self.npc_action_history = {}
        self.decay_accumulators = {}
        self.action_log = []
        self.cell_action_index = {}
        self.no_location_actions = []
        self.time = GameTime()

    def _init_world_variables(self) -> None:
        """Initialize world_variables from definitions' defaults."""
        self.world_variables = {}
        for var_id, var_def in self.world_variable_defs.items():
            self.world_variables[var_id] = var_def.get("default", 0)

    def _resolve_namespaces(self) -> None:
        """Resolve bare ID cross-references in character data and action defs.

        Must be called AFTER all entity defs are loaded with namespaced IDs.
        """
        for char_data in self.character_data.values():
            namespace_character_data(
                char_data, self.trait_defs, self.item_defs,
                self.clothing_defs, self.character_data, self.maps,
            )
        namespace_action_refs(
            self.action_defs, self.trait_defs, self.item_defs,
            self.clothing_defs, self.character_data, self.maps,
        )

    def load_session_addons(self, addon_refs: list[dict[str, str]]) -> None:
        """Load addons into session without a world. No overlay layer."""
        self.world_id = ""
        self.world_name = ""
        self.addon_refs = addon_refs
        self.addon_dirs = build_addon_dirs(addon_refs)
        self.player_character = ""
        self.dirty = False

        # Load from addons
        from .map_engine import build_distance_matrix, build_sense_matrix
        collection = load_map_collection(self.addon_dirs)
        self.maps = collection["maps"]
        self.distance_matrix = build_distance_matrix(self.maps)
        self.sense_matrix = build_sense_matrix(self.maps)
        self.decor_presets = load_decor_presets(self.addon_dirs)
        self.template = _load_global_template()
        self.clothing_defs = load_clothing_defs(self.addon_dirs)
        self.outfit_types = load_outfit_types(self.addon_dirs)
        self.item_defs = load_item_defs(self.addon_dirs)
        self.item_tags = load_item_tags(self.addon_dirs)
        self.trait_defs = load_trait_defs(self.addon_dirs)
        self.action_defs = load_action_defs(self.addon_dirs)
        self.trait_groups = load_trait_groups(self.addon_dirs)
        self.variable_defs = load_variable_defs(self.addon_dirs)
        self.variable_tags = load_variable_tags(self.addon_dirs)
        self.event_defs = load_event_defs(self.addon_dirs)
        self.world_variable_defs = load_world_variable_defs(self.addon_dirs)
        self.character_data = load_characters(self.addon_dirs)

        # Resolve bare ID cross-references
        self._resolve_namespaces()

        self.characters = {}
        for char_id, char_data in self.character_data.items():
            if char_data.get("active", True) is False:
                continue
            self.characters[char_id] = build_character_state(
                char_data, self.template, self.clothing_defs, self.trait_defs,
                self.item_defs,
            )

        # Build cell->action inverted index for NPC decision-making
        from .action import build_cell_action_index
        self.cell_action_index, self.no_location_actions = build_cell_action_index(
            self.action_defs, self.maps
        )

        self.time = GameTime()
        self.npc_goals = {}
        self.npc_activities = {}
        self.npc_full_log = []
        self.npc_action_history = {}
        self.decay_accumulators = {}
        self.action_log = []
        self._init_world_variables()
        self.event_state = {}

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

        # No auto-fork: addons stay at whichever version world.json specifies.
        # Forking is triggered explicitly by the user via POST /api/addon/{id}/fork.

        self.addon_dirs = build_addon_dirs(self.addon_refs)

        # Load maps from all addons
        collection = load_map_collection(self.addon_dirs)
        self.maps = collection["maps"]

        # Pre-compute distance matrix and sense matrix for NPC pathfinding
        from .map_engine import build_distance_matrix, build_sense_matrix
        self.distance_matrix = build_distance_matrix(self.maps)
        self.sense_matrix = build_sense_matrix(self.maps)

        # Load decor presets from all addons
        self.decor_presets = load_decor_presets(self.addon_dirs)

        # Load character system
        self.template = _load_global_template()
        self.clothing_defs = load_clothing_defs(self.addon_dirs)
        self.outfit_types = load_outfit_types(self.addon_dirs)
        self.item_defs = load_item_defs(self.addon_dirs)
        self.item_tags = load_item_tags(self.addon_dirs)
        self.trait_defs = load_trait_defs(self.addon_dirs)
        self.action_defs = load_action_defs(self.addon_dirs)
        self.trait_groups = load_trait_groups(self.addon_dirs)
        self.variable_defs = load_variable_defs(self.addon_dirs)
        self.variable_tags = load_variable_tags(self.addon_dirs)
        self.event_defs = load_event_defs(self.addon_dirs)
        self.world_variable_defs = load_world_variable_defs(self.addon_dirs)
        self.character_data = load_characters(self.addon_dirs)

        # Resolve bare ID cross-references
        self._resolve_namespaces()

        # Namespace player_character reference
        from .character import NS_SEP
        if self.player_character and NS_SEP not in self.player_character:
            self.player_character = resolve_ref(
                self.player_character, self.character_data, ""
            )

        # Build character states (active only)
        self.characters = {}
        for char_id, char_data in self.character_data.items():
            if char_data.get("active", True) is False:
                continue
            self.characters[char_id] = build_character_state(
                char_data, self.template, self.clothing_defs, self.trait_defs,
                self.item_defs,
            )

        # Build cell->action inverted index for NPC decision-making
        from .action import build_cell_action_index
        self.cell_action_index, self.no_location_actions = build_cell_action_index(
            self.action_defs, self.maps
        )

        # Reset time and NPC state
        self.time = GameTime()
        self.npc_goals = {}
        self.npc_activities = {}
        self.npc_full_log = []
        self.npc_action_history = {}
        self.action_log = []
        self._init_world_variables()
        self.event_state = {}
        self.dirty = False

    def _persist_entity_files(self) -> None:
        """Write all entities to their respective addon directories (by source)."""
        from .character import (
            save_clothing_defs_file, save_item_defs_file, save_item_tags_file,
            save_trait_defs_file, save_action_defs_file, save_trait_groups_file,
            save_variable_defs_file, save_variable_tags_file,
            save_event_defs_file, save_world_variable_defs_file,
            save_character,
        )
        from .map_engine import save_map_file, save_decor_presets as _save_decor_presets

        # Build addon_id → path lookup
        addon_dir_map: dict[str, Path] = {aid: apath for aid, apath in self.addon_dirs}

        # Collect all source addon IDs that have entities
        sources: set[str] = set()
        for d in self.trait_defs.values():
            sources.add(d.get("source", ""))
        for d in self.clothing_defs.values():
            sources.add(d.get("source", ""))
        for d in self.item_defs.values():
            sources.add(d.get("source", ""))
        for d in self.action_defs.values():
            sources.add(d.get("source", ""))
        for d in self.trait_groups.values():
            sources.add(d.get("source", ""))
        for d in self.variable_defs.values():
            sources.add(d.get("source", ""))
        for d in self.event_defs.values():
            sources.add(d.get("source", ""))
        for d in self.world_variable_defs.values():
            sources.add(d.get("source", ""))
        for d in self.character_data.values():
            sources.add(d.get("_source", ""))
        for d in self.maps.values():
            sources.add(d.get("_source", ""))

        for source in sources:
            target_dir = addon_dir_map.get(source)
            if not target_dir:
                continue
            target_dir.mkdir(parents=True, exist_ok=True)

            # Traits
            src_traits = [
                {k: v for k, v in d.items() if k != "source"}
                for d in self.trait_defs.values()
                if d.get("source") == source
            ]
            if src_traits:
                save_trait_defs_file(target_dir, src_traits)

            # Clothing
            src_clothing = [
                {k: v for k, v in d.items() if k != "source"}
                for d in self.clothing_defs.values()
                if d.get("source") == source
            ]
            if src_clothing:
                save_clothing_defs_file(target_dir, src_clothing, self.outfit_types)

            # Items
            src_items = [
                {k: v for k, v in d.items() if k != "source"}
                for d in self.item_defs.values()
                if d.get("source") == source
            ]
            if src_items:
                save_item_defs_file(target_dir, src_items)

            # Actions
            src_actions = [
                {k: v for k, v in d.items() if k != "source"}
                for d in self.action_defs.values()
                if d.get("source") == source
            ]
            if src_actions:
                save_action_defs_file(target_dir, src_actions, source)

            # Trait groups
            src_groups = [
                {k: v for k, v in d.items() if k != "source"}
                for d in self.trait_groups.values()
                if d.get("source") == source
            ]
            if src_groups:
                save_trait_groups_file(target_dir, src_groups, source)

            # Variables
            src_variables = [
                {k: v for k, v in d.items() if k != "source"}
                for d in self.variable_defs.values()
                if d.get("source") == source
            ]
            if src_variables:
                save_variable_defs_file(target_dir, src_variables)

            # Events
            src_events = [
                {k: v for k, v in d.items() if k != "source"}
                for d in self.event_defs.values()
                if d.get("source") == source
            ]
            if src_events:
                save_event_defs_file(target_dir, src_events)

            # World variables
            src_world_vars = [
                {k: v for k, v in d.items() if k != "source"}
                for d in self.world_variable_defs.values()
                if d.get("source") == source
            ]
            if src_world_vars:
                save_world_variable_defs_file(target_dir, src_world_vars)

            # Characters
            for cid, cdata in self.character_data.items():
                if cdata.get("_source") == source:
                    save_character(target_dir, cdata, source)

            # Maps
            src_maps = {
                mid: mdata for mid, mdata in self.maps.items()
                if mdata.get("_source") == source
            }
            if src_maps:
                maps_dir = target_dir / "maps"
                maps_dir.mkdir(parents=True, exist_ok=True)
                for mid, mdata in src_maps.items():
                    save_map_file(target_dir, mid, mdata)
                # Update map_collection.json
                collection_path = target_dir / "map_collection.json"
                map_entries = [
                    f"maps/{mdata.get('_local_id', to_local_id(mid)).replace('-', '_')}.json"
                    for mid, mdata in src_maps.items()
                ]
                with open(collection_path, "w", encoding="utf-8") as f:
                    json.dump({"maps": map_entries}, f, ensure_ascii=False, indent=2)

        # Save item tags to first addon dir (global pool)
        if self.item_tags and self.addon_dirs:
            save_item_tags_file(self.addon_dirs[0][1], self.item_tags)

        # Save variable tags to first addon dir (global pool)
        if self.variable_tags and self.addon_dirs:
            save_variable_tags_file(self.addon_dirs[0][1], self.variable_tags)

        # Save decor presets to first addon dir
        if self.decor_presets and self.addon_dirs:
            _save_decor_presets(self.addon_dirs[0][1], self.decor_presets)

    def _update_addon_dependencies(self) -> None:
        """Scan all entities for cross-addon references and update addon.json dependencies."""
        from .character import NS_SEP, SYMBOLIC_REFS

        active_addon_ids = {aid for aid, _ in self.addon_dirs}

        def _extract_addon(ref_id: str) -> Optional[str]:
            """Extract addon ID from a namespaced reference, or None."""
            if not ref_id or ref_id in SYMBOLIC_REFS or NS_SEP not in ref_id:
                return None
            return ref_id.split(NS_SEP, 1)[0]

        def _collect_refs_from_value(val: Any) -> set[str]:
            """Extract addon IDs from a value that might be a namespaced ref."""
            if isinstance(val, str):
                a = _extract_addon(val)
                return {a} if a else set()
            return set()

        def _scan_condition(cond: dict) -> set[str]:
            refs: set[str] = set()
            for key in ("traitId", "itemId", "npcId", "targetId", "key", "varId"):
                refs |= _collect_refs_from_value(cond.get(key, ""))
            # Recursive AND/OR groups
            for group_key in ("and", "or"):
                for sub in cond.get(group_key, []):
                    refs |= _scan_condition(sub)
            return refs

        def _scan_effect(eff: dict) -> set[str]:
            refs: set[str] = set()
            for key in ("traitId", "itemId", "target", "favFrom", "favTo", "mapId", "key"):
                refs |= _collect_refs_from_value(eff.get(key, ""))
            # value could be {varId: "..."} object
            val = eff.get("value")
            if isinstance(val, dict):
                refs |= _collect_refs_from_value(val.get("varId", ""))
            return refs

        def _scan_modifier(mod: dict) -> set[str]:
            refs: set[str] = set()
            refs |= _collect_refs_from_value(mod.get("varId", ""))
            refs |= _collect_refs_from_value(mod.get("key", ""))
            return refs

        # Build: addon_id → set of referenced addon_ids
        deps_map: dict[str, set[str]] = {aid: set() for aid in active_addon_ids}

        # Scan actions
        for action in self.action_defs.values():
            src = action.get("source", "")
            if src not in deps_map:
                continue
            refs = deps_map[src]
            for cond in action.get("conditions", []):
                refs |= _scan_condition(cond)
            for cost in action.get("costs", []):
                refs |= _collect_refs_from_value(cost.get("itemId", ""))
            for outcome in action.get("outcomes", []):
                for eff in outcome.get("effects", []):
                    refs |= _scan_effect(eff)
                for mod in outcome.get("weightModifiers", []):
                    refs |= _scan_modifier(mod)
                # suggestNext
                for sn in outcome.get("suggestNext", []):
                    refs |= _collect_refs_from_value(sn.get("actionId", ""))
            # NPC weight modifiers
            for mod in action.get("npcWeightModifiers", []):
                refs |= _scan_modifier(mod)
            # Output template conditions
            for tpl in action.get("outputTemplates", []):
                for cond in tpl.get("conditions", []):
                    refs |= _scan_condition(cond)

        # Scan events
        for event in self.event_defs.values():
            src = event.get("source", "")
            if src not in deps_map:
                continue
            refs = deps_map[src]
            for cond in event.get("conditions", []):
                refs |= _scan_condition(cond)
            for eff in event.get("effects", []):
                refs |= _scan_effect(eff)

        # Scan trait groups
        for group in self.trait_groups.values():
            src = group.get("source", "")
            if src not in deps_map:
                continue
            refs = deps_map[src]
            for trait_id in group.get("traits", []):
                refs |= _collect_refs_from_value(trait_id)

        # Scan characters
        for cdata in self.character_data.values():
            src = cdata.get("_source", "")
            if src not in deps_map:
                continue
            refs = deps_map[src]
            # traits
            traits = cdata.get("traits", {})
            if isinstance(traits, dict):
                for cat_vals in traits.values():
                    if isinstance(cat_vals, list):
                        for tid in cat_vals:
                            refs |= _collect_refs_from_value(tid)
            # clothing
            for slot_data in (cdata.get("clothing") or {}).values():
                if isinstance(slot_data, dict):
                    refs |= _collect_refs_from_value(slot_data.get("itemId", ""))
            # inventory
            for inv in cdata.get("inventory", []):
                refs |= _collect_refs_from_value(inv.get("itemId", ""))
            # favorability (keys are char IDs)
            for target_id in (cdata.get("favorability") or {}).keys():
                refs |= _collect_refs_from_value(target_id)
            # position
            refs |= _collect_refs_from_value((cdata.get("position") or {}).get("mapId", ""))
            refs |= _collect_refs_from_value((cdata.get("restPosition") or {}).get("mapId", ""))

        # Scan maps (connections)
        for mdata in self.maps.values():
            src = mdata.get("_source", "")
            if src not in deps_map:
                continue
            refs = deps_map[src]
            for cell in mdata.get("cells", []):
                for conn in cell.get("connections", []):
                    refs |= _collect_refs_from_value(conn.get("targetMap", ""))

        # Scan variables
        for vdef in self.variable_defs.values():
            src = vdef.get("source", "")
            if src not in deps_map:
                continue
            refs = deps_map[src]
            for step in vdef.get("steps", []):
                refs |= _collect_refs_from_value(step.get("key", ""))
                refs |= _collect_refs_from_value(step.get("traitId", ""))
                refs |= _collect_refs_from_value(step.get("varId", ""))

        # Update addon.json for each addon
        addon_dir_map: dict[str, Path] = {aid: apath for aid, apath in self.addon_dirs}
        for addon_id, ref_addons in deps_map.items():
            # Remove self-references
            ref_addons.discard(addon_id)
            # Only keep references to active addons
            ref_addons &= active_addon_ids

            target_dir = addon_dir_map.get(addon_id)
            if not target_dir:
                continue
            meta_path = target_dir / "addon.json"
            if not meta_path.exists():
                continue
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)

            # Replace: only keep auto-detected dependencies
            new_deps = [{"id": dep_id} for dep_id in sorted(ref_addons)]

            if new_deps != meta.get("dependencies", []):
                meta["dependencies"] = new_deps
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, ensure_ascii=False, indent=2)

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

            if char_data.get("active", True) is False:
                continue
            self.characters[char_id] = build_character_state(
                char_data, self.template, self.clothing_defs, self.trait_defs,
                self.item_defs,
            )
        self.time = snapshot["time"]

    def rebuild(self, new_addon_refs: Optional[list[dict[str, str]]] = None) -> None:
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

        if addon_list_changed:
            # Flush current in-memory edits before reloading from new addon stack
            self._persist_entity_files()

            # Reload all definitions from disk with new addon composition
            self.addon_dirs = build_addon_dirs(self.addon_refs)

            collection = load_map_collection(self.addon_dirs)
            self.maps = collection["maps"]
            from .map_engine import build_distance_matrix, build_sense_matrix
            self.distance_matrix = build_distance_matrix(self.maps)
            self.sense_matrix = build_sense_matrix(self.maps)
            self.decor_presets = load_decor_presets(self.addon_dirs)
            self.template = _load_global_template()
            self.clothing_defs = load_clothing_defs(self.addon_dirs)
            self.outfit_types = load_outfit_types(self.addon_dirs)
            self.item_defs = load_item_defs(self.addon_dirs)
            self.item_tags = load_item_tags(self.addon_dirs)
            self.trait_defs = load_trait_defs(self.addon_dirs)
            self.action_defs = load_action_defs(self.addon_dirs)
            self.trait_groups = load_trait_groups(self.addon_dirs)
            self.variable_defs = load_variable_defs(self.addon_dirs)
            self.variable_tags = load_variable_tags(self.addon_dirs)
            self.event_defs = load_event_defs(self.addon_dirs)
            self.world_variable_defs = load_world_variable_defs(self.addon_dirs)
            self.character_data = load_characters(self.addon_dirs)
            self._resolve_namespaces()

        # Always rebuild cell->action index (action defs may have been edited)
        from .action import build_cell_action_index
        self.cell_action_index, self.no_location_actions = build_cell_action_index(
            self.action_defs, self.maps
        )

        # Reset NPC goals — outcome snapshots may reference stale definitions
        self.npc_goals = {}

        # Rebuild characters from current in-memory definitions
        self._rebuild_characters(snapshot)

    def save_all(self, new_addon_refs: Optional[list[dict[str, str]]] = None) -> None:
        """Rebuild + persist all entity files to their addon dirs + update world.json + clear dirty."""
        self.rebuild(new_addon_refs)
        self._persist_entity_files()
        self._update_addon_dependencies()

        # Persist world config
        if self.world_id:
            world_config = load_world_config(self.world_id)
            world_config["addons"] = self.addon_refs
            world_config.pop("writeTarget", None)  # remove legacy field
            # Save playerCharacter as local ID in config
            world_config["playerCharacter"] = to_local_id(self.player_character)
            save_world_config(self.world_id, world_config)

        self.dirty = False

    # Legacy aliases
    def save_to_write_target(self) -> None:
        self.save_all()

    def save_overlay(self) -> None:
        self.save_all()

    def reload_maps(self) -> None:
        """Reload map collection from disk."""
        collection = load_map_collection(self.addon_dirs)
        self.maps = collection["maps"]
        from .map_engine import build_distance_matrix, build_sense_matrix
        self.distance_matrix = build_distance_matrix(self.maps)
        self.sense_matrix = build_sense_matrix(self.maps)

    def get_addon_dir_for_source(self, source: str) -> Path:
        """Get the addon directory path for a given source/addon ID."""
        for addon_id, addon_path in self.addon_dirs:
            if addon_id == source:
                return addon_path
        # Fallback to last addon dir
        if self.addon_dirs:
            return self.addon_dirs[-1][1]
        return Path()

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

        # Rebuild character display states (active only)
        display_characters = {}
        for char_id, char_data in self.character_data.items():
            if char_data.get("active", True) is False:
                continue
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
                if source:
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
                if source:
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
            "gameId": self.world_id,
            "worldId": self.world_id,
            "time": self.time.to_dict(),
            "maps": maps_data,
            "characters": display_characters,
            "template": template_ext,
            "dirty": self.dirty,
            "worldVariables": self.world_variables,
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
            if source:
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
            "outfitTypes": self.outfit_types,
            "itemDefs": self.item_defs,
            "traitDefs": self.trait_defs,
            "traitGroups": self.trait_groups,
            "actionDefs": self.action_defs,
            "variableDefs": self.variable_defs,
            "eventDefs": self.event_defs,
            "worldVariableDefs": self.world_variable_defs,
            "maps": maps_summary,
            "characters": characters_summary,
        }

    def snapshot_save_data(self) -> dict[str, Any]:
        """Snapshot all mutable runtime state for saving to a slot.

        Returns a deep copy — safe to hold across subsequent state mutations.
        """
        import copy

        # Sync display state back to character_data first
        for char_id, char_state in self.characters.items():
            if char_id not in self.character_data:
                continue
            cd = self.character_data[char_id]
            cd["position"] = char_state.get("position", {})
            # resources
            for key, res in char_state.get("resources", {}).items():
                if "resources" not in cd:
                    cd["resources"] = {}
                cd["resources"][key] = {"value": res["value"], "max": res["max"]}
            # abilities
            for ab in char_state.get("abilities", []):
                if "abilities" not in cd:
                    cd["abilities"] = {}
                cd["abilities"][ab["key"]] = ab["exp"]
            # experiences
            for exp in char_state.get("experiences", []):
                if "experiences" not in cd:
                    cd["experiences"] = {}
                cd["experiences"][exp["key"]] = {
                    "count": exp["count"], "first": exp["first"],
                }
            # inventory
            cd["inventory"] = char_state.get("inventory", [])

        characters: dict[str, Any] = {}
        for char_id, cd in self.character_data.items():
            characters[char_id] = {
                "position": copy.deepcopy(cd.get("position", {})),
                "resources": copy.deepcopy(cd.get("resources", {})),
                "inventory": copy.deepcopy(cd.get("inventory", [])),
                "abilities": copy.deepcopy(cd.get("abilities", {})),
                "experiences": copy.deepcopy(cd.get("experiences", {})),
                "clothing": copy.deepcopy(cd.get("clothing", {})),
                "outfits": copy.deepcopy(cd.get("outfits", {})),
                "currentOutfit": cd.get("currentOutfit", "default"),
                "traits": copy.deepcopy(cd.get("traits", {})),
                "favorability": copy.deepcopy(cd.get("favorability", {})),
                "basicInfo": copy.deepcopy(cd.get("basicInfo", {})),
            }

        # Trim logs for save (30 game days)
        current_days = self.time.total_days
        cutoff_save = current_days - self.NPC_LOG_SAVE_DAYS
        trimmed_npc_log = [
            e for e in self.npc_full_log
            if e.get("totalDays", 0) >= cutoff_save
        ]
        cutoff_action = current_days - self.ACTION_LOG_SAVE_DAYS
        trimmed_action_log = [
            e for e in self.action_log
            if e.get("totalDays", 0) >= cutoff_action
        ]

        return {
            "time": self.time.to_dict(),
            "characters": characters,
            "npcActivities": copy.deepcopy(self.npc_activities),
            "npcActionHistory": copy.deepcopy(self.npc_action_history),
            "decayAccumulators": copy.deepcopy(self.decay_accumulators),
            "npcFullLog": trimmed_npc_log,
            "actionLog": trimmed_action_log,
            "worldVariables": dict(self.world_variables),
            "eventState": dict(self.event_state),
        }

    def restore_save_data(self, runtime: dict[str, Any]) -> None:
        """Restore runtime state from a save slot. Call after load_world()."""
        # Restore time
        t = runtime.get("time", {})
        self.time = GameTime(
            year=t.get("year", 1),
            season=t.get("season", 0),
            day=t.get("day", 1),
            hour=t.get("hour", 6),
            minute=t.get("minute", 0),
        )
        self.time.weather = t.get("weatherId", "sunny")
        self.time.temperature = t.get("temperature", 20)

        # Restore character data
        saved_chars = runtime.get("characters", {})
        for char_id, saved in saved_chars.items():
            if char_id not in self.character_data:
                continue
            cd = self.character_data[char_id]
            if "position" in saved:
                cd["position"] = saved["position"]
            if "resources" in saved:
                cd["resources"] = saved["resources"]
            if "inventory" in saved:
                cd["inventory"] = saved["inventory"]
            if "abilities" in saved:
                cd["abilities"] = saved["abilities"]
            if "experiences" in saved:
                cd["experiences"] = saved["experiences"]
            if "clothing" in saved:
                cd["clothing"] = saved["clothing"]
            if "outfits" in saved:
                cd["outfits"] = saved["outfits"]
            if "currentOutfit" in saved:
                cd["currentOutfit"] = saved["currentOutfit"]
            if "traits" in saved:
                cd["traits"] = saved["traits"]
            if "favorability" in saved:
                cd["favorability"] = saved["favorability"]
            if "basicInfo" in saved:
                cd["basicInfo"] = saved["basicInfo"]

        # Rebuild display state from updated character_data (active only)
        self.characters = {}
        for char_id, char_data in self.character_data.items():
            if char_data.get("active", True) is False:
                continue
            self.characters[char_id] = build_character_state(
                char_data, self.template, self.clothing_defs, self.trait_defs,
                self.item_defs,
            )

        # Restore NPC state (goals reset — NPC re-decides from current position)
        self.npc_goals = {}
        self.npc_activities = runtime.get("npcActivities", {})
        self.npc_action_history = runtime.get("npcActionHistory", {})
        self.decay_accumulators = runtime.get("decayAccumulators", {})
        self.npc_full_log = runtime.get("npcFullLog", [])
        self.action_log = runtime.get("actionLog", [])

        # Restore world variables (fill missing keys from defs' defaults)
        saved_wv = runtime.get("worldVariables", {})
        self._init_world_variables()  # start from defaults
        for key, val in saved_wv.items():
            if key in self.world_variables:
                self.world_variables[key] = val
        # Restore event state
        self.event_state = runtime.get("eventState", {})
