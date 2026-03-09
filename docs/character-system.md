# 角色系统

## 1. 概述

角色系统管理游戏中所有角色（玩家和 NPC）的数据。角色的属性体系完全通过 JSON 配置定义，不同游戏场景可以拥有完全不同的属性集。

核心设计原则：
- **完全配置化**：属性类别、具体属性、显示方式均通过 JSON 定义
- **模板驱动**：先定义属性模板（有哪些属性），再基于模板创建具体角色
- **状态在后端**：所有角色状态由后端管理，前端仅负责渲染

## 2. 角色数据结构

```
Character (角色)
├── 基础信息 (basicInfo)        → 名称、金钱等简单键值对
├── 资源条 (resources)          → 体力、气力等，有当前值/最大值，显示为进度条
├── 服装 (clothing)             → 按部位分槽，引用服装定义，有穿着状态
├── 素质/特征 (traits)          → 按分类组织的标签列表
├── 能力 (abilities)            → 字母等级 + 经验值的属性表
├── 物品栏 (inventory)          → 持有的物品列表
└── 位置 (position)             → 当前所在地图和方格
```

## 3. 属性模板

属性模板定义了一个游戏场景中角色可以拥有哪些属性。具体角色基于模板创建，填入实际数值。

### 3.1 基础信息 (basicInfo)

简单的键值对，用于显示角色基本信息。

| 模板字段 | 类型 | 说明 |
|---------|------|------|
| `key` | `string` | 属性标识符 |
| `label` | `string` | 显示名称 |
| `type` | `"string" \| "number"` | 值类型 |
| `defaultValue` | `any` | 默认值 |

截图示例：
```
玩家 (好感度:0)
金钱: 14405
性欲: 0
```

### 3.2 资源条 (resources)

拥有当前值和最大值的属性，在 UI 中显示为进度条。

| 模板字段 | 类型 | 说明 |
|---------|------|------|
| `key` | `string` | 属性标识符 |
| `label` | `string` | 显示名称 |
| `defaultMax` | `number` | 默认最大值 |
| `defaultValue` | `number` | 默认当前值 |
| `color` | `string` | 进度条颜色（RGB） |

截图示例：
```
体力: [████████████████] (2000/2000)
气力: [████████████████] (2000/2000)
```

### 3.3 服装系统 (clothing)

服装系统包含两部分：**服装槽位**（角色身上的穿着位置）和**服装定义**（具体衣物的属性）。

#### 3.3.1 服装槽位

角色身上有 11 个固定槽位：

| 槽位 Key | 显示名称 | 说明 |
|----------|---------|------|
| `hat` | 帽子 | 头部装饰 |
| `upperBody` | 上半身 | 外层上衣 |
| `upperUnderwear` | 上半身内衣 | 内层上衣 |
| `lowerBody` | 下半身 | 外层下装 |
| `lowerUnderwear` | 下半身内衣 | 内层下装 |
| `hands` | 手 | 手套/手部装备 |
| `feet` | 脚 | 袜子/足部 |
| `shoes` | 鞋子 | 鞋类 |
| `accessory1` | 装饰品1 | 配饰槽位 |
| `accessory2` | 装饰品2 | 配饰槽位 |
| `accessory3` | 装饰品3 | 配饰槽位 |

#### 3.3.2 穿着状态

角色身上的每件服装有两种状态：

| 状态 | 说明 |
|------|------|
| `worn` | 正常穿着 |
| `halfWorn` | 半穿状态 |

半穿状态会影响：
- **遮挡属性**：半穿的衣物遮挡效果失效（或降低）
- **行动判断**：后续 action 系统中，某些行动的前置条件会依赖服装的穿着状态

#### 3.3.3 服装定义（Clothing Class）

每件具体服装是一个独立的数据对象，通过 JSON 定义。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 服装唯一标识符 |
| `name` | `string` | 服装显示名称 |
| `slot` | `string` | 适用的槽位（如 `"upperBody"`, `"shoes"` 等） |
| `occlusion` | `string[]` | 遮挡列表：该服装正常穿着时，会遮挡哪些槽位 |

**遮挡机制**：
- 当一件服装处于 `worn` 状态时，其 `occlusion` 列表中的槽位在 UI 显示中被遮挡（该槽位的服装信息不可见）
- 当一件服装处于 `halfWorn` 状态时，遮挡失效，被遮挡的槽位变为可见
- 遮挡仅影响 **显示** 和 **action 判断**，不影响服装数据本身的存在

