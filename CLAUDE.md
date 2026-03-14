# AI Tavern Game — Project Instructions

## Project Overview

基于 JSON 数据驱动的文字冒险游戏引擎。后端 Python/FastAPI，前端 React/TypeScript。
所有游戏实体（角色、地图、行动等）定义在扩展包(addon)中，世界(world)仅存配置和存档。

## Tech Stack

- Backend: Python 3.x / FastAPI / uvicorn
- Frontend: React + TypeScript / Vite
- Data: JSON files, no database
- Ports: defined in root `config.json`

## Project Structure

```
addons/{addonId}/
  about/                  共享元数据 (meta.json, covers/)
  assets/                 共享资产 (characters/, backgrounds/)
  {version}/              版本目录 (addon.json + entity JSON files)

worlds/{worldId}/
  world.json              世界配置
  about/                  世界资产 (covers/)
  saves/                  存档槽位

backend/
  main.py                 FastAPI 入口
  game/                   核心逻辑 (state.py, addon_loader.py, character.py, action.py, map_engine.py)
  data/character_template.json

frontend/src/
  api/client.ts           API 客户端
  components/             React 组件
  types/game.ts           TypeScript 类型定义

docs/
  user/                   用户文档（中文）
  tech/                   技术文档（中英混合）

plan/                     开发计划（仅本地，已 gitignore）
```

## Coding Conventions

### Python (backend/)
- `from __future__ import annotations` in all files
- `Optional[T]` not `T | None` (Python 3.9 compat)
- FastAPI path params use `:path` converter for dotted IDs
- GameState is a singleton

### TypeScript (frontend/)
- Inline styles using theme object `T` (from `src/theme.ts`)
- Action buttons use `[方括号]` style: `[保存]`, `[删除]`
- Sub-panels use `borderLeft: 2px solid ${T.accent}` pattern
- Overlay pattern for modals (not native dialogs)

### ID Namespacing
- Format: `addonId.localId` (separator `.`)
- JSON files store bare IDs; namespace applied on load, stripped on save
- `SYMBOLIC_REFS = {"self", "{{targetId}}", "{{player}}", ""}` — never namespaced

### Asset Storage
- Addon covers: `addons/{addonId}/about/covers/`
- World covers: `worlds/{worldId}/about/covers/`
- Character portraits: `addons/{addonId}/assets/characters/`
- Map backgrounds: `addons/{addonId}/assets/backgrounds/`
- Serve URL: `/assets/{addonId}/...` or `/assets/world/{worldId}/...`

### Addon Shared vs Version-specific
- Shared (in `about/meta.json`): name, description, author, cover, categories
- Version-specific (in `{version}/addon.json`): id, version, dependencies, _forkedFrom, _worldId

## How to Run

- `start.bat` — start both backend and frontend
- `stop.bat` — stop all processes
- Dev: `cd backend && python main.py --reload`

## Documentation & Planning Workflow

### Before making code changes
- Read relevant files in `plan/` to understand existing design decisions
- Read relevant files in `docs/tech/` to understand documented technical behavior
- Read relevant files in `docs/user/` to understand user-facing descriptions
- If no relevant docs exist yet, proceed without them

### After completing code changes
- Ask whether the changes require updates to:
  - `docs/tech/` — if APIs, data structures, logic flow, or file paths changed
  - `docs/user/` — if user-visible behavior, fields, or operations changed
  - `plan/` — if the change completes, modifies, or invalidates a planned item
- Do NOT update documentation without user confirmation
- Do NOT create new documentation files without user confirmation

### Plan file metadata
- Every plan file in `plan/` must include a header with:
  - **创建日期**: when the plan was created
  - **最后更新**: last update date
  - **相关内容**: what area/feature the plan covers

### Daily update log
- Maintain a daily update file at `plan/updates/YYYY-MM-DD.md`
- Each day's file briefly records what was done that day
- After every completed change (code, doc, or config), append a short entry to that day's update file
- Keep entries concise: what changed, which files, why

### Documentation standards
- `docs/user/`: Chinese, written for non-technical users
- `docs/tech/`: Mixed Chinese/English (English for technical terms), includes code references
- See `plan/documentation-plan.md` for full module breakdown and writing guidelines
