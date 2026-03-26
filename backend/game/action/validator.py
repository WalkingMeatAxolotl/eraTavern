"""Action/Event definition validator — structural and semantic checks.

Three severity levels:
  - error:   blocks creation (invalid types, missing fields, broken refs)
  - warning: allows creation but flags risk (missing guard conditions, etc.)
  - info:    suggestions for improvement (no output template, single outcome, etc.)
"""

from __future__ import annotations

from dataclasses import dataclass

from game.constants import (
    BonusMode,
    CompareOp,
    ConditionType,
    CondTarget,
    CostType,
    EffectOp,
    EffectType,
    EventScope,
    ModifierType,
    TargetType,
    TriggerMode,
)
from game.state import GameState

# ---------------------------------------------------------------------------
# Valid value sets (derived from constants.py)
# ---------------------------------------------------------------------------

_CONDITION_TYPES = {
    ConditionType.RESOURCE,
    ConditionType.ABILITY,
    ConditionType.BASIC_INFO,
    ConditionType.EXPERIENCE,
    ConditionType.FAVORABILITY,
    ConditionType.TRAIT,
    ConditionType.NO_TRAIT,
    ConditionType.CLOTHING,
    ConditionType.OUTFIT,
    ConditionType.VARIABLE,
    ConditionType.WORLD_VAR,
    ConditionType.HAS_ITEM,
    ConditionType.LOCATION,
    ConditionType.NPC_PRESENT,
    ConditionType.NPC_ABSENT,
    ConditionType.TIME,
}

_EFFECT_TYPES = {
    EffectType.RESOURCE,
    EffectType.ABILITY,
    EffectType.BASIC_INFO,
    EffectType.EXPERIENCE,
    EffectType.FAVORABILITY,
    EffectType.ITEM,
    EffectType.TRAIT,
    EffectType.CLOTHING,
    EffectType.OUTFIT,
    EffectType.POSITION,
    EffectType.WORLD_VAR,
}

_MODIFIER_TYPES = {
    ModifierType.RESOURCE,
    ModifierType.BASIC_INFO,
    ModifierType.ABILITY,
    ModifierType.EXPERIENCE,
    ModifierType.TRAIT,
    ModifierType.HAS_ITEM,
    ModifierType.OUTFIT,
    ModifierType.CLOTHING,
    ModifierType.FAVORABILITY,
    ModifierType.VARIABLE,
    ModifierType.WORLD_VAR,
}

_COMPARE_OPS = {CompareOp.GTE, CompareOp.LTE, CompareOp.GT, CompareOp.LT, CompareOp.EQ, CompareOp.NE}
_EFFECT_OPS = {EffectOp.ADD, EffectOp.SET, EffectOp.REMOVE, EffectOp.SWITCH}
_COST_TYPES = {CostType.RESOURCE, CostType.BASIC_INFO, CostType.ITEM}
_BONUS_MODES = {BonusMode.ADD, BonusMode.MULTIPLY}
_COND_TARGETS = {CondTarget.SELF, CondTarget.TARGET}
_TARGET_TYPES = {TargetType.NONE, TargetType.NPC}
_TRIGGER_MODES = {TriggerMode.ONCE, TriggerMode.ON_CHANGE, TriggerMode.WHILE}
_EVENT_SCOPES = {EventScope.EACH_CHARACTER, EventScope.NONE}

# Condition types that use comparison operators
_NUMERIC_COND_TYPES = {
    ConditionType.RESOURCE,
    ConditionType.ABILITY,
    ConditionType.BASIC_INFO,
    ConditionType.EXPERIENCE,
    ConditionType.FAVORABILITY,
    ConditionType.VARIABLE,
    ConditionType.WORLD_VAR,
}

MAX_CONDITION_DEPTH = 8


def _invalid_msg(field: str, label: str, value: str, valid: set[str]) -> ValidationMessage:
    """Build an error message for an invalid enum value."""
    hint = f"Valid: {', '.join(sorted(valid))}"
    return ValidationMessage("error", field, f"Invalid {label}: {value}", hint)


# ---------------------------------------------------------------------------
# Public data class
# ---------------------------------------------------------------------------


