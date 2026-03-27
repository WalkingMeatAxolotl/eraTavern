"""AI Assist Agent — tool definitions, context collection, message assembly.

This module provides the Agent infrastructure for AI-assisted entity creation.
The Agent has access to a small set of tools (list/get_schema/create) and
operates within the context of the current game state.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

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
    "character": {
        "description": "角色定义 — 游戏中的 NPC 或玩家角色",
        "required": {
            "id": "英文标识符，下划线命名（如 shopkeeper）",
            "name": "角色显示名（同时写入 basicInfo.name）",
        },
        "optional": {
            "active": "是否参与游戏（布尔值，默认 true）",
            "isPlayer": "是否玩家角色（布尔值，默认 false）",
            "portrait": "立绘文件名",
            "traits": '特质分配：{category: [traitId, ...]}（如 {"race": ["human"], "mentalTrait": ["brave"]}）',
            "clothing": "穿戴服装：{slot: {itemId, state}}（state: worn/half_worn/off）",
            "inventory": "背包物品：[{itemId, amount}]",
            "abilities": "能力经验值：{abilityTraitId: expValue}（每 1000 = 1 级）",
            "position": "当前位置：{mapId, cellId}",
            "restPosition": "休息位置：{mapId, cellId}",
            "favorability": "好感度：{charId: value}（-100 ~ 100）",
            "llm": "LLM 人格描述：{personality: 文本}",
        },
        "example": {
            "id": "shopkeeper",
            "name": "杂货店老板",
            "active": True,
            "isPlayer": False,
            "traits": {"race": ["human"], "mentalTrait": ["brave"]},
            "clothing": {"upperBody": {"itemId": "cotton_shirt", "state": "worn"}},
            "inventory": [{"itemId": "health_potion", "amount": 3}],
            "position": {"mapId": "town", "cellId": 1},
            "llm": {"personality": "热情的杂货店老板，喜欢和冒险者聊天。"},
        },
    },
    "action": {
        "description": "行动定义 — 玩家/NPC 可执行的行动（战斗、交易、对话等）",
        "required": {
            "id": "英文标识符，下划线命名（如 buy_ale）",
            "name": "显示名称",
        },
        "optional": {
            "category": "行动分类名称",
            "description": "行动描述文本",
            "targetType": "目标类型：none（无目标）或 npc（需要NPC目标），默认 none",
            "triggerLLM": "是否触发 LLM 叙事（布尔值，默认 false）",
            "timeCost": "耗时（分钟，默认 10）",
            "npcWeight": "NPC 自主选择权重（默认 0 = NPC 不选此行动）",
            "conditions": "前置条件数组",
            "costs": "消耗数组",
            "outcomes": "结果数组（至少一个）",
        },
        "modes": ["simple", "template", "ir"],
        "example": "使用 get_schema('action') 查看完整文档和模板/IR 语法",
    },
    "event": {
        "description": "事件定义 — 条件触发的全局事件（状态变化、剧情推进等）",
        "required": {
            "id": "英文标识符，下划线命名（如 rain_starts）",
            "name": "显示名称",
        },
        "optional": {
            "description": "事件描述文本",
            "enabled": "是否启用（布尔值，默认 true）",
            "targetScope": "目标范围：each_character 或 none，默认 each_character",
            "triggerMode": "触发模式：once / on_change / while，默认 on_change",
            "priority": "执行优先级（数字，默认 0）",
            "cooldown": "冷却时间（分钟，仅 while 模式）",
            "conditions": "触发条件数组",
            "effects": "效果数组（至少一个）",
        },
        "modes": ["simple", "ir"],
        "example": "使用 get_schema('event') 查看完整文档和 IR 语法",
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
    "character",
    "action",
    "event",
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
            "description": "创建一个新的实体。id 使用英文下划线命名。action/event 推荐 mode=template/ir",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": WRITABLE_ENTITY_TYPES,
                        "description": "实体类型",
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["simple", "template", "ir", "clone"],
                        "description": "生成模式。action/event 推荐 template/ir，clone 可用于所有类型",
                    },
                    "payload": {
                        "type": "object",
                        "description": "实体数据（JSON 对象，至少包含 id 和 name）",
                    },
                },
                "required": ["entityType", "payload"],
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
                    "payload": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "实体数组，每个至少包含 id 和 name",
                    },
                },
                "required": ["entityType", "payload"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_entity",
            "description": "修改已有实体。只传要改的字段（数组字段整体替换）。entityId 用完整ID",
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
    {
        "type": "function",
        "function": {
            "name": "submit_plan",
            "description": (
                "提交结构化创建方案。用于复杂任务（多种互引用实体、action/event、8+实体）。"
                "提交后用户可查看、修改或确认方案。确认后再按依赖顺序创建。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "overview": {
                        "type": "string",
                        "description": "设计概述：一段话说明整体构思和角色关系",
                    },
                    "entities": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "entityType": {
                                    "type": "string",
                                    "enum": WRITABLE_ENTITY_TYPES,
                                    "description": "实体类型",
                                },
                                "id": {
                                    "type": "string",
                                    "description": "实体 ID（英文下划线命名）",
                                },
                                "name": {
                                    "type": "string",
                                    "description": "中文显示名称",
                                },
                                "note": {
                                    "type": "string",
                                    "description": "一句话说明用途/关键属性",
                                },
                            },
                            "required": ["entityType", "id", "name"],
                        },
                        "description": "计划创建的实体列表",
                    },
                },
                "required": ["overview", "entities"],
            },
        },
    },
]

# Map tool name → safety level: "read" (auto-execute), "write" (needs confirm), "plan" (special)
TOOL_SAFETY: dict[str, str] = {
    "list_entities": "read",
    "get_schema": "read",
    "get_entities": "read",
    "create_entity": "write",
    "batch_create": "write",
    "update_entity": "write",
    "batch_update": "write",
    "submit_plan": "plan",
}


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------


# Entity type → GameState attribute name
_ENTITY_TYPE_ATTR: dict[str, str] = {
    "item": "item_defs",
    "trait": "trait_defs",
    "clothing": "clothing_defs",
    "traitGroup": "trait_groups",
    "variable": "variable_defs",
    "lorebook": "lorebook_defs",
    "worldVariable": "world_variable_defs",
    "character": "character_data",
    "action": "action_defs",
    "event": "event_defs",
}


def _get_defs(gs: GameState, entity_type: str) -> dict[str, dict]:
    """Get merged (active + staged) definitions for an entity type."""
    if entity_type == "outfitType":
        merged_list = gs.staging.merged_list("outfit_types", gs.outfit_types)
        return {t["id"]: t for t in merged_list if isinstance(t, dict)}
    attr = _ENTITY_TYPE_ATTR.get(entity_type)
    if not attr:
        return {}
    return gs.staging.merged_defs(attr, getattr(gs, attr))


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
    elif entity_type == "character":
        summary["active"] = entity.get("active", True)
        summary["isPlayer"] = entity.get("isPlayer", False)
        pos = entity.get("position")
        if pos:
            summary["position"] = pos
        traits = entity.get("traits", {})
        trait_count = sum(len(v) for v in traits.values() if isinstance(v, list))
        if trait_count:
            summary["traitCount"] = trait_count
    elif entity_type == "action":
        summary["targetType"] = entity.get("targetType", "none")
        summary["outcomeCount"] = len(entity.get("outcomes", []))
        cat = entity.get("category")
        if cat:
            summary["category"] = cat
    elif entity_type == "event":
        summary["triggerMode"] = entity.get("triggerMode", "on_change")
        summary["targetScope"] = entity.get("targetScope", "each_character")
        summary["effectCount"] = len(entity.get("effects", []))
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

            # Variables (derived)
            var_defs = gs.staging.merged_defs("variable_defs", gs.variable_defs)
            if var_defs:
                var_ids = sorted(var_defs.keys())
                target_lines.append(f"- 变量：{', '.join(f'`{v}`' for v in var_ids)}")

            if target_lines:
                content += "\n\n## effects.target 可用值\n\n" + "\n".join(target_lines)

        # Character: inject template info + available references
        if entity_type == "character":
            # Trait categories
            trait_cats = template.get("traits", [])
            if trait_cats:
                cat_list = "\n".join(f"- `{c['key']}` — {c.get('label', '')}" for c in trait_cats)
                content += f"\n\n## traits 可用的 category\n\n{cat_list}"

            # Clothing slots
            slots = template.get("clothingSlots", [])
            if slots:
                content += f"\n\n## clothing 可用的槽位\n\n{', '.join(slots)}"

            # BasicInfo fields
            bi_fields = template.get("basicInfo", [])
            if bi_fields:
                bi_list = "\n".join(
                    f"- `{f['key']}` — {f.get('label', '')}"
                    f"（{f.get('type', 'string')}，默认 {f.get('defaultValue', '')}）"
                    for f in bi_fields
                )
                content += f"\n\n## basicInfo 字段（由模板定义）\n\n{bi_list}"

            # Resources
            res_fields = template.get("resources", [])
            if res_fields:
                res_list = "\n".join(
                    f"- `{f['key']}` — {f.get('label', '')}"
                    f"（默认值 {f.get('defaultValue', 0)}，上限 {f.get('defaultMax', 0)}）"
                    for f in res_fields
                )
                content += f"\n\n## resources 字段（由模板定义）\n\n{res_list}"

            # Available trait/clothing/item/map IDs for reference
            ref_parts: list[str] = []
            if gs.trait_defs:
                for cat_def in trait_cats:
                    cat_key = cat_def.get("key", "")
                    cat_traits = sorted(tid for tid, t in gs.trait_defs.items() if t.get("category") == cat_key)
                    if cat_traits:
                        ref_parts.append(f"- {cat_key}: {', '.join(cat_traits)}")
            if ref_parts:
                content += "\n\n## 已有特质（按 category）\n\n" + "\n".join(ref_parts)

            if gs.clothing_defs:
                clothing_ids = sorted(gs.clothing_defs.keys())[:30]
                content += f"\n\n## 已有服装 ID\n\n{', '.join(clothing_ids)}"

            if gs.item_defs:
                item_ids = sorted(gs.item_defs.keys())[:30]
                content += f"\n\n## 已有物品 ID\n\n{', '.join(item_ids)}"

            if gs.maps:
                map_ids = sorted(gs.maps.keys())
                content += f"\n\n## 已有地图 ID\n\n{', '.join(map_ids)}"
                # Detailed map+cell info is in action/event schema section

        # Action/Event: inject available entity IDs for conditions/effects
        if entity_type in ("action", "event"):
            content += _build_action_ref_info(gs, template)

    return content


def _build_action_ref_info(gs: GameState, template: dict) -> str:
    """Build reference info section for action/event get_schema.

    Uses merged (active + staged) data so AI can reference staged entities.
    """
    s = gs.staging
    parts: list[str] = []

    # Resources
    res_fields = template.get("resources", [])
    if res_fields:
        res_list = ", ".join(f"`{f['key']}`" for f in res_fields if f.get("key"))
        parts.append(f"\n## 可用 resource key\n\n{res_list}")

    # BasicInfo fields (including money)
    bi_fields = template.get("basicInfo", [])
    if bi_fields:
        bi_list = ", ".join(f"`{f['key']}` ({f.get('label', f['key'])})" for f in bi_fields if f.get("key"))
        parts.append(
            f"\n## 可用 basicInfo key（含金钱）\n\n{bi_list}\n\n**注意**：金钱（money）是 basicInfo，不是 resource"
        )

    # Abilities
    trait_defs = s.merged_defs("trait_defs", gs.trait_defs)
    if trait_defs:
        ability_ids = sorted(tid for tid, t in trait_defs.items() if t.get("category") == "ability")
        if ability_ids:
            parts.append(f"\n## 可用 ability key（能力经验值）\n\n{', '.join(f'`{a}`' for a in ability_ids)}")

        # Experiences
        exp_ids = sorted(tid for tid, t in trait_defs.items() if t.get("category") == "experience")
        if exp_ids:
            parts.append(f"\n## 可用 experience key（历史经历计数）\n\n{', '.join(f'`{e}`' for e in exp_ids)}")
        else:
            parts.append(
                "\n## experience（历史经历）\n\n当前无已定义的 experience 特质。不要在效果中使用不存在的 experience key"
            )

    # Items
    item_defs = s.merged_defs("item_defs", gs.item_defs)
    if item_defs:
        item_ids = sorted(item_defs.keys())[:30]
        parts.append(f"\n## 已有物品 ID\n\n{', '.join(item_ids)}")

    # Maps with cell info
    maps = s.merged_defs("maps", gs.maps)
    if maps:
        map_lines: list[str] = []
        for mid in sorted(maps.keys()):
            m = maps[mid]
            cells = m.get("cells", [])
            cell_parts = []
            for c in cells:
                label = c.get("name") or f"#{c['id']}"
                tags = c.get("tags", [])
                tag_str = f" [{','.join(tags)}]" if tags else ""
                cell_parts.append(f"{c['id']}={label}{tag_str}")
            cell_info = f"  cells: {', '.join(cell_parts)}" if cell_parts else ""
            name = m.get("name", mid)
            line = f"- `{mid}` — {name}\n{cell_info}" if cell_info else f"- `{mid}` — {name}"
            map_lines.append(line)
        parts.append("\n## 已有地图\n\n" + "\n".join(map_lines))

    # NPCs
    char_data = s.merged_defs("character_data", gs.character_data)
    if char_data:
        npc_ids = sorted(cid for cid, c in char_data.items() if not c.get("isPlayer"))[:20]
        if npc_ids:
            parts.append(f"\n## 已有 NPC ID\n\n{', '.join(npc_ids)}")

    # Derived variables
    var_defs = s.merged_defs("variable_defs", gs.variable_defs)
    if var_defs:
        var_ids = sorted(var_defs.keys())
        parts.append(f"\n## 已有衍生变量 ID\n\n{', '.join(var_ids)}")

    # World variables
    wvar_defs = s.merged_defs("world_variable_defs", gs.world_variable_defs)
    if wvar_defs:
        wvar_ids = sorted(wvar_defs.keys())
        parts.append(f"\n## 已有世界变量 ID\n\n{', '.join(wvar_ids)}")

    # Trait categories
    trait_cats = template.get("traits", [])
    if trait_cats:
        cat_list = ", ".join(f"`{c['key']}`" for c in trait_cats)
        parts.append(f"\n## 可用 trait category\n\n{cat_list}")

    # Clothing slots
    slots = template.get("clothingSlots", [])
    if slots:
        parts.append(f"\n## 可用 clothing slot\n\n{', '.join(slots)}")

    return "\n".join(parts)


def _apply_patch(obj: dict, patch: dict) -> list[dict[str, Any]]:
    """Apply a patch dict to an object, returning a diff list.

    Patch keys use dot-separated paths with bracket array indices:
      "outcomes[0].effects[0].itemId" → obj["outcomes"][0]["effects"][0]["itemId"]

    Returns list of {path, old, new} diffs.
    """
    import re as _re

    _PATH_TOKEN = _re.compile(r"([^\.\[\]]+)|\[(\d+)\]")

    diffs: list[dict[str, Any]] = []
    for path_str, new_val in patch.items():
        tokens = _PATH_TOKEN.findall(path_str)
        if not tokens:
            continue

        # Navigate to parent
        current: Any = obj
        parsed_keys: list = []
        for name, idx in tokens[:-1]:
            key: Any = name if name else int(idx)
            parsed_keys.append(key)
            try:
                current = current[key]
            except (KeyError, IndexError, TypeError):
                break

        # Apply final key
        last_name, last_idx = tokens[-1]
        final_key: Any = last_name if last_name else int(last_idx)
        try:
            old_val = current[final_key]
        except (KeyError, IndexError, TypeError):
            old_val = None

        try:
            current[final_key] = new_val
        except (KeyError, IndexError, TypeError):
            pass

        if old_val != new_val:
            diffs.append({"path": path_str, "old": old_val, "new": new_val})

    return diffs


def _compile_clone(gs: GameState, entity_type: str, payload: dict) -> tuple[dict, list[str], list[dict[str, Any]]]:
    """Clone an existing entity and apply patches.

    Returns (new_entity, warnings, diffs).
    On error, new_entity has "_compile_error" key.
    """
    import copy

    source_id = payload.get("sourceId", "")
    if not source_id:
        return (
            {"_compile_error": True, "error": "MISSING_SOURCE", "message": "sourceId is required"},
            [],
            [],
        )

    defs = _get_defs(gs, entity_type)
    source = defs.get(source_id)
    if not source:
        return (
            {"_compile_error": True, "error": "SOURCE_NOT_FOUND", "message": f"'{source_id}' not found"},
            [],
            [],
        )

    # Deep copy, strip internal keys
    cloned = copy.deepcopy(source)
    for k in ("_local_id", "source", "_source"):
        cloned.pop(k, None)

    # Override id and name
    new_id = payload.get("id", "")
    new_name = payload.get("name", "")
    if new_id:
        cloned["id"] = new_id
    if new_name:
        cloned["name"] = new_name

    # Apply patch
    patch = payload.get("patch", {})
    diffs = _apply_patch(cloned, patch) if patch else []

    # Add id/name to diffs if changed
    if new_id and new_id != source.get("id", ""):
        diffs.insert(0, {"path": "id", "old": source.get("id", ""), "new": new_id})
    if new_name and new_name != source.get("name", ""):
        diffs.insert(
            1 if diffs else 0,
            {"path": "name", "old": source.get("name", ""), "new": new_name},
        )

    warnings: list[str] = []
    if not diffs:
        warnings.append("Clone produced no changes from source")

    return cloned, warnings, diffs


def _compile_action_payload(entity_type: str, mode: str, payload: dict) -> tuple[dict, list[str]]:
    """Compile template/ir payload into full action/event JSON.

    Returns (compiled_payload, warnings).
    On error, returns ({"_compile_error": ..., ...}, []).
    """
    from game.action.ai_templates import expand_template
    from game.action.ir_compiler import ClauseError, compile_action_ir, compile_event_ir

    try:
        if mode == "template":
            template_name = payload.get("template", "")
            params = payload.get("params", payload)
            # Ensure id/name propagate from top-level
            if "id" not in params and "id" in payload:
                params["id"] = payload["id"]
            if "name" not in params and "name" in payload:
                params["name"] = payload["name"]
            compiled, warnings = expand_template(template_name, params)
            return compiled, warnings
        if mode == "ir":
            if entity_type == "event":
                compiled, warnings = compile_event_ir(payload)
            else:
                compiled, warnings = compile_action_ir(payload)
            return compiled, warnings
    except ClauseError as e:
        return {"_compile_error": True, **e.to_dict()}, []
    except KeyError as e:
        return {"_compile_error": True, "error": "TEMPLATE_NOT_FOUND", "message": str(e)}, []

    return payload, []


def execute_tool(gs: GameState, tool_name: str, arguments: dict) -> str:
    """Dispatch a tool call to the appropriate handler. Returns result as string."""
    from game.ai_assist_handlers import ENTITY_HANDLERS, batch_create, batch_update

    # Extract session-level target addon (injected by routes/llm.py)
    target_addon = arguments.pop("_targetAddon", "")

    entity_type = arguments.get("entityType", "")

    # submit_plan is handled specially by _run_agent_loop — should not reach here
    if tool_name == "submit_plan":
        return json.dumps({"success": True, "status": "plan_submitted"}, ensure_ascii=False)

    if tool_name == "list_entities":
        filter_ = arguments.get("filter")
        return execute_tool_list_entities(gs, entity_type, filter_)

    if tool_name == "get_schema":
        return execute_tool_get_schema(entity_type, gs)

    if tool_name == "get_entities":
        entity_ids = arguments.get("entityIds", [])
        return execute_tool_get_entities(gs, entity_type, entity_ids)

    handler = ENTITY_HANDLERS.get(entity_type)
    if not handler:
        return json.dumps({"error": f"Unknown entity type: {entity_type}"}, ensure_ascii=False)

    if tool_name == "create_entity":
        payload = arguments.get("payload", {})
        mode = arguments.get("mode", "simple")

        # Clone mode — works for all entity types
        if mode == "clone":
            cloned, clone_warns, diffs = _compile_clone(gs, entity_type, payload)
            if isinstance(cloned, dict) and cloned.get("_compile_error"):
                return json.dumps(cloned, ensure_ascii=False)
            payload = cloned
            arguments["_compile_warnings"] = clone_warns
            arguments["_clone_diffs"] = diffs

        # Compile template/ir modes for action/event
        elif entity_type in ("action", "event") and mode in ("template", "ir"):
            payload, compile_warnings = _compile_action_payload(entity_type, mode, payload)
            if isinstance(payload, dict) and payload.get("_compile_error"):
                return json.dumps(payload, ensure_ascii=False)
            if compile_warnings:
                arguments["_compile_warnings"] = compile_warnings

            # Namespace bare ID refs (template/ir use bare IDs like docs examples)
            from game.ai_assist_handlers.default import _resolve_source_addon
            from game.character.namespace import namespace_single_action

            source = _resolve_source_addon(gs, target_addon)
            namespace_single_action(
                payload,
                source,
                gs.trait_defs,
                gs.item_defs,
                gs.clothing_defs,
                gs.character_data,
                gs.maps,
            )

        # Post-compile validation for action/event
        if entity_type in ("action", "event") and mode != "simple":
            from game.action.validator import validate_action, validate_event

            validator = validate_action if entity_type == "action" else validate_event
            msgs = validator(payload, gs)
            errors = [m for m in msgs if m.level == "error"]
            if errors:
                detail = "; ".join(f"{e.field}: {e.message}" for e in errors)
                return json.dumps({"success": False, "error": detail}, ensure_ascii=False)
            warn_msgs = [m for m in msgs if m.level == "warning"]
            if warn_msgs:
                arguments.setdefault("_compile_warnings", [])
                arguments["_compile_warnings"].extend(f"{m.field}: {m.message}" for m in warn_msgs)

        result = handler.create(gs, entity_type, payload, target_addon=target_addon)
        if arguments.get("_compile_warnings"):
            result["compileWarnings"] = arguments["_compile_warnings"]
        if arguments.get("_clone_diffs"):
            result["cloneDiffs"] = arguments["_clone_diffs"]
            result["sourceId"] = arguments.get("payload", {}).get("sourceId", "")
        return json.dumps(result, ensure_ascii=False)

    if tool_name == "batch_create":
        payload = arguments.get("payload", [])
        result = batch_create(gs, entity_type, payload, target_addon=target_addon)
        return json.dumps(result, ensure_ascii=False)

    if tool_name == "update_entity":
        entity_id = arguments.get("entityId", "")
        fields = arguments.get("fields", {})
        result = handler.update(gs, entity_type, entity_id, fields)
        return json.dumps(result, ensure_ascii=False)

    if tool_name == "batch_update":
        updates = arguments.get("updates", [])
        result = batch_update(gs, entity_type, updates)
        return json.dumps(result, ensure_ascii=False)

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


# ---------------------------------------------------------------------------
# Context collection
# ---------------------------------------------------------------------------


def collect_assist_context(gs: GameState) -> str:
    """Build schema overview + entity counts for the system prompt.

    Provides enough info for the LLM to plan without calling get_schema.
    For detailed docs and dynamic enums, LLM still uses get_schema.
    """
    template = getattr(gs, "template", {})
    parts: list[str] = []

    parts.append("## 实体类型与关键字段\n")

    for etype, schema in ENTITY_SCHEMAS.items():
        defs = _get_defs(gs, etype)
        req = ", ".join(schema.get("required", {}).keys())
        opt = ", ".join(schema.get("optional", {}).keys())
        line = f"### {etype}（{schema['description']}，已有 {len(defs)} 个）"
        parts.append(line)
        parts.append(f"必填: {req} | 可选: {opt}")

        # Key enum values for common fields
        if etype == "trait":
            cats = [c.get("key", "") for c in template.get("traits", [])]
            if cats:
                parts.append(f"category: {', '.join(cats)}")
        elif etype == "clothing":
            slots = template.get("clothingSlots", [])
            if slots:
                parts.append(f"slots: {', '.join(slots[:12])}")
        parts.append("")

    parts.append("## 引用关系")
    parts.append("- character.traits → trait ids（按 category 分组）")
    parts.append("- character.clothing → clothing ids（按 slot 分配）")
    parts.append("- character.inventory → item ids")
    parts.append("- effect.target → variable/ability/resource ids")
    parts.append("")
    parts.append("使用 get_schema 工具查看完整字段说明和可用枚举值。")
    parts.append("使用 list_entities 工具查看已有实体列表。")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Message assembly
# ---------------------------------------------------------------------------

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
- 不要重复调用相同参数的工具，之前的结果已在对话历史中

## 规划模式
如果 submit_plan 工具可用，你必须先用它提交方案，用户确认后再创建实体。
- overview: 一段话说明整体构思和角色/引用关系
- entities: 实体列表，每个包含 entityType/id/name/note
用户确认后，按依赖顺序分批创建：
lorebook/worldVariable → trait → item/clothing → character → event → action

## Action/Event 创建
创建 action 和 event 时，优先使用 template 或 ir 模式：
- mode="template": 常见模式（trade/conversation/skill_check），只需关键参数
- mode="ir": 自定义逻辑，使用简写子句（如 "resource stamina >= 100"）
- mode="simple": 仅用于非常简单的行动
详细语法见 get_schema("action") 和 get_schema("event")。

## Clone 模式
所有实体类型支持 mode="clone"，基于已有实体创建变体：
- sourceId: 要克隆的实体完整 ID
- patch: 路径语法修改字段（如 "costs[0].amount": 20）
适合创建与已有实体相似的新实体。"""

