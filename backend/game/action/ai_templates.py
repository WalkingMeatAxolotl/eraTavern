"""AI action templates — expand high-level parameters into full action JSON.

Three templates cover ~50-60% of common action patterns:
  - trade:        buy/sell items from NPCs
  - conversation: talk to NPCs for favorability
  - skill_check:  ability-gated actions with success/failure outcomes
"""

from __future__ import annotations

from typing import Any

from .ir_compiler import compile_effects


def expand_trade(params: dict) -> tuple[dict[str, Any], list[str]]:
    """Expand a trade template into a full action JSON.

    Params:
        id, name:       required
        item:           item ID to buy/sell
        price:          cost amount (basicInfo key, default: money)
        priceKey:       basicInfo key for cost (default: money)
        amount:         item quantity (default: 1)
        location:       mapId for location condition (optional)
        seller:         NPC ID for npcPresent condition (optional)
        favChange:      favorability change on purchase (optional)
        category:       action category (optional)
        timeCost:       time in minutes (default: 5)
        text:           output template text (optional)
    """
    warnings: list[str] = []
    action_id = params.get("id", "")
    name = params.get("name", "")
    item_id = params.get("item", "")
    price = params.get("price", 0)
    price_key = params.get("priceKey", "money")
    amount = params.get("amount", 1)

    if not item_id:
        warnings.append("trade template: missing 'item' parameter")

    conditions: list[dict[str, Any]] = []
    if params.get("location"):
        conditions.append({"type": "location", "mapId": params["location"]})
    if params.get("seller"):
        conditions.append({"type": "npcPresent", "npcId": params["seller"]})

    if price > 0:
        # Guard condition — money is a basicInfo field
        conditions.append(
            {
                "type": "basicInfo",
                "key": price_key,
                "op": ">=",
                "value": price,
            }
        )

    effects: list[dict[str, Any]] = []
    # Deduct price as a basicInfo effect (money is in basicInfo, not resource)
    if price > 0:
        effects.append(
            {"type": "basicInfo", "key": price_key, "op": "add", "target": "self", "value": -price}
        )
    effects.append(
        {"type": "item", "itemId": item_id, "op": "add", "target": "self", "amount": amount},
    )
    if params.get("favChange") and params.get("seller"):
        effects.append(
            {
                "type": "favorability",
                "favFrom": "{{targetId}}",
                "favTo": "self",
                "op": "add",
                "target": "self",
                "value": params["favChange"],
            }
        )

    outcome: dict[str, Any] = {
        "label": "success",
        "grade": "success",
        "weight": 100,
        "effects": effects,
    }
    text = params.get("text")
    if text:
        outcome["outputTemplates"] = [{"text": text}]

    action: dict[str, Any] = {
        "id": action_id,
        "name": name,
        "targetType": "npc" if params.get("seller") else "none",
        "triggerLLM": False,
        "timeCost": params.get("timeCost", 5),
        "npcWeight": 0,
        "conditions": conditions,
        "costs": [],
        "outcomes": [outcome],
    }
    if params.get("category"):
        action["category"] = params["category"]

    return action, warnings


def expand_conversation(params: dict) -> tuple[dict[str, Any], list[str]]:
    """Expand a conversation template into a full action JSON.

    Params:
        id, name:       required
        npc:            NPC ID (required)
        location:       mapId for location condition (optional)
        favChange:      favorability change per conversation (default: 5)
        timeCost:       time in minutes (default: 15)
        triggerLLM:     whether to trigger LLM narration (default: true)
        llmPreset:      LLM preset name (optional)
        category:       action category (optional)
        text:           output template text (optional, used when triggerLLM=false)
        effects:        additional effect clauses (optional)
    """
    warnings: list[str] = []
    npc_id = params.get("npc", "")
    if not npc_id:
        warnings.append("conversation template: missing 'npc' parameter")

    fav_change = params.get("favChange", 5)

    conditions: list[dict[str, Any]] = []
    if params.get("location"):
        conditions.append({"type": "location", "mapId": params["location"]})
    if npc_id:
        conditions.append({"type": "npcPresent", "npcId": npc_id})

    effects: list[dict[str, Any]] = [
        {
            "type": "favorability",
            "favFrom": "{{targetId}}",
            "favTo": "self",
            "op": "add",
            "target": "self",
            "value": fav_change,
        }
    ]
    # Additional effects from IR clauses
    extra = params.get("effects", [])
    if extra:
        effects.extend(compile_effects(extra))

    outcome: dict[str, Any] = {
        "label": "success",
        "grade": "normal",
        "weight": 100,
        "effects": effects,
    }
    text = params.get("text")
    if text:
        outcome["outputTemplates"] = [{"text": text}]

    action: dict[str, Any] = {
        "id": params.get("id", ""),
        "name": params.get("name", ""),
        "targetType": "npc",
        "triggerLLM": params.get("triggerLLM", True),
        "timeCost": params.get("timeCost", 15),
        "npcWeight": 0,
        "conditions": conditions,
        "costs": [],
        "outcomes": [outcome],
    }
    if params.get("llmPreset"):
        action["llmPreset"] = params["llmPreset"]
    if params.get("category"):
        action["category"] = params["category"]

    return action, warnings


