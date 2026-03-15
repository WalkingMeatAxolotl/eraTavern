# Item & Clothing System — 技术文档

物品与服装系统的完整技术参考，涵盖数据格式、加载流程、库存管理、服装状态构建、行动集成和保存流程。

---

## 相关文件

| 文件 | 职责 |
|------|------|
| `backend/game/character.py` | 物品/服装命名空间、服装状态构建、服装效果应用 |
| `backend/game/action.py` | 行动中的物品消耗/获取、服装穿脱/状态变更 |
| `backend/main.py` | 物品/服装/标签的 REST API 端点 |
| `frontend/src/components/ItemEditor.tsx` | 物品定义编辑器 |
| `frontend/src/components/ClothingEditor.tsx` | 服装定义编辑器 |
| `frontend/src/components/ItemManager.tsx` | 角色库存管理面板（双视图） |
| `frontend/src/types/game.ts` | TypeScript 类型定义 |

---

## 数据结构

### ItemDefinition — 物品定义

```typescript
interface ItemDefinition {
  id: string;              // bare ID (磁盘) 或 namespaced ID (内存)
  name: string;            // 显示名称
  description: string;     // 描述
  tags: string[];          // 分类标签，用于 ItemManager 分组视图
  maxStack: number;        // 最大堆叠数量
  sellable: boolean;       // 是否可出售
  price: number;           // 价格
  source: string;          // 所属 addon ID (加载时自动附加)
}
```

### ClothingDefinition — 服装定义

```typescript
interface ClothingDefinition {
  id: string;              // bare ID (磁盘) 或 namespaced ID (内存)
  name: string;            // 显示名称
  slot: string;            // 所占槽位 (对应 character_template 的 clothingSlots)
  occlusion: string[];     // 穿着时遮挡的其他槽位
  effects?: TraitEffect[]; // 穿着时产生的效果（同 trait effects 机制）
  source: string;          // 所属 addon ID (加载时附加)
}
```

### InventoryItem — 库存条目

角色原始数据（磁盘存储）：

```typescript
interface InventoryItem {
  itemId: string;          // 物品 ID (namespaced)
  amount: number;          // 持有数量
}
```

运行时状态（`build_character_state()` 后，从 itemDefs 填充）：

```typescript
interface InventoryItemState {
  itemId: string;          // 物品 ID (namespaced)
  name: string;            // 显示名称（从 itemDef 解析）
  tags: string[];          // 分类标签（从 itemDef 解析）
  amount: number;          // 持有数量
}
```

角色数据中 `inventory` 字段为 `InventoryItem[]` 数组。

### ClothingSlot — 服装槽位状态

角色数据中 `clothing` 字段为 `Record<string, { itemId: string; state: string }>`，key 是槽位名称。

运行时 `CharacterState.clothing` 经过 `build_clothing_state()` 构建后，变为包含遮挡信息的展示列表 `ClothingSlot[]`：

```typescript
interface ClothingSlot {
  slot: string;                        // 槽位名称
  slotLabel: string;                   // 槽位显示名称
  occluded: boolean;                   // 是否被其他服装遮挡
  itemId: string | null;               // 服装 ID（空槽位为 null）
  itemName: string | null;             // 服装显示名称（空槽位为 null）
  state: "worn" | "halfWorn" | "none" | null;  // 当前状态（空槽位为 null）
}
```

**服装状态与效果**:

| state | 含义 | 效果 |
|-------|------|------|
| `"worn"` | 正常穿着 | ✓ 生效 |
| `"halfWorn"` | 半脱 | ✓ 生效 |
| `"none"` | 脱下（衣物仍在角色身上） | ✗ 不生效 |
| `null` / `itemId: null` | 槽位无衣物 | — |

`occlusion` 仅影响前端显示（被遮挡显示为「？？？」），不影响效果计算。

---

## API 端点

### 物品 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/items` | 获取所有物品定义 |
| `POST` | `/api/game/items` | 创建物品定义 |
| `PUT` | `/api/game/items/{item_id:path}` | 更新物品定义 |
| `DELETE` | `/api/game/items/{item_id:path}` | 删除物品定义 |

### 服装 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/clothing` | 获取所有服装定义 |
| `POST` | `/api/game/clothing` | 创建服装定义 |
| `PUT` | `/api/game/clothing/{clothing_id:path}` | 更新服装定义 |
| `DELETE` | `/api/game/clothing/{clothing_id:path}` | 删除服装定义 |

### 物品标签管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game/item-tags` | 获取所有标签 |
| `POST` | `/api/game/item-tags` | 添加单个标签 |
| `DELETE` | `/api/game/item-tags/{tag}` | 删除单个标签 |

标签用于 ItemManager 的 byTag 分组视图，标签定义存储在 `items.json` 中。

所有包含 `.` 的 ID 在路由中使用 `:path` converter，确保 namespaced ID 被正确传递。

---

## 物品加载

### load_item_defs()

`state.py` 在 `load_world()` 时调用，遍历 `addon_dirs` 加载物品定义。

**流程：**

1. 遍历 `addon_dirs` 列表中每个 `(addon_id, path)` 元组
2. 读取 `{path}/items.json`，获取物品定义列表和标签定义
3. 为每个物品附加 `source = addon_id`（内部字段）
4. 存入 `GameState.item_defs` 字典，key 为 bare ID
5. 后加载的 addon 覆盖先加载的（load order 生效）

### load_item_tags()

标签定义同样存储在 `items.json` 中，与物品定义一起加载。标签信息存入 `GameState.item_tags`。

### 命名空间处理