@dataclass
class ValidationMessage:
    level: str  # "error" | "warning" | "info"
    field: str  # field path (e.g. "outcomes[0].effects[1].target")
    message: str  # human-readable description
    hint: str = ""  # optional fix suggestion


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_action(action: dict, gs: GameState) -> list[ValidationMessage]:
    """Validate an action definition. Returns list of messages (may be empty)."""
    msgs: list[ValidationMessage] = []

    # Required fields
    if not action.get("id"):
        msgs.append(ValidationMessage("error", "id", "Missing required field: id"))
    if not action.get("name"):
        msgs.append(ValidationMessage("error", "name", "Missing required field: name"))

    # targetType
    target_type = action.get("targetType", TargetType.NONE)
    if target_type not in _TARGET_TYPES:
        msgs.append(_invalid_msg("targetType", "targetType", target_type, _TARGET_TYPES))

    # conditions
    conditions = action.get("conditions", [])
    _validate_conditions(conditions, "conditions", gs, msgs, depth=0)

    # costs
    for i, cost in enumerate(action.get("costs", [])):
        _validate_cost(cost, f"costs[{i}]", msgs)

    # outcomes
    outcomes = action.get("outcomes", [])
    if not outcomes:
        msgs.append(ValidationMessage("error", "outcomes", "Action must have at least one outcome"))

    has_effects = False
    for i, outcome in enumerate(outcomes):
        prefix = f"outcomes[{i}]"
        effects = outcome.get("effects", [])
        if not effects:
            msgs.append(ValidationMessage("error", f"{prefix}.effects", "Outcome has no effects"))
        else:
            has_effects = True
        for j, eff in enumerate(effects):
            _validate_effect(eff, f"{prefix}.effects[{j}]", gs, msgs)
        for j, mod in enumerate(outcome.get("weightModifiers", [])):
            _validate_modifier(mod, f"{prefix}.weightModifiers[{j}]", msgs)

    # npcWeightModifiers
    for i, mod in enumerate(action.get("npcWeightModifiers", [])):
        _validate_modifier(mod, f"npcWeightModifiers[{i}]", msgs)

    # --- Warnings ---
    _warn_cost_without_guard(action, conditions, msgs)
    _warn_target_issues(action, target_type, conditions, msgs)

    if action.get("npcWeight", 0) > 0 and not _has_condition_type(conditions, ConditionType.LOCATION):
        msgs.append(
            ValidationMessage(
                "warning",
                "npcWeight",
                "npcWeight > 0 but no location condition",
            )
        )

    _warn_duplicate_effects(outcomes, msgs)

    # --- Info ---
    if not action.get("outputTemplates") and has_effects:
        has_outcome_templates = any(o.get("outputTemplates") for o in outcomes)
        if not has_outcome_templates:
            msgs.append(
                ValidationMessage(
                    "info",
                    "outputTemplates",
                    "No outputTemplates",
                )
            )

    if action.get("triggerLLM") is False and not action.get("outputTemplates"):
        has_outcome_templates = any(o.get("outputTemplates") for o in outcomes)
        if not has_outcome_templates:
            msgs.append(
                ValidationMessage(
                    "info",
                    "triggerLLM",
                    "triggerLLM=false and no outputTemplates — no text feedback",
                )
            )

    if len(outcomes) == 1:
        msgs.append(
            ValidationMessage(
                "info",
                "outcomes",
                "Only one outcome",
            )
        )

    if action.get("npcWeight", 0) == 0 and not action.get("costs"):
        msgs.append(
            ValidationMessage(
                "info",
                "npcWeight",
                "npcWeight=0 and no costs — NPC never chooses, player has no cost",
            )
        )

    return msgs


