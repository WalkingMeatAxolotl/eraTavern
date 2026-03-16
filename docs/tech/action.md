# 行动系统 (Action System)

## 相关文件

| 文件 | 职责 |
|------|------|
| `backend/game/action.py` | 行动执行、条件求值、NPC 决策、效果应用 |
| `frontend/src/components/ActionEditor.tsx` | 行动编辑器 UI |
| `frontend/src/types/game.ts` | TypeScript 类型定义 |
| `backend/main.py` | REST API 端点 |

## 数据结构

### ActionDefinition

```typescript
interface ActionDefinition {
  id: string;                          // 命名空间 ID (addonId.localId)
  name: string;                        // 显示名称
  category: string;                    // 分类（如 social、combat），用于分组和行动链的 category 引用
  targetType: "none" | "npc" | "self"; // 目标类型
  triggerLLM: boolean;                 // 是否触发 LLM 生成文本
  timeCost: number;                    // 消耗游戏时间（分钟，须为 5 的倍数）
  npcWeight: number;                   // NPC 基础权重（0 = NPC 不会选择此行动）
  npcWeightModifiers?: WeightModifier[]; // NPC 权重动态修正
  conditions: ConditionItem[];         // 前置条件
  costs: ActionCost[];                 // 消耗
  outcomes: ActionOutcome[];           // 结果列表（加权随机）
  outputTemplate?: string;             // 旧版：单一输出模板
  outputTemplates?: OutputTemplateEntry[]; // 新版：条件输出模板列表
  source: string;                      // 来源 addon (addonId.version)
}
```

### ConditionItem

条件系统支持叶节点和逻辑组合，形成递归树结构：

```typescript
// 叶节点
interface ActionCondition {
  type: "location" | "npcPresent" | "npcAbsent" | "resource" | "ability"
      | "trait" | "noTrait" | "favorability" | "hasItem" | "clothing"
      | "time" | "basicInfo" | "variable" | "worldVar";
  condTarget?: "self" | "target";  // 检查谁的属性（默认 self）

  // location
  mapId?: string;
  cellIds?: number[];
  cellTags?: string[];      // 展开为匹配 tag 的 cellId 列表

  // npcPresent / npcAbsent
  npcId?: string;           // 为空时检查"任意 NPC"

  // resource / ability / basicInfo / variable / favorability
  key?: string;             // 属性名
  op?: string;              // 比较运算符: >=, <=, >, <, ==, !=
  value?: number;           // 比较值

  // trait / noTrait
  traitId?: string;

  // hasItem
  itemId?: string;
  tag?: string;             // 按标签匹配物品

  // clothing
  slot?: string;            // 槽位名
  itemId?: string;          // 可选：指定衣物 ID（不指定则匹配任意衣物）
  state?: string;           // 可选：穿着状态（worn / halfWorn / none / empty）

  // time
  hourMin?: number;
  hourMax?: number;
  dayOfWeek?: string;       // 星期几（"星期一"～"星期日"）
  season?: string;          // 季节（"春"/"夏"/"秋"/"冬"）

  // favorability
  targetId?: string;        // 好感度对象

  // variable
  varId?: string;           // 衍生变量 ID

  // worldVar（使用 key 字段，不是 varId）
  // key?: string;          // 世界变量名（复用上方 key 字段）
}

// 逻辑组合 — 用键名区分，非 type 字段
type ConditionItem =
  | ActionCondition
  | { and: ConditionItem[] }
  | { or: ConditionItem[] }
  | { not: ConditionItem };
```

### ActionCost

```typescript
interface ActionCost {
  type: "resource" | "basicInfo" | "item";
  key?: string;      // resource / basicInfo 的属性名
  itemId?: string;   // item 类型的物品 ID
  amount: number;    // 消耗数量
}
```

### ActionOutcome

