"""Tests for AI Assist P2: validator, IR compiler, templates, clone."""

from __future__ import annotations

import json

import pytest

from game.action.ir_compiler import (
    ClauseError,
    compile_action_ir,
    compile_condition_clause,
    compile_effect_clause,
    compile_event_ir,
)
from game.action.ai_templates import expand_template
from game.action.validator import ValidationMessage, validate_action, validate_event
from game.ai_assist import _apply_patch, _compile_action_payload, _compile_clone


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


class AiMockGameState:
    """Minimal mock GameState for AI assist tests."""

    def __init__(self):
        from game.staging import StagingLayer

        self.trait_defs: dict = {}
        self.item_defs: dict = {}
        self.clothing_defs: dict = {}
        self.maps: dict = {}
        self.variable_defs: dict = {}
        self.world_variable_defs: dict = {}
        self.action_defs: dict = {}
        self.event_defs: dict = {}
        self.outfit_types: list = []
        self.trait_groups: dict = {}
        self.lorebook_defs: dict = {}
        self.character_data: dict = {}
        self.template: dict = {}
        self.addon_refs = [{"id": "Test"}]
        self.staging = StagingLayer()
        self.dirty = False


@pytest.fixture
def gs():
    """Return a mock GameState with some reference data."""
    g = AiMockGameState()
    g.trait_defs = {
        "Test.brave": {"id": "Test.brave", "category": "mentalTrait"},
        "Test.stealth": {"id": "Test.stealth", "category": "ability"},
    }
    g.item_defs = {
        "Test.ale": {"id": "Test.ale", "name": "Ale"},
        "Test.gold": {"id": "Test.gold", "name": "Gold"},
    }
    g.maps = {
        "Test.tavern": {"id": "Test.tavern", "name": "Tavern"},
    }
    g.character_data = {
        "Test.bartender": {"id": "Test.bartender", "name": "Bartender", "isPlayer": False},
    }
    g.variable_defs = {
        "Test.reputation": {"id": "Test.reputation", "name": "Reputation"},
    }
    g.action_defs = {
        "Test.buy_ale": {
            "id": "Test.buy_ale",
            "name": "Buy Ale",
            "source": "Test",
            "_local_id": "buy_ale",
            "targetType": "npc",
            "timeCost": 5,
            "conditions": [{"type": "npcPresent", "npcId": "Test.bartender"}],
            "costs": [{"type": "resource", "key": "money", "amount": 5}],
            "outcomes": [
                {
                    "label": "success",
                    "grade": "success",
                    "weight": 100,
                    "effects": [{"type": "item", "itemId": "Test.ale", "op": "add", "amount": 1}],
                    "outputTemplates": [{"text": "You buy an ale."}],
                }
            ],
        }
    }
    return g


# ===========================================================================
# Step 1: Validator
# ===========================================================================


