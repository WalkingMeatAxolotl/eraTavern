# Clothing（服装）

角色可穿戴的服装/装备，占用特定槽位。

## 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 英文标识符，下划线命名（如 `leather_armor`） |
| name | string | ✅ | 中文显示名称 |
| slots | string[] | ✅ | 占用的槽位数组（必须使用系统定义的槽位，见下方） |
| occlusion | string[] | | 遮挡的槽位数组（穿上后隐藏这些槽位的其他服装） |
| effects | array | | 效果数组，结构同 trait 的 effects |

## 槽位系统

每件服装占用一个或多个槽位。槽位值必须从系统 template 定义中选取。
常见槽位（具体值以 get_schema 工具返回为准）：

- mainHand — 主手
- offHand — 副手
- hat — 帽子/头饰
- upperBody — 上身外衣
- upperUnderwear — 上身内衣
- lowerBody — 下身外衣
- lowerUnderwear — 下身内衣
- hands — 手套
- feet — 袜子/足部
- shoes — 鞋子
- back — 背部（披风、背包等）
- accessory1, accessory2, accessory3 — 饰品槽位

**重要**：不要自己发明槽位名称，必须使用系统提供的值。

## 遮挡机制

occlusion 数组指定穿上此服装后会遮挡的槽位。
例如：外套 `slots: ["upperBody"]`，`occlusion: ["upperUnderwear"]` — 穿上外套后，内衣不可见。

## 示例

```json
{
  "id": "leather_armor",
  "name": "皮甲",
  "slots": ["upperBody"],
  "occlusion": ["upperUnderwear"]
}
```

```json
{
  "id": "iron_gauntlets",
  "name": "铁手套",
  "slots": ["hands"],
  "effects": [
    { "target": "defense", "effect": "increase", "magnitudeType": "fixed", "value": 3 }
  ]
}
```
