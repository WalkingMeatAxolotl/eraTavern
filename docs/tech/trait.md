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
  id: string;                    // 特质 ID（运行时带命名空间前缀）
  name: string;                  // 显示名称
  description: string;           // 描述文字
  category: string;              // 分类（如 "种族", "职业" 等）
  tags: string[];                // 标签列表
  effects: TraitEffect[];        // 特质效果列表
  abilityDecay: AbilityDecay[];  // 能力衰减规则
  source: string;                // 来源 addon ID（运行时自动填充）
}
```

### TraitEffect

```typescript
interface TraitEffect {
  target: string;       // 效果目标路径（如 "resources.hp", "abilities.strength"）
  type: "fixed" | "percentage";  // 固定值加减 或 百分比乘数
  value: number;        // 效果数值
}
```

### AbilityDecay

```typescript
interface AbilityDecay {
  ability: string;      // 目标能力 ID
  interval: number;     // 衰减间隔（游戏时间单位）
  type: "fixed" | "percentage";  // 衰减类型
  value: number;        // 衰减量
}
```

### TraitGroup

```typescript
interface TraitGroup {
  id: string;           // 特质组 ID
  name: string;         // 组名称
  description: string;  // 组描述
  traits: string[];     // 包含的特质 ID 列表
  exclusive: boolean;   // 是否互斥（同组只能拥有一个）
  source: string;       // 来源 addon ID
}
```

### VariableDefinition

```typescript
interface VariableDefinition {
  id: string;           // 变量 ID
  name: string;         // 显示名称
  description: string;  // 描述
  steps: VariableStep[];// 求值步骤列表（按顺序累加）
  source: string;       // 来源 addon ID
}
```

### VariableStep

```typescript
interface VariableStep {
  type: string;         // 步骤类型（见"变量步骤类型"章节）
  source: string;       // 数据源路径
  field?: string;       // 字段名（部分类型需要）
  value?: number;       // 固定值（constant 类型使用）
  multiplier?: number;  // 乘数
  variableId?: string;  // 引用的变量 ID（variable 类型使用）
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

### 求值与标签

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/game/variables/evaluate` | 对指定角色求值变量，返回计算结果 |
| `GET` | `/api/game/tags/traits` | 获取所有特质标签 |
| `PUT` | `/api/game/tags/traits` | 批量更新特质标签 |

路由参数使用 `:path` converter 以支持 ID 中的 `.` 分隔符。

## 特质效果计算

### `apply_trait_effects()`

遍历角色拥有的所有特质，收集并应用效果到角色状态：

```
1. 遍历角色的 traits 列表
2. 对每个 trait，查找 trait_defs 获取定义
3. 收集所有 effects:
   - type="fixed"      → 累加到 delta 字典
   - type="percentage"  → 累加到 multiplier 字典
4. 应用到角色状态：
   - resources（如 hp, mp）:  base_value + delta, 再 × (1 + multiplier)
   - abilities（如 strength）: base_value + delta, 再 × (1 + multiplier)
   - basicInfo 字段: 直接覆盖或累加
```

**计算公式**: `final = (base + fixed_delta) × (1 + percentage_sum)`

固定值先加，百分比后乘。多个特质的同目标效果会累加。

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

按游戏时间推进周期性降低能力值：

```
1. 检查距离上次衰减是否超过 interval
2. 如果到达衰减时间点：
   - type="fixed":       ability_value -= value
   - type="percentage":  ability_value -= ability_value × (value / 100)
3. 更新上次衰减时间戳
4. 衰减后能力值不低于 0
```

衰减规则定义在 TraitDefinition 的 `abilityDecay` 字段中。拥有该特质的角色才会受到对应的衰减。例如"人类"特质可以定义所有能力按一定速率自然衰减。

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
2. 初始化 visited = set()（循环检测）
3. 将当前变量 ID 加入 visited
4. 按顺序遍历 steps:
   - 从角色状态中读取步骤指定的数据源
   - 应用 multiplier（如果有）
   - 累加到 result
5. 返回 result
```

### 循环保护

变量可以引用其他变量（`type="variable"`），可能产生循环引用。通过 `visited` 集合检测：

- 每次进入 `evaluate_variable()` 将当前变量 ID 加入 visited
- 遇到 `type="variable"` 步骤时，检查目标变量是否已在 visited 中
- 如果已访问 → 跳过该步骤（返回 0），避免无限递归

### `evaluate_variable_debug()`

调试版本的求值函数，返回完整的计算追踪：

- 每个步骤的输入值、乘数、步骤结果
- 最终累加值
- 用于前端 VariableEditor 的实时预览和调试

## 变量步骤类型

每种步骤类型从角色状态的不同字段读取数据：

| 步骤类型 | 数据源 | 说明 |
|---------|--------|------|
| `constant` | step.value | 固定常数值 |
| `ability` | character.abilities[source] | 读取能力值 |
| `resource` | character.resources[source] | 读取资源值（如 hp、mp） |
| `experience` | character.experiences[source] | 读取经验值 |
| `basicInfo` | character.basicInfo[source] | 读取基本信息字段 |
| `variable` | evaluate_variable(variableId) | 递归求值另一个变量 |
| `trait_count` | character.traits | 统计拥有的特质数量（可按 tag 过滤） |
| `item_count` | character.inventory | 统计背包中的物品数量 |

每个步骤的结果 = 读取值 × multiplier（默认 1），然后累加到总结果。

## 命名空间

特质、特质组、变量的 ID 遵循全局命名空间规则（详见 overview.md）：

- **加载时**: `namespace_id(addon_id, local_id)` → `"base.human"`
- **运行时**: 所有引用使用完整命名空间 ID
- **保存时**: `to_local_id(namespaced_id)` → `"human"`，写回各自的 addon 版本目录

特质效果中的 target 路径（如 `"resources.hp"`）不加命名空间，因为它们指向角色状态的结构路径而非实体 ID。

变量步骤中引用其他变量时（`type="variable"`），`variableId` 使用完整命名空间 ID。
