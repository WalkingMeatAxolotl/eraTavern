"""Integration tests: namespace applied on load, stripped on save."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class TestNamespaceOnLoad:
    """Verify IDs are namespaced as addon_id.local_id after load."""

    def test_character_ids_namespaced(self, test_env):
        gs, _ = test_env
        assert "test-a.player1" in gs.character_data
        assert "test-a.npc1" in gs.character_data
        assert "test-b.npc2" in gs.character_data

    def test_trait_ids_namespaced(self, test_env):
        gs, _ = test_env
        assert "test-a.human" in gs.trait_defs
        assert "test-a.cooking" in gs.trait_defs
        assert "test-b.elf" in gs.trait_defs

    def test_item_ids_namespaced(self, test_env):
        gs, _ = test_env
        assert "test-a.potion" in gs.item_defs
        assert "test-a.key" in gs.item_defs

    def test_clothing_ids_namespaced(self, test_env):
        gs, _ = test_env
        assert "test-a.shirt" in gs.clothing_defs

    def test_action_ids_namespaced(self, test_env):
        gs, _ = test_env
        assert "test-a.rest" in gs.action_defs
        assert "test-a.cook" in gs.action_defs

    def test_map_ids_namespaced(self, test_env):
        gs, _ = test_env
        assert "test-a.tavern" in gs.maps

    def test_character_trait_refs_namespaced(self, test_env):
        gs, _ = test_env
        player_data = gs.character_data["test-a.player1"]
        # race traits should be namespaced
        assert "test-a.human" in player_data["traits"].get("race", [])

    def test_cross_addon_refs_namespaced(self, test_env):
        """NPC2 (addon B) references addon A items — should stay namespaced."""
        gs, _ = test_env
        npc2 = gs.character_data["test-b.npc2"]
        assert npc2["clothing"]["upperBody"]["itemId"] == "test-a.shirt"
        inv = npc2.get("inventory", [])
        assert any(i["itemId"] == "test-a.potion" for i in inv)

    def test_player_character_namespaced(self, test_env):
        gs, _ = test_env
        assert gs.player_character == "test-a.player1"

    def test_action_condition_mapid_namespaced(self, test_env):
        """Action condition mapId should be namespaced like other refs."""
        gs, _ = test_env
        cook = gs.action_defs["test-a.cook"]
        loc_cond = cook["conditions"][0]
        assert loc_cond["mapId"] == "test-a.tavern"

    def test_position_namespaced(self, test_env):
        gs, _ = test_env
        player = gs.characters["test-a.player1"]
        assert player["position"]["mapId"] == "test-a.tavern"


class TestNamespaceOnSave:
    """Verify namespaces are stripped correctly when saving."""

    def test_same_addon_refs_stripped(self, test_env):
        """Same-addon references should be stored as bare IDs."""
        gs, base = test_env
        gs.save_all()

        # Read saved player character
        player_path = base / "addons" / "test-a" / "1.0.0" / "characters" / "player1.json"
        with open(player_path, encoding="utf-8") as f:
            saved = json.load(f)

        # Traits should be bare (same addon)
        assert "human" in saved.get("traits", {}).get("race", [])
        # Clothing should be bare (same addon)
        assert saved["clothing"]["upperBody"]["itemId"] == "shirt"

    def test_cross_addon_refs_preserved(self, test_env):
        """Cross-addon references should keep full namespace."""
        gs, base = test_env
        gs.save_all()

        # Read saved NPC2 (addon B references addon A items)
        npc2_path = base / "addons" / "test-b" / "1.0.0" / "characters" / "npc2.json"
        with open(npc2_path, encoding="utf-8") as f:
            saved = json.load(f)

        # Cross-addon clothing ref should keep namespace
        assert saved["clothing"]["upperBody"]["itemId"] == "test-a.shirt"
        # Cross-addon inventory ref should keep namespace
        inv = saved.get("inventory", [])
        assert any(i["itemId"] == "test-a.potion" for i in inv)

    def test_action_refs_stripped(self, test_env):
        """Action condition mapId should be stripped for same-addon."""
        gs, base = test_env
        gs.save_all()

        actions_path = base / "addons" / "test-a" / "1.0.0" / "actions.json"
        with open(actions_path, encoding="utf-8") as f:
            saved = json.load(f)

        cook = next(a for a in saved["actions"] if a["id"] == "cook")
        # Same-addon mapId should be bare
        assert cook["conditions"][0]["mapId"] == "tavern"

    def test_world_json_player_stripped(self, test_env):
        """world.json should store bare playerCharacter ID."""
        gs, base = test_env
        gs.save_all()

        with open(base / "worlds" / "test-world" / "world.json", encoding="utf-8") as f:
            world = json.load(f)

        assert world["playerCharacter"] == "player1"


class TestSymbolicRefs:
    """SYMBOLIC_REFS (self, {{targetId}}, {{player}}, '') are never namespaced."""

    def test_symbolic_refs_unchanged_on_load(self, test_env):
        gs, base = test_env
        # Add an action with symbolic refs in effects
        action_with_refs = {
            "id": "test-a.sym",
            "name": "Sym",
            "source": "test-a",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "npcWeight": 0,
            "outcomes": [
                {
                    "grade": "s",
                    "label": "s",
                    "weight": 100,
                    "effects": [
                        {"type": "resource", "key": "stamina", "op": "add", "value": 10, "target": "self"},
                        {"type": "resource", "key": "stamina", "op": "add", "value": 10, "target": "{{targetId}}"},
                    ],
                }
            ],
        }
        gs.action_defs["test-a.sym"] = action_with_refs

        # Verify symbolic refs are preserved as-is
        effects = gs.action_defs["test-a.sym"]["outcomes"][0]["effects"]
        assert effects[0]["target"] == "self"
        assert effects[1]["target"] == "{{targetId}}"
