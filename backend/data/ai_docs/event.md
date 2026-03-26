# Event（事件）

事件是条件触发的全局效果，用于状态变化、剧情推进、定时效果等。

## 创建模式

### mode="ir"（推荐）

使用 IR 简写语法：

```json
{
  "entityType": "event",
  "mode": "ir",
  "payload": {
    "id": "night_danger",
    "name": "夜间危险",
    "triggerMode": "while",
    "cooldown": 60,
    "require": ["time 22-6", "location wilderness"],
    "effects": ["resource hp add -50"],
    "text": "黑暗中传来不祥的声响，你感到一阵寒意。"
  }
}
```

IR 字段与 action 的 condition/effect 子句语法完全相同。

### mode="simple"（完整 JSON）

```json
{
  "id": "night_danger",
  "name": "夜间危险",
  "enabled": true,
  "targetScope": "each_character",
  "triggerMode": "while",
  "cooldown": 60,
  "priority": 0,
  "conditions": [
    {"type": "time", "hourMin": 22, "hourMax": 6},
    {"type": "location", "mapId": "wilderness"}
  ],
  "effects": [
    {"type": "resource", "key": "hp", "op": "add", "target": "self", "value": -50}
  ],
  "outputTemplates": [{"text": "黑暗中传来不祥的声响。"}]
}
```

## 字段说明

| 字段 | 说明 | 默认值 |
|------|------|--------|
| enabled | 是否启用 | true |
| targetScope | each_character（逐角色检查）或 none（全局） | each_character |
| triggerMode | once（只触发一次）/ on_change（条件变真时）/ while（持续触发） | on_change |
| priority | 执行优先级（数字越大越先执行） | 0 |
| cooldown | 冷却分钟数（仅 while 模式） | 10 |
| conditions | 触发条件（同 action 的 condition 语法） | [] |
| effects | 效果（同 action 的 effect 语法） | [] |

## 触发模式

- **once**: 条件满足时触发一次，之后永不再触发（per-character if each_character）
- **on_change**: 条件从 false 变为 true 时触发
- **while**: 条件为 true 期间持续触发，间隔由 cooldown 控制
