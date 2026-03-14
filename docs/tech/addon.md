# Add-on System 技术文档

## 目录结构

```
addons/
  {addon_id}/
    about/                      # _ABOUT_DIR — 跨版本共享元信息
      meta.json                 # 共享 metadata (name, description, author, cover, categories)
      covers/                   # 封面图片存储
        addon-xxx.png
    assets/                     # addon-root 级别的共享素材 (characters/, backgrounds/ 等)
      characters/
      backgrounds/
    {version}/                  # 版本目录 (必须包含 addon.json 才被视为合法版本)
      addon.json                # 版本级 metadata + dependencies
      actions.json
      clothing.json
      items.json
      traits.json
      variables.json
      decor_presets.json
      map_collection.json       # 可选，地图索引
      characters/               # 角色 JSON 文件
        {charId}.json
      maps/                     # 地图 JSON 文件
        {mapId}.json
      assets/                   # 版本级素材（覆盖 addon-root 同名文件）
        characters/
        backgrounds/
```

### 版本目录判定

```python
_ABOUT_DIR = "about"

def _is_version_dir(d: Path) -> bool:
    """Check if a directory is a version directory (contains addon.json)."""
    return d.is_dir() and (d / "addon.json").exists()
```

`about/` 和 `assets/` 目录不会被识别为版本目录。

---

## 核心常量与路径

定义在 `backend/game/addon_loader.py`:

```python
_BACKEND_DIR = Path(__file__).resolve().parent.parent
ADDONS_DIR = _BACKEND_DIR.parent / "addons"     # 项目根/addons/
WORLDS_DIR = _BACKEND_DIR.parent / "worlds"      # 项目根/worlds/
DATA_DIR = _BACKEND_DIR / "data"
TEMPLATE_PATH = DATA_DIR / "character_template.json"
```

---

## 数据结构

### addon.json (版本级)

```json
{
  "id": "era-koumakan",
  "version": "1.0.0",
  "dependencies": [{ "id": "base" }],
  "_forkedFrom": "1.0.0",     // 仅 fork 版本
  "_worldId": "t7"             // 仅 fork 版本
}
```

> 注意：`name`, `description`, `author`, `cover`, `categories` 等字段也可能存在于 addon.json 中（历史遗留），但在 `list_addons()` 中会被 `about/meta.json` 的值覆盖。

### about/meta.json (共享级)

```json
{
  "name": "基础包",
  "description": "通用奇幻基础定义",
  "author": "system",
  "cover": "addon-base.png",
  "categories": ["traits", "clothing", "items", "actions"]
}
```

覆盖规则由 `_SHARED_META_KEYS` 定义：

```python
_SHARED_META_KEYS = ("name", "description", "author", "cover", "categories")
```

`list_addons()` 遍历所有版本时，先加载 addon.json，再用 `about/meta.json` 中存在的 key 覆盖对应值。

### AddonInfo (前端 TypeScript)

定义在 `frontend/src/types/game.ts`:

```typescript
interface AddonInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  cover?: string;
  categories?: string[];
  dependencies?: { id: string; version: string }[];
}
```

### AddonVersionInfo (前端)

定义在 `frontend/src/api/client.ts`:

```typescript
interface AddonVersionInfo {
  version: string;
  forkedFrom: string | null;
  worldId: string | null;
}
```

### world.json 中的 addon 引用

```json
{
  "id": "my-world",
  "name": "我的世界",
  "addons": [
    { "id": "base", "version": "1.0.0" },
    { "id": "era-koumakan", "version": "1.0.0-my-world" }
  ],
  "playerCharacter": "reimu"
}
```

---

## API 端点

### 扩展包列表

#### `GET /api/addons`
列出所有已安装的扩展包（所有版本展平）。

**Response:**
```json
{
  "addons": [
    { "id": "base", "name": "基础包", "version": "1.0.0", "description": "...", "author": "system", "categories": [...] },
    { "id": "era-koumakan", "name": "ERA红魔馆", "version": "1.0.0", ... },
    { "id": "era-koumakan", "name": "ERA红魔馆", "version": "1.0.0-t7", "_forkedFrom": "1.0.0", "_worldId": "t7", ... }
  ]
}
```

后端调用链: `list_available_addons()` → `addon_loader.list_addons()`

### 版本查询

#### `GET /api/addon/{addon_id}/versions`
列出某个扩展包的所有版本号。

