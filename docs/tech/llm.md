# LLM 系统

本项目的 LLM 集成分为两个独立功能：**叙事增强**（游戏内文本美化）和 **AI 创作助手**（Agent 辅助内容创作）。

## 相关文件

### 共享基础

| 文件 | 职责 |
|------|------|
| `backend/game/llm_preset.py` | 预设文件 CRUD（list/load/save/delete），preset.type: narrative / assist |
| `backend/game/llm_provider.py` | API 服务文件 CRUD（list/load/save/delete） |
| `backend/game/llm_engine.py` | LLM API 调用（`call_llm_streaming`，支持 tools 参数 + tool_calls 流式解析） |
| `backend/routes/llm.py` | REST API 端点（`/api/llm/*`） |
| `frontend/src/components/llm/LLMPresetManager.tsx` | LLM 设置页（预设管理 + 接口管理 + 全局设置 + 调试日志） |
| `frontend/src/components/llm/LLMDebugPanel.tsx` | LLM 调试控制台（请求/响应/变量/token） |

### 叙事增强

| 文件 | 职责 |
|------|------|
| `frontend/src/components/llm/NarrativePanel.tsx` | 游戏输出区（原始输出 + LLM 叙事） |
| `frontend/src/components/settings/SettingsPage.tsx` | 世界设置（存档 + 世界级 LLM 预设） |
| `frontend/src/components/action/ActionEditor.tsx` | 行动级 LLM 预设选择 |

### AI 创作助手

| 文件 | 职责 |
|------|------|
| `backend/game/ai_assist.py` | Agent 核心：schema 注册表、工具定义/执行、上下文收集、引用校验 |
| `backend/data/ai_docs/*.md` | 实体文档（get_schema 工具返回内容 + 动态枚举值） |
| `frontend/src/api/aiAssist.ts` | SSE 通信层（streamAssistChat、confirmToolCall、deleteSession） |
| `frontend/src/components/ai/AiDrawer.tsx` | 右侧对话面板（消息列表、流式显示、think 块、[+] 新建会话） |
| `frontend/src/components/ai/EntityCard.tsx` | 实体预览卡片（可编辑 JSON、confirm/reject 按钮） |
| `frontend/src/components/ai/ToolCallMessage.tsx` | 工具调用渲染（只读折叠、写操作卡片、批量 checkbox） |

## 概述

LLM 是**纯文本增强层**——接收模板渲染的基础文本 + 游戏状态，通过 OpenAI 兼容 API 生成沉浸式叙事。不参与游戏逻辑。

```
游戏逻辑（action 执行）
  → 收集可见输出（rawOutput）
  → 按预设编排组装 prompt（插入变量）
  → 一次 /chat/completions 调用
  → 返回丰富叙事文本
  → 前端并列展示：原始输出 + LLM 叙事
```

## 预设系统

### 存储

独立于 addon/world，存储在用户目录：

```
user/
  llm-providers/
    local-llama.json             API 服务配置（含 URL、Key、模型）
    openai.json
  llm-presets/
    narrative-v1/
      preset.json                预设（引用 provider + 提示词条目）
    dramatic/
      preset.json
```

### API 服务（Provider）

API 凭据与预设分离存储，预设通过 `providerId` 引用。

```typescript
interface LLMProvider {
  id: string;                    // 服务 ID（= 文件名）
  name: string;                  // 显示名称
  apiType: "chatCompletion";     // 固定
  apiSource: "openaiCompatible";
  baseUrl: string;               // API 端点 URL（如 http://127.0.0.1:8317/v1）
  apiKey: string;                // API 密钥（可空）
  model: string;                 // 模型名称
  streaming: boolean;            // 是否流式输出
}
```

### 预设结构 (`preset.json`)

```typescript
interface LLMPreset {
  id: string;                    // 预设 ID（= 文件夹名）
  name: string;                  // 显示名称
  description: string;           // 描述
  providerId: string;            // 引用的 API 服务 ID
  postProcessing: "mergeConsecutiveSameRole" | "none";
  parameters: {
    temperature: number;         // 默认 0.8
    maxTokens: number;           // 默认 4096
    topP: number;                // 默认 1.0
    frequencyPenalty: number;    // 默认 0
    presencePenalty: number;     // 默认 0
  };
  promptEntries: PromptEntry[];
}

interface PromptEntry {
  id: string;
  name: string;
  enabled: boolean;
  role: "system" | "user" | "assistant";
  content: string;               // 支持 {{变量}} 插值
  position: number;              // 排序位置（小 → 前）
}
```

### 向后兼容

旧预设（内嵌 `api` 块，无 `providerId`）在生成时自动 fallback 到内嵌配置。
前端加载时自动提取 `api.parameters` 和 `api.postProcessing` 到顶级字段。

