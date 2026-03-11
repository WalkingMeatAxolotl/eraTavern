# NPC 行为系统设计

## 1. 问题描述

### 1.1 现状

当前 NPC 行为基于 **Utility AI**（效用驱动）：

```
每个 tick:
  完成当前行动 → 清空 goal → 扫描所有 action → 计算 npcWeight + modifiers → 选最高的 → 执行
```

NPC 每次决策都是**无记忆**的——不知道自己上一秒在做什么，也不关心。

### 1.2 导致的问题

- **行为碎片化**：做完"做菜"后，如果"打扫卫生"权重恰好更高，就去打扫了，菜放着没人端
- **缺乏连贯性**：酒馆女仆应该 起床→打扫→备料→做菜→端菜→招待，但现在每一步都是独立决策
- **不符合直觉**：现实中人的行为有惯性——做了 A 之后自然会想做 B

### 1.3 额外需求：全局被动事件

除 NPC 行为连贯性外，还存在一类需求：

- 玩家踩到陷阱 → 自动触发伤害
- 天黑了 → 所有 NPC 回家
- 酒馆打烊 → 触发关门事件

这些不是 NPC 主动选择的，而是条件满足时自动发生的**被动事件**。

> **注**：全局事件与行为连贯性是不同的问题，可独立设计。本文档聚焦行为连贯性，全局事件触发器留待后续文档。

---

## 2. 其他引擎的参考

### 2.1 Era/Emuera — 固定状态机 + 钩子

Era 的核心是硬编码的游戏循环：

```
TITLE → FIRST → TRAIN ⟲ → AFTERTRAIN → TURNEND → loop
```

TRAIN 阶段内部：

```
@SHOW_STATUS → @COM_ABLExx(检查指令可用) → 玩家选择
  → @EVENTCOM(前钩子) → @COMxx(执行) → @SOURCE_CHECK(结算) → @EVENTCOMEND(后钩子)
  → 回到 @SHOW_STATUS
```

**特点**：
- 没有 NPC 自主行为，回合制交互
- "链"通过状态变量实现：指令修改参数，参数影响下一轮可用指令
- 钩子系统（@EVENTCOM / @EVENTCOMEND）可在行动前后注入逻辑

### 2.2 RPG Maker — 事件页 + 条件开关 + 并行处理

NPC 行为 = 事件（Event），每个事件有多个页（Page），每页有激活条件：

```
事件: 酒馆女仆
├── Page 1: [开关"白天"=ON] → 随机走动 / 对话: "欢迎"
├── Page 2: [开关"做菜中"=ON] → 固定在厨房 / 对话: "正忙..."
└── Page 3: [开关"夜晚"=ON] → 移动路线: 走向卧室
```

**触发类型**：
- 自动执行(Autorun)：条件满足时自动运行，阻塞玩家
- 并行处理(Parallel)：条件满足时持续运行，不阻塞
- 公共事件(Common Event)：全局触发器，并行监测条件

**特点**：
- NPC 没有 AI，全部预编排脚本
- 并行处理公共事件 = 全局条件监测器（陷阱房的实现方式）

### 2.3 The Sims — 需求驱动 + 行动队列

与我们系统最接近的架构：

```
Sim 有需求(Needs): 饥饿=80, 社交=30, 乐趣=50
  → 对每个可用行动计算效用分(Utility Score)
  → 选最高的 → "做菜"
  → 展开为行动序列: [走到冰箱 → 取食材 → 烹饪 → 端菜 → 吃]
  → 队列执行期间不重评（除非紧急需求打断）
```

**行动队列是关键**：一个"意图"展开为整条行动序列，执行期间不改变主意。

**自主层级**：
```
紧急需求（快饿死） → 打断当前行动
  ↓ 无紧急
普通需求评估 → 选最高效用行动
  ↓ 行动内部
行动序列自动执行
```

### 2.4 RimWorld — 行为树 + 工作优先级

```
Think Tree:
├── 紧急: 着火？→ 灭火
├── 工作: (按优先级)
│   ├── P1: 烹饪 → 有原料？→ Job
│   ├── P2: 建造 → 有蓝图？→ Job
│   └── P3: 清洁 → 有脏地板？→ Job
└── 闲置: 闲逛
```

每个 Job 完成后重新遍历 Think Tree。没有显式链，靠优先级保证连贯。

### 2.5 对比总结

| | Era | RPG Maker | The Sims | RimWorld | 我们 |
|--|-----|-----------|----------|----------|------|
| NPC 自主性 | 无 | 无（脚本） | 有（需求驱动） | 有（行为树） | 有（权重驱动） |
| 行为连贯性 | N/A | 脚本保证 | 行动队列 | 优先级保证 | **无（每tick重选）** |
| 事件链 | 钩子+数值 | 开关+事件页 | 意图→序列展开 | 无显式链 | **无** |
| 全局事件 | 钩子函数 | 并行处理公共事件 | 紧急需求打断 | 紧急行为树节点 | **无** |
| 数据驱动 | 半（ERB脚本） | 否（编辑器） | 否（代码） | 否（C#代码） | **是（JSON）** |

