# 派生变量系统 (Derived Variables)

## 1. 概述

派生变量是一种 **Addon 级别的可复用计算公式**。它从角色的现有属性（能力、资源、特质、基础信息等）中计算出一个数值，供行动系统的条件、权重修正、效果中引用。

### 核心问题

当前行动系统中，复杂的属性组合判断需要在每个行动中重复定义。例如"综合技巧水平"可能需要在十几个行动的权重修正中反复写相同的公式。派生变量将这些公式抽象为独立实体，**定义一次，到处引用**。

### 设计原则

- **按需求值**：不存储结果，每次引用时从角色当前状态实时计算
- **只读**：派生变量不修改角色状态，只产出一个数值
- **Addon 级别**：与物品、特质等实体同级，存储在 Addon 的 `variables.json` 中
- **可组合**：派生变量可以引用其他派生变量（检测循环依赖）

## 2. 数据结构

### 2.1 variables.json

```json
{
  "variables": [
    {
      "id": "totalTech",
      "name": "综合技巧",
      "description": "所有技巧能力的加权平均",
      "tags": ["combat"],
      "resultType": "number",
      "steps": [
        { "type": "ability", "key": "fingerTech", "label": "指技" },
        { "op": "add", "type": "ability", "key": "tongueTech", "label": "+舌技" },
        { "op": "add", "type": "ability", "key": "waistTech", "label": "+腰技" },
        { "op": "add", "type": "ability", "key": "chestTech", "label": "+胸技" },
        { "op": "divide", "type": "constant", "value": 4, "label": "÷4 取平均" }
      ]
    }
  ]
}
```

### 2.2 Step 定义

每个派生变量由一系列有序 **步骤 (Step)** 组成。第一步为初始值，后续步骤用运算符对累积值进行操作。

#### 值来源类型 (type)

| type | 字段 | 说明 |
|------|------|------|
| `ability` | `key` | 读取能力经验值 |
| `resource` | `key`, `field?` | 读取资源值（`field`: `"value"` 或 `"max"`，默认 `"value"`） |
| `basicInfo` | `key` | 读取 basicInfo 数值字段 |
| `traitCount` | `traitGroup` | 该特质分类下角色拥有的特质数量 |
| `hasTrait` | `traitGroup`, `traitId` | 角色是否拥有该特质（1 = 有，0 = 无） |
| `constant` | `value` | 固定常量 |
| `variable` | `varId` | 引用另一个派生变量的计算结果 |

#### 运算符 (op)

| op | 说明 |
|------|------|
| *(首步无op)* | 初始值 |
| `add` | 加 |
| `subtract` | 减 |
| `multiply` | 乘 |
| `divide` | 除（除零保护，结果为 0） |
| `min` | 取较小值：`result = min(result, stepValue)` |
| `max` | 取较大值：`result = max(result, stepValue)` |
| `clamp_min` | 下限钳制：`result = max(result, stepValue)` |
| `clamp_max` | 上限钳制：`result = min(result, stepValue)` |

#### Step 完整字段

```typescript
interface VariableStep {
  type: "ability" | "resource" | "basicInfo" | "traitCount" | "hasTrait" | "constant" | "variable";
  op?: "add" | "subtract" | "multiply" | "divide" | "min" | "max" | "clamp_min" | "clamp_max";
  // 根据 type 不同:
  key?: string;          // ability / resource / basicInfo
  field?: "value" | "max"; // resource 专用，默认 "value"
  traitGroup?: string;   // traitCount / hasTrait
  traitId?: string;      // hasTrait
  value?: number;        // constant
  varId?: string;        // variable (引用其他派生变量)
  label?: string;        // 编辑器中显示的步骤说明（可选）
}
```

### 2.3 完整示例

**例1：综合技巧等级**
```json
{
  "id": "totalTech",
  "name": "综合技巧",
  "description": "四项技巧的平均经验值",
  "tags": [],
  "steps": [
    { "type": "ability", "key": "fingerTech" },
    { "op": "add", "type": "ability", "key": "tongueTech" },
    { "op": "add", "type": "ability", "key": "waistTech" },
    { "op": "add", "type": "ability", "key": "chestTech" },
    { "op": "divide", "type": "constant", "value": 4 }
  ]
}
```

