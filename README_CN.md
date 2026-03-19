# AI Tavern Game

> **[English](README.md)**

JSON 数据驱动的文字冒险游戏引擎。

不写代码，用可视化编辑器定义角色、行动、地图、特质、物品 — 引擎处理所有逻辑。接入 LLM 后，游戏事件自动转化为叙事文本。

[功能特性](#功能特性) · [安装说明](#安装说明) · [使用方法](#使用方法) · [技术栈](#技术栈) · [项目结构](#项目结构) · [开发指南](#开发指南)

---

## 这个引擎做什么

用编辑器创建游戏内容（扩展包），引擎负责：

- **行动判定与执行** — 条件树（AND/OR/NOT，15+ 条件类型）、多结果分支、消耗/效果/权重修改器，自动判定
- **NPC 自主行为** — NPC 在感知范围内自主决策：寻路、选择行动、与其他角色交互，无需脚本
- **LLM 叙事** — 行动结果 + 角色状态 + 世界书自动组装为 prompt，LLM 生成叙事文本
- **角色模板** — 一套模板定义属性结构（资源、能力、特质、服装槽位），新角色自动继承
- **衍生变量** — 可视化公式编辑器，基于属性/好感度/特质等计算，用于条件判断和权重修改
- **扩展包系统** — 所有内容打包为 addon，支持版本管理、依赖、按世界独立分支

## 功能特性

**创作者：**

- 全可视化编辑器 — 角色 / 行动 / 地图 / 特质 / 物品 / 服装 / 变量 / 事件 / 世界书
- 条件系统 — 15 种条件类型，嵌套 AND/OR/NOT，执行者/目标角色双视角
- 效果系统 — 11 种效果类型（资源/能力/特质/物品/服装/好感度/位置/世界变量），支持百分比和变量引用
- 多结果分支 — 成功/失败/暴击等，带权重修改器（基于能力/特质/好感度等）
- NPC 权重 — 控制 NPC 行动倾向，suggestNext 行为链引导后续行为
- 服装系统 — 14 槽位、多套预设、遮挡计算、服装效果
- 衍生变量 — 9 种步骤类型 + 8 种运算，支持双向角色关系（如「关系强度 = 双方好感度之和」）
- 世界书 — 关键词触发注入 LLM prompt，类似 SillyTavern Lorebook
- LLM 变量 — 40+ 模板变量（角色属性/装备/历史/位置/天气/世界变量等），支持参数化
- 能力衰减 — 能力经验值随时间自动衰减，可配置速率和间隔
- 事件系统 — 全局条件触发效果，once / on_change / while 三种模式
- 特质组 — 互斥/非互斥分组，获得新特质时自动替换同组旧特质
- promptLabels — LLM prompt 文本随 addon 语言变化，支持非中文内容包

**玩家：**

- 多世界 — 不同世界使用不同扩展包组合，互不影响
- 多存档 — 每个世界独立存档槽位
- 换装 — 从预设中选择服装方案
- LLM 叙事 — 行动自动或手动触发 AI 叙事

## 安装说明

**环境要求：** Python 3.9+, Node.js 18+

```bash
# 1. 安装后端依赖
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt

# 2. 安装前端依赖
cd ../frontend
npm install
```

## 使用方法

```bash
# 启动（后端 + 前端）
start.bat

# 停止
stop.bat
```

启动后浏览器打开 `http://localhost:15173`。首次启动自动创建默认世界。

**界面布局：**
- **左侧边栏** — 世界管理（创建/切换/删除）
- **右侧边栏** — 扩展包管理（启用/禁用/版本切换）
- **顶部导航** — 角色 / 特质 / 服装 / 物品 / 行动 / 地图 / 变量 / 世界书 / LLM / 设置
- **底部浮动** — [保存变更] 按钮

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.x / FastAPI / uvicorn |
| 前端 | React + TypeScript / Vite |
| 通信 | REST API + SSE |
| 数据 | JSON 文件，无数据库 |

## 项目结构

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

## 开发指南

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

## 文档

- **技术文档** — [`docs/tech/`](docs/tech/) — 架构、数据结构、算法、API
- **用户文档** — [`docs/user/`](docs/user/) — 编辑器使用指南

## 许可证

[GNU Affero General Public License v3.0](LICENSE)

使用本引擎创建的游戏内容（扩展包、世界、存档）不受此协议约束 — 创作者保留其内容的完整权利。
