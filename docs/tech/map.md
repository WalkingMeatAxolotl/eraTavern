# 地图系统 (Map System)

## 相关文件

| 文件 | 职责 |
|------|------|
| `backend/game/map_engine.py` | 地图加载、grid 编译、distance/sense matrix 构建、移动验证 |
| `frontend/src/components/MapEditor.tsx` | 地图编辑器 UI |
| `frontend/src/types/game.ts` | TypeScript 类型定义 |
| `backend/main.py` | REST API 端点 |

## 数据结构

### GameMap（后端内存中的完整地图）

```typescript
interface GameMap {
  id: string;                            // 命名空间 ID (addonId.localId)
  name: string;
  description?: string;                  // 地图简介（可选）
  defaultColor: string;                  // 默认格子颜色
  defaultBackgroundImage: string | null;  // 默认背景图
  grid: MapGrid[][];                     // 编译后的视觉网格
  cells: MapCell[];                      // 逻辑区域列表
}
```

### RawMapData（磁盘 JSON 中的原始格式）

grid 在磁盘上存储为 `(string | [string, string])[][]`：
- `string` — 纯文本，使用默认颜色
- `[text, color]` — 带颜色的文本

### MapGrid（视觉网格格子，原 GridCell）

```typescript
interface MapGrid {
  text: string;
  color: string;
  cellId: number | null;   // 指向的逻辑区域 ID，null 表示纯装饰不可交互
}
```

### MapCell（逻辑区域）

```typescript
interface MapCell {
  id: number;
  row: number;              // 在 grid 中的行坐标
  col: number;              // 在 grid 中的列坐标
  name?: string;
  description?: string;     // 区格简介（可选）
  tags?: string[];           // 标签，供条件系统匹配
  backgroundImage?: string;  // 区格背景图
  connections: {
    targetCell: number;
    targetMap?: string;
    travelTime?: number;
    senseBlocked?: boolean;
  }[];
}
```

### 连接模型

连接定义在 `MapCell.connections` 数组中，每条连接是**单向**的——从所属 cell 指向 `targetCell`。双向通行 = 两个 cell 各创建一条指向对方的连接。

不存在独立的 `Connection` 类型；`from` 隐含在所属 cell。

### DecorPreset（装饰预设）

```typescript
interface DecorPreset {
  text: string;       // 装饰格显示的文字
  color: string;      // 装饰格背景色
  source?: string;    // 所属 addon 版本目录
}
```

## Grid 编译

### `compile_grid(raw_grid, cells) → GridCell[][]`

将磁盘上的原始 grid 数据编译为运行时格式：

1. 遍历 `raw_grid` 的每个元素
2. 如果是 `string`，编译为 `{text: s, color: defaultColor, cellId: null}`
3. 如果是 `[text, color]`，编译为 `{text, color, cellId: null}`
4. 遍历所有 `cells`，根据 `row, col` 将对应格子的 `cellId` 填入 grid
5. 结果：每个格子都知道自己属于哪个 cell，前端可直接用于渲染和交互

编译在加载时一次性完成，后续读取不再需要重新计算。

## API 端点

### Raw vs 编译后

后端内存中的地图（`GameState.maps`）是**编译后**的格式——grid 中每个格子是 `MapGrid` 对象（`{text, color, cellId}`）。地图编辑器需要的是**原始格式**——grid 中每个格子是 `string | [string, string]`，不含编译产物。

`/raw` 端点返回去除编译字段的原始数据，供编辑器读写。非 `/raw` 的编译后数据通过 game state API（`/api/game/state`）获取，供游戏运行时使用。

### 地图

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/maps/raw` | 获取地图列表（id + name） |
| `GET` | `/api/game/maps/raw/{map_id:path}` | 获取单个地图的完整原始数据 |
| `POST` | `/api/game/maps` | 创建新空地图 |
| `PUT` | `/api/game/maps/raw/{map_id:path}` | 更新地图数据 |
| `DELETE` | `/api/game/maps/{map_id:path}` | 删除地图 |

### 装饰预设

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/decor-presets` | 获取所有装饰预设 |
| `PUT` | `/api/game/decor-presets` | 整体替换所有装饰预设 |