```typescript
interface ActionOutcome {
  grade: string;                         // 结果等级标识（如 "success"、"fail"、"critical"）
  label: string;                         // 显示标签（如「大成功」「失败」）
  weight: number;                        // 基础权重
  weightModifiers?: WeightModifier[];    // 权重动态修正
  effects: ActionEffect[];              // 效果列表
  suggestNext?: SuggestNext[];          // 行动链建议
  outputTemplate?: string;              // 旧版：outcome 级别输出模板
  outputTemplates?: OutputTemplateEntry[]; // 新版：outcome 级别条件输出模板
}
```

### ActionEffect

```typescript
interface ActionEffect {
  type: "resource" | "ability" | "basicInfo" | "favorability"
      | "trait" | "item" | "clothing" | "position"
      | "experience" | "worldVar";

  // 通用
  op: string;                 // 操作：add / set / remove（统一三值）
  target?: string;            // 效果目标：self / {{targetId}} / 具体角色 ID
  value?: number | { varId: string; multiply?: number };  // 值，可引用衍生变量
  valuePercent?: boolean;     // 是否为百分比模式
  valueModifiers?: ValueModifier[];  // 值修正器列表

  // resource / ability / basicInfo
  key?: string;               // 属性名

  // favorability
  favFrom?: string;           // 谁的好感度变化（self / {{targetId}} / 具体 ID）
  favTo?: string;             // 对谁的好感度（self / {{targetId}} / 具体 ID）

  // trait
  traitId?: string;           // 特质 ID，op 为 add / remove

  // item
  itemId?: string;            // 物品 ID，op 为 add / remove
  amount?: number;            // 物品数量

  // clothing
  slot?: string;              // 槽位名
  state?: string;             // 目标状态（worn / halfWorn / empty）

  // position
  mapId?: string;
  cellId?: number;

  // experience — 记录首次发生的上下文信息
  // 使用 key 作为经验类型名
}
```

### ValueModifier / WeightModifier

```typescript
// WeightModifier 和 ValueModifier 是同一类型
type WeightModifier = ValueModifier;

interface ValueModifier {
  type: "ability" | "trait" | "favorability" | "experience" | "variable" | "worldVar";
  key?: string;         // ability key / trait category key / experience key / worldVar key
  value?: string;       // trait: 匹配的特质值
  source?: string;      // favorability: "target"（默认）或 "self"
  per?: number;         // 每 per 单位属性值提供一次 bonus
  bonus: number;        // 加成值
  bonusMode?: "add" | "multiply";  // "add"（默认）: 累加 / "multiply": 乘数百分比
  varId?: string;       // variable 类型的变量 ID
}
```

**计算规则：**

```
additive_total = Σ (floor(属性值 / per) × bonus)   // bonusMode = "add"
multiplicative_total = Π (bonus%)                   // bonusMode = "multiply"
final = (base + additive_total) × multiplicative_total
```

### SuggestNext

```typescript
interface SuggestNext {
  actionId?: string;   // 推荐的后续行动 ID（与 category 二选一）
  category?: string;   // 推荐的后续行动分类（与 actionId 二选一）
  bonus: number;       // 权重加成值
  decay: number;       // 衰减时间（游戏分钟，须为 5 的倍数）
}
```

### OutputTemplateEntry

```typescript
interface OutputTemplateEntry {
  text: string;                   // 模板文本（支持 {{变量}} 替换）
  conditions?: ConditionItem[];   // 显示条件
  weight?: number;                // 权重（默认 1，条件匹配后加权随机选择）
}
```

## API 端点

### 行动执行

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/game/action` | 执行行动 |
| `GET` | `/api/game/available-actions/{char_id:path}` | 获取角色可用行动列表 |

**POST /api/game/action** 请求体：

```typescript
{
  characterId: string;      // 执行者角色 ID
  type: string;             // "move" / "look" / "configured"
  actionId?: string;        // configured 行动的 ID
  targetCell?: number;      // move 的目标格子
  targetMap?: string;       // move 的目标地图
  targetId?: string;        // 行动目标角色 ID
}
```

### 行动 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/actions` | 获取所有行动定义 |
| `POST` | `/api/game/actions` | 创建行动（body: ActionDefinition） |
| `PUT` | `/api/game/actions/{action_id:path}` | 更新行动 |
| `DELETE` | `/api/game/actions/{action_id:path}` | 删除行动 |

