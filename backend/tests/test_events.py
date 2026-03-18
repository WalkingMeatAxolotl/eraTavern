"""Tests for the event evaluation system (action.py)."""

from __future__ import annotations

from game.action import _should_fire_event, _update_event_state, evaluate_events
from tests.conftest import MockGameState

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TICK = 5  # TICK_MINUTES


def _empty_state() -> dict:
    """Return a fresh event runtime state dict."""
    return {}


def _event_def(mode="once", cooldown=10, **extra) -> dict:
    return {"triggerMode": mode, "cooldown": cooldown, **extra}


# ===========================================================================
# _should_fire_event
# ===========================================================================


class TestShouldFireEventOnce:
    """mode='once'"""

    def test_fires_first_time_global(self):
        state = _empty_state()
        assert _should_fire_event("once", state, "__global__", True, 100, _event_def())

    def test_does_not_fire_second_time_global(self):
        state = {"fired": True}
        assert not _should_fire_event("once", state, "__global__", True, 100, _event_def())

    def test_does_not_fire_if_not_matched(self):
        state = _empty_state()
        assert not _should_fire_event("once", state, "__global__", False, 100, _event_def())

    def test_per_char_fires_first_time(self):
        state = _empty_state()
        assert _should_fire_event("once", state, "npc1", True, 100, _event_def())

    def test_per_char_does_not_fire_if_already_in_fired_chars(self):
        state = {"fired_chars": ["npc1"]}
        assert not _should_fire_event("once", state, "npc1", True, 100, _event_def())

    def test_per_char_fires_for_different_char(self):
        state = {"fired_chars": ["npc1"]}
        assert _should_fire_event("once", state, "npc2", True, 100, _event_def())


class TestShouldFireEventOnChange:
    """mode='on_change'"""

    def test_fires_on_false_to_true(self):
        state = {"last_match": {"__global__": False}}
        assert _should_fire_event("on_change", state, "__global__", True, 100, _event_def("on_change"))

    def test_does_not_fire_on_true_to_true(self):
        state = {"last_match": {"__global__": True}}
        assert not _should_fire_event("on_change", state, "__global__", True, 100, _event_def("on_change"))

    def test_does_not_fire_when_not_matched(self):
        state = {"last_match": {"__global__": False}}
        assert not _should_fire_event("on_change", state, "__global__", False, 100, _event_def("on_change"))

    def test_fires_when_no_last_match_and_matched(self):
        """First evaluation, no prior state — last defaults to False."""
        state = _empty_state()
        assert _should_fire_event("on_change", state, "__global__", True, 100, _event_def("on_change"))


class TestShouldFireEventWhile:
    """mode='while'"""

    def test_fires_when_cooldown_elapsed(self):
        # cooldown=10 snaps to 10 (already multiple of 5)
        state = {"last_trigger": {"__global__": 0}}
        assert _should_fire_event("while", state, "__global__", True, 10, _event_def("while", cooldown=10))

    def test_does_not_fire_when_cooldown_not_elapsed(self):
        state = {"last_trigger": {"__global__": 0}}
        assert not _should_fire_event("while", state, "__global__", True, 5, _event_def("while", cooldown=10))

    def test_does_not_fire_when_not_matched(self):
        state = {"last_trigger": {"__global__": 0}}
        assert not _should_fire_event("while", state, "__global__", False, 9999, _event_def("while", cooldown=10))

    def test_fires_first_time_no_prior_trigger(self):
        """No last_trigger — defaults to -999999, so cooldown always elapsed."""
        state = _empty_state()
        assert _should_fire_event("while", state, "__global__", True, 0, _event_def("while", cooldown=10))

    def test_cooldown_snapped_up(self):
        """cooldown=3 snaps up to TICK_MINUTES=5."""
        state = {"last_trigger": {"__global__": 0}}
        # With snap, cooldown becomes 5, so at time=5 it should fire.
        assert _should_fire_event("while", state, "__global__", True, 5, _event_def("while", cooldown=3))
        # At time=4 it should not.
        assert not _should_fire_event("while", state, "__global__", True, 4, _event_def("while", cooldown=3))


# ===========================================================================
# _update_event_state
# ===========================================================================