**例2：危险程度（有特质加成）**
```json
{
  "id": "dangerLevel",
  "name": "危险程度",
  "description": "基于欲望和精神特质的综合危险指数",
  "tags": ["mental"],
  "steps": [
    { "type": "ability", "key": "desire", "label": "基础=欲望值" },
    { "op": "add", "type": "ability", "key": "mSense", "label": "+M感觉" },
    { "op": "multiply", "type": "constant", "value": 1.5, "label": "×1.5 基础倍率" },
    { "op": "add", "type": "hasTrait", "traitGroup": "mentalTrait", "traitId": "unstable",
      "label": "精神不稳定+1" },
    { "op": "multiply", "type": "constant", "value": 1000, "label": "×1000 归一化" },
    { "op": "clamp_min", "type": "constant", "value": 0, "label": "最低为0" }
  ]
}
```

**例3：引用其他变量**
```json
{
  "id": "combatPower",
  "name": "战斗力",
  "steps": [
    { "type": "variable", "varId": "totalTech", "label": "综合技巧" },
    { "op": "add", "type": "variable", "varId": "dangerLevel", "label": "+危险程度" },
    { "op": "divide", "type": "constant", "value": 2 }
  ]
}
```

## 3. 求值引擎

### 3.1 求值逻辑

```python
def evaluate_variable(var_def, character, all_var_defs, visited=None):
    """按步骤顺序求值，返回最终数值"""
    if visited is None:
        visited = set()
    if var_def["id"] in visited:
        return 0  # 循环依赖保护
    visited.add(var_def["id"])

    result = 0
    for i, step in enumerate(var_def["steps"]):
        step_value = resolve_step_value(step, character, all_var_defs, visited)
        if i == 0:
            result = step_value  # 首步：直接赋值
        else:
            result = apply_op(step["op"], result, step_value)
    return result
```

### 3.2 角色上下文

求值时需要指定 **目标角色**（`self` 或 `{{targetId}}`），公式从该角色的状态中读取数据。在行动系统中：

- `conditions` / `costs` 中的变量 → 默认读取行动执行者
- `effects` 中指定了 `target` 时 → 读取对应角色
- `weightModifiers` 中的变量 → 默认读取行动执行者

## 4. 在行动系统中的引用

### 4.1 条件引用

```json
{
  "type": "variable",
  "varId": "totalTech",
  "op": ">=",
  "value": 3000
}
```

新增条件类型 `variable`：对派生变量的计算结果进行比较判断。

### 4.2 权重修正引用

```json
{
  "type": "variable",
  "varId": "totalTech",
  "per": 1000,
  "bonus": 5
}
```

替代原来的 `{ "type": "ability", "key": "technique", "per": 1000, "bonus": 5 }`，但更灵活——可以引用任意复合公式。

### 4.3 效果中引用（动态数值）

```json
{
  "type": "ability",
  "key": "intimacy",
  "target": "self",
  "op": "add",
  "value": { "varId": "totalTech", "multiply": 0.1 }
}
```

当 `value` 为对象而非数字时，从派生变量动态计算。`multiply` 为可选的后处理倍率。

## 5. 命名空间

派生变量与其他实体一致，遵循 ID 命名空间规则：
- 文件内存储短 ID
- 加载时补全为 `addonId.localId`
- 跨 Addon 引用使用完整 ID（如 `era-touhou.totalTech`）

## 6. UI/UX 设计

### 6.1 设计理念

> **"Don't make me think"** — 编辑者应该能像写算式一样自然地组建公式，不需要理解底层数据结构。

参考业界方案：
- **ORK Framework**（Unity RPG 引擎）：节点式公式编辑器，54 种节点类型，步骤式计算链，支持实时测试
- **UE5 GAS**（Gameplay Ability System）：修饰符聚合器模式 `(Base + Additive) × Multiplicative`
- **RPG Maker**：内联公式栏，直接写表达式

本系统采用 **步骤链式编辑器**，兼顾可视化和效率：不需要拖拽连线的复杂节点图，但比纯文本公式更可读、更不易出错。

