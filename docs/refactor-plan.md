# 架构重构计划

## 背景

当前系统的问题：
- 世界编辑器和 addon 编辑器分离，维护成本高
- `writeTarget` + `{worldId}-custom` addon 机制复杂，所有编辑都汇入一个 custom addon
- 对 addon A 的修改保存到 custom addon，需要覆盖机制，增加复杂度
- "应用"和"应用并保存"两个操作让用户困惑

## 重构目标

```
当前: 两个编辑器 + writeTarget + custom addon + 覆盖机制 + 应用/应用并保存
目标: 统一编辑器 + 版本分支 + 直接写入各 addon + 保存并应用
```

## 四个阶段

### Phase 1: ID 命名空间 ✅ 已完成

**目标**：消除跨 addon 的 ID 冲突。

**方案**：
- 格式：`addonId.localId`（例：`base.human`、`era-touhou.sakuya`），分隔符常量 `NS_SEP = "."`
- 文件中存储裸 ID（不含前缀），加载时自动补全，保存时自动剥离
- 跨 addon 引用保留完整 ID（例：action 中引用其他 addon 的 `era-touhou.sakuya`）
- 符号引用不做命名空间处理：`self`、`{{targetId}}`、`{{player}}`

**已实现**：
- `character.py`：`NS_SEP = "."`、`namespace_id()`、`to_local_id()`、`resolve_ref()` 等辅助函数
- 所有 load 函数添加命名空间，所有 save 函数剥离命名空间
- `namespace_character_data()` 解析角色交叉引用（特质、服装、背包、好感度、位置）
- `namespace_action_refs()` 解析行动交叉引用（traitId、itemId、npcId、mapId）
- `state.py`：`_resolve_namespaces()` 在所有定义加载后统一解析
- `main.py`：所有 API 端点使用 `:path` 转换器支持含 `.` 的 ID

---

### Phase 2: 版本分支 ✅ 已完成

**目标**：每个世界编辑自己的 addon 副本，不影响其他世界。消除 `writeTarget` 和 `{worldId}-custom` addon。

**方案**：

当世界启用 addon 时，为该 addon 创建一个世界专属版本分支：

```
addons/base/
  1.0.0/           ← 原始版本（只读模板）
  1.0.0-myworld/   ← myworld 世界的分支（完整复制）
  1.0.0-test/      ← test 世界的分支
```

- 版本命名：`{原始版本}-{worldId}`
- 创建时机：世界启用 addon 时（完整目录复制）
- 用户可选择不创建分支，直接使用已有版本（需警告：修改会影响所有使用该版本的世界）
- addon 栏需要提供快捷切换版本的功能

**world.json 变化**：

```json
// 之前
{
  "addons": [{"id": "base", "version": "1.0.0"}],
  "writeTarget": "my-game-custom",
  "playerCharacter": "player"
}

// 之后
{
  "addons": [{"id": "base", "version": "1.0.0-myworld"}],
  "playerCharacter": "player"
}
```

- 移除 `writeTarget` 字段
- 每个 addon 的版本指向自己的分支
- 不再需要 `{worldId}-custom` addon（对 addon A 的修改直接进入 addon A 的世界版本）

**保存机制变化**：

```
之前: 所有编辑 → 写入 writeTarget addon (custom)
之后: 对 addon A 的编辑 → 写入 addon A 的版本分支目录
      对 addon B 的编辑 → 写入 addon B 的版本分支目录
```

`_persist_entity_files()` 按 `source` 字段分组，写入各自的 addon 目录。

**需要移除**：
- `writeTarget` 字段和相关逻辑 ✅
- `create_custom_addon()` 和 `migrate_world_overlay_to_addon()` ✅
- `get_write_target_dir()`（每个 addon 就是自己的写入目标）✅
- `OVERLAY_SOURCE` ✅

**已实现**：
- `addon_loader.py`：`fork_addon_version()`、`is_world_fork()`、`get_base_version()`、`list_addon_versions()`
- `state.py`：`load_world()` 自动 fork 未分支的 addon，`_persist_entity_files()` 按 source 分组写入
- `state.py`：`save_all()` 替代 `save_to_write_target()`（rebuild + persist all + update world.json + clear dirty）
- `main.py`：移除 `_write_source()`，CRUD 的 source 从 `body.get("source")` 或现有实体获取
- `main.py`：新增 `POST /api/addon/{id}/fork`、`GET /api/addon/{id}/versions`
- `main.py`：移除所有 addon editor API（`/api/addon/{id}/{version}/data` 和 CRUD 端点）
- 前端：`SessionInfo`/`WorldInfo` 移除 `writeTarget`