---

## 3. 被否决的方案

### 3.1 方案 A：显式行为链（nextAction 强制跳转）

```json
{ "outcomes": [{ "grade": "success", "effects": [...], "nextAction": "serve_food" }] }
```

- **否决原因**：行为变成预编排脚本，**破坏数据驱动的涌现效应**
- NPC 不再是"自主选择"，而是被链条牵着走

### 3.2 方案 B：行动队列（Sims 式序列）

```json
{ "id": "prepare_meal_sequence", "steps": ["gather", "cook", "serve"] }
```

- **否决原因**：同样是预编排，且需要新实体类型，复杂度高
- 序列内无决策，本质上和方案 A 一样牺牲涌现性

### 3.3 方案 C-1：行为记忆纯惯性（同 category 自动加权）

同 category 的行动完成后，所有同 category 行动获得权重加成。

- **否决原因**：粒度太粗。"做菜"和"端菜"可能不在同一 category，而同 category 内无法区分逻辑上的因果关系（做完菜该端菜，不是再做一次菜）

### 3.4 方案 C-2：在被影响方声明历史依赖

```json
{ "id": "serve_food", "npcWeightModifiers": [{ "type": "history", "actionId": "cook", "bonus": 80 }] }
```

- **否决原因**：逻辑分散。看 `cook` 的定义时看不出它和 `serve_food` 有关联，关联关系散落在各个行动的 modifiers 里，难以维护

### 3.5 方案 C-3：在行动级别声明 afterAction

```json
{ "id": "cook", "afterAction": [{ "actionId": "serve_food", "bonus": 80, "decay": 60 }] }
```

- **接近但不够**：无法区分不同结果。做菜大成功 vs 大失败后，suggestNext 的合理性不同
- 反驳：失败情况可以靠 `serve_food` 本身的条件拦截（如"没有待端菜品"），不需要链来处理
- 但 outcome 级别声明更直观：编辑者在写结果时就能表达"成功了接下来干什么"

---

## 4. 采用方案：行为提示（Suggest Next）

### 4.1 设计原则

- **不破坏涌现**：suggestNext 是权重加成，不是强制跳转。NPC 仍然自主选择，只是"做完 A 后更倾向于做 B"
- **数据驱动**：配置在 JSON 中，与现有 action 定义一致
- **在影响方声明**：写在产生影响的 outcome 上，因果关系一目了然
- **现有条件兜底**：异常情况（失败、缺资源）由目标行动的条件系统拦截，suggestNext 不需要处理

### 4.2 数据结构

#### 4.2.1 ActionOutcome 扩展

在 `ActionOutcome` 上新增可选字段 `suggestNext`：

```typescript
interface ActionOutcome {
  grade: string;
  label: string;
  weight: number;
  weightModifiers?: WeightModifier[];
  effects: ActionEffect[];
  outputTemplate?: string;
  outputTemplates?: OutputTemplateEntry[];

  // ====== 新增 ======
  suggestNext?: SuggestNext[];
}

interface SuggestNext {
  actionId?: string;    // 建议的下一个行动 ID（与 category 二选一）
  category?: string;    // 建议的行动分类（与 actionId 二选一）
  bonus: number;        // 权重加成值（加到 npcWeight 上）
  decay: number;        // 衰减时间（游戏内分钟），超过后加成归零
}
```

**匹配规则**：
- 指定 `actionId` 时：只加成该行动
- 指定 `category` 时：加成所有 `category` 匹配的行动
- 两者互斥，不可同时指定

#### 4.2.2 NPC 运行时状态扩展

NPC 维护一个**行为历史列表**，记录最近完成的多次行动。多次记录的 suggestNext 可叠加，过期的自然衰减为零。

```python
game_state.npc_action_history = {
    "npc_id_1": [
        {
            "actionId": "gather",
            "suggestNext": [
                {"actionId": "cook", "bonus": 60, "decay": 60}
            ],
            "completedAt": 14350   # 游戏内总分钟数
        },
        {
            "actionId": "cook",
            "suggestNext": [
                {"actionId": "serve_food", "bonus": 80, "decay": 60},
                {"actionId": "taste_test", "bonus": 40, "decay": 30}
            ],
            "completedAt": 14400
        }
    ]
}
```

**列表长度自限**：记录在 decay 后失效，活跃记忆一般 2-4 条，极端不超过 8 条（上限 ≈ 最大 decay / 平均行动耗时 ≈ 120min / 15min）。

### 4.3 JSON 配置示例