BUILTIN_CONTEXT_ENTRY_ID = "__assist_context__"


_RE_THINK_BLOCK = re.compile(r"<think>[\s\S]*?</think>")


def _compress_history(history: list[dict]) -> list[dict]:
    """Create a compressed copy of conversation history for LLM context.

    Rules:
    - Strip <think> blocks from all assistant messages.
    - Keep the most recent 4 messages (2 rounds) fully intact.
    - For older tool results:
      - get_schema: keep last per entityType, summarize earlier ones.
      - list_entities: keep last 2, summarize earlier.
      - get_entities: keep last 1, summarize earlier.
      - create/batch_create/update/batch_update results: keep last 2 rounds,
        summarize earlier.
    - Never remove tool_call_id (API requires tool results match tool_calls).
    """
    if len(history) <= 4:
        # Short history — only strip think blocks
        return _strip_think_all(history)

    # Split: older messages to compress, recent to keep intact
    older = history[:-4]
    recent = history[-4:]

    # Track latest occurrence index of each tool type per entityType
    # Scan older messages in reverse to find "latest" indices
    latest_schema: dict[str, int] = {}  # entityType -> msg index
    latest_list: list[int] = []  # indices of list_entities results
    latest_get: list[int] = []  # indices of get_entities results
    latest_write: list[int] = []  # indices of write tool results

    for i, msg in enumerate(older):
        if msg.get("role") != "tool":
            continue
        tool_call_id = msg.get("tool_call_id", "")

        # Detect tool type and args from the corresponding assistant tool_call
        tool_name, tool_args = _find_tool_info_for_call(older, i, tool_call_id)

        if tool_name == "get_schema":
            etype = tool_args.get("entityType", "")
            latest_schema[etype] = i
        elif tool_name == "list_entities":
            latest_list.append(i)
        elif tool_name == "get_entities":
            latest_get.append(i)
        elif tool_name in ("create_entity", "batch_create", "update_entity", "batch_update"):
            latest_write.append(i)

    # Build set of indices that should keep full content
    keep_full: set[int] = set()
    keep_full.update(latest_schema.values())
    for lst, keep_n in [(latest_list, 2), (latest_get, 1), (latest_write, 2)]:
        keep_full.update(lst[-keep_n:] if len(lst) >= keep_n else lst)

    compressed: list[dict] = []
    for i, msg in enumerate(older):
        if msg.get("role") == "assistant":
            compressed.append(_strip_think(msg))
        elif msg.get("role") == "tool" and i not in keep_full:
            compressed.append(_summarize_tool_result(msg, older, i))
        else:
            compressed.append(msg)

    compressed.extend(_strip_think_all(recent))
    return compressed


