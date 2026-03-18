"""Global event system: condition-triggered events with state machine modes (once/on_change/while)."""

from __future__ import annotations

from typing import Any

from .conditions import _evaluate_conditions
from .effects import _apply_effects
from .helpers import _snap_to_tick
from .templates import _resolve_template, _select_output_template


def _should_fire_event(
    mode: str,
    state: dict,
    key: str,
    matched: bool,
    current_time: int,
    event_def: dict,
) -> bool:
    """Determine whether an event should fire based on triggerMode."""
    if mode == "once":
        if key == "__global__":
            if state.get("fired", False):
                return False
        else:
            if key in state.get("fired_chars", []):
                return False
        return matched

    if mode == "on_change":
        last = state.get("last_match", {}).get(key, False)
        return matched and not last

    if mode == "while":
        if not matched:
            return False
        cooldown = _snap_to_tick(event_def.get("cooldown", 10))
        last_trigger = state.get("last_trigger", {}).get(key, -999999)
        return (current_time - last_trigger) >= cooldown

    return False


def _update_event_state(
    mode: str,
    state: dict,
    key: str,
    matched: bool,
    current_time: int,
    fired: bool,
) -> None:
    """Update event runtime state after evaluation."""
    if mode == "on_change":
        state.setdefault("last_match", {})[key] = matched

    if mode == "while" and fired:
        state.setdefault("last_trigger", {})[key] = current_time

    if mode == "once" and fired:
        if key == "__global__":
            state["fired"] = True
        else:
            state.setdefault("fired_chars", [])
            if key not in state["fired_chars"]:
                state["fired_chars"].append(key)


def evaluate_events(
    game_state: Any,
    scope_filter: str | None = None,
    char_filter: str | None = None,
) -> list[dict]:
    """Evaluate global events.

    scope_filter: only evaluate events with this targetScope ("each_character" / "none")
    char_filter: only evaluate this character (used inside NPC tick)

    Returns list of {event, charId, effects_summary, output} for each firing.
    """
    current_time = game_state.time.total_minutes
    results: list[dict] = []

    for event_def in game_state.event_defs.values():
        if not event_def.get("enabled", True):
            continue
        mode = event_def["triggerMode"]
        scope = event_def.get("targetScope", "none")
        if scope_filter and scope != scope_filter:
            continue

        event_id = event_def["id"]
        state = game_state.event_state.setdefault(event_id, {})

        if scope == "each_character":
            chars = (
                {char_filter: game_state.characters[char_filter]}
                if char_filter and char_filter in game_state.characters
                else game_state.characters
            )
            for char_id, char in chars.items():
                matched = _evaluate_conditions(
                    event_def.get("conditions", []),
                    char,
                    game_state,
                    char_id=char_id,
                )
                if _should_fire_event(mode, state, char_id, matched, current_time, event_def):
                    summaries = _apply_effects(
                        event_def.get("effects", []),
                        char,
                        game_state,
                        char_id,
                        None,
                    )
                    # Resolve output template
                    tpl = _select_output_template(event_def, char, game_state, char_id, None)
                    output = _resolve_template(tpl, char, None, game_state, None, summaries)
                    results.append(
                        {
                            "event": event_def["name"],
                            "charId": char_id,
                            "effectsSummary": summaries,
                            "output": output,
                        }
                    )
                    _update_event_state(mode, state, char_id, matched, current_time, True)
                else:
                    _update_event_state(mode, state, char_id, matched, current_time, False)

        elif scope == "none":
            # No character context — only global conditions (time, weather, worldVar)
            matched = _evaluate_global_conditions(event_def.get("conditions", []), game_state)
            if _should_fire_event(mode, state, "__global__", matched, current_time, event_def):
                summaries = _apply_effects(
                    event_def.get("effects", []),
                    {},
                    game_state,
                    "",
                    None,
                )
                tpl = _select_output_template(event_def, {}, game_state, "", None)
                output = _resolve_template(tpl, {}, None, game_state, None, summaries)
                results.append(
                    {
                        "event": event_def["name"],
                        "charId": None,
                        "effectsSummary": summaries,
                        "output": output,
                    }
                )
                _update_event_state(mode, state, "__global__", matched, current_time, True)
            else:
                _update_event_state(mode, state, "__global__", matched, current_time, False)

    return results


def _evaluate_global_conditions(
    conditions: list,
    game_state: Any,
) -> bool:
    """Evaluate conditions that don't require a character context.

    Only time, weather, and worldVar conditions are meaningful here.
    Other condition types that need a character will pass by default.
    """
    # Use an empty dict as the "character" — leaf conditions that need
    # character data will simply not match, which is correct for scope=none.
    return _evaluate_conditions(conditions, {}, game_state)
