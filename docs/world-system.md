# 世界系统

## 1. 概念

World（世界）是游戏运行的最外层单位，类似整合包（Modpack）。

```
World = Template + Addon A + Addon B + {worldId}-custom + Overlay(config)
```

- **开箱即用**：包含完整的 Add-on 组合 + 配置
- **隔离性**：每个世界独立，互不影响
- **可分享**：导出为 `.world` 包

## 2. 目录结构

```
backend/data/worlds/{world-id}/
  world.json                     ← 世界配置（overlay）
  save/                          ← 运行时存档（预留）
  backups/
    2026-03-09_14-30-00/         ← 自动备份
    2026-03-08_20-15-00/
    ...                          ← 保留最近 5 份
```

世界目录下**没有**实体定义文件。所有实体（角色、物品、特质等）都在 Add-on 中。

## 3. world.json

```json
{
  "id": "my-game",
  "name": "我的游戏",
  "addons": [
    {"id": "base", "version": "1.0.0"},
    {"id": "era-touhou", "version": "1.0.0"},
    {"id": "my-game-custom", "version": "1.0.0"}
  ],
  "writeTarget": "my-game-custom",
  "playerCharacter": "player"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 世界唯一标识，与目录名一致 |
| `name` | string | 显示名称 |
| `addons` | `{id, version}[]` | 启用的 Add-on 列表（顺序 = 加载顺序） |
| `writeTarget` | string | 世界内编辑的写入目标 Add-on ID |
| `playerCharacter` | string | 当前玩家角色 ID |

## 4. 世界生命周期

### 4.1 创建世界

1. 用户在左侧边栏点 [新建世界]，输入 ID 和名称
2. 后端创建 `worlds/{id}/` 目录和 `world.json`
3. 自动创建世界专属 Add-on：`addons/{id}-custom/1.0.0/`
4. 自动切换到新世界
5. `lastWorldId` 写入 `config.json`

### 4.2 加载世界

```
load_world(world_id)
  → 读取 world.json
  → 自动迁移（首次加载时将 overlay 实体文件移入 custom addon）
  → build_addon_dirs(addon_refs) 构建加载栈
  → 按顺序加载所有 addon 的定义文件（合并同 ID）
  → 构建角色状态
  → dirty = false
```

### 4.3 切换世界

1. `POST /api/worlds/select` → `game_state.load_world(world_id)`
2. 记录 `lastWorldId` 到 `config.json`
3. 广播 `game_changed` 通知前端

### 4.4 启动行为

1. 读取 `config.json` 的 `lastWorldId`
2. 如果世界存在 → 加载它
3. 如果没有任何世界 → 自动创建 "default" 世界
4. 如果指定世界不存在 → 加载第一个可用世界

## 5. 世界专属 Add-on（{worldId}-custom）

每个世界自动创建一个专属 Add-on，作为世界内编辑的默认写入目标：

```
addons/{worldId}-custom/1.0.0/
  addon.json          ← dependencies 引用世界启用的所有 addon
  (空，随编辑逐步产生文件)
```

特点：
- 世界内的所有实体编辑（新增、修改、删除）写入此 addon
- 对用户透明，行为类似之前的 overlay
- 可以独立分享（作为补充型 Add-on）
- 用户可以创建其他 addon 并切换 `writeTarget`

## 6. 变更与保存机制

> 完整说明见 [overview.md 第 4 节](./overview.md#4-核心数据流内存与磁盘的关系)

核心要点：
- 编辑器 [保存] 只更新内存，不写磁盘
- [应用世界变更] = rebuild（内存→内存），dirty 保持
- [应用并保存世界变更] = rebuild + 写磁盘，dirty 清除
- rebuild 和 save 都会保留运行时状态（位置、资源、库存、能力、经历、时间）

## 7. 备份与回滚

### 7.1 自动备份

每次 rebuild 前自动创建备份（保留最近 5 份）：
```
worlds/{worldId}/backups/{timestamp}/
  → 快照 world.json + save/ 内容
```

### 7.2 回滚

- 入口：系统设置页 → 备份与回滚
- 选择时间点 → 恢复 world.json 和 save/ 到备份状态
- 恢复后自动重载世界
- 恢复的是世界设置（addon 列表、writeTarget、实体定义），不影响运行时数据

## 8. UI：World Sidebar（左侧栏）

```
┌─────────────────────────┐
│ [新建世界]          [空]  │ ← 操作按钮
├─────────────────────────┤
│ ┌───────────────────┐   │
│ │ W  我的游戏   当前  │   │ ← 世界卡片（当前世界红框）
│ │    2 addons    ▼   │   │
│ └───────────────────┘   │
│ ┌─展开面板──────────┐   │
│ │ ID: my-game       │   │ ← 展开后的详情
│ │ Addons: base, ...  │   │
│ │ writeTarget: ...   │   │
│ │ [切换] [编辑信息]   │   │ ← 操作按钮
│ │ [删除]             │   │
│ └───────────────────┘   │
│ ┌───────────────────┐   │
│ │ W  测试世界        │   │
│ │    1 addon     ▼   │   │
│ └───────────────────┘   │
└─────────────────────────┘
```

- [新建世界]：输入 ID 和名称创建
- [空]：卸载当前世界，进入空世界
- 卡片点击展开详情，详情中可切换/编辑元信息/删除
- 当前世界用红色边框标识

## 9. API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/worlds` | 列出所有世界 |
| POST | `/api/worlds` | 创建新世界 |
| POST | `/api/worlds/select` | 切换世界 |
| POST | `/api/worlds/unload` | 卸载当前世界 |
| DELETE | `/api/worlds/{id}` | 删除世界 |
| PUT | `/api/worlds/{id}/meta` | 更新世界元信息 |
| GET | `/api/session` | 当前会话信息 |
| POST | `/api/session/rebuild` | 应用世界变更（内存→内存） |
| POST | `/api/session/save` | 应用并保存（内存→磁盘） |
| GET | `/api/session/backups` | 列出备份 |
| POST | `/api/session/restore-backup` | 恢复备份 |
