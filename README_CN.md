# AaaliceTavern

<p align="center">
  <img src="assets/logo.png" alt="AaaliceTavern Logo" width="120">
</p>

<p align="center">
  <strong>扩展包驱动的文字冒险引擎，LLM 赋能叙事生成</strong>
</p>

<p align="center">
  <a href="#-功能特性">功能特性</a> &middot;
  <a href="#-安装说明">安装说明</a> &middot;
  <a href="#-使用方法">使用方法</a> &middot;
  <a href="#-技术栈">技术栈</a> &middot;
  <a href="#-项目结构">项目结构</a> &middot;
  <a href="#-开发指南">开发指南</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License">
  <img src="https://img.shields.io/badge/python-3.9+-blue?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

无需编程，用可视化编辑器构建完整的文字冒险游戏。告诉内置 AI 助手你想要什么内容，它会帮你创建角色特质、物品和装备；引擎自动处理行动判定、NPC 决策和游戏逻辑；LLM 将每一次交互转化为沉浸式的叙事文本。所有内容打包为扩展包，自由组合搭配，创建独属于你的世界。

---

## &#x1F3AE; 这个引擎做什么

用编辑器创建游戏内容（扩展包），或者让 AI Agent 帮你完成。引擎负责：

- **行动判定与执行** — 条件树（AND/OR/NOT，15+ 条件类型）、多结果分支、消耗/效果/权重修改器，自动判定
- **NPC 自主行为** — NPC 在感知范围内自主决策：寻路、选择行动、与其他角色交互，无需脚本
- **LLM 叙事** — 行动结果 + 角色状态 + 世界书自动组装为 prompt，LLM 生成叙事文本
- **AI 创作助手** — 通过自然语言对话创建和编辑游戏实体（特质、物品、服装等）。Agent 通过工具调用查询 schema、查看已有内容、创建/修改实体 — 所有写操作需用户确认
- **角色模板** — 一套模板定义属性结构（资源、能力、特质、服装槽位），新角色自动继承
- **衍生变量** — 可视化公式编辑器，基于属性/好感度/特质等计算，用于条件判断和权重修改
- **扩展包系统** — 所有内容打包为 addon，支持版本管理、依赖、按世界独立分支

---

## &#x2728; 功能特性

### 创作者

| 分类 | 说明 |
|------|------|
| **可视化编辑器** | 角色、行动、地图、特质、物品、服装、变量、事件、世界书 |
| **条件系统** | 15 种条件类型，嵌套 AND/OR/NOT，执行者/目标角色双视角 |
| **效果系统** | 11 种效果类型（资源/能力/特质/物品/服装/好感度/位置/世界变量），支持百分比和变量引用 |
| **多结果分支** | 成功/失败/暴击等，带权重修改器（基于能力/特质/好感度等） |
| **NPC AI** | 权重控制行动倾向，suggestNext 行为链，感知范围过滤 |
| **服装系统** | 14 槽位、多套预设、遮挡计算、服装效果 |
| **衍生变量** | 9 种步骤类型 + 8 种运算，支持双向角色关系 |
| **世界书** | 关键词触发注入 LLM prompt，类似 SillyTavern Lorebook |
| **LLM 变量** | 40+ 模板变量（角色属性/装备/历史/位置/天气/世界变量等），支持参数化 |
| **事件系统** | 全局条件触发效果，once / on_change / while 三种模式 |
| **特质组** | 互斥/非互斥分组，获得新特质时自动替换同组旧特质 |
| **能力衰减** | 能力经验值随时间自动衰减，可配置速率和间隔 |
| **Prompt Labels** | LLM prompt 文本随 addon 语言变化，支持非中文内容包 |
| **AI 创作助手** | 对话式 AI 助手，通过工具调用创建和编辑实体 — 写操作需用户确认 |

### 玩家

- **多世界** — 不同世界使用不同扩展包组合，互不影响
- **多存档** — 每个世界独立存档槽位
- **换装** — 从预设中选择服装方案
- **LLM 叙事** — 行动自动或手动触发 AI 叙事

---

## &#x1F4E6; 安装说明

**环境要求：** Python 3.9+, Node.js 20.19+

```bash
# 双击 start.bat 即可（或在终端运行）
start.bat
```

首次启动时自动安装所有依赖。

---

## &#x1F680; 使用方法

```bash
# 启动（后端 + 前端）
start.bat

# 停止
stop.bat
```

启动后浏览器打开 `http://localhost:15173`。首次启动自动创建默认世界。

### 界面布局

| 区域 | 功能 |
|------|------|
| **左侧边栏** | 世界管理（创建/切换/删除） |
| **右侧边栏** | 扩展包管理（启用/禁用/版本切换） |
| **顶部导航** | 角色 / 特质 / 服装 / 物品 / 行动 / 地图 / 变量 / 世界书 / LLM / 设置 |
| **底部浮动** | [保存变更] 按钮 |

---

## &#x1F6E0;&#xFE0F; 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.x / FastAPI / uvicorn |
| 前端 | React + TypeScript / Vite |
| 通信 | REST API + SSE |
| 数据 | JSON 文件，无数据库 |

---

## &#x1F4C1; 项目结构

```
addons/{addonId}/              扩展包（所有游戏实体的来源）
  about/                         元数据 + 封面
  assets/                        角色立绘 / 地图背景
  {version}/                     版本目录（实体定义 JSON）

worlds/{worldId}/              世界（配置 + 存档）
  world.json                     引用哪些扩展包
  saves/                         存档槽位

backend/
  game/
    state.py                     GameState 单例
    action/                      行动系统（条件/效果/NPC/事件）
    character/                   角色系统（命名空间/加载/状态构建）
  routes/                        API 路由

frontend/src/
  components/                    编辑器 UI（10 个功能子目录）
  i18n/                          国际化
```

---

## &#x1F4BB; 开发指南

```bash
# 后端热重载
cd backend && python main.py --reload

# 测试（585 tests）
cd backend && python -m pytest tests/ -q

# 后端 lint
cd backend && ruff check game/

# 前端类型检查
cd frontend && npx tsc --noEmit

# 前端 lint
cd frontend && npx eslint src/
```

### 文档

- **技术文档** — [`docs/tech/`](docs/tech/) — 架构、数据结构、算法、API
- **用户文档** — [`docs/user/`](docs/user/) — 编辑器使用指南

---

## &#x1F4C4; 许可证

[GNU Affero General Public License v3.0](LICENSE)

使用本引擎创建的游戏内容（扩展包、世界、存档）不受此协议约束 — 创作者保留其内容的完整权利。
