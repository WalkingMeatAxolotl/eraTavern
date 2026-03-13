# 全局事件与世界变量系统设计

> **状态：待实施。** 设计已确认。

## 1. 概述

### 1.1 两个组件

本系统包含两个紧密关联的组件，共存于同一个 addon 文件 `events.json` 和同一个编辑器 tab "事件"：

| 组件 | 职责 | 类比 |
|------|------|------|
| **世界变量** (World Variables) | 无归属者的可变 key-value 存储 | 角色有 resources/traits；世界有 worldVariables |
| **全局事件** (Global Events) | 条件满足时自动触发效果，无需角色发起 | 角色有 Actions（主动选择）；世界有 Events（被动触发） |

### 1.2 为什么需要

**现有系统的限制**：所有可变状态都绑定在角色上，所有行动都需要角色发起。

| 场景 | 为什么做不了 |
|------|-------------|
| 酒馆 22:00 打烊 | 没有发起者，是世界状态变化 |
| 玩家踩到陷阱 | 不是 NPC "选择" 触发，是环境反应 |
| 下雨 → 室外角色获得"潮湿" | 没有发起者，是天气对角色的影响 |
| 角色 HP 归零 → 晕倒 | 是状态变化的后果，不是主动选择 |
| "Boss 已击败" 影响后续行动 | 无处存储世界级 flag |

世界变量提供存储层，全局事件提供触发层。

### 1.3 与现有实体的关系

- **不塞进 Action**：Action 语义是"角色的主动选择"，有 npcWeight/costs/outcomes/suggestNext。事件没有发起者、没有选择、没有消耗。
- **不同于派生变量**：派生变量（`variables.json`）是只读计算公式，按需求值不存状态。世界变量是可变 key-value 存储。
- **复用条件/效果引擎**：条件类型（time, location, resource, trait...）和效果类型（resource, ability, item, trait, position...）全部复用。

---

## 2. 世界变量 (World Variables)

### 2.1 数据结构

```typescript
interface WorldVariableDefinition {
  id: string;
  name: string;
  description?: string;
  source: string;           // addon source
  type: "number" | "boolean";
  default: number;          // boolean: 0 = false, 1 = true
}
```

### 2.2 运行时存储

```python
game_state.world_variables = {
    "tavern_open": 1,
    "boss_defeated": 0,
    "alert_level": 0,
}
```

初始化：`load_world()` 时从 `events.json` 的 `worldVariables` 读取定义，用 `default` 值填充 `world_variables`。

### 2.3 在条件中引用

新增条件类型 `worldVar`：

```json
{ "type": "worldVar", "key": "tavern_open", "op": "==", "value": 1 }
```

支持比较运算符：`>=`, `<=`, `>`, `<`, `==`, `!=`。

可用于：
- 全局事件的条件
- Action 的条件（控制行动可用性）
- Action 的 npcWeight 修正（影响 NPC 决策）

### 2.4 在效果中修改

新增效果类型 `worldVar`：

```json
{ "type": "worldVar", "key": "tavern_open", "op": "set", "value": 0 }
{ "type": "worldVar", "key": "alert_level", "op": "add", "value": 1 }
```

支持操作：`set`, `add`。

可用于：
- 全局事件的效果
- Action 的效果（玩家行动改变世界状态）

### 2.5 间接实现"世界效果"

通过世界变量 + 条件组合，无需专用 effect 类型即可实现大部分世界状态效果：

```
世界变量: tavern_open = 0

→ Action 条件: {type: "worldVar", key: "tavern_open", op: "==", value: 1}
  酒馆相关行动自然不可用

→ NPC 权重修正: {type: "worldVar", key: "tavern_open", per: 1, bonus: -9999}
  NPC 不会选择进酒馆

→ 事件效果: {type: "worldVar", key: "tavern_open", op: "set", value: 0}
  22:00 事件触发 → 设置 tavern_open = 0
```

