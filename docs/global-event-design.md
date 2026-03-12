# 全局事件系统设计

> **状态：设计中，暂未实施。** 待未来需要时继续。

## 0. 待解决问题

在实施前需要确定：

1. **检测粒度**：事件是每个 NPC tick 都评估，还是只在整轮模拟结束后评估？
   - 如果只在模拟结束后评估，NPC **路过**陷阱格但没停下来的情况会漏掉
   - 如果每 tick 都评估，能捕获中间位置，但评估频率更高（开销可接受，约 1-2ms/tick）
   - 需要决定："路过触发"还是"停留触发"——这决定了评估放在 tick 循环内部还是外部
2. **玩家 vs NPC 的评估时机**：玩家移动后需要在进入 `simulate_npc_ticks` 前先评估一次（捕获玩家自己踩陷阱），NPC 移动在 tick 循环内
3. **`targetScope: "none"` 的实用性**：目前无目标事件只能输出文本，"锁门"等世界状态效果需要新的效果类型（`type: "connection"` 等），v1 是否需要？

## 1. 为什么需要全局事件

### 1.1 现有行动系统的前提

当前所有行动（Action）都需要一个**发起者**：

- 玩家行动：玩家从菜单中选择
- NPC 行动：NPC 决策系统根据权重自主选择

即：**每个行动 = 某个角色主动选择做某件事**。

### 1.2 现有系统无法表达的场景

以下场景没有"发起者"，或者发起者不是角色：

| 场景 | 为什么现有系统做不了 |
|------|---------------------|
| 玩家踩到陷阱 → 受到伤害 | 没有 NPC "选择"触发陷阱，是环境对进入者的反应 |
| 22:00 酒馆打烊 → 锁门、熄灯 | 不是某个角色的行动，是世界状态随时间变化 |
| 天黑 → 所有 NPC 回家 | 可以用高权重 time 条件近似，但不可靠且散落在每个 NPC 的行动定义里 |
| 角色体力归零 → 晕倒 | 是状态变化的后果，不是主动选择 |
| 下雨 → 室外角色获得"潮湿"状态 | 没有发起者，是天气对所有室外角色的影响 |

### 1.3 核心矛盾

现有系统是 **"角色驱动"** 的：角色选择行动 → 行动产生效果。

但游戏世界中存在 **"世界驱动"** 的事件：条件满足 → 效果直接发生，不需要任何角色"选择"。

---

## 2. 设计方向：独立实体，复用基础设施

### 2.1 为什么不塞进 Action

Action 的核心语义是"角色的主动选择"，围绕这个语义构建了 npcWeight、costs、outcomes（结果分级）、suggestNext 等机制。全局事件没有发起者、没有选择、没有消耗，强行塞入会：

- 让 Action 概念模糊（"这个 action 谁来选？没人选，它自己触发"）
- 编辑器里难以区分（一堆 action 里混着几个"其实不是 action"的东西）
- 生命周期完全不同（action = 选择→执行一次；事件 = 持续监测→条件满足时触发）

### 2.2 复用什么

全局事件虽然是独立实体，但**条件和效果的数据结构完全复用**：

| 复用 | 来源 | 说明 |
|------|------|------|
| `ConditionItem` | 行动条件引擎 | time、location、resource、trait 等条件类型全部可用 |
| `ActionEffect` | 行动效果引擎 | resource、ability、trait、item、position 等效果类型全部可用 |
| `OutputTemplateEntry` | 行动模板 | 触发时的文本输出 |
| `ValueModifier` | 数值修正 | 效果值的动态修正 |

不复用：npcWeight、costs、outcomes、suggestNext、targetType。

### 2.3 Addon 集成

- 新增 `events.json` 文件，与 `actions.json`、`traits.json` 同级
- addon_loader 加载时读取，namespace 处理方式一致
- 编辑器新增 EventEditor tab

---

## 3. 数据结构

### 3.1 EventDefinition

```typescript
interface EventDefinition {
  id: string;
  name: string;
  description?: string;
  source: string;             // addon source（与其他实体一致）

  // --- 触发控制 ---
  triggerMode: "on_change" | "while" | "once";
  cooldown?: number;          // 分钟，仅 while 模式使用（两次触发的最小间隔）
  enabled?: boolean;          // 默认 true，false 则跳过检测

  // --- 条件 ---
  conditions: ConditionItem[];    // 什么时候触发？复用现有条件系统

  // --- 目标 ---
  targetScope: "each_character" | "none";
  // each_character: 遍历所有角色，逐个检查条件，对匹配者应用效果
  // none: 无目标角色，纯世界事件（效果的 target 可指定具体角色 ID）

  // --- 效果 ---
  effects: ActionEffect[];
  outputTemplate?: string;
  outputTemplates?: OutputTemplateEntry[];
}
```

### 3.2 triggerMode 详解