### 6.2 公式编辑器布局

```
┌─────────────────────────────────────────────────────┐
│ 派生变量: 综合技巧                                    │
│ ID: totalTech    标签: [combat]                      │
│ 描述: 所有技巧能力的加权平均                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ 步骤 1 ──────────────────────────────────┐      │
│  │  初始值   [能力值 ▼]  [指技 (fingerTech) ▼]│  [×] │
│  └────────────────────────────────────────────┘      │
│       │                                             │
│       ＋                                            │
│       │                                             │
│  ┌─ 步骤 2 ──────────────────────────────────┐      │
│  │  [加 ▼]   [能力值 ▼]  [舌技 (tongueTech) ▼]│  [×] │
│  └────────────────────────────────────────────┘      │
│       │                                             │
│       ＋                                            │
│       │                                             │
│  ┌─ 步骤 3 ──────────────────────────────────┐      │
│  │  [加 ▼]   [能力值 ▼]  [腰技 (waistTech) ▼]│  [×] │
│  └────────────────────────────────────────────┘      │
│       │                                             │
│       ＋                                            │
│       │                                             │
│  ┌─ 步骤 4 ──────────────────────────────────┐      │
│  │  [加 ▼]   [能力值 ▼]  [胸技 (chestTech) ▼]│  [×] │
│  └────────────────────────────────────────────┘      │
│       │                                             │
│       ÷                                             │
│       │                                             │
│  ┌─ 步骤 5 ──────────────────────────────────┐      │
│  │  [除 ▼]   [常量 ▼]   [    4    ]          │  [×] │
│  └────────────────────────────────────────────┘      │
│                                                     │
│  [+ 添加步骤]                                        │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 公式预览:  (fingerTech + tongueTech + waistTech      │
│            + chestTech) ÷ 4                         │
├─────────────────────────────────────────────────────┤
│ 测试计算                                             │
│ 目标角色: [咲夜 ▼]                                    │
│ 结果: 4675.0                                        │
│ (fingerTech=4000 + tongueTech=4000 + waistTech=4000 │
│  + chestTech=0) ÷ 4 = 3000.0                       │
└─────────────────────────────────────────────────────┘
```

### 6.3 交互细节

#### 步骤编辑行

每个步骤是一行，包含三个下拉框 + 一个删除按钮：

```
[运算符 ▼]  [值类型 ▼]  [具体字段 ▼ / 输入框]  [×]
```

- **运算符下拉**：首步固定显示"初始值"不可编辑；后续步骤可选 加/减/乘/除/最小值/最大值/下限/上限
- **值类型下拉**：能力值 / 资源值 / 基础信息 / 特质计数 / 拥有特质 / 常量 / 其他变量
- **具体字段**：根据值类型动态变化
  - 能力值 → 显示所有已定义的能力 key（从模板读取）
  - 资源值 → 显示所有资源 key + 子字段选择（当前值/最大值）
  - 常量 → 显示数字输入框
  - 其他变量 → 显示同 Addon 内（及依赖 Addon）的变量列表
  - 特质相关 → 显示特质分类选择 + 特质 ID 选择

#### 步骤拖拽排序

步骤左侧有拖拽手柄 `⠿`，支持拖拽调整顺序。拖拽时首步的运算符自动清除，原首步移到非首位时自动补默认运算符 `add`。

#### 公式预览

编辑器下方实时生成人可读的公式文本，使用数学符号：

```
(fingerTech + tongueTech + waistTech + chestTech) ÷ 4
```

括号根据运算优先级自动推断（乘除优先于加减时不加括号，混合运算时加括号帮助理解）。

#### 测试计算面板

可折叠面板，选择一个已有角色，点击"计算"后：
- 显示最终结果
- 展开每一步的中间值，方便调试

```
步骤 1: fingerTech = 4000         → 累计: 4000
步骤 2: + tongueTech = 4000       → 累计: 8000
步骤 3: + waistTech = 4000        → 累计: 12000
步骤 4: + chestTech = 0           → 累计: 12000
步骤 5: ÷ 4                      → 累计: 3000.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
结果: 3000.0
```

### 6.4 在行动编辑器中的引用 UI