**Response:**
```json
{ "versions": ["1.0.0", "1.0.0-default", "1.0.0-t7"] }
```

#### `GET /api/addon/{addon_id}/versions?detail=true`
列出所有版本的详细信息（含 fork 元数据）。

**Response:**
```json
{
  "versions": [
    { "version": "1.0.0", "forkedFrom": null, "worldId": null },
    { "version": "1.0.0-t7", "forkedFrom": "1.0.0", "worldId": "t7" }
  ]
}
```

后端: `list_addon_versions()` / `list_addon_versions_detail()`

### 创建扩展包

#### `POST /api/addon`
创建一个新的空扩展包，带初始版本。

**Request:**
```json
{ "id": "my-addon", "name": "我的扩展", "version": "1.0.0", "description": "...", "author": "..." }
```

`version` 可选，默认 `"1.0.0"`。

**行为:**
1. 创建 `addons/{id}/{version}/` 目录
2. 写入 `addon.json`: `{ id, version, dependencies: [] }`
3. 写入 `about/meta.json`: `{ name, description, author, categories: [] }`

**Response:** `{ "success": true, "message": "..." }`

### 更新元信息

#### `PUT /api/addon/{addon_id}/{version}/meta`
更新扩展包的共享元信息。虽然 URL 包含 version，但实际写入 `about/meta.json`（跨版本共享）。

**Request:**
```json
{ "name": "新名称", "description": "新描述", "author": "新作者", "cover": "cover.png", "categories": ["traits"] }
```

所有字段可选，仅更新提供的字段。

**后端:** `load_addon_shared_meta()` → merge → `save_addon_shared_meta()`

### Fork (分支)

#### `POST /api/addon/{addon_id}/fork`
为某个世界创建扩展包版本的分支。

**Request:**
```json
{ "baseVersion": "1.0.0", "worldId": "my-world" }
```

**行为:**
1. 复制 `addons/{id}/{baseVersion}/` → `addons/{id}/{baseVersion}-{worldId}/`
2. 更新 fork 目录中的 addon.json:
   - `version` → `"{baseVersion}-{worldId}"`
   - 添加 `_forkedFrom: "{baseVersion}"`
   - 添加 `_worldId: "{worldId}"`
3. 幂等：若目标已存在，直接返回已有的 fork 版本号

**Response:** `{ "success": true, "newVersion": "1.0.0-my-world" }`

后端: `fork_addon_version(addon_id, base_version, world_id)`

### Copy (复制版本)

#### `POST /api/addon/{addon_id}/copy`
将一个版本复制为新版本。

**Request:**
```json
{ "sourceVersion": "1.0.0", "newVersion": "1.1.0", "forkedFrom": null }
```

`forkedFrom` 可选：
- `null` / 不传: 新版本视为独立版本（移除 `_forkedFrom` 和 `_worldId`）
- 传值: 标记为从某个版本 fork

**行为:**
1. 复制整个版本目录
2. 更新新目录中 addon.json 的 version 字段
3. 如果目标已存在则返回错误

**Response:** `{ "success": true, "newVersion": "1.1.0" }`

后端: `copy_addon_version(addon_id, source_version, new_version, forked_from)`

### Overwrite (覆盖版本)

#### `POST /api/addon/{addon_id}/overwrite`
用源版本的实体文件覆盖目标版本，但保留目标的 addon.json。

**Request:**
```json
{ "sourceVersion": "1.0.0-my-world", "targetVersion": "1.0.0" }
```

**行为:**
1. 删除目标版本中除 addon.json 外的所有文件和目录
2. 从源版本复制除 addon.json 外的所有文件和目录到目标
3. 目标的 addon.json（version, _forkedFrom, _worldId 等）保持不变

后端: `overwrite_addon_version(addon_id, source_version, target_version)`

### 删除

#### `DELETE /api/addon/{addon_id}/{version}`
删除单个版本。

**限制:** 不能删除当前世界正在使用的版本（检查 `game_state.addon_refs`）。

**副作用:** 如果删除后该 addon 目录下没有任何子目录了，会删除整个 addon 目录。

#### `DELETE /api/addon/{addon_id}`
删除整个扩展包（所有版本 + about + assets）。

**限制:** 任何版本正在被当前世界使用时，拒绝删除。

后端: `shutil.rmtree(addon_dir)`

### Session 中的 Addon 管理

