"""Integration tests: load_world → edit → save_all → reload lifecycle."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class TestLoadWorld:
    """Basic load_world correctness."""

    def test_all_characters_loaded(self, test_env):
        gs, _ = test_env
        assert len(gs.character_data) == 3  # player1, npc1, npc2

    def test_active_characters_built(self, test_env):
        gs, _ = test_env
        assert len(gs.characters) == 3  # all active

    def test_maps_loaded(self, test_env):
        gs, _ = test_env
        assert "test-a.tavern" in gs.maps
        tavern = gs.maps["test-a.tavern"]
        assert len(tavern["cells"]) == 2

    def test_distance_matrix_built(self, test_env):
        gs, _ = test_env
        assert len(gs.distance_matrix) > 0

    def test_sense_matrix_built(self, test_env):
        gs, _ = test_env
        assert len(gs.sense_matrix) > 0

    def test_cell_action_index_built(self, test_env):
        gs, _ = test_env
        # cook action has location condition for tavern cell 2
        assert len(gs.cell_action_index) > 0 or len(gs.no_location_actions) > 0

    def test_world_variables_initialized(self, test_env):
        gs, _ = test_env
        # danger should be initialized from default
        assert "test-a.danger" in gs.world_variables

    def test_dirty_false_after_load(self, test_env):
        gs, _ = test_env
        assert gs.dirty is False


class TestEditAndSave:
    """Edit in-memory state → save_all → verify on disk."""

    def test_add_trait_and_save(self, test_env):
        gs, base = test_env
        # Add a new trait in memory
        gs.trait_defs["test-a.brave"] = {
            "id": "test-a.brave",
            "name": "勇敢",
            "category": "personality",
            "source": "test-a",
        }
        gs.save_all()

        # Verify on disk
        traits_path = base / "addons" / "test-a" / "1.0.0" / "traits.json"
        with open(traits_path, encoding="utf-8") as f:
            saved = json.load(f)
        ids = [t["id"] for t in saved["traits"]]
        assert "brave" in ids  # stripped namespace

    def test_modify_action_and_save(self, test_env):
        gs, base = test_env
        gs.action_defs["test-a.rest"]["timeCost"] = 60
        gs.save_all()

        actions_path = base / "addons" / "test-a" / "1.0.0" / "actions.json"
        with open(actions_path, encoding="utf-8") as f:
            saved = json.load(f)
        rest = next(a for a in saved["actions"] if a["id"] == "rest")
        assert rest["timeCost"] == 60

    def test_add_character_and_save(self, test_env):
        gs, base = test_env
        gs.character_data["test-a.npc3"] = {
            "id": "test-a.npc3",
            "basicInfo": {"name": "新角色"},
            "isPlayer": False,
            "active": True,
            "_source": "test-a",
            "position": {"mapId": "test-a.tavern", "cellId": 1},
            "traits": {},
            "clothing": {},
            "inventory": [],
            "favorability": {},
            "resources": {},
            "abilities": {},
            "experiences": {},
        }
        gs.save_all()

        char_path = base / "addons" / "test-a" / "1.0.0" / "characters" / "npc3.json"
        assert char_path.exists()
        with open(char_path, encoding="utf-8") as f:
            saved = json.load(f)
        assert saved["basicInfo"]["name"] == "新角色"


class TestSaveAndReload:
    """save_all → reload world → state matches."""

    def test_reload_preserves_traits(self, test_env):
        gs, _ = test_env
        gs.trait_defs["test-a.lucky"] = {
            "id": "test-a.lucky",
            "name": "幸运",
            "category": "personality",
            "source": "test-a",
        }
        gs.save_all()

        # Reload
        from game.state import GameState

        GameState._instance = None
        gs2 = GameState()
        gs2.load_world("test-world")

        assert "test-a.lucky" in gs2.trait_defs
        assert gs2.trait_defs["test-a.lucky"]["name"] == "幸运"

    def test_reload_preserves_action_changes(self, test_env):
        gs, _ = test_env
        gs.action_defs["test-a.rest"]["name"] = "深度休息"
        gs.save_all()

        from game.state import GameState

        GameState._instance = None
        gs2 = GameState()
        gs2.load_world("test-world")

        assert gs2.action_defs["test-a.rest"]["name"] == "深度休息"

    def test_reload_preserves_cross_addon_refs(self, test_env):
        gs, _ = test_env
        gs.save_all()

        from game.state import GameState

        GameState._instance = None
        gs2 = GameState()
        gs2.load_world("test-world")

        npc2 = gs2.character_data["test-b.npc2"]
        assert npc2["clothing"]["upperBody"]["itemId"] == "test-a.shirt"


class TestAddonToggle:
    """Disabling an addon removes its entities; dangling refs degrade gracefully."""

    def test_disable_addon_removes_entities(self, test_env):
        gs, _ = test_env
        # Remove addon B
        new_refs = [{"id": "test-a", "version": "1.0.0"}]
        gs.save_all(new_refs)

        from game.state import GameState

        GameState._instance = None
        gs2 = GameState()
        gs2.load_world("test-world")

        # Addon B entities should be gone
        assert "test-b.elf" not in gs2.trait_defs
        assert "test-b.npc2" not in gs2.character_data

    def test_disable_addon_does_not_crash(self, test_env):
        """Disabling addon with cross-refs should not crash."""
        gs, _ = test_env
        # Addon A references are self-contained; removing B should be safe
        new_refs = [{"id": "test-a", "version": "1.0.0"}]
        gs.save_all(new_refs)

        from game.state import GameState

        GameState._instance = None
        gs2 = GameState()
        gs2.load_world("test-world")

        # Addon A entities should still work
        assert "test-a.rest" in gs2.action_defs
        assert "test-a.player1" in gs2.characters