```json
{
  "id": "cook",
  "name": "做菜",
  "category": "厨房",
  "npcWeight": 40,
  "conditions": [
    { "type": "location", "mapId": "tavern", "cellIds": [3] },
    { "type": "hasItem", "itemId": "ingredients" }
  ],
  "costs": [
    { "type": "item", "itemId": "ingredients", "amount": 1 }
  ],
  "outcomes": [
    {
      "grade": "great_success",
      "label": "大成功",
      "weight": 20,
      "effects": [
        { "type": "ability", "key": "cooking", "op": "add", "value": 100 }
      ],
      "suggestNext": [
        { "actionId": "serve_food", "bonus": 80, "decay": 60 },
        { "actionId": "taste_test", "bonus": 40, "decay": 30 }
      ]
    },
    {
      "grade": "success",
      "label": "成功",
      "weight": 60,
      "effects": [
        { "type": "ability", "key": "cooking", "op": "add", "value": 50 }
      ],
      "suggestNext": [
        { "actionId": "serve_food", "bonus": 80, "decay": 60 }
      ]
    },
    {
      "grade": "failure",
      "label": "失败",
      "weight": 20,
      "effects": [
        { "type": "ability", "key": "cooking", "op": "add", "value": 10 }
      ],
      "suggestNext": [
        { "category": "厨房", "bonus": 50, "decay": 30 }
      ]
    }
  ]
}
```

**阅读方式**：
- 做菜大成功/成功 → NPC 倾向于去端菜（+80），大成功还可能先试吃（+40）
- 做菜失败 → NPC 倾向于做厨房分类的行动（+50），如清理、重新做菜等
- 这些都是"倾向"，不是强制。如果有更紧急的事（如被攻击），NPC 仍会优先处理
- `category` 模式适合"失败后留在同类工作中"的场景，不必逐个指定行动

### 4.4 衰减机制

采用**线性衰减**，简单且可预测：

```
实际加成 = bonus × max(0, 1 - elapsed / decay)

其中:
  elapsed = 当前游戏时间 - 行动完成时间（分钟）
  decay = 衰减时间（分钟）
```

示例：`bonus=80, decay=60`

| 经过时间 | 实际加成 |
|---------|---------|
| 0 分钟 | +80 |
| 15 分钟 | +60 |
| 30 分钟 | +40 |
| 45 分钟 | +20 |
| 60 分钟 | 0（失效） |

### 4.5 决策流程变更

现有流程（`_npc_choose_action`）：

```
对每个 action_def:
  desire = (npcWeight + modifier_add) × modifier_mul
  effective = desire - distance × PENALTY
  选 effective 最高的
```

新流程：

```python
# 1. 构建 suggest_map：遍历历史记录，叠加未过期的 bonus
#    action_suggest: actionId → bonus（精确匹配）
#    category_suggest: category → bonus（分类匹配）
history = npc_action_history.get(npc_id, [])
action_suggest = {}
category_suggest = {}
for record in history:
    elapsed = current_time - record["completedAt"]
    for s in record["suggestNext"]:
        if elapsed < s["decay"]:
            bonus = s["bonus"] * (1 - elapsed / s["decay"])
            if s.get("actionId"):
                action_suggest[s["actionId"]] = action_suggest.get(s["actionId"], 0) + bonus
            elif s.get("category"):
                category_suggest[s["category"]] = category_suggest.get(s["category"], 0) + bonus

# 2. 在 desire 计算中加入 suggest bonus（actionId 精确 + category 分类）
对每个 action_def:
  desire = (npcWeight + modifier_add) × modifier_mul
  desire += action_suggest.get(action_def["id"], 0)
  desire += category_suggest.get(action_def["category"], 0)
  effective = desire - distance × PENALTY
  选 effective 最高的
```

**改动量**：`_npc_choose_action` 函数内新增约 15 行代码。

**叠加示例**：NPC 先 gather（suggestNext: cook +60）再 cook（suggestNext: serve_food +80）。决策时：
- `cook` 的 suggest bonus：来自 gather 的记录，已衰减
- `serve_food` 的 suggest bonus：来自 cook 的记录，刚完成所以接近满额
- 如果 gather 也配了 `serve_food +20`，则两条记录叠加

### 4.6 生命周期

```
              ┌─────────────────────────────────┐
              │  NPC 完成行动                     │
              │  _npc_complete_action()          │
              └──────────┬──────────────────────┘
                         │
                         ▼
              从 outcome 读取 suggestNext
              清理过期记录 + append 到 npc_action_history[npc_id]
                         │
                         ▼
              ┌─────────────────────────────────┐
              │  NPC 选择下一个行动               │
              │  _npc_choose_action()            │
              └──────────┬──────────────────────┘
                         │
                         ▼
              遍历 npc_action_history[npc_id]
              对所有未过期的 suggestNext 计算衰减并叠加
              构建 suggest_map
                         │
                         ▼
              正常选择最高 effective 的行动
              (suggest bonus 提升了某些行动的竞争力，但不强制)
              (多条历史记录的 bonus 可叠加，形成更强的行为惯性)
                         │
                         ▼
              ┌─────────────────────────────────┐
              │  新行动开始 / 完成               │
              │  完成时 append 新记录到历史       │
              │  同时清理过期记录                 │
              └─────────────────────────────────┘
```

