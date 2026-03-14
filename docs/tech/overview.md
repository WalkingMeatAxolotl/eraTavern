# 技术架构总览

## Tech Stack

| Layer | Technology | Entry Point |
|-------|-----------|-------------|
| Backend | Python 3.x / FastAPI / uvicorn | `backend/main.py` |
| Frontend | React 18 + TypeScript / Vite | `frontend/src/App.tsx` |
| Communication | REST API + WebSocket | Port defined in `config.json` |
| Data | JSON files (no database) | `addons/`, `worlds/` |

## 目录结构

```
tavernGame/
├── config.json                    启动配置 (ports, maxWidth, lastWorldId)
├── CLAUDE.md                      AI 协作指令
│
├── addons/{addonId}/              扩展包（所有游戏实体的来源）
│   ├── about/                       共享元数据
│   │   ├── meta.json                  name, description, author, cover, categories
│   │   └── covers/                    封面图片
│   ├── assets/                      共享资产（跨版本复用）
│   │   ├── characters/                角色立绘
│   │   └── backgrounds/               地图背景
│   ├── {version}/                   版本目录
│   │   ├── addon.json                 id, version, dependencies, _forkedFrom, _worldId
│   │   ├── traits.json                特质定义
│   │   ├── clothing.json              服装定义
│   │   ├── items.json                 物品定义
│   │   ├── actions.json               行动定义
│   │   ├── variables.json             衍生变量定义
│   │   ├── decor_presets.json         装饰预设
│   │   ├── map_collection.json        地图合集索引
│   │   ├── maps/{mapId}.json          地图数据
│   │   └── characters/{charId}.json   角色数据
│   └── {version}-{worldId}/         世界专属分支（fork）
│
├── worlds/{worldId}/              世界（配置 + 存档）
│   ├── world.json                   id, name, description, cover, addons, playerCharacter
│   ├── about/covers/                封面图片
│   └── saves/{slotId}.json          存档文件
│
├── backend/
│   ├── main.py                      FastAPI app, all REST/WS endpoints
│   ├── game/
│   │   ├── state.py                   GameState singleton, load/rebuild/save/persist
│   │   ├── addon_loader.py            目录常量, addon/world CRUD, fork/copy
│   │   ├── character.py               角色加载, namespace, trait/ability/clothing logic
│   │   ├── action.py                  行动执行, 条件求值, NPC 决策
│   │   ├── map_engine.py              地图加载, grid 编译, distance/sense matrix
│   │   └── save_manager.py            存档 CRUD
│   └── data/
│       └── character_template.json    全局角色模板
│
├── frontend/src/
│   ├── App.tsx                      主布局, 全局状态管理
│   ├── api/client.ts                REST API 客户端 (所有 fetch 函数)
│   ├── types/game.ts                TypeScript 类型定义
│   ├── theme.ts                     主题色彩常量 (T.bg0, T.accent, etc.)
│   └── components/
│       ├── NavBar.tsx                 顶部导航
│       ├── WorldSidebar.tsx           左侧世界管理
│       ├── AddonSidebar.tsx           右侧扩展管理
│       ├── FloatingActions.tsx        底部浮动操作栏
│       ├── CharacterEditor.tsx        角色编辑器
│       ├── MapEditor.tsx              地图编辑器
│       ├── ActionEditor.tsx           行动编辑器
│       ├── TraitEditor.tsx            特质编辑器
│       ├── TraitGroupEditor.tsx       特质组编辑器
│       ├── ItemEditor.tsx             物品编辑器
│       ├── ClothingEditor.tsx         服装编辑器
│       ├── VariableEditor.tsx         衍生变量编辑器
│       ├── EventEditor.tsx            事件编辑器
│       └── SettingsPage.tsx           设置页（含存档管理）
│
├── docs/                           文档
│   ├── user/                         用户文档
│   └── tech/                         技术文档
│
└── plan/                           开发计划（gitignore, 仅本地）
```

## 数据流

### 核心流程：加载 → 编辑 → 保存

