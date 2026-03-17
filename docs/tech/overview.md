# 技术架构总览

## Tech Stack

| Layer | Technology | Entry Point |
|-------|-----------|-------------|
| Backend | Python 3.x / FastAPI / uvicorn | `backend/main.py` |
| Frontend | React 18 + TypeScript / Vite | `frontend/src/App.tsx` |
| Communication | REST API + SSE | Port defined in `config.json` |
| Data | JSON files (no database) | `addons/`, `worlds/` |

## 目录结构

```
tavernGame/
├── config.json                    启动配置 (ports, maxWidth, lastWorldId, defaultLlmPreset)
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
│   ├── world.json                   id, name, description, cover, addons, playerCharacter, llmPreset
│   └── about/covers/                封面图片
│
├── user/                          用户私有数据（.gitignore）
│   ├── saves/{worldId}/{slot}.json  存档文件
│   ├── llm-providers/{id}.json      API 服务配置（URL、Key、模型）
│   └── llm-presets/{presetId}/      LLM 预设（引用 provider + 提示词条目）
│       └── preset.json
│
├── backend/
│   ├── main.py                      FastAPI app, all REST/SSE endpoints
│   ├── game/
│   │   ├── state.py                   GameState singleton, load/rebuild/save/persist
│   │   ├── addon_loader.py            目录常量, addon/world CRUD, fork/copy
│   │   ├── character.py               角色加载, namespace, trait/ability/clothing logic
│   │   ├── action.py                  行动执行, 条件求值, NPC 决策
│   │   ├── llm_preset.py              LLM 预设文件 CRUD
│   │   ├── llm_provider.py            LLM API 服务文件 CRUD
│   │   ├── llm_engine.py              LLM 变量收集, 提示词组装, API 调用
│   │   ├── map_engine.py              地图加载, grid 编译, distance/sense matrix
│   │   ├── time_system.py             游戏时间 (GameTime), 天气, 季节
│   │   ├── variable_engine.py         衍生变量求值, 循环检测, 调试追踪
│   │   └── save_manager.py            存档 CRUD
│   └── data/
│       └── character_template.json    全局角色模板
│
├── frontend/src/
│   ├── App.tsx                      主布局, 全局状态管理
│   ├── api/client.ts                REST API 客户端 (所有 fetch 函数)
│   ├── types/game.ts                TypeScript 类型定义
│   ├── theme.ts                     主题色彩常量 (T.bg0, T.accent, etc.)
│   └── components/                  30 个组件
│       ├── 布局: NavBar, WorldSidebar, AddonSidebar, FloatingActions, AddonTabBar
│       ├── 编辑器: CharacterEditor, MapEditor, ActionEditor, TraitEditor,
│       │          TraitGroupEditor, ItemEditor, ClothingEditor, VariableEditor
│       ├── 管理器: ActionManager, CharacterManager, ClothingManager, EventManager,
│       │          ItemManager, MapManager, TraitManager, VariableManager
│       ├── 游戏UI: CharacterPanel, CompactCharacterInfo, ActionMenu,
│       │          MapView, LocationHeader, NarrativePanel
│       ├── LLM: LLMPresetManager, LLMDebugPanel
│       ├── 通用: ColorPicker, HelpToggle
│       ├── 世界设置: SettingsPage
│       └── 导航: 左侧世界级tabs ‖ 右侧全局级tabs（LLM设置, 系统设置）
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
                               │ API/SSE           │ API
                    ┌──────────▼───────────────────┤───────────┐
                    │       Frontend (React)                   │
                    │  gameState, editors, sidebars            │
                    └──────────────────────────────────────────┘
```

### 加载流程 (`state.py: load_world`)

1. 读取 `worlds/{worldId}/world.json` 获取 `addon_refs`
2. `build_addon_dirs(addon_refs)` → 构建 `[(addon_id, Path)]` 列表
3. 按顺序加载所有实体：maps → template → clothing → items → item_tags → traits → actions → trait_groups → variables → variable_tags → events → world_variables → characters（最后，依赖其他 defs）
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

共 86 个端点，按模块分类：

| 模块 | 端点前缀 | 说明 | 详见 |
|------|---------|------|------|
| 世界/会话 | `/api/worlds`, `/api/session` | 世界 CRUD、切换、保存 | world.md |
| 扩展包 | `/api/addon`, `/api/addons` | addon CRUD、fork、版本管理 | addon.md |
| 游戏状态 | `/api/game/state`, `/api/game/action` | 状态获取、行动执行 | action.md |
| 角色 | `/api/game/characters` | 角色配置 CRUD | character.md |
| 特质/变量 | `/api/game/traits`, `/api/game/variables` | 特质/组/变量 CRUD + 求值 | trait.md |
| 物品/服装 | `/api/game/items`, `/api/game/clothing` | 物品/服装 CRUD + 标签 | item.md |
| 行动/事件 | `/api/game/actions`, `/api/game/events` | 行动/事件 CRUD | action.md |
| 地图 | `/api/game/maps` | 地图 CRUD + 装饰预设 | map.md |
| 世界变量 | `/api/game/world-variables` | 世界变量 CRUD | — |
| 存档 | `/api/saves` | 存档 CRUD + 加载 | — |
| LLM | `/api/llm` | API 服务 CRUD、预设 CRUD、模型获取、连接测试、生成 | llm.md |
| 资产 | `/api/assets`, `/assets` | 上传 + 静态 serve | — |