#### `PUT /api/session/addons`
更新当前 session 的 addon 列表。

**Request:**
```json
{ "addons": [{ "id": "base", "version": "1.0.0" }, { "id": "my-addon", "version": "1.0.0" }] }
```

**行为:**
- 有世界加载时: 仅暂存变更到 `game_state.addon_refs`，不重新加载（staged）
- 无世界时: 立即重新加载

#### `POST /api/session/save`
保存所有变更（rebuild + persist + clear dirty）。

**Request (可选):**
```json
{ "addons": [{ "id": "base", "version": "1.0.0" }] }
```

传 addons 可以在保存时同时更新 addon 列表。

**后端调用:** `game_state.save_all(new_addon_refs=...)`

### 素材

#### `GET /assets/{path}`
提供静态素材文件。搜索优先级:

1. `world/{worldId}/about/{sub_path}` 或 `world/{worldId}/assets/{sub_path}`
2. `{addonId}/about/{sub_path}` 或 `{addonId}/assets/{sub_path}`
3. Fallback: 按 addon_dirs 逆序搜索版本级 `assets/` → addon-root `assets/`

#### `POST /api/assets/upload`
上传素材文件。

**Query params:**
- `folder`: `"characters"` | `"backgrounds"` | `"covers"`
- `name`: 目标文件名（不含扩展名）
- `addonId` (可选): 指定目标 addon
- `worldId` (可选): 指定目标世界（仅 covers 使用）

**Body:** multipart/form-data with `file` field

**存储位置:**
- `covers` + `worldId`: `worlds/{worldId}/about/covers/{name}{ext}`
- `covers` + `addonId`: `addons/{addonId}/about/covers/{name}{ext}`
- 有 `addonId`: `addons/{addonId}/assets/{folder}/{name}{ext}`
- 默认: `addons/{lastAddonId}/assets/{folder}/{name}{ext}`

支持格式: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`

---

## 加载流程

### World 加载 (`GameState.load_world`)

```
load_world_config(world_id)
  → addon_refs = config["addons"]
  → addon_dirs = build_addon_dirs(addon_refs)
    → 对每个 {id, version}: 返回 (addon_id, Path("addons/{id}/{version}"))
  → 按 addon_dirs 顺序加载所有实体类型 (maps, traits, clothing, items, actions, ...)
  → _resolve_namespaces()  // 给所有 ID 加上 addon 前缀
  → build_character_state() for each character
  → build_cell_action_index()  // NPC 决策用
```

### 加载顺序与覆盖

`build_addon_dirs()` 按 `world.json` 中 `addons` 数组的顺序构建 `(addon_id, path)` 列表。

各 `load_*_defs()` 函数遍历 addon_dirs，后加载的同 ID 实体覆盖先加载的。这意味着:
- `addons` 数组中靠后的扩展包优先级更高
- 补充包应排在它依赖的基础包之后

### ID 命名空间

加载时，所有实体 ID 经过命名空间化: `bare_id` → `{addonId}.{bare_id}` (separator = `"."`)。

- 文件中存储裸 ID，加载时加前缀
- 保存时通过 `to_local_id()` 去除前缀
- `SYMBOLIC_REFS = {"self", "{{targetId}}", "{{player}}", ""}` 不参与命名空间化

---

## 保存流程

### `GameState.save_all(new_addon_refs)`

```
save_all(new_addon_refs)
  → rebuild(new_addon_refs)
    → 如果 addon 列表变更: _persist_entity_files() 先写回当前数据，然后重新加载
    → 重建 cell_action_index
    → 重建角色状态（保留运行时数据: position, resources, inventory 等）
  → _persist_entity_files()
    → 按 entity 的 source 字段分组
    → 每组实体写入对应 addon 的版本目录
    → 保存时 strip namespace (to_local_id)
  → _update_addon_dependencies()
    → 扫描所有实体中的跨 addon 引用
    → 自动更新每个 addon.json 的 dependencies 字段
  → 更新 world.json (addon_refs, playerCharacter)
  → dirty = False
```

### `_persist_entity_files()` 详解

按 `source` 字段将实体分组，每组写入对应的 addon 版本目录:

```python
addon_dir_map = {aid: apath for aid, apath in self.addon_dirs}
for source in sources:
    target_dir = addon_dir_map.get(source)
    # 写入 traits.json, clothing.json, items.json, actions.json, ...