加载完成后，`_resolve_namespaces()` 统一为所有 item ID 添加 `addonId.` 前缀。物品 tags 中的引用不需要命名空间处理（tags 是纯字符串标签，不是 ID 引用）。

---

## 服装加载

### load_clothing_defs()

与物品加载流程一致。

**流程：**

1. 遍历 `addon_dirs`，读取 `{path}/clothing.json`
2. 为每个服装定义附加 `source = addon_id`
3. 存入 `GameState.clothing_defs`
4. load order 覆盖规则同上

### 命名空间处理

`_resolve_namespaces()` 为服装 ID 添加前缀。服装定义中的 `slot` 和 `occlude` 字段是模板级别的槽位名，不加命名空间。`effects` 中引用的 trait/ability key 遵循标准命名空间规则。

---

## 库存管理

### 数据结构

角色的 `inventory` 是一个 `[{itemId, amount}]` 数组。每个条目代表持有的一种物品及其数量。

### addItem 效果

行动效果中通过 `addItem` 向角色添加物品：

- 如果角色库存中已有该 `itemId`，增加 `amount`
- 如果没有，创建新条目 `{itemId, amount}`

### removeItem 效果

行动效果中通过 `removeItem` 从角色移除物品：

- 减少对应条目的 `amount`
- 如果 `amount` 降至 0 或以下，移除整个条目

### 前端 ItemManager

`ItemManager.tsx` 提供双视图模式（详见 memory 中 `project_item_tag_ui.md`）：

- **byTag 视图**：按标签分组显示物品，便于分类浏览
- **byItem 视图**：直接列出角色库存中的物品，带 tooltip 显示详细信息

---

## 服装状态构建

### build_clothing_state()

`character.py` 中的两遍算法，将角色 `clothing` 原始数据转为前端展示用的 `ClothingSlot[]` 列表。

**第一遍 — 收集穿着信息 + 标记遮挡：**

1. 遍历角色 `clothing` dict 的所有槽位
2. 查找对应 `clothing_defs` 获取服装定义
3. 收集该服装的 `occlude` 列表
4. 将被遮挡的槽位记录到 occluded set 中

**第二遍 — 构建展示列表：**

1. 再次遍历所有槽位
2. 组装 `ClothingSlot` 对象，包含 `slot`, `itemId`, `name`, `state`
3. 根据 occluded set 设置 `occluded` 布尔值
4. 返回完整列表

遮挡机制：如果角色穿了一件 `occlude: ["upperUnderwear"]` 的外衣，则 `upperUnderwear` 槽位的服装会被标记为 `occluded: true`。前端据此决定显示方式。

---

## 服装效果

### apply_clothing_effects()

`character.py` 中，与 trait effects 使用相同的效果机制。

**流程：**

1. 遍历角色当前穿着的所有服装
2. 查找 `clothing_defs` 获取服装定义
3. 如果定义包含 `effects`，逐一应用
4. 效果可以修改角色的 resources、abilities 等数值

效果仅在服装处于非遮挡状态且穿着时生效。效果的格式和求值方式与 trait effects 完全一致，复用同一套处理逻辑。

---

## 命名空间

### namespace_character_data()

角色数据中有两处涉及物品/服装 ID 的命名空间处理：

**clothing 字段：**
- `clothing` dict 中每个槽位的 `itemId` 需要加命名空间前缀
- 例：`clothing.upperBody.itemId = "shirt"` → `"base.shirt"`

**inventory 字段：**
- `inventory` 数组中每个条目的 `itemId` 需要加命名空间前缀
- 例：`inventory[0].itemId = "potion"` → `"base.potion"`

### strip_character_namespaces()

保存时执行反向操作：

- 从 `clothing` 的 `itemId` 中去掉 addon 前缀
- 从 `inventory` 的 `itemId` 中去掉 addon 前缀
- 还原为 bare ID 写入磁盘

---

## 行动集成

### 行动消耗 (costs)

行动定义的 `costs` 中可以包含 `item` 类型的消耗：

- 类型标记为 item 消耗
- 执行行动前检查角色库存中是否有足够数量的指定物品
- 条件不满足时行动不可执行

### 行动效果 (effects)

行动定义的 `effects` / `outcomes` 中支持以下物品/服装相关效果：

| 效果类型 | 说明 |
|----------|------|
| `addItem` | 向目标角色添加指定物品和数量 |
| `removeItem` | 从目标角色移除指定物品和数量 |
| `equipClothing` | 在指定槽位穿上指定服装 |
| `removeClothing` | 脱下指定槽位的服装 |
| `changeState` | 改变指定槽位服装的状态 (如 `worn` → `halfWorn`) |

效果执行后会触发角色状态重建（`rebuild_character_state`），确保 clothing effects 和 occlusion 状态正确更新。

---

## 保存流程

### save_item_defs_file()

将物品定义写回磁盘：

1. `_persist_entity_files()` 按 `source` 字段分组
2. 每个 addon 的物品写入 `addons/{addonId}/{version}/items.json`
3. 写入前通过 `to_local_id()` 去掉命名空间前缀
4. 标签定义同时写入同一个 `items.json` 文件

### save_clothing_defs_file()

与物品保存流程一致：

1. 按 `source` 分组
2. 写入 `addons/{addonId}/{version}/clothing.json`
3. 去掉命名空间前缀

### save_item_tags_file()

标签定义与物品定义存储在同一个 `items.json` 文件中，保存时一并写入。

### 保存触发

用户点击 [保存变更] 按钮 → `POST /api/session/save` → `state.save_all()` → 依次调用各实体的保存函数，包括物品和服装定义的写回。
