"""Weight and value modifiers: calculate bonuses from character attributes, roll outcomes."""

from __future__ import annotations

import random
from typing import Any

from ..constants import BonusMode, CondTarget, ModifierType


def _resolve_mod_fav_id(val: str, char_id: str, target_id: str | None) -> str:
    """Resolve favorability participant: self → char_id, {{targetId}} → target_id."""
    if val == "self":
        return char_id
    if val == "{{targetId}}":
        return target_id or ""
    return val


def _calc_modifier_bonus(
    modifiers: list[dict], char: dict, game_state: Any, char_id: str, target_id: str | None
) -> tuple[int, float]:
    """Calculate additive and multiplicative bonuses from modifiers.

    Returns (additive_total, multiplier_total) where multiplier_total is
    the product of all (1 + bonus/100) for multiply-mode modifiers.
    """
    add_total = 0
    mul_total = 1.0
    for mod in modifiers:
        mtype = mod.get("type")
        bonus = mod.get("bonus", 0)
        mode = mod.get("bonusMode", BonusMode.ADD)
        raw_bonus = 0

        # Resolve which character to check (modTarget: "self" or "target")
        mod_target = mod.get("modTarget", CondTarget.SELF)
        if mod_target == CondTarget.TARGET and target_id:
            check_char = game_state.characters.get(target_id, char)
            check_char_id = target_id
        else:
            check_char = char
            check_char_id = char_id

        if mtype == ModifierType.RESOURCE:
            res = check_char.get("resources", {}).get(mod.get("key", ""))
            if res:
                per = mod.get("per", 1)
                if per > 0:
                    raw_bonus = (int(res["value"]) // per) * bonus
        elif mtype == ModifierType.BASIC_INFO:
            info = check_char.get("basicInfo", {}).get(mod.get("key", ""))
            if info and info.get("type") == "number":
                per = mod.get("per", 1)
                if per > 0:
                    raw_bonus = (int(info["value"]) // per) * bonus
        elif mtype == ModifierType.ABILITY:
            for ab in check_char.get("abilities", []):
                if ab["key"] == mod["key"]:
                    per = mod.get("per", 1)
                    if per > 0:
                        raw_bonus = (ab["exp"] // per) * bonus
                    break
        elif mtype == ModifierType.EXPERIENCE:
            for exp_entry in check_char.get("experiences", []):
                if exp_entry["key"] == mod.get("key"):
                    per = mod.get("per", 1)
                    if per > 0:
                        raw_bonus = (exp_entry["count"] // per) * bonus
                    break
        elif mtype == ModifierType.TRAIT:
            trait_key = mod.get("key", "")
            trait_value = mod.get("value", "")
            for t in check_char.get("traits", []):
                if t["key"] == trait_key and trait_value in t.get("values", []):
                    raw_bonus = bonus
                    break
        elif mtype == ModifierType.HAS_ITEM:
            item_id = mod.get("itemId", "")
            for inv in check_char.get("inventory", []):
                if inv["itemId"] == item_id:
                    raw_bonus = bonus
                    break
        elif mtype == ModifierType.OUTFIT:
            outfit_id = mod.get("outfitId", "")
            check_data = game_state.character_data.get(check_char_id, {})
            if check_data.get("currentOutfit", "default") == outfit_id:
                raw_bonus = bonus
        elif mtype == ModifierType.CLOTHING:
            slot = mod.get("slot", "")
            expected_item = mod.get("itemId")
            for cl in check_char.get("clothing", []):
                if cl["slot"] == slot:
                    if expected_item:
                        if cl.get("itemId") == expected_item:
                            raw_bonus = bonus
                    elif cl.get("itemId"):
                        raw_bonus = bonus
                    break
        elif mtype == ModifierType.FAVORABILITY:
            # favFrom/favTo: "self" = actor, "{{targetId}}" = action target
            fav_from = mod.get("favFrom")
            fav_to = mod.get("favTo")
            # Legacy: source field → favFrom/favTo
            if fav_from is None and fav_to is None:
                source = mod.get("source", CondTarget.TARGET)
                if source == CondTarget.TARGET:
                    fav_from = "{{targetId}}"
                    fav_to = "self"
                else:
                    fav_from = "self"
                    fav_to = "{{targetId}}"
            from_id = _resolve_mod_fav_id(fav_from or "self", char_id, target_id)
            to_id = _resolve_mod_fav_id(fav_to or "{{targetId}}", char_id, target_id)
            from_data = game_state.character_data.get(from_id, {})
            fav_val = from_data.get("favorability", {}).get(to_id, 0)
            per = mod.get("per", 1)
            if per > 0:
                raw_bonus = (fav_val // per) * bonus
        elif mtype == ModifierType.VARIABLE:
            var_id = mod.get("varId", "")
            if var_id and hasattr(game_state, "variable_defs"):
                var_def = game_state.variable_defs.get(var_id)
                if var_def:
                    from ..variable_engine import evaluate_variable

                    # For bidirectional: modTarget determines direction
                    if mod_target == CondTarget.TARGET and target_id:
                        var_self = game_state.characters.get(target_id, check_char)
                        var_target = char
                        var_self_id, var_target_id = target_id, char_id
                    else:
                        var_self = check_char
                        var_target = game_state.characters.get(target_id) if target_id else None
                        var_self_id, var_target_id = char_id, target_id
                    var_value = evaluate_variable(
                        var_def,
                        var_self,
                        game_state.variable_defs,
                        target_state=var_target,
                        game_state=game_state,
                        char_id=var_self_id,
                        target_id=var_target_id,
                    )
                    per = mod.get("per", 1)
                    if per > 0:
                        raw_bonus = (int(var_value) // per) * bonus
        elif mtype == ModifierType.WORLD_VAR:
            key = mod.get("key", "")
            wv = getattr(game_state, "world_variables", {})
            val = wv.get(key, 0)
            per = mod.get("per", 1)
            if per > 0:
                raw_bonus = (int(val) // per) * bonus
        elif mtype == ModifierType.TIME:
            # Boolean modifier: match time conditions → +bonus, else 0
            time_obj = getattr(game_state, "time", None)
            if time_obj:
                matched = True
                hour_min = mod.get("hourMin")
                hour_max = mod.get("hourMax")
                if hour_min is not None and hour_max is not None:
                    if hour_min <= hour_max:
                        if not (hour_min <= time_obj.hour <= hour_max):
                            matched = False
                    else:  # cross-midnight
                        if not (time_obj.hour >= hour_min or time_obj.hour <= hour_max):
                            matched = False
                elif hour_min is not None:
                    if time_obj.hour < hour_min:
                        matched = False
                elif hour_max is not None:
                    if time_obj.hour > hour_max:
                        matched = False
                if mod.get("season") and time_obj.season_name != mod["season"]:
                    matched = False
                if mod.get("dayOfWeek") and time_obj.weekday != mod["dayOfWeek"]:
                    matched = False
                if mod.get("weather") and time_obj.weather != mod["weather"]:
                    matched = False
                if matched:
                    raw_bonus = bonus

        if mode == BonusMode.MULTIPLY:
            mul_total *= 1 + raw_bonus / 100
        else:
            add_total += raw_bonus
    return add_total, mul_total


def _roll_outcome(outcomes: list[dict], char: dict, game_state: Any, char_id: str, target_id: str | None) -> dict:
    """Roll a weighted random outcome, with modifiers from ability/trait/favorability."""
    weights = []
    for o in outcomes:
        w = o.get("weight", 1)
        w_add, w_mul = _calc_modifier_bonus(o.get("weightModifiers", []), char, game_state, char_id, target_id)
        w = (w + w_add) * w_mul
        weights.append(max(0, w))

    total = sum(weights)
    if total <= 0:
        return outcomes[0]

    roll = random.random() * total
    cumulative = 0
    for i, w in enumerate(weights):
        cumulative += w
        if roll < cumulative:
            return outcomes[i]
    return outcomes[-1]
