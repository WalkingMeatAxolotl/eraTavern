# Character System — 技术文档

角色系统的完整技术参考，涵盖数据格式、加载流程、运行时构建、API 和前端组件。

---

## character_template.json

全局角色模板，路径: `backend/data/character_template.json`。定义所有角色共享的属性结构。

```json
{
  "id": "era-touhou",
  "name": "东方ERA角色模板",
  "basicInfo": [
    { "key": "name", "label": "名称", "type": "string", "defaultValue": "" },
    { "key": "money", "label": "金钱", "type": "number", "defaultValue": 0 }
  ],
  "resources": [
    { "key": "stamina", "label": "体力", "defaultMax": 2000, "defaultValue": 2000, "color": "#FFFF00" }
  ],
  "clothingSlots": ["hat", "upperBody", "upperUnderwear", ...],
  "traits": [
    { "key": "race", "label": "族群", "multiple": true },
    { "key": "ability", "label": "能力", "multiple": true },
    { "key": "experience", "label": "经验", "multiple": true }
  ],
}
```

注意：`abilities` 和 `experiences` 不在模板中静态定义，而是运行时从 `trait_defs` 中 `category == "ability"` 和 `category == "experience"` 的条目动态生成（通过 `get_ability_defs()` / `get_experience_defs()`）。模板中 `traits` 数组里 `key: "ability"` 和 `key: "experience"` 的条目仅用于分类占位。

---

## RawCharacterData — 磁盘存储格式

每个角色存储在 `addons/{addon_id}/{version}/characters/{localId}.json`。

文件中使用 bare ID（不带命名空间前缀）。TypeScript 类型定义见 `frontend/src/types/game.ts`:

```typescript
interface RawCharacterData {
  id: string;                    // bare local ID (磁盘) 或 namespaced ID (内存)
  template: string;              // 模板 ID (目前未被 backend 消费)
  isPlayer: boolean;
  active?: boolean;              // 冻结/解冻（默认 true，false 时不参与游戏）
  portrait?: string | null;      // 立绘文件名
  basicInfo: Record<string, string | number>;
  resources?: Record<string, { value: number; max: number }>;
  clothing: Record<string, { itemId: string; state: "worn" | "halfWorn" | "none" }>;
  traits: Record<string, string[]>;           // category -> trait ID list
  abilities: Record<string, number>;          // ability key -> exp value
  experiences?: Record<string, { count: number; first?: {...} }>;
  inventory?: { itemId: string; amount: number }[];
  position: { mapId: string; cellId: number };
  restPosition?: { mapId: string; cellId: number };
  favorability?: Record<string, number>;      // target character ID -> value
}
```

加载后 backend 会附加内部字段:
- `_local_id`: 原始 bare ID
- `_source`: 所属 addon ID

### 角色冻结（active 字段）

`active` 字段控制角色是否参与游戏循环：

- `active: true`（默认）— 正常参与游戏
- `active: false`（冻结）— 角色数据完整保留在 `character_data` 中，但不加入 `GameState.characters`

**冻结时不参与的系统**：
- NPC 决策（不执行 tick、不被选为行动目标）
- NPC 感知（不出现在 sense_matrix 查询结果中）
- 能力衰减（不累积衰减时间）
- 前端显示（不出现在游戏状态中）
- 行动条件检查（npcPresent/npcAbsent 中不可见）

**冻结时保留的**：
- 完整的 `character_data`（位置、装备、好感度等）
- 编辑器中仍可见和编辑
- 解冻后从 `character_data` 重建运行时状态，一切恢复

**限制**：玩家角色不可冻结，需先切换玩家角色。

---

## CharacterState — 运行时状态

由 `build_character_state()` 从 `RawCharacterData` + `template` 构建。这是前端通过 WebSocket 接收到的格式。

```typescript
interface CharacterState {
  id: string;                     // namespaced ID
  isPlayer: boolean;
  basicInfo: Record<string, BasicInfoField>;   // { label, type, value }
  resources: Record<string, Resource>;         // { label, value, max, color }
  clothing: ClothingSlot[];                    // 含 occlusion 计算结果
  traits: Trait[];                             // { key, label, values(显示名), multiple }
  abilities: Ability[];                        // { key, label, exp, grade }
  experiences: ExperienceEntry[];              // { key, label, count, first }
  inventory: InventoryItem[];                  // { itemId, name, tags, amount }
  position: { mapId: string; cellId: number };
  portrait?: string;                           // "{source}/characters/{filename}"
  favorability: FavorabilityEntry[];           // { id, name, value }
}
```

### Raw vs State 的关键区别