### 4.7 设计要点

#### 多次记忆 + 随写随清

- `npc_action_history` 存储每个 NPC 最近的行动历史列表
- 新行动完成时 **append** 新记录，同时**过滤掉所有已过期的记录**
- 清理时机 = 写入时机，不需要定时任务
- 清理成本极低：列表一般 2-4 条，过滤一遍可忽略

```python
# _npc_complete_action 末尾
history = game_state.npc_action_history.get(npc_id, [])
history = [r for r in history if current_time - r["completedAt"] < _max_decay(r)]
history.append(new_record)
game_state.npc_action_history[npc_id] = history
```

**边界情况**：NPC 长时间不行动（被困住），历史记录会残留。但不影响正确性——过期记录的衰减计算结果为 0，不参与权重。下次行动时自然清理。

#### suggestNext 是加性的

- 加到 `desire` 上，与现有的 `npcWeight` 和 `modifiers` 叠加
- 不是乘性的，避免与现有 modifier 系统产生非线性爆炸
- 编辑者可以直观地控制加成量：bonus=80 意味着"相当于 npcWeight 多了 80"

#### 失败情况由条件兜底

- 做菜失败后 suggestNext 仍然可以指向 `serve_food`
- 但如果失败的 outcome effects 没有产出"待端菜品"
- 那么 `serve_food` 的条件检查会失败（如 `hasItem: cooked_meal`）
- NPC 自然不会去端菜——**不需要在 suggestNext 中处理异常路径**
- 当然，如果编辑者想在失败时主动引导（如去清理），也可以配不同的 suggestNext

#### 不影响玩家

- suggestNext 只在 NPC tick（`_npc_choose_action`）中生效
- 玩家的行动选择完全不受影响

### 4.8 性能分析

#### 记忆上界

```
活跃记忆条数 ≈ 最大 decay / 平均行动耗时
典型值: 120min / 15min = 8 条（极端上限）
常见值: 60min / 15min = 4 条
```

#### 每 NPC 每 tick 计算量

| 操作 | 现有 | 新增（多次记忆，N≈4） |
|------|------|---------------------|
| 条件评估 | ~20 action × 嵌套条件 ≈ 2000 次运算 | 0 |
| 距离矩阵查找 | ~20 次 dict lookup | 0 |
| modifier 计算 | ~20 × 遍历 modifiers | 0 |
| **suggest 构建** | 0 | 遍历 4 条记录 × 3 suggestNext = ~12 次衰减计算 |
| **suggest 查找** | 0 | ~20 次 dict.get（每个候选 action 查一次） |
| **清理（写入时）** | 0 | 过滤 4-8 条列表 = ~8 次时间比较 |

新增 ~40 次简单运算 vs 现有 ~2000 次条件评估 → **占比约 2%，可忽略**。

#### 极端压测

```
100 NPC × 8 条历史 × 5 suggestNext × 100 action 匹配
= 400,000 次简单运算（加减乘 + dict 操作）
Python 执行 ≈ 5-10ms
```

对比 100 NPC 的条件评估（几百 ms 级别），仍然是零头。

#### 内存

```
每条记录 ≈ 100 字节
每 NPC 最多 8 条 = 800 字节
100 NPC = 80 KB
```

### 4.9 持久化

`npc_action_history` 是运行时状态，需要纳入存档：

- 保存时：写入 `save/npc_action_history.json`
- 加载时：读取恢复到 `game_state.npc_action_history`
- 加载时可顺便清理过期记录（减少存档体积）
- 格式与运行时结构一致

### 4.10 编辑器 UI

在 ActionEditor 的 outcome 编辑区域新增 suggestNext 编辑：

```
┌─ 结果: 成功 ─────────────────────────────────────┐
│ 权重: [60]  标签: [成功]                           │
│ 效果: ...                                         │
│                                                   │
│ 行为提示 (suggestNext):                            │
│ ┌──────────────────────────────────────────┐      │
│ │ [serve_food ▼]  加成: [80]  衰减: [60]分 │ [×]  │
│ │ [taste_test ▼]  加成: [40]  衰减: [30]分 │ [×]  │
│ └──────────────────────────────────────────┘      │
│ [+ 添加提示]                                      │
└───────────────────────────────────────────────────┘
```

行动选择器从 `definitions.actionDefs` 获取下拉列表，与变量编辑器中的 key 选择器同理。

---

## 5. NPC 决策系统重构：Per-Target 评估 + 感知范围

### 5.1 当前问题

#### 5.1.1 决策流程缺陷

当前 `_npc_choose_action` 是**行动优先**的朴素遍历：

