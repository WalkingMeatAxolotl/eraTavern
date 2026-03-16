"""Tests for NPC decision system: suggest maps, action choosing, ticking, simulation."""

from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import (
    _build_suggest_map,
    _npc_choose_action,
    _npc_tick,
    simulate_npc_ticks,
    TICK_MINUTES,
)
from tests.conftest import MockGameState, make_character, make_char_data


# ========================
# _build_suggest_map
# ========================

class TestBuildSuggestMapEmpty:
    def test_no_history_returns_empty(self, game_state):
        """No action history -> both dicts empty."""
        action_s, category_s = _build_suggest_map(game_state, "npc1")
        assert action_s == {}
        assert category_s == {}


class TestBuildSuggestMapActionDecay:
    def test_active_suggest_with_time_decay(self, game_state):
        """Bonus decays linearly; halfway through decay -> half bonus."""
        # completedAt = current_time - 50, decay = 100  ->  elapsed/decay = 0.5
        current_time = game_state.time.total_minutes
        game_state.npc_action_history["npc1"] = [
            {
                "actionId": "act_drink",
                "suggestNext": [
                    {"actionId": "act_eat", "bonus": 20, "decay": 100},
                ],
                "completedAt": current_time - 50,
            },
        ]
        action_s, category_s = _build_suggest_map(game_state, "npc1")
        # bonus = 20 * (1 - 50/100) = 10.0
        assert abs(action_s.get("act_eat", 0) - 10.0) < 0.01
        assert category_s == {}

    def test_expired_suggest_not_included(self, game_state):
        """elapsed >= decay -> suggest is fully expired, not added."""
        current_time = game_state.time.total_minutes
        game_state.npc_action_history["npc1"] = [
            {
                "actionId": "act_drink",
                "suggestNext": [
                    {"actionId": "act_eat", "bonus": 20, "decay": 100},
                ],
                "completedAt": current_time - 100,  # elapsed == decay
            },
        ]
        action_s, _ = _build_suggest_map(game_state, "npc1")
        assert action_s == {}

    def test_expired_suggest_past_decay(self, game_state):
        """elapsed > decay -> also not included."""
        current_time = game_state.time.total_minutes
        game_state.npc_action_history["npc1"] = [
            {
                "actionId": "act_drink",
                "suggestNext": [
                    {"actionId": "act_eat", "bonus": 20, "decay": 100},
                ],
                "completedAt": current_time - 200,
            },
        ]
        action_s, _ = _build_suggest_map(game_state, "npc1")
        assert action_s == {}


class TestBuildSuggestMapCategory:
    def test_category_suggest(self, game_state):
        """Category-based suggest populates category_suggest dict."""
        current_time = game_state.time.total_minutes
        game_state.npc_action_history["npc1"] = [
            {
                "actionId": "act_drink",
                "suggestNext": [
                    {"category": "social", "bonus": 30, "decay": 60},
                ],
                "completedAt": current_time - 30,
            },
        ]
        action_s, category_s = _build_suggest_map(game_state, "npc1")
        # bonus = 30 * (1 - 30/60) = 15.0
        assert action_s == {}
        assert abs(category_s.get("social", 0) - 15.0) < 0.01


# ========================
# _npc_choose_action
# ========================

def _setup_basic_action(game_state, npc_weight=10, target_type="none",
                        action_id="act_idle", cell_key=("tavern", 1),
                        conditions=None, category=""):
    """Helper to set up a single action in cell_action_index and distance_matrix."""
    action_def = {
        "id": action_id,
        "name": "待机",
        "npcWeight": npc_weight,
        "targetType": target_type,
        "conditions": conditions or [],
        "npcWeightModifiers": [],
        "category": category,
        "timeCost": TICK_MINUTES,
        "outcomes": [],
    }
    game_state.action_defs[action_id] = action_def
    game_state.cell_action_index[cell_key] = [action_def]

    # Distance matrix: npc1 is at ("tavern", 1)
    npc_pos = ("tavern", 1)
    if npc_pos not in game_state.distance_matrix:
        game_state.distance_matrix[npc_pos] = {}
    # Distance from npc_pos to cell_key
    if cell_key == npc_pos:
        game_state.distance_matrix[npc_pos][cell_key] = (0, cell_key[0], cell_key[1])
    else:
        game_state.distance_matrix[npc_pos][cell_key] = (10, cell_key[0], cell_key[1])

    # Sense matrix: all cells visible by default
    if npc_pos not in game_state.sense_matrix:
        game_state.sense_matrix[npc_pos] = {}
    game_state.sense_matrix[npc_pos][cell_key] = 0

    return action_def


