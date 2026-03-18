"""Phase 1: Unit tests for map_engine.py."""

from __future__ import annotations

from game.map_engine import build_distance_matrix, build_sense_matrix, compile_grid, validate_move


def _make_map(cells, grid=None, connections_map=None, default_color="#FFF"):
    """Build a map dict with cell_index."""
    cell_list = []
    cell_index = {}
    for c in cells:
        cell = {"id": c["id"], "row": c.get("row", 0), "col": c.get("col", 0),
                "name": c.get("name", ""), "connections": c.get("connections", [])}
        cell_list.append(cell)
        cell_index[c["id"]] = cell
    return {
        "id": "test_map",
        "name": "Test",
        "defaultColor": default_color,
        "grid": grid or [[""]],
        "cells": cell_list,
        "cell_index": cell_index,
    }


# --- compile_grid ---

class TestCompileGrid:
    def test_basic_grid(self):
        map_data = {
            "defaultColor": "#FFF",
            "grid": [["A", "B"], ["C", ""]],
            "cells": [{"id": 1, "row": 0, "col": 0}],
        }
        result = compile_grid(map_data)
        assert len(result) == 2
        assert len(result[0]) == 2
        assert result[0][0] == {"text": "A", "color": "#FFF", "cellId": 1}
        assert result[0][1] == {"text": "B", "color": "#FFF", "cellId": None}
        assert result[1][1] == {"text": "", "color": "#FFF", "cellId": None}

    def test_color_override(self):
        map_data = {
            "defaultColor": "#FFF",
            "grid": [[["X", "#F00"]]],
            "cells": [],
        }
        result = compile_grid(map_data)
        assert result[0][0]["text"] == "X"
        assert result[0][0]["color"] == "#F00"


# --- validate_move ---

class TestValidateMove:
    def test_valid_move_returns_travel_time(self):
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "travelTime": 15}]},
            {"id": 2, "connections": []},
        ])}
        result = validate_move(maps, "m1", 1, None, 2)
        assert result == 15

    def test_valid_move_default_travel_time(self):
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2}]},
            {"id": 2, "connections": []},
        ])}
        result = validate_move(maps, "m1", 1, None, 2)
        assert result == 10  # default

    def test_invalid_move_returns_none(self):
        maps = {"m1": _make_map([
            {"id": 1, "connections": []},
            {"id": 2, "connections": []},
        ])}
        result = validate_move(maps, "m1", 1, None, 2)
        assert result is None

    def test_cross_map_move(self):
        maps = {
            "m1": _make_map([{"id": 1, "connections": [{"targetCell": 1, "targetMap": "m2", "travelTime": 20}]}]),
            "m2": _make_map([{"id": 1, "connections": []}]),
        }
        result = validate_move(maps, "m1", 1, "m2", 1)
        assert result == 20

    def test_sense_only_blocked(self):
        """senseOnly connections should not allow movement."""
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "senseOnly": True}]},
            {"id": 2, "connections": []},
        ])}
        result = validate_move(maps, "m1", 1, None, 2)
        assert result is None

    def test_nonexistent_map(self):
        result = validate_move({}, "m1", 1, None, 2)
        assert result is None

    def test_nonexistent_cell(self):
        maps = {"m1": _make_map([{"id": 1, "connections": []}])}
        result = validate_move(maps, "m1", 99, None, 1)
        assert result is None

    def test_sense_blocked_still_passable(self):
        """senseBlocked connections should still allow movement."""
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "senseBlocked": True, "travelTime": 10}]},
            {"id": 2, "connections": []},
        ])}
        result = validate_move(maps, "m1", 1, None, 2)
        assert result == 10


# --- build_distance_matrix ---

class TestBuildDistanceMatrix:
    def test_simple_two_cells(self):
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "travelTime": 10}]},
            {"id": 2, "connections": [{"targetCell": 1, "travelTime": 10}]},
        ])}
        dm = build_distance_matrix(maps)
        assert dm[("m1", 1)][("m1", 2)] == (10, "m1", 2)
        assert dm[("m1", 2)][("m1", 1)] == (10, "m1", 1)

    def test_sense_only_excluded(self):
        """senseOnly connections should not appear in distance matrix."""
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "senseOnly": True}]},
            {"id": 2, "connections": []},
        ])}
        dm = build_distance_matrix(maps)
        assert ("m1", 2) not in dm.get(("m1", 1), {})

    def test_shortest_path(self):
        """Should find shortest path: 1→3 direct (5) vs 1→2→3 (10+10=20)."""
        maps = {"m1": _make_map([
            {"id": 1, "connections": [
                {"targetCell": 2, "travelTime": 10},
                {"targetCell": 3, "travelTime": 5},
            ]},
            {"id": 2, "connections": [{"targetCell": 3, "travelTime": 10}]},
            {"id": 3, "connections": []},
        ])}
        dm = build_distance_matrix(maps)
        assert dm[("m1", 1)][("m1", 3)][0] == 5


# --- build_sense_matrix ---

class TestBuildSenseMatrix:
    def test_sense_blocked_excluded(self):
        """senseBlocked connections should not appear in sense matrix."""
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "senseBlocked": True, "travelTime": 10}]},
            {"id": 2, "connections": []},
        ])}
        sm = build_sense_matrix(maps)
        assert ("m1", 2) not in sm.get(("m1", 1), {})

    def test_sense_only_included(self):
        """senseOnly connections SHOULD appear in sense matrix."""
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "senseOnly": True, "travelTime": 10}]},
            {"id": 2, "connections": []},
        ])}
        sm = build_sense_matrix(maps)
        assert ("m1", 2) in sm.get(("m1", 1), {})

    def test_normal_connection_included(self):
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "travelTime": 10}]},
            {"id": 2, "connections": []},
        ])}
        sm = build_sense_matrix(maps)
        assert ("m1", 2) in sm.get(("m1", 1), {})

    def test_max_sense_distance_cutoff(self):
        """Connections beyond MAX_SENSE_DISTANCE (60) should not appear."""
        from game.map_engine import MAX_SENSE_DISTANCE
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "travelTime": MAX_SENSE_DISTANCE + 1}]},
            {"id": 2, "connections": []},
        ])}
        sm = build_sense_matrix(maps)
        assert ("m1", 2) not in sm.get(("m1", 1), {})

    def test_at_max_sense_distance_included(self):
        """Connections exactly at MAX_SENSE_DISTANCE should be included."""
        from game.map_engine import MAX_SENSE_DISTANCE
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "travelTime": MAX_SENSE_DISTANCE}]},
            {"id": 2, "connections": []},
        ])}
        sm = build_sense_matrix(maps)
        assert ("m1", 2) in sm.get(("m1", 1), {})

    def test_sense_only_plus_sense_blocked(self):
        """senseOnly + senseBlocked = no sense, no movement (meaningless combo)."""
        maps = {"m1": _make_map([
            {"id": 1, "connections": [{"targetCell": 2, "senseOnly": True, "senseBlocked": True, "travelTime": 10}]},
            {"id": 2, "connections": []},
        ])}
        # Should not appear in sense matrix (senseBlocked)
        sm = build_sense_matrix(maps)
        assert ("m1", 2) not in sm.get(("m1", 1), {})
        # Should not appear in distance matrix (senseOnly)
        dm = build_distance_matrix(maps)
        assert ("m1", 2) not in dm.get(("m1", 1), {})
