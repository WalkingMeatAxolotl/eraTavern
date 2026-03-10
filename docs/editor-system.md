# 编辑器系统

## 1. 概述

系统提供两种编辑模式，对应不同的使用场景：

| 模式 | 入口 | 数据范围 | 写入目标 | 场景 |
|------|------|----------|----------|------|
| **世界模式** | NavBar 各 tab | 所有 addon 合并后的完整数据 | writeTarget addon | 游戏内容调整 |
| **Addon 编辑** | 右侧栏 [编辑] | 该 addon + 依赖(只读) | addon 文件 | 制作/修改 addon |

## 2. 世界模式编辑

### 2.1 NavBar Tab

NavBar 提供以下编辑 tab：

| Tab | 组件 | 管理内容 |
|-----|------|---------|
| 人物 | CharacterManager | 角色列表、创建/删除角色、编辑角色属性 |
| 特质 | TraitManager | 特质定义 + 特质组管理 |
| 服装 | ClothingManager | 服装定义 |
| 物品 | ItemManager | 物品定义 + 物品标签管理 |
| 行动 | ActionManager | 行动定义（条件/消耗/效果） |
| 地图 | MapManager | 地图网格、方格、连接关系 |
| 设置 | SettingsPage | 重新开始游戏、备份与回滚 |

### 2.2 CRUD 数据流

```
用户在编辑器中修改
  → 点 [保存]
  → 前端调 CRUD API（POST/PUT/DELETE）
  → 后端更新内存中的定义字典
  → 标记 source = writeTarget addon ID
  → dirty = true
  → WebSocket 广播 dirty_update
  → 前端悬浮面板出现

用户点 [应用世界变更]
  → rebuild() 重建角色
  → 变更在游戏中生效（可测试）
  → dirty 保持

用户点 [应用并保存世界变更]
  → rebuild() + 写磁盘
  → 持久化到 writeTarget addon 文件
  → dirty 清除
```

**关键点**：
- 编辑器 [保存] 只更新内存，不写磁盘
- 角色不会自动重建，需要点 [应用] 才生效
- 只有 [应用并保存] 才会写入磁盘

### 2.3 来源标识（source）

每个实体定义带有 `source` 字段（角色和地图用 `_source`），标识它来自哪个 addon。

- 显示时用不同颜色/badge 区分来源
- 只能删除来自 writeTarget 的实体
- 修改其他 addon 的实体 → 在 writeTarget 中创建覆盖副本

### 2.4 CRUD API 端点

**角色**：
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/game/characters/config` | 所有角色配置 |
| GET | `/api/game/characters/config/{id}` | 单个角色 |
| POST | `/api/game/characters/config` | 创建角色 |
| PUT | `/api/game/characters/config/{id}` | 更新角色 |
| PATCH | `/api/game/characters/config/{id}` | 切换 isPlayer/active |
| DELETE | `/api/game/characters/config/{id}` | 删除角色 |

**特质**：`GET/POST/PUT/DELETE /api/game/traits/{id}`
**服装**：`GET/POST/PUT/DELETE /api/game/clothing/{id}`
**物品**：`GET/POST/PUT/DELETE /api/game/items/{id}` + 物品标签 `/api/game/item-tags/{tag}`
**行动**：`GET/POST/PUT/DELETE /api/game/actions/{id}`
**特质组**：`GET/POST/PUT/DELETE /api/game/trait-groups/{id}`
**地图**：`GET/PUT /api/game/maps/raw/{mapId}` + `POST/DELETE /api/game/maps/{mapId}`

## 3. Addon 编辑模式

### 3.1 入口

右侧栏展开某个 addon 的详情 → 点 [编辑] → 中间区域切换为 Addon 编辑器。

### 3.2 数据加载

```
GET /api/addon/{addonId}/{version}/data
  → 加载该 addon 的实体
  → 如有 dependencies，加载依赖 addon 的实体（标记为只读）
  → 返回 { own: {...}, deps: {...}, overrides: Set<id> }
