"""Tests for effect target filters — _resolve_effect_targets and multi-target _apply_effects."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import _apply_effects, _resolve_effect_targets
from tests.conftest import MockGameState, make_char_data, make_character


def _setup_multi_char():
    """Create game state with player + 3 NPCs at various locations."""
    gs = MockGameState()
    gs.characters["player"] = make_character(
        name="Player", is_player=True, map_id="tavern", cell_id=1,
    )
    gs.characters["npc_a"] = make_character(
        name="Alice", is_player=False, map_id="tavern", cell_id=1,
        traits=[{"key": "race", "values": ["human"]}],
    )
    gs.characters["npc_b"] = make_character(
        name="Bob", is_player=False, map_id="tavern", cell_id=1,
        traits=[{"key": "race", "values": ["elf"]}],
    )
    gs.characters["npc_c"] = make_character(
        name="Carol", is_player=False, map_id="tavern", cell_id=2,
        traits=[{"key": "race", "values": ["human"]}],
    )

    gs.character_data["player"] = make_char_data("Player", traits={"race": ["human"]})
    gs.character_data["npc_a"] = make_char_data("Alice", traits={"race": ["human"]})
    gs.character_data["npc_b"] = make_char_data("Bob", traits={"race": ["elf"]})
    gs.character_data["npc_c"] = make_char_data("Carol", traits={"race": ["human"]})

    gs.maps["tavern"] = {
        "id": "tavern",
        "cells": [
            {"id": 1, "name": "吧台", "tags": ["bar"]},
            {"id": 2, "name": "大厅", "tags": ["hall"]},
        ],
    }
    return gs


# ========================
# _resolve_effect_targets
# ========================

class TestResolveEffectTargets:
    def test_self(self):
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets("self", char, "player", None, gs)
        assert result == ["player"]

    def test_target_id(self):
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets("{{targetId}}", char, "player", "npc_a", gs)
        assert result == ["npc_a"]

    def test_target_id_none(self):
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets("{{targetId}}", char, "player", None, gs)
        assert result == []

    def test_filter_all(self):
        """Empty filter = all characters."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets({"filter": {}}, char, "player", None, gs)
        assert set(result) == {"player", "npc_a", "npc_b", "npc_c"}

    def test_filter_current_cell(self):
        """cell='current' → only characters at player's location."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets(
            {"filter": {"cell": "current"}}, char, "player", None, gs
        )
        assert set(result) == {"player", "npc_a", "npc_b"}  # all at cell 1
        assert "npc_c" not in result  # cell 2

    def test_filter_current_cell_exclude_self(self):
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets(
            {"filter": {"cell": "current", "excludeSelf": True}},
            char, "player", None, gs
        )
        assert set(result) == {"npc_a", "npc_b"}
        assert "player" not in result

    def test_filter_specific_cell(self):
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets(
            {"filter": {"cell": {"mapId": "tavern", "cellId": 2}}},
            char, "player", None, gs
        )
        assert result == ["npc_c"]

    def test_filter_trait(self):
        """Filter by trait: only humans."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets(
            {"filter": {"trait": {"key": "race", "traitId": "human"}}},
            char, "player", None, gs
        )
        assert set(result) == {"player", "npc_a", "npc_c"}
        assert "npc_b" not in result  # elf

    def test_filter_cell_and_trait(self):
        """Combine cell + trait: humans at cell 1."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets(
            {"filter": {"cell": "current", "trait": {"key": "race", "traitId": "human"}}},
            char, "player", None, gs
        )
        assert set(result) == {"player", "npc_a"}  # human at cell 1
        assert "npc_b" not in result  # elf at cell 1
        assert "npc_c" not in result  # human at cell 2

    def test_filter_cell_trait_exclude_self(self):
        """All filters combined."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets(
            {"filter": {"cell": "current", "trait": {"key": "race", "traitId": "human"}, "excludeSelf": True}},
            char, "player", None, gs
        )
        assert result == ["npc_a"]

    def test_filter_variable(self):
        """Filter by bidirectional variable."""
        gs = _setup_multi_char()
        gs.character_data["npc_a"]["favorability"] = {"player": 80}
        gs.character_data["npc_b"]["favorability"] = {"player": 20}
        gs.character_data["npc_c"]["favorability"] = {"player": 60}
        gs.variable_defs = {
            "rel": {"id": "rel", "isBidirectional": True, "steps": [
                {"type": "favorability", "source": "target"},  # target→self
            ]},
        }
        char = gs.characters["player"]
        result = _resolve_effect_targets(
            {"filter": {"variable": {"varId": "rel", "op": ">=", "value": 50}, "excludeSelf": True}},
            char, "player", None, gs
        )
        assert set(result) == {"npc_a", "npc_c"}  # 80 and 60 >= 50
        assert "npc_b" not in result  # 20 < 50

    def test_legacy_specific_id(self):
        """Legacy: specific character ID string."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        result = _resolve_effect_targets("npc_b", char, "player", None, gs)
        assert result == ["npc_b"]


# ========================
# Multi-target effects
# ========================

class TestMultiTargetEffects:
    def test_filter_applies_to_all(self):
        """Effect with filter target should apply to all matched characters."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        effects = [{
            "type": "resource",
            "key": "stamina",
            "op": "add",
            "value": 100,
            "target": {"filter": {"cell": "current", "excludeSelf": True}},
        }]
        summaries = _apply_effects(effects, char, gs, "player", None)
        # npc_a and npc_b at cell 1 should get +100 stamina
        assert gs.characters["npc_a"]["resources"]["stamina"]["value"] == 1100
        assert gs.characters["npc_b"]["resources"]["stamina"]["value"] == 1100
        # npc_c at cell 2 should be unchanged
        assert gs.characters["npc_c"]["resources"]["stamina"]["value"] == 1000
        # player should be unchanged (excludeSelf)
        assert gs.characters["player"]["resources"]["stamina"]["value"] == 1000
        # Should have summaries for each target
        assert len(summaries) == 2

    def test_self_target_unchanged(self):
        """target='self' still works as before."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 50, "target": "self"}]
        _apply_effects(effects, char, gs, "player", None)
        assert gs.characters["player"]["resources"]["stamina"]["value"] == 1050

    def test_mixed_targets(self):
        """Multiple effects with different target types."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        effects = [
            {"type": "resource", "key": "stamina", "op": "add", "value": 50, "target": "self"},
            {"type": "resource", "key": "stamina", "op": "add", "value": -200,
             "target": {"filter": {"cell": "current", "excludeSelf": True}}},
        ]
        summaries = _apply_effects(effects, char, gs, "player", None)
        assert gs.characters["player"]["resources"]["stamina"]["value"] == 1050  # +50
        assert gs.characters["npc_a"]["resources"]["stamina"]["value"] == 800  # -200
        assert gs.characters["npc_b"]["resources"]["stamina"]["value"] == 800  # -200
        assert gs.characters["npc_c"]["resources"]["stamina"]["value"] == 1000  # unchanged

    def test_empty_filter_all_chars(self):
        """Empty filter = all characters."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 10,
                     "target": {"filter": {}}}]
        _apply_effects(effects, char, gs, "player", None)
        for cid in ["player", "npc_a", "npc_b", "npc_c"]:
            assert gs.characters[cid]["resources"]["stamina"]["value"] == 1010

    def test_filter_no_matches(self):
        """Filter that matches nobody → no effects applied."""
        gs = _setup_multi_char()
        char = gs.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 999,
                     "target": {"filter": {"cell": {"mapId": "forest", "cellId": 1}}}}]
        _apply_effects(effects, char, gs, "player", None)
        for cid in ["player", "npc_a", "npc_b", "npc_c"]:
            assert gs.characters[cid]["resources"]["stamina"]["value"] == 1000
