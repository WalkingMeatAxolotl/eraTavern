"""Game time system: 4 seasons/year, 7 days/season, 24h/day, 60min/hour."""

from __future__ import annotations

import random
from typing import Any

SEASONS = ["春", "夏", "秋", "冬"]
WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]

WEATHER_TABLE = {
    "sunny": {"name": "晴天", "icon": "☀"},
    "cloudy": {"name": "多云", "icon": "☁"},
    "rainy": {"name": "雨天", "icon": "🌧"},
    "snowy": {"name": "雪天", "icon": "❄"},
}

SEASON_TEMP_BASE = {"春": 18, "夏": 30, "秋": 20, "冬": 5}

# Weather probability weights per season [sunny, cloudy, rainy, snowy]
SEASON_WEATHER_WEIGHTS = {
    "春": [3, 3, 2, 0],
    "夏": [5, 2, 3, 0],
    "秋": [3, 3, 2, 0],
    "冬": [2, 3, 0, 3],
}
WEATHER_IDS = ["sunny", "cloudy", "rainy", "snowy"]


class GameTime:
    def __init__(
        self,
        year: int = 1,
        season: int = 0,
        day: int = 1,
        hour: int = 6,
        minute: int = 0,
    ) -> None:
        self.year = year
        self.season = season  # 0-3
        self.day = day  # 1-7
        self.hour = hour  # 0-23
        self.minute = minute  # 0-59
        self.weather = "sunny"
        self.temperature = SEASON_TEMP_BASE[SEASONS[season]] + random.randint(-3, 3)

    def advance(self, minutes: int) -> None:
        """Advance time by the given number of minutes."""
        self.minute += minutes
        while self.minute >= 60:
            self.minute -= 60
            self.hour += 1
        day_changed = False
        while self.hour >= 24:
            self.hour -= 24
            self.day += 1
            day_changed = True
        while self.day > 7:
            self.day -= 7
            self.season += 1
        while self.season >= 4:
            self.season -= 4
            self.year += 1
        if day_changed:
            self._roll_weather()

    def _roll_weather(self) -> None:
        season_name = SEASONS[self.season]
        weights = SEASON_WEATHER_WEIGHTS[season_name]
        self.weather = random.choices(WEATHER_IDS, weights=weights, k=1)[0]
        base = SEASON_TEMP_BASE[season_name]
        self.temperature = base + random.randint(-5, 5)

    @property
    def total_days(self) -> int:
        return (self.year - 1) * 28 + self.season * 7 + self.day

    @property
    def total_minutes(self) -> int:
        return self.total_days * 24 * 60 + self.hour * 60 + self.minute

    @property
    def season_name(self) -> str:
        return SEASONS[self.season]

    @property
    def weekday(self) -> str:
        return WEEKDAYS[(self.day - 1) % 7]

    def to_dict(self) -> dict[str, Any]:
        w = WEATHER_TABLE[self.weather]
        return {
            "year": self.year,
            "season": self.season,
            "seasonName": self.season_name,
            "day": self.day,
            "totalDays": self.total_days,
            "weekday": self.weekday,
            "hour": self.hour,
            "minute": self.minute,
            "weatherId": self.weather,
            "weatherName": w["name"],
            "weatherIcon": w["icon"],
            "temperature": self.temperature,
            "displayText": (
                f"{self.season_name}{self.day}日"
                f"[{self.total_days}日目]"
                f"({self.weekday}) "
                f"{self.hour:02d}:{self.minute:02d} "
                f"{w['icon']} ({w['name']}) "
                f"{self.temperature}℃"
            ),
        }
