# AI Tavern Game - 项目总览

## 1. 项目愿景

AI Tavern Game 是一个高度可定制化的 AI 驱动角色扮演游戏，结合了：
- **ERA 风格文本 UI**：基于网格的地图、结构化状态显示、菜单驱动的交互，呈现文本艺术美学。
- **SillyTavern 风格 LLM 集成**：利用大语言模型生成丰富、动态的叙事文本、对话和事件描述。

目标是创建一个**游戏引擎**，内容创作者可以通过 Add-on 包定义自己的世界、角色和场景，而 LLM 提供叙事层。

## 2. 技术栈

| 层级 | 技术 | 职责 |
|------|------|------|
| 前端 | React (TypeScript) / Vite | UI 渲染、用户交互、编辑器 |
| 后端 | Python (FastAPI) / uvicorn | 游戏状态管理、游戏逻辑、API |
| 通信 | WebSocket + REST API | 实时状态同步 + 动作请求 |
| LLM | 可配置（OpenAI / Claude / 本地模型） | 叙事生成、对话、事件描述 |
| 数据 | JSON 文件 | Add-on 包（实体定义）+ World（配置+存档） |

**端口配置**（`config.json`）：
- 后端：18000
- 前端：15173
- `maxWidth`：中间区域最大宽度（默认 1200）
- `lastWorldId`：上次选中的世界

## 3. 架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                        前端 (React)                              │
│  ┌─────────┐ ┌────────────────────────────┐ ┌─────────────────┐ │
│  │  World   │ │       Center Area          │ │    Add-on       │ │
│  │ Sidebar  │ │  游戏视图 / 编辑器 / Addon  │ │   Sidebar       │ │
│  │  (左)    │ │      Editor                │ │    (右)         │ │
│  └─────────┘ └────────────────────────────┘ └─────────────────┘ │
│  ┌──────────────────── NavBar ────────────────────────────────┐  │
│  │ [W] | 人物 特质 服装 物品 行动 地图 设置 | 世界名 | [A]     │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌──────────── FloatingActions ──────────────────┐              │
│  │ [应用世界变更] [应用并保存世界变更]              │ (有变更时出现) │
│  └───────────────────────────────────────────────┘              │
└──────────────────────┬───────────────────────────────────────────┘
                       │ WebSocket / REST
┌──────────────────────▼───────────────────────────────────────────┐
│                      后端 (Python FastAPI)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │ GameState │ │ 角色系统  │ │ 地图引擎  │ │ 行动系统 (NPC AI)  │  │
│  │ (单例)    │ │          │ │          │ │                    │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘  │
│  ┌──────────┐ ┌──────────┐                                      │
│  │ Addon    │ │ 时间系统  │                                      │
│  │ Loader   │ │          │                                      │
│  └──────────┘ └──────────┘                                      │
└──────────────────────┬───────────────────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │    文件系统 (JSON)        │
          │  addons/ → 实体定义      │
          │  worlds/ → 配置+存档     │
          └─────────────────────────┘
