"""ID namespace utilities: namespacing, resolution, and stripping of entity IDs."""

from __future__ import annotations

from typing import Optional

from ..constants import ConditionType, EffectType

# Symbolic references in action conditions/effects — must NOT be namespaced
SYMBOLIC_REFS = {"self", "{{targetId}}", "{{player}}", ""}

NS_SEP = "."  # namespace separator: addonId.localId


def validate_local_id(local_id: str) -> str | None:
    """Validate a local ID. Returns error code if invalid, None if OK."""
    if not local_id:
        return "ID_EMPTY"
    if NS_SEP in local_id:
        return "ID_CONTAINS_SEPARATOR"
    return None


def namespace_id(addon_id: str, local_id: str) -> str:
    """Create a namespaced ID: 'addon_id.local_id'."""
    if NS_SEP in local_id:
        return local_id  # already namespaced
    return f"{addon_id}{NS_SEP}{local_id}"


def to_local_id(namespaced_id: str) -> str:
    """Extract local ID from 'addon_id.local_id'."""
    if NS_SEP in namespaced_id:
        return namespaced_id.split(NS_SEP, 1)[1]
    return namespaced_id


def get_addon_from_id(namespaced_id: str) -> str:
    """Extract addon ID from 'addon_id.local_id'. Returns '' if not namespaced."""
    if NS_SEP in namespaced_id:
        return namespaced_id.split(NS_SEP, 1)[0]
    return ""


def resolve_ref(ref_id: str, defs: dict, default_addon: str = "") -> str:
    """Resolve a bare or namespaced entity reference against loaded defs.

    - Already namespaced ('addon.id') → return as-is
    - Bare ID → try default_addon first, then search all defs
    """
    if not ref_id or NS_SEP in ref_id:
        return ref_id
    # Try default addon first
    if default_addon:
        candidate = f"{default_addon}{NS_SEP}{ref_id}"
        if candidate in defs:
            return candidate
    # Search all defs for matching local ID
    for key in defs:
        if key.split(NS_SEP, 1)[1] == ref_id:
            return key
    # Not found — use default addon prefix (will fail on lookup, which is OK)
    return f"{default_addon}{NS_SEP}{ref_id}" if default_addon else ref_id


def _strip_internal_fields(entry: dict) -> dict:
    """Remove internal fields (_local_id, source) for file storage."""
    return {k: v for k, v in entry.items() if k not in ("source", "_local_id")}


def _strip_ref(ref: str, addon_id: str) -> str:
    """Strip namespace from a reference, keeping cross-addon prefixes.

    Same-addon refs → bare ID; cross-addon refs → keep namespace.
    """
    if not ref or ref in SYMBOLIC_REFS or NS_SEP not in ref:
        return ref
    prefix, local = ref.split(NS_SEP, 1)
    if not addon_id or prefix == addon_id:
        return local
    return ref


def _strip_action_refs(action: dict, addon_id: str = "") -> None:
    """Strip namespace prefixes from action cross-references for file storage.

    Same-addon refs are stripped to bare IDs; cross-addon refs keep namespace.
    """
    for cond in action.get("conditions", []):
        for field in ("mapId", "traitId", "itemId", "npcId", "targetId"):
            if cond.get(field):
                cond[field] = _strip_ref(cond[field], addon_id)
    for cost in action.get("costs", []):
        if cost.get("itemId"):
            cost["itemId"] = _strip_ref(cost["itemId"], addon_id)
    for outcome in action.get("outcomes", []):
        for eff in outcome.get("effects", []):
            for field in ("traitId", "itemId", "target", "favFrom", "favTo", "mapId"):
                if eff.get(field):
                    eff[field] = _strip_ref(eff[field], addon_id)


def namespace_action_refs(
    action_defs: dict[str, dict],
    trait_defs: dict[str, dict],
    item_defs: dict[str, dict],
    clothing_defs: dict[str, dict],
    character_defs: dict[str, dict],
    map_defs: dict[str, dict],
) -> None:
    """Namespace cross-references in action definitions in-place."""
    for action in action_defs.values():
        addon_id = action.get("source", "")
        namespace_single_action(action, addon_id, trait_defs, item_defs, clothing_defs, character_defs, map_defs)


