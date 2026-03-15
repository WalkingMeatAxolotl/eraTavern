# 特质与变量系统

## 相关文件

| 文件 | 职责 |
|------|------|
| `backend/game/character.py` | 特质效果计算、能力等级、能力衰减、角色状态编译 |
| `backend/game/variable_engine.py` | 变量求值引擎、循环检测、调试追踪 |
| `frontend/src/components/TraitEditor.tsx` | 特质定义编辑器 UI |
| `frontend/src/components/TraitGroupEditor.tsx` | 特质组编辑器 UI |
| `frontend/src/components/VariableEditor.tsx` | 衍生变量编辑器 UI |
| `frontend/src/types/game.ts` | TypeScript 类型定义 |
| `backend/main.py` | REST API 端点定义 |

## 数据结构

### TraitDefinition

```typescript
interface TraitDefinition {
  id: string;                        // 特质 ID（运行时带命名空间前缀）
  name: string;                      // 显示名称
  category: string;                  // 分类（如 "种族", "职业" 等）
  description?: string;              // 描述文字（可选）
  effects: TraitEffect[];            // 特质效果列表
  defaultValue?: number;             // ability 类别：默认经验值
  decay?: AbilityDecay | null;       // ability 类别：自动衰减设置（单个，非数组）
  source: string;                    // 来源 addon ID（运行时自动填充）
}
```

### TraitEffect

```typescript
interface TraitEffect {
  target: string;                          // 效果目标路径（如 "resources.hp", "abilities.strength"）
  effect: "increase" | "decrease";         // 增加或减少
  magnitudeType: "fixed" | "percentage";   // 固定值 或 百分比乘数
  value: number;                           // 效果数值
}
```

### AbilityDecay

```typescript
interface AbilityDecay {
  amount: number;                // 衰减量
  type: "fixed" | "percentage";  // 衰减类型
  intervalMinutes: number;       // 衰减间隔（游戏分钟）
}
```

### TraitGroup

```typescript
interface TraitGroup {
  id: string;            // 特质组 ID
  name: string;          // 组名称
  category: string;      // 分类
  traits: string[];      // 包含的特质 ID 列表
  exclusive?: boolean;   // 是否互斥（同组只能拥有一个）
  source: string;        // 来源 addon ID
}
```

### VariableDefinition

```typescript
interface VariableDefinition {
  id: string;              // 变量 ID
  name: string;            // 显示名称
  description?: string;    // 描述（可选）
  tags?: string[];         // 标签（可选）
  steps: VariableStep[];   // 求值步骤列表（按顺序执行）
  source: string;          // 来源 addon ID
}
```

### VariableStep

```typescript
interface VariableStep {
  type: "ability" | "resource" | "basicInfo" | "traitCount" | "hasTrait" | "experience" | "itemCount" | "constant" | "variable";
  op?: "add" | "subtract" | "multiply" | "divide" | "min" | "max" | "floor" | "cap";
  key?: string;            // 数据源键名（ability/resource/basicInfo/experience/itemCount 类型使用）
  field?: "value" | "max"; // 字段名（resource 类型可选 value 或 max）
  traitGroup?: string;     // 特质组 ID（traitCount 类型使用）
  traitId?: string;        // 特质 ID（hasTrait 类型使用）
  value?: number;          // 固定值（constant 类型使用）
  varId?: string;          // 引用的变量 ID（variable 类型使用）
  label?: string;          // 步骤标签（调试/显示用）
}
```

## API 端点

### 特质 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/traits` | 获取所有特质定义 |
| `POST` | `/api/game/traits` | 创建新特质 |
| `PUT` | `/api/game/traits/{trait_id:path}` | 更新特质定义 |
| `DELETE` | `/api/game/traits/{trait_id:path}` | 删除特质 |

### 特质组 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/trait-groups` | 获取所有特质组 |
| `POST` | `/api/game/trait-groups` | 创建新特质组 |
| `PUT` | `/api/game/trait-groups/{group_id:path}` | 更新特质组 |
| `DELETE` | `/api/game/trait-groups/{group_id:path}` | 删除特质组 |

### 变量 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/variables` | 获取所有变量定义 |
| `POST` | `/api/game/variables` | 创建新变量 |
| `PUT` | `/api/game/variables/{var_id:path}` | 更新变量定义 |
| `DELETE` | `/api/game/variables/{var_id:path}` | 删除变量 |

### 求值

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/game/variables/{var_id:path}/evaluate` | 对指定角色求值变量，返回计算结果和调试追踪 |

### 变量标签

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/variable-tags` | 获取所有变量标签 |
| `POST` | `/api/game/variable-tags` | 添加单个标签 |
| `DELETE` | `/api/game/variable-tags/{tag}` | 删除单个标签 |

路由参数使用 `:path` converter 以支持 ID 中的 `.` 分隔符。

## 特质效果计算

### `apply_trait_effects()`

遍历角色拥有的所有特质，收集并应用效果到角色状态：

```
1. 遍历角色的 traits 列表
2. 对每个 trait，查找 trait_defs 获取定义
3. 收集所有 effects:
   - magnitudeType="fixed"      → 累加到 fixed_deltas 字典
   - magnitudeType="percentage" → 收集乘数到 pct_multipliers 字典
4. 百分比相加合成最终乘数:
   - 每个乘数 m 贡献 (m - 1.0) 的增量
   - final_multiplier = 1.0 + sum(m - 1.0 for m in multipliers)
5. 应用到角色状态:
   - final = int((base + fixed_delta) × final_multiplier)
```

