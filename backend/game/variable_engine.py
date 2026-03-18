"""Derived variable evaluation engine — computes formulas from character state."""

from __future__ import annotations

from typing import Any, Optional

from .constants import ArithOp, CondTarget, VarStepType


def evaluate_variable(
    var_def: dict,
    character_state: dict[str, Any],
    all_var_defs: dict[str, dict],
    visited: set[str] | None = None,
    target_state: Optional[dict[str, Any]] = None,
    game_state: Any = None,
    char_id: Optional[str] = None,
    target_id: Optional[str] = None,
) -> float:
    """Evaluate a derived variable against a character's runtime state.

    Args:
        var_def: The variable definition (with 'steps' list).
        character_state: The character's built runtime state (from build_character_state).
        all_var_defs: All loaded variable definitions (for cross-references).
        visited: Set of variable IDs already being evaluated (cycle detection).
        target_state: Optional target character state (for bidirectional variables).
        game_state: Optional GameState (for favorability lookup via character_data).
        char_id: Optional character ID (for favorability lookup).
        target_id: Optional target character ID (for favorability lookup).

    Returns:
        The computed numeric result.
    """
    if visited is None:
        visited = set()

    var_id = var_def.get("id", "")
    if var_id in visited:
        return 0.0  # circular dependency protection
    visited = visited | {var_id}  # copy to avoid mutation across branches

    steps = var_def.get("steps", [])
    if not steps:
        return 0.0

    ctx = _EvalContext(character_state, target_state, all_var_defs, visited, game_state, char_id, target_id)
    result = 0.0
    for i, step in enumerate(steps):
        step_value = _resolve_step_value(step, ctx)
        if i == 0:
            result = step_value
        else:
            result = _apply_op(step.get("op", "add"), result, step_value)
    return result


class _EvalContext:
    """Bundles all context needed for step evaluation."""

    __slots__ = ("char", "target", "var_defs", "visited", "game_state", "char_id", "target_id")

    def __init__(
        self,
        char: dict,
        target: Optional[dict],
        var_defs: dict,
        visited: set,
        game_state: Any,
        char_id: Optional[str],
        target_id: Optional[str],
    ):
        self.char = char
        self.target = target
        self.var_defs = var_defs
        self.visited = visited
        self.game_state = game_state
        self.char_id = char_id
        self.target_id = target_id


def evaluate_variable_debug(
    var_def: dict,
    character_state: dict[str, Any],
    all_var_defs: dict[str, dict],
    visited: set[str] | None = None,
    target_state: Optional[dict[str, Any]] = None,
    game_state: Any = None,
    char_id: Optional[str] = None,
    target_id: Optional[str] = None,
) -> dict:
    """Evaluate with step-by-step debug trace."""
    if visited is None:
        visited = set()

    var_id = var_def.get("id", "")
    if var_id in visited:
        return {"result": 0.0, "steps": [], "error": "circular dependency"}
    visited = visited | {var_id}

    steps = var_def.get("steps", [])
    if not steps:
        return {"result": 0.0, "steps": []}

    ctx = _EvalContext(character_state, target_state, all_var_defs, visited, game_state, char_id, target_id)
    result = 0.0
    trace = []
    for i, step in enumerate(steps):
        step_value = _resolve_step_value(step, ctx)
        if i == 0:
            result = step_value
        else:
            result = _apply_op(step.get("op", "add"), result, step_value)
        trace.append(
            {
                "index": i,
                "label": step.get("label", ""),
                "op": step.get("op", "") if i > 0 else "(init)",
                "type": step.get("type", ""),
                "source": step.get("source", "self"),
                "stepValue": step_value,
                "accumulated": result,
            }
        )

    return {"result": result, "steps": trace}


def _resolve_step_value(step: dict, ctx: _EvalContext) -> float:
    """Resolve the numeric value of a single formula step."""
    step_type = step.get("type", "")

    # Resolve which character to read from (source: "self" or "target")
    source = step.get("source", CondTarget.SELF)
    char = ctx.target if source == CondTarget.TARGET and ctx.target else ctx.char

    if step_type == VarStepType.CONSTANT:
        return float(step.get("value", 0))

    if step_type == VarStepType.ABILITY:
        key = step.get("key", "")
        for ab in char.get("abilities", []):
            if ab["key"] == key:
                return float(ab.get("exp", 0))
        return 0.0

    if step_type == VarStepType.RESOURCE:
        key = step.get("key", "")
        field = step.get("field", "value")
        res = char.get("resources", {}).get(key)
        if res:
            return float(res.get(field, 0))
        return 0.0

    if step_type == VarStepType.BASIC_INFO:
        key = step.get("key", "")
        info = char.get("basicInfo", {}).get(key)
        if info and info.get("type") == "number":
            return float(info.get("value", 0))
        return 0.0

    if step_type == VarStepType.TRAIT_COUNT:
        trait_group = step.get("traitGroup", "")
        for t in char.get("traits", []):
            if t["key"] == trait_group:
                return float(len(t.get("values", [])))
        return 0.0

    if step_type == VarStepType.HAS_TRAIT:
        trait_group = step.get("traitGroup", "")
        trait_id = step.get("traitId", "")
        for t in char.get("traits", []):
            if t["key"] == trait_group:
                return 1.0 if trait_id in t.get("values", []) else 0.0
        return 0.0

    if step_type == VarStepType.EXPERIENCE:
        key = step.get("key", "")
        for exp in char.get("experiences", []):
            if exp["key"] == key:
                return float(exp.get("count", 0))
        return 0.0

    if step_type == VarStepType.ITEM_COUNT:
        key = step.get("key", "")
        for inv in char.get("inventory", []):
            if inv["itemId"] == key:
                return float(inv.get("amount", 0))
        return 0.0

    if step_type == VarStepType.FAVORABILITY:
        # source character's favorability toward the other character
        # Use game_state.character_data for raw favorability dict
        if not ctx.game_state or not ctx.char_id:
            return 0.0
        if source == CondTarget.SELF:
            from_id = ctx.char_id
            to_id = ctx.target_id or ""
        else:  # source == "target"
            from_id = ctx.target_id or ""
            to_id = ctx.char_id
        if not from_id:
            return 0.0
        char_data = ctx.game_state.character_data.get(from_id, {})
        return float(char_data.get("favorability", {}).get(to_id, 0))

    if step_type == VarStepType.VARIABLE:
        var_id = step.get("varId", "")
        ref_def = ctx.var_defs.get(var_id)
        if not ref_def:
            return 0.0
        return evaluate_variable(
            ref_def,
            ctx.char,
            ctx.var_defs,
            ctx.visited,
            target_state=ctx.target,
            game_state=ctx.game_state,
            char_id=ctx.char_id,
            target_id=ctx.target_id,
        )

    return 0.0


def _apply_op(op: str, result: float, value: float) -> float:
    """Apply an arithmetic operation."""
    if op == ArithOp.ADD:
        return result + value
    if op == ArithOp.SUBTRACT:
        return result - value
    if op == ArithOp.MULTIPLY:
        return result * value
    if op == ArithOp.DIVIDE:
        return result / value if value != 0 else 0.0
    if op == ArithOp.MIN:
        return min(result, value)
    if op == ArithOp.MAX:
        return max(result, value)
    if op == ArithOp.FLOOR:
        return max(result, value)
    if op == ArithOp.CAP:
        return min(result, value)
    return result  # unknown op — no-op
