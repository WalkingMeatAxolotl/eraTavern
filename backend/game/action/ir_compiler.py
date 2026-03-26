"""IR compiler — compiles shorthand clause strings into full action/event JSON.

Condition clause: "resource stamina >= 100" → {"type":"resource","key":"stamina","op":">=","value":100}
Effect clause:    "item add gold 50"        → {"type":"item","itemId":"gold","op":"add","amount":50}
Action IR:        {id, name, require, outcomes, ...} → full action JSON
"""

from __future__ import annotations

from typing import Any

from game.constants import (
    ConditionType,
    EffectType,
)

# ---------------------------------------------------------------------------
# Condition / Effect type sets for dispatch
# ---------------------------------------------------------------------------

# Numeric comparison conditions: "<type> <key> <op> <value>"
_NUMERIC_COND = {
    ConditionType.RESOURCE,
    ConditionType.ABILITY,
    ConditionType.BASIC_INFO,
    ConditionType.EXPERIENCE,
    ConditionType.VARIABLE,
    ConditionType.WORLD_VAR,
}

# Numeric effects: "<type> <key> <op> <value>[%]"
_NUMERIC_EFFECT = {
    EffectType.RESOURCE,
    EffectType.ABILITY,
    EffectType.BASIC_INFO,
    EffectType.EXPERIENCE,
}

_VALID_COMPARE_OPS = {">=", "<=", ">", "<", "==", "!="}
_VALID_EFFECT_OPS = {"add", "set", "remove", "switch"}


# ---------------------------------------------------------------------------
# Error helper
# ---------------------------------------------------------------------------


class ClauseError(Exception):
    """Raised when a clause string cannot be parsed."""

    def __init__(self, clause: str, message: str, position: int = -1):
        self.clause = clause
        self.message = message
        self.position = position
        super().__init__(message)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "error": "CLAUSE_PARSE_FAILED",
            "clause": self.clause,
            "message": self.message,
        }
        if self.position >= 0:
            d["position"] = self.position
        return d


# ---------------------------------------------------------------------------
# Condition clause compiler
# ---------------------------------------------------------------------------


