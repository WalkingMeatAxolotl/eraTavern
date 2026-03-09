# Set（卡）系统

## 1. 概述

Set 系统将各类游戏数据（角色、特质、服装、物品、地图、行动）从整包式的"游戏卡"拆分为独立可组合的"卡/Set"。每个 Set 是一个类目的独立数据包，可单独导入/导出/分享。游戏预设（Preset）通过组合多个 Set 来构成一个完整的游戏。

### 核心理念

```
当前：游戏卡 = 整包（所有类目打包在一起，分享即分享整包）

目标：
  Set = 单个类目的独立包（如"东方物品集"、"基础特质集"）
  Preset = 配置文件，声明启用了哪些 Set + 初始状态
  用户可导入多个同类目 Set，Preset 按需组合
```

类比 SillyTavern：角色卡、世界书各自独立，可任意组合。

## 2. 目录结构

```
root/
  sets/                          ← 用户的卡（可导入/导出/手动拖入）
    characters/
      touhou-maids/
        set.json
        characters/
          sakuya.json
          remilia.json
        assets/characters/
      my-originals/
        set.json
        characters/
          ...
    traits/
      era-base-traits/
        set.json
        traits.json
      touhou-traits/
        set.json
        traits.json
    clothing/
      era-base-clothing/
        set.json
        clothing.json
    items/
      basic-items/
        set.json
        items.json
    maps/
      scarlet-mansion/
        set.json
        maps/
          1f.json
          2f.json
        assets/backgrounds/
    actions/
      social-actions/
        set.json
        actions.json
    templates/
      era-touhou-template/
        set.json
        character_template.json

  backend/data/
    builtin/                     ← 内置基础定义（随程序分发，不可修改）
      traits.json
      clothing.json
      items.json
    presets/                     ← 游戏预设
      era-touhou/
        preset.json
```

### 关键区分

| 目录 | 用途 | 可修改 | 用户可见 |
|------|------|--------|---------|
| `sets/` | 用户导入/创建的卡 | 是 | 是，根目录下直接可见 |
| `backend/data/builtin/` | 内置基础定义 | 否 | 不需要关注 |
| `backend/data/presets/` | 游戏预设配置 | 是 | 通过 UI 管理 |

## 3. Set 元数据 (set.json)

每个 Set 目录下的 `set.json`：