路由参数使用 `:path` converter，因为 ID 包含 `.`（命名空间分隔符）。

## 条件求值

### `_evaluate_conditions(conditions, char, game_state, target_id?, skip_target_conds?, char_id?)`

递归求值条件树，最大深度限制 **8 层**。

**逻辑组合处理：**

条件组合通过 dict 键名区分（非 type 字段）：

| 键名 | 逻辑 |
|------|------|
| `and` | 所有子条件为 true |
| `or` | 任一子条件为 true |
| `not` | 子条件取反 |

**condTarget 解析：**

| condTarget 值 | 实际检查目标 |
|----------------|------------|
| `"self"`（默认） | 执行者 character |
| `"target"` | target_id 对应的角色 |

注意：`location` 和 `npcPresent`/`npcAbsent` 始终使用执行者的位置，不受 condTarget 影响。

**skip_target_conds 参数：**

当 `True` 时，跳过所有 `condTarget="target"` 的条件。用于 NPC 决策——先检查执行者条件，再对每个目标单独评估目标条件。

## 消耗检查与扣除

### `_check_costs(costs, char) → tuple[bool, str]`

检查角色是否负担得起所有消耗：
- `resource` / `basicInfo`: 检查 `char[key] >= amount`
- `item`: 检查背包中物品数量 `>= amount`

返回 `(enabled, reason)`。`enabled=False` 时 reason 说明原因。

### `_apply_costs(costs, char) → None`

扣除消耗，与 `_check_costs` 逻辑对应：
- `resource`: 扣减值，clamp 到 `[0, max]`
- `basicInfo`: 扣减值
- `item`: 从背包移除指定数量，数量归零则移除该条目

## 效果执行

### `_apply_effects(effects, char, game_state, char_id, target_id) → list[str]`

逐一应用效果，返回人类可读的摘要列表（用于 UI 展示）。

**target 解析规则：**

| effect.target 值 | 实际目标 |
|-------------------|----------|
| `"self"`（默认） | 行动执行者 |
| `"{{targetId}}"` | 行动目标（target_id 参数） |
| 具体角色 ID | 从 `game_state.characters` 查找 |

**各 type 对应的 op 值：**

| type | 可用 op | 说明 |
|------|---------|------|
| `resource` | `add` / `set` | 修改资源值 |
| `ability` | `add` / `set` | 修改能力经验值 |
| `basicInfo` | `add` / `set` | 修改基础信息 |
| `favorability` | `add` / `set` | 修改好感度（使用 favFrom/favTo） |
| `trait` | `add` / `remove` | 添加/移除特质 |
| `item` | `add` / `remove` | 添加/移除物品 |
| `clothing` | `set` / `remove` | set: 改变穿着状态 / remove: 脱下（等同 state="empty"） |
| `position` | — | 改变角色位置（mapId + cellId） |
| `experience` | `add` | 记录经验，首次发生时保存上下文 |
| `worldVar` | `add` / `set` | 修改世界变量 |

**valueModifier 计算：**

当 effect 包含 `valueModifiers` 时，最终值经过修正器调整。修正器计算规则同 WeightModifier（见数据结构章节）。

**value 变量引用：**

`value` 可以是 `{varId, multiply}` 对象，此时实际值 = `evaluate_variable(varId) × multiply`。

## Outcome 选择

从 `outcomes` 列表中加权随机选择一个结果：

1. 计算每个 outcome 的有效权重：`(weight + additive_bonus) × multiplicative_factor`
2. additive_bonus / multiplicative_factor 来自 `weightModifiers` 计算
3. 有效权重 clamp 到 `≥ 0`
4. 按有效权重做加权随机

## 输出模板

### `_select_output_template(obj, char, game_state, char_id, target_id) → str`