### 预设解析优先级

```
action.llmPreset → world.json.llmPreset → config.json.defaultLlmPreset → 不调用
```

## 变量系统

提示词 `content` 中使用 `{{变量名}}` 插值，发送前替换为实际值。
支持 `.` 分隔的层级路径和 `:key=val` 参数化语法。单遍替换，无递归。

### 行动上下文
| 变量 | 说明 |
|------|------|
| `{{rawOutput}}` | 行动原始输出 = 描述 + 效果摘要 + NPC日志 |
| `{{action.name}}` | 行动名称 |
| `{{action.description}}` | 行动描述 |
| `{{action.category}}` | 行动分类 |

### 玩家 / 目标角色（`player.*` / `target.*` 对称）
| 变量 | 说明 |
|------|------|
| `{{player}}` | 完整角色摘要 |
| `{{player.name}}` | 名称 |
| `{{player.money}}` | 金钱 |
| `{{player.resources}}` | 资源状态 |
| `{{player.traits}}` | 特质（含描述） |
| `{{player.traits.names}}` | 特质名称列表（省 token） |
| `{{player.abilities}}` | 能力等级 |
| `{{player.experiences}}` | 经验记录 |
| `{{player.clothing}}` | 穿着简洁列表 |
| `{{player.clothing.detail}}` | 穿着详细（描述/效果/遮挡） |
| `{{player.outfit}}` | 当前预设名 |
| `{{player.inventory}}` | 物品列表 |
| `{{player.inventory.detail}}` | 物品详细（含描述） |
| `{{player.favorability}}` | 好感度 |
| `{{player.variables}}` | 角色自定义变量 |
| `{{player.llm}}` | LLM 描述全部字段（`字段名: 内容`） |
| `{{player.llm.xxx}}` | LLM 描述单个字段（如 `player.llm.personality`） |

### 世界书
| 变量 | 说明 |
|------|------|
| `{{lorebook}}` | 关键词命中的世界书条目内容（自动匹配，按优先级排序） |

### 场景
| 变量 | 说明 |
|------|------|
| `{{location}}` / `{{location.description}}` / `{{location.neighbors}}` | 区格 |
| `{{mapName}}` / `{{mapName.description}}` | 地图 |
| `{{time}}` / `{{weather}}` | 时间天气 |
| `{{npcsHere}}` | 同区格 NPC + 活动 |
| `{{npcsNearby}}` | 感知范围 NPC + 位置 |
| `{{worldVars}}` | 全部世界变量 |
| `{{worldVar.xxx}}` | 单个世界变量 |

### 历史上下文（参数化）
| 变量 | 参数 | 默认 | 说明 |
|------|------|------|------|
| `{{recentActions:count=N}}` | count | 5 | 近期行动摘要 |
| `{{recentNpcActivity:count=N}}` | count | 10 | 感知范围 NPC 近期行为 |
| `{{previousNarrative:count=N}}` | count | 1 | 之前的 LLM 叙事（前端传入） |

### 兼容别名
`playerName`→`player.name`, `playerInfo`→`player`, `clothingState`→`player.clothing`,
`targetName`→`target.name`, `targetInfo`→`target`

## 消息组装流程

`llm_engine.py: assemble_messages(preset, variables, game_state, context)`

1. 筛选 `enabled: true` 的提示词条目
2. 按 `position` 升序排列
3. `{{变量}}` 替换：先查静态变量表，未命中则调用 `_resolve_dynamic` 处理参数化变量
4. 空内容的 assistant 条目跳过
5. 后处理：`mergeConsecutiveSameRole` 合并相邻同 role 消息（用 `\n\n` 连接）
6. 返回 `[{role, content}]` 消息列表

## API 端点

### API 服务 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm/providers` | 列出所有 API 服务 `{providers: [{id, name}]}` |
| GET | `/api/llm/providers/{id}` | 获取完整配置 `{provider: LLMProvider}` |
| PUT | `/api/llm/providers/{id}` | 创建或更新 |
| DELETE | `/api/llm/providers/{id}` | 删除 |

### 预设 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm/presets` | 列出所有预设 `{presets: [{id, name, description}]}` |
| GET | `/api/llm/presets/{id}` | 获取完整预设 `{preset: LLMPreset}` |
| PUT | `/api/llm/presets/{id}` | 创建或更新预设 |
| DELETE | `/api/llm/presets/{id}` | 删除预设 |

### 辅助

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm/models?base_url=...&api_key=...` | 代理获取模型列表（`/v1/models`） |
| POST | `/api/llm/test` | 测试连接（发送最小 chat completion 请求） |

### 生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/llm/generate` | 触发 LLM 生成，返回 SSE 流 |

**`POST /api/llm/generate` 请求体**：