def compile_condition_clause(clause: str) -> dict[str, Any]:
    """Compile a single condition clause string into a condition dict.

    Supports @target: prefix for condTarget="target".
    """
    clause = clause.strip()
    if not clause:
        raise ClauseError(clause, "Empty condition clause")

    cond_target = "self"
    if clause.startswith("@target:"):
        cond_target = "target"
        clause = clause[len("@target:") :].strip()

    tokens = clause.split()
    if not tokens:
        raise ClauseError(clause, "Empty condition clause after prefix")

    ctype = tokens[0]
    result: dict[str, Any] = {"type": ctype}

    if ctype in _NUMERIC_COND:
        # "<type> <key> <op> <value>"
        if len(tokens) < 4:
            raise ClauseError(
                clause,
                f"Expected: {ctype} <key> <op> <value>",
                len(tokens),
            )
        result["key"] = tokens[1]
        op = tokens[2]
        if op not in _VALID_COMPARE_OPS:
            raise ClauseError(clause, f"Invalid op: {op}", 2)
        result["op"] = op
        result["value"] = _parse_number(clause, tokens[3], 3)

    elif ctype == ConditionType.FAVORABILITY:
        # "favorability <targetId> <op> <value>"
        if len(tokens) < 4:
            raise ClauseError(
                clause,
                "Expected: favorability <targetId> <op> <value>",
                len(tokens),
            )
        result["targetId"] = tokens[1]
        op = tokens[2]
        if op not in _VALID_COMPARE_OPS:
            raise ClauseError(clause, f"Invalid op: {op}", 2)
        result["op"] = op
        result["value"] = _parse_number(clause, tokens[3], 3)

    elif ctype in (ConditionType.TRAIT, ConditionType.NO_TRAIT):
        # "trait <category> has <traitId>"
        if len(tokens) < 4 or tokens[2] != "has":
            raise ClauseError(
                clause,
                f"Expected: {ctype} <category> has <traitId>",
                len(tokens),
            )
        result["key"] = tokens[1]
        result["traitId"] = tokens[3]

    elif ctype == ConditionType.HAS_ITEM:
        # "hasItem <itemId> [<op> <value>]"
        if len(tokens) < 2:
            raise ClauseError(clause, "Expected: hasItem <itemId>", 1)
        result["itemId"] = tokens[1]
        if len(tokens) >= 4:
            op = tokens[2]
            if op not in _VALID_COMPARE_OPS:
                raise ClauseError(clause, f"Invalid op: {op}", 2)
            result["op"] = op
            result["value"] = _parse_number(clause, tokens[3], 3)

    elif ctype == ConditionType.CLOTHING:
        # "clothing <slot> [<state>|is <itemId>]"
        if len(tokens) < 2:
            raise ClauseError(clause, "Expected: clothing <slot>", 1)
        result["slot"] = tokens[1]
        if len(tokens) >= 3:
            if tokens[2] == "is" and len(tokens) >= 4:
                result["itemId"] = tokens[3]
            else:
                result["state"] = tokens[2]

    elif ctype == ConditionType.OUTFIT:
        # "outfit <outfitId>"
        if len(tokens) < 2:
            raise ClauseError(clause, "Expected: outfit <outfitId>", 1)
        result["outfitId"] = tokens[1]

    elif ctype == ConditionType.LOCATION:
        # "location <mapId> [cell:<cellIds>]"
        if len(tokens) < 2:
            raise ClauseError(clause, "Expected: location <mapId>", 1)
        result["mapId"] = tokens[1]
        if len(tokens) >= 3 and tokens[2].startswith("cell:"):
            cell_str = tokens[2][5:]
            result["cellIds"] = [int(c) if c.isdigit() else c for c in cell_str.split(",")]

    elif ctype == ConditionType.NPC_PRESENT:
        # "npcPresent [<npcId>]"
        if len(tokens) >= 2:
            result["npcId"] = tokens[1]

    elif ctype == ConditionType.NPC_ABSENT:
        # "npcAbsent [<npcId>]"
        if len(tokens) >= 2:
            result["npcId"] = tokens[1]

    elif ctype == ConditionType.TIME:
        # "time <hourMin>-<hourMax>"
        if len(tokens) < 2:
            raise ClauseError(clause, "Expected: time <hourMin>-<hourMax>", 1)
        time_range = tokens[1]
        if "-" in time_range:
            parts = time_range.split("-", 1)
            result["hourMin"] = int(parts[0])
            result["hourMax"] = int(parts[1])
        else:
            result["hourMin"] = int(time_range)

    else:
        raise ClauseError(clause, f"Unknown condition type: {ctype}", 0)

    if cond_target != "self":
        result["condTarget"] = cond_target

    return result


# ---------------------------------------------------------------------------
# Effect clause compiler
# ---------------------------------------------------------------------------


