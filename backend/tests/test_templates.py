"""Tests for output template selection and variable resolution."""

from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import _select_output_template, _resolve_template
from tests.conftest import MockGameState, make_character, make_char_data


# ========================
# _select_output_template
# ========================

class TestSelectOutputTemplate:
    def test_legacy_string(self, game_state):
        """Falls back to outputTemplate when no outputTemplates array."""
        obj = {"outputTemplate": "hello {{self.name}}"}
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == "hello {{self.name}}"

    def test_empty_obj(self, game_state):
        obj = {}
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == ""

    def test_single_template_no_conditions(self, game_state):
        obj = {"outputTemplates": [{"text": "template A"}]}
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == "template A"

    def test_condition_filters(self, game_state):
        """Only the template whose condition passes should be selected."""
        obj = {"outputTemplates": [
            {"text": "wrong map", "conditions": [{"type": "location", "mapId": "forest"}]},
            {"text": "right map", "conditions": [{"type": "location", "mapId": "tavern"}]},
        ]}
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == "right map"

    def test_all_conditions_fail_fallback(self, game_state):
        """When no template matches, fall back to legacy outputTemplate."""
        obj = {
            "outputTemplate": "fallback",
            "outputTemplates": [
                {"text": "A", "conditions": [{"type": "location", "mapId": "forest"}]},
                {"text": "B", "conditions": [{"type": "location", "mapId": "dungeon"}]},
            ],
        }
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == "fallback"

    def test_all_conditions_fail_no_fallback(self, game_state):
        obj = {
            "outputTemplates": [
                {"text": "A", "conditions": [{"type": "location", "mapId": "forest"}]},
            ],
        }
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == ""

    def test_weight_zero_excluded(self, game_state):
        """Templates with weight=0 should be excluded."""
        obj = {"outputTemplates": [
            {"text": "zero weight", "weight": 0},
            {"text": "normal", "weight": 1},
        ]}
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == "normal"

    def test_random_among_matching(self, game_state):
        """Multiple matching templates → one is picked (run many times for coverage)."""
        obj = {"outputTemplates": [
            {"text": "A", "weight": 1},
            {"text": "B", "weight": 1},
        ]}
        char = game_state.characters["player"]
        results = set()
        for _ in range(100):
            r = _select_output_template(obj, char, game_state, "player", None)
            results.add(r)
        assert results == {"A", "B"}

    def test_weighted_distribution(self, game_state):
        """High-weight template should appear more often."""
        obj = {"outputTemplates": [
            {"text": "rare", "weight": 1},
            {"text": "common", "weight": 99},
        ]}
        char = game_state.characters["player"]
        counts = {"rare": 0, "common": 0}
        for _ in range(1000):
            r = _select_output_template(obj, char, game_state, "player", None)
            counts[r] += 1
        assert counts["common"] > counts["rare"] * 5

    def test_mixed_conditional_unconditional(self, game_state):
        """One conditional (fails) + one unconditional → only unconditional."""
        obj = {"outputTemplates": [
            {"text": "conditional", "conditions": [{"type": "location", "mapId": "forest"}], "weight": 100},
            {"text": "always", "weight": 1},
        ]}
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == "always"

    def test_empty_templates_array(self, game_state):
        obj = {"outputTemplates": [], "outputTemplate": "fallback"}
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == "fallback"

    def test_non_list_templates_ignored(self, game_state):
        """If outputTemplates is not a list, fall back."""
        obj = {"outputTemplates": "not a list", "outputTemplate": "fallback"}
        char = game_state.characters["player"]
        result = _select_output_template(obj, char, game_state, "player", None)
        assert result == "fallback"


# ========================
# _resolve_template
# ========================

class TestResolveTemplate:
    def test_self_name(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("{{self.name}} says hi", char, None, game_state, None, [])
        assert result == "Player says hi"

    def test_target_name(self, game_state):
        char = game_state.characters["player"]
        target = game_state.characters["npc1"]
        result = _resolve_template("{{player}} greets {{target}}", char, target, game_state, None, [])
        assert "Player" in result
        assert "Sakuya" in result

    def test_outcome_label(self, game_state):
        char = game_state.characters["player"]
        outcome = {"label": "大成功", "grade": "S"}
        result = _resolve_template("Result: {{outcome}}", char, None, game_state, outcome, [])
        assert result == "Result: 大成功"

    def test_effects_var(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("{{effects}}", char, None, game_state, None, ["体力 +100", "技巧 +50"])
        assert "体力 +100" in result and "技巧 +50" in result

    def test_resource_var(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("HP={{self.resource.stamina}}", char, None, game_state, None, [])
        assert result == "HP=1000"

    def test_location_var(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("At {{location}}", char, None, game_state, None, [])
        assert result == "At 吧台"

    def test_empty_template(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("", char, None, game_state, None, [])
        assert result == ""

    def test_no_target_graceful(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("{{target}} is absent", char, None, game_state, None, [])
        assert result == " is absent"

    def test_unrecognized_var_kept(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("{{unknownVar}}", char, None, game_state, None, [])
        assert result == "{{unknownVar}}"

    def test_time_var(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("{{time}}", char, None, game_state, None, [])
        assert "年" in result

    def test_weather_var(self, game_state):
        char = game_state.characters["player"]
        result = _resolve_template("{{weather}}", char, None, game_state, None, [])
        assert result == "晴"
