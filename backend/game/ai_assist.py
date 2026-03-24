"""AI Assist Agent — tool definitions, context collection, message assembly.

This module provides the Agent infrastructure for AI-assisted entity creation.
The Agent has access to a small set of tools (list/get_schema/create) and
operates within the context of the current game state.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from game.character.namespace import namespace_id
from game.state import GameState

# ---------------------------------------------------------------------------
# Entity schema registry
# ---------------------------------------------------------------------------
# Each schema describes an entity type for the LLM: required/optional fields,
# human-readable descriptions, and a concrete example.  The LLM sees this when
# it calls the get_schema tool or when context is injected into the system
# prompt.

ENTITY_SCHEMAS: dict[str, dict[str, Any]] = {
    "item": {
        "description": "物品定义 — 角色可持有、交易、使用的物品",
        "required": {
            "id": "英文标识符，下划线命名（如 iron_sword）",
            "name": "显示名称",
        },
        "optional": {
            "tags": "标签数组（字符串列表）",
            "description": "物品描述文本",
            "maxStack": "最大堆叠数（默认 1）",
            "sellable": "是否可出售（布尔值，默认 false）",
            "price": "出售价格（数字，默认 0）",
        },
        "example": {
            "id": "iron_sword",
            "name": "铁剑",
            "tags": ["weapon", "melee"],
            "description": "一把普通的铁制长剑，刀刃略有锈迹。",
            "maxStack": 1,
            "sellable": True,
            "price": 50,
        },
    },
    "trait": {
        "description": "特质定义 — 角色的性格、能力、经历等属性",
        "required": {
            "id": "英文标识符，下划线命名（如 brave）",
            "name": "显示名称",
            "category": "分类 key（见上下文中的可用值列表）",
        },
        "optional": {
            "description": "特质描述文本",
            "effects": "效果数组：[{target, effect, magnitudeType, value}]",
            "defaultValue": "初始值（仅 ability 类型用，默认 0）",
            "decay": "数值回落（仅 ability 类型）：{amount, type: fixed|percentage, intervalMinutes}，默认 null",
        },
        "example": {
            "id": "brave",
            "name": "勇敢",
            "category": "mentalTrait",
            "description": "面对危险时不退缩。",
        },
    },
    "clothing": {
        "description": "服装定义 — 角色可穿戴的服装/装备",
        "required": {
            "id": "英文标识符，下划线命名（如 leather_armor）",
            "name": "显示名称",
            "slots": '占用槽位数组（如 ["upperBody"]）',
        },
        "optional": {
            "occlusion": "遮挡的槽位数组（穿上后隐藏这些槽位的服装）",
            "effects": "效果数组：[{target, effect, magnitudeType, value}]",
        },
        "available_slots": [
            "mainHand",
            "offHand",
            "hat",
            "upperBody",
            "upperUnderwear",
            "lowerBody",
            "lowerUnderwear",
            "hands",
            "feet",
            "shoes",
            "back",
            "accessory1",
            "accessory2",
            "accessory3",
        ],
        "example": {
            "id": "leather_armor",
            "name": "皮甲",
            "slots": ["upperBody"],
            "occlusion": ["upperUnderwear"],
        },
    },
    "traitGroup": {
        "description": "特质组 — 将特质分组，可设置互斥（同组只能拥有一个）",
        "required": {
            "id": "英文标识符，下划线命名（如 gender）",
            "name": "显示名称",
            "category": "所属分类 key（必须与组内特质的 category 一致）",
        },
        "optional": {
            "traits": '特质 ID 数组（完整 ID，如 ["Base.male", "Base.female"]）',
            "exclusive": "是否互斥（布尔值，默认 false）— 互斥组中角色只能拥有一个特质",
        },
        "example": {
            "id": "gender",
            "name": "性别",
            "category": "race",
            "traits": ["Base.male", "Base.female"],
            "exclusive": True,
        },
    },
    "variable": {
        "description": "变量定义 — 可被特质/服装的 effects 引用的数值变量（只读，不可通过 AI 创建）",
        "required": {},
        "optional": {},
    },
    "outfitType": {
        "description": "服装预设类型 — 定义角色可切换的服装套装预设",
        "required": {
            "id": "英文标识符（如 combat、casual）",
            "name": "显示名称",
        },
        "optional": {
            "description": "预设描述",
            "copyDefault": "是否从默认服装复制初始值（布尔值，默认 true）",
            "slots": "各槽位预设服装：{slotName: [clothingId, ...]}",
        },
        "example": {
            "id": "combat",
            "name": "战斗装",
            "copyDefault": True,
            "slots": {"mainHand": ["iron_sword"], "upperBody": ["leather_armor"]},
        },
    },
    "lorebook": {
        "description": "知识库条目 — LLM 叙事生成时注入的背景知识",
        "required": {
            "id": "英文标识符",
            "name": "显示名称",
            "keywords": '触发关键词数组（如 ["酒馆", "tavern"]）',
            "content": "注入 LLM 的文本内容（背景设定描述）",
        },
        "optional": {
            "enabled": "是否启用（布尔值，默认 true）",
            "priority": "排序优先级（数字，默认 0，越大越靠前）",
            "insertMode": "插入模式：keyword（关键词匹配时插入）或 always（始终插入），默认 keyword",
        },
        "example": {
            "id": "red_dragon_inn",
            "name": "红龙酒馆",
            "keywords": ["酒馆", "红龙", "tavern"],
            "content": "红龙酒馆是镇上最热闹的场所，由退役冒险者经营。二楼有住宿，地下室传说通向古代遗迹。",
            "enabled": True,
            "priority": 0,
            "insertMode": "keyword",
        },
    },
    "worldVariable": {
        "description": "世界变量 — 全局数值/布尔状态（如天气、声望、剧情标记）",
        "required": {
            "id": "英文标识符，下划线命名（如 reputation）",
            "name": "显示名称",
            "type": "变量类型：number 或 boolean",
            "default": "初始值（number 类型为数字，boolean 类型用 0 或 1）",
        },
        "optional": {
            "description": "变量描述文本",
        },
        "example": {
            "id": "reputation",
            "name": "声望",
            "type": "number",
            "default": 0,
            "description": "玩家在镇上的声望值",
        },
    },
}

# Entity types that AI can create/update (subset of ENTITY_SCHEMAS)
WRITABLE_ENTITY_TYPES = [
    "item",
    "trait",
    "clothing",
    "traitGroup",
    "outfitType",
    "lorebook",
    "worldVariable",
]

# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function calling format)
# ---------------------------------------------------------------------------
# These are sent as the `tools` parameter in the LLM API request.  The LLM
# reads the name + description + parameter schema to decide when and how to
# call each tool.

ASSIST_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_entities",
            "description": "查询已有实体列表。可用 filter 按字段过滤（如 category）",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": list(ENTITY_SCHEMAS.keys()),
                        "description": "实体类型",
                    },
                    "filter": {
                        "type": "object",
                        "description": '可选过滤条件（如 {"category": "mentalTrait"}）',
                    },
                },
                "required": ["entityType"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_schema",
            "description": "获取实体类型的字段说明、示例和可用枚举值",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": list(ENTITY_SCHEMAS.keys()),
                        "description": "实体类型",
                    },
                },
                "required": ["entityType"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_entities",
            "description": "批量获取实体的完整数据（含 effects、defaultValue 等所有字段）。用于查看实体详情。",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": list(ENTITY_SCHEMAS.keys()),
                        "description": "实体类型",
                    },
                    "entityIds": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": '要获取的实体完整 ID 数组（如 ["Base.brave", "Base.strong"]）',
                    },
                },
                "required": ["entityType", "entityIds"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_entity",
            "description": "创建一个新的实体。id 使用英文下划线命名，不含命名空间前缀。",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": WRITABLE_ENTITY_TYPES,
                        "description": "实体类型",
                    },
                    "entity": {
                        "type": "object",
                        "description": "实体数据（JSON 对象，至少包含 id 和 name）",
                    },
                },
                "required": ["entityType", "entity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "batch_create",
            "description": "批量创建多个实体。用于一次创建 2 个以上的实体。",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": WRITABLE_ENTITY_TYPES,
                        "description": "实体类型",
                    },
                    "entities": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "实体数组，每个至少包含 id 和 name",
                    },
                },
                "required": ["entityType", "entities"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_entity",
            "description": "修改已有实体。只传要改的字段。entityId 用完整ID（如 Base.koakuma）",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": WRITABLE_ENTITY_TYPES,
                        "description": "实体类型",
                    },
                    "entityId": {
                        "type": "string",
                        "description": "要修改的实体完整 ID（如 Base.koakuma）",
                    },
                    "fields": {
                        "type": "object",
                        "description": '要修改的字段（如 {"name": "新名称", "description": "新描述"}）',
                    },
                },
                "required": ["entityType", "entityId", "fields"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "batch_update",
            "description": "批量修改多个已有实体。用于一次修改 2 个以上的实体。",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": WRITABLE_ENTITY_TYPES,
                        "description": "实体类型",
                    },
                    "updates": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "entityId": {
                                    "type": "string",
                                    "description": "要修改的实体完整 ID",
                                },
                                "fields": {
                                    "type": "object",
                                    "description": "要修改的字段",
                                },
                            },
                            "required": ["entityId", "fields"],
                        },
                        "description": "修改列表，每项包含 entityId 和 fields",
                    },
                },
                "required": ["entityType", "updates"],
            },
        },
    },
]

# Map tool name → safety level: "read" (auto-execute) or "write" (needs confirm)
TOOL_SAFETY: dict[str, str] = {
    "list_entities": "read",
    "get_schema": "read",
    "get_entities": "read",
    "create_entity": "write",
    "batch_create": "write",
    "update_entity": "write",
    "batch_update": "write",
}


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------


def _get_defs(gs: GameState, entity_type: str) -> dict[str, dict]:
    """Get the definitions dict for an entity type from GameState."""
    mapping = {
        "item": gs.item_defs,
        "trait": gs.trait_defs,
        "clothing": gs.clothing_defs,
        "traitGroup": gs.trait_groups,
        "variable": gs.variable_defs,
        "outfitType": {t["id"]: t for t in gs.outfit_types if isinstance(t, dict)},
        "lorebook": gs.lorebook_defs,
        "worldVariable": gs.world_variable_defs,
    }
    return mapping.get(entity_type, {})


def _summarize_entity(entity_type: str, entity: dict) -> dict[str, Any]:
    """Create a compact summary of an entity for LLM context."""
    summary: dict[str, Any] = {"id": entity.get("id", ""), "name": entity.get("name", "")}
    if entity_type == "trait":
        summary["category"] = entity.get("category", "")
        effects = entity.get("effects", [])
        if effects:
            summary["effectCount"] = len(effects)
        dv = entity.get("defaultValue")
        if dv is not None:
            summary["defaultValue"] = dv
    elif entity_type == "clothing":
        summary["slots"] = entity.get("slots", [])
        effects = entity.get("effects", [])
        if effects:
            summary["effectCount"] = len(effects)
    elif entity_type == "traitGroup":
        summary["category"] = entity.get("category", "")
        summary["exclusive"] = entity.get("exclusive", False)
        summary["traitCount"] = len(entity.get("traits", []))
    elif entity_type == "item":
        tags = entity.get("tags")
        if tags:
            summary["tags"] = tags
    elif entity_type == "outfitType":
        summary["copyDefault"] = entity.get("copyDefault", True)
        slots = entity.get("slots", {})
        if slots:
            summary["slotCount"] = len(slots)
    elif entity_type == "lorebook":
        summary["keywords"] = entity.get("keywords", [])
        summary["insertMode"] = entity.get("insertMode", "keyword")
        summary["enabled"] = entity.get("enabled", True)
    elif entity_type == "worldVariable":
        summary["type"] = entity.get("type", "number")
        summary["default"] = entity.get("default", 0)
    return summary


def _match_filter(entity: dict, filter_: dict) -> bool:
    """Check if an entity matches all filter conditions.

    - String values: substring match (case-insensitive)
    - Array fields: checks if filter value is contained in the array
    - Other types: exact match
    """
    for key, expected in filter_.items():
        actual = entity.get(key)
        if actual is None:
            return False
        if isinstance(actual, str) and isinstance(expected, str):
            if expected.lower() not in actual.lower():
                return False
        elif isinstance(actual, list) and isinstance(expected, str):
            if expected not in actual:
                return False
        elif actual != expected:
            return False
    return True


_INTERNAL_KEYS = {"_local_id", "source", "_source"}


def execute_tool_get_entities(gs: GameState, entity_type: str, entity_ids: list[str]) -> str:
    """Execute get_entities tool — returns full data for requested entities."""
    defs = _get_defs(gs, entity_type)
    results = []
    for eid in entity_ids:
        entity = defs.get(eid)
        if entity:
            clean = {k: v for k, v in entity.items() if k not in _INTERNAL_KEYS}
            results.append(clean)
        else:
            results.append({"id": eid, "_error": "not found"})
    return json.dumps(results, ensure_ascii=False)


def execute_tool_list_entities(gs: GameState, entity_type: str, filter_: Optional[dict] = None) -> str:
    """Execute list_entities tool — returns JSON string of entity summaries.

    If filter_ is provided, only entities matching all filter fields are returned.
    E.g. filter_={"category": "mentalTrait"} returns only mental traits.
    """
    defs = _get_defs(gs, entity_type)
    entities = defs.values()
    if filter_:
        entities = [e for e in entities if _match_filter(e, filter_)]
    summaries = [_summarize_entity(entity_type, e) for e in entities]
    return json.dumps(summaries, ensure_ascii=False)


_AI_DOCS_DIR = Path(__file__).resolve().parent.parent / "data" / "ai_docs"


def execute_tool_get_schema(entity_type: str, gs: Optional[GameState] = None) -> str:
    """Execute get_schema tool — returns doc file content + dynamic enum values."""
    if entity_type not in ENTITY_SCHEMAS:
        return json.dumps({"error": f"Unknown entity type: {entity_type}"})

    # Read the markdown doc file
    doc_path = _AI_DOCS_DIR / f"{entity_type}.md"
    if doc_path.exists():
        content = doc_path.read_text(encoding="utf-8")
    else:
        # Fallback to schema dict
        content = json.dumps(ENTITY_SCHEMAS[entity_type], ensure_ascii=False)

    # Append dynamic enum values from template
    if gs:
        template = getattr(gs, "template", {})
        if entity_type == "trait":
            trait_cats = template.get("traits", [])
            if trait_cats:
                cat_list = "\n".join(f"- `{c['key']}` — {c.get('label', '')}" for c in trait_cats)
                content += f"\n\n## 当前系统的 category 可用值\n\n{cat_list}"
        elif entity_type in ("clothing", "outfitType"):
            slots = template.get("clothingSlots", [])
            if slots:
                content += f"\n\n## 当前系统的槽位可用值\n\n{', '.join(slots)}"

        # For trait/clothing: show available effect targets with value range info
        if entity_type in ("trait", "clothing"):
            target_lines: list[str] = []

            # Resources (affect max value)
            for field in template.get("resources", []):
                key = field.get("key", "")
                label = field.get("label", key)
                default_max = field.get("defaultMax", 0)
                target_lines.append(f"- `{key}` — {label}（资源，影响上限，默认 {default_max}）")

            # Ability traits (exp system, 1000 per grade)
            if gs.trait_defs:
                ability_ids = sorted(tid for tid, t in gs.trait_defs.items() if t.get("category") == "ability")
                if ability_ids:
                    ids_str = ", ".join(f"`{a}`" for a in ability_ids)
                    target_lines.append(f"- 能力特质（经验值，每 1000 = 1 级 G→S）：{ids_str}")

            # BasicInfo number fields
            for field in template.get("basicInfo", []):
                if field.get("type") == "number" and field.get("key"):
                    key = field["key"]
                    label = field.get("label", key)
                    default_val = field.get("defaultValue", 0)
                    target_lines.append(f"- `{key}` — {label}（数值，默认 {default_val}）")

            # Variables
            if gs.variable_defs:
                var_ids = sorted(gs.variable_defs.keys())
                target_lines.append(f"- 变量：{', '.join(f'`{v}`' for v in var_ids)}")

            if target_lines:
                content += "\n\n## effects.target 可用值\n\n" + "\n".join(target_lines)

    return content


def execute_tool_create_entity(gs: GameState, entity_type: str, entity_data: dict) -> dict[str, Any]:
    """Execute create_entity tool — validates and creates an entity.

    Returns a result dict: {success: bool, error?: str, entity?: dict}
    This is called AFTER user confirmation (write operation).
    """
    # Validate required fields
    schema = ENTITY_SCHEMAS.get(entity_type)
    if not schema:
        return {"success": False, "error": f"Unknown entity type: {entity_type}"}

    for field in schema["required"]:
        if not entity_data.get(field):
            return {"success": False, "error": f"Missing required field: {field}"}

    # Validate field values against game state (template enums, etc.)
    val_error = _validate_field_values(gs, entity_type, entity_data)
    if val_error:
        return {"success": False, "error": val_error}

    raw_id = entity_data.get("id", "")

    # Validate ID format (no dots, no spaces)
    if "." in raw_id:
        return {"success": False, "error": "ID must not contain '.': use underscores instead"}
    if " " in raw_id:
        return {"success": False, "error": "ID must not contain spaces: use underscores instead"}

    # Determine target addon (use the first enabled addon as source)
    source = _resolve_source_addon(gs)
    if not source:
        return {"success": False, "error": "No addon available for creating entities"}

    # outfitType: stored as list, no namespacing
    if entity_type == "outfitType":
        if any(t.get("id") == raw_id for t in gs.outfit_types if isinstance(t, dict)):
            return {"success": False, "error": f"Entity '{raw_id}' already exists"}
        defaults = ENTITY_DEFAULTS.get(entity_type, {})
        entry = {**defaults, **entity_data}
        gs.outfit_types.append(entry)
        gs.dirty = True
        return {"success": True, "entity": _summarize_entity(entity_type, entry)}

    # Namespace the ID
    eid = namespace_id(source, raw_id)

    # Check duplicates
    defs = _get_defs(gs, entity_type)
    if eid in defs:
        return {"success": False, "error": f"Entity '{raw_id}' already exists"}

    # Apply default values for fields the LLM might omit
    defaults = ENTITY_DEFAULTS.get(entity_type, {})
    entry = {**defaults, **entity_data, "id": eid, "_local_id": raw_id, "source": source}

    # Store in GameState
    defs[eid] = entry

    # Post-create hooks for specific entity types
    if entity_type == "worldVariable":
        gs.world_variables[eid] = entry.get("default", 0)

    # Mark dirty so changes will be persisted on save
    gs.dirty = True

    return {"success": True, "entity": _summarize_entity(entity_type, entry)}


def execute_tool_batch_create(gs: GameState, entity_type: str, entities_data: list[dict]) -> dict[str, Any]:
    """Execute batch_create tool — create multiple entities at once.

    Returns {created: [...summaries], errors: [...messages]}.
    Called AFTER user confirmation.
    """
    created = []
    errors = []
    for i, entity_data in enumerate(entities_data):
        result = execute_tool_create_entity(gs, entity_type, entity_data)
        if result.get("success"):
            created.append(result["entity"])
        else:
            label = entity_data.get("id", f"#{i}")
            errors.append(f"{label}: {result.get('error', 'unknown')}")
    return {"created": created, "errors": errors, "total": len(created)}


def execute_tool_update_entity(gs: GameState, entity_type: str, entity_id: str, fields: dict) -> dict[str, Any]:
    """Execute update_entity tool — validates and updates fields on an existing entity.

    Only the provided fields are updated; others remain unchanged.
    Returns a result dict: {success: bool, error?: str, entity?: dict}
    """
    # outfitType: find in list by id
    if entity_type == "outfitType":
        fields.pop("id", None)
        val_error = _validate_field_values(gs, entity_type, fields)
        if val_error:
            return {"success": False, "error": val_error}
        for t in gs.outfit_types:
            if isinstance(t, dict) and t.get("id") == entity_id:
                t.update(fields)
                gs.dirty = True
                return {"success": True, "entity": _summarize_entity(entity_type, t)}
        return {"success": False, "error": f"Entity '{entity_id}' not found"}

    defs = _get_defs(gs, entity_type)
    if entity_id not in defs:
        return {"success": False, "error": f"Entity '{entity_id}' not found"}

    # Don't allow changing id or source
    fields.pop("id", None)
    fields.pop("_local_id", None)
    fields.pop("source", None)

    # Validate field values
    val_error = _validate_field_values(gs, entity_type, fields)
    if val_error:
        return {"success": False, "error": val_error}

    # Merge fields into existing entity
    existing = defs[entity_id]
    existing.update(fields)

    gs.dirty = True

    return {"success": True, "entity": _summarize_entity(entity_type, existing)}


def execute_tool_batch_update(gs: GameState, entity_type: str, updates: list[dict]) -> dict[str, Any]:
    """Execute batch_update tool — update multiple entities at once.

    Returns {updated: [...summaries], errors: [...messages]}.
    Called AFTER user confirmation.
    """
    updated = []
    errors = []
    for i, item in enumerate(updates):
        entity_id = item.get("entityId", "")
        fields = item.get("fields", {})
        result = execute_tool_update_entity(gs, entity_type, entity_id, fields)
        if result.get("success"):
            updated.append(result["entity"])
        else:
            label = entity_id or f"#{i}"
            errors.append(f"{label}: {result.get('error', 'unknown')}")
    return {"updated": updated, "errors": errors, "total": len(updated)}


# Reference validation rules — data-driven, not hardcoded per entity type.
# Each rule: (field_path, resolver) where resolver(gs) → set of valid values.
# field_path supports: "field" (top-level) and "field[].subfield" (array elements).
_REF_RULES: list[tuple[str, str, Any]] = [
    # (entity_type, field_path, resolver)
    # resolver is a callable(gs) → set[str], or a string key for template lookup
    ("trait", "category", "template.traits[].key"),
    ("clothing", "slots[]", "template.clothingSlots"),
    ("clothing", "occlusion[]", "template.clothingSlots"),
    ("trait", "effects[].target", "effect_targets"),
    ("clothing", "effects[].target", "effect_targets"),
    ("traitGroup", "category", "template.traits[].key"),
    ("traitGroup", "traits[]", "trait_defs"),
    ("lorebook", "insertMode", "static:keyword,always"),
    ("worldVariable", "type", "static:number,boolean"),
]


def _resolve_valid_values(gs: GameState, resolver: str) -> set[str]:
    """Resolve a set of valid values from game state using a resolver string."""
    # Static enum: "static:val1,val2,..."
    if resolver.startswith("static:"):
        return set(resolver[7:].split(","))

    template = getattr(gs, "template", {})

    if resolver == "variable_defs":
        return set(gs.variable_defs.keys()) if gs.variable_defs else set()
    if resolver == "trait_defs":
        return set(gs.trait_defs.keys()) if gs.trait_defs else set()
    if resolver == "effect_targets":
        # effects.target can reference: variables, ability traits, resources, or basicInfo number fields
        targets: set[str] = set()
        if gs.variable_defs:
            targets.update(gs.variable_defs.keys())
        if gs.trait_defs:
            targets.update(tid for tid, t in gs.trait_defs.items() if t.get("category") == "ability")
        for field in template.get("resources", []):
            if field.get("key"):
                targets.add(field["key"])
        for field in template.get("basicInfo", []):
            if field.get("type") == "number" and field.get("key"):
                targets.add(field["key"])
        return targets
    if resolver == "template.clothingSlots":
        return set(template.get("clothingSlots", []))
    if resolver == "template.traits[].key":
        return {c["key"] for c in template.get("traits", [])}
    return set()


def _validate_field_values(gs: GameState, entity_type: str, data: dict) -> Optional[str]:
    """Validate field values against game state using reference rules."""
    for rule_type, field_path, resolver in _REF_RULES:
        if rule_type != entity_type:
            continue

        valid = _resolve_valid_values(gs, resolver)
        if not valid:
            continue

        # Parse field path: "field", "field[]", "field[].subfield"
        parts = field_path.split("[]")
        top_field = parts[0]
        sub_field = parts[1].lstrip(".") if len(parts) > 1 else ""

        value = data.get(top_field)
        if value is None:
            continue

        if sub_field:
            # Array of objects: check each element's subfield
            if isinstance(value, list):
                for i, item in enumerate(value):
                    if isinstance(item, dict):
                        v = item.get(sub_field, "")
                        if v and v not in valid:
                            hint = ", ".join(list(valid)[:10])
                            return f"{top_field}[{i}].{sub_field} '{v}' is invalid. Valid: {hint}"
        elif isinstance(value, list):
            # Array of strings: check each element
            invalid = [v for v in value if v not in valid]
            if invalid:
                hint = ", ".join(list(valid)[:10])
                return f"{top_field} contains invalid values: {invalid}. Valid: {hint}"
        elif isinstance(value, str):
            # Single string value
            if value not in valid:
                hint = ", ".join(sorted(valid))
                return f"{top_field} '{value}' is invalid. Valid: {hint}"

    return None


def _resolve_source_addon(gs: GameState) -> str:
    """Determine which addon to create entities in.

    Uses the first addon from the world's addon list (the primary/writable addon).
    """
    if gs.addon_refs:
        first = gs.addon_refs[0]
        addon_id = first.get("id", "")
        if addon_id:
            return addon_id
    return ""


def execute_tool(gs: GameState, tool_name: str, arguments: dict) -> str:
    """Dispatch a tool call to the appropriate handler. Returns result as string."""
    entity_type = arguments.get("entityType", "")

    if tool_name == "list_entities":
        filter_ = arguments.get("filter")
        return execute_tool_list_entities(gs, entity_type, filter_)

    if tool_name == "get_schema":
        return execute_tool_get_schema(entity_type, gs)

    if tool_name == "get_entities":
        entity_ids = arguments.get("entityIds", [])
        return execute_tool_get_entities(gs, entity_type, entity_ids)

    if tool_name == "create_entity":
        entity_data = arguments.get("entity", {})
        result = execute_tool_create_entity(gs, entity_type, entity_data)
        return json.dumps(result, ensure_ascii=False)

    if tool_name == "batch_create":
        entities_data = arguments.get("entities", [])
        result = execute_tool_batch_create(gs, entity_type, entities_data)
        return json.dumps(result, ensure_ascii=False)

    if tool_name == "update_entity":
        entity_id = arguments.get("entityId", "")
        fields = arguments.get("fields", {})
        result = execute_tool_update_entity(gs, entity_type, entity_id, fields)
        return json.dumps(result, ensure_ascii=False)

    if tool_name == "batch_update":
        updates = arguments.get("updates", [])
        result = execute_tool_batch_update(gs, entity_type, updates)
        return json.dumps(result, ensure_ascii=False)

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


# ---------------------------------------------------------------------------
# Context collection
# ---------------------------------------------------------------------------


def collect_assist_context(gs: GameState) -> str:
    """Build brief context for the system prompt.

    Provides a high-level summary of available entity types and counts.
    AI uses tools (list_entities, get_schema) for details as needed.
    """
    parts: list[str] = []

    parts.append("## 可操作的实体类型")
    for etype, schema in ENTITY_SCHEMAS.items():
        defs = _get_defs(gs, etype)
        parts.append(f"- **{etype}**：{schema['description']}（已有 {len(defs)} 个）")

    parts.append("\n使用 get_schema 工具查看各类型的字段详情和可用枚举值。")
    parts.append("使用 list_entities 工具查看已有实体列表。")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Message assembly
# ---------------------------------------------------------------------------

# Default field values for each entity type — ensures editors don't crash on missing fields
ENTITY_DEFAULTS: dict[str, dict[str, Any]] = {
    "item": {"tags": [], "description": "", "maxStack": 1, "sellable": False, "price": 0},
    "trait": {"description": "", "effects": [], "decay": None},
    "clothing": {"occlusion": [], "effects": []},
    "traitGroup": {"traits": [], "exclusive": False},
    "outfitType": {"description": "", "copyDefault": True, "slots": {}},
    "lorebook": {
        "keywords": [],
        "content": "",
        "enabled": True,
        "priority": 0,
        "insertMode": "keyword",
    },
    "worldVariable": {"description": "", "type": "number", "default": 0},
}

DEFAULT_ASSIST_PROMPT = """\
你是一个游戏内容创作助手。帮助用户创建和编辑游戏实体（物品、特质、服装等）。

