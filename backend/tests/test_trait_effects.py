"""Phase 1: Unit tests for trait/clothing effect calculation."""

from __future__ import annotations

from game.character import _apply_all_effects, _collect_effects


class TestCollectEffects:
    def test_fixed_increase(self):
        fd, pm = {}, {}
        _collect_effects([
            {"target": "stamina", "effect": "increase", "magnitudeType": "fixed", "value": 20},
        ], fd, pm)
        assert fd["stamina"] == 20

    def test_fixed_decrease(self):
        fd, pm = {}, {}
        _collect_effects([
            {"target": "stamina", "effect": "decrease", "magnitudeType": "fixed", "value": 10},
        ], fd, pm)
        assert fd["stamina"] == -10

    def test_percentage_increase(self):
        fd, pm = {}, {}
        _collect_effects([
            {"target": "stamina", "effect": "increase", "magnitudeType": "percentage", "value": 120},
        ], fd, pm)
        assert pm["stamina"] == [1.2]  # 120/100 = 1.2

    def test_percentage_decrease(self):
        fd, pm = {}, {}
        _collect_effects([
            {"target": "stamina", "effect": "decrease", "magnitudeType": "percentage", "value": 120},
        ], fd, pm)
        assert pm["stamina"] == [0.8]  # 2.0 - 1.2 = 0.8

    def test_multiple_fixed_accumulate(self):
        fd, pm = {}, {}
        _collect_effects([
            {"target": "stamina", "effect": "increase", "magnitudeType": "fixed", "value": 10},
            {"target": "stamina", "effect": "increase", "magnitudeType": "fixed", "value": 5},
        ], fd, pm)
        assert fd["stamina"] == 15


class TestApplyAllEffects:
    """Test additive percentage stacking model."""

    def test_single_percentage(self):
        fd = {}
        pm = {"stamina": [1.2]}  # +20%
        state = {"resources": {"stamina": {"value": 100, "max": 100}}}
        _apply_all_effects(state, fd, pm)
        assert state["resources"]["stamina"]["max"] == 120  # 100 * 1.2

    def test_additive_stacking(self):
        """Two +20% should = +40% (not 1.2 * 1.2 = 1.44)."""
        fd = {}
        pm = {"stamina": [1.2, 1.2]}  # two +20%
        state = {"resources": {"stamina": {"value": 100, "max": 100}}}
        _apply_all_effects(state, fd, pm)
        # Additive: 1.0 + (0.2 + 0.2) = 1.4 → 100 * 1.4 = 140
        assert state["resources"]["stamina"]["max"] == 140

    def test_mixed_increase_decrease(self):
        """One +20% and one -20% should cancel out."""
        fd = {}
        pm = {"stamina": [1.2, 0.8]}  # +20% and -20%
        state = {"resources": {"stamina": {"value": 100, "max": 100}}}
        _apply_all_effects(state, fd, pm)
        # Additive: 1.0 + (0.2 + -0.2) = 1.0 → 100
        assert state["resources"]["stamina"]["max"] == 100

    def test_fixed_plus_percentage(self):
        """Fixed delta applied before percentage."""
        fd = {"stamina": 50}
        pm = {"stamina": [1.2]}  # +20%
        state = {"resources": {"stamina": {"value": 100, "max": 100}}}
        _apply_all_effects(state, fd, pm)
        # (100 + 50) * 1.2 = 180
        assert state["resources"]["stamina"]["max"] == 180

    def test_fixed_only(self):
        fd = {"stamina": 30}
        pm = {}
        state = {"resources": {"stamina": {"value": 100, "max": 100}}}
        _apply_all_effects(state, fd, pm)
        assert state["resources"]["stamina"]["max"] == 130

    def test_int_truncation(self):
        """Result should be int-truncated per doc: int((base + fixed) * multiplier)."""
        fd = {"stamina": 1}
        pm = {"stamina": [1.5]}  # +50%
        state = {"resources": {"stamina": {"value": 100, "max": 100}}}
        _apply_all_effects(state, fd, pm)
        # (100 + 1) * 1.5 = 151.5 → int = 151
        assert state["resources"]["stamina"]["max"] == 151

    def test_value_clamped_by_max(self):
        """After max changes, value should not exceed new max."""
        fd = {"stamina": -50}
        pm = {}
        state = {"resources": {"stamina": {"value": 80, "max": 100}}}
        _apply_all_effects(state, fd, pm)
        # max = 100 + (-50) = 50, value was 80 → clamped to 50
        assert state["resources"]["stamina"]["max"] == 50
        assert state["resources"]["stamina"]["value"] == 50

    def test_ability_target(self):
        fd = {"technique": 100}
        pm = {}
        state = {"abilities": [{"key": "technique", "exp": 500, "grade": "D"}]}
        _apply_all_effects(state, fd, pm)
        assert state["abilities"][0]["exp"] == 600

    def test_basic_info_target(self):
        fd = {"money": 50}
        pm = {}
        state = {"basicInfo": {"money": {"type": "number", "value": 100}}}
        _apply_all_effects(state, fd, pm)
        assert state["basicInfo"]["money"]["value"] == 150
