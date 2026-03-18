"""Tests for bidirectional variable evaluation and favorability step."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.variable_engine import evaluate_variable, evaluate_variable_debug
from tests.conftest import MockGameState, make_char_data


def _make_char(abilities=None, resources=None, traits=None, experiences=None, inventory=None):
    return {
        "abilities": abilities or [],
        "resources": resources or {},
        "basicInfo": {},
        "traits": traits or [],
        "experiences": experiences or [],
        "inventory": inventory or [],
    }


# ========================
# Single-direction (backward compat)
# ========================


class TestSingleDirection:
    def test_ability_no_target(self):
        """Single-direction variable should work without target."""
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "ability", "key": "combat"},
            ],
        }
        char = _make_char(abilities=[{"key": "combat", "exp": 500}])
        result = evaluate_variable(var_def, char, {})
        assert result == 500

    def test_source_defaults_to_self(self):
        """Without source field, step reads from self character."""
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "ability", "key": "combat"},  # no source field
            ],
        }
        char = _make_char(abilities=[{"key": "combat", "exp": 300}])
        target = _make_char(abilities=[{"key": "combat", "exp": 999}])
        result = evaluate_variable(var_def, char, {}, target_state=target)
        assert result == 300  # reads self, not target


# ========================
# Bidirectional — source field
# ========================


class TestBidirectionalSource:
    def test_source_self_reads_self(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "ability", "key": "combat", "source": "self"},
            ],
        }
        char = _make_char(abilities=[{"key": "combat", "exp": 100}])
        target = _make_char(abilities=[{"key": "combat", "exp": 900}])
        result = evaluate_variable(var_def, char, {}, target_state=target)
        assert result == 100

    def test_source_target_reads_target(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "ability", "key": "combat", "source": "target"},
            ],
        }
        char = _make_char(abilities=[{"key": "combat", "exp": 100}])
        target = _make_char(abilities=[{"key": "combat", "exp": 900}])
        result = evaluate_variable(var_def, char, {}, target_state=target)
        assert result == 900

    def test_source_target_no_target_returns_zero(self):
        """If no target provided, source=target steps return 0."""
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "ability", "key": "combat", "source": "target"},
            ],
        }
        char = _make_char(abilities=[{"key": "combat", "exp": 100}])
        result = evaluate_variable(var_def, char, {})
        assert result == 100  # falls back to self

    def test_resource_source_target(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "resource", "key": "hp", "source": "target"},
            ],
        }
        char = _make_char(resources={"hp": {"value": 50, "max": 100}})
        target = _make_char(resources={"hp": {"value": 80, "max": 100}})
        result = evaluate_variable(var_def, char, {}, target_state=target)
        assert result == 80

    def test_hasTrait_source_target(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "hasTrait", "traitGroup": "race", "traitId": "elf", "source": "target"},
            ],
        }
        char = _make_char(traits=[{"key": "race", "values": ["human"]}])
        target = _make_char(traits=[{"key": "race", "values": ["elf"]}])
        result = evaluate_variable(var_def, char, {}, target_state=target)
        assert result == 1.0

    def test_combined_self_and_target(self):
        """Difference: self.combat - target.combat"""
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "ability", "key": "combat", "source": "self"},
                {"type": "ability", "key": "combat", "source": "target", "op": "subtract"},
            ],
        }
        char = _make_char(abilities=[{"key": "combat", "exp": 800}])
        target = _make_char(abilities=[{"key": "combat", "exp": 300}])
        result = evaluate_variable(var_def, char, {}, target_state=target)
        assert result == 500


# ========================
# Favorability step
# ========================


class TestFavorabilityStep:
    def _make_gs(self):
        gs = MockGameState()
        gs.character_data["alice"] = make_char_data("Alice", favorability={"bob": 80})
        gs.character_data["bob"] = make_char_data("Bob", favorability={"alice": 50})
        return gs

    def test_self_to_target(self):
        """source=self: self's favorability toward target."""
        gs = self._make_gs()
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "favorability", "source": "self"},
            ],
        }
        result = evaluate_variable(
            var_def,
            {},
            {},
            game_state=gs,
            char_id="alice",
            target_id="bob",
        )
        assert result == 80  # alice → bob

    def test_target_to_self(self):
        """source=target: target's favorability toward self."""
        gs = self._make_gs()
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "favorability", "source": "target"},
            ],
        }
        result = evaluate_variable(
            var_def,
            {},
            {},
            game_state=gs,
            char_id="alice",
            target_id="bob",
        )
        assert result == 50  # bob → alice

    def test_mutual_favorability(self):
        """Sum of both directions."""
        gs = self._make_gs()
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "favorability", "source": "self"},
                {"type": "favorability", "source": "target", "op": "add"},
            ],
        }
        result = evaluate_variable(
            var_def,
            {},
            {},
            game_state=gs,
            char_id="alice",
            target_id="bob",
        )
        assert result == 130  # 80 + 50

    def test_favorability_missing_returns_zero(self):
        gs = MockGameState()
        gs.character_data["alice"] = make_char_data("Alice")
        gs.character_data["bob"] = make_char_data("Bob")
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "favorability", "source": "self"},
            ],
        }
        result = evaluate_variable(
            var_def,
            {},
            {},
            game_state=gs,
            char_id="alice",
            target_id="bob",
        )
        assert result == 0

    def test_no_game_state_returns_zero(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "favorability", "source": "self"},
            ],
        }
        result = evaluate_variable(var_def, {}, {})
        assert result == 0


# ========================
# Debug trace includes source
# ========================


class TestDebugTrace:
    def test_debug_shows_source(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "ability", "key": "combat", "source": "target"},
            ],
        }
        char = _make_char(abilities=[{"key": "combat", "exp": 100}])
        target = _make_char(abilities=[{"key": "combat", "exp": 900}])
        result = evaluate_variable_debug(var_def, char, {}, target_state=target)
        assert result["result"] == 900
        assert result["steps"][0]["source"] == "target"

    def test_debug_default_source_is_self(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "constant", "value": 42},
            ],
        }
        result = evaluate_variable_debug(var_def, {}, {})
        assert result["steps"][0]["source"] == "self"


# ========================
# Cross-variable reference with bidirectional
# ========================


class TestCrossVariableRef:
    def test_bidirectional_refs_bidirectional(self):
        """A bidirectional variable can reference another bidirectional."""
        all_vars = {
            "v_inner": {
                "id": "v_inner",
                "steps": [
                    {"type": "ability", "key": "combat", "source": "target"},
                ],
            },
            "v_outer": {
                "id": "v_outer",
                "steps": [
                    {"type": "variable", "varId": "v_inner"},
                    {"type": "constant", "value": 10, "op": "add"},
                ],
            },
        }
        char = _make_char(abilities=[{"key": "combat", "exp": 100}])
        target = _make_char(abilities=[{"key": "combat", "exp": 500}])
        result = evaluate_variable(
            all_vars["v_outer"],
            char,
            all_vars,
            target_state=target,
        )
        assert result == 510  # target combat (500) + 10