def compile_effect_clause(clause: str) -> dict[str, Any]:
    """Compile a single effect clause string into an effect dict.

    Supports @target: prefix for target="{{targetId}}".
    """
    clause = clause.strip()
    if not clause:
        raise ClauseError(clause, "Empty effect clause")

    target = "self"
    if clause.startswith("@target:"):
        target = "{{targetId}}"
        clause = clause[len("@target:") :].strip()

    tokens = clause.split()
    if not tokens:
        raise ClauseError(clause, "Empty effect clause after prefix")

    etype = tokens[0]
    result: dict[str, Any] = {"type": etype, "target": target}

    if etype in _NUMERIC_EFFECT:
        # "<type> <key> <op> <value>[%]"
        if len(tokens) < 4:
            raise ClauseError(
                clause,
                f"Expected: {etype} <key> <op> <value>",
                len(tokens),
            )
        result["key"] = tokens[1]
        op = tokens[2]
        if op not in _VALID_EFFECT_OPS:
            raise ClauseError(clause, f"Invalid op: {op}", 2)
        result["op"] = op
        val_str = tokens[3]
        if val_str.endswith("%"):
            result["value"] = _parse_number(clause, val_str[:-1], 3)
            result["valuePercent"] = True
        else:
            result["value"] = _parse_number(clause, val_str, 3)

    elif etype == EffectType.ITEM:
        # "item add|remove <itemId> [amount]"
        if len(tokens) < 3:
            raise ClauseError(clause, "Expected: item add|remove <itemId> [amount]", len(tokens))
        op = tokens[1]
        if op not in ("add", "remove"):
            raise ClauseError(clause, f"Invalid item op: {op} (use add/remove)", 1)
        result["op"] = op
        result["itemId"] = tokens[2]
        result["amount"] = _parse_number(clause, tokens[3], 3) if len(tokens) >= 4 else 1

    elif etype == EffectType.FAVORABILITY:
        # "favorability <from> -> <to> <value>"
        if len(tokens) < 5 or tokens[2] != "->":
            raise ClauseError(
                clause,
                "Expected: favorability <from> -> <to> <value>",
                len(tokens),
            )
        result["favFrom"] = tokens[1]
        result["favTo"] = tokens[3]
        result["op"] = "add"
        result["value"] = _parse_number(clause, tokens[4], 4)

    elif etype == EffectType.TRAIT:
        # "trait <category> add|remove <traitId>"
        if len(tokens) < 4:
            raise ClauseError(
                clause,
                "Expected: trait <category> add|remove <traitId>",
                len(tokens),
            )
        result["key"] = tokens[1]
        op = tokens[2]
        if op not in ("add", "remove"):
            raise ClauseError(clause, f"Invalid trait op: {op} (use add/remove)", 2)
        result["op"] = op
        result["traitId"] = tokens[3]

    elif etype == EffectType.CLOTHING:
        # "clothing <slot> <state>"
        if len(tokens) < 3:
            raise ClauseError(clause, "Expected: clothing <slot> <state>", len(tokens))
        result["slot"] = tokens[1]
        result["state"] = tokens[2]
        result["op"] = "set"

    elif etype == EffectType.POSITION:
        # "position <mapId> <cellId>"
        if len(tokens) < 3:
            raise ClauseError(clause, "Expected: position <mapId> <cellId>", len(tokens))
        result["mapId"] = tokens[1]
        result["cellId"] = _parse_number(clause, tokens[2], 2)

    elif etype == EffectType.WORLD_VAR:
        # "worldVar <key> add|set <value>"
        if len(tokens) < 4:
            raise ClauseError(
                clause,
                "Expected: worldVar <key> add|set <value>",
                len(tokens),
            )
        result["key"] = tokens[1]
        op = tokens[2]
        if op not in ("add", "set"):
            raise ClauseError(clause, f"Invalid worldVar op: {op} (use add/set)", 2)
        result["op"] = op
        result["value"] = _parse_number(clause, tokens[3], 3)
        # worldVar is global, not per-character
        del result["target"]

    else:
        raise ClauseError(clause, f"Unknown effect type: {etype}", 0)

    return result


# ---------------------------------------------------------------------------
# Compound condition compiler (handles strings, dicts with and/or/not)
# ---------------------------------------------------------------------------


def compile_condition(clause: Any) -> dict[str, Any]:
    """Compile a condition — string clause or composite dict."""
    if isinstance(clause, str):
        return compile_condition_clause(clause)
    if isinstance(clause, dict):
        if "and" in clause:
            return {"and": [compile_condition(c) for c in clause["and"]]}
        if "or" in clause:
            return {"or": [compile_condition(c) for c in clause["or"]]}
        if "not" in clause:
            child = clause["not"]
            if isinstance(child, str):
                return {"not": compile_condition_clause(child)}
            return {"not": compile_condition(child)}
        # Already a full condition dict — pass through
        return clause
    raise ClauseError(str(clause), "Condition must be a string or dict")


def compile_effects(effects: list) -> list[dict[str, Any]]:
    """Compile a list of effect clauses (strings or dicts)."""
    result = []
    for eff in effects:
        if isinstance(eff, str):
            result.append(compile_effect_clause(eff))
        elif isinstance(eff, dict):
            # Already a full effect dict — pass through
            result.append(eff)
        else:
            raise ClauseError(str(eff), "Effect must be a string or dict")
    return result


# ---------------------------------------------------------------------------
# Action IR compiler
# ---------------------------------------------------------------------------


