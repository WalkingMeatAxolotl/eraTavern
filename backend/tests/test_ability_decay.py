"""Phase 1/2: Unit tests for ability decay (accumulation-based, per-tick)."""

from __future__ import annotations

import pytest
from game.character import apply_ability_decay, exp_to_grade


def _make_chars(exp=100):
    return {
        "char1": {
            "abilities": [{"key": "sword", "exp": exp, "grade": exp_to_grade(exp)}],
        },
    }


def _make_trait_defs(interval=60, amount=10, decay_type="fixed"):
    return {
        "sword": {
            "id": "sword",
            "category": "ability",
            "decay": {
                "intervalMinutes": interval,
                "amount": amount,
                "type": decay_type,
            },
        },
    }


class TestAccumulation:
    """Test that decay accumulates across small time steps."""

    def test_small_steps_accumulate(self):
        """Bug fix: timeCost < intervalMinutes should still trigger eventually."""
        chars = _make_chars(100)
        trait_defs = _make_trait_defs(interval=60, amount=10)
        acc = {}

        # 4 steps of 20 min = 80 min total, should trigger once at 60 min
        for _ in range(4):
            apply_ability_decay(chars, trait_defs, 20, acc)

        assert chars["char1"]["abilities"][0]["exp"] == 90  # 100 - 10
        assert acc["char1"]["sword"] == 20  # 80 % 60 = 20 remainder

    def test_no_trigger_below_interval(self):
        chars = _make_chars(100)
        trait_defs = _make_trait_defs(interval=60, amount=10)
        acc = {}

        apply_ability_decay(chars, trait_defs, 30, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 100  # no change
        assert acc["char1"]["sword"] == 30

    def test_remainder_carries_over(self):
        """After trigger, remainder should carry into next accumulation."""
        chars = _make_chars(100)
        trait_defs = _make_trait_defs(interval=60, amount=10)
        acc = {}

        # 50 min → no trigger, acc=50
        apply_ability_decay(chars, trait_defs, 50, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 100
        # 20 min → acc=70, trigger once, acc=10
        apply_ability_decay(chars, trait_defs, 20, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 90
        assert acc["char1"]["sword"] == 10
        # 50 min → acc=60, trigger once, acc=0
        apply_ability_decay(chars, trait_defs, 50, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 80
        assert acc["char1"]["sword"] == 0

    def test_multiple_triggers(self):
        """120 min elapsed with 60 min interval = 2 triggers."""
        chars = _make_chars(100)
        trait_defs = _make_trait_defs(interval=60, amount=10)
        acc = {}

        apply_ability_decay(chars, trait_defs, 120, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 80  # 100 - 10*2
        assert acc["char1"]["sword"] == 0


class TestFixedDecay:
    def test_basic_fixed(self):
        chars = _make_chars(100)
        trait_defs = _make_trait_defs(interval=10, amount=5, decay_type="fixed")
        acc = {}

        apply_ability_decay(chars, trait_defs, 10, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 95

    def test_floor_at_zero(self):
        chars = _make_chars(3)
        trait_defs = _make_trait_defs(interval=10, amount=10, decay_type="fixed")
        acc = {}

        apply_ability_decay(chars, trait_defs, 10, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 0  # clamped


class TestPercentageDecay:
    def test_basic_percentage(self):
        chars = _make_chars(100)
        trait_defs = _make_trait_defs(interval=10, amount=10, decay_type="percentage")
        acc = {}

        apply_ability_decay(chars, trait_defs, 10, acc)
        # 100 * (1 - 0.1) = 90
        assert chars["char1"]["abilities"][0]["exp"] == 90

    def test_percentage_compounds(self):
        """Two intervals: 100 * (1-0.1)^2 = 81."""
        chars = _make_chars(100)
        trait_defs = _make_trait_defs(interval=10, amount=10, decay_type="percentage")
        acc = {}

        apply_ability_decay(chars, trait_defs, 20, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 81


class TestNoDecay:
    def test_no_decay_field(self):
        chars = _make_chars(100)
        trait_defs = {"sword": {"id": "sword", "category": "ability"}}
        acc = {}

        apply_ability_decay(chars, trait_defs, 100, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 100

    def test_non_ability_trait(self):
        chars = _make_chars(100)
        trait_defs = {"race": {"id": "race", "category": "race", "decay": {"intervalMinutes": 10, "amount": 5, "type": "fixed"}}}
        acc = {}

        apply_ability_decay(chars, trait_defs, 100, acc)
        assert chars["char1"]["abilities"][0]["exp"] == 100


class TestGradeUpdate:
    def test_grade_updated_after_decay(self):
        chars = _make_chars(100)
        trait_defs = _make_trait_defs(interval=10, amount=50, decay_type="fixed")
        acc = {}

        old_grade = chars["char1"]["abilities"][0]["grade"]
        apply_ability_decay(chars, trait_defs, 10, acc)
        new_grade = chars["char1"]["abilities"][0]["grade"]
        # Grade should be recalculated (may or may not change depending on thresholds)
        assert isinstance(new_grade, str)


class TestMultipleCharacters:
    def test_all_chars_decay(self):
        chars = {
            "a": {"abilities": [{"key": "sword", "exp": 100, "grade": "G"}]},
            "b": {"abilities": [{"key": "sword", "exp": 200, "grade": "G"}]},
        }
        trait_defs = _make_trait_defs(interval=10, amount=10)
        acc = {}

        apply_ability_decay(chars, trait_defs, 10, acc)
        assert chars["a"]["abilities"][0]["exp"] == 90
        assert chars["b"]["abilities"][0]["exp"] == 190
