# Action（行动）

行动是玩家和 NPC 可执行的交互，包含前置条件、消耗、结果分支。

## 创建模式

Action 支持 3 种创建模式（通过 create_entity 的 mode 参数指定）：

### mode="template"（推荐，常见模式）

使用预设模板，只需提供关键参数：

```json
{
  "entityType": "action",
  "mode": "template",
  "payload": {
    "template": "trade",
    "id": "buy_ale",
    "name": "买啤酒",
    "item": "ale",
    "price": 5,
    "seller": "bartender"
  }
}
```

#### 可用模板

**trade**（交易）— 从 NPC 购买物品
- 必填: id, name, item（物品ID）, price（价格）
- 可选: seller（NPC ID）, priceKey（basicInfo key，默认money）, amount（数量，默认1）, location（地图ID）, favChange（好感变化）, timeCost（默认5）, text（输出文本）

**conversation**（对话）— 与 NPC 交谈
- 必填: id, name, npc（NPC ID）
- 可选: location, favChange（默认5）, timeCost（默认15）, triggerLLM（默认true）, llmPreset, effects（额外效果，IR子句数组）, text

**skill_check**（技能检定）— 能力判定
- 必填: id, name, ability（能力key）
- 可选: threshold（最低能力值，默认0）, timeCost（默认10）, location, npc, target（none/npc）
- 结果简写: successEffects（IR子句数组）, failEffects, successText, failText
- 或完整: outcomes（数组，每项含 label/grade/weight/effects/text）
- 修正器: modifierPer（默认100）, modifierBonus（默认10）

### mode="ir"（推荐，自定义逻辑）

使用 IR 简写语法，比完整 JSON 节省 80%+ token：

```json
{
  "entityType": "action",
  "mode": "ir",
  "payload": {
    "id": "pickpocket",
    "name": "扒窃",
    "category": "crime",
    "target": "npc",
    "time": 10,
    "require": [
      "ability stealth >= 500",
      {"not": "@target: trait mentalTrait has alert"}
    ],
    "outcomes": [
      {
        "label": "成功", "grade": "success", "weight": 40,
        "effects": ["item add stolen_goods 1", "ability stealth add 50"],
        "text": "你趁目标不注意，顺走了一件值钱的东西。"
      },
      {
        "label": "失败", "grade": "failure", "weight": 60,
        "effects": ["favorability {{targetId}} -> {{player}} -20"],
        "text": "你的手被抓住了！"
      }
    ]
  }
}
```

#### IR 字段映射

| IR 字段 | 说明 | 默认值 |
|---------|------|--------|
| target | targetType（none/npc） | "none" |
| time | timeCost（分钟） | 10 |
| require | conditions（子句数组） | [] |
| outcomes[].effects | 效果子句数组 | [] |
| outcomes[].text | outputTemplates[0].text | - |
| outcomes[].modifiers | weightModifiers（JSON对象数组） | - |
| npcModifiers | npcWeightModifiers（JSON对象数组） | - |

#### Condition 子句语法

```
# 数值比较
resource stamina >= 100
ability stealth >= 500
basicInfo age >= 18
experience combat >= 3
variable loyalty >= 50
worldVar reputation >= 50
favorability {{targetId}} >= 30

# 存在判断
trait mentalTrait has brave
noTrait race has undead
hasItem iron_key
hasItem gold >= 10
clothing upperBody worn
outfit combat

# 位置
location tavern
location tavern cell:1,2,3
npcPresent bartender
npcAbsent guard

# 时间
time 8-20

# 目标前缀（检查目标而非自身）
@target: trait mentalTrait has alert
@target: resource hp <= 200

# 逻辑组合
{"and": ["clause1", "clause2"]}
{"or": ["clause1", "clause2"]}
{"not": "clause"}
```

#### Effect 子句语法

```
# 数值
resource stamina add 200
ability stealth add 50
resource hp add -30%
basicInfo age set 25
experience combat add 1

# 物品
item add gold 50
item remove iron_key 1

# 好感度
favorability {{targetId}} -> {{player}} -20
favorability self -> {{targetId}} 10

# 特质
trait mentalTrait add brave
trait race remove cursed

# 位置
position tavern 3

# 世界变量
worldVar reputation add 10
worldVar quest_done set 1

# 目标前缀
@target: resource hp add -100
```

### mode="simple"（完整 JSON）

直接提供完整的 action JSON 结构。不推荐用于复杂 action，适合简单行动。

## 结构参考（完整 JSON）

```json
{
  "id": "rest",
  "name": "休息",
  "category": "基础行动",
  "targetType": "none",
  "triggerLLM": false,
  "timeCost": 50,
  "npcWeight": 0,
  "conditions": [
    {"type": "location", "mapId": "inn"}
  ],
  "costs": [],
  "outcomes": [
    {
      "label": "成功",
      "grade": "success",
      "weight": 100,
      "effects": [
        {"type": "basicInfo", "key": "money", "op": "add", "target": "self", "value": -10},
        {"type": "resource", "key": "stamina", "op": "add", "target": "self", "value": 500}
      ],
      "outputTemplates": [{"text": "{{player}}休息后精力充沛。"}]
    }
  ]
}
```

### Condition 类型

数值比较: resource, ability, basicInfo, experience, favorability, variable, worldVar
存在判断: trait, noTrait, hasItem, clothing, outfit
位置: location, npcPresent, npcAbsent
时间: time
逻辑: and, or, not

### Effect 类型

resource, ability, basicInfo, experience, favorability, item, trait, clothing, outfit, position, worldVar

### Cost 类型

resource, basicInfo, item

### 比较操作符

>=, <=, >, <, ==, !=

### 效果操作符

add, set, remove, switch
