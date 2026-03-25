# 角色（character）

角色是游戏中的 NPC 或玩家角色。角色有丰富的属性：特质、服装、物品、能力、位置等。

## 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 英文标识符，下划线命名（如 shopkeeper） |
| name | string | 角色显示名称（会自动同步到 basicInfo.name） |

## 可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| active | boolean | true | 是否参与游戏（false 的角色不会出现在游戏中） |
| isPlayer | boolean | false | 是否是玩家角色 |
| portrait | string | "" | 立绘文件名 |
| traits | object | {} | 特质分配，按 category 分组 |
| clothing | object | {} | 当前穿戴的服装，按槽位分配 |
| inventory | array | [] | 背包物品列表 |
| abilities | object | {} | 能力经验值 |
| position | object | null | 当前所在位置 |
| restPosition | object | null | 休息/归宿位置 |
| favorability | object | {} | 对其他角色的好感度 |
| llm | object | {} | LLM 人格配置 |

## 字段详解

### traits（特质分配）

按 category 分组的特质 ID 数组。category 由模板定义，用 `get_schema` 查看可用值。

```json
{
  "race": ["human"],
  "mentalTrait": ["brave", "curious"],
  "bodyTrait": ["nimble"],
  "techTrait": ["herbalism"]
}
```

特质 ID 使用 bare ID（不含命名空间前缀），系统会自动处理命名空间。

### clothing（穿戴服装）

按槽位分配服装，每个槽位一件：

```json
{
  "upperBody": { "itemId": "silk_robe", "state": "worn" },
  "mainHand": { "itemId": "wooden_staff", "state": "worn" },
  "hat": { "itemId": "wizard_hat", "state": "worn" }
}
```

state 可选值：`worn`（穿着）、`half_worn`（半脱）、`off`（脱下）

服装 ID 使用 bare ID。

### inventory（背包物品）

```json
[
  { "itemId": "health_potion", "amount": 3 },
  { "itemId": "iron_sword", "amount": 1 }
]
```

物品 ID 使用 bare ID。

### abilities（能力经验值）

键为能力特质的完整 ID，值为经验值（每 1000 = 1 级，等级 G→F→E→D→C→B→A→S）：

```json
{
  "Base.strength": 2000,
  "Base.agility": 3000
}
```

能力特质是 category 为 "ability" 的特质。用 `get_schema` 查看已有能力特质。

### position / restPosition（位置）

```json
{ "mapId": "town", "cellId": 1 }
```

mapId 必须是已有的地图 ID。cellId 是地图上的格子编号。

### favorability（好感度）

```json
{
  "Base.reimu": 50,
  "Base.marisa": -20
}
```

值范围 -100 ~ 100。键为其他角色的完整 ID。

### llm（LLM 人格配置）

```json
{ "personality": "热情的杂货店老板，喜欢和冒险者聊天。" }
```

## basicInfo 和 resources

这两个字段由模板自动初始化（用 `get_schema` 查看模板定义）。创建角色时无需手动设置，系统会自动填入模板默认值。如需自定义，可在创建时覆盖：

```json
{
  "basicInfo": { "name": "角色名", "money": 500 },
  "resources": {
    "stamina": { "value": 3000, "max": 5000 },
    "energy": { "value": 2000, "max": 2000 }
  }
}
```

## 创建示例

```json
{
  "id": "village_elder",
  "name": "村长",
  "traits": {
    "race": ["human"],
    "mentalTrait": ["brave"]
  },
  "clothing": {
    "upperBody": { "itemId": "cotton_shirt", "state": "worn" }
  },
  "position": { "mapId": "town", "cellId": 0 },
  "llm": { "personality": "睿智的老村长，守护着这个小村庄。" }
}
```