示例：
```
上半身 [女衬衫] (worn)    → 遮挡 upperUnderwear → 上半身内衣不可见
上半身 [女衬衫] (halfWorn) → 遮挡失效 → 上半身内衣可见
```

### 3.4 素质/特征 (traits)

按分类组织的标签系统。每个分类下可以有多个标签。

| 模板字段 | 类型 | 说明 |
|---------|------|------|
| `key` | `string` | 分类标识符 |
| `label` | `string` | 分类显示名称 |
| `options` | `string[]?` | 可选的标签列表（可选，不提供则为自由输入） |
| `multiple` | `boolean` | 是否允许多个标签 |

截图示例：
```
族群      ：[人类]
性的特征  ：[童贞]
身体的特征：[男人] [...]
精神的特征：
技术的特征：[调和知识]
其他      ：
```

### 3.5 能力 (abilities)

字母等级 + 经验值的属性表。ERA 游戏的核心属性系统。

| 模板字段 | 类型 | 说明 |
|---------|------|------|
| `key` | `string` | 属性标识符 |
| `label` | `string` | 显示名称 |
| `defaultValue` | `number` | 默认经验值 |

#### 等级计算规则

等级由经验值自动计算，每 **1000** 点经验进入下一级：

| 等级 | 经验值范围 |
|------|-----------|
| G | 0 ~ 999 |
| F | 1000 ~ 1999 |
| E | 2000 ~ 2999 |
| D | 3000 ~ 3999 |
| C | 4000 ~ 4999 |
| B | 5000 ~ 5999 |
| A | 6000 ~ 6999 |
| S | 7000+ |

等级体系（由低到高）：`G → F → E → D → C → B → A → S`

运行时等级完全由经验值决定，不可手动覆盖。

截图示例（三列排布）：
```
P感觉:  G  0    顺从:      G  0    指技:  C  2
A感觉:  F  1    亲密:      B  5    A技:   C  2
B感觉:  G  0    侍奉精神:  G  0    胸技:  E  0
M感觉:  G  0    露出癖:    G  0    舌技:  C  2
欲望:   C  4    抖M之气:   G  0    腰技:  C  2
技巧:   E  2    抖S之气:   G  0
```

### 3.6 物品栏 (inventory)

角色持有的物品列表。

| 模板字段 | 类型 | 说明 |
|---------|------|------|
| `key` | `string` | 物品栏分类标识符 |
| `label` | `string` | 分类显示名称 |
| `maxSlots` | `number?` | 最大槽位数（可选，不提供则无限制） |

截图示例：
```
当前持有料理：无
```

## 4. 位置信息

角色在地图上的位置，由后端管理。

| 字段 | 类型 | 说明 |
|------|------|------|
| `mapId` | `string` | 当前所在地图 ID |
| `cellId` | `number` | 当前所在方格编号 |

只有可移动方格可以作为角色位置。

## 5. JSON 配置格式

### 5.1 属性模板配置

属性模板定义了游戏中角色可以拥有哪些属性，所有角色共享同一套模板。