| 模式 | 语义 | 适用场景 | 状态追踪 |
|------|------|---------|---------|
| `on_change` | 条件从"不满足"变为"满足"的瞬间触发一次 | 踩陷阱、进入区域、HP 归零、时间到达 | 需要记录上一次条件状态 |
| `while` | 条件持续满足期间，每隔 cooldown 分钟触发一次 | 持续中毒扣血、雨天持续淋湿、站在岩浆上持续灼烧 | 需要记录上次触发时间 |
| `once` | 触发一次后永久停用 | 首次进入 Boss 房、一次性剧情触发 | 需要记录是否已触发 |

### 3.3 targetScope 详解

**`each_character`**：遍历所有活跃角色，对每个角色独立检查条件、独立应用效果。

```
对每个角色:
  conditions 中的 location/resource/trait 等检查该角色的状态
  if 条件满足 → 对该角色应用 effects
```

条件中的"self"指当前被检查的角色。效果中的 `target: "self"` 也指该角色。

**`none`**：不遍历角色。条件只能包含非角色条件（time、weather 等）。效果的 target 需要指定具体角色 ID 或留空（用于未来的世界状态效果）。

### 3.4 运行时状态

```python
game_state.event_state = {
    "event_id": {
        # on_change 模式：记录每个角色的上次条件状态
        "last_match": {
            "char_id_1": True,   # 上一 tick 是否匹配
            "char_id_2": False,
        },
        # while 模式：记录每个角色的上次触发时间
        "last_trigger": {
            "char_id_1": 14350,  # 游戏内总分钟
        },
        # once 模式：记录是否已触发
        "fired": False,          # none scope
        "fired_chars": ["char_id_1"],  # each_character scope
    }
}
```

实际实现中，每种 triggerMode 只需要对应的字段，不需要全部。

---

## 4. 评估流程

### 4.1 在游戏循环中的位置

```
玩家执行行动
  → 推进游戏时间
  → ★ 评估全局事件 ★     ← 新增
  → NPC tick（完成行动 → 选择下一个行动）
  → 推送状态更新
```

事件在时间推进后、NPC 决策前评估，确保：
- 时间条件是最新的
- 事件效果在 NPC 决策前生效（如"天黑关门"影响 NPC 可用行动）

### 4.2 评估伪代码

```python
def evaluate_events(game_state):
    current_time = game_state.time.total_minutes
    results = []

    for event_def in game_state.event_defs.values():
        if not event_def.get("enabled", True):
            continue

        mode = event_def["triggerMode"]
        scope = event_def["targetScope"]
        state = game_state.event_state.setdefault(event_def["id"], {})

        if scope == "each_character":
            for char_id, char in game_state.characters.items():
                matched = _evaluate_conditions(
                    event_def["conditions"], char, game_state, char_id=char_id
                )
                if _should_fire(mode, state, char_id, matched, current_time, event_def):
                    _apply_event_effects(event_def, char_id, char, game_state)
                    results.append((event_def, char_id))
                _update_state(mode, state, char_id, matched, current_time)

        elif scope == "none":
            # 只检查非角色条件（time, weather 等）
            matched = _evaluate_global_conditions(event_def["conditions"], game_state)
            if _should_fire(mode, state, "__global__", matched, current_time, event_def):
                _apply_event_effects(event_def, None, None, game_state)
                results.append((event_def, None))
            _update_state(mode, state, "__global__", matched, current_time)

    return results


def _should_fire(mode, state, key, matched, current_time, event_def):
    if mode == "on_change":
        was_matched = state.get("last_match", {}).get(key, False)
        return matched and not was_matched

    elif mode == "while":
        if not matched:
            return False
        cooldown = event_def.get("cooldown", 1)
        last = state.get("last_trigger", {}).get(key, -9999)
        return (current_time - last) >= cooldown

    elif mode == "once":
        if not matched:
            return False
        if key == "__global__":
            return not state.get("fired", False)
        else:
            return key not in state.get("fired_chars", [])

    return False
```

---

## 5. JSON 配置示例

### 5.1 踩陷阱（on_change + each_character）

```json
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
  "outputTemplate": "{{charName}} 踩到了陷阱！受到 20 点伤害。"
}
```

**行为**：任何角色进入 dungeon 地图的 cellId=5 时触发一次。离开后再进入会再次触发。

### 5.2 持续中毒（while + each_character）

```json
{
  "id": "poison_gas",
  "name": "毒气区域",
  "triggerMode": "while",
  "cooldown": 10,
  "targetScope": "each_character",
  "conditions": [
    { "type": "location", "mapId": "dungeon", "cellIds": [7, 8] },
    { "type": "noTrait", "traitId": "poison_resist" }
  ],
  "effects": [
    { "type": "resource", "key": "hp", "op": "add", "value": -5 },
    { "type": "trait", "key": "status", "op": "add", "traitId": "poisoned" }
  ],
  "outputTemplate": "{{charName}} 在毒气中受到了伤害。"
}
```

**行为**：在毒气格子里每 10 分钟扣 5 HP + 附加"中毒"状态。有"毒抗"特质的角色免疫。

