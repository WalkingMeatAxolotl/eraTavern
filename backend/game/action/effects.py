"""Effect application: apply effects to targets, cost checking/deduction, target filter resolution."""

from __future__ import annotations

from typing import Any

from ..constants import EF, ClothingState, CostType, EffectOp, EffectType
from .conditions import _compare
from .modifiers import _calc_modifier_bonus


def _check_costs(costs: list[dict], char: dict) -> tuple[bool, str]:
    """Check if character can afford all costs. Returns (enabled, reason)."""
    for cost in costs:
        ctype = cost.get("type")
        amount = cost.get("amount", 0)

        if ctype == CostType.RESOURCE:
            res = char.get("resources", {}).get(cost.get("key", ""))
            if not res or res["value"] < amount:
                label = res["label"] if res else cost.get("key", "")
                return False, f"{label}不足"

        elif ctype == CostType.BASIC_INFO:
            info = char.get("basicInfo", {}).get(cost.get("key", ""))
            if not info or info["value"] < amount:
                label = info["label"] if info else cost.get("key", "")
                return False, f"{label}不足"

        elif ctype == CostType.ITEM:
            item_id = cost.get("itemId", "")
            found = 0
            for inv in char.get("inventory", []):
                if inv["itemId"] == item_id:
                    found = inv["amount"]
                    break
            if found < amount:
                return False, "物品不足"

    return True, ""


def _apply_costs(costs: list[dict], char: dict) -> None:
    """Deduct costs from character."""
    for cost in costs:
        ctype = cost.get("type")
        amount = cost.get("amount", 0)

        if ctype == CostType.RESOURCE:
            res = char.get("resources", {}).get(cost.get("key", ""))
            if res:
                res["value"] = max(0, res["value"] - amount)

        elif ctype == CostType.BASIC_INFO:
            info = char.get("basicInfo", {}).get(cost.get("key", ""))
            if info and info.get("type") == "number":
                info["value"] -= amount

        elif ctype == CostType.ITEM:
            item_id = cost.get("itemId", "")
            inventory = char.get("inventory", [])
            for inv in inventory:
                if inv["itemId"] == item_id:
                    inv["amount"] -= amount
                    if inv["amount"] <= 0:
                        inventory.remove(inv)
                    break


def _resolve_effect_value(eff: dict, char: dict, game_state: Any) -> float:
    """Resolve effect value: if it's a dict with varId, evaluate the variable; otherwise return the number."""
    raw = eff.get("value", 0)
    if isinstance(raw, dict):
        var_id = raw.get("varId", "")
        if var_id and hasattr(game_state, "variable_defs"):
            var_def = game_state.variable_defs.get(var_id)
            if var_def:
                from ..variable_engine import evaluate_variable

                result = evaluate_variable(var_def, char, game_state.variable_defs)
                return result * raw.get("multiply", 1)
        return 0
    return raw


def _resolve_effect_targets(
    target: Any,
    char: dict,
    char_id: str,
    target_id: str | None,
    game_state: Any,
) -> list[str]:
    """Resolve effect target to a list of character IDs."""
    if target == "self" or not target:
        return [char_id]
    if target == "{{targetId}}":
        return [target_id] if target_id else []
    if isinstance(target, dict) and "filter" in target:
        f = target["filter"]
        candidates = list(game_state.characters.keys())

        # cell filter
        cell_f = f.get("cell")
        if cell_f == "current":
            pos = char["position"]
            candidates = [
                c
                for c in candidates
                if game_state.characters[c]["position"]["mapId"] == pos["mapId"]
                and game_state.characters[c]["position"]["cellId"] == pos["cellId"]
            ]
        elif isinstance(cell_f, dict):
            candidates = [
                c
                for c in candidates
                if game_state.characters[c]["position"]["mapId"] == cell_f.get("mapId")
                and game_state.characters[c]["position"]["cellId"] == cell_f.get("cellId")
            ]

        # trait filter
        trait_f = f.get("trait")
        if trait_f:
            key, tid = trait_f.get("key", ""), trait_f.get("traitId", "")
            candidates = [
                c for c in candidates if tid in game_state.character_data.get(c, {}).get("traits", {}).get(key, [])
            ]

        # variable filter (bidirectional)
        var_f = f.get("variable")
        if var_f:
            var_def = game_state.variable_defs.get(var_f.get("varId", ""))
            if var_def:
                from ..variable_engine import evaluate_variable

                filtered = []
                for c in candidates:
                    c_state = game_state.characters.get(c)
                    if c_state:
                        val = evaluate_variable(
                            var_def,
                            char,
                            game_state.variable_defs,
                            target_state=c_state,
                            game_state=game_state,
                            char_id=char_id,
                            target_id=c,
                        )
                        if _compare(val, var_f.get("op", ">="), var_f.get("value", 0)):
                            filtered.append(c)
                candidates = filtered

        # excludeSelf
        if f.get("excludeSelf"):
            candidates = [c for c in candidates if c != char_id]

        return candidates

    # Legacy: specific character ID
    if isinstance(target, str) and target:
        return [target]
    return []


