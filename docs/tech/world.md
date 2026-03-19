# World System - Technical Documentation

## Directory Structure

```
worlds/
  {worldId}/
    world.json          # 世界配置文件（唯一必须文件）

backend/data/saves/
  {worldId}/
    {slotId}.json       # 存档文件（独立于 worlds 目录）
```

世界目录位于项目根目录的 `worlds/` 下，由 `addon_loader.py` 中的常量 `WORLDS_DIR` 定义：

```python
_BACKEND_DIR = Path(__file__).resolve().parent.parent
WORLDS_DIR = _BACKEND_DIR.parent / "worlds"
```

封面图片通过 asset 上传接口存储，路径由前端通过 `/assets/world/{worldId}/covers/{filename}` 访问。

---

## world.json Schema

```jsonc
{
  "id": "my-world",              // string, 唯一标识符 (英文数字、-、_)
  "name": "我的世界",             // string, 显示名称
  "description": "...",           // string, optional, 简介
  "cover": "cover.png",           // string, optional, 封面文件名
  "addons": [                     // array, 启用的扩展列表（按加载顺序）
    { "id": "base", "version": "1.0.1" },
    { "id": "base", "version": "1.0.1-my-world" }  // fork 版本示例
  ],
  "playerCharacter": "alice"      // string, 玩家角色的 local ID（不含命名空间前缀）
}
```

**注意**：`playerCharacter` 在文件中存储为 bare local ID，加载到内存后会经过 `resolve_ref()` 转为带命名空间的完整 ID（如 `base.alice`）。保存时通过 `to_local_id()` 还原。

---

## API Endpoints

### GET /api/worlds

列出所有已创建的世界。

**Response:**
```json
{
  "worlds": [
    {
      "id": "my-world",
      "name": "我的世界",
      "description": "...",
      "cover": "cover.png",
      "addons": [{ "id": "base", "version": "1.0.1" }],
      "playerCharacter": "alice"
    }
  ]
}
```

实现：`list_available_worlds()` in `state.py` -> `_list_worlds()` in `addon_loader.py`，遍历 `WORLDS_DIR` 下所有含 `world.json` 的子目录。

---

### POST /api/worlds

创建新世界。

**Request:**
```json
{ "id": "new-world", "name": "新世界", "addons": [] }
```

**Response:**
```json
{ "success": true, "message": "World '新世界' created" }
```

实现：检查 `WORLDS_DIR/{id}` 不存在后，调用 `save_world_config()` 写入 `world.json`。默认 `playerCharacter` 为空字符串。创建后不自动加载——前端在 `handleCreated` 回调中接着调用 `selectWorld`。

---

### POST /api/worlds/select

切换到指定世界。

**Request:**
```json
{ "worldId": "my-world" }
```

**Response:**
```json
{ "success": true, "message": "Switched to 我的世界" }
```

实现流程：
1. 验证 worldId 存在于已知世界列表
2. 调用 `game_state.load_world(worldId)`（详见下方 load_world 流程）
3. `_save_last_world(worldId)` 将 ID 写入 `config.json` 的 `lastWorldId`
4. 通过 WebSocket broadcast `game_changed` 事件推送完整状态

---

### POST /api/worlds/unload

卸载当前世界，进入空状态。

**Response:**
```json
{ "success": true }
```

实现：调用 `game_state.load_empty()` 清空所有内存数据，`_save_last_world("")` 清除 lastWorldId。

---

### PUT /api/worlds/{world_id}

用当前 session 的 addon_refs 更新世界配置。

**Response:**
```json
{ "success": true, "message": "World 'my-world' updated" }
```

实现：读取现有 `world.json`，替换 `addons` 字段为 `game_state.addon_refs`，写回。

---

### PUT /api/worlds/{world_id}/meta

更新世界元数据（name, description, cover）。

**Request:**
```json
{ "name": "新名称", "description": "新简介", "cover": "new-cover.png" }
```

所有字段均为 optional，只更新传入的字段。如果修改的是当前活动世界，同步更新内存中的 `game_state.world_name`。

---

### DELETE /api/worlds/{world_id}

删除世界目录（`shutil.rmtree`）。

**Response:**
```json
{ "success": true, "message": "World 'my-world' deleted" }
```

**注意**：此操作仅删除 `worlds/{worldId}/` 目录。扩展的 fork 版本（`addons/{addonId}/{version}-{worldId}/`）不会被清理。存档目录 `backend/data/saves/{worldId}/` 也不会被自动删除。

---

## load_world Flow (state.py)

`GameState.load_world(world_id)` 是世界加载的核心方法，执行以下步骤：

```
1. load_world_config(world_id)  →  读取 world.json
2. 设置 self.world_id, world_name, addon_refs, player_character
3. build_addon_dirs(addon_refs)  →  构建 (addon_id, Path) 有序列表
4. load_map_collection(addon_dirs)  →  加载所有地图
5. build_distance_matrix / build_sense_matrix  →  NPC 寻路矩阵
6. load_decor_presets  →  装饰预设
7. 加载角色系统：
   - template, clothing_defs, item_defs, item_tags
   - trait_defs, action_defs, trait_groups
   - variable_defs, variable_tags, event_defs
   - world_variable_defs, character_data
8. _resolve_namespaces()  →  为所有实体添加 addonId.localId 命名空间
9. resolve_ref(player_character)  →  将 bare playerCharacter 转为带命名空间 ID
10. build_character_state() for each character  →  构建运行时角色状态
11. build_cell_action_index()  →  构建 cell->action 倒排索引
12. 重置 time, NPC state, action_log, event_state
13. _init_world_variables()  →  初始化世界变量
14. self.dirty = False
```

