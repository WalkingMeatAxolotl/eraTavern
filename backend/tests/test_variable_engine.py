"""Phase 1: Unit tests for variable_engine.py."""

from __future__ import annotations

from game.variable_engine import _apply_op, evaluate_variable, evaluate_variable_debug

# --- _apply_op tests ---


class TestApplyOp:
    def test_add(self):
        assert _apply_op("add", 10, 5) == 15

    def test_subtract(self):
        assert _apply_op("subtract", 10, 3) == 7

    def test_multiply(self):
        assert _apply_op("multiply", 10, 3) == 30

    def test_divide(self):
        assert _apply_op("divide", 10, 4) == 2.5

    def test_divide_by_zero(self):
        assert _apply_op("divide", 10, 0) == 0.0

    def test_min(self):
        assert _apply_op("min", 10, 3) == 3

    def test_max(self):
        assert _apply_op("max", 10, 3) == 10

    def test_floor(self):
        """floor: ensure result >= value."""
        assert _apply_op("floor", 5, 10) == 10
        assert _apply_op("floor", 15, 10) == 15

    def test_cap(self):
        """cap: ensure result <= value."""
        assert _apply_op("cap", 15, 10) == 10
        assert _apply_op("cap", 5, 10) == 5

    def test_unknown_op(self):
        assert _apply_op("unknown", 10, 5) == 10


# --- evaluate_variable tests ---


def _make_char_state(
    abilities=None,
    resources=None,
    basic_info=None,
    traits=None,
    experiences=None,
    inventory=None,
):
    return {
        "abilities": abilities or [],
        "resources": resources or {},
        "basicInfo": basic_info or {},
        "traits": traits or [],
        "experiences": experiences or [],
        "inventory": inventory or [],
    }


class TestEvaluateConstant:
    def test_single_constant(self):
        var_def = {"id": "v1", "steps": [{"type": "constant", "value": 42}]}
        assert evaluate_variable(var_def, {}, {}) == 42

    def test_constant_add(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "constant", "value": 10},
                {"type": "constant", "value": 5, "op": "add"},
            ],
        }
        assert evaluate_variable(var_def, {}, {}) == 15

    def test_default_op_is_add(self):
        """When op is omitted, should default to add."""
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "constant", "value": 10},
                {"type": "constant", "value": 5},  # no op field
            ],
        }
        assert evaluate_variable(var_def, {}, {}) == 15

    def test_constant_multiply(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "constant", "value": 10},
                {"type": "constant", "value": 3, "op": "multiply"},
            ],
        }
        assert evaluate_variable(var_def, {}, {}) == 30


class TestEvaluateAbility:
    def test_reads_exp(self):
        state = _make_char_state(abilities=[{"key": "sword", "exp": 500}])
        var_def = {"id": "v1", "steps": [{"type": "ability", "key": "sword"}]}
        assert evaluate_variable(var_def, state, {}) == 500

    def test_missing_ability(self):
        state = _make_char_state()
        var_def = {"id": "v1", "steps": [{"type": "ability", "key": "sword"}]}
        assert evaluate_variable(var_def, state, {}) == 0


class TestEvaluateResource:
    def test_reads_value(self):
        state = _make_char_state(resources={"hp": {"value": 80, "max": 100}})
        var_def = {"id": "v1", "steps": [{"type": "resource", "key": "hp"}]}
        assert evaluate_variable(var_def, state, {}) == 80

    def test_reads_max(self):
        state = _make_char_state(resources={"hp": {"value": 80, "max": 100}})
        var_def = {"id": "v1", "steps": [{"type": "resource", "key": "hp", "field": "max"}]}
        assert evaluate_variable(var_def, state, {}) == 100


class TestEvaluateBasicInfo:
    def test_reads_number(self):
        state = _make_char_state(basic_info={"age": {"type": "number", "value": 25}})
        var_def = {"id": "v1", "steps": [{"type": "basicInfo", "key": "age"}]}
        assert evaluate_variable(var_def, state, {}) == 25

    def test_non_number_returns_zero(self):
        state = _make_char_state(basic_info={"name": {"type": "string", "value": "Alice"}})
        var_def = {"id": "v1", "steps": [{"type": "basicInfo", "key": "name"}]}
        assert evaluate_variable(var_def, state, {}) == 0


class TestEvaluateTraitCount:
    def test_counts_traits(self):
        state = _make_char_state(traits=[{"key": "race", "values": ["human", "elf", "dwarf"]}])
        var_def = {"id": "v1", "steps": [{"type": "traitCount", "traitGroup": "race"}]}
        assert evaluate_variable(var_def, state, {}) == 3

    def test_empty_group(self):
        state = _make_char_state(traits=[{"key": "race", "values": []}])
        var_def = {"id": "v1", "steps": [{"type": "traitCount", "traitGroup": "race"}]}
        assert evaluate_variable(var_def, state, {}) == 0