| 方面 | RawCharacterData | CharacterState |
|------|-----------------|---------------|
| basicInfo | `{ name: "灵梦" }` | `{ name: { label: "名称", type: "string", value: "灵梦" } }` |
| resources | `{ stamina: { value: 2000, max: 2000 } }` | 同上 + `label`, `color` from template |
| traits | `{ race: ["human"] }` (ID list) | `[{ key: "race", label: "族群", values: ["人类"], ... }]` (显示名) |
| abilities | `{ strength: 1500 }` (exp map) | `[{ key: "strength", label: "力量", exp: 1500, grade: "F" }]` |
| clothing | `{ hat: { itemId: "x", state: "worn" } }` | occlusion-resolved list with slotLabel, itemName |
| inventory | `[{ itemId: "x", amount: 1 }]` | `[{ itemId: "x", name: "道具名", tags: [...], amount: 1 }]` |
| favorability | `{ "charId": 100 }` (raw map) | `[{ id: "charId", name: "角色名", value: 100 }]` |
| portrait | `"filename.png"` | `"addonId/characters/filename.png"` |

---

## 加载流程

### 1. load_characters()

`character/entity_loader.py` — 遍历所有 addon_dirs，读取 `characters/*.json`，对每个角色:
- 读取 JSON 文件
- 对 ID 加命名空间: `namespace_id(addon_id, local_id)` -> `"base.tes"`
- 附加 `_local_id` 和 `_source` 内部字段
- 返回 `dict[namespaced_id, char_data]`

### 2. _resolve_namespaces() (state.py)

加载所有实体定义后调用。对每个 character_data 调用 `namespace_character_data()`，将所有交叉引用从 bare ID 解析为 namespaced ID:
- `traits` 中的 trait ID
- `clothing` 中的 itemId
- `inventory` 中的 itemId
- `favorability` 的 key (target character ID)
- `abilities` 的 key (trait ID)
- `experiences` 的 key (trait ID)
- `position.mapId` 和 `restPosition.mapId`

解析使用 `resolve_ref(bare_id, defs, default_addon)`:
1. 已有命名空间 -> 原样返回
2. 尝试 `default_addon.bare_id` 查找
3. 遍历所有 defs 匹配 local part
4. 找不到 -> 用 default_addon 前缀（lookup 时会失败，但不影响加载）

### 3. build_character_state()

`character/state.py` — 将 raw data + template 合并为运行时 state:
1. **basicInfo**: 遍历 template.basicInfo，从 char_data 取值或用 defaultValue
2. **resources**: 遍历 template.resources，从 char_data 取值或用 defaults
3. **clothing**: 调用 `build_clothing_state()` 计算 occlusion
4. **traits**: 遍历 template.traits（排除 ability/experience），解析 ID 到显示名
5. **abilities**: 从 `get_ability_defs(trait_defs)` 动态获取列表，读取 char_data 中的 exp
6. **experiences**: 从 `get_experience_defs(trait_defs)` 动态获取列表，读取 count/first
7. **inventory**: 解析 itemId 到 name/tags
8. **position** / **restPosition**: 直接复制
9. **favorability**: 原样复制（在 `get_full_state()` 中进一步解析为 name）
10. **apply_trait_effects()**: 特质效果修改 resources.max、abilities.exp、basicInfo.value
11. **apply_clothing_effects()**: 装备效果同上

### 4. _rebuild_characters() (state.py)

保存/重建时调用。从 snapshot 恢复运行时变化（position、resources、abilities、experiences、inventory），然后重新 `build_character_state()`。

---

## 效果系统

特质和装备共用同一套效果计算逻辑:

```
_collect_effects() -> (fixed_deltas, pct_multipliers)
_apply_all_effects() -> 对每个 target: new = (base + fixed_delta) * multiplier_product
```

效果 target 可以指向:
- `resources.{key}`: 修改 max 值
- `abilities.{key}`: 修改 exp 值
- `basicInfo.{key}`: 修改 number 类型字段的 value

### 等级计算

```python
GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"]
def exp_to_grade(exp: int) -> str:
    level = min(exp // 1000, len(GRADES) - 1)
    return GRADES[max(0, level)]
```

### 能力衰减 (ability decay)

`apply_ability_decay()` 按游戏时间流逝量对所有角色的能力值进行衰减:
- `fixed` 类型: `exp -= amount * intervals`
- `percentage` 类型: `exp *= (1 - amount/100) ^ intervals`

---

## 命名空间保存

`save_character()` 写入磁盘时：
- 移除 `_` 前缀的内部字段
- 调用 `strip_character_namespaces(data, addon_id)` 处理嵌套引用：
  - 同 addon 引用 → 去命名空间前缀（bare ID）
  - 跨 addon 引用 → 保留命名空间（确保加载时能正确解析）
- 覆盖写入 `characters/{localId}.json`

其他实体（action、trait group）保存时也遵循同样的跨 addon 感知逻辑，通过 `_strip_ref(ref, addon_id)` 统一处理。

`delete_character()` 直接删除对应 JSON 文件。

---

## API Endpoints