路径参数使用 `:path` converter，因为 namespaced ID 包含 `.`。

## Distance Matrix

### `build_distance_matrix(maps) → dict`

基于 Dijkstra 算法构建全局距离矩阵，用于 NPC 寻路。

**输入**: 所有地图的 connections（包括跨地图连接）

**算法**:
1. 以每个 `(mapId, cellId)` 为源点执行 Dijkstra
2. 边权重 = connection 的 `travelTime`
3. 双向通行的区格各有一条指向对方的连接，产生两条边
4. 跨地图连接（`targetMap` 非空）自动处理

**输出格式**:
```python
{
  (mapId, cellId): {
    (mapId, cellId): (distance, next_map, next_cell)
  }
}
```

- `distance`: 从源到目标的最短总 travelTime
- `next_map`, `next_cell`: 最短路径上的下一跳（用于逐步导航）

NPC 决策系统使用 distance_matrix 计算到目标的移动成本。

## Sense Matrix

### `build_sense_matrix(maps) → dict`

与 distance_matrix 使用相同的 Dijkstra 算法，但有关键区别：

1. **跳过 `senseBlocked` 边**: 标记为 `senseBlocked: true` 的 connection 不参与计算
2. **最大感知距离**: `MAX_SENSE_DISTANCE = 60`，超过此距离视为不可感知
3. **用途**: NPC 感知系统 — NPC 只能"看到" sense_matrix 中可达的目标

输出格式与 distance_matrix 相同。

**典型场景**: 两个房间之间有一扇门（connection），门关闭时设置 `senseBlocked: true`，NPC 无法感知门另一侧的角色，但仍然可以走过去（distance_matrix 不受影响）。

## 加载流程

### `load_map_collection(addon_dirs)`

1. 按 `addon_dirs` 顺序遍历每个 addon 版本目录
2. 读取 `map_collection.json` 获取地图 ID 列表
3. 逐个加载 `maps/{mapId}.json`
4. 对每个地图的 ID 应用命名空间: `namespace_id(addon_id, local_id)`
5. 对 connections 中的 cell 引用也应用命名空间
6. 调用 `compile_grid()` 编译 grid
7. 后加载的 addon 中同 ID 的地图会覆盖先加载的（load order 机制）
8. 同时构建 `cell_index`: 快速查找某个 cell 属于哪个地图

加载完成后立即调用 `build_distance_matrix()` 和 `build_sense_matrix()`。

## 保存流程

### `save_map_file()`

1. 从内存中的 `GameMap` 提取数据
2. 去除 computed fields（`cellId` 等编译产物）
3. 使用 `to_local_id()` 去除命名空间前缀，还原为裸 ID
4. 按 `source` 字段确定目标 addon 版本目录
5. 写入 `maps/{localId}.json`
6. 更新该 addon 的 `map_collection.json` 索引

保存由 `state.py: save_all()` 统一触发，通过 `_persist_entity_files()` 调度。

## 移动验证

### `validate_move(character, target_map, target_cell)`

验证角色是否可以移动到目标位置：

1. 检查角色当前位置 `(current_map, current_cell)` 的 connections 中是否有指向 `(target_map, target_cell)` 的连接
2. 验证通过后返回该 connection 的 `travelTime`
3. 验证失败返回错误

## 副作用

**每次地图数据变更（增删改）都会触发重建:**

1. `build_distance_matrix()` — 重新计算全局寻路矩阵
2. `build_sense_matrix()` — 重新计算全局感知矩阵

这确保 NPC 的寻路和感知系统始终基于最新的地图拓扑。重建发生在内存中，性能开销与地图 cell 总数相关。
