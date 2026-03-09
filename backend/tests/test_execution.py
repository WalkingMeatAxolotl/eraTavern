"""Tests for action execution flow (_execute_configured, _roll_outcome)."""

from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import execute_action, _roll_outcome
from tests.conftest import MockGameState, make_character, make_char_data


def _setup_action(game_state, action_def):
    """Register an action def and return it."""
    game_state.action_defs[action_def["id"]] = action_def
    return action_def


class TestRollOutcome:
    def test_single_outcome(self, game_state):
        char = game_state.characters["player"]
        outcomes = [{"grade": "success", "label": "成功", "weight": 100, "effects": []}]
        result = _roll_outcome(outcomes, char, game_state, "player", None)
        assert result["grade"] == "success"

    def test_zero_weight_fallback(self, game_state):
        """If all weights are 0, return first outcome."""
        char = game_state.characters["player"]
        outcomes = [
            {"grade": "A", "label": "A", "weight": 0, "effects": []},
            {"grade": "B", "label": "B", "weight": 0, "effects": []},
        ]
        result = _roll_outcome(outcomes, char, game_state, "player", None)
        assert result["grade"] == "A"

    def test_weighted_distribution(self, game_state):
        """Outcome with higher weight should appear more often."""
        char = game_state.characters["player"]
        outcomes = [
            {"grade": "rare", "label": "R", "weight": 1, "effects": []},
            {"grade": "common", "label": "C", "weight": 99, "effects": []},
        ]
        counts = {"rare": 0, "common": 0}
        for _ in range(1000):
            r = _roll_outcome(outcomes, char, game_state, "player", None)
            counts[r["grade"]] += 1
        assert counts["common"] > counts["rare"] * 5

    def test_weight_modifier_additive(self, game_state):
        """Weight modifier increases effective weight."""
        char = game_state.characters["player"]  # technique=3000
        outcomes = [
            {"grade": "boosted", "label": "B", "weight": 10, "effects": [],
             "weightModifiers": [{"type": "ability", "key": "technique", "per": 1000, "bonus": 100}]},
            {"grade": "normal", "label": "N", "weight": 10, "effects": []},
        ]
        # boosted: 10 + (3*100) = 310, normal: 10
        # boosted should win almost always
        counts = {"boosted": 0, "normal": 0}
        for _ in range(200):
            r = _roll_outcome(outcomes, char, game_state, "player", None)
            counts[r["grade"]] += 1
        assert counts["boosted"] > 180

    def test_weight_modifier_multiply(self, game_state):
        char = game_state.characters["player"]  # technique=3000
        outcomes = [
            {"grade": "boosted", "label": "B", "weight": 10, "effects": [],
             "weightModifiers": [{"type": "ability", "key": "technique", "per": 3000, "bonus": 200, "bonusMode": "multiply"}]},
            {"grade": "normal", "label": "N", "weight": 10, "effects": []},
        ]
        # boosted: (10+0) * (1+200/100) = 10*3 = 30, normal: 10
        counts = {"boosted": 0, "normal": 0}
        for _ in range(400):
            r = _roll_outcome(outcomes, char, game_state, "player", None)
            counts[r["grade"]] += 1
        assert counts["boosted"] > counts["normal"] * 1.5


class TestExecuteConfigured:
    def test_basic_execution(self, game_state):
        _setup_action(game_state, {
            "id": "rest",
            "name": "休息",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "outcomes": [{
                "grade": "success", "label": "成功", "weight": 100,
                "effects": [{"type": "resource", "key": "stamina", "op": "add", "value": 200, "target": "self"}],
            }],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "rest"})
        assert result["success"]
        assert game_state.characters["player"]["resources"]["stamina"]["value"] == 1200

    def test_condition_failure(self, game_state):
        _setup_action(game_state, {
            "id": "locked",
            "name": "锁定行动",
            "conditions": [{"type": "location", "mapId": "nowhere"}],
            "costs": [],
            "timeCost": 0,
            "outcomes": [],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "locked"})
        assert not result["success"]

    def test_cost_failure(self, game_state):
        _setup_action(game_state, {
            "id": "expensive",
            "name": "昂贵行动",
            "conditions": [],
            "costs": [{"type": "resource", "key": "stamina", "amount": 99999}],
            "timeCost": 0,
            "outcomes": [],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "expensive"})
        assert not result["success"]

    def test_costs_applied(self, game_state):
        _setup_action(game_state, {
            "id": "train",
            "name": "训练",
            "conditions": [],
            "costs": [{"type": "resource", "key": "stamina", "amount": 300}],
            "timeCost": 0,
            "outcomes": [{"grade": "s", "label": "s", "weight": 100, "effects": []}],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "train"})
        assert result["success"]
        assert game_state.characters["player"]["resources"]["stamina"]["value"] == 700

    def test_time_advances(self, game_state):
        _setup_action(game_state, {
            "id": "nap",
            "name": "小睡",
            "conditions": [],
            "costs": [],
            "timeCost": 30,
            "outcomes": [{"grade": "s", "label": "s", "weight": 100, "effects": []}],
        })
        old_minute = game_state.time.minute
        execute_action(game_state, "player", {"type": "configured", "actionId": "nap"})
        assert game_state.time.minute == old_minute + 30 or game_state.time.hour > 12

    def test_unknown_action(self, game_state):
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "nonexistent"})
        assert not result["success"]

    def test_unknown_character(self, game_state):
        _setup_action(game_state, {
            "id": "act", "name": "A", "conditions": [], "costs": [], "timeCost": 0, "outcomes": [],
        })
        result = execute_action(game_state, "nobody", {"type": "configured", "actionId": "act"})
        assert not result["success"]

    def test_npc_target_effects(self, game_state):
        """Action with targetId applies effects to NPC."""
        _setup_action(game_state, {
            "id": "heal",
            "name": "治疗",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "outcomes": [{
                "grade": "s", "label": "成功", "weight": 100,
                "effects": [
                    {"type": "resource", "key": "stamina", "op": "add", "value": 500, "target": "self"},
                    {"type": "resource", "key": "stamina", "op": "add", "value": 300, "target": "{{targetId}}"},
                ],
            }],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "heal", "targetId": "npc1"})
        assert result["success"]
        assert game_state.characters["player"]["resources"]["stamina"]["value"] == 1500
        assert game_state.characters["npc1"]["resources"]["stamina"]["value"] == 1300

    def test_output_template_resolved(self, game_state):
        _setup_action(game_state, {
            "id": "greet",
            "name": "打招呼",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "outputTemplates": [{"text": "{{self.name}} waves."}],
            "outcomes": [{"grade": "s", "label": "成功", "weight": 100, "effects": []}],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "greet"})
        assert "Player waves." in result["message"]

    def test_conditional_output_template(self, game_state):
        _setup_action(game_state, {
            "id": "greet2",
            "name": "打招呼2",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "outputTemplates": [
                {"text": "wrong", "conditions": [{"type": "location", "mapId": "forest"}]},
                {"text": "correct at tavern"},
            ],
            "outcomes": [{"grade": "s", "label": "成功", "weight": 100, "effects": []}],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "greet2"})
        assert "correct at tavern" in result["message"]

    def test_no_outcomes_still_succeeds(self, game_state):
        _setup_action(game_state, {
            "id": "simple",
            "name": "简单",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "outcomes": [],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "simple"})
        assert result["success"]
