"""Phase 1: Unit tests for character.py utility functions."""

from __future__ import annotations

from game.character import (
    SYMBOLIC_REFS,
    _strip_internal_fields,
    _strip_ref,
    exp_to_grade,
    namespace_id,
    resolve_ref,
    strip_character_namespaces,
    to_local_id,
    validate_local_id,
)


class TestNamespaceId:
    def test_basic(self):
        assert namespace_id("base", "human") == "base.human"

    def test_already_namespaced(self):
        """Should not double-namespace."""
        assert namespace_id("base", "base.human") == "base.human"

    def test_different_addon(self):
        assert namespace_id("addon2", "human") == "addon2.human"

    def test_empty_addon(self):
        assert namespace_id("", "human") == ".human"


class TestToLocalId:
    def test_strip_namespace(self):
        assert to_local_id("base.human") == "human"

    def test_no_namespace(self):
        assert to_local_id("human") == "human"

    def test_multiple_dots(self):
        assert to_local_id("base.sub.item") == "sub.item"


class TestResolveRef:
    def test_exact_match(self):
        defs = {"base.sword": {}, "base.shield": {}}
        assert resolve_ref("sword", defs, "base") == "base.sword"

    def test_already_namespaced(self):
        defs = {"base.sword": {}}
        assert resolve_ref("base.sword", defs, "base") == "base.sword"

    def test_cross_addon(self):
        defs = {"addon2.sword": {}}
        assert resolve_ref("addon2.sword", defs, "base") == "addon2.sword"

    def test_symbolic_refs_unchanged(self):
        """Symbolic refs like 'self' and '' are passed through _strip_ref,
        but resolve_ref may still namespace them if not found. Test _strip_ref instead."""
        for ref in SYMBOLIC_REFS:
            assert _strip_ref(ref, "base") == ref

    def test_not_found_uses_default(self):
        defs = {}
        result = resolve_ref("sword", defs, "base")
        assert result == "base.sword"


class TestValidateLocalId:
    def test_valid_id(self):
        assert validate_local_id("sword") is None

    def test_empty(self):
        assert validate_local_id("") is not None

    def test_dot_rejected(self):
        assert validate_local_id("my.sword") is not None

    def test_hyphen_ok(self):
        assert validate_local_id("my-sword") is None

    def test_underscore_ok(self):
        assert validate_local_id("my_sword") is None


class TestStripRef:
    """Tests for _strip_ref — cross-addon aware namespace stripping."""

    def test_same_addon_strips(self):
        assert _strip_ref("base.sword", "base") == "sword"

    def test_cross_addon_keeps(self):
        assert _strip_ref("addon2.sword", "base") == "addon2.sword"

    def test_symbolic_refs_unchanged(self):
        for ref in SYMBOLIC_REFS:
            assert _strip_ref(ref, "base") == ref

    def test_no_namespace(self):
        assert _strip_ref("sword", "base") == "sword"

    def test_empty_addon_id(self):
        """Empty addon_id should strip all namespaces."""
        assert _strip_ref("base.sword", "") == "sword"

    def test_empty_ref(self):
        assert _strip_ref("", "base") == ""


class TestStripInternalFields:
    def test_removes_source_and_local_id(self):
        entry = {"id": "sword", "name": "Sword", "source": "base", "_local_id": "sword"}
        result = _strip_internal_fields(entry)
        assert "source" not in result
        assert "_local_id" not in result
        assert result["id"] == "sword"
        assert result["name"] == "Sword"

    def test_preserves_other_fields(self):
        entry = {"id": "x", "tags": ["a"], "description": "test"}
        result = _strip_internal_fields(entry)
        assert result == entry


class TestExpToGrade:
    def test_zero(self):
        assert exp_to_grade(0) == "G"

    def test_boundaries(self):
        # GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"]
        assert exp_to_grade(0) == "G"
        assert exp_to_grade(999) == "G"
        assert exp_to_grade(1000) == "F"
        assert exp_to_grade(2000) == "E"
        assert exp_to_grade(7000) == "S"

    def test_very_high_caps_at_s(self):
        """Exp beyond 7000 still returns S (max grade)."""
        assert exp_to_grade(100000) == "S"


class TestStripCharacterNamespaces:
    """Test strip_character_namespaces with cross-addon awareness."""

    def test_same_addon_strips_traits(self):
        data = {"traits": {"race": ["base.human", "base.elf"]}}
        result = strip_character_namespaces(data, "base")
        assert result["traits"]["race"] == ["human", "elf"]

    def test_cross_addon_keeps_traits(self):
        data = {"traits": {"race": ["base.human", "addon2.dwarf"]}}
        result = strip_character_namespaces(data, "base")
        assert result["traits"]["race"] == ["human", "addon2.dwarf"]

    def test_clothing_strips(self):
        data = {"clothing": {"hat": {"itemId": "base.wizard_hat", "state": "worn"}}}
        result = strip_character_namespaces(data, "base")
        assert result["clothing"]["hat"]["itemId"] == "wizard_hat"

    def test_clothing_cross_addon(self):
        data = {"clothing": {"hat": {"itemId": "addon2.crown", "state": "worn"}}}
        result = strip_character_namespaces(data, "base")
        assert result["clothing"]["hat"]["itemId"] == "addon2.crown"

    def test_inventory_strips(self):
        data = {"inventory": [{"itemId": "base.potion", "amount": 3}]}
        result = strip_character_namespaces(data, "base")
        assert result["inventory"][0]["itemId"] == "potion"

    def test_position_strips(self):
        data = {"position": {"mapId": "base.tavern", "cellId": 1}}
        result = strip_character_namespaces(data, "base")
        assert result["position"]["mapId"] == "tavern"

    def test_favorability_strips(self):
        data = {"favorability": {"base.npc1": 100}}
        result = strip_character_namespaces(data, "base")
        assert "npc1" in result["favorability"]
        assert "base.npc1" not in result["favorability"]
