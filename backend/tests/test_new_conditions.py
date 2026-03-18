"""Tests for new condition types: experience, weather, outfit, hasItem qty."""

from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import _evaluate_conditions
from tests.conftest import MockGameState, make_character, make_char_data


# ========================
# Experience condition
# ========================

class TestExperienceCondition:
    def test_experience_gte_pass(self, game_state):
        game_state.character_data["player"]["experiences"] = {"kiss": {"count": 5}}
        char = game_state.characters["player"]
        cond = [{"type": "experience", "key": "kiss", "op": ">=", "value": 3}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_experience_gte_fail(self, game_state):
        game_state.character_data["player"]["experiences"] = {"kiss": {"count": 1}}
        char = game_state.characters["player"]
        cond = [{"type": "experience", "key": "kiss", "op": ">=", "value": 3}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_experience_eq(self, game_state):
        game_state.character_data["player"]["experiences"] = {"kiss": {"count": 0}}
        char = game_state.characters["player"]
        cond = [{"type": "experience", "key": "kiss", "op": "==", "value": 0}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_experience_missing_key_defaults_zero(self, game_state):
        game_state.character_data["player"]["experiences"] = {}
        char = game_state.characters["player"]
        cond = [{"type": "experience", "key": "kiss", "op": "==", "value": 0}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_experience_condTarget_target(self, game_state):
        game_state.character_data["npc1"]["experiences"] = {"cook": {"count": 10}}
        char = game_state.characters["player"]
        cond = [{"type": "experience", "key": "cook", "op": ">=", "value": 5, "condTarget": "target"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player", target_id="npc1")


# ========================
# Weather condition (via time type)
# ========================

class TestWeatherCondition:
    def test_weather_match(self, game_state):
        game_state.time.weather = "sunny"
        char = game_state.characters["player"]
        cond = [{"type": "time", "weather": "sunny"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_weather_no_match(self, game_state):
        game_state.time.weather = "rainy"
        char = game_state.characters["player"]
        cond = [{"type": "time", "weather": "sunny"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_weather_combined_with_hour(self, game_state):
        game_state.time.weather = "snowy"
        game_state.time.hour = 20
        char = game_state.characters["player"]
        cond = [{"type": "time", "weather": "snowy", "hourMin": 18}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_weather_with_season(self, game_state):
        game_state.time.weather = "snowy"
        game_state.time.season = 3  # 冬
        char = game_state.characters["player"]
        cond = [{"type": "time", "weather": "snowy", "season": "冬"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_no_weather_field_passes(self, game_state):
        """When weather is not specified in condition, any weather passes."""
        game_state.time.weather = "rainy"
        char = game_state.characters["player"]
        cond = [{"type": "time", "hourMin": 0, "hourMax": 23}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Outfit condition
# ========================

class TestOutfitCondition:
    def test_outfit_match(self, game_state):
        game_state.character_data["player"]["currentOutfit"] = "battle"
        char = game_state.characters["player"]
        cond = [{"type": "outfit", "outfitId": "battle"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_outfit_no_match(self, game_state):
        game_state.character_data["player"]["currentOutfit"] = "casual"
        char = game_state.characters["player"]
        cond = [{"type": "outfit", "outfitId": "battle"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_outfit_default(self, game_state):
        """No currentOutfit field defaults to 'default'."""
        char = game_state.characters["player"]
        cond = [{"type": "outfit", "outfitId": "default"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_outfit_condTarget_target(self, game_state):
        game_state.character_data["npc1"]["currentOutfit"] = "maid"
        char = game_state.characters["player"]
        cond = [{"type": "outfit", "outfitId": "maid", "condTarget": "target"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player", target_id="npc1")


# ========================
# hasItem with quantity
# ========================

class TestHasItemQuantity:
    def test_hasItem_basic_presence(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [{"itemId": "herb", "amount": 3, "tags": []}]
        cond = [{"type": "hasItem", "itemId": "herb"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_hasItem_not_present(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = []
        cond = [{"type": "hasItem", "itemId": "herb"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_hasItem_quantity_gte_pass(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [{"itemId": "herb", "amount": 5, "tags": []}]
        cond = [{"type": "hasItem", "itemId": "herb", "op": ">=", "value": 3}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_hasItem_quantity_gte_fail(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [{"itemId": "herb", "amount": 2, "tags": []}]
        cond = [{"type": "hasItem", "itemId": "herb", "op": ">=", "value": 3}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_hasItem_quantity_eq(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [{"itemId": "herb", "amount": 3, "tags": []}]
        cond = [{"type": "hasItem", "itemId": "herb", "op": "==", "value": 3}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_hasItem_by_tag_quantity(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [
            {"itemId": "herb_a", "amount": 2, "tags": ["herb"]},
            {"itemId": "herb_b", "amount": 3, "tags": ["herb"]},
        ]
        cond = [{"type": "hasItem", "tag": "herb", "op": ">=", "value": 5}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_hasItem_by_tag_quantity_fail(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [
            {"itemId": "herb_a", "amount": 2, "tags": ["herb"]},
        ]
        cond = [{"type": "hasItem", "tag": "herb", "op": ">=", "value": 5}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Legacy types still work (backward compat)
# ========================

class TestLegacyConditions:
    def test_npcAbsent_still_works(self, game_state):
        """npcAbsent should still evaluate (backend alias)."""
        char = game_state.characters["player"]
        # npc1 is at same location → npcAbsent should fail
        cond = [{"type": "npcAbsent", "npcId": "npc1"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_noTrait_still_works(self, game_state):
        """noTrait should still evaluate (backend alias)."""
        game_state.character_data["player"]["traits"] = {"race": ["human"]}
        char = game_state.characters["player"]
        cond = [{"type": "noTrait", "key": "race", "traitId": "elf"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_not_wrapper_equivalent(self, game_state):
        """{ not: { type: trait } } should produce same result as noTrait."""
        game_state.character_data["player"]["traits"] = {"race": ["human"]}
        char = game_state.characters["player"]
        cond_legacy = [{"type": "noTrait", "key": "race", "traitId": "elf"}]
        cond_not = [{"not": {"type": "trait", "key": "race", "traitId": "elf"}}]
        assert _evaluate_conditions(cond_legacy, char, game_state, char_id="player") == \
               _evaluate_conditions(cond_not, char, game_state, char_id="player")
