"""Derived variable evaluation engine — computes formulas from character state."""

from __future__ import annotations

from typing import Any


def evaluate_variable(
    var_def: dict,
    character_state: dict[str, Any],
    all_var_defs: dict[str, dict],
    visited: set[str] | None = None,
) -> float:
    """Evaluate a derived variable against a character's runtime state.

    Args:
        var_def: The variable definition (with 'steps' list).
        character_state: The character's built runtime state (from build_character_state).
        all_var_defs: All loaded variable definitions (for cross-references).
        visited: Set of variable IDs already being evaluated (cycle detection).

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

    result = 0.0
    for i, step in enumerate(steps):
        step_value = _resolve_step_value(step, character_state, all_var_defs, visited)
        if i == 0:
            result = step_value
        else:
            result = _apply_op(step.get("op", "add"), result, step_value)
    return result


def evaluate_variable_debug(
    var_def: dict,
    character_state: dict[str, Any],
    all_var_defs: dict[str, dict],
    visited: set[str] | None = None,
) -> dict:
    """Evaluate with step-by-step debug trace.

    Returns:
        {"result": float, "steps": [{"label": str, "stepValue": float, "accumulated": float}, ...]}
    """
    if visited is None:
        visited = set()

    var_id = var_def.get("id", "")
    if var_id in visited:
        return {"result": 0.0, "steps": [], "error": "circular dependency"}
    visited = visited | {var_id}

    steps = var_def.get("steps", [])
    if not steps:
        return {"result": 0.0, "steps": []}

    result = 0.0
    trace = []
    for i, step in enumerate(steps):
        step_value = _resolve_step_value(step, character_state, all_var_defs, visited)
        if i == 0:
            result = step_value
        else:
            result = _apply_op(step.get("op", "add"), result, step_value)
        trace.append({
            "index": i,
            "label": step.get("label", ""),
            "op": step.get("op", "") if i > 0 else "(init)",
            "type": step.get("type", ""),
            "stepValue": step_value,
            "accumulated": result,
        })

    return {"result": result, "steps": trace}


def _resolve_step_value(
    step: dict,
    character_state: dict[str, Any],
    all_var_defs: dict[str, dict],
    visited: set[str],
) -> float:
    """Resolve the numeric value of a single formula step."""
    step_type = step.get("type", "")

    if step_type == "constant":
        return float(step.get("value", 0))

    if step_type == "ability":
        key = step.get("key", "")
        for ab in character_state.get("abilities", []):
            if ab["key"] == key:
                return float(ab.get("exp", 0))
        return 0.0

    if step_type == "resource":
        key = step.get("key", "")
        field = step.get("field", "value")
        res = character_state.get("resources", {}).get(key)
        if res:
            return float(res.get(field, 0))
        return 0.0

    if step_type == "basicInfo":
        key = step.get("key", "")
        info = character_state.get("basicInfo", {}).get(key)
        if info and info.get("type") == "number":
            return float(info.get("value", 0))
        return 0.0

    if step_type == "traitCount":
        trait_group = step.get("traitGroup", "")
        for t in character_state.get("traits", []):
            if t["key"] == trait_group:
                return float(len(t.get("values", [])))
        return 0.0

    if step_type == "hasTrait":
        trait_group = step.get("traitGroup", "")
        trait_id = step.get("traitId", "")
        for t in character_state.get("traits", []):
            if t["key"] == trait_group:
                return 1.0 if trait_id in t.get("values", []) else 0.0
        return 0.0

    if step_type == "variable":
        var_id = step.get("varId", "")
        ref_def = all_var_defs.get(var_id)
        if not ref_def:
            return 0.0
        return evaluate_variable(ref_def, character_state, all_var_defs, visited)

    return 0.0


def _apply_op(op: str, result: float, value: float) -> float:
    """Apply an arithmetic operation."""
    if op == "add":
        return result + value
    if op == "subtract":
        return result - value
    if op == "multiply":
        return result * value
    if op == "divide":
        return result / value if value != 0 else 0.0
    if op == "min":
        return min(result, value)
    if op == "max":
        return max(result, value)
    if op == "clamp_min":
        return max(result, value)
    if op == "clamp_max":
        return min(result, value)
    return result  # unknown op — no-op