---

### Phase 3: 编辑器统一 ✅ 部分完成（后端 + 拆除旧 UI）

**目标**：合并世界模式编辑器和 addon 编辑器为统一编辑器，用 tab 区分不同 addon。

**方案**：

```
之前:
  世界模式 (NavBar tab) → 看到所有 addon 合并数据 → 写入 writeTarget
  Addon 编辑 (右侧栏)  → 看到单个 addon + 依赖 → 直接写文件

之后:
  统一编辑器 (NavBar tab) → 用 addon tab 区分 → 写入对应 addon 版本分支
```

编辑器 UI：

```
┌── NavBar ────────────────────────────────────────────┐
│ [W] | 人物 特质 服装 物品 行动 地图 设置 | 世界名 | [A] │
└──────────────────────────────────────────────────────┘

┌── 编辑区 ────────────────────────────────────────────┐
│ Addon Tab: [全部(只读)] [base] [era-touhou]           │ ← addon 切换
├──────────────────────────────────────────────────────┤
│ 当前 addon 的条目列表（可编辑）                        │
│ + [新建] 按钮 → 新实体归属当前选中的 addon              │
└──────────────────────────────────────────────────────┘
```

- 每个 addon tab 显示该 addon 的条目（可编辑）
- "全部" tab 放在最前面，显示合并后的完整数据（只读，用于预览）
- 新建实体时，归属当前选中的 addon tab
- 移除 `AddonEditorPage` 组件和右侧栏的 [编辑] 入口 ✅

**关键决策**：
- 新实体的归属由当前选中的 addon tab 决定，不再需要 writeTarget

**已实现**：
- ✅ 删除 `AddonEditorPage.tsx`
- ✅ `AddonSidebar` 移除 [编辑] 按钮
- ✅ `App.tsx` 移除 `editingAddon` 状态和相关逻辑
- ✅ `api/client.ts` 移除 addon editor CRUD 函数
- ⬜ 编辑器添加 addon tab 切换（[全部(只读)] + 各 addon tab）

---

### Phase 4: 保存流程简化 ✅ 已完成

**目标**：去掉"应用"和"应用并保存"的区分，只保留一个按钮。

**方案**：

```
之前:
  编辑 → dirty=true → [应用世界变更] (内存→内存) 或 [应用并保存] (内存→磁盘)

之后:
  编辑 → dirty=true → [保存变更] (写入磁盘 + 重建角色状态)
```

- 内存缓冲层保留：编辑器中的修改不会立即写磁盘，仍在内存中暂存
- 用户点击 [保存变更] 后：写入磁盘 + rebuild 角色状态 + dirty 清除
- 只有一个按钮，一个操作，减少用户困惑
- `FloatingActions` 简化为单按钮 ✅

**已实现**：
- ✅ `FloatingActions.tsx` 只有 [保存变更] 一个按钮
- ✅ `saveSession()` 合并 rebuild + persist + clear dirty
- ✅ 移除 `POST /api/session/rebuild` 独立端点（`apply-changes` 重定向到 save）

---

## 实施顺序

Phase 2、3、4 是一体的，应该一起实施：

1. Phase 2 去掉 writeTarget → 需要 Phase 3 的 addon tab 来决定新实体归属
2. Phase 3 统一编辑器 → 编辑直接写各 addon → 配合 Phase 4 简化保存流程
3. Phase 4 去掉"应用" → 依赖 Phase 2 的按 addon 分别写入

因此实际实施为一个大阶段，按后端→前端的顺序推进：

### 后端先行
1. 实现版本分支（fork）机制
2. 改造 `_persist_entity_files()` 按 source 分别写入各 addon 目录
3. 移除 writeTarget 相关逻辑
4. 简化保存 API（合并 rebuild + save）

### 前端跟进
5. 编辑器添加 addon tab 切换
6. 移除 AddonEditorPage
7. FloatingActions 简化为单按钮
8. AddonSidebar 添加版本管理（切换/创建版本分支）

## 注意事项

- 内存缓冲层**保留**：用户修改不立即写磁盘，点保存后才写
- 运行时状态（位置、资源、库存、时间）在 rebuild 时保留
- 版本分支是完整目录复制（JSON 文件总量不大）
- 用户可以选择共享版本（不创建分支），但需要警告可能影响其他世界