def _strip_think(msg: dict) -> dict:
    """Return a copy of an assistant message with <think> blocks removed."""
    content = msg.get("content", "")
    if not content or "<think>" not in content:
        return msg
    cleaned = _RE_THINK_BLOCK.sub("", content).strip()
    copy = dict(msg)
    copy["content"] = cleaned or None
    return copy


def _strip_think_all(messages: list[dict]) -> list[dict]:
    """Strip think blocks from assistant messages in a list."""
    return [_strip_think(m) if m.get("role") == "assistant" else m for m in messages]


def _find_tool_info_for_call(messages: list[dict], tool_msg_idx: int, tool_call_id: str) -> tuple[str, dict]:
    """Find tool name and parsed arguments for a given tool_call_id.

    Scans preceding assistant messages for the matching tool call.
    Returns (tool_name, parsed_args).
    """
    for i in range(tool_msg_idx - 1, -1, -1):
        msg = messages[i]
        if msg.get("role") != "assistant":
            continue
        for tc in msg.get("tool_calls", []):
            fn = tc.get("function", {})
            if tc.get("id") == tool_call_id:
                name = fn.get("name", "")
                try:
                    args = json.loads(fn.get("arguments", "{}"))
                except (json.JSONDecodeError, TypeError):
                    args = {}
                return name, args
        break  # Only check the nearest assistant message
    return "", {}