1. 优先检查 `outputTemplates`（新版条件模板列表）
2. 用 `_evaluate_conditions` 过滤不满足条件的条目
3. 满足条件的模板中，按 `weight` 加权随机选择
4. 若无匹配或无 `outputTemplates`，回退到 `outputTemplate`（旧版单模板）

支持 action 级别和 outcome 级别两层模板（outcome 优先）。

### `_resolve_template(template, char, target_char, game_state, outcome, effects_summary) → str`

正则替换 `{{变量}}` 占位符：

| 变量 | 说明 |
|------|------|
| `{{player}}` / `{{self}}` | 执行者名称 |
| `{{target}}` | 目标名称 |
| `{{outcome}}` | outcome 的 label |
| `{{outcomeGrade}}` | outcome 的 grade |
| `{{effects}}` | 效果摘要（逗号分隔） |
| `{{time}}` | 当前游戏时间 |
| `{{weather}}` | 当前天气 |
| `{{location}}` | 执行者所在格子名称 |
| `{{self.resource.X}}` | 执行者资源 X 的值 |
| `{{self.ability.X}}` | 执行者能力 X 的等级 |
| `{{self.abilityExp.X}}` | 执行者能力 X 的经验值 |
| `{{self.clothing.X}}` | 执行者槽位 X 的服装名称 |
| `{{self.trait.X}}` | 执行者特质分类 X 的值（逗号分隔） |
| `{{self.favorability.角色ID}}` | 执行者对指定角色的好感度 |
| `{{self.inventory.物品ID}}` | 执行者持有指定物品的数量（无则 0） |
| `{{self.experience.X}}` | 执行者经验记录 X 的次数（无则 0） |
| `{{target.resource.X}}` | 目标的对应属性（同 self 格式） |

## NPC 行为

### 索引构建

#### `build_cell_action_index(action_defs, maps) → (cell_action_index, no_location_actions)`

在世界加载时构建倒排索引。只索引 `npcWeight > 0` 的行动：

- 有 `location` 条件的行动：展开 cellIds + cellTags → 放入对应 cell 的列表
- 无 `location` 条件的行动：放入 `no_location_actions`

```
cell_action_index: { (mapId, cellId): [action_def, ...] }
no_location_actions: [action_def, ...]
```

### NPC 决策

#### `_npc_choose_action(game_state, npc_id) → str | None`

**Cell-first traversal + per-target 评估：**

1. 获取 suggest bonus：`_build_suggest_map` → `(action_suggest, category_suggest)`
2. 遍历可达 cell（通过 `distance_matrix`）
3. 对每个 cell，从 `cell_action_index` + `no_location_actions` 获取行动
4. 对每个行动：
   - 检查 `npcWeight > 0`
   - 用 `_evaluate_conditions` 检查条件（`skip_target_conds=True` 先检自身）
   - 如果 `targetType == "npc"`：枚举 cell 内 NPC，通过 `sense_matrix` 过滤可感知目标，per-target 评估
   - 如果 `targetType != "npc"`：直接评估
5. 计算综合得分：`desire = (npcWeight + modifier_add) × modifier_mul + suggest_bonus`
6. 减去距离惩罚：`desire -= distance × DISTANCE_PENALTY`（`DISTANCE_PENALTY = 0.5`）
7. **Top-N 加权随机**（`NPC_TOP_N = 5`）：按得分排序，取前 5 名，以 desire 值为权重做加权随机选择

注意：NPC 决策从前 5 名候选中加权随机选择，高分行动被选中概率更高，但不是确定性的。

### NPC 时间推进

> **Tick 单位**：1 tick = `TICK_MINUTES = 5` 游戏分钟。所有时间相关字段（`timeCost`、`decay`、冷却等）均以游戏分钟为单位，且须为 5 的倍数。前端输入自动向上取整到 5 的倍数；后端通过 `_snap_to_tick()` 在消费时兜底校正。

#### `simulate_npc_ticks(game_state, elapsed_minutes, exclude_id?, exclude_ids?) → list[dict]`

按 `TICK_MINUTES = 5` 分片推进模拟，**时间在每个 tick 开始时递增**（per-tick 推进，非一次性推进）：

