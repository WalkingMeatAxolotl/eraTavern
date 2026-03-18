"""Integration test fixtures: real GameState with temp addon/world dirs."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


# ── Minimal addon data ──

ADDON_A_META = {"name": "Test Addon A", "description": "For testing", "author": "test"}

ADDON_A_JSON = {
    "id": "test-a",
    "version": "1.0.0",
    "dependencies": [],
}

ADDON_A_TRAITS = {
    "traits": [
        {"id": "human", "name": "人类", "category": "race"},
        {
            "id": "cooking",
            "name": "料理",
            "category": "ability",
            "decay": {"type": "fixed", "amount": 10, "intervalMinutes": 60},
        },
        {"id": "stealth", "name": "隐匿", "category": "ability"},
    ]
}

ADDON_A_ITEMS = {
    "items": [
        {"id": "potion", "name": "药水", "tags": ["consumable"]},
        {"id": "key", "name": "钥匙", "tags": ["quest"]},
    ],
    "tags": ["consumable", "quest"],
}

ADDON_A_CLOTHING = {
    "clothing": [
        {"id": "shirt", "name": "衬衫", "slot": "upperBody", "occlusion": []},
    ]
}

ADDON_A_ACTIONS = {
    "actions": [
        {
            "id": "rest",
            "name": "休息",
            "category": "日常",
            "targetType": "none",
            "timeCost": 30,
            "npcWeight": 5,
            "conditions": [],
            "costs": [],
            "outcomes": [
                {
                    "grade": "success",
                    "label": "成功",
                    "weight": 100,
                    "effects": [{"type": "resource", "key": "stamina", "op": "add", "value": 500, "target": "self"}],
                }
            ],
        },
        {
            "id": "cook",
            "name": "做饭",
            "category": "日常",
            "targetType": "none",
            "timeCost": 60,
            "npcWeight": 3,
            "conditions": [{"type": "location", "mapId": "tavern", "cellIds": [2]}],
            "costs": [{"type": "resource", "key": "stamina", "amount": 100}],
            "outcomes": [
                {
                    "grade": "success",
                    "label": "成功",
                    "weight": 100,
                    "effects": [{"type": "ability", "key": "cooking", "op": "add", "value": 50, "target": "self"}],
                }
            ],
        },
    ]
}

ADDON_A_MAP = {
    "id": "tavern",
    "name": "酒馆",
    "rows": 1,
    "cols": 2,
    "grid": [["吧台", "厨房"]],
    "cells": [
        {
            "id": 1,
            "name": "吧台",
            "row": 0,
            "col": 0,
            "tags": ["bar"],
            "connections": [{"targetCell": 2, "travelTime": 5}],
        },
        {
            "id": 2,
            "name": "厨房",
            "row": 0,
            "col": 1,
            "tags": ["kitchen"],
            "connections": [{"targetCell": 1, "travelTime": 5}],
        },
    ],
}

ADDON_A_CHAR_PLAYER = {
    "id": "player1",
    "basicInfo": {"name": "测试玩家"},
    "isPlayer": True,
    "active": True,
    "position": {"mapId": "tavern", "cellId": 1},
    "resources": {"stamina": {"value": 1000, "max": 2000}},
    "abilities": {"cooking": 500, "stealth": 100},
    "traits": {"race": ["human"]},
    "clothing": {"upperBody": {"itemId": "shirt", "state": "worn"}},
    "inventory": [{"itemId": "potion", "amount": 3}],
    "favorability": {"npc1": 100},
    "experiences": {},
}

ADDON_A_CHAR_NPC = {
    "id": "npc1",
    "basicInfo": {"name": "女仆"},
    "isPlayer": False,
    "active": True,
    "position": {"mapId": "tavern", "cellId": 1},
    "resources": {"stamina": {"value": 800, "max": 2000}},
    "abilities": {"cooking": 2000},
    "traits": {"race": ["human"]},
    "clothing": {},
    "inventory": [],
    "favorability": {"player1": 200},
    "experiences": {},
}

ADDON_A_TRAIT_GROUPS = {"traitGroups": []}
ADDON_A_VARIABLES = {"variables": []}
ADDON_A_EVENTS = {
    "events": [],
    "worldVariables": [
        {"id": "danger", "name": "危险度", "default": 0},
    ],
}

# ── Addon B: cross-addon reference testing ──

ADDON_B_META = {"name": "Test Addon B", "description": "Cross-addon test", "author": "test"}

ADDON_B_JSON = {
    "id": "test-b",
    "version": "1.0.0",
    "dependencies": [{"id": "test-a"}],
}

ADDON_B_TRAITS = {
    "traits": [
        {"id": "elf", "name": "精灵", "category": "race"},
    ]
}

ADDON_B_CHAR_NPC2 = {
    "id": "npc2",
    "basicInfo": {"name": "精灵弓手"},
    "isPlayer": False,
    "active": True,
    "position": {"mapId": "tavern", "cellId": 2},
    "resources": {"stamina": {"value": 1500, "max": 2000}},
    "abilities": {},
    "traits": {"race": ["elf"]},
    "clothing": {"upperBody": {"itemId": "test-a.shirt", "state": "worn"}},
    "inventory": [{"itemId": "test-a.potion", "amount": 1}],
    "favorability": {},
    "experiences": {},
}

WORLD_CONFIG = {
    "id": "test-world",
    "name": "测试世界",
    "addons": [
        {"id": "test-a", "version": "1.0.0"},
        {"id": "test-b", "version": "1.0.0"},
    ],
    "playerCharacter": "player1",
}


def _write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def create_test_fixtures(base_dir: Path):
    """Create addon and world fixture files under base_dir."""
    addons = base_dir / "addons"
    worlds = base_dir / "worlds"

    # Addon A
    a_dir = addons / "test-a" / "1.0.0"
    _write_json(addons / "test-a" / "about" / "meta.json", ADDON_A_META)
    _write_json(a_dir / "addon.json", ADDON_A_JSON)
    _write_json(a_dir / "traits.json", ADDON_A_TRAITS)
    _write_json(a_dir / "items.json", ADDON_A_ITEMS)
    _write_json(a_dir / "clothing.json", ADDON_A_CLOTHING)
    _write_json(a_dir / "actions.json", ADDON_A_ACTIONS)
    _write_json(a_dir / "maps" / "tavern.json", ADDON_A_MAP)
    _write_json(a_dir / "map_collection.json", {"maps": ["maps/tavern.json"]})
    _write_json(a_dir / "characters" / "player1.json", ADDON_A_CHAR_PLAYER)
    _write_json(a_dir / "characters" / "npc1.json", ADDON_A_CHAR_NPC)
    _write_json(a_dir / "trait_groups.json", ADDON_A_TRAIT_GROUPS)
    _write_json(a_dir / "variables.json", ADDON_A_VARIABLES)
    _write_json(a_dir / "events.json", ADDON_A_EVENTS)

    # Addon B
    b_dir = addons / "test-b" / "1.0.0"
    _write_json(addons / "test-b" / "about" / "meta.json", ADDON_B_META)
    _write_json(b_dir / "addon.json", ADDON_B_JSON)
    _write_json(b_dir / "traits.json", ADDON_B_TRAITS)
    _write_json(b_dir / "items.json", {"items": [], "tags": []})
    _write_json(b_dir / "clothing.json", {"clothing": []})
    _write_json(b_dir / "actions.json", {"actions": []})
    _write_json(b_dir / "characters" / "npc2.json", ADDON_B_CHAR_NPC2)
    _write_json(b_dir / "trait_groups.json", {"traitGroups": []})
    _write_json(b_dir / "variables.json", {"variables": []})
    _write_json(b_dir / "events.json", {"events": []})
    _write_json(b_dir / "world_variables.json", {"worldVariables": []})

    # World
    _write_json(worlds / "test-world" / "world.json", WORLD_CONFIG)
    (worlds / "test-world" / "saves").mkdir(parents=True, exist_ok=True)


@pytest.fixture
def test_env(tmp_path, monkeypatch):
    """Set up temp addon/world dirs and patch addon_loader paths.

    Returns (game_state, base_dir) after loading the test world.
    Resets GameState singleton between tests.
    """
    import game.addon_loader as loader
    from game.state import GameState

    # Create fixture files
    create_test_fixtures(tmp_path)

    # Monkeypatch paths
    monkeypatch.setattr(loader, "ADDONS_DIR", tmp_path / "addons")
    monkeypatch.setattr(loader, "WORLDS_DIR", tmp_path / "worlds")

    # Reset singleton
    GameState._instance = None

    gs = GameState()
    gs.load_world("test-world")

    yield gs, tmp_path

    # Cleanup singleton
    GameState._instance = None


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    """FastAPI TestClient with test world loaded.

    Returns (client, game_state).
    """
    import json as _json

    import game.addon_loader as loader
    from game.state import GameState

    create_test_fixtures(tmp_path)
    monkeypatch.setattr(loader, "ADDONS_DIR", tmp_path / "addons")
    monkeypatch.setattr(loader, "WORLDS_DIR", tmp_path / "worlds")

    GameState._instance = None
    gs = GameState()
    gs.load_world("test-world")

    import main

    monkeypatch.setattr(main, "game_state", gs)

    config_path = tmp_path / "config.json"
    with open(config_path, "w", encoding="utf-8") as f:
        _json.dump({"backendPort": 18000, "frontendPort": 15173, "lastWorldId": "test-world"}, f)
    monkeypatch.setattr(main, "CONFIG_PATH", config_path)

    from fastapi.testclient import TestClient

    client = TestClient(main.app, raise_server_exceptions=False)

    yield client, gs

    GameState._instance = None
