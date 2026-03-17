# LLM 叙事增强系统

## 相关文件

| 文件 | 职责 |
|------|------|
| `backend/game/llm_preset.py` | 预设文件 CRUD（list/load/save/delete） |
| `backend/game/llm_engine.py` | 变量收集、提示词组装、LLM API 调用 |
| `backend/main.py` | REST API 端点（`/api/llm/*`） |
| `frontend/src/components/LLMPresetManager.tsx` | LLM 设置页（预设管理 + 全局设置 + 调试日志） |
| `frontend/src/components/LLMDebugPanel.tsx` | LLM 调试控制台（请求/响应/变量/token） |
| `frontend/src/components/NarrativePanel.tsx` | 游戏输出区（原始输出 + LLM 叙事） |
| `frontend/src/components/SettingsPage.tsx` | 世界设置（存档 + 世界级 LLM 预设） |
| `frontend/src/components/ActionEditor.tsx` | 行动级 LLM 预设选择 |

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

独立于 addon/world，存储在项目根目录：

```
llm-presets/
  narrative-v1/
    preset.json
  dramatic/
    preset.json
```

### 预设结构 (`preset.json`)

```typescript
interface LLMPreset {
  id: string;                    // 预设 ID（= 文件夹名）
  name: string;                  // 显示名称
  description: string;           // 描述
  api: {
    apiType: "chatCompletion";   // 固定
    apiSource: "openaiCompatible";
    baseUrl: string;             // API 端点 URL（如 http://127.0.0.1:8317/v1）
    apiKey: string;              // API 密钥（可空）
    model: string;               // 模型名称
    streaming: boolean;          // 是否流式输出
    postProcessing: "mergeConsecutiveSameRole" | "none";
    parameters: {
      temperature: number;       // 默认 0.8
      maxTokens: number;         // 默认 4096
      topP: number;              // 默认 1.0
      frequencyPenalty: number;  // 默认 0
      presencePenalty: number;   // 默认 0
    };
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

## 前端架构

### LLM 设置页 (`LLMPresetManager.tsx`)

从 NavBar [LLM设置] tab 进入（全局级）。包含三个子 tab：

- **[预设管理]**：预设列表，点击进入编辑
  - 编辑视图：基本信息、API 配置、提示词条目、可用变量面板（含层级分组+参数说明）
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