```
for action in ALL_ACTIONS:
  过滤 npcWeight
  _calc_modifier_bonus(target=None)        ← 问题1: 没有 target
  _evaluate_action_viability():
    check hard_conds (self only)
    if location_cond → 距离矩阵查最近格子
    if targetType="npc" → 遍历所有角色找最近   ← 问题2: 只找最近，不检查 target 条件
  effective = desire - distance × PENALTY
选最高的
```

**问题 1**：`_calc_modifier_bonus` 传 `target=None`，favorability 等依赖 target 的 modifier 不生效。NPC 对好感度 100 的朋友和好感度 -50 的仇人算出相同的 desire。

**问题 2**：target 搜索只找距离最近的 NPC，不检查 `condTarget: "target"` 的条件。NPC 可能走了 10 分钟路去找人交谈，到了才发现条件不满足。

#### 5.1.2 全知全能的 NPC

当前 NPC 拥有**全局视野**：
- 知道所有地图上所有格子的存在
- 知道所有角色的精确位置
- 遍历 300+ 格子、30+ 角色来做决策

这既**不合理**（厨房里的女仆不该知道地下城有人），又**浪费算力**。

### 5.2 正确的决策流程

#### 5.2.1 Per-Target 评估

对 `targetType="npc"` 的行动，需要对每个潜在 target 独立评估：

```
for action in candidate_actions:
  if targetType != "npc":
    # 无 target 行动: 和现在一样
    evaluate conditions(self)
    calc desire
    add to candidates
  else:
    # 有 target 行动: 对每个可感知的 NPC 分别评估
    for target_npc in sensed_npcs:
      evaluate conditions(self + target)          ← 包含 condTarget:"target"
      calc_modifier_bonus(with target_npc_id)     ← favorability 等生效
      calc desire (可能因 target 不同而不同)
      add (action, target_npc) to candidates

选全局最优的 (action, target) 组合
```

#### 5.2.2 性能影响（无优化时）

```
500 candidate actions × 40% npc-targeting = 200
200 × 30 all NPCs = 6,000 (action, target) 组合
每组合 ~80 次操作 = 480,000 次/NPC/决策

30 NPC × 480,000 = 14,400,000 次/tick → 可能达到秒级
```

**必须配合感知范围才能实施 per-target 评估。**

### 5.3 感知系统

#### 5.3.1 设计原则

- **只限制 target 搜索**：NPC 对其他角色的感知有范围限制
- **不限制 location 行动**：NPC 记得固定地点（家、工作岗位），可以前往不在感知范围内的位置
- **通过地图连接控制**：在连接点上标记是否允许感知穿透，而非硬性距离截断

#### 5.3.2 连接数据结构扩展

在地图格子的连接上新增 `senseBlocked` 字段：

```json
{
  "cells": [
    {
      "id": 1,
      "name": "厨房",
      "connections": [
        { "targetCell": 2, "travelTime": 5 },
        { "targetCell": 10, "targetMap": "street", "travelTime": 10, "senseBlocked": true }
      ]
    }
  ]
}
```

- `senseBlocked` 默认 `false`（不填 = 可感知穿透）
- 只有**显式标记 `true`** 的连接会阻断感知 BFS
- **向后兼容**：现有地图不加字段 = 全部可感知 = 和当前行为一致

#### 5.3.3 感知矩阵

加载时构建**感知矩阵**（和距离矩阵类似，但 BFS 遇到 `senseBlocked` 停止）：

```python
def build_sense_matrix(maps):
    """类似 distance_matrix，但 BFS 跳过 senseBlocked 连接。
    同时设硬性最大距离截断，防止开放地图无限扩散。"""
    MAX_SENSE_DISTANCE = 60  # 分钟，兜底截断
    # Dijkstra，但邻居遍历时:
    #   if connection.get("senseBlocked"): skip
    #   if distance > MAX_SENSE_DISTANCE: skip
```

运行时两个矩阵并存：

| 矩阵 | 用途 | 构建规则 |
|------|------|---------|
| `distance_matrix` | 寻路、移动、location 行动距离计算 | 全图 Dijkstra，不受 senseBlocked 影响 |
| `sense_matrix` | target NPC 搜索范围 | Dijkstra + senseBlocked 截断 + 最大距离截断 |

#### 5.3.4 感知范围示例

```
酒馆地图:
  大厅(3格) ──[可感知]── 厨房(2格) ──[可感知]── 储藏室(1格)
      │
   [不可感知]
      │
  楼上客房(4格)

街道地图:
  街道(5格) ──[不可感知]── 酒馆大厅
```

NPC 在厨房时:
- **可感知**: 大厅 3 格 + 厨房 2 格 + 储藏室 1 格 = 6 格
- **不可感知**: 楼上 4 格 + 街道 5 格
- **target 搜索范围**: 这 6 格内的 NPC（约 2-3 个）
- **仍可前往**: "去楼上打扫" 是 location 行动，不受感知限制

#### 5.3.5 对不同行动类型的影响