def _apply_effects(effects: list[dict], char: dict, game_state: Any, char_id: str, target_id: str | None) -> list[str]:
    """Apply effects and return human-readable summaries."""
    summaries: list[str] = []

    for eff in effects:
        etype = eff.get("type")
        target = eff.get("target", "self")
        op = eff.get("op", "add")

        # Resolve target(s)
        target_ids = _resolve_effect_targets(target, char, char_id, target_id, game_state)

        for resolved_tid in target_ids:
            target_char = game_state.characters.get(resolved_tid)
            if not target_char:
                continue

            _apply_single_effect(
                eff, etype, op, char, target_char, char_id, resolved_tid, target_id, game_state, summaries
            )

    return summaries


def _apply_single_effect(
    eff: dict,
    etype: str,
    op: str,
    char: dict,
    target_char: dict,
    char_id: str,
    target_id: str,
    action_target_id: str | None,
    game_state: Any,
    summaries: list[str],
) -> None:
    """Apply a single effect to a single target character."""
    # Build target name prefix for summaries (empty for self)
    target_prefix = ""
    if target_char is not char:
        t_name = target_char.get("basicInfo", {}).get("name", {})
        if isinstance(t_name, dict):
            t_name = t_name.get("value", "")
        target_prefix = f"[{t_name}] " if t_name else ""

    # Apply valueModifiers to the effect value
    value_mod_add, value_mod_mul = _calc_modifier_bonus(
        eff.get("valueModifiers", []), char, game_state, char_id, target_id
    )

    if etype == EF.RESOURCE:
        key = eff.get("key", "")
        value = int((_resolve_effect_value(eff, char, game_state) + value_mod_add) * value_mod_mul)
        is_pct = eff.get("valuePercent", False)
        res = target_char.get("resources", {}).get(key)
        if res:
            if op == EffectOp.ADD:
                delta = int(res["value"] * value / 100) if is_pct else value
                res["value"] = min(res["max"], max(0, res["value"] + delta))
                suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                summaries.append(f"{target_prefix}{res['label']} {suffix}")
            elif op == EffectOp.SET:
                new_val = int(res["max"] * value / 100) if is_pct else value
                res["value"] = min(res["max"], max(0, new_val))
                suffix = f"{value}{'%' if is_pct else ''}"
                summaries.append(f"{target_prefix}{res['label']} → {suffix}")

    elif etype == EF.ABILITY:
        key = eff.get("key", "")
        value = int((_resolve_effect_value(eff, char, game_state) + value_mod_add) * value_mod_mul)
        is_pct = eff.get("valuePercent", False)
        for ab in target_char.get("abilities", []):
            if ab["key"] == key:
                if op == EffectOp.ADD:
                    delta = int(ab["exp"] * value / 100) if is_pct else value
                    ab["exp"] = max(0, ab["exp"] + delta)
                    suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                    summaries.append(f"{target_prefix}{ab['label']} {suffix}")
                elif op == EffectOp.SET:
                    new_val = int(ab["exp"] * value / 100) if is_pct else value
                    ab["exp"] = max(0, new_val)
                    suffix = f"{value}{'%' if is_pct else ''}"
                    summaries.append(f"{target_prefix}{ab['label']} → {suffix}")
                from ..character import exp_to_grade

                ab["grade"] = exp_to_grade(ab["exp"])
                break

    elif etype == EF.BASIC_INFO:
        key = eff.get("key", "")
        value = int((_resolve_effect_value(eff, char, game_state) + value_mod_add) * value_mod_mul)
        is_pct = eff.get("valuePercent", False)
        info = target_char.get("basicInfo", {}).get(key)
        if info and info.get("type") == "number":
            if op == EffectOp.ADD:
                delta = int(info["value"] * value / 100) if is_pct else value
                info["value"] += delta
                suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
                summaries.append(f"{target_prefix}{info['label']} {suffix}")
            elif op == EffectOp.SET:
                new_val = int(info["value"] * value / 100) if is_pct else value
                info["value"] = new_val
                suffix = f"{value}{'%' if is_pct else ''}"
                summaries.append(f"{target_prefix}{info['label']} → {suffix}")

    elif etype == EF.FAVORABILITY:
        # Resolve favFrom (whose fav data) and favTo (towards whom)
        raw_from = eff.get("favFrom", "{{targetId}}")
        raw_to = eff.get("favTo", "self")
        # Also support legacy targetId field
        if "targetId" in eff and "favFrom" not in eff:
            raw_from = eff["targetId"]
            raw_to = "self"

        def _resolve_fav_id(val: str) -> str:
            if val == "self":
                return char_id
            if val == "{{targetId}}":
                return action_target_id or ""
            if val == "{{player}}":
                for cid, c in game_state.characters.items():
                    if c.get("isPlayer"):
                        return cid
                return ""
            return val

        fav_from_id = _resolve_fav_id(raw_from)
        fav_to_id = _resolve_fav_id(raw_to)
        if not fav_from_id or not fav_to_id:
            return

        value = int((_resolve_effect_value(eff, char, game_state) + value_mod_add) * value_mod_mul)
        is_pct = eff.get("valuePercent", False)
        # Update: fav_from's favorability towards fav_to
        from_data = game_state.character_data.get(fav_from_id, {})
        fav = from_data.setdefault("favorability", {})
        # Build favorability summary with from→to names
        from_name_data = game_state.character_data.get(fav_from_id, {}).get("basicInfo", {}).get("name", "")
        to_name_data = game_state.character_data.get(fav_to_id, {}).get("basicInfo", {}).get("name", "")
        fav_label = f"[{from_name_data}→{to_name_data}] 好感度" if from_name_data and to_name_data else "好感度"
        if op == EffectOp.ADD:
            old = fav.get(fav_to_id, 0)
            delta = int(old * value / 100) if is_pct else value
            fav[fav_to_id] = old + delta
            suffix = f"{'+' if value >= 0 else ''}{value}{'%' if is_pct else ''}"
            summaries.append(f"{fav_label} {suffix}")
        elif op == EffectOp.SET:
            old = fav.get(fav_to_id, 0)
            new_val = int(old * value / 100) if is_pct else value
            fav[fav_to_id] = new_val
            suffix = f"{value}{'%' if is_pct else ''}"
            summaries.append(f"{fav_label} → {suffix}")

    elif etype == EF.ITEM:
        item_id = eff.get("itemId", "")
        amount = eff.get("amount", 1)
        inventory = target_char.setdefault("inventory", [])
        if op == EffectOp.ADD:
            found = False
            for inv in inventory:
                if inv["itemId"] == item_id:
                    inv["amount"] += amount
                    found = True
                    break
            if not found:
                item_def = game_state.item_defs.get(item_id, {})
                inventory.append(
                    {
                        "itemId": item_id,
                        "name": item_def.get("name", item_id),
                        "tags": item_def.get("tags", []),
                        "amount": amount,
                    }
                )
            summaries.append(f"{target_prefix}获得 {item_id} x{amount}")
        elif op == EffectOp.REMOVE:
            for inv in inventory:
                if inv["itemId"] == item_id:
                    inv["amount"] -= amount
                    if inv["amount"] <= 0:
                        inventory.remove(inv)
                    break
            summaries.append(f"{target_prefix}失去 {item_id} x{amount}")

    elif etype == EF.TRAIT:
        key = eff.get("key", "")
        trait_id = eff.get("traitId", "")
        # Resolve target for trait effects
        trait_target = eff.get("target", "self")
        if trait_target == "{{targetId}}" and action_target_id:
            t_char_data = game_state.character_data.get(action_target_id, {})
        elif trait_target == "self" or not trait_target:
            t_char_data = game_state.character_data.get(char_id, {})
        else:
            t_char_data = game_state.character_data.get(trait_target, {})
        traits = t_char_data.get("traits", {})
        if op == EffectOp.ADD:
            vals = traits.get(key, [])
            if trait_id not in vals:
                # Check exclusive trait groups: remove other members
                for grp in game_state.trait_groups.values():
                    if grp.get("exclusive", True) and trait_id in grp.get("traits", []):
                        removed = [t for t in vals if t in grp["traits"]]
                        for t in removed:
                            vals.remove(t)
                        break
                vals.append(trait_id)
                traits[key] = vals
            summaries.append(f"{target_prefix}获得特质 [{trait_id}]")
        elif op == EffectOp.REMOVE:
            vals = traits.get(key, [])
            if trait_id in vals:
                vals.remove(trait_id)
                traits[key] = vals
            summaries.append(f"{target_prefix}失去特质 [{trait_id}]")

    elif etype == EF.CLOTHING:
        slot = eff.get("slot", "")
        new_state = eff.get("state", ClothingState.WORN)
        # Resolve target for clothing effects
        cl_target = eff.get("target", "self")
        if cl_target == "{{targetId}}" and target_id:
            cl_char_data = game_state.character_data.get(target_id, {})
        elif cl_target == "self" or not cl_target:
            cl_char_data = game_state.character_data.get(char_id, {})
        else:
            cl_char_data = game_state.character_data.get(cl_target, {})
        cl = cl_char_data.get("clothing", {})
        if slot in cl:
            if op == EffectOp.REMOVE or new_state == ClothingState.EMPTY:
                item_name = cl[slot].get("itemId", slot)
                cl[slot] = {"itemId": None, "state": ClothingState.OFF}
                summaries.append(f"{target_prefix}移除 [{item_name}]")
            else:
                cl[slot]["state"] = new_state
                item_name = cl[slot].get("itemId", slot)
                summaries.append(f"{target_prefix}[{item_name}] → {new_state}")

    elif etype == EF.OUTFIT:
        import random

        # Resolve target (same pattern as clothing)
        out_target = eff.get("target", "self")
        if out_target == "{{targetId}}" and action_target_id:
            tgt_cd = game_state.character_data.get(action_target_id, {})
        elif out_target == "self" or not out_target:
            tgt_cd = game_state.character_data.get(char_id, {})
        else:
            tgt_cd = game_state.character_data.get(out_target, {})
        if not tgt_cd:
            return

        if op == EffectOp.SWITCH:
            outfit_key = eff.get("outfitKey", "")
            outfit = tgt_cd.get("outfits", {}).get(outfit_key)
            # Fallback: resolve from outfit type definition
            if not outfit and outfit_key != "default":
                for ot in game_state.outfit_types:
                    if ot.get("id") == outfit_key:
                        if ot.get("copyDefault"):
                            outfit = tgt_cd.get("outfits", {}).get("default")
                        else:
                            outfit = ot.get("slots", {})
                        break
            if not outfit:
                return
            cl = tgt_cd.setdefault("clothing", {})
            occupied: set[str] = set()  # Slots occupied by multi-slot items
            for slot, candidates in outfit.items():
                if slot in occupied:
                    continue
                if not candidates:
                    cl[slot] = {"itemId": None, "state": ClothingState.OFF}
                else:
                    chosen = random.choice(candidates)
                    cl[slot] = {"itemId": chosen, "state": ClothingState.WORN}
                    # Multi-slot: occupy all slots this clothing uses
                    cdef = game_state.clothing_defs.get(chosen, {})
                    for extra_slot in cdef.get("slots", []):
                        if extra_slot != slot:
                            cl[extra_slot] = {"itemId": chosen, "state": ClothingState.WORN}
                            occupied.add(extra_slot)
            tgt_cd["currentOutfit"] = outfit_key
            summaries.append(f"{target_prefix}换装 → {outfit_key}")

        elif op == EffectOp.ADD:
            outfit_key = eff.get("outfitKey", "")
            slot = eff.get("slot", "")
            item_id = eff.get("itemId", "")
            if not outfit_key or not slot or not item_id:
                return
            outfits = tgt_cd.setdefault("outfits", {})
            outfit = outfits.setdefault(outfit_key, {})
            slot_list = outfit.setdefault(slot, [])
            if item_id not in slot_list:
                slot_list.append(item_id)
            summaries.append(f"{target_prefix}预设[{outfit_key}] +{item_id}")

        elif op == EffectOp.REMOVE:
            outfit_key = eff.get("outfitKey")
            slot_filter = eff.get("slot")
            outfits = tgt_cd.get("outfits", {})
            current_outfit = tgt_cd.get("currentOutfit", "default")
            cl = tgt_cd.get("clothing", {})
            removed = []
            for ok, outfit in outfits.items():
                if outfit_key and ok != outfit_key:
                    continue
                for sl, candidates in list(outfit.items()):
                    if slot_filter and sl != slot_filter:
                        continue
                    if not candidates:
                        continue
                    worn_id = None
                    if ok == current_outfit:
                        worn_id = cl.get(sl, {}).get("itemId")
                    removable = [c for c in candidates if c != worn_id]
                    if removable:
                        victim = random.choice(removable)
                        candidates.remove(victim)
                        removed.append(victim)
            if removed:
                summaries.append(f"{target_prefix}移除{len(removed)}件预设服装")

    elif etype == EffectType.POSITION:
        map_id = eff.get("mapId", "")
        cell_id = eff.get("cellId")
        if not map_id or cell_id is None:
            return
        # Skip if target map doesn't exist (addon disabled)
        if map_id not in game_state.maps:
            return
        # Resolve target character for position change
        pos_target = eff.get("target", "self")
        if pos_target == "{{targetId}}" and action_target_id:
            pos_char_id = action_target_id
        elif pos_target == "self" or not pos_target:
            pos_char_id = char_id
        else:
            pos_char_id = pos_target
        pos_char = game_state.characters.get(pos_char_id)
        pos_char_data = game_state.character_data.get(pos_char_id)
        if pos_char and pos_char_data:
            new_pos = {"mapId": map_id, "cellId": cell_id}
            pos_char["position"] = new_pos
            pos_char_data["position"] = new_pos
            # Get cell name for summary
            map_data = game_state.maps.get(map_id)
            cell_name = ""
            if map_data:
                cell_info = map_data.get("cell_index", {}).get(cell_id)
                if cell_info:
                    cell_name = cell_info.get("name", f"#{cell_id}")
            summaries.append(f"{target_prefix}移动到 {cell_name or map_id}")

    elif etype == EF.WORLD_VAR:
        key = eff.get("key", "")
        value = eff.get("value", 0)
        wv = getattr(game_state, "world_variables", {})
        if op == EffectOp.SET:
            wv[key] = value
            summaries.append(f"世界变量 {key} → {value}")
        elif op == EffectOp.ADD:
            wv[key] = wv.get(key, 0) + value
            summaries.append(f"世界变量 {key} {'+' if value >= 0 else ''}{value}")
        return

    elif etype == EF.EXPERIENCE:
        key = eff.get("key", "")
        amount = eff.get("value", 1)
        for exp_entry in target_char.get("experiences", []):
            if exp_entry["key"] != key:
                continue
            old_count = exp_entry["count"]
            exp_entry["count"] = max(0, old_count + amount)
            # Record first occurrence info (overwrite placeholder if count was 0)
            if old_count == 0 and exp_entry["count"] > 0:
                # Build location string
                pos = char.get("position", {})
                map_data = game_state.maps.get(pos.get("mapId", ""))
                loc_name = ""
                if map_data:
                    cell_info = map_data.get("cell_index", {}).get(pos.get("cellId"))
                    if cell_info:
                        loc_name = cell_info.get("name", "")
                    map_name = map_data.get("name", pos.get("mapId", ""))
                    loc_name = f"{map_name}/{loc_name}" if loc_name else map_name
                # Build partner name: the "other person" from target_char's perspective
                # Figure out who target_char is
                eff_target = eff.get("target", "self")
                if eff_target == "self" or (not eff_target):
                    # target_char is the actor → partner is the action target
                    partner_id = action_target_id
                elif eff_target == "{{targetId}}":
                    # target_char is the action target → partner is the actor
                    partner_id = char_id
                else:
                    # target_char is a specific NPC → partner is the actor
                    partner_id = char_id
                partner_name = ""
                if partner_id:
                    p_char_data = game_state.character_data.get(partner_id, {})
                    partner_name = p_char_data.get("basicInfo", {}).get("name", partner_id)
                # Build time string
                t = game_state.time
                time_str = f"{t.year}年{t.season_name}{t.day}日{t.hour:02d}时"
                exp_entry["first"] = {
                    "event": eff.get("eventLabel", key),
                    "location": loc_name,
                    "target": partner_name,
                    "time": time_str,
                }
            summaries.append(f"{target_prefix}{exp_entry['label']} +{amount}")
            break

    return summaries