def _summarize_tool_result(msg: dict, messages: list[dict], idx: int) -> dict:
    """Replace a tool result with a compact summary, preserving tool_call_id."""
    tool_call_id = msg.get("tool_call_id", "")
    content = msg.get("content", "")
    tool_name, tool_args = _find_tool_info_for_call(messages, idx, tool_call_id)

    summary = _make_tool_summary(tool_name, tool_args, content)
    return {"role": "tool", "tool_call_id": tool_call_id, "content": summary}


def _make_tool_summary(tool_name: str, tool_args: dict, content: str) -> str:
    """Generate a short summary string for a tool result.

    Uses tool_args (from the call) for entityType — more reliable than parsing
    result content (e.g. get_schema returns markdown, not JSON).
    """
    etype = tool_args.get("entityType", "unknown")

    if tool_name == "get_schema":
        return f"[已获取 {etype} schema]"

    # For other tools, try to parse result JSON for extra info
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return f"[{tool_name} {etype} result]"

    if not isinstance(data, dict):
        return f"[{tool_name} {etype} result]"

    if tool_name == "list_entities":
        count = data.get("total", len(data.get("entities", [])))
        return f"[列出了 {count} 个 {etype}]"
    if tool_name == "get_entities":
        ids = list(data.get("entities", {}).keys())
        return f"[已获取 {etype}: {', '.join(ids[:5])}]"
    if tool_name == "create_entity":
        ent = data.get("entity", {})
        eid = ent.get("id", "?")
        ok = "成功" if data.get("success") else "失败"
        return f"[创建 {ok}: {eid}]"
    if tool_name == "batch_create":
        total = data.get("total", 0)
        errs = len(data.get("errors", []))
        return f"[批量创建 {total} 个，{errs} 个失败]"
    if tool_name == "update_entity":
        ent = data.get("entity", {})
        eid = ent.get("id", "?")
        ok = "成功" if data.get("success") else "失败"
        return f"[更新 {ok}: {eid}]"
    if tool_name == "batch_update":
        total = data.get("total", 0)
        errs = len(data.get("errors", []))
        return f"[批量更新 {total} 个，{errs} 个失败]"

    return f"[{tool_name} result]"


