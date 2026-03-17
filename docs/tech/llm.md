# LLM 叙事增强系统

## 相关文件

| 文件 | 职责 |
|------|------|
| `backend/game/llm_preset.py` | 预设文件 CRUD（list/load/save/delete） |
| `backend/game/llm_engine.py` | 变量收集、提示词组装、LLM API 调用 |
| `backend/main.py` | REST API 端点（`/api/llm/*`） |
| `frontend/src/components/LLMPresetManager.tsx` | 预设管理页面（列表 + 编辑） |
| `frontend/src/components/NarrativePanel.tsx` | 游戏输出区（原始输出 + LLM 叙事） |
| `frontend/src/components/SettingsPage.tsx` | 全局/世界级默认预设设置 |
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

| 变量 | 来源 | 说明 |
|------|------|------|
| `{{rawOutput}}` | action result | 当前 tick 所有可见输出 |
| `{{playerName}}` | characters[player] | 玩家名称 |
| `{{playerInfo}}` | characters[player] | 资源、特征、能力、物品、好感度 |
| `{{targetName}}` | characters[target] | 目标角色名称 |
| `{{targetInfo}}` | characters[target] | 目标完整状态 |
| `{{clothingState}}` | characters[player] | 穿着状态（槽位 + 衣物名） |
| `{{location}}` | maps + position | 当前 cell 名称 |
| `{{mapName}}` | maps | 当前地图名称 |
| `{{time}}` | GameTime.to_dict() | 游戏时间（displayText） |
| `{{weather}}` | GameTime | 天气（图标 + 名称） |

## 消息组装流程

`llm_engine.py: assemble_messages()`

1. 筛选 `enabled: true` 的提示词条目
2. 按 `position` 升序排列
3. `{{变量}}` 替换为实际值
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
  "targetId": "base.npc1",       // 可选
  "presetId": "narrative-v1"     // 可选，空则按优先级解析
}
```

**SSE 事件**：

```
event: llm_chunk
data: {"text": "你走近"}

event: llm_chunk
data: {"text": "正在整理"}

event: llm_done
data: {"fullText": "你走近正在整理书架的夏..."}

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

### 预设管理页 (`LLMPresetManager.tsx`)

从 NavBar [LLM] tab 进入。独立于 addon 系统（无 AddonTabBar）。

- **列表视图**：所有预设，点击进入编辑
- **编辑视图**：
  - 基本信息（ID、名称、描述）
  - API 配置（URL、Key、Model、streaming、后处理、生成参数）
  - [获取模型] + [测试连接]
  - 提示词条目列表（折叠/展开、▲▼ 排序、enabled 开关）
  - 可用变量面板（点击插入到光标位置）

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