class TestUpdateEventState:

    def test_on_change_updates_last_match_true(self):
        state = _empty_state()
        _update_event_state("on_change", state, "npc1", True, 100, False)
        assert state["last_match"]["npc1"] is True

    def test_on_change_updates_last_match_false(self):
        state = {"last_match": {"npc1": True}}
        _update_event_state("on_change", state, "npc1", False, 100, False)
        assert state["last_match"]["npc1"] is False

    def test_while_sets_last_trigger_on_fire(self):
        state = _empty_state()
        _update_event_state("while", state, "__global__", True, 500, True)
        assert state["last_trigger"]["__global__"] == 500

    def test_while_does_not_set_last_trigger_when_not_fired(self):
        state = _empty_state()
        _update_event_state("while", state, "__global__", True, 500, False)
        assert "last_trigger" not in state

    def test_once_sets_fired_global(self):
        state = _empty_state()
        _update_event_state("once", state, "__global__", True, 100, True)
        assert state["fired"] is True

    def test_once_appends_fired_chars(self):
        state = _empty_state()
        _update_event_state("once", state, "npc1", True, 100, True)
        assert "npc1" in state["fired_chars"]

    def test_once_does_not_duplicate_fired_chars(self):
        state = {"fired_chars": ["npc1"]}
        _update_event_state("once", state, "npc1", True, 100, True)
        assert state["fired_chars"].count("npc1") == 1

    def test_once_does_not_modify_state_when_not_fired(self):
        state = _empty_state()
        _update_event_state("once", state, "__global__", False, 100, False)
        assert "fired" not in state
        assert "fired_chars" not in state


# ===========================================================================
# evaluate_events (integration)
# ===========================================================================


class TestEvaluateEvents:

    def test_scope_none_time_condition_fires(self, game_state: MockGameState):
        """scope='none' event fires when time condition met."""
        game_state.time.hour = 22
        game_state.event_defs["evt1"] = {
            "id": "evt1",
            "name": "Nightfall",
            "triggerMode": "once",
            "targetScope": "none",
            "conditions": [{"type": "time", "hourMin": 22}],
            "effects": [],
        }
        results = evaluate_events(game_state)
        assert len(results) == 1
        assert results[0]["event"] == "Nightfall"
        assert results[0]["charId"] is None

    def test_scope_none_time_condition_not_met(self, game_state: MockGameState):
        """scope='none' event does not fire when time condition not met."""
        game_state.time.hour = 10
        game_state.event_defs["evt1"] = {
            "id": "evt1",
            "name": "Nightfall",
            "triggerMode": "once",
            "targetScope": "none",
            "conditions": [{"type": "time", "hourMin": 22}],
            "effects": [],
        }
        results = evaluate_events(game_state)
        assert len(results) == 0

    def test_scope_each_character_fires_per_char(self, game_state: MockGameState):
        """scope='each_character' evaluates per character and fires for each."""
        # Use a condition that all characters match (time-based, always true)
        game_state.time.hour = 23
        game_state.event_defs["evt1"] = {
            "id": "evt1",
            "name": "LateNight",
            "triggerMode": "once",
            "targetScope": "each_character",
            "conditions": [{"type": "time", "hourMin": 22}],
            "effects": [],
        }
        results = evaluate_events(game_state)
        # Should fire once per character (player + npc1 from fixture)
        assert len(results) == 2
        char_ids = {r["charId"] for r in results}
        assert "player" in char_ids
        assert "npc1" in char_ids

    def test_char_filter_limits_to_one(self, game_state: MockGameState):
        """char_filter restricts evaluation to a single character."""
        game_state.time.hour = 23
        game_state.event_defs["evt1"] = {
            "id": "evt1",
            "name": "LateNight",
            "triggerMode": "once",
            "targetScope": "each_character",
            "conditions": [{"type": "time", "hourMin": 22}],
            "effects": [],
        }
        results = evaluate_events(game_state, char_filter="npc1")
        assert len(results) == 1
        assert results[0]["charId"] == "npc1"

    def test_disabled_event_skipped(self, game_state: MockGameState):
        """Events with enabled=False are not evaluated."""
        game_state.time.hour = 23
        game_state.event_defs["evt1"] = {
            "id": "evt1",
            "name": "Disabled",
            "triggerMode": "once",
            "targetScope": "none",
            "enabled": False,
            "conditions": [{"type": "time", "hourMin": 22}],
            "effects": [],
        }
        results = evaluate_events(game_state)
        assert len(results) == 0

    def test_scope_filter_limits_scope(self, game_state: MockGameState):
        """scope_filter only evaluates events matching the given scope."""
        game_state.time.hour = 23
        game_state.event_defs["evt_none"] = {
            "id": "evt_none",
            "name": "GlobalEvt",
            "triggerMode": "once",
            "targetScope": "none",
            "conditions": [{"type": "time", "hourMin": 22}],
            "effects": [],
        }
        game_state.event_defs["evt_char"] = {
            "id": "evt_char",
            "name": "CharEvt",
            "triggerMode": "once",
            "targetScope": "each_character",
            "conditions": [{"type": "time", "hourMin": 22}],
            "effects": [],
        }
        # Filter to "none" scope only
        results = evaluate_events(game_state, scope_filter="none")
        assert len(results) == 1
        assert results[0]["event"] == "GlobalEvt"

        # Reset state for second call
        game_state.event_state.clear()

        # Filter to "each_character" scope only
        results = evaluate_events(game_state, scope_filter="each_character")
        assert all(r["event"] == "CharEvt" for r in results)
        assert len(results) == 2
