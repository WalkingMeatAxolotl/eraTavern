# Trait（特质）

角色的性格、能力、经历等属性，按 category 分组显示。

## 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 英文标识符，下划线命名（如 `brave`） |
| name | string | ✅ | 中文显示名称 |
| category | string | ✅ | 分类 key（必须使用系统定义的分类，见下方） |
| description | string | | 特质描述文本 |
| effects | array | | 效果数组，见下方 |
| defaultValue | number | | 初始值（仅 ability 类型使用） |

## category 分类

category 的值必须从系统 template 定义的分类 key 中选取。
常见分类（具体值以 get_schema 工具返回为准）：

- ability — 能力（如力量、敏捷）
- experience — 经验/经历
- mentalTrait — 精神的特征（如勇敢、内向）
- bodyTrait — 身体的特征（如高挑、强壮）
- techTrait — 技术的特征（如剑术、烹饪）
- other — 其他

**重要**：不要自己发明 category 值，必须使用系统提供的 key。

## effects 效果数组

每个效果元素的结构：

```json
{
  "target": "变量ID",
  "effect": "increase 或 decrease",
  "magnitudeType": "fixed 或 percentage",
  "value": 10
}
```

- target：引用 ID，可以是以下三种之一：
  - **变量 ID**（用 `list_entities(entityType: "variable")` 查看）
  - **能力特质 ID**（category 为 ability 的特质，用 `list_entities(entityType: "trait")` 查看）
  - **基本信息字段 key**（如 money，通过 `get_schema(entityType: "trait")` 查看）
- effect：`increase`（增加）或 `decrease`（减少）
- magnitudeType：`fixed`（固定值）或 `percentage`（百分比）
- value：数值

**重要**：添加 effects 前，先确认 target 引用的 ID 存在。

## 示例

```json
{
  "id": "brave",
  "name": "勇敢",
  "category": "mentalTrait",
  "description": "面对危险时不退缩，总是第一个冲上前。"
}
```

```json
{
  "id": "strong",
  "name": "强壮",
  "category": "bodyTrait",
  "description": "天生力大，能轻松搬动重物。",
  "effects": [
    { "target": "strength", "effect": "increase", "magnitudeType": "fixed", "value": 5 }
  ]
}
```
