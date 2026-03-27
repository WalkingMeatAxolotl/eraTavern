from __future__ import annotations

"""LLM engine — variable collection, prompt assembly, and API call."""

import json
import re
from typing import Any, Optional

import httpx

from .constants import PL, ClothingState, EffectDirection, LorebookMode, MagnitudeType

# Default prompt labels — overridden by template.promptLabels at runtime
_DEFAULT_PROMPT_LABELS: dict[str, str] = {
    "money": "金钱",
    "traits": "特质",
    "abilities": "能力",
    "experiences": "经验",
    "clothing": "穿着",
    "inventory": "物品",
    "favorability": "好感度",
    "variables": "变量",
    "worn": "穿着",
    "halfWorn": "半脱",
    "off": "脱下",
    "occluded": "遮挡",
    "none": "无",
    "idle": "待机中",
    "traveling": "正在前往...",
    "expUnit": "次",
    "defaultOutfit": "默认服装",
}


def _pl(game_state: Any, key: str) -> str:
    """Get a prompt label from template, falling back to defaults."""
    tpl = getattr(game_state, "template", {})
    labels = tpl.get("promptLabels", {})
    return labels.get(key, _DEFAULT_PROMPT_LABELS.get(key, key))


# ---------------------------------------------------------------------------
# Variable helpers
# ---------------------------------------------------------------------------


def _get_player_char(game_state: Any) -> Optional[dict]:
    """Get the player's runtime character dict."""
    pid = game_state.player_character
    if pid:
        return game_state.characters.get(pid)
    for char in game_state.characters.values():
        if char.get("isPlayer"):
            return char
    return None


def _get_player_id(game_state: Any) -> str:
    """Get the player character ID."""
    if game_state.player_character:
        return game_state.player_character
    for cid, char in game_state.characters.items():
        if char.get("isPlayer"):
            return cid
    return ""


# ---------------------------------------------------------------------------
# Format functions — character data
# ---------------------------------------------------------------------------


def _format_name(char: dict) -> str:
    return char.get("basicInfo", {}).get("name", {}).get("value", "")


def _format_money(char: dict) -> str:
    money = char.get("basicInfo", {}).get("money", {}).get("value", 0)
    return str(money)


def _format_resources(char: dict) -> str:
    parts = []
    for key, r in char.get("resources", {}).items():
        parts.append(f"{r['label']}: {r['value']}/{r['max']}")
    return ", ".join(parts) if parts else ""


def _format_traits_names(char: dict) -> str:
    """Trait names only (compact, saves tokens)."""
    parts = []
    for t in char.get("traits", []):
        if t.get("values"):
            parts.append(f"{t['label']}: {', '.join(t['values'])}")
    return "; ".join(parts) if parts else ""


def _format_traits_detail(char: dict, trait_defs: dict) -> str:
    """Traits with descriptions from trait_defs."""
    sections = []
    for t in char.get("traits", []):
        values = t.get("values", [])
        if not values:
            continue
        label = t["label"]
        if len(values) == 1:
            # Single value: inline
            desc = _trait_desc(values[0], trait_defs)
            line = f"{label}: {values[0]}"
            if desc:
                line += f" — {desc}"
            sections.append(line)
        else:
            # Multiple: list
            lines = [f"{label}:"]
            for v in values:
                desc = _trait_desc(v, trait_defs)
                entry = f"  {v}"
                if desc:
                    entry += f" — {desc}"
                lines.append(entry)
            sections.append("\n".join(lines))
    return "\n".join(sections) if sections else ""


def _trait_desc(trait_name: str, trait_defs: dict) -> str:
    """Find trait description by display name."""
    for td in trait_defs.values():
        if td.get("name") == trait_name:
            return td.get("description", "")
    return ""


def _format_abilities(char: dict) -> str:
    parts = []
    for a in char.get("abilities", []):
        parts.append(f"{a['label']}: {a['grade']}({a['exp']})")
    return ", ".join(parts) if parts else ""