class TestEvaluateHasTrait:
    def test_has_trait(self):
        state = _make_char_state(traits=[{"key": "race", "values": ["human"]}])
        var_def = {"id": "v1", "steps": [{"type": "hasTrait", "traitGroup": "race", "traitId": "human"}]}
        assert evaluate_variable(var_def, state, {}) == 1

    def test_missing_trait(self):
        state = _make_char_state(traits=[{"key": "race", "values": ["human"]}])
        var_def = {"id": "v1", "steps": [{"type": "hasTrait", "traitGroup": "race", "traitId": "elf"}]}
        assert evaluate_variable(var_def, state, {}) == 0


class TestEvaluateExperience:
    def test_reads_count(self):
        state = _make_char_state(experiences=[{"key": "praised", "count": 5}])
        var_def = {"id": "v1", "steps": [{"type": "experience", "key": "praised"}]}
        assert evaluate_variable(var_def, state, {}) == 5

    def test_zero_count(self):
        state = _make_char_state(experiences=[{"key": "praised", "count": 0}])
        var_def = {"id": "v1", "steps": [{"type": "experience", "key": "praised"}]}
        assert evaluate_variable(var_def, state, {}) == 0

    def test_missing_experience(self):
        state = _make_char_state()
        var_def = {"id": "v1", "steps": [{"type": "experience", "key": "praised"}]}
        assert evaluate_variable(var_def, state, {}) == 0


class TestEvaluateItemCount:
    def test_reads_amount(self):
        state = _make_char_state(inventory=[{"itemId": "potion", "amount": 3}])
        var_def = {"id": "v1", "steps": [{"type": "itemCount", "key": "potion"}]}
        assert evaluate_variable(var_def, state, {}) == 3

    def test_missing_item(self):
        state = _make_char_state()
        var_def = {"id": "v1", "steps": [{"type": "itemCount", "key": "potion"}]}
        assert evaluate_variable(var_def, state, {}) == 0


class TestEvaluateVariable:
    def test_cross_reference(self):
        state = _make_char_state(abilities=[{"key": "sword", "exp": 100}])
        all_vars = {
            "base": {"id": "base", "steps": [{"type": "ability", "key": "sword"}]},
            "derived": {
                "id": "derived",
                "steps": [
                    {"type": "variable", "varId": "base"},
                    {"type": "constant", "value": 2, "op": "multiply"},
                ],
            },
        }
        assert evaluate_variable(all_vars["derived"], state, all_vars) == 200

    def test_circular_reference(self):
        all_vars = {
            "a": {"id": "a", "steps": [{"type": "variable", "varId": "b"}]},
            "b": {"id": "b", "steps": [{"type": "variable", "varId": "a"}]},
        }
        # Should not infinite loop, returns 0
        result = evaluate_variable(all_vars["a"], {}, all_vars)
        assert result == 0

    def test_missing_ref(self):
        var_def = {"id": "v1", "steps": [{"type": "variable", "varId": "nonexistent"}]}
        assert evaluate_variable(var_def, {}, {}) == 0


class TestMultiStepFormula:
    def test_complex_formula(self):
        """sword_exp + magic_exp * 0.5, floor at 50, cap at 500."""
        state = _make_char_state(
            abilities=[
                {"key": "sword", "exp": 200},
                {"key": "magic", "exp": 100},
            ]
        )
        var_def = {
            "id": "power",
            "steps": [
                {"type": "ability", "key": "sword"},
                {"type": "ability", "key": "magic", "op": "add"},
                {"type": "constant", "value": 0.5, "op": "multiply"},
                {"type": "constant", "value": 50, "op": "floor"},
                {"type": "constant", "value": 500, "op": "cap"},
            ],
        }
        # (200 + 100) * 0.5 = 150, floor(50) = 150, cap(500) = 150
        assert evaluate_variable(var_def, state, {}) == 150

    def test_empty_steps(self):
        var_def = {"id": "v1", "steps": []}
        assert evaluate_variable(var_def, {}, {}) == 0


class TestEvaluateDebug:
    def test_returns_trace(self):
        var_def = {
            "id": "v1",
            "steps": [
                {"type": "constant", "value": 10, "label": "base"},
                {"type": "constant", "value": 5, "op": "add", "label": "bonus"},
            ],
        }
        result = evaluate_variable_debug(var_def, {}, {})
        assert result["result"] == 15
        assert len(result["steps"]) == 2
        # Step 0: init
        s0 = result["steps"][0]
        assert s0["index"] == 0
        assert s0["label"] == "base"
        assert s0["op"] == "(init)"
        assert s0["type"] == "constant"
        assert s0["stepValue"] == 10
        assert s0["accumulated"] == 10
        # Step 1: add
        s1 = result["steps"][1]
        assert s1["index"] == 1
        assert s1["label"] == "bonus"
        assert s1["op"] == "add"
        assert s1["type"] == "constant"
        assert s1["stepValue"] == 5
        assert s1["accumulated"] == 15