```

## 4. 核心数据流：内存与磁盘的关系

这是整个系统最重要的概念。理解三层数据模型是理解所有操作的基础。

### 4.1 三层数据模型

```
┌─────────────────────────────────────────────────┐
│  编辑器层（前端 UI 状态）                          │
│  用户在编辑器中的输入、addon 开关的切换              │
│  ↓ CRUD API / 状态更新                            │
├─────────────────────────────────────────────────┤
│  游戏内存层（GameState 单例）                      │
│  所有实体定义 + 角色运行时状态 + 游戏时间            │
│  实体编辑在此层立即生效（定义已改），但角色未重建      │
│  ↓ rebuild() / save_to_write_target()            │
├─────────────────────────────────────────────────┤
│  磁盘层（JSON 文件）                               │
│  addons/<id>/<version>/*.json → 实体定义文件       │
│  worlds/<id>/world.json → 世界配置                │
│  worlds/<id>/save/ → 运行时存档（未实现）           │
└─────────────────────────────────────────────────┘
```

### 4.2 两个核心操作

#### [应用世界变更]（rebuild）
- **本质**：内存 → 内存
- **作用**：用当前内存中的定义重建角色和游戏状态
- **场景**：大量编辑后想测试效果
- **特点**：
  - 不写磁盘，dirty 保持 true
  - 如果 addon 开关有变更，先 flush 当前编辑到磁盘，再重载 addon 栈
  - 保留运行时状态（位置、资源、库存、时间）
  - 可以反复应用测试，不满意可继续编辑

#### [应用并保存世界变更]（save）
- **本质**：内存 → 内存 → 磁盘
- **作用**：先 rebuild，再写入磁盘
- **场景**：确认变更满意，持久化
- **特点**：
  - 实体文件写入 writeTarget addon
  - world.json 更新（addon 列表、writeTarget 等）
  - dirty 清除为 false
  - 悬浮面板消失

### 4.3 数据流详图

```
用户操作                    内存变化                    磁盘变化
─────────                  ─────────                  ─────────
编辑特质/物品/角色  ──→  trait_defs/item_defs 更新   (无，dirty=true)
                          定义已改，角色未重建

切换 addon 开关     ──→  stagedAddons 更新           (无，前端状态)
                          (纯 UI 状态)

[应用世界变更]      ──→  重建角色状态                 若 addon 变更:
                          ├ addon 未变: 直接重建         flush 编辑到磁盘
                          └ addon 已变: flush→重载→重建   再重载 addon 栈
                          dirty 保持 true              (world.json 不变)

[应用并保存]        ──→  重建角色状态                 写入实体文件
                          dirty = false                写入 world.json
```

### 4.4 dirty 标志

- 任何 CRUD 操作（创建/修改/删除实体）→ `dirty = true`
- `save_to_write_target()` → `dirty = false`
- 前端通过 WebSocket 实时接收 dirty 状态
- `dirty || hasAddonChanges` 时底部悬浮面板出现

## 5. 核心系统索引

| 系统 | 文档 | 说明 |
|------|------|------|
| Add-on 系统 | [addon-system.md](./addon-system.md) | Add-on 结构、依赖、覆盖、降级、导入导出 |
| 世界系统 | [world-system.md](./world-system.md) | 世界生命周期、专属 addon、备份回滚、API |
| 编辑器系统 | [editor-system.md](./editor-system.md) | 两种编辑模式、CRUD 流程、FloatingActions |
| 角色系统 | [character-system.md](./character-system.md) | 角色属性、模板、服装遮挡 |
| 行动系统 | [action-system.md](./action-system.md) | 条件、消耗、效果、结果分级 |
| 地图系统 | [map-system.md](./map-system.md) | 网格地图、方格、连接 |
| LLM 集成 | [llm-config.md](./llm-config.md) | LLM 提供商配置、提示词（未实现） |

## 6. 项目结构

```
root/
  config.json                          ← 端口配置、UI 设置
  start.bat / stop.bat                 ← 启动/停止脚本
  addons/                              ← 所有 Add-on（全局共享）
    base/1.0.0/                        ← 基础包
    era-touhou/1.0.0/                  ← 游戏内容包
    {worldId}-custom/1.0.0/            ← 世界专属 Add-on（自动创建）
  backend/
    main.py                            ← FastAPI 入口
    game/
      state.py                         ← GameState 单例
      character.py                     ← 角色系统
      map_engine.py                    ← 地图引擎
      action.py                        ← 行动系统 + NPC AI
      addon_loader.py                  ← Add-on 加载/管理
      time_system.py                   ← 游戏时间
    data/
      character_template.json          ← 全局角色模板
      worlds/                          ← 世界数据
        {world-id}/
          world.json                   ← 世界配置
          save/                        ← 运行时存档
          backups/                     ← 自动备份
  frontend/
    src/
      App.tsx                          ← 主组件
      api/client.ts                    ← API 客户端
      types/game.ts                    ← TypeScript 类型定义
      components/                      ← UI 组件
  docs/                                ← 本文档目录
```

## 7. 启动与运行

- `start.bat`：自动杀死占用端口的进程，启动后端和前端（无 reload 模式）
- `stop.bat`：按命令行匹配杀进程（不影响其他应用）
- 开发模式：`python main.py --reload`

启动行为：
1. 读取 `config.json` 中的 `lastWorldId`
2. 如果有上次的世界 → 加载它
3. 如果没有世界 → 自动创建 "default" 世界
4. 广播初始游戏状态

## 8. 编码约定

| 约定 | 说明 |
|------|------|
| Python | `from __future__ import annotations`，`Optional[T]` 而非 `T \| None` |
| 单例 | GameState 使用 `__new__` 实现单例模式 |
| 状态管理 | 所有游戏状态在后端，前端是纯渲染层 |
| WebSocket | 三种消息：`state_update`、`game_changed`、`dirty_update` |
| 文件格式 | 所有数据文件使用 JSON，UTF-8 编码 |