def expand_skill_check(params: dict) -> tuple[dict[str, Any], list[str]]:
    """Expand a skill_check template into a full action JSON.

    Params:
        id, name:           required
        ability:            ability key for the check (required)
        threshold:          minimum ability value to attempt (default: 0)
        timeCost:           time in minutes (default: 10)
        category:           action category (optional)
        target:             "none" or "npc" (default: "none")
        location:           mapId for location condition (optional)
        npc:                NPC ID for npcPresent condition (optional)
        outcomes:           list of outcome dicts with:
            label, grade, weight,
            effects (IR clause strings or dicts),
            text (output template string)
        successEffects:     shorthand — effects for success outcome (IR clauses)
        failEffects:        shorthand — effects for fail outcome (IR clauses)
        successText:        shorthand — text for success outcome
        failText:           shorthand — text for fail outcome
        modifierPer:        ability exp divisor for weight modifier (default: 100)
        modifierBonus:      bonus per unit for weight modifier (default: 10)
    """
    warnings: list[str] = []
    ability = params.get("ability", "")
    if not ability:
        warnings.append("skill_check template: missing 'ability' parameter")

    threshold = params.get("threshold", 0)

    conditions: list[dict[str, Any]] = []
    if params.get("location"):
        conditions.append({"type": "location", "mapId": params["location"]})
    if params.get("npc"):
        conditions.append({"type": "npcPresent", "npcId": params["npc"]})
    if threshold > 0:
        conditions.append(
            {
                "type": "ability",
                "key": ability,
                "op": ">=",
                "value": threshold,
            }
        )

    # Weight modifier: higher ability → better outcomes
    modifier_per = params.get("modifierPer", 100)
    modifier_bonus = params.get("modifierBonus", 10)
    ability_modifier = {
        "type": "ability",
        "key": ability,
        "per": modifier_per,
        "bonus": modifier_bonus,
        "bonusMode": "add",
    }

    # Build outcomes
    ir_outcomes = params.get("outcomes")
    if ir_outcomes:
        # Full outcomes list from params
        action_outcomes = []
        for i, o in enumerate(ir_outcomes):
            raw_effects = o.get("effects", [])
            outcome: dict[str, Any] = {
                "label": o.get("label", f"Outcome {i + 1}"),
                "grade": o.get("grade", "normal"),
                "weight": o.get("weight", 100),
                "effects": compile_effects(raw_effects),
            }
            if o.get("text"):
                outcome["outputTemplates"] = [{"text": o["text"]}]
            # Add ability modifier to success outcomes
            if o.get("grade") in ("success", "critical"):
                outcome["weightModifiers"] = [ability_modifier]
            action_outcomes.append(outcome)
    else:
        # Shorthand: successEffects / failEffects
        success_effects = params.get("successEffects", [])
        fail_effects = params.get("failEffects", [])

        success_outcome: dict[str, Any] = {
            "label": "success",
            "grade": "success",
            "weight": 50,
            "effects": compile_effects(success_effects) if success_effects else [],
            "weightModifiers": [ability_modifier],
        }
        if params.get("successText"):
            success_outcome["outputTemplates"] = [{"text": params["successText"]}]

        fail_outcome: dict[str, Any] = {
            "label": "failure",
            "grade": "failure",
            "weight": 50,
            "effects": compile_effects(fail_effects) if fail_effects else [],
        }
        if params.get("failText"):
            fail_outcome["outputTemplates"] = [{"text": params["failText"]}]

        action_outcomes = [success_outcome, fail_outcome]

        if not success_effects:
            warnings.append("skill_check: no successEffects defined")

    action: dict[str, Any] = {
        "id": params.get("id", ""),
        "name": params.get("name", ""),
        "targetType": params.get("target", "none"),
        "triggerLLM": params.get("triggerLLM", False),
        "timeCost": params.get("timeCost", 10),
        "npcWeight": 0,
        "conditions": conditions,
        "costs": params.get("costs", []),
        "outcomes": action_outcomes,
    }
    if params.get("category"):
        action["category"] = params["category"]

    return action, warnings


# ---------------------------------------------------------------------------
# Template registry
# ---------------------------------------------------------------------------

TEMPLATES: dict[str, Any] = {
    "trade": expand_trade,
    "conversation": expand_conversation,
    "skill_check": expand_skill_check,
}


def expand_template(template_name: str, params: dict) -> tuple[dict[str, Any], list[str]]:
    """Expand a named template. Raises KeyError if template not found."""
    fn = TEMPLATES.get(template_name)
    if not fn:
        raise KeyError(f"Unknown template: {template_name}. Available: {', '.join(sorted(TEMPLATES))}")
    return fn(params)
