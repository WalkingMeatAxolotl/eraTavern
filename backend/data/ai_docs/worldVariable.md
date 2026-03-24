# WorldVariable（世界变量）

全局数值或布尔状态，用于记录世界级别的状态（如声望、天气、剧情进度标记）。
世界变量可被行动的条件（conditions）和效果（effects）引用，也可在 LLM 叙事模板中作为变量使用。

## 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 英文标识符，下划线命名（如 `reputation`） |
| name | string | ✅ | 中文显示名称 |
| type | string | ✅ | 变量类型：`number`（数值）或 `boolean`（布尔） |
| default | number | ✅ | 初始值。number 类型为任意数字，boolean 类型用 `0`（假）或 `1`（真） |
| description | string | | 变量描述文本 |

## type 类型说明

- **number** — 数值变量，可以是任意整数或小数。适用于声望、金钱倍率、剧情计数器等。
- **boolean** — 布尔变量，值只能是 0 或 1。适用于开关状态、剧情标记（如"是否触发过某事件"）。

## 示例

数值型：
```json
{
  "id": "reputation",
  "name": "声望",
  "type": "number",
  "default": 0,
  "description": "玩家在镇上的声望值，范围不限"
}
```

布尔型：
```json
{
  "id": "gate_unlocked",
  "name": "大门已开启",
  "type": "boolean",
  "default": 0,
  "description": "城门是否已被打开"
}
```

## 注意事项

- 世界变量是全局的，不属于任何角色
- 游戏开始时，变量值初始化为 `default`
- 存档会保存当前变量值，读档时恢复