```

实体文件保存时 strip 掉 source 字段和 namespace 前缀。

---

## 依赖检测

### `_update_addon_dependencies()`

在 `save_all()` 中调用。扫描所有实体定义，提取跨 addon 引用:

**扫描范围:**
- Actions: conditions, costs, outcomes (effects, weightModifiers, suggestNext), npcWeightModifiers, outputTemplates
- Events: conditions, effects
- Trait groups: traits 列表中的 trait ID
- Characters: traits, clothing, inventory, favorability, position, restPosition
- Maps: connections 中的 targetMap
- Variables: steps 中的 key, traitId, varId

**提取逻辑:**
对每个命名空间化的 ID（包含 `.` 分隔符），提取 addon 部分:
```python
def _extract_addon(ref_id: str) -> Optional[str]:
    if not ref_id or ref_id in SYMBOLIC_REFS or NS_SEP not in ref_id:
        return None
    return ref_id.split(NS_SEP, 1)[0]
```

**写入:**
构建 `addon_id → set[referenced_addon_id]` 映射，去除自引用，然后更新各 addon.json:
```json
{ "dependencies": [{ "id": "base" }, { "id": "era-koumakan" }] }
```

依赖列表是完全自动管理的，每次保存时重新生成。

---

## 前端组件结构

### AddonSidebar.tsx

主要子组件:

| 组件 | 功能 |
|------|------|
| `AddonSidebar` | 主侧边栏，列出所有 addon，toggle 开关，展开/折叠版本面板 |
| `ForkModal` | 弹窗：选择「使用本体」或「创建分支」 |
| `VersionSwitchList` | 版本切换列表（radio-style） |
| `VersionManagePanel` | 版本管理面板：新建版本、复制、覆盖、删除 |
| `AddonMetaEditor` | 弹窗：编辑 name, author, description, cover |

### Fork 流程 (前端)

1. 用户启用一个未 fork 的 addon → `ForkModal` 弹出
2. 选择「使用本体」→ 直接使用原版本号
3. 选择「创建分支」→ 调用 `POST /api/addon/{id}/fork` → 使用返回的 fork 版本号
4. 更新 `stagedAddons`（暂存，不立即生效）
5. 用户点击「保存变更」→ `POST /api/session/save` 触发 rebuild

### Helper 函数

```typescript
getBaseVersion("1.0.0-myworld") → "1.0.0"
getBaseVersion("1.0.0") → "1.0.0"

isWorldFork("1.0.0-myworld") → true
isWorldFork("1.0.0") → false

getForkWorldId("1.0.0-myworld") → "myworld"
getForkWorldId("1.0.0") → null
```

---

## 素材解析

### `resolve_asset_path(filename, subfolder, addon_dirs)`

按 addon_dirs 逆序搜索:
1. 版本级: `addons/{addonId}/{version}/assets/{subfolder}/{filename}`
2. Addon-root: `addons/{addonId}/assets/{subfolder}/{filename}`

后加载的 addon 优先（逆序搜索），版本级优先于 addon-root。

### `find_addon_for_asset(filename, subfolder, addon_dirs)`

与 `resolve_asset_path` 相同的搜索逻辑，但返回 addon_id 而非文件路径。

---

## 启用/禁用/删除的副作用

### 启用 Addon
- 将 `{id, version}` 加入 `addon_refs`
- 暂存在前端 `stagedAddons` 中
- 保存时 `rebuild()` 重新加载所有实体
- 新 addon 的实体可能覆盖已有同 ID 实体

### 禁用 Addon
- 从 `addon_refs` 中移除
- 保存时先 `_persist_entity_files()`（写回当前内存数据到各 addon 目录）
- 然后 `rebuild()` 用新的 addon 列表重新加载
- 被禁用 addon 中定义的实体从内存中消失
- 其他 addon 中引用该 addon 实体的地方可能产生悬空引用

### 删除 Addon 版本
- 直接 `shutil.rmtree(version_dir)`
- 如果该版本正在被当前世界使用，API 会拒绝删除
- 删除后检查 addon 根目录是否为空，是则一并删除
- 其他世界如果引用了该版本，加载时会跳过（`build_addon_dirs` 中 `if addon_path.exists()` 检查）

### 删除整个 Addon
- `shutil.rmtree(addon_dir)` 删除所有版本 + about + assets
- 任何版本在当前世界使用中则拒绝
- 其他世界的引用在下次加载时静默跳过
