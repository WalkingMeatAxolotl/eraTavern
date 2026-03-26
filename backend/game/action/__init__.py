"""Action system package — re-exports public API for backward compatibility.

External code can continue using:
    from game.action import execute_action, get_available_actions, evaluate_events
"""

from __future__ import annotations

from .ai_templates import TEMPLATES as AI_TEMPLATES
from .ai_templates import expand_template
from .conditions import _check_costs, _compare, _evaluate_conditions
from .effects import _apply_costs, _apply_effects, _resolve_effect_targets
from .events import _should_fire_event, _update_event_state, evaluate_events
from .execution import execute_action, get_available_actions
from .helpers import TICK_MINUTES, _snap_to_tick
from .ir_compiler import (
    ClauseError,
    compile_action_ir,
    compile_condition_clause,
    compile_effect_clause,
    compile_event_ir,
)
from .modifiers import _calc_modifier_bonus, _roll_outcome
from .npc import (
    _build_suggest_map,
    _npc_choose_action,
    _npc_tick,
    build_cell_action_index,
    filter_visible_npc_log,
    simulate_npc_ticks,
)
from .templates import _resolve_template, _select_output_template
from .validator import ValidationMessage, validate_action, validate_event

__all__ = [
    # execution
    "execute_action",
    "get_available_actions",
    # conditions
    "_evaluate_conditions",
    "_check_costs",
    "_compare",
    # effects
    "_apply_effects",
    "_apply_costs",
    "_resolve_effect_targets",
    # modifiers
    "_calc_modifier_bonus",
    "_roll_outcome",
    # templates
    "_select_output_template",
    "_resolve_template",
    # npc
    "TICK_MINUTES",
    "_snap_to_tick",
    "build_cell_action_index",
    "simulate_npc_ticks",
    "filter_visible_npc_log",
    "_npc_tick",
    "_npc_choose_action",
    "_build_suggest_map",
    # events
    "evaluate_events",
    "_should_fire_event",
    "_update_event_state",
    # validator
    "validate_action",
    "validate_event",
    "ValidationMessage",
    # ir compiler
    "compile_action_ir",
    "compile_event_ir",
    "compile_condition_clause",
    "compile_effect_clause",
    "ClauseError",
    # ai templates
    "expand_template",
    "AI_TEMPLATES",
]