```
                    ┌──────────────────────────────────────────┐
                    │            Disk (JSON files)             │
                    │  addons/{id}/{ver}/*.json                │
                    │  worlds/{id}/world.json                  │
                    └──────────┬───────────────────▲───────────┘
                               │ load              │ persist
                    ┌──────────▼───────────────────┤───────────┐
                    │       GameState (memory)                 │
                    │  addon_dirs, maps, characters,           │
                    │  trait_defs, action_defs, ...             │
                    │  dirty flag                               │
                    └──────────┬───────────────────▲───────────┘
                               │ API/WS            │ API
                    ┌──────────▼───────────────────┤───────────┐
                    │       Frontend (React)                   │
                    │  gameState, editors, sidebars            │
                    └──────────────────────────────────────────┘
```

### 加载流程 (`state.py: load_world`)

1. 读取 `worlds/{worldId}/world.json` 获取 `addon_refs`
2. `build_addon_dirs(addon_refs)` → 构建 `[(addon_id, Path)]` 列表
3. 按顺序加载所有实体：maps, characters, traits, clothing, items, actions, variables, events, world_variables
4. 每个加载函数遍历 addon_dirs，后加载的覆盖先加载的（load order）
5. `_resolve_namespaces()`: 给所有 ID 加上 `addonId.` 前缀
6. `_rebuild_characters(snapshot)`: 从定义重建角色运行时状态
7. `build_cell_action_index()`: 构建 cell → action 索引
8. `build_distance_matrix()` / `build_sense_matrix()`: 构建地图距离/感知矩阵

### 编辑流程

- 前端通过 REST API 修改 GameState 中的内存数据
- 修改后 `dirty = True`
- 数据暂存在内存，不自动写入磁盘

### 保存流程 (`state.py: save_all`)

1. `rebuild(new_addon_refs)`: 如果 addon 列表变更，先 flush 后 reload
2. `_persist_entity_files()`: 按 `source` 字段分组，写回各 addon 版本目录
3. `_update_addon_dependencies()`: 扫描跨 addon 引用，更新 `addon.json` 的 `dependencies`
4. 更新 `world.json`（addon_refs, playerCharacter）
5. `dirty = False`

### 关键原则
- **All entity definitions live in Addons** — 世界目录只存配置和存档
- **编辑不自动保存** — 用户点 [保存变更] 才写入磁盘
- **ID 加载时加命名空间，保存时去掉** — 磁盘文件存裸 ID

## ID 命名空间系统

### 格式

```
{addonId}.{localId}
```

- 分隔符: `NS_SEP = "."` (`character.py`)
- 例: addon `base` 中定义的特质 `human` → 运行时 ID 为 `base.human`

### 转换函数 (`character.py`)

| 函数 | 用途 |
|------|------|
| `namespace_id(addon_id, local_id)` | `("base", "human")` → `"base.human"` |
| `to_local_id(namespaced_id)` | `"base.human"` → `"human"` |
| `get_addon_from_id(namespaced_id)` | `"base.human"` → `"base"` |
| `resolve_ref(ref, current_addon)` | 解析引用，处理符号引用 |

### 特殊引用 (SYMBOLIC_REFS)

以下值永远不加命名空间：
- `"self"` — 动作执行者自身
- `"{{targetId}}"` — 动作目标
- `"{{player}}"` — 玩家角色
- `""` — 空值

### FastAPI 路由

由于 ID 包含 `.`，路由参数使用 `:path` converter：
```python
@app.get("/api/character/{char_id:path}")
```

## 通信方式

### REST API (`main.py`)

所有数据读写通过 REST：
- `GET /api/game/state` — 获取完整游戏状态
- `GET /api/addons` — 获取所有已安装扩展
- `GET /api/worlds` — 获取所有世界列表
- `POST /api/worlds` — 创建世界
- `POST /api/session/save` — 保存变更（触发 save_all）
- `PUT /api/addon/{id}/{ver}/meta` — 更新扩展元数据
- `POST /api/assets/upload` — 上传资产文件
- `GET /assets/{path}` — 静态资产 serve
- 各实体的 CRUD 端点...