**计算公式**: `final = (base + fixed_delta) × (1 + percentage_sum)`

百分比采用**相加叠加**模型：两个 +20% 效果 = 总计 +40%（乘数 1.4），而非相乘（1.44）。

固定值先加，百分比后乘。服装效果与特质效果使用相同的收集和计算逻辑。

## 能力等级

### `exp_to_grade()`

将能力经验值映射为字母等级：

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

每 1000 经验值一个等级，7000 以上统一为 S。等级用于前端显示和条件判断。

## 能力衰减

### `apply_ability_decay()`

在 `simulate_npc_ticks` 的 tick 循环中每 tick 调用，使用累积制计算：

```
1. 每 tick 将 TICK_MINUTES(5) 累加到 decay_accumulators[char_id][ability_key]
2. 当累积值 >= intervalMinutes 时触发衰减：
   - intervals = accumulated // intervalMinutes
   - type="fixed":       exp -= amount × intervals
   - type="percentage":  exp *= (1 - amount/100) ^ intervals
3. 重置累积值为 accumulated % intervalMinutes（保留余数）
4. 衰减后 exp 不低于 0
```

衰减规则定义在 category="ability" 的 TraitDefinition 的 `decay` 字段中。`decay_accumulators` 存储在 GameState 中，随存档保存/恢复。

## 角色状态编译

### `build_character_state()` 中的特质处理

角色状态编译时，特质相关的处理顺序：

```
1. 从 trait_defs 自动填充角色的 abilities 字典
   - 遍历所有 trait_defs 中定义的能力名
   - 如果角色缺少该能力条目，初始化为默认值
2. 从 trait_defs 自动填充 experiences 字典
   - 与 abilities 同理，确保角色拥有所有定义的经验值条目
3. apply_trait_effects()
   - 收集并应用所有特质的 fixed/percentage 效果
4. 应用服装效果（clothing effects）
   - 已装备服装的效果叠加在特质效果之后
5. 计算最终的 ability grades
   - 对每个 ability 调用 exp_to_grade() 生成显示用等级
```

编译后的角色状态包含经过所有效果修正后的最终数值。

## 变量求值

### `evaluate_variable()`

衍生变量通过步骤列表动态计算，不存储固定值：

```
1. 初始化 result = 0
2. 循环检测：将当前变量 ID 加入 visited 集合（已在集合中则返回 0）
3. 遍历 steps:
   - 第一步 (i=0): result = stepValue（设初始值）
   - 后续步骤: result = apply_op(step.op, result, stepValue)
4. 返回 result
```

**关键区别**: 不是简单累加。第一步设初始值，后续步骤通过 `op` 字段控制运算方式。

### 循环保护

变量可以引用其他变量（`type="variable"`），可能产生循环引用。通过 `visited` 集合检测：

- 进入 `evaluate_variable()` 时检查当前变量 ID 是否在 visited 中
- 已访问 → 返回 0.0，避免无限递归
- visited 使用 copy-on-write（`visited | {var_id}`），不同分支互不影响

### `evaluate_variable_debug()`

调试版本的求值函数，返回完整的计算追踪：

```typescript
{ result: number, steps: [{ index, label, op, type, stepValue, accumulated }] }
```

用于前端 VariableEditor 的实时预览和调试。

## 变量步骤类型

每种步骤类型从角色状态的不同字段读取数据：

| 步骤类型 | 数据源 | 说明 |
|---------|--------|------|
| `constant` | step.value | 固定常数值 |
| `ability` | character.abilities[key].exp | 读取能力经验值 |
| `resource` | character.resources[key][field] | 读取资源值，field 可选 `value`（默认）或 `max` |
| `basicInfo` | character.basicInfo[key].value | 读取基本信息字段（仅 number 类型） |
| `traitCount` | character.traits[traitGroup].values | 统计指定特质组中拥有的特质数量 |
| `hasTrait` | character.traits[traitGroup].values | 检查是否拥有指定特质（有=1，无=0） |
| `experience` | character.experiences[key].count | 读取经历记录的触发次数 |
| `itemCount` | character.inventory[key].amount | 读取背包中指定物品的数量 |
| `variable` | evaluate_variable(varId) | 递归求值另一个变量 |

### op 运算符

第一步无 op（设初始值），后续步骤的 `op` 决定如何与当前 result 组合：

| op | 运算 |
|----|------|
| `add` | result + value（默认） |
| `subtract` | result - value |
| `multiply` | result × value |
| `divide` | result ÷ value（除 0 返回 0） |
| `min` | min(result, value) |
| `max` | max(result, value) |
| `floor` | max(result, value)（下限钳制） |
| `cap` | min(result, value)（上限钳制） |

## 命名空间

特质、特质组、变量的 ID 遵循全局命名空间规则（详见 overview.md）：

- **加载时**: `namespace_id(addon_id, local_id)` → `"base.human"`
- **运行时**: 所有引用使用完整命名空间 ID
- **保存时**: `to_local_id(namespaced_id)` → `"human"`，写回各自的 addon 版本目录

特质效果中的 target 路径（如 `"resources.hp"`）不加命名空间，因为它们指向角色状态的结构路径而非实体 ID。

变量步骤中引用其他变量时（`type="variable"`），`variableId` 使用完整命名空间 ID。