```json
{
  "id": "era-touhou",
  "name": "东方ERA角色模板",

  "basicInfo": [
    { "key": "name", "label": "名称", "type": "string", "defaultValue": "" },
    { "key": "favorability", "label": "好感度", "type": "number", "defaultValue": 0 },
    { "key": "money", "label": "金钱", "type": "number", "defaultValue": 0 },
    { "key": "libido", "label": "性欲", "type": "number", "defaultValue": 0 }
  ],

  "resources": [
    { "key": "stamina", "label": "体力", "defaultMax": 2000, "defaultValue": 2000, "color": "#FFFF00" },
    { "key": "energy", "label": "气力", "defaultMax": 2000, "defaultValue": 2000, "color": "#00FFFF" }
  ],

  "clothingSlots": [
    "hat", "upperBody", "upperUnderwear",
    "lowerBody", "lowerUnderwear",
    "hands", "feet", "shoes",
    "accessory1", "accessory2", "accessory3"
  ],

  "traits": [
    { "key": "race", "label": "族群", "multiple": false },
    { "key": "sexTrait", "label": "性的特征", "multiple": true },
    { "key": "bodyTrait", "label": "身体的特征", "multiple": true },
    { "key": "mentalTrait", "label": "精神的特征", "multiple": true },
    { "key": "techTrait", "label": "技术的特征", "multiple": true },
    { "key": "other", "label": "其他", "multiple": true }
  ],

  "abilities": [
    { "key": "pSense", "label": "P感觉", "defaultValue": 0 },
    { "key": "aSense", "label": "A感觉", "defaultValue": 0 },
    { "key": "bSense", "label": "B感觉", "defaultValue": 0 },
    { "key": "mSense", "label": "M感觉", "defaultValue": 0 },
    { "key": "desire", "label": "欲望", "defaultValue": 0 },
    { "key": "technique", "label": "技巧", "defaultValue": 0 },
    { "key": "obedience", "label": "顺从", "defaultValue": 0 },
    { "key": "intimacy", "label": "亲密", "defaultValue": 0 },
    { "key": "discipline", "label": "教养", "defaultValue": 0 },
    { "key": "serviceSpirit", "label": "侍奉精神", "defaultValue": 0 },
    { "key": "exhibitionism", "label": "露出癖", "defaultValue": 0 },
    { "key": "masochism", "label": "抖M之气", "defaultValue": 0 },
    { "key": "sadism", "label": "抖S之气", "defaultValue": 0 },
    { "key": "fingerTech", "label": "指技", "defaultValue": 0 },
    { "key": "aTech", "label": "A技", "defaultValue": 0 },
    { "key": "chestTech", "label": "胸技", "defaultValue": 0 },
    { "key": "tongueTech", "label": "舌技", "defaultValue": 0 },
    { "key": "waistTech", "label": "腰技", "defaultValue": 0 }
  ],

  "inventory": [
    { "key": "cooking", "label": "当前持有料理", "maxSlots": 1 }
  ]
}
```

### 5.2 服装定义

所有服装作为独立的配置文件定义，供角色引用。

```json
{
  "clothing": [
    {
      "id": "blouse",
      "name": "女衬衫",
      "slot": "upperBody",
      "occlusion": ["upperUnderwear"]
    },
    {
      "id": "pants",
      "name": "裤子",
      "slot": "lowerBody",
      "occlusion": ["lowerUnderwear"]
    },
    {
      "id": "short-socks",
      "name": "短袜",
      "slot": "feet",
      "occlusion": []
    },
    {
      "id": "round-shoes",
      "name": "小圆鞋",
      "slot": "shoes",
      "occlusion": ["feet"]
    },
    {
      "id": "lace-bra",
      "name": "蕾丝内衣",
      "slot": "upperUnderwear",
      "occlusion": []
    },
    {
      "id": "maid-headband",
      "name": "女仆头饰",
      "slot": "hat",
      "occlusion": []
    },
    {
      "id": "ribbon",
      "name": "缎带",
      "slot": "accessory1",
      "occlusion": []
    }
  ]
}
```

### 5.3 角色实例配置

基于模板创建的具体角色。只需声明与模板默认值不同的属性。

角色身上的服装引用服装 ID，并附带穿着状态。

#### 玩家角色

```json
{
  "id": "player",
  "template": "era-touhou",
  "isPlayer": true,

  "basicInfo": {
    "name": "玩家",
    "money": 14405
  },

  "resources": {
    "stamina": { "max": 2000, "value": 2000 },
    "energy": { "max": 2000, "value": 2000 }
  },

  "clothing": {
    "upperBody": { "itemId": "blouse", "state": "worn" },
    "lowerBody": { "itemId": "pants", "state": "worn" },
    "feet": { "itemId": "short-socks", "state": "worn" },
    "shoes": { "itemId": "round-shoes", "state": "worn" }
  },

  "traits": {
    "race": ["人类"],
    "sexTrait": ["童贞"],
    "bodyTrait": ["男人"],
    "techTrait": ["调和知识"]
  },

  "abilities": {
    "aSense": 1000,
    "desire": 4000,
    "technique": 2000,
    "intimacy": 5000,
    "discipline": 1000,
    "fingerTech": 4000,
    "aTech": 4000,
    "tongueTech": 4000,
    "waistTech": 4000
  },

  "position": {
    "mapId": "scarlet-2f3f",
    "cellId": 15
  }
}
```

#### NPC 角色