def _format_experiences(char: dict, game_state: Any = None) -> str:
    exps = char.get("experiences", [])
    if not exps:
        return ""
    unit = _pl(game_state, PL.EXP_UNIT) if game_state else "次"
    parts = []
    for e in exps:
        count = e.get("count", 0)
        if count > 0:
            parts.append(f"{e['label']}: {count}{unit}")
    return ", ".join(parts) if parts else ""


def _format_clothing(char: dict, game_state: Any = None) -> str:
    """Simple clothing list."""
    slots = char.get("clothing", [])
    worn = [s for s in slots if s.get("itemName") and s.get("state") in (ClothingState.WORN, ClothingState.HALF_WORN)]
    if not worn:
        return _pl(game_state, PL.NONE) if game_state else "无"
    parts = []
    for s in worn:
        parts.append(f"{s['slotLabel']}: {s['itemName']}")
    return ", ".join(parts)


def _format_clothing_detail(char: dict, clothing_defs: dict, game_state: Any = None) -> str:
    """Clothing with state, description, effects, occlusion."""
    slots = char.get("clothing", [])
    worn = [s for s in slots if s.get("itemName") and s.get("state") in (ClothingState.WORN, ClothingState.HALF_WORN)]
    if not worn:
        return _pl(game_state, PL.NONE) if game_state else "无"
    lines = []
    for s in worn:
        worn_label = _pl(game_state, PL.WORN) if game_state else "穿着"
        half_label = _pl(game_state, PL.HALF_WORN) if game_state else "半脱"
        occ_label = _pl(game_state, PL.OCCLUDED) if game_state else "遮挡"
        state_str = f"({worn_label})" if s["state"] == ClothingState.WORN else f"({half_label})"
        occ_str = f"({occ_label})" if s.get("occluded") else ""
        line = f"{s['slotLabel']}: {s['itemName']}{state_str}{occ_str}"
        # Add description and effects from clothing_defs
        item_id = s.get("itemId", "")
        cdef = clothing_defs.get(item_id, {})
        desc = cdef.get("description", "")
        if desc:
            line += f" — {desc}"
        effects = _format_effects(cdef.get("effects", []))
        if effects:
            line += f" [{effects}]"
        lines.append(line)
    return "\n".join(lines)


def _format_effects(effects: list) -> str:
    """Format trait/clothing effects as compact string."""
    parts = []
    for e in effects:
        target = e.get("target", "")
        effect = e.get("effect", EffectDirection.INCREASE)
        mag_type = e.get("magnitudeType", MagnitudeType.FIXED)
        value = e.get("value", 0)
        sign = "+" if effect == EffectDirection.INCREASE else "-"
        suffix = "%" if mag_type == MagnitudeType.PERCENTAGE else ""
        parts.append(f"{target}{sign}{value}{suffix}")
    return ", ".join(parts) if parts else ""


def _format_outfit(char: dict, game_state: Any) -> str:
    """Current outfit preset name."""
    char_data = _get_char_data_for(char, game_state)
    if not char_data:
        return ""
    current = char_data.get("currentOutfit", "default")
    if current == "default":
        return _pl(game_state, PL.DEFAULT_OUTFIT)
    for ot in getattr(game_state, "outfit_types", []):
        if ot.get("id") == current:
            return ot.get("name", current)
    return current


def _format_inventory(char: dict) -> str:
    items = char.get("inventory", [])
    if not items:
        return ""
    parts = []
    for it in items:
        s = it["name"]
        if it.get("amount", 1) > 1:
            s += f" x{it['amount']}"
        parts.append(s)
    return ", ".join(parts)


