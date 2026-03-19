"""Tests for condition evaluation logic."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import _evaluate_conditions

# ========================
# Location conditions
# ========================


class TestLocationCondition:
    def test_exact_cell_match(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "location", "mapId": "tavern", "cellIds": [1]}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_exact_cell_no_match(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "location", "mapId": "tavern", "cellIds": [2, 3]}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_wrong_map(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "location", "mapId": "forest", "cellIds": [1]}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_cell_tag_match(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "location", "mapId": "tavern", "cellIds": [], "cellTags": ["bar"]}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_cell_tag_no_match(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "location", "mapId": "tavern", "cellIds": [], "cellTags": ["kitchen"]}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_map_only_no_cell_restriction(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "location", "mapId": "tavern"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_empty_cells_and_tags_passes(self, game_state):
        """No cellIds and no cellTags → any cell on this map passes."""
        char = game_state.characters["player"]
        cond = [{"type": "location", "mapId": "tavern", "cellIds": [], "cellTags": []}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Resource conditions
# ========================


class TestResourceCondition:
    def test_resource_gte_pass(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "resource", "key": "stamina", "op": ">=", "value": 500}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_resource_gte_fail(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "resource", "key": "stamina", "op": ">=", "value": 5000}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_resource_lt(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "resource", "key": "stamina", "op": "<", "value": 2000}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_resource_missing_key(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "resource", "key": "nonexistent", "op": ">=", "value": 0}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Ability conditions
# ========================


class TestAbilityCondition:
    def test_ability_pass(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "ability", "key": "technique", "op": ">=", "value": 1000}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_ability_fail(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "ability", "key": "technique", "op": ">=", "value": 9999}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_ability_missing_key(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "ability", "key": "nonexistent", "op": ">=", "value": 0}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Trait conditions
# ========================


class TestTraitCondition:
    def test_has_trait(self, game_state):
        char = game_state.characters["player"]
        game_state.character_data["player"]["traits"] = {"race": ["human"]}
        cond = [{"type": "trait", "key": "race", "traitId": "human"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_missing_trait(self, game_state):
        char = game_state.characters["player"]
        game_state.character_data["player"]["traits"] = {"race": ["human"]}
        cond = [{"type": "trait", "key": "race", "traitId": "elf"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_no_trait(self, game_state):
        char = game_state.characters["player"]
        game_state.character_data["player"]["traits"] = {"race": ["human"]}
        cond = [{"type": "noTrait", "key": "race", "traitId": "elf"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_no_trait_fail(self, game_state):
        char = game_state.characters["player"]
        game_state.character_data["player"]["traits"] = {"race": ["human"]}
        cond = [{"type": "noTrait", "key": "race", "traitId": "human"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# NPC presence conditions
# ========================


class TestNpcPresenceCondition:
    def test_npc_present(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "npcPresent"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_npc_present_specific(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "npcPresent", "npcId": "npc1"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_npc_present_wrong_id(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "npcPresent", "npcId": "nobody"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_npc_not_at_same_cell(self, game_state):
        game_state.characters["npc1"]["position"]["cellId"] = 2
        char = game_state.characters["player"]
        cond = [{"type": "npcPresent"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# NPC absent conditions
# ========================


class TestNpcAbsentCondition:
    def test_npc_absent_any(self, game_state):
        """npcAbsent with no npcId: true when no NPC at same cell."""
        game_state.characters["npc1"]["position"]["cellId"] = 2
        char = game_state.characters["player"]
        cond = [{"type": "npcAbsent"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_npc_absent_any_fail(self, game_state):
        """npcAbsent fails when NPC is at same cell."""
        char = game_state.characters["player"]
        cond = [{"type": "npcAbsent"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_npc_absent_specific(self, game_state):
        """npcAbsent with npcId: true when specific NPC not at same cell."""
        game_state.characters["npc1"]["position"]["cellId"] = 2
        char = game_state.characters["player"]
        cond = [{"type": "npcAbsent", "npcId": "npc1"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_npc_absent_specific_fail(self, game_state):
        """Specific NPC is present → npcAbsent fails."""
        char = game_state.characters["player"]
        cond = [{"type": "npcAbsent", "npcId": "npc1"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Time conditions
# ========================


class TestTimeCondition:
    def test_hour_range_pass(self, game_state):
        game_state.time.hour = 14
        char = game_state.characters["player"]
        cond = [{"type": "time", "hourMin": 10, "hourMax": 18}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_hour_range_fail(self, game_state):
        game_state.time.hour = 6
        char = game_state.characters["player"]
        cond = [{"type": "time", "hourMin": 10, "hourMax": 18}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_season(self, game_state):
        game_state.time.season = 0  # spring
        char = game_state.characters["player"]
        cond = [{"type": "time", "season": "spring"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_season_mismatch(self, game_state):
        game_state.time.season = 2  # autumn
        char = game_state.characters["player"]
        cond = [{"type": "time", "season": "spring"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_day_of_week(self, game_state):
        char = game_state.characters["player"]
        weekday = game_state.time.weekday
        cond = [{"type": "time", "dayOfWeek": weekday}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_day_of_week_mismatch(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "time", "dayOfWeek": "星期日"}]
        # Force a day that's not Sunday
        game_state.time.day = 2  # should be 星期二
        weekday = game_state.time.weekday
        if weekday == "星期日":
            game_state.time.day = 3
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Clothing conditions
# ========================


class TestClothingCondition:
    def test_clothing_slot_state(self, game_state):
        """Check clothing slot has specific state."""
        game_state.characters["player"]["clothing"] = [
            {
                "slot": "hat",
                "itemId": "wizard_hat",
                "itemName": "巫师帽",
                "state": "worn",
                "occluded": False,
                "slotLabel": "帽子",
            },
        ]
        char = game_state.characters["player"]
        cond = [{"type": "clothing", "slot": "hat", "state": "worn"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_clothing_wrong_state(self, game_state):
        game_state.characters["player"]["clothing"] = [
            {
                "slot": "hat",
                "itemId": "wizard_hat",
                "itemName": "巫师帽",
                "state": "none",
                "occluded": False,
                "slotLabel": "帽子",
            },
        ]
        char = game_state.characters["player"]
        cond = [{"type": "clothing", "slot": "hat", "state": "worn"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Variable conditions
# ========================


class TestVariableCondition:
    def test_variable_check(self, game_state):
        game_state.variable_defs["power"] = {
            "id": "power",
            "steps": [{"type": "constant", "value": 50}],
        }
        char = game_state.characters["player"]
        cond = [{"type": "variable", "varId": "power", "op": ">=", "value": 30}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_variable_check_fail(self, game_state):
        game_state.variable_defs["power"] = {
            "id": "power",
            "steps": [{"type": "constant", "value": 10}],
        }
        char = game_state.characters["player"]
        cond = [{"type": "variable", "varId": "power", "op": ">=", "value": 30}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# WorldVar conditions
# ========================


class TestWorldVarCondition:
    def test_world_var_check(self, game_state):
        game_state.world_variables["questDone"] = 1
        char = game_state.characters["player"]
        cond = [{"type": "worldVar", "key": "questDone", "op": "==", "value": 1}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_world_var_check_fail(self, game_state):
        game_state.world_variables["questDone"] = 0
        char = game_state.characters["player"]
        cond = [{"type": "worldVar", "key": "questDone", "op": "==", "value": 1}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Favorability conditions
# ========================


class TestFavorabilityCondition:
    def test_fav_from_target(self, game_state):
        """NPC fav towards player >= 100."""
        char = game_state.characters["player"]
        # npc1 has fav towards player = 200 (in character_data)
        # condTarget="target" → check_char = npc1
        # targetId="self" → resolves to char_id = "player" (who the fav is towards)
        game_state.characters["npc1"]["favorability"] = [{"id": "player", "name": "Player", "value": 200}]
        cond = [{"type": "favorability", "targetId": "self", "op": ">=", "value": 100, "condTarget": "target"}]
        assert _evaluate_conditions(cond, char, game_state, target_id="npc1", char_id="player")

    def test_fav_below_threshold(self, game_state):
        game_state.characters["npc1"]["favorability"] = [{"id": "player", "name": "Player", "value": 50}]
        char = game_state.characters["player"]
        cond = [{"type": "favorability", "targetId": "{{targetId}}", "op": ">=", "value": 100, "condTarget": "target"}]
        assert not _evaluate_conditions(cond, char, game_state, target_id="npc1", char_id="player")


# ========================
# HasItem conditions
# ========================


class TestHasItemCondition:
    def test_has_item(self, game_state):
        game_state.characters["player"]["inventory"] = [
            {"itemId": "key1", "name": "钥匙", "tags": ["key"], "amount": 1}
        ]
        char = game_state.characters["player"]
        cond = [{"type": "hasItem", "itemId": "key1"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_missing_item(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "hasItem", "itemId": "key1"}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_has_item_by_tag(self, game_state):
        game_state.characters["player"]["inventory"] = [
            {"itemId": "sword1", "name": "剑", "tags": ["weapon"], "amount": 1}
        ]
        char = game_state.characters["player"]
        cond = [{"type": "hasItem", "tag": "weapon"}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# BasicInfo conditions
# ========================


class TestBasicInfoCondition:
    def test_money_check(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "basicInfo", "key": "money", "op": ">=", "value": 50}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_money_insufficient(self, game_state):
        char = game_state.characters["player"]
        cond = [{"type": "basicInfo", "key": "money", "op": ">=", "value": 999}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")


# ========================
# Composite conditions (AND/OR/NOT)
# ========================


class TestCompositeConditions:
    def test_and_all_true(self, game_state):
        char = game_state.characters["player"]
        cond = [
            {
                "and": [
                    {"type": "location", "mapId": "tavern"},
                    {"type": "resource", "key": "stamina", "op": ">=", "value": 100},
                ]
            }
        ]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_and_one_false(self, game_state):
        char = game_state.characters["player"]
        cond = [
            {
                "and": [
                    {"type": "location", "mapId": "tavern"},
                    {"type": "resource", "key": "stamina", "op": ">=", "value": 99999},
                ]
            }
        ]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_or_one_true(self, game_state):
        char = game_state.characters["player"]
        cond = [
            {
                "or": [
                    {"type": "location", "mapId": "forest"},  # false
                    {"type": "location", "mapId": "tavern"},  # true
                ]
            }
        ]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_or_all_false(self, game_state):
        char = game_state.characters["player"]
        cond = [
            {
                "or": [
                    {"type": "location", "mapId": "forest"},
                    {"type": "location", "mapId": "dungeon"},
                ]
            }
        ]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_not(self, game_state):
        char = game_state.characters["player"]
        cond = [{"not": {"type": "location", "mapId": "forest"}}]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_not_negates_true(self, game_state):
        char = game_state.characters["player"]
        cond = [{"not": {"type": "location", "mapId": "tavern"}}]
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_nested_not_or(self, game_state):
        """NOT(OR(forest, dungeon)) → NOT(false) → true."""
        char = game_state.characters["player"]
        cond = [
            {
                "not": {
                    "or": [
                        {"type": "location", "mapId": "forest"},
                        {"type": "location", "mapId": "dungeon"},
                    ]
                }
            }
        ]
        assert _evaluate_conditions(cond, char, game_state, char_id="player")

    def test_skip_target_dependent(self, game_state):
        """When skip_target_conds=True, conditions with condTarget='target' are skipped."""
        char = game_state.characters["player"]
        cond = [
            {"type": "resource", "key": "stamina", "op": ">=", "value": 9999, "condTarget": "target"},
            {"type": "location", "mapId": "tavern"},
        ]
        # Should skip the resource check (target dep) and pass on location alone
        assert _evaluate_conditions(cond, char, game_state, char_id="player", skip_target_conds=True)

    def test_empty_conditions(self, game_state):
        char = game_state.characters["player"]
        assert _evaluate_conditions([], char, game_state, char_id="player")

    def test_deep_nesting_limit(self, game_state):
        """Recursion depth > 8 should be cut off (depth check returns False)."""
        char = game_state.characters["player"]
        # 9 NOT wraps: depths 0-7 execute as NOT, depth 8 calls depth 9 which
        # hits the limit (>8) → returns False. 8 executed NOTs (even) keep False.
        # Without the limit, 9 NOTs around True (location=tavern) would give False,
        # so we verify the limit fires by wrapping in one more NOT to flip the result.
        # Actually: use a condition that is True (location=tavern).
        # Without limit: NOT^9(True) = False (odd NOTs).
        # With limit: the innermost NOT at depth 8 calls leaf at depth 9 → False.
        #   NOT^8(False) at depths 7..0 = False (even flips). Same result!
        # So instead, use AND wrapper to push depth +1, making limit affect outcome differently.
        # Simplest approach: verify depth limit fires by checking a True leaf becomes False.
        item = {"type": "location", "mapId": "tavern"}  # True normally
        # Wrap in enough ANDs to exceed depth limit
        for _ in range(10):
            item = {"and": [item]}
        cond = [item]
        # Leaf at depth 10 hits depth > 8 limit → returns False
        assert not _evaluate_conditions(cond, char, game_state, char_id="player")