真正需要运行时修改地图结构的场景（锁 connection、改 cell 属性）很少，作为未来扩展。

### 2.6 存档

`world_variables` 写入存档 `runtime.worldVariables`，读档时恢复。新存档无此字段时用定义的 `default` 值初始化（前向兼容）。

---

## 3. 全局事件 (Global Events)

### 3.1 EventDefinition

```typescript
interface EventDefinition {
  id: string;
  name: string;
  description?: string;
  source: string;

  // --- 触发控制 ---
  triggerMode: "on_change" | "while" | "once";
  cooldown?: number;          // 分钟，仅 while 模式
  enabled?: boolean;          // 默认 true

  // --- 条件 ---
  conditions: ConditionItem[];    // 复用现有条件系统 + worldVar 条件

  // --- 目标 ---
  targetScope: "each_character" | "none";

  // --- 效果 ---
  effects: ActionEffect[];       // 复用现有效果系统 + worldVar 效果
  outputTemplate?: string;
  outputTemplates?: OutputTemplateEntry[];
}
```

### 3.2 triggerMode 详解

| 模式 | 语义 | 适用场景 | 状态追踪 |
|------|------|---------|---------|
| `on_change` | 条件从"不满足"变为"满足"的瞬间触发一次 | 踩陷阱、进入区域、HP 归零、时间到达 | 记录上一次条件状态 |
| `while` | 条件持续满足期间，每隔 cooldown 分钟触发一次 | 持续中毒、雨天淋湿、岩浆灼烧 | 记录上次触发时间 |
| `once` | 触发一次后永久停用 | 首次进入 Boss 房、一次性剧情 | 记录是否已触发 |

### 3.3 targetScope 详解

**`each_character`**：遍历所有活跃角色，对每个角色独立检查条件、独立应用效果。条件中的 "self" 指当前被检查的角色。

**`none`**：不遍历角色。条件只能包含非角色条件（time、weather、worldVar 等）。效果中使用 `worldVar` 类型修改世界变量，或指定具体角色 ID 应用角色效果。

### 3.4 运行时状态

```python
game_state.event_state = {
    "event_id": {
        # on_change: 每个角色/全局的上次条件状态
        "last_match": {"char_id_1": True, "__global__": False},
        # while: 每个角色/全局的上次触发时间
        "last_trigger": {"char_id_1": 14350},
        # once: 是否已触发
        "fired": False,           # none scope
        "fired_chars": ["char1"], # each_character scope
    }
}
```

---

## 4. 评估流程

### 4.1 检测粒度

**决定：每个 NPC tick 内部评估。**

理由：
- NPC 路过陷阱格但没停下来的情况需要被捕获
- 开销可接受（~1-2ms/tick，20 事件 × 10 角色 = 200 次条件检查）
- 与"停留触发"的区分由 `triggerMode` 控制（`on_change` = 路过触发，`while` = 停留触发）

### 4.2 评估时机

```
玩家执行行动
  → 推进游戏时间
  → ★ 评估事件（针对玩家）★     ← 捕获玩家移动/状态变化
  → NPC tick 循环:
      NPC 移动/完成行动
      → ★ 评估事件（针对该 NPC）★  ← 捕获 NPC 路过触发
  → 推送状态更新
```

- 玩家行动后、NPC ticks 前：评估一次全局事件（捕获玩家踩陷阱等）
- 每个 NPC tick 内部：NPC 位置/状态变化后再评估一次（捕获 NPC 路过触发）
- `targetScope: "none"` 的事件只在第一次（玩家行动后）评估，不在 NPC tick 内部重复

### 4.3 评估伪代码