### WebSocket (`main.py: /ws`)

实时推送游戏事件：
- 行动执行结果 (`action_result`)
- NPC 行动日志 (`npc_log`)
- 状态变更通知 (`state_update`)
- 时间推进 (`time_advance`)

前端通过 `client.ts` 的 WebSocket 连接接收推送，更新 UI。

### 资产 Serve 路由 (`GET /assets/{path}`)

```
/assets/{addonId}/{subfolder}/{file}      → addons/{addonId}/about/{subfolder}/{file}
                                          → addons/{addonId}/assets/{subfolder}/{file}
/assets/world/{worldId}/{subfolder}/{file} → worlds/{worldId}/about/{subfolder}/{file}
                                           → worlds/{worldId}/assets/{subfolder}/{file}
/assets/{legacy-path}                      → 遍历 addon_dirs 中各版本的 assets/
                                           → 遍历 addon root 的 assets/
```

## Addon 版本系统

### 版本类型

| 类型 | 格式 | 说明 |
|------|------|------|
| 本体 (base) | `1.0.0` | 原始版本，可被多个世界共享 |
| 分支 (fork) | `1.0.0-{worldId}` | 世界专属副本，修改不影响其他世界 |

### 共享 vs 版本特定

| 存储位置 | 内容 | 共享范围 |
|----------|------|----------|
| `about/meta.json` | name, description, author, cover, categories | 所有版本 |
| `about/covers/` | 封面图片 | 所有版本 |
| `assets/characters/` | 角色立绘 | 所有版本 |
| `assets/backgrounds/` | 地图背景 | 所有版本 |
| `{version}/addon.json` | id, version, dependencies, _forkedFrom | 单个版本 |
| `{version}/*.json` | 实体定义文件 | 单个版本 |

### Fork 流程 (`addon_loader.py: fork_addon_version`)

1. `shutil.copytree(src_version_dir, dst_version_dir)`
2. 更新 fork 的 `addon.json`: version, _forkedFrom, _worldId
3. 返回 fork 版本字符串

### 版本目录识别 (`_is_version_dir`)

只有包含 `addon.json` 的子目录才被识别为版本目录。`about/` 和 `assets/` 被自动过滤。

## GameState 核心字段 (`state.py`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `world_id` | `str` | 当前世界 ID |
| `addon_refs` | `list[dict]` | 当前启用的 addon 引用 `[{id, version}]` |
| `addon_dirs` | `list[tuple[str, Path]]` | 加载的 addon 目录 `[(addon_id, path)]` |
| `maps` | `dict[str, dict]` | 地图数据（已编译 grid） |
| `characters` / `character_data` | `dict` | 角色运行时状态 / 原始数据 |
| `trait_defs` | `dict[str, dict]` | 特质定义 |
| `clothing_defs` | `dict[str, dict]` | 服装定义 |
| `item_defs` | `dict[str, dict]` | 物品定义 |
| `action_defs` | `dict[str, dict]` | 行动定义 |
| `trait_groups` | `dict[str, dict]` | 特质组 |
| `variable_defs` | `dict[str, dict]` | 衍生变量 |
| `event_defs` | `dict[str, dict]` | 全局事件 |
| `world_variable_defs` | `dict[str, dict]` | 世界变量定义 |
| `distance_matrix` | `dict` | 地图距离矩阵 |
| `sense_matrix` | `dict` | 地图感知矩阵 |
| `cell_action_index` | `dict` | cell → 可用行动索引 |
| `dirty` | `bool` | 是否有未保存修改 |
| `game_time` | `dict` | 游戏内时间 |
| `npc_goals` | `dict` | NPC 当前目标 |

## 启动流程

1. `main.py` 读取 `config.json` 获取端口和 `lastWorldId`
2. `@app.on_event("startup")` 触发 `game_state.load_world(lastWorldId)`
3. 如果世界不存在，自动创建 `default` 世界
4. 加载完成后前端连接 WebSocket，获取初始状态
