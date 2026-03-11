# Add-on 系统

## 1. 概述

Add-on 系统将游戏内容组织为独立的扩展包（类似 Mod）。

> 世界如何组合 Add-on 见 [world-system.md](./world-system.md)
> 编辑器如何操作 Add-on 见 [editor-system.md](./editor-system.md)
> 变更如何从内存到磁盘见 [overview.md 第 4 节](./overview.md#4-核心数据流内存与磁盘的关系)

### 关键原则

**所有实体定义都存在于 Add-on 中**。世界目录（Overlay）不存储任何实体（角色、物品、特质、行动等），只存配置和存档。

### Add-on 的两种类型

| 类型 | 说明 | 例子 |
|------|------|------|
| **独立型** | 自包含，不依赖其他 Add-on | `era-touhou`（完整游戏内容包） |
| **补充型** | 依赖其他 Add-on，扩展/覆盖其内容 | `onsen-dlc`（依赖 `era-touhou`，添加温泉内容） |

## 2. Add-on 结构

### 2.1 版本化目录

同一 Add-on 的不同版本可共存，每个世界只能启用其中一个版本：

```
addons/
  base/
    1.0.0/
      addon.json
      traits.json
      clothing.json
      items.json
      actions.json

  era-touhou/
    1.0.0/
      addon.json
      traits.json
      clothing.json
      items.json
      actions.json
      map_collection.json
      maps/
        tavern1.json
      characters/
        sakuya.json
        player.json
      assets/
        characters/
          sakuya.png
        backgrounds/
          tavern-bg.png

  onsen-dlc/
    1.0.0/
      addon.json
      items.json
      actions.json
      maps/
        onsen.json
      map_collection.json
      assets/
        backgrounds/
          onsen-bg.png
```

### 2.2 addon.json

```json
{
  "id": "onsen-dlc",
  "name": "温泉DLC",
  "description": "添加温泉地图和相关行动",
  "author": "作者名",
  "version": "1.0.0",
  "cover": "cover.png",
  "categories": ["items", "actions", "maps"],
  "dependencies": [
    {"id": "era-touhou", "version": "1.0.0"}
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识，与一级目录名一致 |
| `name` | string | 是 | 显示名称 |
| `version` | string | 是 | 语义化版本号，与二级目录名一致 |
| `description` | string | 否 | 描述 |
| `author` | string | 否 | 作者 |
| `cover` | string | 否 | 封面图文件名，位于版本目录根 |
| `categories` | string[] | 否 | 包含哪些类目（展示用） |
| `dependencies` | `{id, version}[]` | 否 | 依赖的其他 Add-on 及版本（补充型必填） |

### 2.3 Add-on 内条目的三种性质

对于补充型 Add-on，其条目自动分为三种性质：

| 性质 | 自动判定方式 | 例子 |
|------|-------------|------|
| **独立条目** | ID 不存在于任何依赖 Add-on | 新物品 "温泉毛巾" |
| **依赖条目** | 新 ID，但引用了依赖 Add-on 的实体 | 新行动 "对咲夜使用毛巾"（引用 era-touhou 的角色） |
| **覆盖条目** | 同 ID 已存在于依赖 Add-on 中 | 修改 era-touhou 的某个 action（加了 tag） |

覆盖条目通过加载顺序实现：补充型 Add-on 在依赖之后加载，同 ID 后者覆盖前者。

### 2.4 Base Add-on（基础包）

原 `backend/data/builtin/` 的内容迁移为 `base` Add-on：

- 随系统分发，默认启用
- 用户可以禁用或修改（后果自负）
- 与其他 Add-on 完全等价，没有特殊加载逻辑

## 3. 依赖系统

### 3.1 依赖声明

```json
// addon.json
{
  "dependencies": [
    {"id": "era-touhou", "version": "1.0.0"},
    {"id": "base", "version": "1.0.0"}
  ]
}
```

- 启用 Add-on 时校验依赖是否满足，缺失时提示用户
- 不做硬阻断：缺失依赖时警告但允许继续（graceful degradation）
- 缺失引用表现为：显示 raw ID 而非 name，相关效果不生效

### 3.2 加载顺序与覆盖

依赖关系影响加载顺序：被依赖的 Add-on 先加载，补充型后加载。

```
base → era-touhou → onsen-dlc(补充era-touhou)
```

同 ID 实体，后加载覆盖先加载。这使得补充型 Add-on 可以：
- 覆盖依赖 Add-on 的条目（修改现有行动、给角色加 tag 等）
- 添加新条目（新地图、新物品等）
- 引用依赖 Add-on 的实体（跨 Add-on 引用）

### 3.3 覆盖条目示例

`era-touhou` 定义了 action "休息"（无 tag）：
```json
// era-touhou/actions.json
{"id": "rest", "name": "休息", "tags": []}
```

`onsen-dlc` 覆盖它（加 tag），同时添加新行动：
```json
// onsen-dlc/actions.json
{"id": "rest", "name": "休息", "tags": ["recoverable"]},
{"id": "bathe", "name": "入浴", "conditions": [{"type": "hasTag", "tag": "recoverable"}]}
```

加载后：`rest` 有 tag `recoverable`，`bathe` 的条件满足。
脱离 `onsen-dlc`：`rest` 恢复原样，`bathe` 不存在。

### 3.4 定义消失时的降级行为

当 Add-on 被禁用导致定义消失时，运行时状态中的引用**保留不动**，在显示层和逻辑层做降级：

| 场景 | 行为 | 恢复启用后 |
|------|------|-----------|
| 背包中物品定义消失 | 物品隐藏不显示，按 ID 的条件检查仍通过 | 恢复显示 |
| 角色特质定义消失 | 特质隐藏不显示，特质相关效果不生效 | 恢复显示和效果 |
| 好感度目标角色消失 | 好感度条目隐藏 | 恢复显示 |
| 行动定义消失 | 行动不出现在可用列表中 | 恢复可用 |
| 地图消失 | 位置传送效果跳过，NPC 寻路放弃该目标 | 恢复正常 |
| 能力/经验来源特质消失 | 该能力不显示，权重修正视为 0 | 恢复 |
| 物品 tag 来源定义消失 | 按 tag 的条件检查不通过 | 恢复 |

**核心原则**：运行时状态层从不删东西。显示层和逻辑层对缺失定义做降级。重新启用 Add-on 后一切自动恢复。

## 4. ID 命名空间 ✅

### 4.1 适用范围

命名空间仅适用于**实体类 ID**：

| 加命名空间 | 不加命名空间 |
|-----------|-------------|
| 角色 ID | 资源 key（stamina, energy） |
| 特质 ID | 能力 key（technique, charm） |
| 服装 ID | 特质分类 key（race, bodyTrait） |
| 物品 ID | 服装槽位 key（top, bottom） |
| 地图 ID | basicInfo key（name, money） |
| 行动 ID | |

Template 定义的 schema key 是全局共享的，不加命名空间。

### 4.2 存储与运行时

分隔符：`.`（点号）。

**文件中存储短 ID**（不含 Add-on 前缀）：

```json
// onsen-dlc/1.0.0/items.json
[{"id": "towel", "name": "温泉毛巾"}]
```

```json
// onsen-dlc/1.0.0/actions.json
[{
  "id": "bathe",
  "costs": [{"type": "item", "itemId": "towel"}],
  "conditions": [{"type": "npcPresent", "npcId": "era-touhou.sakuya"}]
}]
```

- `"towel"` — 本 Add-on 内引用，短 ID
- `"era-touhou.sakuya"` — 跨 Add-on 引用，完整 ID

**加载时自动补全**：ID 中含 `.` 视为完整 ID，不含 `.` 自动补全为 `addonId.localId`。

符号引用不做命名空间处理：`self`、`{{targetId}}`、`{{player}}`、空字符串。

### 4.3 编辑器中的显示

- 本 Add-on 内引用：显示短 ID
- 跨 Add-on 引用：显示完整 ID（`era-touhou.sakuya`）
- 引用选择器：本 Add-on 条目显示短 ID，其他 Add-on 条目显示 `[addonName] localId`

## 5. 导入/导出（未实现）

### 5.1 导出格式

两种导出物：

| 类型 | 扩展名 | 内容 | 用途 |
|------|--------|------|------|
| **Add-on 包** | `.addon` (zip) | 单个 Add-on 的版本目录 | 功能扩展，可复用于多个世界 |
| **World 包** | `.world` (zip) | 所有引用 Add-on 快照 + Overlay | 完整可游玩的整合包 |

**Add-on 包结构**（`.addon`）：

```
onsen-dlc-1.0.0.addon
  ├── addon.json
  ├── items.json
  ├── actions.json
  ├── map_collection.json
  ├── maps/
  └── assets/
```

**World 包结构**（`.world`）：

```
my-touhou-game.world
  ├── world.json                       ← 配置+存档
  ├── save/                            ← 运行时存档
  └── addons/                          ← 引用的 Add-on 快照
      ├── base/
      │   └── 1.0.0-my-touhou-game/    ← 版本分支
      └── era-touhou/
          └── 1.0.0-my-touhou-game/    ← 版本分支
```

World 包是**快照**——包含导出时刻的所有 Add-on 版本分支，导入即可游玩。

### 5.2 导入流程

**导入 Add-on（`.addon`）**：
1. 解析 addon.json，读取 id 和 version
2. 检查 `addons/{id}/{version}/` 是否已存在 → 提示覆盖或取消
3. 解压到 `addons/{id}/{version}/`
4. 提示用户是否在当前世界中启用

**导入 World（`.world`）**：
1. 解析 world.json
2. 逐个检查 addons/ 中的 Add-on：
   - 本地已有相同 id+version → 跳过
   - 本地已有相同 id 但不同 version → 安装为新版本（共存）
   - 本地没有 → 安装
3. 解压 save/ 到 `worlds/{worldId}/save/`
4. 写入 world.json

### 5.3 版本冲突处理

同一 Add-on 的不同版本可以共存安装（目录结构天然支持）。一个世界只能启用某 Add-on 的一个版本。

导入 World 包时，如果本地已有 `base@1.0.0` 但 World 包里是 `base@1.1.0`：
- 安装 `base@1.1.0`（两个版本共存）
- 该世界使用 `base@1.1.0`（按 world.json 配置）
- 其他世界仍使用 `base@1.0.0`（不受影响）

### 5.4 PNG 封装（后续实现）

将 `.addon` 或 `.world` 数据嵌入 PNG 图片中，方便在社交平台分享。优先实现 zip 格式。

### 5.5 手动安装

用户可直接将 Add-on 目录放入 `addons/{id}/{version}/`，刷新后自动识别。