```python
def evaluate_events(game_state, scope_filter=None, char_filter=None):
    """评估全局事件。

    scope_filter: 只评估指定 scope（"each_character" / "none"）
    char_filter: 只评估指定角色（用于 NPC tick 内部）
    """
    current_time = game_state.time.total_minutes
    results = []

    for event_def in game_state.event_defs.values():
        if not event_def.get("enabled", True):
            continue
        mode = event_def["triggerMode"]
        scope = event_def["targetScope"]
        if scope_filter and scope != scope_filter:
            continue

        state = game_state.event_state.setdefault(event_def["id"], {})

        if scope == "each_character":
            chars = {char_filter: game_state.characters[char_filter]} if char_filter else game_state.characters
            for char_id, char in chars.items():
                matched = _evaluate_conditions(
                    event_def["conditions"], char, game_state, char_id=char_id
                )
                if _should_fire(mode, state, char_id, matched, current_time, event_def):
                    _apply_event_effects(event_def, char_id, char, game_state)
                    results.append((event_def, char_id))
                _update_state(mode, state, char_id, matched, current_time)

        elif scope == "none":
            matched = _evaluate_global_conditions(event_def["conditions"], game_state)
            if _should_fire(mode, state, "__global__", matched, current_time, event_def):
                _apply_event_effects(event_def, None, None, game_state)
                results.append((event_def, None))
            _update_state(mode, state, "__global__", matched, current_time)

    return results
```

---

## 5. 文件格式

### 5.1 events.json（世界变量 + 事件共存）

```json
{
  "worldVariables": [
    {
      "id": "tavern_open",
      "name": "酒馆营业中",
      "type": "number",
      "default": 1
    },
    {
      "id": "boss_defeated",
      "name": "Boss已击败",
      "type": "boolean",
      "default": 0
    }
  ],
  "events": [
    {
      "id": "tavern_close",
      "name": "酒馆打烊",
      "triggerMode": "on_change",
      "targetScope": "none",
      "conditions": [
        { "type": "time", "hourMin": 22, "hourMax": 22 }
      ],
      "effects": [
        { "type": "worldVar", "key": "tavern_open", "op": "set", "value": 0 }
      ],
      "outputTemplate": "酒馆打烊了，大门已关闭。"
    },
    {
      "id": "tavern_open_morning",
      "name": "酒馆开门",
      "triggerMode": "on_change",
      "targetScope": "none",
      "conditions": [
        { "type": "time", "hourMin": 8, "hourMax": 8 }
      ],
      "effects": [
        { "type": "worldVar", "key": "tavern_open", "op": "set", "value": 1 }
      ],
      "outputTemplate": "酒馆开门营业了。"
    },
    {
      "id": "spike_trap",
      "name": "尖刺陷阱",
      "triggerMode": "on_change",
      "targetScope": "each_character",
      "conditions": [
        { "type": "location", "mapId": "dungeon", "cellIds": [5] }
      ],
      "effects": [
        { "type": "resource", "key": "hp", "op": "add", "value": -20 }
      ],
      "outputTemplate": "{{self.name}} 踩到了陷阱！受到 20 点伤害。"
    },
    {
      "id": "poison_gas",
      "name": "毒气区域",
      "triggerMode": "while",
      "cooldown": 10,
      "targetScope": "each_character",
      "conditions": [
        { "type": "location", "mapId": "dungeon", "cellIds": [7, 8] },
        { "type": "noTrait", "traitGroup": "status", "traitId": "poison_resist" }
      ],
      "effects": [
        { "type": "resource", "key": "hp", "op": "add", "value": -5 },
        { "type": "trait", "key": "status", "op": "addTrait", "traitId": "poisoned" }
      ],
      "outputTemplate": "{{self.name}} 在毒气中受到了伤害。"
    },
    {
      "id": "boss_room_intro",
      "name": "Boss 房间触发",
      "triggerMode": "once",
      "targetScope": "each_character",
      "conditions": [
        { "type": "location", "mapId": "dungeon", "cellIds": [20] }
      ],
      "effects": [
        { "type": "resource", "key": "hp", "op": "set", "value": 100, "valuePercent": true },
        { "type": "worldVar", "key": "boss_defeated", "op": "set", "value": 1 }
      ],
      "outputTemplate": "{{self.name}} 感受到一股强大的气息...体力完全恢复了。"
    }
  ]
}
```