```json
{
  "id": "touhou-maids",
  "name": "东方女仆角色集",
  "description": "包含咲夜等角色",
  "author": "作者名",
  "version": "1.0.0",
  "category": "characters",
  "recommends": ["era-base-clothing", "era-base-traits"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识，与目录名一致 |
| `name` | string | 显示名称 |
| `description` | string | 描述 |
| `author` | string | 作者 |
| `version` | string | 版本号 |
| `category` | string | 类目（characters/traits/clothing/items/maps/actions/templates） |
| `recommends` | string[] | 推荐配套的其他 Set ID（非强制） |

## 4. Preset（游戏预设）

### preset.json

```json
{
  "id": "era-touhou",
  "name": "東方ERA",
  "description": "东方 ERA 风格游戏",
  "template": "era-touhou-template",
  "sets": {
    "characters": ["touhou-maids"],
    "traits": ["era-base-traits", "touhou-traits"],
    "clothing": ["era-base-clothing"],
    "items": ["basic-items"],
    "maps": ["scarlet-mansion"],
    "actions": ["social-actions"]
  },
  "initialState": {
    "playerCharacter": "player",
    "startMap": "tarven1",
    "startCell": 1
  }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `template` | string | 使用的 character_template Set ID（只能一个） |
| `sets` | object | 各类目启用的 Set ID 列表，顺序即加载顺序 |
| `initialState` | object | 游戏初始状态（玩家角色、起始位置等） |

### Template 的定位

- Template 定义属性框架（resources、abilities、traits 栏等）
- 一个 Preset 只能引用一个 Template（不同 Template 属性结构不兼容）
- Template 本身也是一种 Set，存放在 `sets/templates/` 下
- 但不可叠加，只能选一个

## 5. 加载与合并机制

### 5.1 加载顺序

```
builtin → sets[0] → sets[1] → sets[2] → ...
```

同类目多个 Set 按 preset.json 中的数组顺序依次加载，后加载的同 ID 数据覆盖先加载的。

### 5.2 ID 冲突处理

**策略：后加载覆盖先加载**（与现有 builtin → game 逻辑一致）

- 两个 Set 定义了相同 `id` 的物品 → 后面的覆盖前面的
- Preset 中 sets 数组顺序即优先级顺序（靠后优先级高）
- 和现在的 builtin/game 二层合并逻辑一致，只是扩展为 N 层

示例：
```json
"traits": ["era-base-traits", "touhou-traits"]
```
如果两者都有 `id: "human"` 的特质，`touhou-traits` 的定义生效。

### 5.3 source 标记

合并后每条数据带 `source` 字段，标记来源：

- `"builtin"` — 来自 builtin
- `"set:touhou-traits"` — 来自哪个 Set

用于编辑器中显示来源、判断是否可修改等。

## 6. 跨类目依赖

角色引用了特质、服装等其他类目的 ID。如果对应的 Set 未启用：

- **不做硬依赖校验**
- 缺失的引用 gracefully degrade：显示 raw ID 而非 name，效果不生效
- `set.json` 的 `recommends` 字段提供提示，UI 可显示"推荐同时启用 xxx"
- 不阻止游戏运行

## 7. 导入/导出

### 7.1 导出

- 选择一个 Set → 打包为 zip 文件（包含 set.json + 数据文件 + assets）
- 前端提供"导出"按钮
- 文件命名：`{category}_{set-id}_v{version}.zip`

### 7.2 导入

- 上传 zip → 后端解压到 `sets/<category>/<set-id>/`
- 校验 set.json 存在且格式合法
- 如果同 ID Set 已存在，提示是否覆盖
- 导入后 UI 刷新可用 Set 列表

### 7.3 手动安装

用户也可以直接将 Set 目录拖入 `sets/<category>/` 下，重启或刷新后自动识别。

## 8. 编辑器适配

### 8.1 Set 管理器

新增全局 UI：
- 按类目列出所有已安装的 Set
- 显示来源（builtin / 用户导入 / 用户创建）
- 导入 / 导出 / 删除操作
- 新建空白 Set

### 8.2 Preset 编辑器

- 列出所有可用 Set，勾选启用/禁用
- 拖拽排序（决定加载优先级）
- 显示依赖推荐

### 8.3 各类目编辑器

现有编辑器（Trait Editor、Clothing Editor 等）改为：
- 编辑时需选择目标 Set（保存到哪个 Set）
- builtin 内容不可修改（和现在一样）
- 列表中显示每条数据来源于哪个 Set

## 9. 迁移路径

当前 `backend/data/games/era-touhou/` 的数据需要拆分：

```
games/era-touhou/
  character_template.json  →  sets/templates/era-touhou-template/
  traits.json              →  sets/traits/era-touhou-traits/
  clothing.json            →  sets/clothing/era-touhou-clothing/
  items.json               →  sets/items/era-touhou-items/
  characters/              →  sets/characters/era-touhou-chars/
  maps/                    →  sets/maps/era-touhou-maps/
  assets/                  →  各 Set 目录下的 assets/

+ 新建 presets/era-touhou/preset.json 引用以上 Set
```

可编写迁移脚本自动完成。

## 10. 实施顺序

```
前置：先完成 action 系统核心引擎（条件/效果/结果判定）
      因为 action 逻辑和数据组织方式无关

Phase 1: 目录结构迁移
  ├─ 创建 sets/ 和 presets/ 目录结构
  ├─ 迁移现有 era-touhou 数据到 sets + preset
  ├─ 重构 load_*_defs 函数为多 Set 合并加载
  └─ GameState.load() 改为读取 preset → 加载 sets

Phase 2: Set 管理 API
  ├─ GET /api/sets — 按类目列出所有已安装 Set
  ├─ POST /api/sets/import — 上传导入
  ├─ GET /api/sets/export/{category}/{setId} — 导出下载
  ├─ DELETE /api/sets/{category}/{setId}
  └─ Preset CRUD API

Phase 3: 前端 UI
  ├─ Set 管理器界面
  ├─ Preset 编辑器（勾选 Set + 排序）
  ├─ 各编辑器适配（显示来源、选择保存目标 Set）
  └─ 导入/导出交互
```

## 11. 开放问题

- **运行时修改的归属**：游戏运行中通过编辑器修改了一个特质，保存到哪个 Set？
  - 方案：修改 builtin/其他 Set 内容时，自动创建到用户的自定义 Set 中（类似 override 层）
  - 或者：只允许修改用户创建的 Set，其他 Set 只读
- **Preset 是否也可分享**：Preset 本身可以作为"配方"分享，但不包含实际数据，接收方需要自行安装依赖的 Set
- **版本兼容**：当 Set 更新后，Preset 引用的旧版本数据可能不兼容。是否需要版本锁定？
  - 初期不做版本管理，后续按需添加