def _format_inventory_detail(char: dict, item_defs: dict) -> str:
    """Inventory with item descriptions."""
    items = char.get("inventory", [])
    if not items:
        return ""
    lines = []
    for it in items:
        s = it["name"]
        if it.get("amount", 1) > 1:
            s += f" x{it['amount']}"
        idef = item_defs.get(it.get("itemId", ""), {})
        desc = idef.get("description", "")
        if desc:
            s += f" — {desc}"
        lines.append(s)
    return "\n".join(lines)


def _format_favorability(char: dict) -> str:
    favs = char.get("favorability", [])
    if not favs:
        return ""
    return ", ".join(f"{f['name']}: {f['value']}" for f in favs)


def _format_char_variables(char: dict, game_state: Any) -> str:
    """Character-level custom variables."""
    char_data = _get_char_data_for(char, game_state)
    if not char_data:
        return ""
    char_vars = char_data.get("variables", {})
    if not char_vars:
        return ""
    var_defs = getattr(game_state, "variable_defs", {})
    parts = []
    for var_id, value in char_vars.items():
        vdef = var_defs.get(var_id, {})
        name = vdef.get("name", var_id)
        parts.append(f"{name}: {value}")
    return ", ".join(parts) if parts else ""


def _get_char_data_for(char: dict, game_state: Any) -> Optional[dict]:
    """Get raw character_data for a display character."""
    char_id = char.get("id", "")
    return game_state.character_data.get(char_id)


def _format_char_full(char: dict, game_state: Any) -> str:
    """Complete character summary."""
    sections = []
    name = _format_name(char)
    if name:
        sections.append(f"【{name}】")

    money = _format_money(char)
    if money and money != "0":
        sections.append(f"{_pl(game_state, PL.MONEY)}: {money}")

    res = _format_resources(char)
    if res:
        sections.append(res)

    traits = _format_traits_names(char)
    if traits:
        sections.append(f"{_pl(game_state, PL.TRAITS)}: {traits}")

    abilities = _format_abilities(char)
    if abilities:
        sections.append(f"{_pl(game_state, PL.ABILITIES)}: {abilities}")

    experiences = _format_experiences(char, game_state)
    if experiences:
        sections.append(f"{_pl(game_state, PL.EXPERIENCES)}: {experiences}")

    clothing = _format_clothing(char, game_state)
    none_label = _pl(game_state, PL.NONE)
    if clothing and clothing != none_label:
        sections.append(f"{_pl(game_state, PL.CLOTHING)}: {clothing}")

    inv = _format_inventory(char)
    if inv:
        sections.append(f"{_pl(game_state, PL.INVENTORY)}: {inv}")

    fav = _format_favorability(char)
    if fav:
        sections.append(f"{_pl(game_state, PL.FAVORABILITY)}: {fav}")

    char_vars = _format_char_variables(char, game_state)
    if char_vars:
        sections.append(f"{_pl(game_state, PL.VARIABLES)}: {char_vars}")

    return "\n".join(sections)


