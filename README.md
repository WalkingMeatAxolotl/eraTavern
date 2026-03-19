# AI Tavern Game

> **[中文版](README_CN.md)**

A JSON-data-driven text adventure game engine.

Define characters, actions, maps, traits, and items through visual editors — no code required. The engine handles all game logic. Connect an LLM to automatically transform game events into narrative text.

[Features](#features) · [Installation](#installation) · [Usage](#usage) · [Tech Stack](#tech-stack) · [Project Structure](#project-structure) · [Development](#development)

---

## What This Engine Does

Create game content (addons) with visual editors. The engine takes care of:

- **Action Resolution** — Condition trees (AND/OR/NOT, 15+ condition types), multiple outcome branches, costs/effects/weight modifiers, all evaluated automatically
- **Autonomous NPC Behavior** — NPCs make decisions within their perception range: pathfinding, choosing actions, interacting with other characters — no scripting needed
- **LLM Narration** — Action results + character state + lorebook entries are assembled into prompts; the LLM generates narrative text
- **Character Templates** — One template defines the attribute structure (resources, abilities, traits, clothing slots) for all characters
- **Derived Variables** — Visual formula editor for computed values based on attributes, favorability, traits, etc. — used in conditions and weight modifiers
- **Addon System** — All content is packaged into addons with version management, dependency tracking, and per-world branching

## Features

**For Creators:**

- Visual editors for all entity types — characters, actions, maps, traits, items, clothing, variables, events, lorebook
- Condition system — 15 condition types, nested AND/OR/NOT, actor/target dual perspective
- Effect system — 11 effect types (resource, ability, trait, item, clothing, favorability, position, world variable), percentage & variable references
- Multiple outcome branches — success/failure/critical with weight modifiers based on ability, trait, favorability, etc.
- NPC weight control — tune NPC action preferences; suggestNext chains guide follow-up behavior
- Clothing system — 14 slots, multiple outfit presets, occlusion calculation, clothing stat effects
- Derived variables — 9 step types + 8 operations, bidirectional character relationships (e.g. "bond = mutual favorability sum")
- Lorebook — keyword-triggered context injection into LLM prompts, similar to SillyTavern World Info
- LLM template variables — 40+ variables (character stats, equipment, history, location, weather, world variables), parameterized
- Ability decay — experience values decay over time with configurable rate and interval
- Event system — global condition-triggered effects, once / on_change / while modes
- Trait groups — exclusive/non-exclusive grouping; gaining a new trait auto-replaces others in the same group
- Prompt labels — LLM prompt text adapts to addon language, enabling non-Chinese content packs

**For Players:**

- Multiple worlds — different addon combinations per world, fully isolated
- Multiple save slots — independent save slots per world
- Outfit switching — choose from preset clothing loadouts
- LLM narration — auto or manual trigger for AI-generated story text

## Installation

**Requirements:** Python 3.9+, Node.js 18+

```bash
# 1. Backend
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt

# 2. Frontend
cd ../frontend
npm install
```

## Usage

```bash
# Start (backend + frontend)
start.bat

# Stop
stop.bat
```

Open `http://localhost:15173` in your browser. A default world is created on first launch.

**UI Layout:**
- **Left sidebar** — World management (create / switch / delete)
- **Right sidebar** — Addon management (enable / disable / version switch)
- **Top nav** — Characters / Traits / Clothing / Items / Actions / Maps / Variables / Lorebook / LLM / Settings
- **Bottom float** — [Save Changes] button

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.x / FastAPI / uvicorn |
| Frontend | React + TypeScript / Vite |
| Communication | REST API + SSE |
| Data | JSON files, no database |

## Project Structure

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

## Development

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

## Documentation

- **Technical docs** — [`docs/tech/`](docs/tech/) — Architecture, data structures, algorithms, API
- **User guides** — [`docs/user/`](docs/user/) — Editor usage guides

## License

[GNU Affero General Public License v3.0](LICENSE)

Game content created with this engine (addons, worlds, save files) is not subject to this license — creators retain full rights to their content.