当用户在行动编辑器中需要引用派生变量时，统一使用 **变量选择器**：

#### 条件引用
```
条件类型: [派生变量 ▼]
变量:     [综合技巧 (totalTech) ▼]
比较:     [>= ▼]  [3000]
```

#### 权重修正引用
```
修正类型: [派生变量 ▼]
变量:     [综合技巧 (totalTech) ▼]
每 [1000] 点  加成 [5]
```

#### 效果动态值
在效果编辑行中，`value` 字段旁增加一个切换按钮 `[V]`，切换固定值/变量模式：

```
效果: [能力值 ▼] [亲密 ▼] [加 ▼]  值: [V] [综合技巧 ▼] × [0.1]
                                   ↑ 切换按钮：固定值 ↔ 变量引用
```

### 6.5 变量列表页

与物品、特质等管理页一致的列表视图：
- 按标签分组折叠
- 每个变量卡片显示：名称、ID、公式预览文本
- 点击进入编辑器
- 支持标签管理

## 7. 错误处理

| 场景 | 处理 |
|------|------|
| 循环依赖（A → B → A） | 求值时检测 visited set，循环时返回 0 |
| 引用的变量不存在 | 该步骤值为 0，编辑器中标红提示 |
| 引用的能力/资源 key 不存在 | 该步骤值为 0，编辑器中标红提示 |
| 除以零 | 结果为 0 |
| 步骤为空 | 变量值为 0 |
| Addon 被禁用导致变量消失 | 引用该变量的条件视为不满足，权重修正视为 0，效果值视为 0 |

## 8. 文件与加载

### 8.1 文件位置

```
addons/{addonId}/{version}/variables.json
```

与 `traits.json`、`items.json` 等同级。

### 8.2 加载顺序

在 `addon_loader.py` 中，变量定义在其他实体之后加载（因为变量引用其他变量时需要所有变量定义已注册）。但由于求值是延迟的（按需），加载顺序实际上只影响 ID 注册，不影响正确性。

### 8.3 命名空间

加载时与其他实体一致：
- 短 ID 自动补全为 `addonId.localId`
- `varId` 引用中的跨 Addon 引用保持完整 ID

## 9. API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/variables` | 获取所有派生变量定义 |
| `GET` | `/api/variables/{id}` | 获取单个变量定义 |
| `POST` | `/api/variables` | 创建变量 |
| `PUT` | `/api/variables/{id}` | 更新变量 |
| `DELETE` | `/api/variables/{id}` | 删除变量 |
| `POST` | `/api/variables/{id}/evaluate` | 测试求值（body: `{characterId}`) |
| `GET` | `/api/variable-tags` | 获取变量标签池 |
| `POST` | `/api/variable-tags` | 创建标签 |
| `DELETE` | `/api/variable-tags/{tag}` | 删除标签 |

## 10. 与现有系统的兼容

### 10.1 向后兼容

- 现有行动定义无需修改，原有的 `ability` 类型条件/权重修正继续有效
- 派生变量是**新增**的引用方式，不替代现有方式
- 没有 `variables.json` 的 Addon 正常工作

### 10.2 TypeScript 类型

```typescript
interface VariableStep {
  type: "ability" | "resource" | "basicInfo" | "traitCount" | "hasTrait" | "constant" | "variable";
  op?: "add" | "subtract" | "multiply" | "divide" | "min" | "max" | "clamp_min" | "clamp_max";
  key?: string;
  field?: "value" | "max";
  traitGroup?: string;
  traitId?: string;
  value?: number;
  varId?: string;
  label?: string;
}

interface DerivedVariable {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  source: string;           // addon ID (运行时注入)
  steps: VariableStep[];
}
```

## 11. 实现优先级

| 阶段 | 内容 |
|------|------|
| **Phase 1** | 数据结构 + 后端求值引擎 + CRUD API |
| **Phase 2** | 前端变量列表 + 步骤链式编辑器 + 测试面板 |
| **Phase 3** | 行动编辑器中集成变量引用（条件/权重/效果） |
| **Phase 4** | 公式预览 + 拖拽排序 + 跨 Addon 引用 UI |