## 行为规范
- 严格按照用户请求的数量创建实体，不多不少
- 创建完用户请求的所有实体后，用文字总结结果，然后停下来等待用户的下一步指示
- 不要在用户没有要求的情况下主动创建额外的实体
- 修改已有实体时使用 update_entity 工具，创建新实体时使用 create_entity 工具
- 批量修改多个实体时使用 batch_update 工具（一次修改 2 个以上），批量创建用 batch_create
- id 使用英文下划线命名（如 iron_sword），name 和 description 用中文
- 创建前可以先用 list_entities 查看已有实体，避免重复
- 修改前先用 list_entities + filter 筛选目标实体（如 {"category": "ability"}），不要获取全部再手动挑选
- 需要查看实体的完整数据（如 effects 详情）时，用 get_entities 获取
- 如果不确定字段格式或可用值，先用 get_schema 查看完整文档
- 不要重复调用相同参数的工具，之前的结果已在对话历史中"""

BUILTIN_CONTEXT_ENTRY_ID = "__assist_context__"


def build_assist_messages(
    preset: dict,
    context_text: str,
    history: list[dict],
    user_message: str,
) -> list[dict]:
    """Assemble the full messages array for the LLM API call.

    Structure:
    1. Preset promptEntries (sorted by position, with builtin context injected)
    2. Conversation history
    3. New user message
    """
    messages: list[dict] = []

    # 1. Process preset promptEntries
    entries = sorted(
        (e for e in preset.get("promptEntries", []) if e.get("enabled", True)),
        key=lambda e: e.get("position", 0),
    )
    for entry in entries:
        role = entry.get("role", "system")
        if entry.get("id") == BUILTIN_CONTEXT_ENTRY_ID:
            # Builtin context entry — replace content with dynamic context
            content = context_text
        else:
            content = entry.get("content", "")
        if content:
            messages.append({"role": role, "content": content})

    # If no entries at all, provide a minimal system prompt (overview doc + behavior rules)
    if not messages:
        overview_path = _AI_DOCS_DIR / "overview.md"
        overview = overview_path.read_text(encoding="utf-8") if overview_path.exists() else DEFAULT_ASSIST_PROMPT
        messages.append(
            {
                "role": "system",
                "content": overview + "\n\n" + context_text,
            }
        )

    # 2. Conversation history (user / assistant / tool messages)
    messages.extend(history)

    # 3. New user message
    messages.append({"role": "user", "content": user_message})

    return messages