def validate_event(event: dict, gs: GameState) -> list[ValidationMessage]:
    """Validate an event definition. Returns list of messages (may be empty)."""
    msgs: list[ValidationMessage] = []

    if not event.get("id"):
        msgs.append(ValidationMessage("error", "id", "Missing required field: id"))
    if not event.get("name"):
        msgs.append(ValidationMessage("error", "name", "Missing required field: name"))

    trigger_mode = event.get("triggerMode", "")
    if trigger_mode and trigger_mode not in _TRIGGER_MODES:
        msgs.append(_invalid_msg("triggerMode", "triggerMode", trigger_mode, _TRIGGER_MODES))

    target_scope = event.get("targetScope", "")
    if target_scope and target_scope not in _EVENT_SCOPES:
        msgs.append(_invalid_msg("targetScope", "targetScope", target_scope, _EVENT_SCOPES))

    conditions = event.get("conditions", [])
    _validate_conditions(conditions, "conditions", gs, msgs, depth=0)

    effects = event.get("effects", [])
    if not effects:
        msgs.append(ValidationMessage("error", "effects", "Event must have at least one effect"))
    for i, eff in enumerate(effects):
        _validate_effect(eff, f"effects[{i}]", gs, msgs)

    # Info
    if not event.get("outputTemplates"):
        msgs.append(ValidationMessage("info", "outputTemplates", "No outputTemplates"))

    return msgs


# ---------------------------------------------------------------------------
# Internal validators
# ---------------------------------------------------------------------------


def _validate_conditions(
    conditions: list, prefix: str, gs: GameState, msgs: list[ValidationMessage], depth: int
) -> None:
    if depth > MAX_CONDITION_DEPTH:
        msgs.append(ValidationMessage("error", prefix, f"Condition tree depth exceeds {MAX_CONDITION_DEPTH}"))
        return

    for i, cond in enumerate(conditions):
        if not isinstance(cond, dict):
            msgs.append(ValidationMessage("error", f"{prefix}[{i}]", "Condition must be an object"))
            continue
        path = f"{prefix}[{i}]"

        # Composite conditions
        for logic_key in ("and", "or"):
            if logic_key in cond:
                children = cond[logic_key]
                if not isinstance(children, list):
                    msgs.append(ValidationMessage("error", f"{path}.{logic_key}", f"{logic_key} must be an array"))
                else:
                    _validate_conditions(children, f"{path}.{logic_key}", gs, msgs, depth + 1)
                break
        else:
            if "not" in cond:
                child = cond["not"]
                if isinstance(child, dict):
                    _validate_conditions([child], f"{path}.not", gs, msgs, depth + 1)
                else:
                    msgs.append(ValidationMessage("error", f"{path}.not", "not must be a condition object"))
            elif "type" in cond:
                _validate_single_condition(cond, path, gs, msgs)
            else:
                msgs.append(ValidationMessage("error", path, "Condition missing 'type' field"))


def _validate_single_condition(cond: dict, path: str, gs: GameState, msgs: list[ValidationMessage]) -> None:
    ctype = cond.get("type", "")
    if ctype not in _CONDITION_TYPES:
        msgs.append(_invalid_msg(f"{path}.type", "condition type", ctype, _CONDITION_TYPES))
        return

    # Numeric types require op
    if ctype in _NUMERIC_COND_TYPES:
        op = cond.get("op", "")
        if op and op not in _COMPARE_OPS:
            msgs.append(_invalid_msg(f"{path}.op", "comparison op", op, _COMPARE_OPS))

    # condTarget
    ct = cond.get("condTarget")
    if ct and ct not in _COND_TARGETS:
        msgs.append(_invalid_msg(f"{path}.condTarget", "condTarget", ct, _COND_TARGETS))

    # Reference checks
    _check_refs_in_condition(cond, ctype, path, gs, msgs)


def _validate_effect(eff: dict, path: str, gs: GameState, msgs: list[ValidationMessage]) -> None:
    if not isinstance(eff, dict):
        msgs.append(ValidationMessage("error", path, "Effect must be an object"))
        return

    etype = eff.get("type", "")
    if etype not in _EFFECT_TYPES:
        msgs.append(_invalid_msg(f"{path}.type", "effect type", etype, _EFFECT_TYPES))
        return

    op = eff.get("op", "")
    if op and op not in _EFFECT_OPS:
        msgs.append(_invalid_msg(f"{path}.op", "effect op", op, _EFFECT_OPS))

    # Reference checks
    _check_refs_in_effect(eff, etype, path, gs, msgs)