```json
{
  "rawOutput": "行动结果文本...",
  "targetId": "base.npc1",              // 可选
  "presetId": "narrative-v1",           // 可选，空则按优先级解析
  "actionId": "base.gather",            // 可选，行动上下文
  "previousNarratives": ["上一次的叙事文本..."]  // 可选，前端传入
}
```

**SSE 事件**：

```
event: llm_debug
data: {"presetId":"...", "model":"...", "messages":[...], "variables":{...}}

event: llm_chunk
data: {"text": "你走近"}

event: llm_done
data: {"fullText": "你走近正在整理书架的夏...", "usage": {"prompt_tokens":100, "completion_tokens":50}}

event: llm_error
data: {"error": "LLM_API_ERROR", "detail": "HTTP 401: ..."}
```

### 设置

| 方法 | 路径 | 字段 | 说明 |
|------|------|------|------|
| GET/PUT | `/api/config` | `defaultLlmPreset` | 全局默认预设 |
| PUT | `/api/worlds/{id}/meta` | `llmPreset` | 世界级默认预设 |
| GET | `/api/session` | `llmPreset` | 当前世界的预设设置 |

## 触发机制

### 自动触发

Action 定义中 `triggerLLM: true` → 玩家执行后自动调用 LLM。
前端通过 action result 的 `triggerLLM` 字段判断。

### 手动触发

任何 action 执行后，输出区显示 `[LLM 生成]` 按钮，玩家可手动触发。

### 触发范围

一个 tick 的所有可见输出（`rawOutput`）= 玩家 action 结果 + effectsSummary + 感知范围内 NPC 行为。
打包为一次 API call。

### 可见范围

通过 `sense_matrix` 判定（`filter_visible_npc_log`）：
- 感知范围内（≤60 分钟距离，respects senseBlocked 连接）的 NPC 行为均可见
- 不区分距离远近，统一完整显示

## 世界书系统 (Lorebook)

### 存储

世界书条目存储在 addon 版本目录中：`addons/{addonId}/{version}/lorebook.json`

加载时按 addon 加载顺序合并（后加载的覆盖先加载的），与其他实体一致。

### 数据结构

```typescript
interface LorebookEntry {
  id: string;                           // 命名空间 ID (addonId.localId)
  name: string;                         // 条目名称
  keywords: string[];                   // 关键词列表（用于匹配）
  content: string;                      // 条目内容（插入 prompt）
  enabled: boolean;                     // 是否启用
  priority: number;                     // 优先级（高优先级排前面）
  insertMode: "keyword" | "always";     // 触发模式
  source: string;                       // 来源 addon (addonId.version)
}
```

### 关键词匹配 (`llm_engine.py: _format_lorebook`)

1. 构建扫描文本：`rawOutput` + `player.name` + `target.name` + `location` + `mapName`
2. 对每个启用的条目：
   - `insertMode: "always"` → 始终命中
   - `insertMode: "keyword"` → 任一关键词（不区分大小写）出现在扫描文本中则命中
3. 命中条目按 `priority` 降序排列
4. 用 `\n---\n` 连接所有命中条目的 content
5. 结果存入 `{{lorebook}}` 变量

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/game/lorebook` | 获取所有世界书条目 |
| POST | `/api/game/lorebook` | 创建条目 |
| PUT | `/api/game/lorebook/{entry_id:path}` | 更新条目 |
| DELETE | `/api/game/lorebook/{entry_id:path}` | 删除条目 |

## 角色 LLM 描述

角色数据中可包含 `llm` 字段，存储专供 LLM 使用的描述文本（如 personality、appearance 等）。

```typescript
interface CharacterData {
  // ... 其他字段
  llm?: Record<string, string>;  // 自定义键值对（如 { personality: "...", appearance: "..." }）
}
```

### 变量映射

| 变量 | 内容 |
|------|------|
| `{{player.llm}}` | 所有 LLM 描述字段组合（`字段名: 内容` 格式，换行分隔） |
| `{{player.llm.xxx}}` | 单个字段值（如 `{{player.llm.personality}}`） |
| `{{target.llm}}` / `{{target.llm.xxx}}` | 目标角色的对应字段 |

`_format_char_llm(char)` 将 `llm` dict 格式化为 `key: value` 的多行文本。
`_collect_char_variables()` 同时注册每个独立字段为 `{prefix}.llm.{key}` 变量。

## 前端架构

### LLM 设置页 (`LLMPresetManager.tsx`)

从 NavBar [LLM设置] tab 进入（全局级）。包含四个子 tab：

- **[预设管理]**：预设列表，点击进入编辑
  - 编辑视图：基本信息、API 服务下拉选择、生成参数、后处理、提示词条目、可用变量面板
- **[接口管理]**：API 服务列表，点击进入编辑
  - 编辑视图：ID、名称、API URL、API Key、模型（获取/手动输入）、流式输出、测试连接
- **[全局设置]**：全局默认 LLM 预设选择
- **[调试日志]**：`LLMDebugPanel` — terminal 风格调试面板，显示每次 LLM 调用的预设/模型/变量/消息/响应/token 用量

### 游戏输出区 (`NarrativePanel.tsx`)

```
┌─────────────────────────┐
│ > 行动结果文本           │
│ > NPC 行为日志           │
│                         │
│        [LLM 生成]        │  ← triggerLLM=false 时
├─────────────────────────┤
│ [LLM 叙事]    [重新生成]  │  ← 生成完成后
│ 流式文本逐 token 显示... │
└─────────────────────────┘
```

- 流式显示：`fetch` + `ReadableStream` 解析 SSE
- 自动触发：`triggerLLM: true` 时自动开始
- 错误处理：显示详情 + [重试] 按钮

### 世界书管理 (`LorebookManager.tsx`)

从 AddonTabBar 世界级 tab 进入。列表 + 编辑两栏布局：

- 条目列表：显示名称、启用状态、关键词数量
- 编辑视图：ID、名称、关键词（标签输入）、内容（多行文本）、触发模式（keyword/always）、优先级、启用开关

---

## AI 创作助手（Agent）

### 概述

AI 创作助手是一个 **受限 Agent**：通过 function calling 协议让 LLM 调用工具（查询/创建/修改实体），写操作需用户确认（Human-in-the-Loop）。

```
用户发消息 → 组装 messages + tools → LLM API
  → 纯文本回复 → 流式返回 → 结束
  → tool_calls → 只读工具自动执行 → 结果返回 LLM → 循环
                → 写操作工具 → 暂停等用户确认 → 确认/拒绝 → 结果记入历史