### 5.2 Addon 目录结构

```
addons/{addon-id}/{version}/
├── addon.json
├── actions.json
├── traits.json
├── variables.json       ← 派生变量（只读计算公式）
├── events.json          ← 世界变量 + 全局事件（新增）
└── ...
```

---

## 6. 存档集成

### 6.1 存档内容

`snapshot_save_data()` 新增：

```python
{
    "runtime": {
        ...existing fields...,
        "worldVariables": {"tavern_open": 1, "boss_defeated": 0},
        "eventState": {"spike_trap": {"last_match": {"char1": true}}}
    }
}
```

### 6.2 恢复逻辑

`restore_save_data()`:
- `world_variables`: 从存档恢复。存档中没有的 key 用定义的 `default` 填充（新增变量兼容）
- `event_state`: 从存档恢复。`.get("eventState", {})` 兜底（旧存档兼容）

---

## 7. 性能

| 指标 | 值 |
|------|---|
| 评估频率 | 每次玩家行动后 + 每个 NPC tick 内 |
| 计算量 | 20 事件 × 10 角色 = 200 次条件检查 ≈ 1-2ms |
| 状态内存 | ~4KB（20 事件 × 10 角色 × 20 字节） |
| 世界变量内存 | 忽略不计（几十个 number） |

---

## 8. 编辑器

### 8.1 NavBar tab

新增 "事件" tab，编辑页内包含两个 section：

```
== 世界变量 ==

┌───────────────────────────────────────────┐
│ tavern_open  酒馆营业中    number  默认: 1  │
│ boss_defeated Boss已击败  boolean 默认: 0  │
│                                           │
│ [+ 添加变量]                               │
└───────────────────────────────────────────┘

== 全局事件 ==

┌─ 尖刺陷阱 ────────────────────────────────┐
│ ID: spike_trap  触发: on_change            │
│ 目标: each_character                       │
│                                           │
│ ┌─ 条件 ──────────────────────────┐       │
│ │ [location] dungeon cellIds:[5]  │       │
│ └─────────────────────────────────┘       │
│ ┌─ 效果 ──────────────────────────┐       │
│ │ [resource] hp add -20           │       │
│ └─────────────────────────────────┘       │
│ 输出: {{self.name}} 踩到了陷阱！...       │
└───────────────────────────────────────────┘
```

条件编辑器和效果编辑器直接复用 ActionEditor 中的组件。

---

## 9. 实现计划

| 阶段 | 内容 | 改动文件 |
|------|------|---------|
| **Phase 1** | 数据结构 + 加载 + 世界变量 runtime | `character.py`（load/save events.json）, `state.py`（event_defs, world_variables, event_state 字段）, `types/game.ts` |
| **Phase 2** | 条件/效果引擎扩展 | `action.py`（worldVar 条件类型 + worldVar 效果类型） |
| **Phase 3** | 事件评估引擎 | `action.py`（新增 `evaluate_events`）, 集成到游戏循环 |
| **Phase 4** | 存档集成 | `state.py`（snapshot/restore 扩展） |
| **Phase 5** | 前端编辑器 | 新增 `EventManager.tsx` / `EventEditor.tsx`, `NavBar` 加 tab |

---

## 10. 未来扩展

### 10.1 世界实体运行时修改

世界变量 + 条件组合能覆盖大部分场景，但以下需要专用 effect 类型：

- `type: "connection"`: 运行时修改地图连接属性（物理锁门，不只是条件屏蔽）
- `type: "cell"`: 运行时修改格子属性（标签、颜色）
- `type: "spawn"`: 运行时生成/移除 NPC

### 10.2 条件扩展

- `type: "eventFired"`: 检查另一个事件是否已触发（事件间依赖）

### 10.3 事件优先级

当多个事件同时触发时，可能需要定义执行顺序或互斥关系。目前按定义顺序执行。