def _format_char_llm(char: dict) -> str:
    """All LLM description fields combined."""
    llm = char.get("llm", {})
    if not llm:
        return ""
    lines = []
    for key, val in llm.items():
        if val:
            lines.append(f"{key}: {val}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Format functions — scene & environment
# ---------------------------------------------------------------------------


def _get_cell_info(game_state: Any, map_id: str, cell_id: int) -> dict:
    """Get cell dict from map data."""
    m = game_state.maps.get(map_id, {})
    return m.get("cell_index", {}).get(cell_id, {})


def _get_cell_name(game_state: Any, map_id: str, cell_id: int) -> str:
    cell = _get_cell_info(game_state, map_id, cell_id)
    return cell.get("name", str(cell_id))


def _get_cell_description(game_state: Any, map_id: str, cell_id: int) -> str:
    cell = _get_cell_info(game_state, map_id, cell_id)
    return cell.get("description", "")


def _get_map_name(game_state: Any, map_id: str) -> str:
    return game_state.maps.get(map_id, {}).get("name", map_id)


def _get_map_description(game_state: Any, map_id: str) -> str:
    return game_state.maps.get(map_id, {}).get("description", "")


def _format_location_neighbors(game_state: Any, map_id: str, cell_id: int) -> str:
    """Names of adjacent cells."""
    cell = _get_cell_info(game_state, map_id, cell_id)
    connections = cell.get("connections", [])
    names = []
    for conn in connections:
        target_map = conn.get("targetMap", map_id)
        target_cell = conn.get("targetCell")
        if target_cell is not None:
            names.append(_get_cell_name(game_state, target_map, target_cell))
    return ", ".join(names) if names else ""


def _format_npcs_here(game_state: Any, map_id: str, cell_id: int, player_id: str) -> str:
    """NPCs at the same cell with their current activity."""
    parts = []
    for cid, c in game_state.characters.items():
        if cid == player_id or c.get("isPlayer"):
            continue
        pos = c.get("position", {})
        if pos.get("mapId") == map_id and pos.get("cellId") == cell_id:
            name = _format_name(c)
            activity = game_state.npc_activities.get(cid, _pl(game_state, PL.IDLE))
            parts.append(f"{name}: {activity}")
    return "\n".join(parts) if parts else ""


def _format_npcs_nearby(game_state: Any, player_id: str) -> str:
    """NPCs within sense range with location and activity."""
    sense = getattr(game_state, "sense_matrix", {})
    player = game_state.characters.get(player_id, {})
    player_pos = player.get("position", {})
    player_key = (player_pos.get("mapId", ""), player_pos.get("cellId", 0))
    parts = []
    for cid, c in game_state.characters.items():
        if cid == player_id or c.get("isPlayer"):
            continue
        pos = c.get("position", {})
        npc_key = (pos.get("mapId", ""), pos.get("cellId", 0))
        # Check sense_matrix
        dist = sense.get(player_key, {}).get(npc_key)
        if dist is None:
            continue
        name = _format_name(c)
        cell_name = _get_cell_name(game_state, pos.get("mapId", ""), pos.get("cellId", 0))
        activity = game_state.npc_activities.get(cid, _pl(game_state, PL.IDLE))
        parts.append(f"[{cell_name}] {name}: {activity}")
    return "\n".join(parts) if parts else ""


def _format_world_vars(game_state: Any) -> str:
    """All world variables with names and values."""
    wv = getattr(game_state, "world_variables", {})
    if not wv:
        return ""
    wv_defs = getattr(game_state, "world_variable_defs", {})
    parts = []
    for var_id, value in wv.items():
        vdef = wv_defs.get(var_id, {})
        name = vdef.get("name", var_id)
        parts.append(f"{name}: {value}")
    return ", ".join(parts) if parts else ""


# ---------------------------------------------------------------------------
# Format functions — history (dynamic / parameterized)
# ---------------------------------------------------------------------------


def _format_recent_actions(game_state: Any, count: int = 5) -> str:
    """Recent player actions from action_log."""
    log = getattr(game_state, "action_log", [])
    recent = log[-count:] if count < len(log) else log
    if not recent:
        return ""
    lines = []
    for entry in recent:
        action_name = entry.get("actionName", entry.get("actionId", ""))
        msg = entry.get("message", "")
        # Compact: first line of message only
        first_line = msg.split("\n")[0] if msg else ""
        if action_name and first_line:
            lines.append(f"{action_name} — {first_line}")
        elif first_line:
            lines.append(first_line)
    return "\n".join(lines) if lines else ""


def _format_recent_npc_activity(game_state: Any, player_id: str, count: int = 10) -> str:
    """Recent NPC activity within sense range from npc_full_log."""
    log = getattr(game_state, "npc_full_log", [])
    sense = getattr(game_state, "sense_matrix", {})
    player = game_state.characters.get(player_id, {})
    player_pos = player.get("position", {})
    player_key = (player_pos.get("mapId", ""), player_pos.get("cellId", 0))

    # Filter by sense range
    visible = []
    for entry in reversed(log):
        npc_key = (entry.get("mapId", ""), entry.get("cellId", 0))
        if sense.get(player_key, {}).get(npc_key) is not None:
            visible.append(entry)
            if len(visible) >= count:
                break

    visible.reverse()
    if not visible:
        return ""
    lines = []
    for entry in visible:
        npc_id = entry.get("npcId", "")
        npc = game_state.characters.get(npc_id, {})
        name = _format_name(npc) or npc_id
        text = entry.get("text", "")
        lines.append(f"{name}: {text}")
    return "\n".join(lines) if lines else ""


def _format_previous_narrative(previous_narratives: list, count: int = 1) -> str:
    """Previous LLM narrative outputs (passed from frontend)."""
    if not previous_narratives:
        return ""
    recent = previous_narratives[-count:] if count < len(previous_narratives) else previous_narratives
    return "\n---\n".join(recent)


# ---------------------------------------------------------------------------
# Lorebook
# ---------------------------------------------------------------------------


def _format_lorebook(game_state: Any, variables: dict[str, str]) -> str:
    """Match lorebook entries by keyword against current context, return combined content."""
    lorebook_defs = getattr(game_state, "lorebook_defs", {})
    if not lorebook_defs:
        return ""

    # Build scan text from already-collected variables
    scan_parts = [
        variables.get("rawOutput", ""),
        variables.get("player.name", ""),
        variables.get("target.name", ""),
        variables.get("location", ""),
        variables.get("mapName", ""),
    ]
    scan_text = "\n".join(scan_parts).lower()

    matched = []
    for entry in lorebook_defs.values():
        if not entry.get("enabled", True):
            continue
        mode = entry.get("insertMode", LorebookMode.KEYWORD)
        if mode == LorebookMode.ALWAYS:
            matched.append(entry)
        elif mode == LorebookMode.KEYWORD:
            keywords = entry.get("keywords", [])
            if any(kw.lower() in scan_text for kw in keywords if kw):
                matched.append(entry)

    if not matched:
        return ""

    matched.sort(key=lambda e: e.get("priority", 0), reverse=True)
    return "\n---\n".join(e.get("content", "") for e in matched if e.get("content"))


# ---------------------------------------------------------------------------
# Variable collection — main entry point
# ---------------------------------------------------------------------------


def _collect_char_variables(
    prefix: str,
    char: Optional[dict],
    game_state: Any,
) -> dict[str, str]:
    """Collect all variables for a character (player or target)."""
    if not char:
        keys = [
            "",
            ".name",
            ".money",
            ".resources",
            ".traits",
            ".traits.names",
            ".abilities",
            ".experiences",
            ".clothing",
            ".clothing.detail",
            ".outfit",
            ".inventory",
            ".inventory.detail",
            ".favorability",
            ".variables",
            ".llm",
        ]
        return {f"{prefix}{k}": "" for k in keys}

    trait_defs = getattr(game_state, "trait_defs", {})
    item_defs = getattr(game_state, "item_defs", {})
    clothing_defs = getattr(game_state, "clothing_defs", {})

    result = {
        f"{prefix}": _format_char_full(char, game_state),
        f"{prefix}.name": _format_name(char),
        f"{prefix}.money": _format_money(char),
        f"{prefix}.resources": _format_resources(char),
        f"{prefix}.traits": _format_traits_detail(char, trait_defs),
        f"{prefix}.traits.names": _format_traits_names(char),
        f"{prefix}.abilities": _format_abilities(char),
        f"{prefix}.experiences": _format_experiences(char, game_state),
        f"{prefix}.clothing": _format_clothing(char, game_state),
        f"{prefix}.clothing.detail": _format_clothing_detail(char, clothing_defs, game_state),
        f"{prefix}.outfit": _format_outfit(char, game_state),
        f"{prefix}.inventory": _format_inventory(char),
        f"{prefix}.inventory.detail": _format_inventory_detail(char, item_defs),
        f"{prefix}.favorability": _format_favorability(char),
        f"{prefix}.variables": _format_char_variables(char, game_state),
        f"{prefix}.llm": _format_char_llm(char),
    }

    # Individual llm fields: player.llm.personality, target.llm.appearance, etc.
    llm = char.get("llm", {})
    for key, val in llm.items():
        result[f"{prefix}.llm.{key}"] = str(val) if val else ""

    return result


def collect_variables(
    game_state: Any,
    raw_output: str,
    target_id: Optional[str] = None,
    action_def: Optional[dict] = None,
) -> dict[str, str]:
    """Collect all static template variables for prompt interpolation."""
    variables: dict[str, str] = {"rawOutput": raw_output}

    # Player
    player = _get_player_char(game_state)
    player_id = _get_player_id(game_state)
    variables.update(_collect_char_variables("player", player, game_state))

    # Target
    target = game_state.characters.get(target_id) if target_id else None
    variables.update(_collect_char_variables("target", target, game_state))

    # Location & map
    if player:
        pos = player.get("position", {})
        mid = pos.get("mapId", "")
        cid = pos.get("cellId", -1)
        variables["location"] = _get_cell_name(game_state, mid, cid)
        variables["location.description"] = _get_cell_description(game_state, mid, cid)
        variables["location.neighbors"] = _format_location_neighbors(game_state, mid, cid)
        variables["mapName"] = _get_map_name(game_state, mid)
        variables["mapName.description"] = _get_map_description(game_state, mid)
        variables["npcsHere"] = _format_npcs_here(game_state, mid, cid, player_id)
        variables["npcsNearby"] = _format_npcs_nearby(game_state, player_id)
    else:
        for k in [
            "location",
            "location.description",
            "location.neighbors",
            "mapName",
            "mapName.description",
            "npcsHere",
            "npcsNearby",
        ]:
            variables[k] = ""

    # Time & weather
    td = game_state.time.to_dict()
    variables["time"] = td.get("displayText", "")
    weather = td.get("weatherName", "")
    icon = td.get("weatherIcon", "")
    variables["weather"] = f"{icon} {weather}" if icon else weather

    # Action context
    if action_def:
        variables["action.name"] = action_def.get("name", "")
        variables["action.description"] = action_def.get("description", "")
        variables["action.category"] = action_def.get("category", "")
    else:
        variables["action.name"] = ""
        variables["action.description"] = ""
        variables["action.category"] = ""

    # World variables
    variables["worldVars"] = _format_world_vars(game_state)
    wv = getattr(game_state, "world_variables", {})
    for var_id, value in wv.items():
        variables[f"worldVar.{var_id}"] = str(value)

    # Lorebook — keyword-triggered entries
    variables["lorebook"] = _format_lorebook(game_state, variables)

    # Backward-compatible aliases
    variables["playerName"] = variables["player.name"]
    variables["playerInfo"] = variables["player"]
    variables["clothingState"] = variables["player.clothing"]
    variables["targetName"] = variables["target.name"]
    variables["targetInfo"] = variables["target"]

    return variables


# ---------------------------------------------------------------------------
# Parameterized variable parsing & dynamic resolution
# ---------------------------------------------------------------------------


def _parse_var(raw: str) -> tuple[str, dict[str, str]]:
    """Parse 'recentActions:count=10:format=brief' → ('recentActions', {'count':'10','format':'brief'})."""
    parts = raw.split(":")
    name = parts[0]
    params: dict[str, str] = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k] = v
    return name, params


