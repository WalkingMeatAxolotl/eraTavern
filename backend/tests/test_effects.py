"""Tests for _apply_effects (resource, ability, experience, item, trait, etc.)."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import _apply_effects

# ========================
# Resource effects
# ========================

class TestResourceEffects:
    def test_add_resource(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 200, "target": "self"}]
        summaries = _apply_effects(effects, char, game_state, "player", None)
        assert char["resources"]["stamina"]["value"] == 1200
        assert any("体力" in s for s in summaries)

    def test_add_resource_clamps_to_max(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 9999, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["resources"]["stamina"]["value"] == 2000  # max

    def test_subtract_resource_clamps_to_zero(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": -9999, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["resources"]["stamina"]["value"] == 0

    def test_set_resource(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "set", "value": 500, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["resources"]["stamina"]["value"] == 500

    def test_percent_add(self, game_state):
        char = game_state.characters["player"]  # stamina=1000
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 50, "valuePercent": True, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["resources"]["stamina"]["value"] == 1500  # 1000 + 50%*1000

    def test_target_npc(self, game_state):
        """Effect targeting NPC should modify NPC's resource and show prefix."""
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 100, "target": "{{targetId}}"}]
        char = game_state.characters["player"]
        summaries = _apply_effects(effects, char, game_state, "player", "npc1")
        assert game_state.characters["npc1"]["resources"]["stamina"]["value"] == 1100
        assert any("[Sakuya]" in s for s in summaries)

    def test_target_missing(self, game_state):
        """Effect targeting nonexistent NPC should be skipped."""
        char = game_state.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 100, "target": "{{targetId}}"}]
        summaries = _apply_effects(effects, char, game_state, "player", "nobody")
        assert summaries == []


# ========================
# Ability effects
# ========================