1. 总 tick 数 = `elapsed_minutes / TICK_MINUTES`
2. 每个 tick：
   1. `game_state.time.advance(TICK_MINUTES)` — 推进 5 分钟
   2. `apply_ability_decay` — 所有角色能力衰减
   3. 遍历所有非排除角色，调用 `_npc_tick`
   4. `_npc_tick` 内部：完成进行中的行动 → 移动一格 → 选择新行动
   5. `evaluate_events` — 全局事件检查（per-character + global）
3. 返回 NPC 日志列表，经 `filter_visible_npc_log` 过滤为玩家可见范围

> 调用方（`_execute_configured`、`_execute_move`）不再自行调用 `time.advance`，时间推进完全由 `simulate_npc_ticks` 内部管理。

### Suggest Bonus 计算

#### `_build_suggest_map(game_state, npc_id) → (action_suggest, category_suggest)`

从 `npc_action_history` 构建双层建议权重 map：

1. 读取该 NPC 的行动历史
2. 对每条记录的 `suggestNext` 条目：
   - 计算 `elapsed = current_game_minutes - action_time_minutes`
   - 如果 `elapsed < decay`：`effective_bonus = bonus × (1 - elapsed / decay)`
   - 按 `actionId` 累加到 `action_suggest`，按 `category` 累加到 `category_suggest`

**衰减公式：** `effective_bonus = bonus × (1 - elapsed / decay)` — 线性衰减，经过 `decay` 分钟后归零。

## 辅助函数

| 函数 | 说明 |
|------|------|
| `_split_conditions(conditions)` | 将条件列表拆分为 `(location_cond, npc_present_cond, hard_conds)` 三部分，供 NPC 决策和索引构建使用 |
| `_expand_location_cells(location_cond, maps)` | 展开 location 条件为 `[(mapId, cellId), ...]` 列表，支持 cellTags → cellId 展开 |
| `filter_visible_npc_log(log, player_pos, game_state, player_id)` | 过滤 NPC 日志，只返回玩家感知范围内（`sense_matrix`）可见的条目 |
| `evaluate_events(game_state, scope?, char_id?)` | 全局事件系统：检查事件条件并触发效果，支持 `each_character` / `none` 作用域 |
| `_resolve_effect_value(eff, char, game_state)` | 解析效果值：数字直接返回；`{varId, multiply}` 对象则计算变量值 × multiply |
| `_snap_to_tick(minutes)` | 将分钟值向上取整到 `TICK_MINUTES`（5）的倍数，最小 5 |

## 执行流程

### `execute_action` → `_execute_configured`

```
execute_action(game_state, character_id, action_request)
│
├── 路由：type="move" → _execute_move
├── 路由：type="look" → _execute_look
└── 路由：type="configured" → _execute_configured
    │
    ├── 1. 验证
    │   ├── 查找 action_def（从 game_state.action_defs）
    │   ├── 查找 actor character
    │   ├── 查找 target character（如有）
    │   └── _evaluate_conditions — 全量条件检查
    │
    ├── 2. 消耗
    │   ├── _check_costs — 检查资源是否足够
    │   └── _apply_costs — 扣除资源
    │
    ├── 3. 中断目标 NPC
    │   └── 清除 target NPC 的 npc_goals（如有 targetId）
    │
    ├── 4. 时间推进 + NPC 模拟
    │   └── simulate_npc_ticks — 内部 per-tick 推进时间、衰减、NPC 决策、事件
    │
    ├── 5. 结果选择
    │   └── 加权随机选择 outcome（含 weightModifiers）
    │
    ├── 6. 效果应用
    │   └── _apply_effects — 逐一应用 outcome.effects
    │
    ├── 7. 输出生成
    │   ├── _select_output_template — action 级别 + outcome 级别模板
    │   ├── _resolve_template — 变量替换
    │   └── 自动附加 [outcome_label] + 效果摘要
    │
    └── 8. 日志过滤
        └── filter_visible_npc_log — 只返回玩家感知范围内的 NPC 日志
```