| 行动类型 | target 搜索 | location 寻路 | 用哪个矩阵 |
|---------|-----------|-------------|-----------|
| 无位置无 target（冥想） | — | — | 无需矩阵 |
| 有 location 无 target（去厨房做菜） | — | distance_matrix | distance_matrix |
| targetType="npc"（交谈、交易） | **sense_matrix** | distance_matrix | 两个都用 |
| npcPresent 指定 npcId（找特定人） | **sense_matrix** | distance_matrix | 两个都用 |

**NPC 能感知到的角色才会作为 target 候选。走过去仍用 distance_matrix 算实际路径。**

#### 5.3.6 性能收益

```
优化前（全知 + per-target）:
  200 npc-targeting actions × 30 targets = 6,000 组合/NPC

优化后（感知墙 + per-target）:
  假设感知范围内 NPC ≈ 3-5 个
  200 npc-targeting actions × 4 targets = 800 组合/NPC
  → 减少 87%

进一步：大部分行动的 hard_cond 会提前淘汰:
  实际进入 target 评估的行动 ≈ 50 个
  50 × 4 = 200 组合/NPC → 非常轻量
```

#### 5.3.7 感知矩阵的内存和构建

```
感知矩阵比距离矩阵更小（被 senseBlocked 截断了大部分节点）:
  300 格 × 平均可感知 20 格 = 6,000 条目 vs 距离矩阵 90,000 条目
  内存: ~360 KB vs ~5.4 MB

构建时间: 300 次受限 BFS，每次平均访问 20 节点 = 6,000 次
  vs 距离矩阵 300 × 300 = 90,000 次
  → 快 15 倍
```

### 5.4 遍历策略：格子优先（Cell-First）

#### 5.4.1 当前问题：行动优先（Action-First）

当前 `_npc_choose_action` 是**行动优先**遍历：

```
for action in ALL_ACTIONS:       ← 遍历 500-1000 个行动
  找这个行动去哪做最近
  找这个行动对谁做最近
```

**问题**：
- 大量行动的 location 条件指向 NPC 不可能去的格子，白白评估
- target 搜索遍历所有角色，大部分不在附近
- 没有利用"NPC 当前位置"这个强过滤条件

#### 5.4.2 新策略：格子优先

改为**格子优先**遍历——先确定 NPC 能到达哪些格子，再查每个格子能做什么：

```
1. 从距离矩阵拿到: NPC 能到达的所有格子 + 距离
2. 对每个可达格子:
     该格子满足哪些 action 的 location 条件？ → 倒排索引
     该格子有哪些 NPC（感知范围内）？ → cell→NPC 映射
     对每个可能的 (action, target) 组合:
       检查条件 + 算 desire
3. 加上无 location 要求的行动（在当前格子评估）
4. 选全局最优
```

**核心数据结构**：加载时构建**格子→行动倒排索引**：

```python
# 加载时构建一次，action 变化时重建
cell_action_index: dict[(mapId, cellId), list[ActionDef]]

def build_cell_action_index(action_defs, maps):
    """将有 location 条件的行动按目标格子分组"""
    index = defaultdict(list)
    no_location = []  # 无 location 要求的行动
    for action_def in action_defs.values():
        if action_def.get("npcWeight", 0) <= 0:
            continue
        location_cond = _extract_location_cond(action_def)
        if location_cond:
            for (mapId, cellId) in _expand_location(location_cond, maps):
                index[(mapId, cellId)].append(action_def)
        else:
            no_location.append(action_def)
    return index, no_location
```

#### 5.4.3 重构后的完整决策流程