```

### 3.3 编辑器界面

```
┌── Addon 编辑器 ──────────────────────────────────┐
│ Tab: 信息 | 特质 | 服装 | 物品 | 行动 | 人物       │
├──────────────────────────────────────────────────┤
│ ▸ 本 addon 条目（可编辑）                          │
│   ├─ 普通条目                                     │
│   └─ ⚡ 覆盖条目（同 ID 存在于依赖中）              │
│                                                   │
│ ▸ 依赖 addon 条目（灰色只读）                      │
│   └─ [base] 基础特质                              │
└──────────────────────────────────────────────────┘
```

- **信息 tab**：编辑 addon 元信息（名称、作者、描述）
- **实体 tab**：分为"本 addon 条目"和"依赖条目"
- 覆盖条目用 ⚡ 标识
- 点击条目进入对应的编辑器组件（TraitEditor、ItemEditor 等）

### 3.4 Addon CRUD 数据流

与世界模式不同，Addon 编辑**直接写入磁盘**：

```
用户在 addon 编辑器中修改
  → 点 [保存]
  → 前端调 addon CRUD API
  → 后端直接写入 addon 文件
  → 不经过 GameState 内存
  → 不设 dirty（独立于游戏状态）
```

### 3.5 Addon CRUD API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/addon/{id}/{ver}/data` | 加载 addon 数据 + 依赖 |
| POST | `/api/addon/{id}/{ver}/{category}` | 创建实体 |
| PUT | `/api/addon/{id}/{ver}/{category}/{entityId}` | 更新实体 |
| DELETE | `/api/addon/{id}/{ver}/{category}/{entityId}` | 删除实体 |
| PUT | `/api/addon/{id}/{ver}/meta` | 更新 addon 元信息 |

`category` 支持：`traits`、`trait-groups`、`clothing`、`items`、`actions`、`characters`

## 4. 编辑器组件复用

所有实体编辑器组件（TraitEditor、ClothingEditor、ItemEditor、ActionEditor、TraitGroupEditor）支持两种模式：

```typescript
interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

// 世界模式：不传 addonCrud，使用全局 CRUD API
<TraitEditor trait={data} isNew={false} onBack={goBack} />

// Addon 模式：传 addonCrud，使用 addon CRUD API
<TraitEditor trait={data} isNew={false} onBack={goBack} addonCrud={crud} />
```

编辑器内部判断：有 `addonCrud` prop → 用它保存；无 → 用全局 API。

## 5. FloatingActions 悬浮面板

### 5.1 显示条件

```
visible = (dirty || hasAddonChanges) && worldId !== ""
```

- `dirty`：后端实体编辑产生的标志，通过 WebSocket 实时同步
- `hasAddonChanges`：前端比较 `stagedAddons` 和 `currentAddons`（基于 ID 集合比较，与顺序无关）
- 空世界不显示

### 5.2 按钮

| 按钮 | API | 效果 |
|------|-----|------|
| [应用世界变更] | `POST /api/session/rebuild` | 重建游戏状态，dirty 保持 |
| [应用并保存世界变更] | rebuild + `POST /api/session/save` | 重建 + 写磁盘，dirty 清除 |

### 5.3 位置

固定在屏幕底部中央，z-index 90，半透明深色背景，带阴影。

## 6. 各编辑器说明

### 6.1 角色编辑器（CharacterEditor）

- 完整表单编辑角色 JSON
- 基本信息（名称、描述等）
- 资源配置（体力、气力等）
- 特质选择（按分类）
- 服装穿着
- 位置设置
- 头像上传

### 6.2 特质编辑器（TraitEditor）

- ID、名称、分类、描述
- 效果列表（目标、增减、固定/百分比、数值）
- 默认值（用于能力类特质）
- 衰减设置

### 6.3 服装编辑器（ClothingEditor）

- ID、名称、槽位选择
- 遮挡列表（穿着时隐藏其他槽位）
- 效果列表

### 6.4 物品编辑器（ItemEditor）

- ID、名称、标签
- 描述、最大堆叠数
- 可出售开关、价格

### 6.5 行动编辑器（ActionEditor）

最复杂的编辑器，包含：
- 基本信息（ID、名称、类型、时间消耗）
- 条件列表（递归 AND/OR/NOT 结构）
- 消耗列表（资源、物品等）
- 结果列表（等级、权重、效果、输出模板）
- 效果支持：资源、能力、好感度、特质、物品、服装、位置、经历

### 6.6 地图编辑器（MapEditor）

- JSON 编辑器模式
- 网格定义（二维数组）
- 方格定义（ID、名称、标签、连接）
- 装饰预设管理
