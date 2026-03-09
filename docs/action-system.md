# 行动系统

## 1. 概述

行动系统是玩家与游戏世界交互的核心。根据角色当前所在的地图、位置和状态，动态生成可用的行动选项供玩家选择。

核心设计原则：
- **数据驱动**：行动通过 `actions.json` 配置定义，不硬编码
- **上下文驱动**：可用行动由条件引擎动态计算
- **LLM 可选**：部分行动可触发 LLM 生成文本，大部分行动是纯游戏逻辑
- **随机结果**：行动执行时支持概率性结果分级

## 2. 行动分类

| 类型 | 说明 | 来源 |
|------|------|------|
| `move` | 移动到连接方格 | 内置（不走 JSON 配置，逻辑特殊） |
| 其他所有 | 通用行动 | `actions.json` 配置驱动 |

`rest`（休息）也改为 JSON 配置化，通过通用引擎处理。

## 3. 行动流程

```
1. 前端请求行动菜单
2. 后端加载 actions.json 中所有行动定义
3. 条件引擎逐条评估 conditions，过滤出满足条件的行动
4. 消耗引擎检查 costs 是否够用（不够 → 行动禁用但仍显示）
5. 返回行动列表（含可用/禁用状态）给前端
6. 玩家选择行动（+ 选择目标 NPC，如需要）
7. 后端执行：扣消耗 → 随机判定结果等级 → 应用效果 → 生成 ActionResult
8. 推送状态更新 + ActionResult 给前端
9. 如 triggerLLM=true，将 ActionResult 注入 prompt 调用 LLM
```

## 4. Action 定义格式 (actions.json)

每个 game package 下的 `actions.json`：