class TestNpcChooseActionNoActions:
    def test_no_actions_returns_none(self, game_state):
        """No actions in index -> None, activity set to '待机中'."""
        result = _npc_choose_action(game_state, "npc1")
        assert result is None
        assert game_state.npc_activities.get("npc1") == "待机中"


class TestNpcChooseActionSameCell:
    def test_picks_action_at_current_cell(self, game_state, monkeypatch):
        """Action at distance=0 -> starts action immediately (returns from _npc_start_action)."""
        action_def = _setup_basic_action(game_state)

        # Monkeypatch random.choices to always pick the first candidate
        import random
        monkeypatch.setattr(random, "choices", lambda pop, weights, k: [pop[0]])

        result = _npc_choose_action(game_state, "npc1")
        # _npc_start_action returns None for just-started actions (busy_ticks > 0)
        # but a goal should be set with busy_ticks
        goal = game_state.npc_goals.get("npc1")
        assert goal is not None
        assert goal.get("actionId") == "act_idle"
        assert goal.get("busy_ticks", 0) > 0


class TestNpcChooseActionDistantCell:
    def test_sets_goal_with_target_pos(self, game_state, monkeypatch):
        """Action at distant cell -> sets npc_goals with targetPos."""
        distant_cell = ("tavern", 3)
        action_def = _setup_basic_action(
            game_state, cell_key=distant_cell, action_id="act_cook",
        )

        import random
        monkeypatch.setattr(random, "choices", lambda pop, weights, k: [pop[0]])

        result = _npc_choose_action(game_state, "npc1")
        assert result is None
        goal = game_state.npc_goals.get("npc1")
        assert goal is not None
        assert goal.get("targetPos") == {"mapId": "tavern", "cellId": 3}
        assert goal.get("actionId") == "act_cook"
        assert game_state.npc_activities["npc1"] == "正在前往..."


class TestNpcChooseActionSenseFilter:
    def test_unsensed_npc_excluded(self, game_state, monkeypatch):
        """NPC target at cell not in sense_matrix should be excluded."""
        # Add npc2 at tavern cell 2
        game_state.characters["npc2"] = make_character(
            name="Reimu", is_player=False, map_id="tavern", cell_id=2,
        )
        game_state.character_data["npc2"] = make_char_data("Reimu")

        # Action requiring NPC target at cell 2
        cell_key = ("tavern", 2)
        action_def = _setup_basic_action(
            game_state, target_type="npc", cell_key=cell_key,
            action_id="act_talk",
        )

        # Remove cell 2 from sense_matrix so npc2 is NOT visible
        npc_pos = ("tavern", 1)
        game_state.sense_matrix[npc_pos].pop(cell_key, None)

        import random
        monkeypatch.setattr(random, "choices", lambda pop, weights, k: [pop[0]])

        result = _npc_choose_action(game_state, "npc1")
        # No valid candidates since target NPC is not sensed
        assert result is None
        assert game_state.npc_activities.get("npc1") == "待机中"

    def test_sensed_npc_included(self, game_state, monkeypatch):
        """NPC target at cell in sense_matrix should be available as candidate."""
        # Add npc2 at tavern cell 1 (same cell as npc1)
        game_state.characters["npc2"] = make_character(
            name="Reimu", is_player=False, map_id="tavern", cell_id=1,
        )
        game_state.character_data["npc2"] = make_char_data("Reimu")

        cell_key = ("tavern", 1)
        action_def = _setup_basic_action(
            game_state, target_type="npc", cell_key=cell_key,
            action_id="act_talk",
        )
        # Sense matrix already includes cell_key from _setup_basic_action

        import random
        monkeypatch.setattr(random, "choices", lambda pop, weights, k: [pop[0]])

        result = _npc_choose_action(game_state, "npc1")
        # Should have picked act_talk with some target
        goal = game_state.npc_goals.get("npc1")
        assert goal is not None
        assert goal.get("actionId") == "act_talk"