```python
def _npc_choose_action(game_state, npc_id):
    npc = game_state.characters[npc_id]
    pos_key = (npc["position"]["mapId"], npc["position"]["cellId"])

    # 1. 构建 suggest_map（行为记忆）
    suggest_map = _build_suggest_map(game_state, npc_id)

    # 2. 预计算感知范围内的 NPC，按格子分组
    sense_row = game_state.sense_matrix.get(pos_key, {})
    cell_npcs: dict[tuple, list] = defaultdict(list)   # cell → [(npc_id, npc_data)]
    for cid, c in game_state.characters.items():
        if cid == npc_id:
            continue
        c_pos = (c["position"]["mapId"], c["position"]["cellId"])
        if c_pos in sense_row:
            cell_npcs[c_pos].append((cid, c))

    # 3. 距离矩阵（用于寻路）
    dist_row = game_state.distance_matrix.get(pos_key, {})

    candidates = []

    # ========== A. 格子优先：遍历可达格子 ==========
    for cell_key, (distance, _, _) in dist_row.items():
        # 该格子上的行动（倒排索引）
        cell_actions = game_state.cell_action_index.get(cell_key, [])
        if not cell_actions:
            continue

        # 该格子上的可感知 NPC
        npcs_here = cell_npcs.get(cell_key, [])

        for action_def in cell_actions:
            npc_weight = action_def.get("npcWeight", 0)
            target_type = action_def.get("targetType", "none")
            conditions = action_def.get("conditions", [])
            location_cond, npc_present_cond, hard_conds = _split_conditions(conditions)

            # hard_conds 先检查（只检查自身）
            if hard_conds and not _evaluate_conditions(hard_conds, npc, game_state, char_id=npc_id):
                continue

            if target_type == "npc" or npc_present_cond:
                # === Per-Target 评估 ===
                for target_id, target_char in npcs_here:
                    if not _evaluate_conditions(conditions, npc, game_state,
                                                target_id=target_id, char_id=npc_id):
                        continue
                    add, mul = _calc_modifier_bonus(
                        action_def.get("npcWeightModifiers", []),
                        npc, game_state, npc_id, target_id)
                    desire = (npc_weight + add) * mul
                    desire += suggest_map.get(action_def["id"], 0)
                    effective = desire - distance * DISTANCE_PENALTY
                    if effective > 0:
                        candidates.append((effective, action_def, distance, cell_key, target_id))
            else:
                # === 无 target 的 location 行动 ===
                add, mul = _calc_modifier_bonus(
                    action_def.get("npcWeightModifiers", []),
                    npc, game_state, npc_id, None)
                desire = (npc_weight + add) * mul
                desire += suggest_map.get(action_def["id"], 0)
                effective = desire - distance * DISTANCE_PENALTY
                if effective > 0:
                    candidates.append((effective, action_def, distance, cell_key, None))

    # ========== B. 无 location 要求的行动（当前位置评估） ==========
    for action_def in game_state.no_location_actions:
        npc_weight = action_def.get("npcWeight", 0)
        target_type = action_def.get("targetType", "none")
        conditions = action_def.get("conditions", [])
        _, npc_present_cond, hard_conds = _split_conditions(conditions)

        if hard_conds and not _evaluate_conditions(hard_conds, npc, game_state, char_id=npc_id):
            continue

        if target_type == "npc" or npc_present_cond:
            # 对感知范围内所有 NPC 评估
            for cell_key, npcs_in_cell in cell_npcs.items():
                cell_dist = dist_row.get(cell_key, (9999,))[0]
                for target_id, target_char in npcs_in_cell:
                    if not _evaluate_conditions(conditions, npc, game_state,
                                                target_id=target_id, char_id=npc_id):
                        continue
                    add, mul = _calc_modifier_bonus(
                        action_def.get("npcWeightModifiers", []),
                        npc, game_state, npc_id, target_id)
                    desire = (npc_weight + add) * mul
                    desire += suggest_map.get(action_def["id"], 0)
                    effective = desire - cell_dist * DISTANCE_PENALTY
                    if effective > 0:
                        candidates.append((effective, action_def, cell_dist, cell_key, target_id))
        else:
            # 当前位置，distance=0
            if not _evaluate_conditions(conditions, npc, game_state, char_id=npc_id):
                continue
            add, mul = _calc_modifier_bonus(
                action_def.get("npcWeightModifiers", []),
                npc, game_state, npc_id, None)
            desire = (npc_weight + add) * mul
            desire += suggest_map.get(action_def["id"], 0)
            if desire > 0:
                candidates.append((desire, action_def, 0, pos_key, None))

    # 4. 选最优
    if not candidates:
        return None
    candidates.sort(key=lambda x: -x[0])
    ...
```

#### 5.4.4 格子优先的性能收益

```
行动优先（旧）:
  500 action × 30 NPC target = 15,000 组合
  每个 action 都要查距离矩阵找最近格子

格子优先（新）:
  NPC 可达 30 个格子（感知范围限制后更少）
  每个格子平均 3-5 个可用行动（倒排索引）
  每个格子平均 1-2 个 NPC
  = 30 × 5 × 2 = 300 组合  → 减少 98%

倒排索引构建:
  加载时一次，O(A × L)，A=行动数, L=平均 location 格子数
  action 变化时重建（保存时触发）
  内存: 1000 action × 平均 3 格子 = 3000 条目 ≈ 几十 KB
```

### 5.5 边界情况

#### 感知范围内没有任何 NPC

所有 npc-targeting 行动自动跳过，NPC 只从 location 行动和无目标行动中选择。这是合理的——看不到人就做自己的事。

#### NPC 想找特定的人（npcPresent 指定 npcId）

如果指定的 NPC 不在感知范围内，该行动不可选。NPC 不会"隔空"知道对方位置然后跑过去找人。

如果编辑者希望 NPC 主动去找某人，应该用 **location 行动**（"去广场"），到了之后自然能感知到对方，再触发交互行动。这更符合逻辑。

#### senseBlocked 的对称性

`senseBlocked` 是**连接属性**，天然对称——A→B 的连接标记了 senseBlocked，如果 B→A 也有连接且也标了，则双向隔断。如果只标了一侧，则感知是单向的。

实际上大部分情况下 A→B 和 B→A 是同一对连接的两个方向，编辑器应同步设置（或提供"双向"勾选）。

