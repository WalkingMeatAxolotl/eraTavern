# Lorebook（知识库条目）

LLM 叙事生成时注入的背景知识。当叙事上下文中出现匹配的关键词时，对应条目的内容会自动注入到 LLM 的提示词中，让 AI 了解相关设定。

## 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 英文标识符，下划线命名（如 `red_dragon_inn`） |
| name | string | ✅ | 中文显示名称 |
| keywords | string[] | ✅ | 触发关键词数组，任一关键词出现即触发 |
| content | string | ✅ | 注入 LLM 的文本内容（背景设定描述） |
| enabled | boolean | | 是否启用（默认 true） |
| priority | number | | 排序优先级（默认 0，越大越靠前） |
| insertMode | string | | 插入模式，见下方说明（默认 keyword） |

## insertMode 插入模式

- **keyword** — 仅当叙事上下文中出现 keywords 中的任一关键词时，才注入内容。适用于特定场景/角色/地点的设定。
- **always** — 始终注入，不需要关键词匹配。适用于全局性背景设定（如世界观、时代背景）。

## keywords 关键词

- 支持中英文关键词
- 多个关键词之间是"或"关系（任一匹配即触发）
- 建议同时添加不同称呼（如 `["酒馆", "红龙酒馆", "tavern"]`）

## priority 优先级

- 数字越大优先级越高，越靠前注入
- 当多个条目同时触发时，按 priority 降序排列
- 默认为 0

## 示例

场景设定：
```json
{
  "id": "red_dragon_inn",
  "name": "红龙酒馆",
  "keywords": ["酒馆", "红龙", "tavern"],
  "content": "红龙酒馆是镇上最热闹的场所，由退役冒险者经营。二楼有住宿，地下室传说通向古代遗迹。",
  "enabled": true,
  "priority": 0,
  "insertMode": "keyword"
}
```

全局背景（始终注入）：
```json
{
  "id": "world_setting",
  "name": "世界设定",
  "keywords": [],
  "content": "这是一个剑与魔法的世界，人类与精灵、矮人共存。魔法被视为日常，但高阶魔法只有少数人掌握。",
  "enabled": true,
  "priority": 10,
  "insertMode": "always"
}
```

## 注意事项

- content 中可以使用任意文本，会原样注入 LLM 提示词
- 内容应简洁有信息量，避免过长（建议每条不超过 200 字）
- insertMode 为 always 时 keywords 可以为空数组
