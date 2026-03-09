"""Tests for _calc_modifier_bonus (additive + multiplicative, all types)."""

from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import _calc_modifier_bonus
from tests.conftest import MockGameState, make_character, make_char_data


class TestAbilityModifier:
    def test_basic_ability(self, game_state):
        char = game_state.characters["player"]  # technique exp=3000
        mods = [{"type": "ability", "key": "technique", "per": 1000, "bonus": 10}]
        add, mul = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 30  # 3000//1000 * 10
        assert mul == 1.0

    def test_ability_per_500(self, game_state):
        char = game_state.characters["player"]
        mods = [{"type": "ability", "key": "technique", "per": 500, "bonus": 5}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 30  # 3000//500 * 5

    def test_ability_missing_key(self, game_state):
        char = game_state.characters["player"]
        mods = [{"type": "ability", "key": "nonexistent", "per": 1000, "bonus": 10}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 0

    def test_ability_zero_per(self, game_state):
        """per=0 should not divide by zero."""
        char = game_state.characters["player"]
        mods = [{"type": "ability", "key": "technique", "per": 0, "bonus": 10}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 0


class TestExperienceModifier:
    def test_experience_basic(self, game_state):
        game_state.characters["player"]["experiences"] = [
            {"key": "kiss", "label": "接吻", "count": 5, "first": None},
        ]
        char = game_state.characters["player"]
        mods = [{"type": "experience", "key": "kiss", "per": 1, "bonus": 3}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 15  # 5//1 * 3

    def test_experience_per_2(self, game_state):
        game_state.characters["player"]["experiences"] = [
            {"key": "kiss", "label": "接吻", "count": 5, "first": None},
        ]
        char = game_state.characters["player"]
        mods = [{"type": "experience", "key": "kiss", "per": 2, "bonus": 10}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 20  # 5//2=2, 2*10

    def test_experience_zero_count(self, game_state):
        char = game_state.characters["player"]  # kiss count=0
        mods = [{"type": "experience", "key": "kiss", "per": 1, "bonus": 10}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 0

    def test_experience_missing_key(self, game_state):
        char = game_state.characters["player"]
        mods = [{"type": "experience", "key": "nonexistent", "per": 1, "bonus": 10}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 0


class TestTraitModifier:
    def test_trait_match(self, game_state):
        char = game_state.characters["player"]
        mods = [{"type": "trait", "key": "race", "value": "human", "bonus": 20}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 20

    def test_trait_no_match(self, game_state):
        char = game_state.characters["player"]
        mods = [{"type": "trait", "key": "race", "value": "elf", "bonus": 20}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 0


class TestFavorabilityModifier:
    def test_fav_target_to_self(self, game_state):
        """Target's fav towards self (player)."""
        char = game_state.characters["player"]
        # npc1 has fav towards player = 200
        mods = [{"type": "favorability", "source": "target", "per": 100, "bonus": 5}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", "npc1")
        assert add == 10  # 200//100 * 5

    def test_fav_self_to_target(self, game_state):
        game_state.character_data["player"]["favorability"] = {"npc1": 300}
        char = game_state.characters["player"]
        mods = [{"type": "favorability", "source": "self", "per": 100, "bonus": 3}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", "npc1")
        assert add == 9  # 300//100 * 3

    def test_fav_no_target(self, game_state):
        char = game_state.characters["player"]
        mods = [{"type": "favorability", "source": "target", "per": 100, "bonus": 5}]
        add, _ = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 0


class TestMultiplyMode:
    def test_multiply_single(self, game_state):
        char = game_state.characters["player"]  # technique=3000
        mods = [{"type": "ability", "key": "technique", "per": 1000, "bonus": 50, "bonusMode": "multiply"}]
        add, mul = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 0
        # raw_bonus = 3000//1000 * 50 = 150 → mul = 1 + 150/100 = 2.5
        assert abs(mul - 2.5) < 0.001

    def test_multiply_small(self, game_state):
        char = game_state.characters["player"]
        mods = [{"type": "ability", "key": "technique", "per": 3000, "bonus": 20, "bonusMode": "multiply"}]
        add, mul = _calc_modifier_bonus(mods, char, game_state, "player", None)
        # raw = 3000//3000 * 20 = 20 → mul = 1 + 20/100 = 1.2
        assert abs(mul - 1.2) < 0.001

    def test_mixed_add_and_multiply(self, game_state):
        char = game_state.characters["player"]  # technique=3000
        mods = [
            {"type": "ability", "key": "technique", "per": 1000, "bonus": 10, "bonusMode": "add"},
            {"type": "ability", "key": "technique", "per": 1000, "bonus": 50, "bonusMode": "multiply"},
        ]
        add, mul = _calc_modifier_bonus(mods, char, game_state, "player", None)
        assert add == 30   # 3*10
        assert abs(mul - 2.5) < 0.001  # 1 + 150/100

    def test_multiple_multipliers_stack(self, game_state):
        game_state.characters["player"]["experiences"] = [
            {"key": "kiss", "label": "接吻", "count": 2, "first": None},
        ]
        char = game_state.characters["player"]
        mods = [
            {"type": "ability", "key": "technique", "per": 3000, "bonus": 50, "bonusMode": "multiply"},
            {"type": "experience", "key": "kiss", "per": 1, "bonus": 25, "bonusMode": "multiply"},
        ]
        add, mul = _calc_modifier_bonus(mods, char, game_state, "player", None)
        # ability: 1*50=50 → ×1.5
        # exp: 2*25=50 → ×1.5
        # total mul = 1.5 * 1.5 = 2.25
        assert add == 0
        assert abs(mul - 2.25) < 0.001

    def test_no_modifiers(self, game_state):
        char = game_state.characters["player"]
        add, mul = _calc_modifier_bonus([], char, game_state, "player", None)
        assert add == 0
        assert mul == 1.0