---

## 6. 实现计划

| 阶段 | 内容 | 改动范围 |
|------|------|---------|
| **Phase 1** | suggestNext 数据结构 + 后端逻辑 | `action.py`（~30行）, `state.py`（持久化） |
| **Phase 2** | 决策重构：格子优先遍历 + 倒排索引 + per-target 评估 | `action.py`（`_npc_choose_action` 重写）, `state.py`（倒排索引） |
| **Phase 3** | 感知系统：连接扩展 + sense_matrix | `map_engine.py`, `state.py`，`action.py`（target 搜索切换到 sense_matrix） |
| **Phase 4** | 前端：outcome suggestNext 编辑 UI | `ActionEditor.tsx`, `types/game.ts` |
| **Phase 5** | 前端：连接 senseBlocked 编辑 UI | 地图编辑器 |

### 6.1 后端改动清单

**suggestNext（Phase 1）**：
1. `game_state` 新增 `npc_action_history: dict[str, list[dict]]` 字段
2. `_npc_complete_action()` 末尾：从 outcome 读取 suggestNext，清理过期记录 + append 到历史
3. `_npc_choose_action()` 开头：遍历历史列表，构建 `suggest_map`（叠加多条记录的 bonus）
4. `_npc_choose_action()` desire 计算处：加上 suggest bonus
5. `save_all()` / `load()` 中处理 `npc_action_history` 的持久化

**决策重构（Phase 2）**：
1. 构建 `cell_action_index`（格子→行动倒排索引），加载时创建，action 变化时重建
2. 构建 `no_location_actions` 列表（无 location 要求的行动）
3. `_npc_choose_action()` 重写为格子优先遍历：先遍历可达格子，查倒排索引获取该格子的行动
4. per-target 条件评估 + per-target modifier（此阶段 target 搜索仍用 distance_matrix，全图可见）
5. `_evaluate_action_viability()` 移除，逻辑内联到新的遍历结构中

**感知系统（Phase 3）**：
1. 连接数据结构新增 `senseBlocked` 字段（默认 false，向后兼容）
2. `map_engine.py` 新增 `build_sense_matrix()`（Dijkstra + senseBlocked 截断 + 距离截断）
3. `game_state` 新增 `sense_matrix` 属性，加载时构建
4. `_npc_choose_action()` 中 target NPC 搜索从 distance_matrix 切换到 sense_matrix

### 6.2 前端改动清单

1. `types/game.ts`：`ActionOutcome` 新增 `suggestNext?: SuggestNext[]`
2. `types/game.ts`：连接类型新增 `senseBlocked?: boolean`
3. `ActionEditor.tsx`：outcome 编辑区域新增 suggestNext 列表编辑 UI
4. 地图编辑器：连接编辑处新增 senseBlocked 勾选

---

## 7. 未来扩展（不在本期范围）

### 7.1 全局条件触发器

解决陷阱、天黑回家、打烊等被动事件。与 suggestNext 和感知系统是正交的系统，可独立设计实现。

### 7.2 行为标签（Behavior Tag）

分类匹配已实现（`category` 字段）。如果后续需要更细粒度的跨分类匹配，可引入标签机制：

```json
{ "suggestNext": [{ "tag": "kitchen_work", "bonus": 30, "decay": 60 }] }
```

匹配所有带该标签的行动，减少逐个声明的工作量。观察实际编辑需求后决定是否实现。

### 7.3 历史记忆上限配置

当前历史列表由 decay 自然控制长度。如果后续出现异常场景（大量长 decay 行动），可增加硬上限：

```python
MAX_HISTORY_PER_NPC = 16  # 超过时丢弃最旧的记录
```

目前不需要，观察实际运行情况。

### 7.4 记忆叠加的高级用法

多次记忆 + 叠加天然支持"行为积累"模式：

- 连续 3 次厨房行动都配了 `rest` 的小额 bonus（+15），叠加后 +45，足以让 NPC 倾向休息
- 如果只做了 1 次厨房行动，+15 不足以改变决策，NPC 继续工作
- 这实现了"疲劳积累"的涌现效果，无需额外机制

### 7.5 进一步性能优化

当行动数达到 2000+、NPC 达到 50+ 时，可考虑：

| 优化手段 | 说明 | 收益 |
|---------|------|------|
| **hard_cond 结果缓存** | 同 tick 内同 NPC 的 trait/resource 检查不重复算 | 减 30-50% |
| **NPC 决策降频** | 空闲 NPC 每 2-3 tick 才重新选择 | 直接砍 1/2-2/3 |
| **npcWeight 排序 + 剪枝** | desire 已低于当前最优就跳过剩余 | 减 50%+ |
| **C 扩展热路径** | 条件评估用 Cython 重写 | 10-50x 加速 |

> 注：格子→行动倒排索引已纳入 Phase 3 核心设计，不再是未来优化。