### 5.3 酒馆打烊（on_change + none）

```json
{
  "id": "tavern_close",
  "name": "酒馆打烊",
  "triggerMode": "on_change",
  "targetScope": "none",
  "conditions": [
    { "type": "time", "hourMin": 22, "hourMax": 22 }
  ],
  "effects": [],
  "outputTemplate": "酒馆打烊了，大门已关闭。"
}
```

> **注**：`none` 目标 + 空效果的事件目前只能输出文本。锁门/改地图状态等"世界效果"需要未来扩展效果类型（如 `type: "connection"` 修改连接属性）。

### 5.4 首次进入 Boss 房（once + each_character）

```json
{
  "id": "boss_room_intro",
  "name": "Boss 房间触发",
  "triggerMode": "once",
  "targetScope": "each_character",
  "conditions": [
    { "type": "location", "mapId": "dungeon", "cellIds": [20] }
  ],
  "effects": [
    { "type": "resource", "key": "hp", "op": "set", "value": 100 },
    { "type": "resource", "key": "mp", "op": "set", "value": 100 }
  ],
  "outputTemplate": "{{charName}} 感受到一股强大的气息...体力与魔力完全恢复了。"
}
```

**行为**：每个角色第一次进入时触发，之后再进入不再触发。

---

## 6. 持久化

### 6.1 事件状态

`event_state` 是运行时状态，需要存档：

- 保存：写入 `save/event_state.json`
- 加载：读取恢复到 `game_state.event_state`
- 格式与运行时结构一致

### 6.2 事件定义

事件定义在 addon 的 `events.json` 中，与其他实体一致：

```
addons/{addon-id}/{version}/
├── addon.json
├── actions.json
├── traits.json
├── events.json      ← 新增
└── ...
```

---

## 7. 性能分析

### 7.1 评估频率

事件在每次时间推进时评估（每次玩家行动后）。不是每帧，开销可控。

### 7.2 计算量

```
每次评估:
  E 个事件 × C 个角色 × 条件检查
  典型值: 20 事件 × 10 角色 = 200 次条件检查
  每次条件检查 ≈ 行动条件检查（已经很轻量）
  总计 ≈ 1-2ms
```

### 7.3 状态内存

```
每个事件:
  on_change: C 个 bool ≈ 10 字节/角色
  while: C 个 int ≈ 8 字节/角色
  once: C 个 str list ≈ 20 字节/角色

20 事件 × 10 角色 × 20 字节 = 4 KB
```

---

## 8. 编辑器

### 8.1 新增 EventEditor tab

在编辑器导航中新增"事件"tab，与行动、特质等同级。

### 8.2 UI 布局

```
┌─ 事件: 尖刺陷阱 ──────────────────────────────┐
│ ID: [spike_trap]  名称: [尖刺陷阱]              │
│                                                │
│ 触发模式: [on_change ▼]  冷却: [—]             │
│ 目标范围: [each_character ▼]                    │
│                                                │
│ ┌─ 条件 ─────────────────────────────────┐     │
│ │ [location] 地图:[dungeon] 格子:[5]     │     │
│ └────────────────────────────────────────┘     │
│                                                │
│ ┌─ 效果 ─────────────────────────────────┐     │
│ │ [resource] hp  add  -20               │     │
│ └────────────────────────────────────────┘     │
│                                                │
│ ┌─ 输出模板 ─────────────────────────────┐     │
│ │ {{charName}} 踩到了陷阱！             │     │
│ └────────────────────────────────────────┘     │
└────────────────────────────────────────────────┘
```

条件编辑器和效果编辑器直接复用 ActionEditor 中的 ConditionEditor 和 EffectEditor 组件。

---

## 9. 实现计划

| 阶段 | 内容 | 改动范围 |
|------|------|---------|
| **Phase 1** | 数据结构 + 加载 | `types/game.ts`, `addon_loader.py`, `state.py` |
| **Phase 2** | 评估引擎 | `action.py`（新增 `evaluate_events`）, `state.py`（事件状态） |
| **Phase 3** | 集成到游戏循环 | `action.py`（`simulate_npc_ticks` 中调用）, `state.py`（持久化） |
| **Phase 4** | 前端编辑器 | 新增 `EventEditor.tsx`, `NavBar` 加 tab |

---

## 10. 未来扩展

### 10.1 世界效果类型

`targetScope: "none"` 目前效果有限。未来可扩展：

- `type: "connection"`: 修改地图连接属性（锁门/开门）
- `type: "cell"`: 修改格子属性（标签、背景）
- `type: "spawn"`: 生成/移除 NPC

### 10.2 条件扩展

可能需要的新条件类型：

- `type: "eventFired"`: 检查另一个事件是否已触发（事件间依赖）
- `type: "questState"`: 任务状态（如果加入任务系统）

### 10.3 事件优先级

当多个事件同时触发时，可能需要定义执行顺序或互斥关系。目前按定义顺序执行。
