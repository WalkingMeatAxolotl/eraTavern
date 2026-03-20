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
| defaultValue | number | | 初始值（仅 ability 类型使用，默认 0，由用户指定） |
| decay | object/null | | 数值回落设置（仅 ability 类型使用），见下方 |

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

## 能力经验值与等级体系（仅 ability 类型）

ability 类型的特质使用经验值（exp）系统，内部以整数存储。等级由经验值自动换算：

| 等级 | 经验值范围 |
|------|-----------|
| G | 0 – 999 |
| F | 1000 – 1999 |
| E | 2000 – 2999 |
| D | 3000 – 3999 |
| C | 4000 – 4999 |
| B | 5000 – 5999 |
| A | 6000 – 6999 |
| S | 7000+ |

**规则：每 1000 经验值 = 1 个等级。**

- `defaultValue` 是角色创建时的初始经验值，也是 decay 回落的目标值。默认为 0（G 级）。
- effects 中 target 指向 ability 时，`value` 操作的是经验值。例如 `"value": 500` 表示增减 500 点经验（半个等级），`"value": 5` 几乎没有效果。
- 设计 effects 时请注意数值量级：个位数的 value 在千位级的经验值体系中影响微乎其微。

## decay 数值回落（仅 ability 类型）

ability 类型的特质可以设置数值回落，使能力值随时间自动向 defaultValue 回归。

| 字段 | 类型 | 说明 |
|------|------|------|
| amount | number | 每次回落的数值量（正整数，percentage 类型时为百分比 1-100） |
| type | string | `"fixed"`（固定值回落）或 `"percentage"`（百分比回落） |
| intervalMinutes | number | 回落间隔（游戏分钟数，最小 5） |

常用 intervalMinutes 换算：
- 每小时 = 60
- 每天（游戏日）= 1440
- 每周 = 10080

示例：每天回落 1%
```json
{
  "decay": {
    "amount": 1,
    "type": "percentage",
    "intervalMinutes": 1440
  }
}
```

示例：每小时固定回落 5 点
```json
{
  "decay": {
    "amount": 5,
    "type": "fixed",
    "intervalMinutes": 60
  }
}
```

- 设为 `null` 表示不回落
- 只有 `category: "ability"` 的特质才使用此字段，其他类型不需要设置
- 创建 ability 时，如果用户没有提到回落/decay，不要添加 decay 字段

## effects 效果数组

每个效果元素的结构：

```json
{
  "target": "变量ID 或 能力特质ID 或 basicInfo字段key",
  "effect": "increase 或 decrease",
  "magnitudeType": "fixed 或 percentage",
  "value": 500
}
```

- target：引用 ID，可以是以下四种之一：
  - **资源 key**（如 stamina、energy，影响其上限 max，默认值通常为 2000）
  - **能力特质 ID**（category 为 ability，经验值体系，每 1000 = 一个等级）
  - **基本信息字段 key**（如 money）
  - **变量 ID**（用 `list_entities(entityType: "variable")` 查看）
  - 使用 `get_schema(entityType: "trait")` 查看完整列表及各 target 的数值范围
- effect：`increase`（增加）或 `decrease`（减少）
- magnitudeType：`fixed`（固定值）或 `percentage`（百分比）
- value：数值（target 为 ability 时注意经验值量级，见上方等级体系说明）

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
    { "target": "strength", "effect": "increase", "magnitudeType": "fixed", "value": 500 }
  ]
}
```

ability 类型示例：
```json
{
  "id": "investigation",
  "name": "调查",
  "category": "ability",
  "description": "搜集线索、分析证据的能力。",
  "defaultValue": 0
}
```