### SSE (`main.py: GET /api/events`)

服务器主动推送，前端通过 `client.ts` 的 `connectSSE()` 使用 `EventSource` 连接接收：

| 事件类型 | 触发场景 | 携带数据 |
|---------|---------|---------|
| `state_update` | 实体 CRUD（行动执行、地图保存等） | 全量游戏状态 |
| `game_changed` | 世界切换/重启/加载存档/保存变更 | 全量游戏状态 |
| `dirty_update` | 任何编辑操作 | `{ dirty: true }` |

- 连接建立时立即发送一次 `state_update` 作为初始状态
- `state_update` 与 `game_changed` 携带相同数据（全量状态），区别在语义——前端据此决定是否重置 UI 状态
- 行动结果（output 文本、NPC 日志）通过 REST API `POST /api/game/action` 的响应返回，不走 SSE
- LLM 生成通过独立 SSE 流 `POST /api/llm/generate` 返回（`llm_chunk` / `llm_done` / `llm_error`）
- 30 秒无事件时发送 keepalive 注释防止连接超时
- `EventSource` 自动重连，无需手动处理

### 前后端职责分工

**后端**（游戏逻辑 + 数据持久化）：
- 行动执行（条件检查、费用扣除、效果应用、输出渲染）
- NPC 决策（per-tick 模拟）
- 时间推进、能力衰减、全局事件评估
- 角色状态编译（`build_character_state()`：原始数据 → 运行时状态）
- 地图寻路（distance_matrix / sense_matrix）
- 命名空间处理、数据读写

**前端**（UI 展示 + 编辑器）：
- 从后端推送的全量状态渲染 UI（角色面板、地图视图、行动列表）
- 各实体编辑器（编辑后调 REST API 提交）
- 行动交互（选行动/目标 → 调 API → 展示结果文本）
- dirty 状态管理（显示/隐藏保存悬浮面板）

**关键原则**：前端不做游戏逻辑计算；每次变更后后端推送完整状态，前端整体替换。

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
| 字段 | 类型 | 说明 |
|------|------|------|
| **世界与配置** | | |
| `world_id` | `str` | 当前世界 ID |
| `world_name` | `str` | 当前世界名称 |
| `addon_refs` | `list[dict]` | 当前启用的 addon 引用 `[{id, version}]` |
| `addon_dirs` | `list[tuple[str, Path]]` | 加载的 addon 目录 `[(addon_id, path)]` |
| `template` | `dict` | 角色模板（basicInfo/resources/traits/inventory 定义） |
| `player_character` | `str` | 玩家角色 ID |
| `dirty` | `bool` | 是否有未保存修改 |
| **实体定义** | | |
| `maps` | `dict[str, dict]` | 地图数据（已编译 grid） |
| `characters` / `character_data` | `dict` | 角色运行时状态 / 原始数据 |
| `trait_defs` | `dict[str, dict]` | 特质定义 |
| `trait_groups` | `dict[str, dict]` | 特质组 |
| `clothing_defs` | `dict[str, dict]` | 服装定义 |
| `item_defs` | `dict[str, dict]` | 物品定义 |
| `action_defs` | `dict[str, dict]` | 行动定义 |
| `variable_defs` | `dict[str, dict]` | 衍生变量 |
| `event_defs` | `dict[str, dict]` | 全局事件 |
| `world_variable_defs` | `dict[str, dict]` | 世界变量定义 |
| `decor_presets` | `list[dict]` | 地图装饰预设 |
| **标签** | | |
| `item_tags` | `list[str]` | 物品标签列表 |
| `variable_tags` | `list[str]` | 变量标签列表 |
| **运行时状态** | | |
| `time` | `GameTime` | 游戏内时间 |
| `world_variables` | `dict[str, Any]` | 世界变量当前值 |
| `event_state` | `dict` | 全局事件触发状态 |
| `npc_goals` | `dict[str, dict]` | NPC 当前目标（移动/执行中的行动） |
| `npc_activities` | `dict[str, str]` | NPC 当前活动描述 |
| `npc_full_log` | `list[dict]` | NPC 行动完整日志（LLM 用，60 天缓存） |
| `npc_action_history` | `dict[str, list[dict]]` | NPC 行动历史（suggestNext 用） |
| `decay_accumulators` | `dict[str, dict[str, int]]` | 能力衰减累积时间 |
| `action_log` | `list[dict]` | 玩家行动日志 |
| **预计算索引** | | |
| `distance_matrix` | `dict` | 地图距离矩阵（Dijkstra） |
| `sense_matrix` | `dict` | 地图感知矩阵（跳过 senseBlocked） |
| `cell_action_index` | `dict` | cell → 可用行动索引（NPC 决策用） |
| `no_location_actions` | `list[dict]` | 无位置要求的行动列表 |

## 启动流程

1. `main.py` 读取 `config.json` 获取端口和 `lastWorldId`
2. `lifespan` 上下文管理器触发 `game_state.load_world(lastWorldId)`
3. 如果世界不存在，自动创建 `default` 世界
4. 加载完成后前端连接 SSE (`/api/events`)，获取初始状态
