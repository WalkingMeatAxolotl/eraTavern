"""Tests for cost checking and application."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from game.action import _apply_costs, _check_costs
from tests.conftest import make_character


class TestCheckCosts:
    def test_no_costs(self):
        char = make_character()
        ok, reason = _check_costs([], char)
        assert ok
        assert reason == ""

    def test_resource_sufficient(self):
        char = make_character()
        costs = [{"type": "resource", "key": "stamina", "amount": 500}]
        ok, reason = _check_costs(costs, char)
        assert ok

    def test_resource_insufficient(self):
        char = make_character()
        costs = [{"type": "resource", "key": "stamina", "amount": 9999}]
        ok, reason = _check_costs(costs, char)
        assert not ok
        assert "体力" in reason

    def test_basicinfo_sufficient(self):
        char = make_character()
        costs = [{"type": "basicInfo", "key": "money", "amount": 50}]
        ok, reason = _check_costs(costs, char)
        assert ok

    def test_basicinfo_insufficient(self):
        char = make_character()
        costs = [{"type": "basicInfo", "key": "money", "amount": 999}]
        ok, reason = _check_costs(costs, char)
        assert not ok

    def test_item_sufficient(self):
        char = make_character(inventory=[{"itemId": "potion", "name": "药水", "tags": [], "amount": 3}])
        costs = [{"type": "item", "itemId": "potion", "amount": 2}]
        ok, reason = _check_costs(costs, char)
        assert ok

    def test_item_insufficient(self):
        char = make_character(inventory=[{"itemId": "potion", "name": "药水", "tags": [], "amount": 1}])
        costs = [{"type": "item", "itemId": "potion", "amount": 5}]
        ok, reason = _check_costs(costs, char)
        assert not ok

    def test_item_missing(self):
        char = make_character()
        costs = [{"type": "item", "itemId": "potion", "amount": 1}]
        ok, reason = _check_costs(costs, char)
        assert not ok

    def test_multiple_costs_all_met(self):
        char = make_character(inventory=[{"itemId": "potion", "name": "药水", "tags": [], "amount": 5}])
        costs = [
            {"type": "resource", "key": "stamina", "amount": 100},
            {"type": "basicInfo", "key": "money", "amount": 10},
            {"type": "item", "itemId": "potion", "amount": 1},
        ]
        ok, _ = _check_costs(costs, char)
        assert ok

    def test_multiple_costs_one_fails(self):
        char = make_character()
        costs = [
            {"type": "resource", "key": "stamina", "amount": 100},
            {"type": "basicInfo", "key": "money", "amount": 99999},
        ]
        ok, _ = _check_costs(costs, char)
        assert not ok


class TestApplyCosts:
    def test_apply_resource_cost(self):
        char = make_character()
        _apply_costs([{"type": "resource", "key": "stamina", "amount": 300}], char)
        assert char["resources"]["stamina"]["value"] == 700

    def test_apply_resource_clamps_to_zero(self):
        char = make_character()
        _apply_costs([{"type": "resource", "key": "stamina", "amount": 9999}], char)
        assert char["resources"]["stamina"]["value"] == 0

    def test_apply_basicinfo_cost(self):
        char = make_character()
        _apply_costs([{"type": "basicInfo", "key": "money", "amount": 30}], char)
        assert char["basicInfo"]["money"]["value"] == 70

    def test_apply_item_cost(self):
        char = make_character(inventory=[{"itemId": "potion", "name": "药水", "tags": [], "amount": 3}])
        _apply_costs([{"type": "item", "itemId": "potion", "amount": 2}], char)
        assert char["inventory"][0]["amount"] == 1

    def test_apply_item_cost_removes_when_zero(self):
        char = make_character(inventory=[{"itemId": "potion", "name": "药水", "tags": [], "amount": 1}])
        _apply_costs([{"type": "item", "itemId": "potion", "amount": 1}], char)
        assert len(char["inventory"]) == 0
