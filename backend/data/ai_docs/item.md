# Item（物品）

角色可持有、交易、使用的物品。

## 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 英文标识符，下划线命名（如 `iron_sword`） |
| name | string | ✅ | 中文显示名称 |
| tags | string[] | | 标签数组，用于分组（如 `["weapon", "melee"]`） |
| description | string | | 物品描述文本 |
| maxStack | number | | 最大堆叠数（默认 1） |
| sellable | boolean | | 是否可出售（默认 false） |
| price | number | | 出售价格（默认 0） |

## 示例

```json
{
  "id": "iron_sword",
  "name": "铁剑",
  "tags": ["weapon", "melee"],
  "description": "一把普通的铁制长剑，刀刃略有锈迹。",
  "maxStack": 1,
  "sellable": true,
  "price": 50
}
```

## 注意事项

- tags 是自由文本，无固定枚举值
- maxStack 为 1 表示不可堆叠
- 物品本身不包含效果（effects），效果通过行动系统实现