def _resolve_dynamic(
    name: str,
    params: dict[str, str],
    game_state: Any,
    context: dict,
) -> Optional[str]:
    """Resolve parameterized/dynamic variables. Returns None if not recognized."""
    player_id = _get_player_id(game_state)

    if name == "recentActions":
        count = int(params.get("count", "5"))
        return _format_recent_actions(game_state, count)
    if name == "recentNpcActivity":
        count = int(params.get("count", "10"))
        return _format_recent_npc_activity(game_state, player_id, count)
    if name == "previousNarrative":
        count = int(params.get("count", "1"))
        narratives = context.get("previousNarratives", [])
        return _format_previous_narrative(narratives, count)

    return None


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------

_VAR_REGEX = re.compile(r"\{\{([\w.]+(?::[\w.=]+)*)\}\}")


def _interpolate(
    content: str,
    variables: dict[str, str],
    game_state: Any,
    context: dict,
) -> str:
    """Replace {{varName}} and {{varName:key=val}} placeholders with values."""

    def replacer(m: re.Match) -> str:
        raw = m.group(1)
        name, params = _parse_var(raw)
        # Static variables (pre-collected)
        if name in variables and not params:
            return variables[name]
        # Dynamic / parameterized variables
        result = _resolve_dynamic(name, params, game_state, context)
        if result is not None:
            return result
        # Unknown — keep original
        return m.group(0)

    return _VAR_REGEX.sub(replacer, content)