def compile_action_ir(ir: dict) -> tuple[dict[str, Any], list[str]]:
    """Compile an action IR dict into a full action JSON.

    Returns (action_dict, warnings).
    Raises ClauseError on parse failures.
    """
    warnings: list[str] = []

    action: dict[str, Any] = {
        "id": ir.get("id", ""),
        "name": ir.get("name", ""),
    }

    if ir.get("category"):
        action["category"] = ir["category"]
    if ir.get("description"):
        action["description"] = ir["description"]

    # target → targetType
    action["targetType"] = ir.get("target", "none")
    action["triggerLLM"] = ir.get("triggerLLM", False)
    action["timeCost"] = ir.get("time", 10)
    action["npcWeight"] = ir.get("npcWeight", 0)

    # require → conditions
    require = ir.get("require", [])
    if require:
        action["conditions"] = [compile_condition(c) for c in require]
    else:
        action["conditions"] = []

    # costs (pass through, already JSON)
    if ir.get("costs"):
        action["costs"] = ir["costs"]
    else:
        action["costs"] = []

    # outcomes
    ir_outcomes = ir.get("outcomes", [])
    if not ir_outcomes:
        warnings.append("No outcomes defined")

    action["outcomes"] = []
    for i, o in enumerate(ir_outcomes):
        outcome: dict[str, Any] = {
            "label": o.get("label", f"Outcome {i + 1}"),
            "grade": o.get("grade", "normal"),
            "weight": o.get("weight", 100),
        }

        # effects: list of clause strings or dicts
        raw_effects = o.get("effects", [])
        outcome["effects"] = compile_effects(raw_effects)

        # text → outputTemplates
        if o.get("text"):
            outcome["outputTemplates"] = [{"text": o["text"]}]
        elif o.get("outputTemplates"):
            outcome["outputTemplates"] = o["outputTemplates"]

        # modifiers → weightModifiers (pass through JSON)
        if o.get("modifiers"):
            outcome["weightModifiers"] = o["modifiers"]

        action["outcomes"].append(outcome)

    # npcModifiers → npcWeightModifiers (pass through JSON)
    if ir.get("npcModifiers"):
        action["npcWeightModifiers"] = ir["npcModifiers"]

    # Top-level outputTemplates
    if ir.get("text"):
        action["outputTemplates"] = [{"text": ir["text"]}]
    elif ir.get("outputTemplates"):
        action["outputTemplates"] = ir["outputTemplates"]

    return action, warnings


# ---------------------------------------------------------------------------
# Event IR compiler
# ---------------------------------------------------------------------------


def compile_event_ir(ir: dict) -> tuple[dict[str, Any], list[str]]:
    """Compile an event IR dict into a full event JSON.

    Returns (event_dict, warnings).
    """
    warnings: list[str] = []

    event: dict[str, Any] = {
        "id": ir.get("id", ""),
        "name": ir.get("name", ""),
        "enabled": ir.get("enabled", True),
        "targetScope": ir.get("targetScope", "each_character"),
        "triggerMode": ir.get("triggerMode", "on_change"),
        "priority": ir.get("priority", 0),
    }

    if ir.get("description"):
        event["description"] = ir["description"]

    if ir.get("cooldown"):
        event["cooldown"] = ir["cooldown"]

    # require → conditions
    require = ir.get("require", [])
    if require:
        event["conditions"] = [compile_condition(c) for c in require]
    else:
        event["conditions"] = []

    # effects
    raw_effects = ir.get("effects", [])
    if not raw_effects:
        warnings.append("No effects defined")
    event["effects"] = compile_effects(raw_effects)

    # text → outputTemplates
    if ir.get("text"):
        event["outputTemplates"] = [{"text": ir["text"]}]
    elif ir.get("outputTemplates"):
        event["outputTemplates"] = ir["outputTemplates"]

    return event, warnings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_number(clause: str, token: str, position: int) -> int | float:
    """Parse a numeric token, returning int or float."""
    try:
        if "." in token:
            return float(token)
        return int(token)
    except ValueError:
        raise ClauseError(clause, f"Expected number, got: {token}", position)