def _validate_modifier(mod: dict, path: str, msgs: list[ValidationMessage]) -> None:
    if not isinstance(mod, dict):
        msgs.append(ValidationMessage("error", path, "Modifier must be an object"))
        return

    mtype = mod.get("type", "")
    if mtype not in _MODIFIER_TYPES:
        msgs.append(_invalid_msg(f"{path}.type", "modifier type", mtype, _MODIFIER_TYPES))

    bmode = mod.get("bonusMode", "")
    if bmode and bmode not in _BONUS_MODES:
        msgs.append(_invalid_msg(f"{path}.bonusMode", "bonusMode", bmode, _BONUS_MODES))


def _validate_cost(cost: dict, path: str, msgs: list[ValidationMessage]) -> None:
    if not isinstance(cost, dict):
        msgs.append(ValidationMessage("error", path, "Cost must be an object"))
        return

    ctype = cost.get("type", "")
    if ctype not in _COST_TYPES:
        msgs.append(_invalid_msg(f"{path}.type", "cost type", ctype, _COST_TYPES))


# ---------------------------------------------------------------------------
# Reference checks
# ---------------------------------------------------------------------------


def _check_refs_in_condition(cond: dict, ctype: str, path: str, gs: GameState, msgs: list[ValidationMessage]) -> None:
    """Check that referenced entity IDs exist in game state."""
    if ctype in (ConditionType.TRAIT, ConditionType.NO_TRAIT):
        tid = cond.get("traitId", "")
        if tid and gs.trait_defs and tid not in gs.trait_defs:
            msgs.append(ValidationMessage("error", f"{path}.traitId", f"Trait '{tid}' not found"))

    elif ctype == ConditionType.HAS_ITEM:
        iid = cond.get("itemId", "")
        if iid and gs.item_defs and iid not in gs.item_defs:
            msgs.append(ValidationMessage("error", f"{path}.itemId", f"Item '{iid}' not found"))

    elif ctype == ConditionType.LOCATION:
        mid = cond.get("mapId", "")
        if mid and gs.maps and mid not in gs.maps:
            msgs.append(ValidationMessage("error", f"{path}.mapId", f"Map '{mid}' not found"))

    elif ctype in (ConditionType.NPC_PRESENT, ConditionType.NPC_ABSENT):
        nid = cond.get("npcId", "")
        if nid and gs.char_defs and nid not in gs.char_defs:
            msgs.append(ValidationMessage("error", f"{path}.npcId", f"Character '{nid}' not found"))

    elif ctype == ConditionType.VARIABLE:
        vid = cond.get("varId", "")
        if vid and gs.variable_defs and vid not in gs.variable_defs:
            msgs.append(ValidationMessage("error", f"{path}.varId", f"Variable '{vid}' not found"))

    elif ctype == ConditionType.WORLD_VAR:
        wkey = cond.get("key", "")
        if wkey and gs.variable_defs and wkey not in gs.variable_defs:
            msgs.append(ValidationMessage("error", f"{path}.key", f"World variable '{wkey}' not found"))


def _check_refs_in_effect(eff: dict, etype: str, path: str, gs: GameState, msgs: list[ValidationMessage]) -> None:
    """Check that referenced entity IDs exist in game state."""
    if etype == EffectType.ITEM:
        iid = eff.get("itemId", "")
        if iid and gs.item_defs and iid not in gs.item_defs:
            msgs.append(ValidationMessage("error", f"{path}.itemId", f"Item '{iid}' not found"))

    elif etype == EffectType.TRAIT:
        tid = eff.get("traitId", "")
        if tid and gs.trait_defs and tid not in gs.trait_defs:
            msgs.append(ValidationMessage("error", f"{path}.traitId", f"Trait '{tid}' not found"))

    elif etype == EffectType.POSITION:
        mid = eff.get("mapId", "")
        if mid and gs.maps and mid not in gs.maps:
            msgs.append(ValidationMessage("error", f"{path}.mapId", f"Map '{mid}' not found"))

    elif etype == EffectType.WORLD_VAR:
        wkey = eff.get("key", "")
        if wkey and gs.variable_defs and wkey not in gs.variable_defs:
            msgs.append(ValidationMessage("error", f"{path}.key", f"World variable '{wkey}' not found"))