```

### 预设类型

preset 通过 `type` 字段区分：

| type | 用途 | promptEntries | 特殊条目 |
|------|------|--------------|---------|
| `narrative` | 游戏叙事 | 支持 `{{variable}}` 模板插值 | 无 |
| `assist` | AI 创作助手 | 纯文本，不支持变量插值 | 内置「实体上下文」条目（不可删除，动态填充） |

config.json 的 `aiAssistPresetId` 指定全局 AI 辅助预设。

### 工具定义 (`ai_assist.py`)

| 工具 | 参数 | 安全级别 | 说明 |
|------|------|---------|------|
| `list_entities` | entityType, filter? | 只读（自动执行） | 查询实体列表，filter 支持子串匹配 |
| `get_schema` | entityType | 只读（自动执行） | 返回 ai_docs/ 文档 + 动态枚举值 |
| `create_entity` | entityType, entity | 写（需确认） | 创建单个实体 |
| `batch_create` | entityType, entities[] | 写（需确认） | 批量创建，前端 checkbox 选择性确认 |
| `update_entity` | entityType, entityId, fields | 写（需确认） | 修改已有实体的部分字段 |

可操作的实体类型：item, trait, clothing, traitGroup（写）+ variable（只读）。

### 校验系统

数据驱动的引用校验（`_REF_RULES`），不硬编码字段名：

```python
_REF_RULES = [
    ("trait", "category", "template.traits[].key"),
    ("clothing", "slots[]", "template.clothingSlots"),
    ("trait", "effects[].target", "effect_targets"),  # variables + ability traits + basicInfo
    ("traitGroup", "traits[]", "trait_defs"),
    ...
]
```

支持三种字段模式：单值、数组元素、对象数组子字段。

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/llm/assist-chat` | POST | Agent Loop (SSE)：流式文本 + 工具调用 |
| `/api/llm/assist-confirm-tool` | POST | 确认/拒绝写操作，支持 overrideArgs（用户编辑 JSON） |
| `/api/llm/assist-session/{id}` | DELETE | 清理 session |

SSE 事件类型：`llm_chunk`, `llm_done`, `llm_error`, `tool_call_pending`, `tool_call_result`, `llm_debug`, `llm_usage`

### Session 管理

- 内存存储（`_assist_sessions` dict），不持久化
- 生命周期：NavBar [AI] 打开 → 使用中 → [+] 新建清空 → 页面刷新释放
- 无超时机制（只要页面存在 session 就在）

### 前端架构

- **AiDrawer**：右侧抽屉，NavBar [AI] toggle 控制，与 AddonSidebar 互斥
- **EntityCard**：pending 状态可编辑 JSON（textarea + 实时校验），已确认状态只读
- **ToolCallMessage**：只读工具折叠显示，写操作显示卡片 + 确认按钮
- **BatchCreateToolCall**：checkbox 选择性确认，编辑后数据通过 overrideArgs 传递
- **Think 块**：检测 `<think>` 标签，流式时展开，完成后折叠可点击展开
