"""Tests for action execution flow (_execute_configured, _roll_outcome, move, look)."""

from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import execute_action, _roll_outcome, _snap_to_tick
from tests.conftest import MockGameState, make_character, make_char_data


def _add_connection(game_state, from_map, from_cell, to_map, to_cell, travel_time=5, sense_only=False):
    """Helper: add a connection between cells in the mock map."""
    cell_info = game_state.maps[from_map]["cell_index"][from_cell]
    if "connections" not in cell_info:
        cell_info["connections"] = []
    conn = {"targetCell": to_cell, "travelTime": travel_time}
    if to_map != from_map:
        conn["targetMap"] = to_map
    if sense_only:
        conn["senseOnly"] = True
    cell_info["connections"].append(conn)


def _setup_action(game_state, action_def):
    """Register an action def and return it."""
    game_state.action_defs[action_def["id"]] = action_def
    return action_def


class TestSnapToTick:
    def test_already_multiple(self):
        assert _snap_to_tick(10) == 10

    def test_rounds_up(self):
        assert _snap_to_tick(7) == 10

    def test_zero_becomes_five(self):
        assert _snap_to_tick(0) == 5

    def test_one_becomes_five(self):
        assert _snap_to_tick(1) == 5

    def test_exact_five(self):
        assert _snap_to_tick(5) == 5


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

    def test_result_fields_complete(self, game_state):
        """Result should contain actionId, actionName, outcomeGrade, outcomeLabel, effectsSummary."""
        _setup_action(game_state, {
            "id": "punch",
            "name": "攻击",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "outcomes": [{
                "grade": "hit", "label": "命中", "weight": 100,
                "effects": [{"type": "resource", "key": "stamina", "op": "add", "value": -100, "target": "self"}],
            }],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "punch"})
        assert result["success"]
        assert result["actionId"] == "punch"
        assert result["actionName"] == "攻击"
        assert result["outcomeGrade"] == "hit"
        assert result["outcomeLabel"] == "命中"
        assert "effectsSummary" in result

    def test_message_auto_appends_outcome_label(self, game_state):
        """Message should auto-append [outcome_label] and effects summary."""
        _setup_action(game_state, {
            "id": "drink",
            "name": "喝酒",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "outcomes": [{
                "grade": "s", "label": "微醺", "weight": 100,
                "effects": [{"type": "resource", "key": "stamina", "op": "add", "value": 50, "target": "self"}],
            }],
        })
        result = execute_action(game_state, "player", {"type": "configured", "actionId": "drink"})
        assert "[微醺]" in result["message"]

    def test_npc_target_interrupts_goal(self, game_state):
        """Targeting an NPC should clear their npc_goals entry."""
        game_state.npc_goals["npc1"] = {"actionId": "patrol", "remaining": 10}
        _setup_action(game_state, {
            "id": "talk",
            "name": "交谈",
            "conditions": [],
            "costs": [],
            "timeCost": 0,
            "outcomes": [{"grade": "s", "label": "s", "weight": 100, "effects": []}],
        })
        execute_action(game_state, "player", {"type": "configured", "actionId": "talk", "targetId": "npc1"})
        assert "npc1" not in game_state.npc_goals

    def test_time_cost_snapped_to_tick(self, game_state):
        """timeCost not multiple of 5 should be snapped up to nearest 5."""
        _setup_action(game_state, {
            "id": "quick",
            "name": "快速行动",
            "conditions": [],
            "costs": [],
            "timeCost": 3,  # should snap to 5
            "outcomes": [{"grade": "s", "label": "s", "weight": 100, "effects": []}],
        })
        old_minute = game_state.time.minute
        execute_action(game_state, "player", {"type": "configured", "actionId": "quick"})
        assert game_state.time.minute == old_minute + 5


class TestExecuteMove:
    def test_basic_move(self, game_state):
        """Move to a connected cell updates position."""
        _add_connection(game_state, "tavern", 1, "tavern", 2, travel_time=5)
        result = execute_action(game_state, "player", {
            "type": "move", "targetCell": 2,
        })
        assert result["success"]
        assert game_state.characters["player"]["position"]["cellId"] == 2
        assert "大厅" in result["message"]

    def test_move_no_connection(self, game_state):
        """Move to unconnected cell should fail."""
        result = execute_action(game_state, "player", {
            "type": "move", "targetCell": 3,
        })
        assert not result["success"]

    def test_move_no_target_cell(self, game_state):
        """Move without targetCell should fail."""
        result = execute_action(game_state, "player", {"type": "move"})
        assert not result["success"]

    def test_move_unknown_character(self, game_state):
        """Move with unknown character should fail."""
        result = execute_action(game_state, "nobody", {
            "type": "move", "targetCell": 2,
        })
        assert not result["success"]

    def test_move_advances_time(self, game_state):
        """Move should advance time by travelTime."""
        _add_connection(game_state, "tavern", 1, "tavern", 2, travel_time=10)
        old_minute = game_state.time.minute
        execute_action(game_state, "player", {"type": "move", "targetCell": 2})
        assert game_state.time.minute == old_minute + 10

    def test_move_sense_only_blocked(self, game_state):
        """senseOnly connections are not traversable."""
        _add_connection(game_state, "tavern", 1, "tavern", 2, sense_only=True)
        result = execute_action(game_state, "player", {
            "type": "move", "targetCell": 2,
        })
        assert not result["success"]

    def test_move_returns_new_position(self, game_state):
        """Result should contain newPosition field."""
        _add_connection(game_state, "tavern", 1, "tavern", 2)
        result = execute_action(game_state, "player", {"type": "move", "targetCell": 2})
        assert result["newPosition"]["mapId"] == "tavern"
        assert result["newPosition"]["cellId"] == 2


class TestExecuteLook:
    def test_look_sees_npc(self, game_state):
        """Look at a cell with an NPC shows their activity."""
        game_state.npc_activities["npc1"] = "正在打扫"
        result = execute_action(game_state, "player", {
            "type": "look", "targetCell": 1,
        })
        assert result["success"]
        assert "Sakuya" in result["message"]
        assert "正在打扫" in result["message"]

    def test_look_empty_cell(self, game_state):
        """Look at a cell with no NPC reports empty."""
        result = execute_action(game_state, "player", {
            "type": "look", "targetCell": 2,
        })
        assert result["success"]
        assert "没有人" in result["message"]

    def test_look_no_target_cell(self, game_state):
        """Look without targetCell should fail."""
        result = execute_action(game_state, "player", {"type": "look"})
        assert not result["success"]

    def test_look_shows_cell_name(self, game_state):
        """Look result includes cell name."""
        result = execute_action(game_state, "player", {
            "type": "look", "targetCell": 1,
        })
        assert "吧台" in result["message"]

    def test_look_unknown_character(self, game_state):
        """Look with unknown character should fail."""
        result = execute_action(game_state, "nobody", {
            "type": "look", "targetCell": 1,
        })
        assert not result["success"]
