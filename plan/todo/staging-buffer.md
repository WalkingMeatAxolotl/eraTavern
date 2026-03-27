# Staging Buffer（编辑暂存区）

**创建日期**: 2026-03-26
**最后更新**: 2026-03-26
**相关内容**: 实体编辑数据流、保存/撤销机制

---

## 问题

当前架构：编辑器保存时直接写入 GameState 内存 → 游戏立即使用新数据。
没有暂存区，"撤销"按钮无法恢复已修改的实体。错误的编辑会直接影响游戏运行。
特别危险的是 action/event 编辑——效果规则立即生效，NPC 下一轮就可能触发，
半成品的批量编辑可能对游戏数据产生破坏性影响。

## 目标

实现双缓冲：编辑→暂存区，游戏使用活跃数据。用户点"应用"时暂存写磁盘再全量 reload，点"撤销"时丢弃暂存区。

---

## 数据分类：定义/初始 vs 运行时/当前

这是整个方案的核心区分。

### 定义层（存在 addon JSON 文件中，编辑器修改的对象）

编辑器改的永远是定义/初始值。apply 后从磁盘重载，**替换为最新定义**。

| 数据 | 存储位置 | 说明 |
|------|----------|------|
| `trait_defs` | traits.json | trait 定义（名称、类别、效果） |
| `action_defs` | actions.json | 行动定义（条件、效果、花费）。**没有"初始"概念，定义即规则** |
| `clothing_defs` | clothing.json | 服装定义（槽位、修正） |
| `outfit_types` | clothing.json | 服装预设类型定义 |
| `item_defs` | items.json | 物品定义（名称、描述、标签） |
| `variable_defs` | variables.json | 派生变量公式定义 |
| `event_defs` | events.json | 事件定义（触发条件、效果） |
| `world_variable_defs` | events.json | 世界变量定义（含 `default` 初始值） |
| `lorebook_defs` | lorebook.json | 知识库条目 |
| `trait_groups` | traits.json | trait 分组 |
| `maps` | maps/*.json | 地图定义（格子、连接、背景） |
| `character_data` 基础字段 | characters/*.json | 角色**初始**定义：初始 traits、初始 resources.max/value、初始 position 等 |
| `item_tags` / `variable_tags` | 各 json | 标签池 |
| `template` | character_template.json | 角色字段模板 |
| `decor_presets` | maps json | 地图装饰预设 |

### 运行时层（游戏过程中产生/变化的数据）

apply 时**必须保留**，不被定义层覆盖。这些数据只有 restart game 才会重置为初始值。

| 数据 | 所属 | 说明 |
|------|------|------|
| `position` | 角色 | 当前位置（游戏中移动产生） |
| `resources.*.value` | 角色 | 当前资源值（体力、金钱等当前值，非初始 max） |
| `resources.*.max` | 角色 | 当前资源上限（可能被效果修改过） |
| `inventory` | 角色 | 当前背包（游戏中获取/消耗） |
| `abilities` | 角色 | 能力经验值（游戏中积累） |
| `experiences` | 角色 | 交互经历记录 |
| `favorability` | 角色 | 好感度（游戏中变化） |
| `clothing` | 角色 | 当前穿着的服装 |
| `outfits` | 角色 | 服装预设配置 |
| `currentOutfit` | 角色 | 当前活跃服装预设 |
| `traits` | 角色 | 当前 trait 列表（可能被效果增减过） |
| `basicInfo` | 角色 | 基础信息（金钱等，游戏中变化） |
| `world_variables` | 全局 | 世界变量**当前值**（非 default 初始值） |
| `event_state` | 全局 | 事件触发状态（哪些已触发） |
| `time` | 全局 | 游戏时间 |
| `llm_preset` | 全局 | 当前 LLM 预设（运行时可切换） |
| `npc_goals` | 全局 | NPC 当前目标（apply 后清空，让 NPC 重新决策） |
| `npc_activities` | 全局 | NPC 当前活动描述 |
| `npc_full_log` | 全局 | NPC 完整行动日志 |
| `npc_action_history` | 全局 | NPC 行动历史（per character） |
| `decay_accumulators` | 全局 | 资源衰减累加器 |
| `action_log` | 全局 | 玩家行动日志 |

### 两种操作的区别

| | restart game | apply changes |
|---|---|---|
| 定义层 | 从磁盘重载 | staging 写盘后从磁盘重载 |
| 运行时层 | **重置为定义中的初始值** | **保留当前游戏状态** |

---

## 当前数据流

```
编辑器 [保存] → PUT /api/game/traits/{id}
               → GameState.trait_defs[id] = 新数据  (游戏立即可见)
               → dirty = true
               → broadcast dirty_update

悬浮窗 [保存变更] → POST /api/session/save
                   → save_all() → 内存→磁盘
                   → dirty = false

悬浮窗 [撤销] → 前端 setStagedAddons(currentAddons)  (只恢复 addon 选择，实体无变化)
```

## 目标数据流

```
编辑器 [保存] → PUT /api/game/traits/{id}
               → staging.trait_defs[id] = 新数据  (游戏不受影响)
               → dirty = true

编辑器 [读取] → GET /api/game/traits
               → 返回 merged(active, staged)  (编辑器看到最新版本)

游戏运行     → 使用 GameState 的 active 数据（不受编辑影响）

悬浮窗 [应用] → POST /api/session/save
               → snapshot 运行时游戏状态
               → staging 写入 active → 持久化到磁盘
               → load_world() 全量重载（回到定义初始值）
               → restore 运行时游戏状态（好感度、金钱、位置等覆盖回去）
               → 清空 staged，dirty = false
               → broadcast game_changed

悬浮窗 [撤销] → POST /api/session/discard
               → 清空 staged
               → dirty = false
               → broadcast dirty_update
```

---

## 设计方案

### 核心思路：StagingLayer 增量 overlay + 全量 reload + 运行时恢复

**应用策略**：
1. `snapshot_save_data()` 捕获当前运行时状态
2. staging 合并到 active → `_persist_entity_files()` 写盘
3. `load_world()` 全量重载（所有定义回到磁盘版本，运行时回到初始值）
4. `restore_save_data(snapshot)` 恢复运行时游戏状态

复用已有的存档系统的 snapshot/restore 方法（`state.py:884-989`），
这对方法已经完整覆盖所有运行时字段，经过存档系统充分测试。

```python
class StagingLayer:
    """Overlay for uncommitted entity edits."""
    # 每种实体类型一个 dict，key = entity_id
    # 值为 entity data（更新/新建）或 _DELETED 哨兵（删除）
    trait_defs: dict[str, dict | _Sentinel] = {}
    clothing_defs: dict[str, dict | _Sentinel] = {}
    item_defs: dict[str, dict | _Sentinel] = {}
    action_defs: dict[str, dict | _Sentinel] = {}
    trait_groups: dict[str, dict | _Sentinel] = {}
    variable_defs: dict[str, dict | _Sentinel] = {}
    event_defs: dict[str, dict | _Sentinel] = {}
    lorebook_defs: dict[str, dict | _Sentinel] = {}
    world_variable_defs: dict[str, dict | _Sentinel] = {}
    character_data: dict[str, dict | _Sentinel] = {}
    maps: dict[str, dict | _Sentinel] = {}
    decor_presets: list[dict] | None = None
    # 列表类型（完整替换语义）
    outfit_types: list[dict] | None = None
    item_tags: list[str] | None = None
    variable_tags: list[str] | None = None
```

### 应用流程（save_all 改造）

```python
def save_all(self, new_addon_refs=None):
    # 1. 捕获当前运行时游戏状态（复用存档系统）
    runtime_snapshot = self.snapshot_save_data()
    # 额外保存 snapshot_save_data 不覆盖的字段
    saved_llm_preset = self.llm_preset

    # 2. staging 合并到 active 内存
    self.staging.persist_over(self)

    # 3. 处理 addon 列表变更
    if new_addon_refs is not None:
        self.addon_refs = new_addon_refs

    # 4. 持久化到磁盘（写各 addon 目录的 JSON 文件）
    self._persist_entity_files()
    self._update_addon_dependencies()
    # 保存 world.json
    if self.world_id:
        world_config = load_world_config(self.world_id)
        world_config["addons"] = self.addon_refs
        save_world_config(self.world_id, world_config)

    # 5. 全量重载（一切回到定义/初始值）
    #    load_world 是同步方法（无 await），期间不会有其他请求插入
    self.load_world(self.world_id)

    # 6. 恢复运行时游戏状态（复用存档系统）
    self.restore_save_data(runtime_snapshot)
    self.llm_preset = saved_llm_preset

    # 7. 清理（load_world 内部已调 staging.clear()）
    self.dirty = False
```

**关键设计决策**：
- `save_all` 是同步方法（无 `await`），整个 snapshot→persist→reload→restore
  在同一个事件循环 tick 内完成，不存在中间状态被其他请求看到的风险
- load_world 内部已包含 namespace 解析、character rebuild、distance_matrix、
  cell_action_index 等全部逻辑，不需要重新实现
- restore_save_data 已完整覆盖所有运行时字段，经过存档系统测试
- `llm_preset` 不在 snapshot_save_data 中（它是 load_world 从 world.json 读的），
  需要额外保存/恢复

---

## 变更清单

### Phase 1: 后端核心 — StagingLayer

#### 1.1 新文件 `backend/game/staging.py`

新建 `StagingLayer` 类：

| 方法 | 说明 |
|------|------|
| `__init__()` | 初始化所有空 dict |
| `put(attr, entity_id, data)` | 暂存一条实体修改 |
| `delete(attr, entity_id)` | 暂存一条删除标记 |
| `get(attr, entity_id)` | 查暂存区某条实体，不存在返回 None |
| `has(attr, entity_id)` | 暂存区是否有此 entity |
| `is_deleted(attr, entity_id)` | 是否标记为删除 |
| `merged_defs(attr, active_defs)` | 返回 active + staged 合并后的 dict（不修改 active），供编辑器 LIST/GET 使用 |
| `merged_list(attr, active_list)` | 列表类型的合并（outfit_types、decor_presets 等） |
| `is_empty()` | 所有 dict/list 都为空 |
| `clear()` | 清空所有暂存 |
| `persist_over(gs)` | 将暂存合并写入 gs 的 active dict（仅在 save_all 写盘前调用） |

#### 1.2 修改 `backend/game/state.py`

| 位置 | 变更 |
|------|------|
| `__init__` | 新增 `self.staging = StagingLayer()` |
| `save_all()` | 改为：snapshot_save_data → persist_over → _persist → load_world → restore_save_data → dirty=False |
| `load_world()` | 末尾加 `staging.clear()` |
| 新增 `discard_changes()` | `staging.clear()` + `dirty = False` |
| `snapshot_save_data()` | 确认 `llm_preset` 需在调用方额外保存（不改此方法，在 save_all 中处理） |

#### 1.3 修改 `backend/routes/entities.py` — CRUD 工厂

**改动量最大。** 所有 CRUD 操作从直接写 active 改为写 staging。

| 操作 | 当前 | 改为 |
|------|------|------|
| **LIST** | `return defs.values()` | `return staging.merged_defs(attr, defs).values()` |
| **GET** (单条) | `return defs[id]` | 先查 staging，再查 active（staging 中标记为 DELETED 则返回 not found） |
| **CREATE** | `defs[id] = entry` | `staging.put(attr, id, entry)` + 重复检查需查 merged |
| **UPDATE** | `defs[id] = entry` | `staging.put(attr, id, entry)` + 存在检查需查 merged |
| **DELETE** | `del defs[id]` | `staging.delete(attr, id)` + 存在检查需查 merged |

工厂函数签名不变，内部逻辑改为操作 staging。
需要 helper：`_get_entity(attr, entity_id)` 从 staging+active 查实体。

**CRUD 钩子处理**：

| 钩子 | 当前行为 | staging 下处理 |
|------|----------|----------------|
| `on_create: _on_create_world_variable` | 设 `gs.world_variables[id] = default` | **不执行**。apply 时 load_world 会调 `_init_world_variables()` 设默认值 |
| `on_delete: _on_delete_trait` | 从 `trait_groups` 移除引用 | **操作 staged trait_groups**：如果 trait_groups 尚未在 staging 中，先复制到 staging 再修改 |
| `on_delete: _on_delete_event` | 从 `event_state` 移除 | **不执行**。event_state 是运行时数据，apply 时 load_world 会重置 |
| `on_delete: _on_delete_world_variable` | 从 `world_variables` 移除 | **不执行**。运行时数据，apply 后新的 `_init_world_variables` 不含该变量 |

#### 1.4 修改 `backend/routes/entities.py` — 角色特殊路由

| 路由 | 当前 | 改为 |
|------|------|------|
| `GET .../characters/config` | 读 `character_data` | 读 merged |
| `GET .../characters/config/{id}` | 读 `character_data[id]` | 先查 staging |
| `PUT .../characters/config/{id}` | `character_data[id] = body` + `_build_char` | `staging.put(...)` **不调 _build_char** |
| `POST .../characters/config` | 同上 | `staging.put(...)` |
| `DELETE .../characters/config/{id}` | 直接删 | `staging.delete(...)` |
| `PATCH .../characters/config/{id}` | 改 isPlayer/active + rebuild all | 见下方特殊处理 |

**PATCH isPlayer 特殊处理**：当设置 isPlayer=true 时，需要清除其他角色的 isPlayer。
在 staging 下：遍历 merged character_data，找到当前 isPlayer 的角色，将其修改后放入 staging。

#### 1.5 修改 `backend/routes/maps.py`

| 路由 | 当前 | 改为 |
|------|------|------|
| `GET .../maps/raw` | 读 `maps` | 读 merged |
| `GET .../maps/raw/{id}` | 读 `maps[id]` | 先查 staging |
| `PUT .../maps/raw/{id}` | 直接改 + rebuild distance_matrix + broadcast state_update | `staging.put(...)` **不 rebuild，不 broadcast** |
| `POST .../maps` | 直接加 | `staging.put(...)` |
| `DELETE .../maps/{id}` | 直接删 | `staging.delete(...)` |
| `PUT .../decor-presets` | `gs.decor_presets = body` | `staging.decor_presets = body` |

地图编辑后不再立即 broadcast state_update。游戏视图看 active 地图，编辑器看 merged 地图。

#### 1.6 修改 `backend/routes/entities.py` — 其他特殊路由

| 路由 | 变更 |
|------|------|
| `PUT /api/game/outfit-types` | `staging.outfit_types = body` |
| tag CRUD (`item-tags`, `variable-tags`) | 操作 staging.item_tags / staging.variable_tags |
| `POST /api/game/clone` | clone 结果写入 staging。**不执行** compile_grid / build_distance_matrix / _build_char 等即时副作用，这些在 apply 时由 load_world 处理 |

#### 1.7 修改 `backend/game/state.py` — `get_definitions()`

当前 `get_definitions()` (state.py:841-882) 直接读 active defs，供编辑器下拉框使用。
**必须改为返回 merged 数据**，否则暂存的新实体不会出现在其他编辑器的下拉选项中。

```python
def get_definitions(self):
    s = self.staging
    return {
        "clothingDefs": list(s.merged_defs("clothing_defs", self.clothing_defs).values()),
        "itemDefs": list(s.merged_defs("item_defs", self.item_defs).values()),
        "traitDefs": list(s.merged_defs("trait_defs", self.trait_defs).values()),
        # ... 所有定义类型同理
    }
```

#### 1.8 新增路由 `POST /api/session/discard`

```python
@router.post("/api/session/discard")
async def discard_changes():
    game_state.discard_changes()
    await manager.broadcast("dirty_update", {"dirty": False})
    return _resp(True, "CHANGES_DISCARDED")
```

#### 1.9 修改 `POST /api/session/save` (`backend/routes/worlds.py`)

save_all 内部已改造，路由层代码基本不变。
确保 broadcast game_changed 在全量 reload + restore 完成后。

### Phase 2: 后端 — 游戏运行隔离验证

确保游戏逻辑只读 active 数据，不读 staging。

| 模块 | 读取方式 | 是否需要改 |
|------|----------|:---:|
| `game/action/conditions.py` | `gs.trait_defs`, `gs.item_defs` 等 | 不需要（直接读 active） |
| `game/action/effects.py` | 同上 | 不需要 |
| `game/action/npc.py` | `gs.action_defs`, `gs.cell_action_index` | 不需要 |
| `game/character/state.py` | `gs.trait_defs`, `gs.clothing_defs` | 不需要 |
| `game/map_engine.py` | `gs.maps` | 不需要 |
| `game/variable_engine.py` | `gs.variable_defs` | 不需要 |

**结论**：游戏逻辑全部通过 `gs.xxx_defs` 访问 active 数据，天然隔离。

### Phase 3: 后端 — AI Assist 适配

| 函数 | 当前 | 改为 |
|------|------|------|
| `execute_tool_create_entity()` | 直接写 `gs.xxx_defs[id]` | 写 `gs.staging.put(...)` |
| `execute_tool_update_entity()` | `existing.update(fields)` + `_build_char` | 从 merged 读 → 合并 → `staging.put(...)` |
| `execute_tool_batch_create/update` | 循环调上面两个 | 同上 |
| `_build_action_ref_info()` | 读 `gs.xxx_defs` | 读 merged（AI 需要看到暂存的实体） |
| AI 内的 validation（如 `_validate_field_values`） | 读 active defs | 需读 merged（验证应能引用暂存实体） |

### Phase 4: 前端适配

#### 4.1 `api/client.ts` — 新增 discard API

```typescript
export async function discardChanges(): Promise<ApiResponse> {
  const res = await fetch("/api/session/discard", { method: "POST" });
  return handleResponse(res);
}
```

#### 4.2 `App.tsx` — onRevert 回调

```typescript
// 当前：
onRevert={() => setStagedAddons(currentAddons)}

// 改为：
onRevert={async () => {
  await discardChanges();
  setStagedAddons(currentAddons);
  // dirty_update SSE 会自动处理 dirty 状态
}}
```

#### 4.3 `FloatingActions.tsx` — 撤销按钮

撤销按钮改为 async 操作（调后端 API），加 loading 状态和确认对话框。

```typescript
const handleRevert = async () => {
  if (!confirm("确认撤销所有未保存的修改？")) return;
  setBusy(true);
  await onRevert();
  setBusy(false);
};
```

#### 4.4 编辑器无需改动

编辑器的 save/list/get 仍调同样的 API，只是后端行为变了。
**前端编辑器代码零改动。**

### Phase 5: Raw File 路由适配

`PUT /api/game/raw-file/{addon}/{filename}` 当前直接写磁盘并全量 reload。
**保持现有行为不变**（直接写磁盘 + reload + 清空 staging）。
这是 power user 操作，语义是"直接应用"。

---

## 边界情况

### 1. Staging 中新建的实体被其他实体引用
编辑器可能创建一个新 trait，然后立即在角色编辑器中引用它。
**处理**：编辑器 API 返回 merged 数据，新 trait 可见（包括 `get_definitions()` 下拉框）。
apply 时一起生效。

### 2. Staging 中删除的实体仍被引用
**处理**：接受悬挂引用（当前系统已容忍悬挂引用，见 feedback_dangling_refs.md）。

### 3. 游戏运行中编辑
**处理**：staging 隔离保证游戏不受影响。只有 apply 时才影响游戏。

### 4. 多次编辑同一实体
**处理**：staging 中只保留最新版本（dict 覆盖语义）。

### 5. Apply 时的 namespace
staging 中的实体可能使用裸 ID。
**处理**：persist_over 写入 active → _persist_entity_files 写盘时 strip namespace →
load_world reload 时 _resolve_namespaces 重建。全走已有流程。

### 6. Apply 时运行时状态保留
**处理**：save_all 中先 snapshot_save_data()，load_world 后 restore_save_data()。
复用存档系统的完整 snapshot/restore，覆盖所有运行时字段。
`llm_preset` 不在 snapshot 中，需额外保存/恢复。

### 7. Addon 列表变更 + staging 同时存在
用户同时修改了实体和启用/禁用了 addon。
**处理**：save_all 中先 persist_over（将 staging 写入当前 addon 目录的 active 数据），
再更新 addon_refs，再 _persist，再 load_world（用新 addon 列表重载）。
注意：如果用户禁用了一个 addon，该 addon 中的 staged 实体会被写入 addon 目录但不会被加载。
如果用户删除了 staging 中实体所属的 addon，那些 staged 编辑会被丢弃（因为 persist 按 source 分组写入）。

### 8. 编辑角色初始属性 vs 保留当前游戏值
用户在角色编辑器里把 HP max 从 100 改成 200。当前游戏中角色 HP 是 75/100。
**Apply 后**：load_world 用新定义建出 200/200 → restore_save_data 恢复为 75/100。
即：初始定义改了，但当前游戏值不变。
**Restart game 后**：200/200（用新定义的初始值）。

### 9. 新增角色定义
用户在 staging 中新建了一个角色。apply 后这个角色没有运行时 snapshot。
**处理**：restore_save_data 中，新角色不在 saved_chars 里 → 不覆盖 →
保持 load_world 建出的初始值。新角色直接以初始状态加入游戏。

### 10. 删除角色定义
用户在 staging 中删除了一个角色。
**处理**：使用 _DELETED 哨兵标记。apply 时 persist_over 从 active character_data 中删除 →
_persist_entity_files 不写该角色 → load_world 不加载。
项目已容忍悬挂引用（feedback_dangling_refs.md），其他角色的 favorability 等引用不会导致崩溃。

### 11. CRUD 钩子的运行时副作用
`on_create_world_variable` / `on_delete_event` / `on_delete_world_variable`
这些钩子修改运行时数据（world_variables、event_state），staging 时不执行。
apply 时 load_world 会重置运行时数据，restore_save_data 恢复游戏状态，自然处理。

### 12. Clone 路由的即时副作用
地图 clone 当前会 compile_grid + build_distance_matrix，角色 clone 会 _build_char。
staging 下这些副作用**不执行**，clone 结果只写入 staging。
apply 时 load_world 会重建一切。

### 13. save_all 的原子性
save_all 是同步方法（无 await），persist_over → _persist → load_world → restore
全在同一个事件循环 tick 内完成。不存在中间状态（load_world 后 restore 前的空状态）
被其他请求看到的风险。调用方（路由 handler）在 save_all 返回后才 await broadcast。

### 14. 创建存档时有 staging
用户在有 staged 编辑时创建存档。snapshot_save_data 捕获的是 active（未应用 staging）的游戏状态。
即存档保存的是"当前游戏中的真实状态"，不含未应用的编辑。这是正确行为——
staged 编辑尚未生效，不应进入存档。

---

## UX 改进项（不阻塞核心实现，后续迭代）

staging 引入后编辑→测试的即时反馈循环变长（需要点"应用"才能在游戏中看到效果）。
以下 UX 改进可缓解这一问题，作为后续迭代实现：

### P1（随核心实现一起做）
- **浮窗文案**：从"未保存的更改"改为"N 项变更待应用"，明确显示 staged 数量
- **编辑器标记**：编辑器列表中对 staged 的实体显示标记（如圆点或颜色），区分 active vs staged

### 待观察（根据用户反馈决定）
- **restore 拆分处理**：当前 `restore_save_data` 整体恢复所有角色字段（与存档系统统一）。
  服装预设（outfits/clothing/currentOutfit）不带"初始"前缀，按 UI 分类应该 apply 即生效，
  但当前会被 restore 覆盖回旧值。如果用户反馈这是问题，需要为这些字段做拆分处理——
  定义部分跟随编辑，运行时部分（穿着状态 worn/off）保留。

### P2（后续迭代）
- **staging 持久化**：将 staging buffer 写入临时文件，防止浏览器关闭/后端重启丢失未应用编辑
- **staged diff 预览**：应用前可查看所有 staged 变更的摘要/diff
- **选择性应用**：允许用户选择性地应用部分 staged 实体（非全部）
- **per-entity undo**：在 staging 内部记录每个实体的修改历史，支持逐个撤销

---

## 测试策略

### 单元测试：StagingLayer

| 测试 | 说明 |
|------|------|
| put/get/delete 基本操作 | 暂存、查询、删除标记 |
| merged_defs 合并 | active + staged 覆盖、staged 新增、staged 删除 |
| merged_list 合并 | outfit_types / tags 的替换语义 |
| persist_over | 合并写入 active dict 的正确性 |
| is_empty / clear | 状态管理 |

### 集成测试：CRUD + staging

| 测试 | 说明 |
|------|------|
| CREATE → 游戏不可见 | 创建实体后，游戏引擎不使用新实体 |
| CREATE → 编辑器可见 | LIST/GET 返回新实体 |
| UPDATE → 游戏不变 | 修改实体后，游戏引擎用旧版本 |
| DELETE → 游戏不变 | 删除实体后，游戏引擎仍使用它 |
| apply → 游戏更新 | save_all 后游戏使用新数据 |
| apply → 运行时保留 | save_all 后角色位置、好感度、金钱等不变 |
| discard → 还原 | discard 后编辑器恢复为 active 数据 |
| 新角色 → apply → 加入游戏 | 以初始状态出现 |
| addon 变更 + staging → apply | 两者都生效 |
| 创建存档 + staging | 存档包含 active 状态，不含 staged 编辑 |
| raw-file 写入 → staging 清空 | raw-file 路由后 staging 被清除 |

### 回归测试

- 完整游戏行动循环（移动、交互、NPC 轮次）在 staging 引入后正常工作
- 存档 load/save 在 staging 引入后正常工作
- AI Assist 创建/修改实体后可在编辑器中看到

---

## 工作量估算

| Phase | 文件数 | 复杂度 | 说明 |
|-------|:------:|:------:|------|
| 1.1 StagingLayer 类 | 1 新建 | 中 | ~150 行，纯数据操作 |
| 1.2 state.py | 1 | 中 | save_all 改造 + discard_changes |
| 1.3 CRUD 工厂 | 1 | 高 | 核心改动，钩子延迟处理 |
| 1.4 角色路由 | 1 | 中 | 6 个路由 + isPlayer 特殊处理 |
| 1.5 地图路由 | 1 | 中 | 5 个路由 + decor_presets |
| 1.6 其他路由 | 1 | 低 | outfit/tag/clone（去除即时副作用） |
| 1.7 get_definitions | 1 | 低 | 改为返回 merged 数据 |
| 1.8-1.9 session 路由 | 1 | 低 | 新增 discard + 确认 save 流程 |
| 2 游戏隔离验证 | 0 | 低 | 天然隔离，只需验证 |
| 3 AI Assist | 2 | 中 | create/update/batch + ref_info + validation |
| 4 前端 | 3 | 低 | client.ts + App.tsx + FloatingActions |
| 5 Raw file | 1 | 低 | 确认 staging.clear() 在 load_world 中已调用 |
| 测试 | 1-2 新建 | 高 | StagingLayer 单测 + CRUD/apply/discard 集成测试 |

**总计**：~10 个文件改动 + 3 个新建，核心复杂度在 CRUD 工厂改写。
