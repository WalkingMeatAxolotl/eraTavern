"""Shared mock fixtures for action system tests."""

from __future__ import annotations

import pytest


class MockTime:
    """Minimal mock for GameTime."""

    def __init__(self, year=1, season=0, day=1, hour=12, minute=0):
        self.year = year
        self.season = season
        self.day = day
        self.hour = hour
        self.minute = minute
        self._weather = "sunny"

    @property
    def season_name(self):
        return ["spring", "summer", "autumn", "winter"][self.season]

    @property
    def season_display(self):
        return ["春", "夏", "秋", "冬"][self.season]

    @property
    def weekday(self):
        return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][(self.day - 1) % 7]

    @property
    def weekday_display(self):
        return ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"][(self.day - 1) % 7]

    def advance(self, minutes: int):
        self.minute += minutes
        while self.minute >= 60:
            self.minute -= 60
            self.hour += 1
        while self.hour >= 24:
            self.hour -= 24
            self.day += 1

    @property
    def total_days(self):
        return (self.year - 1) * 120 + self.season * 30 + self.day

    @property
    def total_minutes(self):
        return self.total_days * 24 * 60 + self.hour * 60 + self.minute

    @property
    def weekday(self):
        WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
        return WEEKDAYS[(self.total_days - 1) % 7]

    @property
    def weather(self):
        return self._weather

    @weather.setter
    def weather(self, val):
        self._weather = val

    def to_dict(self):
        return {
            "year": self.year,
            "season": self.season,
            "day": self.day,
            "hour": self.hour,
            "minute": self.minute,
        }

    def __str__(self):
        return f"{self.year}年{self.season_name}{self.day}日{self.hour:02d}:{self.minute:02d}"


class MockGameState:
    """Minimal mock for GameState used by action.py functions."""

    def __init__(self):
        self.characters: dict[str, dict] = {}
        self.character_data: dict[str, dict] = {}
        self.maps: dict[str, dict] = {}
        self.action_defs: dict[str, dict] = {}
        self.trait_defs: dict[str, dict] = {}
        self.item_defs: dict[str, dict] = {}
        self.time = MockTime()
        self.npc_goals: dict = {}
        self.npc_activities: dict = {}
        self.npc_full_log: list = []
        self.npc_action_history: dict = {}
        self.decay_accumulators: dict = {}
        self.distance_matrix: dict = {}
        self.sense_matrix: dict = {}
        self.cell_action_index: dict = {}
        self.no_location_actions: list = []
        self.event_defs: dict = {}
        self.event_state: dict = {}
        self.world_variables: dict = {}
        self.variable_defs: dict = {}
        self.clothing_defs: dict = {}
        self.trait_groups: dict = {}
        self.action_log: list = []


def make_character(
    name="TestChar",
    is_player=True,
    map_id="map1",
    cell_id=1,
    resources=None,
    abilities=None,
    experiences=None,
    traits=None,
    clothing=None,
    inventory=None,
    basic_info=None,
    favorability=None,
):
    """Build a display-format character dict."""
    char = {
        "isPlayer": is_player,
        "position": {"mapId": map_id, "cellId": cell_id},
        "basicInfo": basic_info
        or {
            "name": {"key": "name", "label": "名前", "type": "text", "value": name},
            "money": {"key": "money", "label": "金钱", "type": "number", "value": 100},
        },
        "resources": resources
        or {
            "stamina": {"key": "stamina", "label": "体力", "value": 1000, "max": 2000},
            "energy": {"key": "energy", "label": "气力", "value": 800, "max": 2000},
        },
        "abilities": abilities
        or [
            {"key": "technique", "label": "技巧", "exp": 3000, "grade": "D"},
        ],
        "experiences": experiences
        or [
            {"key": "kiss", "label": "接吻经验", "count": 0, "first": None},
        ],
        "traits": traits
        or [
            {"key": "race", "label": "种族", "values": ["human"]},
        ],
        "clothing": clothing or [],
        "inventory": inventory or [],
        "favorability": favorability or [],
    }
    return char


def make_char_data(name="TestChar", traits=None, favorability=None):
    """Build a raw character_data dict."""
    return {
        "basicInfo": {"name": name},
        "traits": traits or {"race": ["human"]},
        "favorability": favorability or {},
    }


@pytest.fixture
def game_state():
    """Return a fresh MockGameState with a player and NPC."""
    gs = MockGameState()

    gs.characters["player"] = make_character(
        name="Player",
        is_player=True,
        map_id="tavern",
        cell_id=1,
    )
    gs.characters["npc1"] = make_character(
        name="Sakuya",
        is_player=False,
        map_id="tavern",
        cell_id=1,
    )

    gs.character_data["player"] = make_char_data("Player")
    gs.character_data["npc1"] = make_char_data(
        "Sakuya",
        favorability={"player": 200},
    )

    gs.maps["tavern"] = {
        "id": "tavern",
        "name": "酒馆",
        "cells": [
            {"id": 1, "name": "吧台", "tags": ["bar"]},
            {"id": 2, "name": "大厅", "tags": ["hall"]},
            {"id": 3, "name": "厨房", "tags": ["kitchen"]},
        ],
        "cell_index": {
            1: {"name": "吧台", "tags": ["bar"]},
            2: {"name": "大厅", "tags": ["hall"]},
            3: {"name": "厨房", "tags": ["kitchen"]},
        },
    }

    return gs