def namespace_single_action(
    action: dict,
    default_addon: str,
    trait_defs: dict,
    item_defs: dict,
    clothing_defs: dict,
    character_defs: dict,
    map_defs: dict,
) -> None:
    """Namespace cross-references in a single action/event definition in-place."""
    for cond in action.get("conditions", []):
        _ns_cond(cond, trait_defs, item_defs, character_defs, default_addon, map_defs)
    for cost in action.get("costs", []):
        if cost.get("itemId") and cost["itemId"] not in SYMBOLIC_REFS:
            cost["itemId"] = resolve_ref(cost["itemId"], item_defs, default_addon)
    for outcome in action.get("outcomes", []):
        for eff in outcome.get("effects", []):
            _ns_eff(eff, trait_defs, item_defs, clothing_defs, character_defs, map_defs, default_addon)
        for mod in outcome.get("weightModifiers", []):
            _ns_modifier_key(mod, trait_defs, default_addon)
    # Event effects (top-level, not in outcomes)
    for eff in action.get("effects", []):
        _ns_eff(eff, trait_defs, item_defs, clothing_defs, character_defs, map_defs, default_addon)
    # NPC weight modifiers
    for mod in action.get("npcWeightModifiers", []):
        _ns_modifier_key(mod, trait_defs, default_addon)


def _ns_cond(
    cond: dict,
    trait_defs: dict,
    item_defs: dict,
    character_defs: dict,
    default_addon: str,
    map_defs: Optional[dict] = None,
) -> None:
    """Namespace references in a single action condition."""
    if cond.get("mapId") and cond["mapId"] not in SYMBOLIC_REFS and map_defs is not None:
        cond["mapId"] = resolve_ref(cond["mapId"], map_defs, default_addon)
    if cond.get("traitId") and cond["traitId"] not in SYMBOLIC_REFS:
        cond["traitId"] = resolve_ref(cond["traitId"], trait_defs, default_addon)
    if cond.get("itemId") and cond["itemId"] not in SYMBOLIC_REFS:
        cond["itemId"] = resolve_ref(cond["itemId"], item_defs, default_addon)
    if cond.get("npcId") and cond["npcId"] not in SYMBOLIC_REFS:
        cond["npcId"] = resolve_ref(cond["npcId"], character_defs, default_addon)
    if cond.get("targetId") and cond["targetId"] not in SYMBOLIC_REFS:
        cond["targetId"] = resolve_ref(cond["targetId"], character_defs, default_addon)
    # ability/experience key = trait ID, needs namespacing
    ctype = cond.get("type", "")
    if ctype in (ConditionType.ABILITY, ConditionType.EXPERIENCE) and cond.get("key"):
        if cond["key"] not in SYMBOLIC_REFS and NS_SEP not in cond["key"]:
            cond["key"] = resolve_ref(cond["key"], trait_defs, default_addon)


def _ns_eff(
    eff: dict,
    trait_defs: dict,
    item_defs: dict,
    clothing_defs: dict,
    character_defs: dict,
    map_defs: dict,
    default_addon: str,
) -> None:
    """Namespace references in a single action effect."""
    if eff.get("traitId") and eff["traitId"] not in SYMBOLIC_REFS:
        eff["traitId"] = resolve_ref(eff["traitId"], trait_defs, default_addon)
    if eff.get("itemId") and eff["itemId"] not in SYMBOLIC_REFS:
        # outfit effects reference clothing defs, not item defs
        defs = clothing_defs if eff.get("type") == EffectType.OUTFIT else item_defs
        eff["itemId"] = resolve_ref(eff["itemId"], defs, default_addon)
    target = eff.get("target", "")
    if target and target not in SYMBOLIC_REFS:
        eff["target"] = resolve_ref(target, character_defs, default_addon)
    if eff.get("favFrom") and eff["favFrom"] not in SYMBOLIC_REFS:
        eff["favFrom"] = resolve_ref(eff["favFrom"], character_defs, default_addon)
    if eff.get("favTo") and eff["favTo"] not in SYMBOLIC_REFS:
        eff["favTo"] = resolve_ref(eff["favTo"], character_defs, default_addon)
    if eff.get("mapId") and eff["mapId"] not in SYMBOLIC_REFS:
        eff["mapId"] = resolve_ref(eff["mapId"], map_defs, default_addon)
    # ability/experience key = trait ID, needs namespacing
    etype = eff.get("type", "")
    if etype in (EffectType.ABILITY, EffectType.EXPERIENCE) and eff.get("key"):
        if eff["key"] not in SYMBOLIC_REFS and NS_SEP not in eff["key"]:
            eff["key"] = resolve_ref(eff["key"], trait_defs, default_addon)