```json
{
  "id": "sakuya",
  "template": "era-touhou",
  "isPlayer": false,

  "basicInfo": {
    "name": "咲夜"
  },

  "clothing": {
    "hat": { "itemId": "maid-headband", "state": "worn" },
    "upperBody": { "itemId": "maid-uniform-top", "state": "worn" },
    "lowerBody": { "itemId": "maid-uniform-skirt", "state": "worn" },
    "upperUnderwear": { "itemId": "lace-bra", "state": "worn" },
    "feet": { "itemId": "white-stockings", "state": "worn" },
    "shoes": { "itemId": "leather-shoes", "state": "worn" },
    "accessory1": { "itemId": "ribbon", "state": "worn" }
  },

  "traits": {
    "race": ["人类"],
    "bodyTrait": ["女人"]
  },

  "abilities": {
    "technique": 6500,
    "intimacy": 4200
  },

  "position": {
    "mapId": "scarlet-2f3f",
    "cellId": 13
  }
}
```

## 6. 服装遮挡逻辑

### 6.1 遮挡判断流程

```
1. 遍历角色所有槽位
2. 对每个有服装的槽位：
   a. 如果状态为 worn → 该服装的 occlusion 列表中的槽位被遮挡
   b. 如果状态为 halfWorn → 遮挡失效
3. 被遮挡的槽位：
   - UI 显示中隐藏该槽位的服装信息
   - action 系统判断时视为"不可直接接触"
```

### 6.2 遮挡示例

```
角色穿着：
  upperBody:      女衬衫 (worn)       → occlusion: ["upperUnderwear"]
  upperUnderwear: 蕾丝内衣 (worn)     → occlusion: []
  shoes:          小圆鞋 (worn)       → occlusion: ["feet"]
  feet:           短袜 (worn)         → occlusion: []

显示结果：
  upperBody:      女衬衫       ← 可见
  upperUnderwear: (被遮挡)     ← 被女衬衫遮挡，不显示
  shoes:          小圆鞋       ← 可见
  feet:           (被遮挡)     ← 被小圆鞋遮挡，不显示

当女衬衫变为 halfWorn：
  upperBody:      女衬衫 (半穿) ← 可见，标注半穿状态
  upperUnderwear: 蕾丝内衣      ← 遮挡失效，现在可见
```

## 7. 玩家与 NPC 的区别

| 方面 | 玩家 | NPC |
|------|------|-----|
| `isPlayer` | `true` | `false` |
| 移动控制 | 由用户操作 | 由游戏逻辑/LLM 控制 |
| 信息面板 | 完整显示所有属性 | 完整显示所有属性（完全可见） |
| 对话 | 用户输入 | LLM 生成 |
| 数量 | 1 个 | 多个 |

## 8. 运行时行为

### 8.1 属性修改

属性修改全部在后端进行：

```
1. 触发事件（游戏逻辑/LLM 输出解析）
2. 后端修改角色属性值
3. 如果是能力经验值变化，自动重新计算字母等级（经验值 / 1000）
4. 如果是服装状态变化，重新计算遮挡关系
5. 推送状态更新给前端
6. 前端更新角色信息面板显示
```

### 8.2 NPC 行为

NPC 的行为（移动、对话、状态变化）由后端控制：
- **自主移动**：根据游戏逻辑或 LLM 决策，NPC 可以在连接的方格间移动
- **对话生成**：玩家与 NPC 交互时，后端将角色状态作为上下文传递给 LLM 生成对话
- **状态变化**：根据游戏事件和 LLM 输出，更新 NPC 属性

## 9. 后端职责

| 职责 | 说明 |
|------|------|
| **模板加载** | 读取属性模板 JSON，构建属性定义 |
| **服装加载** | 读取服装定义 JSON，构建服装数据 |
| **角色加载** | 读取角色 JSON，基于模板创建角色实例 |
| **属性管理** | 处理属性修改、等级重算、状态验证 |
| **遮挡计算** | 根据服装穿着状态计算遮挡关系 |
| **位置管理** | 维护角色在地图上的位置（与地图系统协同） |
| **状态推送** | 属性变化时推送更新给前端 |

## 10. 前端职责

| 职责 | 说明 |
|------|------|
| **信息面板渲染** | 根据模板定义的结构和角色数据，渲染角色信息面板 |
| **资源条显示** | 渲染带颜色的进度条（体力、气力等） |
| **能力表显示** | 以多列表格形式显示字母等级 + 经验值 |
| **服装显示** | 显示服装槽位、穿着状态，根据遮挡关系隐藏被遮挡的槽位 |
| **特征显示** | 显示特征标签 |
