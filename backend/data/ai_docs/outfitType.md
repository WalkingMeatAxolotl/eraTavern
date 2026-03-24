# OutfitType（服装预设类型）

定义角色可切换的服装套装预设。每种预设类型可以为各槽位指定默认服装。
角色通过行动切换预设时，会根据预设定义更换身上的服装。

## 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 英文标识符（如 `combat`、`casual`） |
| name | string | ✅ | 中文显示名称 |
| description | string | | 预设描述 |
| copyDefault | boolean | | 是否从默认服装复制初始值（默认 true） |
| slots | object | | 各槽位预设服装，格式 `{slotName: [clothingId, ...]}` |

## copyDefault 说明

- **true**（默认）— 切换到此预设时，先复制"默认服装"预设的所有槽位，再用 slots 中定义的覆盖
- **false** — 仅使用 slots 中明确指定的服装，未指定的槽位为空

## slots 格式

slots 是一个对象，key 为槽位名（必须使用系统定义的槽位），value 为服装 ID 数组。
通常每个槽位只放一件服装，但系统支持多件（按优先级穿戴）。

```json
{
  "mainHand": ["iron_sword"],
  "upperBody": ["leather_armor"],
  "back": ["combat_cloak"]
}
```

slots 中的 clothingId 使用本地 ID（不含命名空间前缀）。

## 示例

```json
{
  "id": "combat",
  "name": "战斗装",
  "description": "适合战斗的装备搭配",
  "copyDefault": true,
  "slots": {
    "mainHand": ["iron_sword"],
    "upperBody": ["leather_armor"]
  }
}
```

```json
{
  "id": "formal",
  "name": "正装",
  "copyDefault": false,
  "slots": {
    "upperBody": ["silk_robe"],
    "lowerBody": ["formal_pants"],
    "shoes": ["leather_boots"]
  }
}
```

## 注意事项

- "default"（默认服装）是内置预设，始终存在，不需要创建
- 创建前可用 `list_entities(entityType: "clothing")` 查看可用服装
- slots 中引用的 clothingId 必须是已有的服装 ID
- 槽位名必须使用系统定义的值（用 get_schema 查看可用槽位）