def _ns_modifier_key(mod: dict, trait_defs: dict, default_addon: str) -> None:
    """Namespace ability/experience key in a weight modifier."""
    mtype = mod.get("type", "")
    if mtype in (EffectType.ABILITY, EffectType.EXPERIENCE) and mod.get("key"):
        if mod["key"] not in SYMBOLIC_REFS and NS_SEP not in mod["key"]:
            mod["key"] = resolve_ref(mod["key"], trait_defs, default_addon)


def namespace_character_data(
    char_data: dict,
    trait_defs: dict[str, dict],
    item_defs: dict[str, dict],
    clothing_defs: dict[str, dict],
    character_defs: dict[str, dict],
    map_defs: dict[str, dict],
) -> None:
    """Namespace all cross-references in character data in-place."""
    default_addon = char_data.get("_source", "")

    for key in list(char_data.get("traits", {}).keys()):
        char_data["traits"][key] = [resolve_ref(tid, trait_defs, default_addon) for tid in char_data["traits"][key]]

    for slot, data in char_data.get("clothing", {}).items():
        if isinstance(data, dict) and data.get("itemId"):
            data["itemId"] = resolve_ref(data["itemId"], clothing_defs, default_addon)

    for outfit_key, outfit in char_data.get("outfits", {}).items():
        for slot, items in outfit.items():
            outfit[slot] = [resolve_ref(item_id, clothing_defs, default_addon) for item_id in items if item_id]

    for inv in char_data.get("inventory", []):
        if inv.get("itemId"):
            inv["itemId"] = resolve_ref(inv["itemId"], item_defs, default_addon)

    if isinstance(char_data.get("favorability"), dict):
        new_fav = {}
        for target_id, value in char_data["favorability"].items():
            ns_tid = resolve_ref(target_id, character_defs, default_addon)
            new_fav[ns_tid] = value
        char_data["favorability"] = new_fav

    if isinstance(char_data.get("abilities"), dict):
        new_abs = {}
        for key, value in char_data["abilities"].items():
            ns_key = resolve_ref(key, trait_defs, default_addon)
            new_abs[ns_key] = value
        char_data["abilities"] = new_abs

    if isinstance(char_data.get("experiences"), dict):
        new_exps = {}
        for key, value in char_data["experiences"].items():
            ns_key = resolve_ref(key, trait_defs, default_addon)
            new_exps[ns_key] = value
        char_data["experiences"] = new_exps

    if char_data.get("position", {}).get("mapId"):
        char_data["position"]["mapId"] = resolve_ref(char_data["position"]["mapId"], map_defs, default_addon)
    if char_data.get("restPosition", {}).get("mapId"):
        char_data["restPosition"]["mapId"] = resolve_ref(char_data["restPosition"]["mapId"], map_defs, default_addon)


def strip_character_namespaces(char_data: dict, addon_id: str = "") -> dict:
    """Strip namespace prefixes from character data for file storage."""
    s = lambda ref: _strip_ref(ref, addon_id)
    result = {**char_data}

    if "traits" in result:
        result["traits"] = {k: [s(tid) for tid in v] for k, v in result["traits"].items()}

    if "clothing" in result:
        new_cl = {}
        for slot, data in result["clothing"].items():
            if isinstance(data, dict) and data.get("itemId"):
                new_cl[slot] = {**data, "itemId": s(data["itemId"])}
            else:
                new_cl[slot] = data
        result["clothing"] = new_cl

    if "outfits" in result:
        new_outfits = {}
        for outfit_key, outfit in result["outfits"].items():
            new_outfits[outfit_key] = {
                slot: [s(item_id) for item_id in items if item_id] for slot, items in outfit.items()
            }
        result["outfits"] = new_outfits

    if "inventory" in result:
        result["inventory"] = [
            {**inv, "itemId": s(inv["itemId"])} if inv.get("itemId") else inv for inv in result["inventory"]
        ]

    if isinstance(result.get("favorability"), dict):
        result["favorability"] = {s(k): v for k, v in result["favorability"].items()}

    if isinstance(result.get("abilities"), dict):
        result["abilities"] = {s(k): v for k, v in result["abilities"].items()}

    if isinstance(result.get("experiences"), dict):
        result["experiences"] = {s(k): v for k, v in result["experiences"].items()}

    if result.get("position", {}).get("mapId"):
        result["position"] = {**result["position"], "mapId": s(result["position"]["mapId"])}
    if result.get("restPosition", {}).get("mapId"):
        result["restPosition"] = {**result["restPosition"], "mapId": s(result["restPosition"]["mapId"])}

    return result