# ========================
# _npc_tick
# ========================

class TestNpcTickBusy:
    def test_busy_npc_decrements_tick(self, game_state):
        """NPC with busy_ticks > 1 decrements and returns None."""
        game_state.npc_goals["npc1"] = {
            "actionId": "act_idle",
            "busy_ticks": 3,
            "outcome": None,
        }
        result = _npc_tick(game_state, "npc1")
        assert result is None
        assert game_state.npc_goals["npc1"]["busy_ticks"] == 2

    def test_busy_npc_completes_on_last_tick(self, game_state):
        """NPC with busy_ticks=1 completes the action."""
        game_state.action_defs["act_idle"] = {
            "id": "act_idle",
            "name": "待机",
            "conditions": [],
            "outcomes": [],
            "output": [],
        }
        game_state.npc_goals["npc1"] = {
            "actionId": "act_idle",
            "busy_ticks": 1,
            "targetNpcId": None,
            "outcome": None,
        }
        result = _npc_tick(game_state, "npc1")
        # After completion, goal should be removed
        assert "npc1" not in game_state.npc_goals
        # _npc_complete_action should return some text (at least the action name)
        assert result is not None or game_state.npc_activities.get("npc1") == "待机"


class TestNpcTickMovement:
    def test_npc_with_target_pos_moves(self, game_state):
        """NPC with targetPos moves one step closer, returns None."""
        game_state.npc_goals["npc1"] = {
            "actionId": "act_cook",
            "targetPos": {"mapId": "tavern", "cellId": 3},
            "targetNpcId": None,
        }
        # Set up distance_matrix so npc1 at (tavern,1) can reach (tavern,3) via (tavern,2)
        game_state.distance_matrix[("tavern", 1)] = {
            ("tavern", 3): (10, "tavern", 2),  # next step is cell 2
        }
        game_state.character_data["npc1"]["position"] = {
            "mapId": "tavern", "cellId": 1,
        }

        result = _npc_tick(game_state, "npc1")
        assert result is None
        # NPC should have moved to cell 2
        assert game_state.characters["npc1"]["position"]["cellId"] == 2


# ========================
# simulate_npc_ticks
# ========================

class TestSimulateNpcTicksSkips:
    def test_skips_player_characters(self, game_state):
        """Player characters should not be ticked."""
        # With no actions set up, NPCs will just get "待机中".
        # We verify player doesn't get an activity set.
        log = simulate_npc_ticks(game_state, 10)
        assert "player" not in game_state.npc_activities

    def test_skips_exclude_ids(self, game_state):
        """Characters in exclude_ids should not be ticked."""
        log = simulate_npc_ticks(game_state, 10, exclude_ids=["npc1"])
        assert "npc1" not in game_state.npc_activities

    def test_skips_single_exclude_id(self, game_state):
        """Character matching exclude_id should not be ticked."""
        log = simulate_npc_ticks(game_state, 10, exclude_id="npc1")
        assert "npc1" not in game_state.npc_activities


class TestSimulateNpcTicksCount:
    def test_correct_number_of_ticks(self, game_state):
        """elapsed_minutes // TICK_MINUTES ticks, minimum 1."""
        # Track how many times time advances
        initial_minutes = game_state.time.total_minutes
        elapsed = 25  # 25 // 5 = 5 ticks
        simulate_npc_ticks(game_state, elapsed)
        expected_advance = 5 * TICK_MINUTES
        assert game_state.time.total_minutes == initial_minutes + expected_advance

    def test_minimum_one_tick(self, game_state):
        """Even for elapsed < TICK_MINUTES, at least 1 tick runs."""
        initial_minutes = game_state.time.total_minutes
        simulate_npc_ticks(game_state, 2)  # 2 // 5 = 0, but max(1, 0) = 1
        assert game_state.time.total_minutes == initial_minutes + TICK_MINUTES

    def test_npc_gets_ticked(self, game_state):
        """NPC should be processed during simulation."""
        # No actions available, so npc1 should end up with "待机中"
        simulate_npc_ticks(game_state, 10)
        assert game_state.npc_activities.get("npc1") == "待机中"
