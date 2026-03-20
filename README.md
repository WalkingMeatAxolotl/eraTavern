# AaaliceTavern

<p align="center">
  <img src="assets/logo.png" alt="AaaliceTavern Logo" width="120">
</p>

<p align="center">
  <strong>Addon-extensible text adventure engine with LLM-powered narration</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> &middot;
  <a href="#-installation">Installation</a> &middot;
  <a href="#-usage">Usage</a> &middot;
  <a href="#-tech-stack">Tech Stack</a> &middot;
  <a href="#-project-structure">Project Structure</a> &middot;
  <a href="#-development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License">
  <img src="https://img.shields.io/badge/python-3.9+-blue?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
</p>

<p align="center">
  <a href="README_CN.md">中文版</a>
</p>

---

Build complete text adventure games with visual editors — no code required. Describe what you need to a built-in AI agent and it creates traits, items, and equipment for you. The engine handles action resolution, NPC decisions, and game logic. An LLM layer turns every interaction into immersive narrative text. All content lives in addon packs — mix and match them to build your own world.

---

## &#x1F3AE; What This Engine Does

Create game content (addons) with visual editors — or let the AI Agent do it for you. The engine takes care of:

- **Action Resolution** — Condition trees (AND/OR/NOT, 15+ types), multiple outcome branches, costs/effects/weight modifiers
- **Autonomous NPC Behavior** — NPCs make decisions within their perception range: pathfinding, choosing actions, interacting with others — no scripting needed
- **LLM Narration** — Action results + character state + lorebook entries assembled into prompts for narrative generation
- **AI Assist Agent** — Chat with an AI to create and edit game entities (traits, items, clothing) through natural language. The agent uses tool calling to query schemas, list existing content, and create/update entities — all with human-in-the-loop confirmation before any write operation
- **Character Templates** — One template defines the attribute structure (resources, abilities, traits, clothing slots) for all characters
- **Derived Variables** — Visual formula editor for computed values based on attributes, favorability, traits — used in conditions and weight modifiers
- **Addon System** — All content packaged into addons with version management, dependency tracking, and per-world branching

---

## &#x2728; Features

### For Creators

| Category | Details |
|----------|---------|
| **Visual Editors** | Characters, actions, maps, traits, items, clothing, variables, events, lorebook |
| **Condition System** | 15 condition types, nested AND/OR/NOT, actor/target dual perspective |
| **Effect System** | 11 effect types (resource, ability, trait, item, clothing, favorability, position, world variable), percentage & variable references |
| **Outcome Branches** | Success/failure/critical with weight modifiers based on ability, trait, favorability, etc. |
| **NPC AI** | Weight-based action preferences, suggestNext behavior chaining, sense-range filtering |
| **Clothing** | 14 slots, multiple outfit presets, occlusion calculation, stat effects |
| **Derived Variables** | 9 step types + 8 operations, bidirectional character relationships |
| **Lorebook** | Keyword-triggered context injection into LLM prompts (similar to SillyTavern World Info) |
| **LLM Variables** | 40+ template variables (stats, equipment, history, location, weather), parameterized |
| **Events** | Global condition-triggered effects, once / on_change / while modes |
| **Trait Groups** | Exclusive/non-exclusive grouping with auto-replacement |
| **Ability Decay** | Experience values decay over time with configurable rate and interval |
| **Prompt Labels** | LLM prompt text adapts to addon language, enabling non-Chinese content packs |
| **AI Assist Agent** | Chat-based AI assistant for creating and editing entities — tool calling with human-in-the-loop confirmation |

### For Players

- **Multiple Worlds** — Different addon combinations per world, fully isolated
- **Multiple Save Slots** — Independent save slots per world
- **Outfit Switching** — Choose from preset clothing loadouts
- **LLM Narration** — Auto or manual trigger for AI-generated story text

---

## &#x1F4E6; Installation

**Requirements:** Python 3.9+, Node.js 20.19+

```bash
# Just double-click start.bat (or run from terminal)
start.bat
```

Dependencies are installed automatically on first launch.

---

## &#x1F680; Usage

```bash
# Start (backend + frontend)
start.bat

# Stop
stop.bat
```

Open `http://localhost:15173` in your browser. A default world is created on first launch.

### UI Layout

| Area | Function |
|------|----------|
| **Left Sidebar** | World management (create / switch / delete) |
| **Right Sidebar** | Addon management (enable / disable / version switch) |
| **Top Nav** | Characters / Traits / Clothing / Items / Actions / Maps / Variables / Lorebook / LLM / Settings |
| **Bottom Float** | [Save Changes] button |

---

## &#x1F6E0;&#xFE0F; Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.x / FastAPI / uvicorn |
| Frontend | React + TypeScript / Vite |
| Communication | REST API + SSE |
| Data | JSON files, no database |

---

## &#x1F4C1; Project Structure

```
addons/{addonId}/              Addons (source of all game entities)
  about/                         Metadata + cover images
  assets/                        Character portraits / map backgrounds
  {version}/                     Version directory (entity definition JSONs)

worlds/{worldId}/              Worlds (config + saves)
  world.json                     Which addons to use
  saves/                         Save slots

backend/
  game/
    state.py                     GameState singleton
    action/                      Action system (conditions / effects / NPC / events)
    character/                   Character system (namespace / loading / state building)
  routes/                        API routes

frontend/src/
  components/                    Editor UI (10 feature subdirectories)
  i18n/                          Internationalization
```

---

## &#x1F4BB; Development

```bash
# Backend with hot reload
cd backend && python main.py --reload

# Run tests (585 tests)
cd backend && python -m pytest tests/ -q

# Backend lint
cd backend && ruff check game/

# Frontend type check
cd frontend && npx tsc --noEmit

# Frontend lint
cd frontend && npx eslint src/
```

### Documentation

- **Technical docs** — [`docs/tech/`](docs/tech/) — Architecture, data structures, algorithms, API
- **User guides** — [`docs/user/`](docs/user/) — Editor usage guides

---

## &#x1F4C4; License

[GNU Affero General Public License v3.0](LICENSE)

Game content created with this engine (addons, worlds, save files) is not subject to this license — creators retain full rights to their content.