def build_assist_messages(
    preset: dict,
    context_text: str,
    history: list[dict],
    user_message: str,
    cached_schemas: Optional[list[str]] = None,
    plan_mode: bool = False,
) -> list[dict]:
    """Assemble the full messages array for the LLM API call.

    Structure:
    1. Preset promptEntries (sorted by position, with builtin context injected)
    2. Compressed conversation history
    3. New user message

    If *cached_schemas* is provided (list of entityType strings already fetched
    in this session), a hint is appended to the context so the LLM knows it
    doesn't need to call get_schema again for those types.
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

    # 1b. Inject plan mode hint
    if plan_mode:
        plan_hint = "\n\n**当前模式：规划模式。必须先用 submit_plan 工具提交方案，用户确认后再创建实体。**"
        for i in range(len(messages) - 1, -1, -1):
            if messages[i].get("role") == "system":
                messages[i] = {**messages[i], "content": messages[i]["content"] + plan_hint}
                break

    # 1c. Inject cached schema hint (reduces redundant get_schema calls)
    if cached_schemas:
        hint = "\n\n注意：本会话中已获取过以下类型的 schema，无需再次调用 get_schema：" + ", ".join(cached_schemas)
        # Append to the last system message
        for i in range(len(messages) - 1, -1, -1):
            if messages[i].get("role") == "system":
                messages[i] = {**messages[i], "content": messages[i]["content"] + hint}
                break

    # 2. Compressed conversation history
    messages.extend(_compress_history(history))

    # 3. New user message
    if user_message:
        messages.append({"role": "user", "content": user_message})

    return messages