# ---------------------------------------------------------------------------
# Warning helpers
# ---------------------------------------------------------------------------


def _has_condition_type(conditions: list, target_type: str) -> bool:
    """Recursively check if any condition has the given type."""
    for cond in conditions:
        if not isinstance(cond, dict):
            continue
        if cond.get("type") == target_type:
            return True
        for key in ("and", "or"):
            if key in cond and isinstance(cond[key], list):
                if _has_condition_type(cond[key], target_type):
                    return True
        if "not" in cond and isinstance(cond["not"], dict):
            if _has_condition_type([cond["not"]], target_type):
                return True
    return False


def _warn_cost_without_guard(action: dict, conditions: list, msgs: list[ValidationMessage]) -> None:
    """Warn if costs deduct resources but conditions don't check balance."""
    for i, cost in enumerate(action.get("costs", [])):
        ctype = cost.get("type", "")
        key = cost.get("key", "")
        if ctype == CostType.RESOURCE and key:
            # Check if conditions guard this resource
            if not _conditions_guard_resource(conditions, key):
                msgs.append(
                    ValidationMessage(
                        "warning",
                        f"costs[{i}]",
                        f"Cost deducts resource '{key}' but no condition checks it",
                        f"Add a condition: resource {key} >= {cost.get('amount', 0)}",
                    )
                )
        elif ctype == CostType.ITEM:
            item_id = cost.get("itemId", "")
            if item_id and not _has_condition_type(conditions, ConditionType.HAS_ITEM):
                msgs.append(
                    ValidationMessage(
                        "warning",
                        f"costs[{i}]",
                        f"Cost consumes item '{item_id}' but no hasItem condition",
                        f"Add a condition: hasItem {item_id}",
                    )
                )


def _conditions_guard_resource(conditions: list, key: str) -> bool:
    """Check if conditions include a resource check for the given key."""
    for cond in conditions:
        if not isinstance(cond, dict):
            continue
        if cond.get("type") == ConditionType.RESOURCE and cond.get("key") == key:
            return True
        for logic_key in ("and", "or"):
            if logic_key in cond and isinstance(cond[logic_key], list):
                if _conditions_guard_resource(cond[logic_key], key):
                    return True
        if "not" in cond and isinstance(cond["not"], dict):
            if _conditions_guard_resource([cond["not"]], key):
                return True
    return False


def _warn_target_issues(action: dict, target_type: str, conditions: list, msgs: list[ValidationMessage]) -> None:
    """Warn about target-related issues."""
    if target_type == TargetType.NPC and not _has_condition_type(conditions, ConditionType.NPC_PRESENT):
        msgs.append(
            ValidationMessage(
                "warning",
                "targetType",
                "targetType=npc but no npcPresent condition — target may not be present",
            )
        )

    # Check effects that use favorability with targetType=none
    if target_type == TargetType.NONE:
        for i, outcome in enumerate(action.get("outcomes", [])):
            for j, eff in enumerate(outcome.get("effects", [])):
                if eff.get("type") == EffectType.FAVORABILITY:
                    target = eff.get("favFrom", "") or eff.get("favTo", "")
                    if "{{targetId}}" in str(target):
                        msgs.append(
                            ValidationMessage(
                                "warning",
                                f"outcomes[{i}].effects[{j}]",
                                "Favorability effect uses {{targetId}} but targetType=none",
                            )
                        )


def _warn_duplicate_effects(outcomes: list, msgs: list[ValidationMessage]) -> None:
    """Warn about duplicate effect type+key in the same outcome."""
    for i, outcome in enumerate(outcomes):
        seen: dict[str, int] = {}
        for j, eff in enumerate(outcome.get("effects", [])):
            etype = eff.get("type", "")
            key = eff.get("key", eff.get("itemId", eff.get("traitId", "")))
            sig = f"{etype}:{key}" if key else etype
            if sig in seen:
                msgs.append(
                    ValidationMessage(
                        "warning",
                        f"outcomes[{i}].effects[{j}]",
                        f"Duplicate effect {sig} in same outcome (first at effects[{seen[sig]}])",
                        "Check if this is intentional",
                    )
                )
            else:
                seen[sig] = j
