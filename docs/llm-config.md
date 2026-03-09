# LLM 系统

## 1. 概述

LLM 系统参照 SillyTavern 的设计，分为两部分：**API 连接配置**和**提示词管理**。

核心设计原则：
- **按需触发**：LLM 只在用户主动选择时调用，不是每一步操作都触发 LLM
- **OpenAI 兼容**：API 使用 OpenAI 兼容的 `/chat/completions` 接口，可对接各种后端
- **提示词可编排**：提示词以条目列表形式管理，支持排序、角色分配和条件触发
- **配置化**：所有 API 参数和提示词通过 JSON 配置

## 2. 触发机制

游戏中的操作分为两类：

| 操作类型 | 是否触发 LLM | 示例 |
|---------|-------------|------|
| **普通操作** | 否 | 地图移动、查看属性、装备变更、物品使用 |
| **LLM 操作** | 是，需用户主动选择 | 与 NPC 对话、叙事生成、特定剧情事件 |

用户在操作菜单中选择 LLM 相关的动作时，后端才组装提示词并调用 LLM API。

## 3. API 连接配置

参照 SillyTavern 的 API 配置面板，支持 OpenAI 兼容接口。

### 3.1 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 配置名称（如 "Claude"） |
| `apiType` | `string` | API 类型，固定为 `"chatCompletion"` |
| `apiSource` | `string` | 来源类型（如 `"openaiCompatible"`, `"anthropic"`, `"openai"` 等） |
| `baseUrl` | `string` | API 端点基础 URL |
| `apiKey` | `string` | API 密钥（可选） |
| `model` | `string` | 模型名称 |
| `postProcessing` | `string` | 提示词后处理方式 |
| `parameters` | `object` | 附加参数（temperature, max_tokens 等） |

### 3.2 JSON 配置示例

```json
{
  "apiConnections": [
    {
      "name": "Claude",
      "apiType": "chatCompletion",
      "apiSource": "openaiCompatible",
      "baseUrl": "http://127.0.0.1:8317/v1",
      "apiKey": "",
      "model": "claude-opus-4-6",
      "postProcessing": "mergeConsecutiveSameRole",
      "parameters": {
        "temperature": 0.8,
        "maxTokens": 4096,
        "topP": 1.0,
        "frequencyPenalty": 0,
        "presencePenalty": 0
      }
    }
  ],
  "activeConnection": "Claude"
}
```

### 3.3 连接管理

- 可以配置多个 API 连接（如不同的模型/端点）
- 通过 `activeConnection` 指定当前使用的连接
- 支持连接测试（发送测试消息验证连通性）

## 4. 提示词管理

参照 SillyTavern 的提示词管理器，以有序条目列表的方式管理提示词。

### 4.1 提示词条目

每个提示词条目是发送给 LLM 的消息链中的一个片段。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 条目唯一标识符 |
| `name` | `string` | 条目名称 |
| `enabled` | `boolean` | 是否启用 |
| `role` | `"system" \| "user" \| "assistant"` | 消息角色 |
| `content` | `string` | 提示词内容，支持变量插值 |
| `position` | `number` | 排序位置（数值越小越靠前） |
| `trigger` | `string?` | 触发条件（可选，不设置则始终包含） |

### 4.2 消息角色

| 角色 | 说明 |
|------|------|
| `system` | 系统提示词，用于设定 LLM 的行为规则 |
| `user` | 用户消息，代表玩家的输入 |
| `assistant` | AI 助手消息，预填 LLM 的回复开头或引导格式 |

### 4.3 变量插值

提示词内容中可以使用 `{{变量名}}` 语法插入动态游戏状态：

| 变量 | 说明 |
|------|------|
| `{{playerName}}` | 玩家名称 |
| `{{playerInfo}}` | 玩家完整状态信息 |
| `{{npcName}}` | 当前交互的 NPC 名称 |
| `{{npcInfo}}` | 当前交互的 NPC 完整状态信息 |
| `{{location}}` | 当前位置名称 |
| `{{mapName}}` | 当前地图名称 |
| `{{chatHistory}}` | 对话历史 |
| `{{clothingState}}` | 角色服装状态 |
| `{{custom:xxx}}` | 自定义变量 |

### 4.4 触发条件

`trigger` 字段用于控制某些提示词条目只在特定场景下包含：

| 触发条件 | 说明 |
|---------|------|
| `null` / 不设置 | 始终包含（默认） |
| `"dialogue"` | 仅在对话场景下包含 |
| `"narrative"` | 仅在叙事生成时包含 |
| `"action"` | 仅在行动描述时包含 |
| 自定义字符串 | 可扩展的自定义触发类型 |

### 4.5 JSON 配置示例