class TestAbilityEffects:
    def test_add_ability_exp(self, game_state):
        char = game_state.characters["player"]  # technique exp=3000
        effects = [{"type": "ability", "key": "technique", "op": "add", "value": 500, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        ab = next(a for a in char["abilities"] if a["key"] == "technique")
        assert ab["exp"] == 3500

    def test_set_ability(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "ability", "key": "technique", "op": "set", "value": 7000, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        ab = next(a for a in char["abilities"] if a["key"] == "technique")
        assert ab["exp"] == 7000
        assert ab["grade"] == "S"

    def test_ability_clamps_to_zero(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "ability", "key": "technique", "op": "add", "value": -99999, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        ab = next(a for a in char["abilities"] if a["key"] == "technique")
        assert ab["exp"] == 0


# ========================
# Experience effects
# ========================

class TestExperienceEffects:
    def test_add_experience(self, game_state):
        char = game_state.characters["player"]  # kiss count=0
        effects = [{"type": "experience", "key": "kiss", "value": 1, "target": "self"}]
        summaries = _apply_effects(effects, char, game_state, "player", "npc1")
        exp = next(e for e in char["experiences"] if e["key"] == "kiss")
        assert exp["count"] == 1
        assert any("接吻" in s for s in summaries)

    def test_first_occurrence_recorded(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "experience", "key": "kiss", "value": 1, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", "npc1")
        exp = next(e for e in char["experiences"] if e["key"] == "kiss")
        assert exp["first"] is not None
        assert "酒馆" in exp["first"]["location"]
        assert exp["first"]["target"] == "Sakuya"  # partner is the action target
        assert "time" in exp["first"]

    def test_first_occurrence_for_npc_target(self, game_state):
        """When effect target is NPC, partner should be the actor (player)."""
        npc = game_state.characters["npc1"]
        effects = [{"type": "experience", "key": "kiss", "value": 1, "target": "{{targetId}}"}]
        char = game_state.characters["player"]
        _apply_effects(effects, char, game_state, "player", "npc1")
        exp = next(e for e in npc["experiences"] if e["key"] == "kiss")
        assert exp["count"] == 1
        assert exp["first"]["target"] == "Player"  # partner is the actor

    def test_first_occurrence_not_overwritten(self, game_state):
        """Second increment should not overwrite first occurrence."""
        char = game_state.characters["player"]
        char["experiences"] = [{"key": "kiss", "label": "接吻经验", "count": 3, "first": {"event": "kiss", "location": "old", "target": "old", "time": "old"}}]
        effects = [{"type": "experience", "key": "kiss", "value": 1, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", "npc1")
        exp = next(e for e in char["experiences"] if e["key"] == "kiss")
        assert exp["count"] == 4
        assert exp["first"]["location"] == "old"  # unchanged

    def test_experience_clamps_to_zero(self, game_state):
        char = game_state.characters["player"]
        char["experiences"] = [{"key": "kiss", "label": "接吻经验", "count": 2, "first": None}]
        effects = [{"type": "experience", "key": "kiss", "value": -99, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        exp = next(e for e in char["experiences"] if e["key"] == "kiss")
        assert exp["count"] == 0

    def test_experience_missing_key_ignored(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "experience", "key": "nonexistent", "value": 1, "target": "self"}]
        summaries = _apply_effects(effects, char, game_state, "player", None)
        assert summaries == []


# ========================
# BasicInfo effects
# ========================

class TestBasicInfoEffects:
    def test_add_money(self, game_state):
        char = game_state.characters["player"]  # money=100
        effects = [{"type": "basicInfo", "key": "money", "op": "add", "value": 50, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["basicInfo"]["money"]["value"] == 150

    def test_set_money(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "basicInfo", "key": "money", "op": "set", "value": 999, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["basicInfo"]["money"]["value"] == 999


# ========================
# Item effects
# ========================

class TestItemEffects:
    def test_add_item_new(self, game_state):
        game_state.item_defs["potion"] = {"name": "药水", "tags": ["consumable"]}
        char = game_state.characters["player"]
        effects = [{"type": "item", "op": "addItem", "itemId": "potion", "amount": 3, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert len(char["inventory"]) == 1
        assert char["inventory"][0]["itemId"] == "potion"
        assert char["inventory"][0]["amount"] == 3

    def test_add_item_new_op(self, game_state):
        """New op name 'add' should work same as legacy 'addItem'."""
        game_state.item_defs["gem"] = {"name": "宝石", "tags": []}
        char = game_state.characters["player"]
        effects = [{"type": "item", "op": "add", "itemId": "gem", "amount": 2, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert any(i["itemId"] == "gem" and i["amount"] == 2 for i in char["inventory"])

    def test_add_item_stacks(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [{"itemId": "potion", "name": "药水", "tags": [], "amount": 2}]
        game_state.item_defs["potion"] = {"name": "药水", "tags": []}
        effects = [{"type": "item", "op": "addItem", "itemId": "potion", "amount": 5, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["inventory"][0]["amount"] == 7

    def test_remove_item(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [{"itemId": "potion", "name": "药水", "tags": [], "amount": 5}]
        effects = [{"type": "item", "op": "removeItem", "itemId": "potion", "amount": 3, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["inventory"][0]["amount"] == 2

    def test_remove_item_deletes_at_zero(self, game_state):
        char = game_state.characters["player"]
        char["inventory"] = [{"itemId": "potion", "name": "药水", "tags": [], "amount": 1}]
        effects = [{"type": "item", "op": "removeItem", "itemId": "potion", "amount": 1, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert len(char["inventory"]) == 0


# ========================
# Trait effects
# ========================

class TestTraitEffects:
    def test_add_trait(self, game_state):
        effects = [{"type": "trait", "key": "bodyTrait", "traitId": "strong", "op": "addTrait", "target": "self"}]
        char = game_state.characters["player"]
        _apply_effects(effects, char, game_state, "player", None)
        traits = game_state.character_data["player"]["traits"]
        assert "strong" in traits.get("bodyTrait", [])

    def test_add_trait_new_op(self, game_state):
        """New op name 'add' should work same as legacy 'addTrait'."""
        effects = [{"type": "trait", "key": "bodyTrait", "traitId": "agile", "op": "add", "target": "self"}]
        char = game_state.characters["player"]
        _apply_effects(effects, char, game_state, "player", None)
        assert "agile" in game_state.character_data["player"]["traits"].get("bodyTrait", [])

    def test_remove_trait(self, game_state):
        game_state.character_data["player"]["traits"]["bodyTrait"] = ["strong", "fast"]
        effects = [{"type": "trait", "key": "bodyTrait", "traitId": "strong", "op": "removeTrait", "target": "self"}]
        char = game_state.characters["player"]
        _apply_effects(effects, char, game_state, "player", None)
        assert "strong" not in game_state.character_data["player"]["traits"]["bodyTrait"]
        assert "fast" in game_state.character_data["player"]["traits"]["bodyTrait"]


# ========================
# Favorability effects
# ========================

class TestFavorabilityEffects:
    def test_add_fav(self, game_state):
        effects = [{"type": "favorability", "favFrom": "{{targetId}}", "favTo": "self", "op": "add", "value": 50}]
        char = game_state.characters["player"]
        _apply_effects(effects, char, game_state, "player", "npc1")
        fav = game_state.character_data["npc1"]["favorability"]
        assert fav["player"] == 250  # was 200

    def test_set_fav(self, game_state):
        effects = [{"type": "favorability", "favFrom": "{{targetId}}", "favTo": "self", "op": "set", "value": 999}]
        char = game_state.characters["player"]
        _apply_effects(effects, char, game_state, "player", "npc1")
        fav = game_state.character_data["npc1"]["favorability"]
        assert fav["player"] == 999

    def test_fav_summary_shows_names(self, game_state):
        effects = [{"type": "favorability", "favFrom": "{{targetId}}", "favTo": "self", "op": "add", "value": 10}]
        char = game_state.characters["player"]
        summaries = _apply_effects(effects, char, game_state, "player", "npc1")
        assert any("→" in s and "好感度" in s for s in summaries)


# ========================
# Value modifiers on effects
# ========================

class TestEffectValueModifiers:
    def test_additive_modifier(self, game_state):
        """Effect value gets additive bonus from ability modifier."""
        char = game_state.characters["player"]  # technique=3000
        effects = [{
            "type": "resource", "key": "stamina", "op": "add", "value": 100, "target": "self",
            "valueModifiers": [{"type": "ability", "key": "technique", "per": 1000, "bonus": 10}],
        }]
        _apply_effects(effects, char, game_state, "player", None)
        # value = (100 + 30) * 1.0 = 130
        assert char["resources"]["stamina"]["value"] == 1130

    def test_multiply_modifier(self, game_state):
        char = game_state.characters["player"]  # technique=3000
        effects = [{
            "type": "resource", "key": "stamina", "op": "add", "value": 100, "target": "self",
            "valueModifiers": [{"type": "ability", "key": "technique", "per": 1000, "bonus": 50, "bonusMode": "multiply"}],
        }]
        _apply_effects(effects, char, game_state, "player", None)
        # raw_bonus = 3*50=150 → mul = 1+150/100=2.5 → value = int((100+0)*2.5)=250
        assert char["resources"]["stamina"]["value"] == 1250

    def test_mixed_modifiers(self, game_state):
        char = game_state.characters["player"]  # technique=3000
        effects = [{
            "type": "resource", "key": "stamina", "op": "add", "value": 100, "target": "self",
            "valueModifiers": [
                {"type": "ability", "key": "technique", "per": 1000, "bonus": 10, "bonusMode": "add"},
                {"type": "ability", "key": "technique", "per": 3000, "bonus": 100, "bonusMode": "multiply"},
            ],
        }]
        _apply_effects(effects, char, game_state, "player", None)
        # add_bonus=30, mul=1+100/100=2.0 → value = int((100+30)*2.0) = 260
        assert char["resources"]["stamina"]["value"] == 1260


# ========================
# Target prefix in summaries
# ========================

class TestTargetPrefixSummaries:
    def test_self_no_prefix(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 10, "target": "self"}]
        summaries = _apply_effects(effects, char, game_state, "player", None)
        assert summaries[0].startswith("体力")  # no prefix

    def test_npc_has_prefix(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "resource", "key": "stamina", "op": "add", "value": 10, "target": "{{targetId}}"}]
        summaries = _apply_effects(effects, char, game_state, "player", "npc1")
        assert summaries[0].startswith("[Sakuya]")


# ========================
# Clothing effects
# ========================

class TestClothingEffects:
    def test_set_clothing_state(self, game_state):
        game_state.character_data["player"]["clothing"] = {"hat": {"itemId": "wizard_hat", "state": "worn"}}
        char = game_state.characters["player"]
        effects = [{"type": "clothing", "slot": "hat", "state": "halfWorn", "op": "set", "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert game_state.character_data["player"]["clothing"]["hat"]["state"] == "halfWorn"

    def test_remove_clothing(self, game_state):
        game_state.character_data["player"]["clothing"] = {"hat": {"itemId": "wizard_hat", "state": "worn"}}
        char = game_state.characters["player"]
        effects = [{"type": "clothing", "slot": "hat", "op": "remove", "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        hat = game_state.character_data["player"]["clothing"].get("hat", {})
        # remove should clear the slot (state=empty or itemId removed)
        assert hat.get("state") in ("empty", None) or hat.get("itemId") is None


# ========================
# Position effects
# ========================

class TestPositionEffects:
    def test_change_position(self, game_state):
        char = game_state.characters["player"]
        effects = [{"type": "position", "mapId": "tavern", "cellId": 3, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["position"]["cellId"] == 3

    def test_change_position_map(self, game_state):
        game_state.maps["forest"] = {
            "id": "forest", "name": "森林",
            "cells": [{"id": 1, "name": "入口"}],
            "cell_index": {1: {"name": "入口"}},
        }
        char = game_state.characters["player"]
        effects = [{"type": "position", "mapId": "forest", "cellId": 1, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert char["position"]["mapId"] == "forest"
        assert char["position"]["cellId"] == 1


# ========================
# WorldVar effects
# ========================

class TestWorldVarEffects:
    def test_add_world_var(self, game_state):
        game_state.world_variables["counter"] = 10
        char = game_state.characters["player"]
        effects = [{"type": "worldVar", "key": "counter", "op": "add", "value": 5, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert game_state.world_variables["counter"] == 15

    def test_set_world_var(self, game_state):
        game_state.world_variables["counter"] = 10
        char = game_state.characters["player"]
        effects = [{"type": "worldVar", "key": "counter", "op": "set", "value": 99, "target": "self"}]
        _apply_effects(effects, char, game_state, "player", None)
        assert game_state.world_variables["counter"] == 99
