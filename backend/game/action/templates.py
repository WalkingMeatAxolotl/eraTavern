"""Output template system: conditional template selection and variable interpolation."""

from __future__ import annotations

import random
import re
from typing import Any

from ..constants import ClothingState
from .conditions import _evaluate_conditions


def _select_output_template(
    obj: dict,
    char: dict,
    game_state: Any,
    char_id: str,
    target_id: str | None,
) -> str:
    """Select an output template from obj.outputTemplate / obj.outputTemplates.

    If outputTemplates is a list of {text, conditions?, weight?}, evaluate
    conditions and weighted-random among matching entries.
    Falls back to the legacy outputTemplate string.
    """
    templates = obj.get("outputTemplates")
    if not templates or not isinstance(templates, list):
        return obj.get("outputTemplate", "")

    # Filter by conditions
    matching: list[tuple[str, float]] = []
    for entry in templates:
        text = entry.get("text", "")
        conds = entry.get("conditions", [])
        if conds:
            if not _evaluate_conditions(
                conds,
                char,
                game_state,
                target_id=target_id,
                char_id=char_id,
            ):
                continue
        weight = entry.get("weight", 1)
        if weight > 0:
            matching.append((text, weight))

    if not matching:
        # No entry matched → fall back to legacy field
        return obj.get("outputTemplate", "")

    if len(matching) == 1:
        return matching[0][0]

    # Weighted random
    total = sum(w for _, w in matching)
    roll = random.random() * total
    cumulative = 0.0
    for text, w in matching:
        cumulative += w
        if roll < cumulative:
            return text
    return matching[-1][0]


def _resolve_template(
    template: str,
    char: dict,
    target_char: dict | None,
    game_state: Any,
    outcome: dict | None,
    effects_summary: list[str],
) -> str:
    """Resolve template variables like {{self.clothing.上衣}}."""
    if not template:
        return ""

    def _char_var(c: dict | None, path: str) -> str:
        """Resolve a character variable path like 'name', 'resource.体力', 'clothing.上衣'."""
        if not c:
            return ""

        # Single-part shorthand
        if path == "name":
            return str(c.get("basicInfo", {}).get("name", {}).get("value", ""))

        parts = path.split(".", 1)
        if len(parts) < 2:
            return ""
        category, key = parts

        if category == "name":
            return str(c.get("basicInfo", {}).get("name", {}).get("value", ""))

        if category == "resource":
            res = c.get("resources", {}).get(key)
            return str(res["value"]) if res else ""

        if category == "ability":
            for ab in c.get("abilities", []):
                if ab["key"] == key:
                    return ab.get("grade", "")
            return ""

        if category == "abilityExp":
            for ab in c.get("abilities", []):
                if ab["key"] == key:
                    return str(ab.get("exp", 0))
            return ""

        if category == "basicInfo":
            info = c.get("basicInfo", {}).get(key)
            return str(info["value"]) if info else ""

        if category == "clothing":
            for cl in c.get("clothing", []):
                if cl["slot"] == key:
                    if cl.get("itemId"):
                        name = cl.get("itemName", cl["itemId"])
                        if cl.get("state") == ClothingState.HALF_WORN:
                            return f"{name}(半穿)"
                        if cl.get("state") == ClothingState.OFF:
                            return f"{name}(脱下)"
                        return name
                    return "无"
            return ""

        if category == "trait":
            for t in c.get("traits", []):
                if t["key"] == key:
                    vals = t.get("values", [])
                    return ", ".join(vals) if vals else "无"
            return ""

        if category == "favorability":
            fav_data = c.get("favorability", [])
            if isinstance(fav_data, list):
                for fav in fav_data:
                    if fav["id"] == key:
                        return str(fav["value"])
            elif isinstance(fav_data, dict):
                return str(fav_data.get(key, 0))
            return "0"

        if category == "inventory":
            for inv in c.get("inventory", []):
                if inv["itemId"] == key:
                    return str(inv.get("amount", 0))
            return "0"

        if category == "experience":
            for exp_entry in c.get("experiences", []):
                if exp_entry["key"] == key:
                    return str(exp_entry.get("count", 0))
            return "0"

        return ""

    def _replace_var(m: re.Match) -> str:
        var = m.group(1)

        # Simple variables
        if var == "player" or var == "self":
            return str(char.get("basicInfo", {}).get("name", {}).get("value", ""))
        if var == "target":
            return str(target_char.get("basicInfo", {}).get("name", {}).get("value", "")) if target_char else ""
        if var == "outcome":
            return outcome.get("label", "") if outcome else ""
        if var == "outcomeGrade":
            return outcome.get("grade", "") if outcome else ""
        if var == "effects":
            return ", ".join(effects_summary) if effects_summary else ""
        if var == "time":
            return str(game_state.time) if hasattr(game_state, "time") else ""
        if var == "weather":
            return getattr(game_state.time, "weather", "") if hasattr(game_state, "time") else ""
        if var == "location":
            pos = char.get("position", {})
            m_data = game_state.maps.get(pos.get("mapId", ""), {})
            for cell in m_data.get("cells", []):
                if cell["id"] == pos.get("cellId"):
                    return cell.get("name", "")
            return ""

        # Dot-notation: self.X.Y or target.X.Y
        if var.startswith("self."):
            return _char_var(char, var[5:])
        if var.startswith("target."):
            return _char_var(target_char, var[7:])

        return m.group(0)  # Keep unrecognized

    return re.sub(r"\{\{(\w+(?:\.\w+)*)\}\}", _replace_var, template)