```json
{
  "actions": [
    {
      "id": "talk",
      "name": "搭话",
      "category": "social",
      "targetType": "npc",
      "triggerLLM": true,
      "timeCost": 10,
      "conditions": [...],
      "costs": [...],
      "outcomes": [...],
      "outputTemplate": "{{player}} 向 {{target}} 搭话。"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识符 |
| `name` | string | 显示名称 |
| `category` | string | 分类，用于前端分组（如 `"social"`, `"daily"`, `"combat"` 等） |
| `targetType` | string | `"none"` / `"npc"` / `"self"` |
| `triggerLLM` | boolean | 是否触发 LLM 生成叙事文本 |
| `timeCost` | number | 时间消耗（分钟） |
| `conditions` | array | 可用条件（决定是否在菜单中显示） |
| `costs` | array | 执行消耗（不足则禁用） |
| `outcomes` | array | 结果等级列表（含权重和效果） |
| `outputTemplate` | string | 默认输出文本模板（被 outcome 覆盖时可选） |

## 5. 条件系统 (Conditions)

### 5.1 逻辑组合

条件支持 **AND / OR 组合**。顶层为 AND，每个条件项可以是：
- 单个条件对象 → 直接评估
- `{"or": [...]}` → 内部条件 OR 组合

```json
"conditions": [
  { "type": "resource", "key": "stamina", "op": ">=", "value": 300 },
  {
    "or": [
      { "type": "location", "mapId": "tarven1", "cellIds": [3] },
      { "type": "location", "mapId": "tarven1", "cellIds": [5] },
      { "type": "location", "mapId": "kitchen-map", "cellIds": [1, 2] }
    ]
  },
  { "type": "trait", "key": "techTrait", "traitId": "cooking-knowledge" }
]
```

上例含义：体力 >= 300 **AND** (在酒馆3号格 **OR** 酒馆5号格 **OR** 厨房地图1/2号格) **AND** 有烹饪知识

### 5.2 条件类型

| 条件类型 | 字段 | 说明 |
|---------|------|------|
| `location` | `mapId`, `cellIds` | 在指定地图的指定方格内 |
| `npcPresent` | `npcId?` | 同格有 NPC（不指定 npcId 则任意 NPC） |
| `npcAbsent` | — | 同格无其他角色 |
| `resource` | `key`, `op`, `value` | 资源值判断（stamina, energy 等） |
| `ability` | `key`, `op`, `value` | 能力经验值判断 |
| `trait` | `key`, `traitId` | 角色拥有特定特质 |
| `noTrait` | `key`, `traitId` | 角色不拥有特定特质 |
| `favorability` | `targetId`, `op`, `value` | 对特定角色的好感度 |
| `hasItem` | `inventoryKey`, `itemId?` | 持有物品（不指定 itemId 则该栏位有任意物品） |
| `clothing` | `slot`, `state` | 服装状态 (`"worn"` / `"halfWorn"` / `"none"`) |
| `time` | `hourMin?`, `hourMax?`, `dayOfWeek?`, `season?` | 时间条件 |
| `basicInfo` | `key`, `op`, `value` | basicInfo 数值字段判断（money, libido 等） |

`op` 支持：`>=`, `<=`, `>`, `<`, `==`, `!=`

### 5.3 条件 vs 消耗

- **conditions**：决定行动是否**显示**在菜单中（不满足 → 不显示）
- **costs**：决定行动是否**可执行**（不足 → 显示但禁用灰显，提示玩家差什么）

## 6. 消耗系统 (Costs)

执行前预检，不足则禁用行动并提示：

```json
"costs": [
  { "type": "resource", "key": "stamina", "amount": 200 },
  { "type": "basicInfo", "key": "money", "amount": 50 },
  { "type": "item", "inventoryKey": "cooking", "itemId": "any", "amount": 1 }
]
```

| 消耗类型 | 字段 | 说明 |
|---------|------|------|
| `resource` | `key`, `amount` | 扣除资源值 |
| `basicInfo` | `key`, `amount` | 扣除 basicInfo 数值 |
| `item` | `inventoryKey`, `itemId`, `amount` | 消耗物品（`"any"` 表示任意物品） |

## 7. 结果系统 (Outcomes) — 带随机分级

行动执行时，从 `outcomes` 列表中按权重随机选取一个结果等级：

```json
"outcomes": [
  {
    "grade": "success",
    "label": "成功",
    "weight": 70,
    "effects": [
      { "type": "ability", "key": "intimacy", "target": "self", "op": "add", "value": 500 },
      { "type": "favorability", "targetId": "{{targetId}}", "op": "add", "value": 100 }
    ],
    "outputTemplate": "{{player}} 与 {{target}} 愉快地交谈。亲密 +500，好感 +100。"
  },
  {
    "grade": "great_success",
    "label": "大成功",
    "weight": 15,
    "effects": [
      { "type": "ability", "key": "intimacy", "target": "self", "op": "add", "value": 1000 },
      { "type": "favorability", "targetId": "{{targetId}}", "op": "add", "value": 300 }
    ],
    "outputTemplate": "{{player}} 与 {{target}} 相谈甚欢！亲密 +1000，好感 +300。"
  },
  {
    "grade": "failure",
    "label": "失败",
    "weight": 15,
    "effects": [],
    "outputTemplate": "{{player}} 试图搭话，但 {{target}} 似乎心不在焉。"
  }
]
```

### 权重判定逻辑

- 权重可被角色属性修正（如能力越高，大成功权重越高）
- 若 `outcomes` 为空或不提供，则视为固定成功（如休息）
- 无 outcomes 时直接使用顶层的 `effects` 和 `outputTemplate`

### 权重修正（可选字段）

```json
{
  "grade": "great_success",
  "weight": 15,
  "weightModifiers": [
    { "type": "ability", "key": "technique", "per": 1000, "bonus": 5 }
  ]
}
```

上例：technique 每 1000 经验值，大成功权重 +5。

## 8. 效果系统 (Effects)

效果列表，行动成功后依次执行：

| 效果类型 | 字段 | 说明 |
|---------|------|------|
| `resource` | `key`, `op`, `value`, `target?` | 修改资源值 |
| `ability` | `key`, `op`, `value`, `target?` | 修改能力经验值 |
| `basicInfo` | `key`, `op`, `value`, `target?` | 修改 basicInfo 数值 |
| `favorability` | `targetId`, `op`, `value` | 修改好感度 |
| `trait` | `key`, `traitId`, `op`, `target?` | 添加/移除特质 |
| `item` | `inventoryKey`, `itemId`, `op`, `amount`, `target?` | 添加/移除物品 |
| `clothing` | `slot`, `op`, `state?`, `target?` | 修改服装状态 |

### target 字段

- `"self"` 或省略 → 作用于执行者（玩家）
- `"{{targetId}}"` → 作用于行动目标 NPC

### op 字段

- `"add"` — 增加（可为负数表示减少）
- `"set"` — 设为指定值
- `"addTrait"` / `"removeTrait"` — 用于 trait 类型
- `"setState"` — 用于 clothing 类型
- `"addItem"` / `"removeItem"` — 用于 item 类型

## 9. ActionResult — 输出信息结构

每次行动执行后生成，同时服务于前端显示和 LLM 上下文：

```python
{
    "actionId": "talk",
    "actionName": "搭话",
    "success": True,
    "outcomeGrade": "success",       # 结果等级
    "outcomeLabel": "成功",          # 结果等级显示名
    "actor": {"id": "player", "name": "玩家"},
    "target": {"id": "sakuya", "name": "Noal"},    # 如有
    "location": {"mapName": "酒馆1F", "cellName": "大厅"},
    "baseText": "玩家 与 Noal 愉快地交谈。亲密 +500，好感 +100。",
    "effectsSummary": [              # 人可读效果摘要
        "亲密 +500",
        "好感度 +100",
    ],
    "context": {                     # 给 LLM 的完整上下文
        "actorState": {...},
        "targetState": {...},
        "time": {"display": "春・月曜日 14:30", "weather": "晴"},
    },
    "triggerLLM": True,
}
```

### 用途

1. **前端 NarrativePanel**：显示 `baseText` + `effectsSummary`
2. **LLM prompt**：作为 `{{actionResult}}` 变量注入提示词，LLM 据此生成沉浸式叙事
3. **日志/历史**：可存储用于回放

## 10. 前端交互

### 10.1 行动菜单

按 `category` 分组显示可用行动，禁用的行动灰显并提示原因。

### 10.2 目标选择

对于 `targetType: "npc"` 的行动：
- 玩家先在 LocationHeader 点击 NPC 选中目标
- 然后行动菜单中显示针对该 NPC 可用的行动
- **多目标行动**（如同时涉及多个 NPC）：暂不支持，未来再扩展

### 10.3 结果显示

- 基础文本直接输出到 NarrativePanel
- 如 triggerLLM=true，等待 LLM 返回后追加叙事文本

## 11. 与编辑器系统联动

### 11.1 Action Editor（行动编辑器）

在 GameSidebar 中新增 tab，提供可视化编辑：

- 基础信息：id, name, category, targetType, triggerLLM, timeCost
- 条件编辑器：下拉框联动已有定义
  - location → 从已有地图/方格中选择
  - trait → 从已有特质中选择
  - resource/ability → 从 character_template 中选择
  - hasItem → 从 items.json 中选择
- 消耗编辑器：同上联动
- 结果/效果编辑器：可视化管理 outcomes 和 effects
- 输出模板编辑器：文本框，支持变量插值

### 11.2 definitions 端点扩展

`GET /api/game/definitions` 需要额外返回：
- `itemDefs` — 物品定义（供 hasItem 条件和 item 效果选择）
- `actionDefs` — 行动定义（供编辑器列表）
- 现有的 template, clothingDefs, traitDefs, maps 已涵盖其他需求

## 12. 前置依赖：物品系统

Action 系统的 `hasItem` 条件和 `item` 效果需要物品系统支撑。

### 12.1 items.json

```json
{
  "items": [
    {
      "id": "yakitori",
      "name": "烤鸡",
      "category": "cooking",
      "description": "香喷喷的烤鸡。",
      "stackable": true,
      "maxStack": 5
    }
  ]
}
```

### 12.2 角色 Inventory 运行时

角色的 inventory 从空壳扩展为实际存储物品：

```json
// 角色 JSON 中
"inventory": {
  "cooking": [
    { "itemId": "yakitori", "amount": 1 }
  ]
}
```

### 12.3 需要的 API

- `GET /api/game/items` — 获取物品定义
- `POST/PUT/DELETE /api/game/items/{item_id}` — CRUD
- Item Editor 前端组件

## 13. 完整示例：烹饪行动

```json
{
  "id": "cook",
  "name": "烹饪",
  "category": "daily",
  "targetType": "none",
  "triggerLLM": false,
  "timeCost": 30,
  "conditions": [
    {
      "or": [
        { "type": "location", "mapId": "tarven1", "cellIds": [3] },
        { "type": "location", "mapId": "tarven1", "cellIds": [5] }
      ]
    },
    { "type": "trait", "key": "techTrait", "traitId": "cooking-knowledge" }
  ],
  "costs": [
    { "type": "resource", "key": "stamina", "amount": 300 },
    { "type": "basicInfo", "key": "money", "amount": 100 }
  ],
  "outcomes": [
    {
      "grade": "success",
      "label": "成功",
      "weight": 60,
      "effects": [
        { "type": "item", "inventoryKey": "cooking", "op": "addItem", "itemId": "yakitori", "amount": 1 }
      ],
      "outputTemplate": "{{player}} 在厨房里做了一份烤鸡。"
    },
    {
      "grade": "great_success",
      "label": "大成功",
      "weight": 20,
      "weightModifiers": [
        { "type": "ability", "key": "technique", "per": 1000, "bonus": 3 }
      ],
      "effects": [
        { "type": "item", "inventoryKey": "cooking", "op": "addItem", "itemId": "yakitori-deluxe", "amount": 1 }
      ],
      "outputTemplate": "{{player}} 灵感迸发，做出了一份特制豪华烤鸡！"
    },
    {
      "grade": "failure",
      "label": "失败",
      "weight": 20,
      "effects": [],
      "outputTemplate": "{{player}} 手忙脚乱，食材全毁了……"
    }
  ]
}
```

## 14. 实现顺序

```
Phase 1: 物品系统（Action 前置依赖）
  ├─ items.json 格式定义 + 加载到 GameState
  ├─ 角色 inventory 运行时管理（添加/移除/查询）
  ├─ Item CRUD API
  └─ Item Editor 前端

Phase 2: Action 核心引擎
  ├─ actions.json 加载
  ├─ 条件引擎 (evaluate_conditions, 含 AND/OR)
  ├─ 消耗引擎 (check_costs / apply_costs)
  ├─ 结果引擎 (roll_outcome, 权重随机 + 修正)
  ├─ 效果引擎 (apply_effects)
  ├─ 重构 get_available_actions → 条件驱动
  ├─ 重构 execute_action → 通用引擎
  └─ ActionResult 生成 + 输出模板渲染

Phase 3: Action 编辑器
  ├─ Action CRUD API
  ├─ Action Editor 前端（条件/消耗/结果可视化编辑）
  └─ definitions 端点扩展

Phase 4: LLM 集成
  ├─ {{actionResult}} prompt 变量
  ├─ NarrativePanel 显示增强
  └─ triggerLLM 流程打通
```

## 15. 内置行动：移动

移动行动保持内置，不走 actions.json，因为其交互逻辑（选择目标方格）与通用行动不同。

执行逻辑不变：
1. 展示当前方格的所有连接目标
2. 玩家选择目标方格
3. 后端验证连接有效性
4. 更新玩家位置 + 推进时间 10 分钟
