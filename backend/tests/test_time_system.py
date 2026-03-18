"""Unit tests for GameTime class in game.time_system."""

from __future__ import annotations

import random

import pytest

from game.time_system import (
    WEATHER_IDS,
    WEATHER_TABLE,
    GameTime,
)


class TestInit:
    """Test GameTime constructor."""

    def test_default_values(self):
        t = GameTime()
        assert t.year == 1
        assert t.season == 0
        assert t.day == 1
        assert t.hour == 6
        assert t.minute == 0
        assert t.weather == "sunny"

    def test_custom_values(self):
        t = GameTime(year=3, season=2, day=5, hour=14, minute=30)
        assert t.year == 3
        assert t.season == 2
        assert t.day == 5
        assert t.hour == 14
        assert t.minute == 30
        assert t.weather == "sunny"


class TestAdvance:
    """Test GameTime.advance() overflow logic."""

    def test_simple_minute_addition(self):
        t = GameTime()
        t.advance(15)
        assert t.minute == 15
        assert t.hour == 6
        assert t.day == 1

    def test_minute_overflow_to_hour(self):
        t = GameTime(hour=6, minute=50)
        t.advance(20)
        assert t.minute == 10
        assert t.hour == 7

    def test_hour_overflow_to_next_day(self):
        t = GameTime(hour=23, minute=0)
        t.advance(60)
        assert t.hour == 0
        assert t.day == 2

    def test_day_overflow_to_next_season(self):
        t = GameTime(season=0, day=7, hour=23, minute=0)
        t.advance(60)
        assert t.day == 1
        assert t.season == 1

    def test_season_overflow_to_next_year(self):
        t = GameTime(year=1, season=3, day=7, hour=23, minute=0)
        t.advance(60)
        assert t.day == 1
        assert t.season == 0
        assert t.year == 2

    def test_large_advance_spans_multiple_units(self):
        """Advance more than a full year (28 days * 24h * 60min = 40320 min)."""
        t = GameTime()
        t.advance(40320 + 1440 + 90)  # +1 year +1 day +1h30m
        assert t.year == 2
        assert t.season == 0
        assert t.day == 2
        assert t.hour == 7
        assert t.minute == 30

    def test_weather_rolls_on_day_change(self):
        """When day changes, weather should be re-rolled (not necessarily sunny)."""
        random.seed(42)
        t = GameTime(hour=23, minute=0)
        old_weather = t.weather
        t.advance(60)
        # After day change, _roll_weather was called; weather is one of the valid IDs
        assert t.weather in WEATHER_IDS


class TestTotalDays:
    """Test total_days property."""

    def test_first_day(self):
        t = GameTime(year=1, season=0, day=1)
        assert t.total_days == 1

    def test_end_of_first_season(self):
        t = GameTime(year=1, season=0, day=7)
        assert t.total_days == 7

    def test_second_season(self):
        t = GameTime(year=1, season=1, day=1)
        assert t.total_days == 8

    def test_second_year(self):
        t = GameTime(year=2, season=0, day=1)
        assert t.total_days == 29  # 28 + 1


class TestTotalMinutes:
    """Test total_minutes property."""

    def test_start_of_game(self):
        t = GameTime(year=1, season=0, day=1, hour=0, minute=0)
        assert t.total_minutes == 1 * 24 * 60  # total_days=1

    def test_with_hour_and_minute(self):
        t = GameTime(year=1, season=0, day=1, hour=6, minute=30)
        expected = 1 * 24 * 60 + 6 * 60 + 30
        assert t.total_minutes == expected


class TestSeasonName:
    """Test season_name property for all 4 seasons."""

    @pytest.mark.parametrize("season_idx, expected", [
        (0, "春"),
        (1, "夏"),
        (2, "秋"),
        (3, "冬"),
    ])
    def test_season_name(self, season_idx, expected):
        t = GameTime(season=season_idx)
        assert t.season_name == expected


class TestWeekday:
    """Test weekday property for day 1-7."""

    @pytest.mark.parametrize("day, expected", [
        (1, "星期一"),
        (2, "星期二"),
        (3, "星期三"),
        (4, "星期四"),
        (5, "星期五"),
        (6, "星期六"),
        (7, "星期日"),
    ])
    def test_weekday(self, day, expected):
        t = GameTime(day=day)
        assert t.weekday == expected


class TestToDict:
    """Test to_dict() output."""

    def test_all_expected_keys(self):
        t = GameTime()
        d = t.to_dict()
        expected_keys = {
            "year", "season", "seasonName", "day", "totalDays",
            "weekday", "hour", "minute", "weatherId", "weatherName",
            "weatherIcon", "temperature", "displayText",
        }
        assert set(d.keys()) == expected_keys

    def test_display_text_format(self):
        random.seed(0)
        t = GameTime(year=1, season=0, day=1, hour=6, minute=0)
        t.weather = "sunny"
        d = t.to_dict()
        w = WEATHER_TABLE["sunny"]
        expected = (
            f"春1日[1日目](星期一) 06:00 {w['icon']} ({w['name']}) {t.temperature}℃"
        )
        assert d["displayText"] == expected

    def test_values_match_properties(self):
        t = GameTime(year=2, season=3, day=5, hour=14, minute=45)
        d = t.to_dict()
        assert d["year"] == 2
        assert d["season"] == 3
        assert d["seasonName"] == "冬"
        assert d["day"] == 5
        assert d["totalDays"] == t.total_days
        assert d["weekday"] == "星期五"
        assert d["hour"] == 14
        assert d["minute"] == 45
        assert d["weatherId"] == t.weather


class TestRollWeather:
    """Test _roll_weather() seasonal constraints."""

    def test_winter_never_rainy(self):
        """Winter weights have 0 for rainy, so it should never appear."""
        random.seed(0)
        t = GameTime(season=3)
        results = set()
        for i in range(200):
            random.seed(i)
            t._roll_weather()
            results.add(t.weather)
        assert "rainy" not in results

    def test_summer_never_snowy(self):
        """Summer weights have 0 for snowy, so it should never appear."""
        random.seed(0)
        t = GameTime(season=1)
        results = set()
        for i in range(200):
            random.seed(i)
            t._roll_weather()
            results.add(t.weather)
        assert "snowy" not in results

    def test_spring_never_snowy(self):
        """Spring weights have 0 for snowy."""
        t = GameTime(season=0)
        results = set()
        for i in range(200):
            random.seed(i)
            t._roll_weather()
            results.add(t.weather)
        assert "snowy" not in results

    def test_autumn_never_snowy(self):
        """Autumn weights have 0 for snowy."""
        t = GameTime(season=2)
        results = set()
        for i in range(200):
            random.seed(i)
            t._roll_weather()
            results.add(t.weather)
        assert "snowy" not in results