**没有自动 fork**：`load_world` 不会自动创建扩展分支。Fork 操作通过 `POST /api/addon/{id}/fork` 由用户显式触发。

---

## save_all Flow

`GameState.save_all(new_addon_refs=None)` 是完整保存操作：

```
1. self.rebuild(new_addon_refs)  →  如有新 addon_refs 则重新加载
2. self._persist_entity_files()  →  按 source 字段分组，写回各扩展目录
3. self._update_addon_dependencies()  →  更新扩展间依赖
4. 读取 world.json，更新 addons 和 playerCharacter 字段，写回
5. self.dirty = False
```

`_persist_entity_files()` 遍历所有实体的 `source` 字段，将属于同一 addon 的实体聚合后写入对应的 addon 目录。`playerCharacter` 在保存时通过 `to_local_id()` 转为 bare ID。

---

## Startup / Lifespan

`main.py` 的 `lifespan()` 函数控制启动时的世界加载：

```python
config = load_config()
last_world_id = config.get("lastWorldId", "")

if last_world_id and last_world_id in world_ids:
    game_state.load_world(last_world_id)       # 恢复上次世界
elif not worlds:
    # 自动创建默认世界 (id="default", name="默认世界")
    save_world_config("default", {...})
    game_state.load_world("default")
else:
    game_state.load_empty()                     # 有世界但无 lastWorldId
```

---

## Relationship with Addon System

### addon_refs

`world.json` 的 `addons` 数组是一个有序的 `{id, version}` 列表。`build_addon_dirs()` 将其转换为 `list[tuple[str, Path]]`，按顺序解析为磁盘路径。加载顺序决定了实体的覆盖优先级（后加载的覆盖先加载的）。

### Version Forking

当用户需要对某个扩展进行世界级别的独立修改时，通过 `fork_addon_version()` 创建分支：

```
addons/{addon_id}/{base_version}/
  → copy to →
addons/{addon_id}/{base_version}-{worldId}/
```

Fork 后的 `addon.json` 会添加 `_forkedFrom` 和 `_worldId` 元数据字段。世界的 `addons` 列表中对应条目的 `version` 字段也会更新为 fork 版本。

### Addon Enable/Disable

扩展的启用/禁用通过 `PUT /api/session/addons` 暂存到内存（`game_state.addon_refs`），不会立即重新加载。需要用户点击 [保存变更] 触发 `save_all()` 才会持久化到 `world.json` 并重建游戏状态。

---

## Save System Integration

存档存储在 `backend/data/saves/{worldId}/{slotId}.json`，与 `worlds/` 目录分开。

- `save_manager.py` 负责存档的 CRUD 操作
- `GameState.snapshot()` 导出当前状态，`GameState.restore()` 恢复
- 存档包含：角色数据、时间、NPC 状态、世界变量等运行时数据
- 删除世界（`DELETE /api/worlds/{id}`）不会自动删除对应的存档目录

---

## Frontend: WorldSidebar Component

文件：`frontend/src/components/layout/WorldSidebar.tsx`

### Props

```typescript
interface WorldSidebarProps {
  currentWorldId: string;
  currentAddons: { id: string; version: string }[];
  onWorldChanged: () => void;  // 切换/卸载后回调，触发父组件刷新
}
```

### Component Structure

```
WorldSidebar
├── CreateWorldModal       # 新建世界对话框（id + name 输入）
├── ConfirmModal           # 通用确认对话框（删除 / 卸载）
├── Header                 # 标题 "世界 (N)" + [+] 按钮
└── World Card List        # 世界卡片列表
    └── World Card
        ├── Card Header    # 封面缩略图 + 名称 + ID + addon数 + 当前标记
        └── Expanded Panel # 详情面板（展开时显示）
            ├── Description & Addon tags
            ├── Action buttons: [切换] [编辑信息] [卸载] [删除]
            └── Edit Meta Panel (inline)
                ├── 名称 input
                ├── 简介 textarea
                ├── 封面 upload/remove
                └── [保存] [取消]
```

### Key Interactions

| 操作 | 触发方式 | 调用的 API |
|------|---------|-----------|
| 展开/收起卡片 | 单击卡片 | 无 |
| 切换世界 | 双击卡片 / 点击 [切换] | `POST /api/worlds/select` |
| 新建世界 | [+] → 填写 → [创建] | `POST /api/worlds` → `POST /api/worlds/select` |
| 编辑元数据 | [编辑信息] → 修改 → [保存] | `PUT /api/worlds/{id}/meta` |
| 上传封面 | 编辑面板中 [选择] | `POST /api/assets/upload` |
| 卸载世界 | [卸载] → 确认 | `POST /api/worlds/unload` |
| 删除世界 | [删除] → 确认 | `DELETE /api/worlds/{id}` |

### Types (game.ts)

```typescript
interface WorldInfo {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  addons?: { id: string; version: string }[];
  playerCharacter?: string;
}

interface SessionInfo {
  worldId: string;
  worldName: string;
  addons: { id: string; version: string }[];
  playerCharacter: string;
  dirty: boolean;
}
```