```json
{
  "promptEntries": [
    {
      "id": "system-base",
      "name": "基础系统提示",
      "enabled": true,
      "role": "system",
      "content": "你是一个角色扮演游戏的叙事AI。你需要根据游戏状态生成沉浸式的文本描述。",
      "position": 0,
      "trigger": null
    },
    {
      "id": "world-setting",
      "name": "世界观设定",
      "enabled": true,
      "role": "system",
      "content": "游戏世界设定：幻想乡是一个被大结界包围的隐秘世界...",
      "position": 1,
      "trigger": null
    },
    {
      "id": "npc-character",
      "name": "NPC角色设定",
      "enabled": true,
      "role": "system",
      "content": "你现在扮演的角色是{{npcName}}。\n角色信息：\n{{npcInfo}}",
      "position": 2,
      "trigger": "dialogue"
    },
    {
      "id": "game-state",
      "name": "当前游戏状态",
      "enabled": true,
      "role": "system",
      "content": "当前位置：{{location}}（{{mapName}}）\n玩家状态：\n{{playerInfo}}\n服装状态：\n{{clothingState}}",
      "position": 3,
      "trigger": null
    },
    {
      "id": "output-format",
      "name": "输出格式",
      "enabled": true,
      "role": "system",
      "content": "请以第三人称视角描述场景。对话用「」包裹。动作和心理描写用*斜体*标注。",
      "position": 4,
      "trigger": null
    },
    {
      "id": "chat-history",
      "name": "对话历史",
      "enabled": true,
      "role": "system",
      "content": "以下是之前的对话记录：\n{{chatHistory}}",
      "position": 5,
      "trigger": "dialogue"
    },
    {
      "id": "user-input",
      "name": "玩家输入",
      "enabled": true,
      "role": "user",
      "content": "{{userMessage}}",
      "position": 100,
      "trigger": null
    },
    {
      "id": "assistant-prefill",
      "name": "助手预填充",
      "enabled": true,
      "role": "assistant",
      "content": "好的，我理解了当前的状态。让我来描述接下来发生的事情：\n",
      "position": 101,
      "trigger": null
    }
  ]
}
```

## 5. 消息组装流程

当用户触发 LLM 调用时，后端按以下流程组装消息链：

```
1. 筛选：根据当前场景的触发类型，筛选出 enabled=true 且 trigger 匹配的条目
2. 排序：按 position 字段升序排列
3. 变量替换：将 {{变量}} 替换为当前游戏状态的实际值
4. 后处理：根据 postProcessing 配置处理消息链
   - mergeConsecutiveSameRole：合并相同角色的连续消息
5. 发送：将组装好的消息链发送给 LLM API
6. 接收：流式接收 LLM 响应，推送给前端显示
```

## 6. 后处理选项

| 选项 | 说明 |
|------|------|
| `mergeConsecutiveSameRole` | 合并相同角色的连续发言 |
| `none` | 不做任何处理 |

## 7. LLM 的职责边界

LLM 在本系统中是**纯文本增强层**，不参与游戏逻辑：

| 方面 | 说明 |
|------|------|
| **LLM 负责** | 接收当前游戏状态和基础游戏文本，返回更丰富、更沉浸的文本描述 |
| **LLM 不负责** | 属性变化、移动判定、服装状态变更等一切游戏逻辑 |

```
游戏逻辑（后端）                    LLM
─────────────                    ─────
计算行动结果
生成基础文本（如"你向咲夜搭话"）
属性变化（亲密 +500）
  ↓
将游戏状态 + 基础文本 → 发送给 LLM → 返回丰富的叙事文本
  ↓
更新状态，展示 LLM 文本
```

## 8. 对话历史管理

对话历史按 NPC **分别存储**。与咲夜的对话历史和其他 NPC 的对话历史相互独立。

| 字段 | 说明 |
|------|------|
| 存储 | 按 NPC ID 分别存储 |
| 上下文窗口 | 可配置保留的最近 N 轮对话 |
| 清除 | 支持手动清除指定 NPC 的对话历史 |

## 9. JSON 配置格式总览

LLM 系统的完整配置由两个部分组成：

```json
{
  "api": {
    "connections": [...],
    "activeConnection": "Claude"
  },
  "prompts": {
    "entries": [...]
  },
  "history": {
    "maxTurns": 20
  }
}
```

## 10. 后端职责

| 职责 | 说明 |
|------|------|
| **配置加载** | 读取 API 和提示词 JSON 配置 |
| **消息组装** | 根据场景筛选提示词条目，替换变量，组装消息链 |
| **API 调用** | 向配置的 LLM 端点发送请求 |
| **流式传输** | 通过 WebSocket 将 LLM 响应流式推送给前端 |
| **历史管理** | 存储和管理对话历史 |
| **连接测试** | 验证 API 连接有效性 |

## 11. 前端职责

| 职责 | 说明 |
|------|------|
| **触发入口** | 在操作菜单中提供 LLM 相关操作选项（对话、叙事等） |
| **流式显示** | 接收后端推送的 LLM 流式响应，实时渲染文本 |
| **配置界面** | 提供 API 配置和提示词管理的 UI |
| **对话输入** | 提供用户输入文本的界面 |