所有角色相关的 REST API 定义在 `backend/routes/entities.py`:

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/game/characters/config` | 获取所有角色的 raw config |
| GET | `/api/game/characters/config/{id}` | 获取单个角色 raw config |
| PUT | `/api/game/characters/config/{id}` | 全量更新角色 config，触发 rebuild |
| POST | `/api/game/characters/config` | 创建新角色 |
| PATCH | `/api/game/characters/config/{id}` | 部分更新 (isPlayer, active) |
| DELETE | `/api/game/characters/config/{id}` | 删除角色，清理好感度引用 |
| GET | `/api/game/definitions` | 获取模板+所有定义（编辑器用） |
| POST | `/api/assets` | 上传立绘等资源文件 |

路径中 `{id}` 使用 `:path` converter 以支持包含 `.` 的 namespaced ID。

### PATCH isPlayer 的特殊逻辑

设置 `isPlayer: true` 时会先清除所有角色的 isPlayer，保证全局唯一。然后对所有角色执行 `_build_char()` 重建。

### Create 的源 addon 确定

1. 从 body 的 `source` 字段取
2. 从 ID 中解析 addon 前缀 (`get_addon_from_id`)
3. 如果都没有，source 为空字符串

---

## 前端: CharacterEditor

文件: `frontend/src/components/character/CharacterEditor.tsx`

### Props

```typescript
interface Props {
  character: RawCharacterData;    // 待编辑的角色数据
  definitions: GameDefinitions;   // 模板 + 所有实体定义
  allCharacters: RawCharacterData[];  // 所有角色（用于好感度选择）
  isNew: boolean;                 // 新建 vs 编辑模式
  onBack: () => void;             // 返回列表回调
}
```

### 编辑器分区 (Section)

1. **基本设置** — ID（新建时可编辑）、立绘（PortraitPicker）
2. **基本信息** — 遍历 template.basicInfo 渲染 input
3. **初始资源** — value / max 双 input
4. **初始服装** — 每个 slot 一个 select，accessory1/2/3 共享 "accessory" 分类的服装
5. **初始特质** — tag 式显示，两级下拉（先选特质组/散特质，再选组内成员）。排他组选择新成员时自动替换旧成员
6. **初始能力** — grid 布局，exp input + grade 显示
7. **初始经验** — grid 布局，count input
8. **初始物品栏** — 动态列表，select + amount input
9. **初始位置** — 地图 select + 区域 select
10. **休息位置** — 同上
11. **初始好感度** — 动态列表，select 添加角色 + value input

### PortraitPicker 组件

```typescript
function PortraitPicker({ portrait, characterId, onChange })
```

- 点击按钮触发隐藏 `<input type="file">`
- 调用 `uploadAsset(file, "characters", characterId, { addonId })` 上传
- addonId 从 characterId 的 namespace 前缀提取
- 上传成功后调用 `onChange(filename)` 更新 portrait 字段
- 通过 `cacheBust` state 强制刷新 img src

### 保存流程

- 新建: `createCharacter(data)` -> POST `/api/game/characters/config`
- 编辑: `saveCharacterConfig(data.id, data)` -> PUT `/api/game/characters/config/{id}`
- 保存成功后新建模式会调用 `onBack()` 返回列表

---

## 与其他系统的关系

### Traits 系统
- trait_defs 中 `category: "ability"` -> 自动生成 abilities 列表
- trait_defs 中 `category: "experience"` -> 自动生成 experiences 列表
- 其他 category 的 traits -> 显示在特质区
- trait 的 effects -> 修改角色 resources/abilities/basicInfo

### Clothing 系统
- clothing_defs 定义可用服装、slot、occlusion、effects
- `build_clothing_state()` 计算 occlusion: 仅 `worn` 状态的服装产生遮挡
- clothing effects 与 trait effects 使用相同的 `_collect_effects` / `_apply_all_effects` 流程

### Items 系统
- item_defs 定义物品的 name、tags、maxStack、price 等
- 角色 inventory 通过 itemId 引用 item_defs
- build_character_state 时解析 itemId -> name/tags

### Action 系统
- action 的 conditions 可以检查角色的 resource、ability、trait、clothing、item、favorability、position
- action 的 effects 可以修改上述所有属性
- action 的 costs 可以消耗 resource、basicInfo、item

### Map 系统
- 角色 position.mapId 引用 map ID
- position.cellId 引用 map 中的 cell ID
- NPC 行动系统使用 distance_matrix / sense_matrix 进行路径规划和感知判断

### Save 系统
- `_snapshot_runtime()` 快照当前 positions、resources、abilities、experiences、inventories
- `_rebuild_characters()` 从快照恢复运行时状态
- `_persist_entity_files()` 按 `_source` 分组写入各 addon 目录

### Addon 系统
- 角色文件存储在 `addons/{id}/{version}/characters/{localId}.json`
- ID 命名空间: `addon_id.local_id`
- 磁盘存储 bare ID，加载时添加命名空间，保存时去除命名空间