class TestValidator:
    """Test action/event validator."""

    def test_valid_action(self, gs):
        msgs = validate_action(
            {
                "id": "test",
                "name": "Test",
                "outcomes": [
                    {"effects": [{"type": "resource", "key": "hp", "op": "add", "value": 10}]}
                ],
            },
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert not errors

    def test_missing_id(self, gs):
        msgs = validate_action({"name": "Test", "outcomes": [{"effects": [{"type": "resource"}]}]}, gs)
        errors = [m for m in msgs if m.level == "error"]
        assert any(m.field == "id" for m in errors)

    def test_missing_name(self, gs):
        msgs = validate_action({"id": "test", "outcomes": [{"effects": [{"type": "resource"}]}]}, gs)
        errors = [m for m in msgs if m.level == "error"]
        assert any(m.field == "name" for m in errors)

    def test_invalid_condition_type(self, gs):
        msgs = validate_action(
            {
                "id": "test",
                "name": "Test",
                "conditions": [{"type": "INVALID_TYPE"}],
                "outcomes": [{"effects": [{"type": "resource", "key": "hp", "op": "add", "value": 1}]}],
            },
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert any("condition type" in m.message for m in errors)

    def test_invalid_effect_type(self, gs):
        msgs = validate_action(
            {
                "id": "test",
                "name": "Test",
                "outcomes": [{"effects": [{"type": "INVALID_EFFECT"}]}],
            },
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert any("effect type" in m.message for m in errors)

    def test_invalid_op(self, gs):
        msgs = validate_action(
            {
                "id": "test",
                "name": "Test",
                "conditions": [{"type": "resource", "key": "hp", "op": "BADOP", "value": 10}],
                "outcomes": [{"effects": [{"type": "resource", "key": "hp", "op": "add", "value": 1}]}],
            },
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert any("comparison op" in m.message for m in errors)

    def test_no_outcomes(self, gs):
        msgs = validate_action({"id": "test", "name": "Test", "outcomes": []}, gs)
        errors = [m for m in msgs if m.level == "error"]
        assert any("outcome" in m.message.lower() for m in errors)

    def test_empty_outcome_effects(self, gs):
        msgs = validate_action(
            {"id": "test", "name": "Test", "outcomes": [{"effects": []}]},
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert any("effects" in m.field for m in errors)

    def test_warn_cost_without_guard(self, gs):
        msgs = validate_action(
            {
                "id": "test",
                "name": "Test",
                "costs": [{"type": "resource", "key": "money", "amount": 10}],
                "outcomes": [{"effects": [{"type": "resource", "key": "hp", "op": "add", "value": 1}]}],
            },
            gs,
        )
        warnings = [m for m in msgs if m.level == "warning"]
        assert any("money" in m.message for m in warnings)

    def test_warn_npc_target_no_npc_present(self, gs):
        msgs = validate_action(
            {
                "id": "test",
                "name": "Test",
                "targetType": "npc",
                "outcomes": [{"effects": [{"type": "resource", "key": "hp", "op": "add", "value": 1}]}],
            },
            gs,
        )
        warnings = [m for m in msgs if m.level == "warning"]
        assert any("npcPresent" in m.message for m in warnings)

    def test_invalid_cost_type(self, gs):
        msgs = validate_action(
            {
                "id": "test",
                "name": "Test",
                "costs": [{"type": "BADCOST"}],
                "outcomes": [{"effects": [{"type": "resource", "key": "hp", "op": "add", "value": 1}]}],
            },
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert any("cost type" in m.message for m in errors)

    def test_ref_check_nonexistent_trait(self, gs):
        msgs = validate_action(
            {
                "id": "test",
                "name": "Test",
                "conditions": [{"type": "trait", "key": "race", "traitId": "nonexistent"}],
                "outcomes": [{"effects": [{"type": "resource", "key": "hp", "op": "add", "value": 1}]}],
            },
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert any("not found" in m.message for m in errors)

    # --- Event ---

    def test_valid_event(self, gs):
        msgs = validate_event(
            {
                "id": "test",
                "name": "Test",
                "effects": [{"type": "resource", "key": "hp", "op": "add", "value": 10}],
            },
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert not errors

    def test_event_invalid_trigger_mode(self, gs):
        msgs = validate_event(
            {
                "id": "test",
                "name": "Test",
                "triggerMode": "BAD_MODE",
                "effects": [{"type": "resource", "key": "hp", "op": "add", "value": 10}],
            },
            gs,
        )
        errors = [m for m in msgs if m.level == "error"]
        assert any("triggerMode" in m.message for m in errors)

    def test_event_no_effects(self, gs):
        msgs = validate_event({"id": "test", "name": "Test"}, gs)
        errors = [m for m in msgs if m.level == "error"]
        assert any("effect" in m.message.lower() for m in errors)


# ===========================================================================
# Step 2: IR Compiler
# ===========================================================================


class TestConditionClause:
    """Test condition clause compilation."""

    def test_resource(self):
        c = compile_condition_clause("resource stamina >= 100")
        assert c == {"type": "resource", "key": "stamina", "op": ">=", "value": 100}

    def test_ability(self):
        c = compile_condition_clause("ability stealth >= 500")
        assert c["type"] == "ability"
        assert c["key"] == "stealth"

    def test_favorability(self):
        c = compile_condition_clause("favorability {{targetId}} >= 30")
        assert c["targetId"] == "{{targetId}}"

    def test_trait(self):
        c = compile_condition_clause("trait mentalTrait has brave")
        assert c == {"type": "trait", "key": "mentalTrait", "traitId": "brave"}

    def test_no_trait(self):
        c = compile_condition_clause("noTrait race has undead")
        assert c["type"] == "noTrait"
        assert c["traitId"] == "undead"

    def test_has_item_simple(self):
        c = compile_condition_clause("hasItem iron_key")
        assert c == {"type": "hasItem", "itemId": "iron_key"}

    def test_has_item_with_amount(self):
        c = compile_condition_clause("hasItem gold >= 10")
        assert c["itemId"] == "gold"
        assert c["op"] == ">="
        assert c["value"] == 10

    def test_location(self):
        c = compile_condition_clause("location tavern cell:1,2,3")
        assert c["mapId"] == "tavern"
        assert c["cellIds"] == [1, 2, 3]

    def test_npc_present(self):
        c = compile_condition_clause("npcPresent bartender")
        assert c == {"type": "npcPresent", "npcId": "bartender"}

    def test_time(self):
        c = compile_condition_clause("time 8-20")
        assert c["hourMin"] == 8
        assert c["hourMax"] == 20

    def test_target_prefix(self):
        c = compile_condition_clause("@target: trait mentalTrait has alert")
        assert c["condTarget"] == "target"
        assert c["type"] == "trait"

    def test_outfit(self):
        c = compile_condition_clause("outfit combat")
        assert c == {"type": "outfit", "outfitId": "combat"}

    def test_clothing(self):
        c = compile_condition_clause("clothing upperBody worn")
        assert c["slot"] == "upperBody"
        assert c["state"] == "worn"

    def test_invalid_type(self):
        with pytest.raises(ClauseError) as exc_info:
            compile_condition_clause("invalidType foo >= 5")
        assert "Unknown condition type" in str(exc_info.value)

    def test_bad_op(self):
        with pytest.raises(ClauseError):
            compile_condition_clause("resource stamina BADOP 100")

    def test_missing_value(self):
        with pytest.raises(ClauseError):
            compile_condition_clause("resource stamina >=")


class TestEffectClause:
    """Test effect clause compilation."""

    def test_resource_add(self):
        e = compile_effect_clause("resource stamina add 200")
        assert e == {"type": "resource", "target": "self", "key": "stamina", "op": "add", "value": 200}

    def test_resource_percent(self):
        e = compile_effect_clause("resource hp add -30%")
        assert e["value"] == -30
        assert e["valuePercent"] is True

    def test_item_add(self):
        e = compile_effect_clause("item add gold 50")
        assert e["itemId"] == "gold"
        assert e["amount"] == 50

    def test_item_remove_default_amount(self):
        e = compile_effect_clause("item remove iron_key")
        assert e["op"] == "remove"
        assert e["amount"] == 1

    def test_favorability(self):
        e = compile_effect_clause("favorability {{targetId}} -> {{player}} -20")
        assert e["favFrom"] == "{{targetId}}"
        assert e["favTo"] == "{{player}}"
        assert e["value"] == -20

    def test_trait_add(self):
        e = compile_effect_clause("trait mentalTrait add brave")
        assert e["key"] == "mentalTrait"
        assert e["traitId"] == "brave"
        assert e["op"] == "add"

    def test_position(self):
        e = compile_effect_clause("position tavern 3")
        assert e["mapId"] == "tavern"
        assert e["cellId"] == 3

    def test_world_var(self):
        e = compile_effect_clause("worldVar reputation add 10")
        assert e["key"] == "reputation"
        assert "target" not in e  # worldVar has no target

    def test_target_prefix(self):
        e = compile_effect_clause("@target: resource hp add -100")
        assert e["target"] == "{{targetId}}"

    def test_invalid_type(self):
        with pytest.raises(ClauseError):
            compile_effect_clause("invalidType foo add 5")

    def test_bad_item_op(self):
        with pytest.raises(ClauseError):
            compile_effect_clause("item destroy gold")


class TestActionIR:
    """Test full action IR compilation."""

    def test_basic_ir(self):
        ir = {
            "id": "rest",
            "name": "Rest",
            "time": 30,
            "outcomes": [
                {
                    "label": "success",
                    "effects": ["resource stamina add 200"],
                    "text": "You rest.",
                }
            ],
        }
        action, warns = compile_action_ir(ir)
        assert action["id"] == "rest"
        assert action["timeCost"] == 30
        assert action["targetType"] == "none"
        assert action["triggerLLM"] is False
        assert len(action["outcomes"]) == 1
        assert action["outcomes"][0]["effects"][0]["key"] == "stamina"
        assert action["outcomes"][0]["outputTemplates"][0]["text"] == "You rest."

    def test_complex_ir(self):
        ir = {
            "id": "pickpocket",
            "name": "Pickpocket",
            "target": "npc",
            "time": 10,
            "require": [
                "ability stealth >= 500",
                {"not": "@target: trait mentalTrait has alert"},
            ],
            "outcomes": [
                {"label": "success", "weight": 40, "effects": ["item add stolen_goods 1"]},
                {"label": "fail", "weight": 60, "effects": ["favorability {{targetId}} -> {{player}} -20"]},
            ],
        }
        action, warns = compile_action_ir(ir)
        assert action["targetType"] == "npc"
        assert len(action["conditions"]) == 2
        assert action["conditions"][1]["not"]["condTarget"] == "target"
        assert action["outcomes"][0]["weight"] == 40

    def test_ir_clause_error_propagates(self):
        ir = {
            "id": "bad",
            "name": "Bad",
            "require": ["invalidType foo >= 5"],
            "outcomes": [],
        }
        with pytest.raises(ClauseError):
            compile_action_ir(ir)


class TestEventIR:
    """Test event IR compilation."""

    def test_basic_event_ir(self):
        ir = {
            "id": "rain",
            "name": "Rain",
            "triggerMode": "while",
            "cooldown": 60,
            "require": ["time 20-6"],
            "effects": ["worldVar rain set 1"],
            "text": "It starts raining.",
        }
        event, warns = compile_event_ir(ir)
        assert event["triggerMode"] == "while"
        assert event["cooldown"] == 60
        assert len(event["conditions"]) == 1
        assert event["conditions"][0]["hourMin"] == 20
        assert event["effects"][0]["key"] == "rain"
        assert event["outputTemplates"][0]["text"] == "It starts raining."


# ===========================================================================
# Step 2a: Templates
# ===========================================================================


class TestTemplates:
    """Test AI action templates."""

    def test_trade(self):
        action, warns = expand_template("trade", {
            "id": "buy_ale",
            "name": "Buy Ale",
            "item": "ale",
            "price": 5,
            "seller": "bartender",
        })
        assert action["targetType"] == "npc"
        assert action["costs"] == []
        # Guard condition: basicInfo money >= price
        bi_conds = [c for c in action["conditions"] if c.get("type") == "basicInfo"]
        assert len(bi_conds) == 1
        assert bi_conds[0]["key"] == "money"
        assert bi_conds[0]["value"] == 5
        # Price deduction effect (basicInfo, not resource)
        effects = action["outcomes"][0]["effects"]
        bi_effs = [e for e in effects if e.get("type") == "basicInfo"]
        assert len(bi_effs) == 1
        assert bi_effs[0]["key"] == "money"
        assert bi_effs[0]["value"] == -5
        # NPC condition
        npc_conds = [c for c in action["conditions"] if c.get("type") == "npcPresent"]
        assert len(npc_conds) == 1

    def test_trade_no_seller(self):
        action, warns = expand_template("trade", {
            "id": "buy_item",
            "name": "Buy Item",
            "item": "ale",
            "price": 10,
        })
        assert action["targetType"] == "none"

    def test_conversation(self):
        action, warns = expand_template("conversation", {
            "id": "chat",
            "name": "Chat",
            "npc": "bartender",
        })
        assert action["targetType"] == "npc"
        assert action["triggerLLM"] is True
        fav_effects = [e for e in action["outcomes"][0]["effects"] if e.get("type") == "favorability"]
        assert len(fav_effects) == 1
        assert fav_effects[0]["value"] == 5  # default favChange

    def test_skill_check_shorthand(self):
        action, warns = expand_template("skill_check", {
            "id": "lockpick",
            "name": "Pick Lock",
            "ability": "stealth",
            "threshold": 200,
            "successEffects": ["item add lockpick_reward 1"],
            "failEffects": ["resource stamina add -100"],
        })
        assert len(action["outcomes"]) == 2
        assert action["outcomes"][0]["weightModifiers"][0]["type"] == "ability"
        assert action["conditions"][-1]["type"] == "ability"
        assert action["conditions"][-1]["value"] == 200

    def test_skill_check_full_outcomes(self):
        action, warns = expand_template("skill_check", {
            "id": "test",
            "name": "Test",
            "ability": "combat",
            "outcomes": [
                {"label": "crit", "grade": "critical", "weight": 20, "effects": ["resource hp add 500"]},
                {"label": "ok", "grade": "success", "weight": 50, "effects": ["resource hp add 200"]},
                {"label": "fail", "grade": "failure", "weight": 30, "effects": []},
            ],
        })
        assert len(action["outcomes"]) == 3
        # Critical and success outcomes get ability modifier
        assert "weightModifiers" in action["outcomes"][0]
        assert "weightModifiers" in action["outcomes"][1]

    def test_unknown_template(self):
        with pytest.raises(KeyError):
            expand_template("nonexistent_template", {"id": "x", "name": "x"})


# ===========================================================================
# Step 2c: Compile integration
# ===========================================================================


class TestCompileActionPayload:
    """Test _compile_action_payload dispatch."""

    def test_template_mode(self):
        payload, warns = _compile_action_payload("action", "template", {
            "template": "trade",
            "id": "buy",
            "name": "Buy",
            "item": "sword",
            "price": 100,
        })
        assert payload.get("id") == "buy"
        assert not payload.get("_compile_error")

    def test_ir_mode(self):
        payload, warns = _compile_action_payload("action", "ir", {
            "id": "rest",
            "name": "Rest",
            "outcomes": [{"effects": ["resource stamina add 100"], "text": "Rested."}],
        })
        assert payload["outcomes"][0]["effects"][0]["type"] == "resource"

    def test_ir_event(self):
        payload, warns = _compile_action_payload("event", "ir", {
            "id": "ev",
            "name": "Event",
            "effects": ["worldVar x set 1"],
        })
        assert payload["effects"][0]["type"] == "worldVar"

    def test_ir_clause_error(self):
        payload, warns = _compile_action_payload("action", "ir", {
            "id": "bad",
            "name": "Bad",
            "require": ["badtype foo >= 1"],
            "outcomes": [],
        })
        assert payload.get("_compile_error")
        assert payload["error"] == "CLAUSE_PARSE_FAILED"

    def test_unknown_template_error(self):
        payload, warns = _compile_action_payload("action", "template", {
            "template": "nonexistent",
            "id": "x",
            "name": "x",
        })
        assert payload.get("_compile_error")
        assert payload["error"] == "TEMPLATE_NOT_FOUND"

    def test_simple_passthrough(self):
        original = {"id": "test", "name": "Test", "outcomes": []}
        payload, warns = _compile_action_payload("action", "simple", original)
        assert payload is original


# ===========================================================================
# Step 3: Clone + Modify
# ===========================================================================


class TestApplyPatch:
    """Test _apply_patch path resolution."""

    def test_simple_field(self):
        obj = {"name": "old"}
        diffs = _apply_patch(obj, {"name": "new"})
        assert obj["name"] == "new"
        assert len(diffs) == 1
        assert diffs[0] == {"path": "name", "old": "old", "new": "new"}

    def test_nested_dot_path(self):
        obj = {"a": {"b": {"c": 1}}}
        diffs = _apply_patch(obj, {"a.b.c": 2})
        assert obj["a"]["b"]["c"] == 2

    def test_array_index(self):
        obj = {"items": [{"id": "a"}, {"id": "b"}]}
        diffs = _apply_patch(obj, {"items[1].id": "c"})
        assert obj["items"][1]["id"] == "c"

    def test_complex_path(self):
        obj = {
            "outcomes": [
                {"effects": [{"type": "item", "itemId": "ale"}]},
            ]
        }
        diffs = _apply_patch(obj, {"outcomes[0].effects[0].itemId": "wine"})
        assert obj["outcomes"][0]["effects"][0]["itemId"] == "wine"
        assert diffs[0]["old"] == "ale"

    def test_no_change(self):
        obj = {"name": "same"}
        diffs = _apply_patch(obj, {"name": "same"})
        assert len(diffs) == 0


class TestCompileClone:
    """Test _compile_clone."""

    def test_basic_clone(self, gs):
        cloned, warns, diffs = _compile_clone(gs, "action", {
            "sourceId": "Test.buy_ale",
            "id": "buy_wine",
            "name": "Buy Wine",
            "patch": {
                "costs[0].amount": 20,
                "outcomes[0].effects[0].itemId": "wine",
            },
        })
        assert not cloned.get("_compile_error")
        assert cloned["id"] == "buy_wine"
        assert cloned["name"] == "Buy Wine"
        assert cloned["costs"][0]["amount"] == 20
        assert cloned["outcomes"][0]["effects"][0]["itemId"] == "wine"
        # Internal keys stripped
        assert "_local_id" not in cloned
        assert "source" not in cloned
        # Diffs: id, name, costs[0].amount, outcomes[0].effects[0].itemId
        assert len(diffs) == 4

    def test_clone_missing_source(self, gs):
        cloned, warns, diffs = _compile_clone(gs, "action", {
            "sourceId": "nonexistent",
            "id": "x",
            "name": "x",
        })
        assert cloned.get("_compile_error")
        assert cloned["error"] == "SOURCE_NOT_FOUND"

    def test_clone_no_source_id(self, gs):
        cloned, warns, diffs = _compile_clone(gs, "action", {
            "id": "x",
            "name": "x",
        })
        assert cloned.get("_compile_error")
        assert cloned["error"] == "MISSING_SOURCE"

    def test_clone_no_patch(self, gs):
        cloned, warns, diffs = _compile_clone(gs, "action", {
            "sourceId": "Test.buy_ale",
            "id": "buy_ale_2",
            "name": "Buy Ale 2",
        })
        assert cloned["id"] == "buy_ale_2"
        # Diffs: only id and name
        assert len(diffs) == 2

    def test_clone_preserves_deep_structure(self, gs):
        cloned, warns, diffs = _compile_clone(gs, "action", {
            "sourceId": "Test.buy_ale",
            "id": "copy",
            "name": "Copy",
        })
        # Verify deep copy — modifying clone doesn't affect source
        cloned["conditions"].append({"type": "time"})
        assert len(gs.action_defs["Test.buy_ale"]["conditions"]) == 1