def assemble_messages(
    preset: dict,
    variables: dict[str, str],
    game_state: Any,
    context: Optional[dict] = None,
) -> list[dict[str, str]]:
    """Build the chat messages list from preset prompt entries + variables."""
    ctx = context or {}
    entries = preset.get("promptEntries", [])
    enabled = [e for e in entries if e.get("enabled", True)]
    enabled.sort(key=lambda e: e.get("position", 0))

    messages: list[dict[str, str]] = []
    for entry in enabled:
        role = entry.get("role", "user")
        content = _interpolate(entry.get("content", ""), variables, game_state, ctx)
        if not content and role == "assistant":
            continue
        messages.append({"role": role, "content": content})

    post = preset.get("postProcessing") or preset.get("api", {}).get("postProcessing", "mergeConsecutiveSameRole")
    if post == "mergeConsecutiveSameRole":
        messages = _merge_consecutive(messages)

    return messages


def _merge_consecutive(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Merge adjacent messages with the same role."""
    if not messages:
        return messages
    merged: list[dict[str, str]] = [messages[0].copy()]
    for msg in messages[1:]:
        if msg["role"] == merged[-1]["role"]:
            merged[-1]["content"] += "\n\n" + msg["content"]
        else:
            merged.append(msg.copy())
    return merged


# ---------------------------------------------------------------------------
# Preset resolution
# ---------------------------------------------------------------------------


def resolve_preset_id(
    game_state: Any,
    action_def: Optional[dict] = None,
) -> Optional[str]:
    """Resolve which preset to use: action → world → global. Returns None if none set."""
    if action_def and action_def.get("llmPreset"):
        return action_def["llmPreset"]
    world_preset = getattr(game_state, "llm_preset", None)
    if world_preset:
        return world_preset
    try:
        from pathlib import Path

        cfg_path = Path(__file__).resolve().parent.parent.parent / "config.json"
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        gp = cfg.get("defaultLlmPreset", "")
        if gp:
            return gp
    except (OSError, json.JSONDecodeError):
        pass
    return None


# ---------------------------------------------------------------------------
# Raw output assembly
# ---------------------------------------------------------------------------


def build_raw_output(action_result: dict) -> str:
    """Build the {{rawOutput}} string from an action execution result."""
    parts: list[str] = []
    msg = action_result.get("message", "")
    if msg:
        parts.append(msg)
    effects = action_result.get("effectsSummary", [])
    if effects:
        parts.append("\n".join(effects))
    npc_log = action_result.get("npcLog", [])
    if npc_log:
        parts.append("\n".join(npc_log))
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# LLM API call
# ---------------------------------------------------------------------------


async def call_llm_streaming(
    api_config: dict,
    messages: list[dict[str, str]],
    tools: Optional[list[dict]] = None,
):
    """Call LLM API with streaming. Yields (event_type, data_dict) tuples.

    When *tools* is provided the payload includes a ``tools`` array and the
    streaming parser will accumulate ``delta.tool_calls`` fragments.  If the
    model decides to call one or more tools instead of (or in addition to)
    producing text, an extra ``("tool_calls", [...])`` event is yielded
    **before** the final ``llm_done``.
    """
    base_url = api_config.get("baseUrl", "").rstrip("/")
    api_key = api_config.get("apiKey", "")
    model = api_config.get("model", "")
    params = api_config.get("parameters", {})
    streaming = api_config.get("streaming", True)

    url = base_url + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "stream": streaming,
    }
    if tools:
        payload["tools"] = tools
    if params.get("temperature") is not None:
        payload["temperature"] = params["temperature"]
    if params.get("maxTokens"):
        payload["max_tokens"] = params["maxTokens"]
    if params.get("topP") is not None:
        payload["top_p"] = params["topP"]
    if params.get("frequencyPenalty"):
        payload["frequency_penalty"] = params["frequencyPenalty"]
    if params.get("presencePenalty"):
        payload["presence_penalty"] = params["presencePenalty"]

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            if streaming:
                full_text = ""
                usage = None
                # tool_calls accumulator: {index: {id, function: {name, arguments}}}
                tc_acc: dict[int, dict] = {}
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        yield (
                            "llm_error",
                            {
                                "error": "LLM_API_ERROR",
                                "detail": f"HTTP {resp.status_code}: {body.decode('utf-8', errors='replace')[:500]}",
                            },
                        )
                        return
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        if chunk.get("usage"):
                            usage = chunk["usage"]
                        choice = chunk.get("choices", [{}])[0]
                        delta = choice.get("delta", {})

                        # --- text content ---
                        text_part = delta.get("content", "")
                        if text_part:
                            full_text += text_part
                            yield ("llm_chunk", {"text": text_part})

                        # --- tool_calls (streamed in fragments) ---
                        for tc_delta in delta.get("tool_calls", []):
                            idx = tc_delta.get("index", 0)
                            if idx not in tc_acc:
                                tc_acc[idx] = {
                                    "id": tc_delta.get("id", ""),
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""},
                                }
                            acc = tc_acc[idx]
                            if tc_delta.get("id"):
                                acc["id"] = tc_delta["id"]
                            fn = tc_delta.get("function", {})
                            if fn.get("name"):
                                acc["function"]["name"] += fn["name"]
                            if fn.get("arguments"):
                                acc["function"]["arguments"] += fn["arguments"]

                # Yield accumulated tool_calls (if any) before llm_done
                if tc_acc:
                    yield ("tool_calls", [tc_acc[i] for i in sorted(tc_acc)])
                done_data: dict[str, Any] = {"fullText": full_text}
                if usage:
                    done_data["usage"] = usage
                yield ("llm_done", done_data)
            else:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code != 200:
                    yield (
                        "llm_error",
                        {
                            "error": "LLM_API_ERROR",
                            "detail": f"HTTP {resp.status_code}: {resp.text[:500]}",
                        },
                    )
                    return
                body = resp.json()
                msg = body.get("choices", [{}])[0].get("message", {})
                text = msg.get("content", "") or ""
                done_data: dict[str, Any] = {"fullText": text}
                if body.get("usage"):
                    done_data["usage"] = body["usage"]
                # Non-streaming: tool_calls arrive in a single message
                if msg.get("tool_calls"):
                    yield ("tool_calls", msg["tool_calls"])
                yield ("llm_done", done_data)
    except httpx.ConnectError:
        yield ("llm_error", {"error": "LLM_CONNECTION_FAILED", "detail": ""})
    except httpx.TimeoutException:
        yield ("llm_error", {"error": "LLM_CONNECTION_TIMEOUT", "detail": ""})
    except Exception as e:
        yield ("llm_error", {"error": "LLM_CONNECTION_FAILED", "detail": str(e)})
