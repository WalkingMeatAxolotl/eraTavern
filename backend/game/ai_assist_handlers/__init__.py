"""AI Assist entity handler registry.

Each entity type has an EntityHandler with validate/create/update/compile methods.
The ENTITY_HANDLERS registry is used by ai_assist.execute_tool for dispatch.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from game.state import GameState

# Type aliases for handler signatures
ValidateFn = Callable[[GameState, dict], Optional[str]]
CreateFn = Callable[..., dict[str, Any]]  # (gs, entity_type, data, *, target_addon) -> result
UpdateFn = Callable[[GameState, str, str, dict], dict[str, Any]]  # (gs, type, id, fields)
CompileFn = Callable[[GameState, dict], tuple[dict, list[str]]]


@dataclass
class EntityHandler:
    """Handler for a single entity type's CRUD operations."""

    validate: ValidateFn
    create: CreateFn
    update: UpdateFn
    compile: Optional[CompileFn] = field(default=None)


# ---------------------------------------------------------------------------
# Import handler functions
# ---------------------------------------------------------------------------

from game.ai_assist_handlers.character import char_create, char_update, char_validate
from game.ai_assist_handlers.default import (
    _validate_field_values,
    batch_create,
    batch_update,
    default_create,
    default_update,
    normalize_entity_id,
    outfit_create,
    outfit_update,
    wvar_create,
)

# ---------------------------------------------------------------------------
# Validation wrappers (combine default + type-specific)
# ---------------------------------------------------------------------------


def _default_validate(gs: GameState, data: dict) -> Optional[str]:
    """Default validation: field values only."""
    # entity_type is not available here — _validate_field_values is called
    # inside create/update with the correct entity_type.
    return None


def _char_validate_combined(gs: GameState, data: dict) -> Optional[str]:
    """Character validation: field values + character-specific refs."""
    return char_validate(gs, data)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

ENTITY_HANDLERS: dict[str, EntityHandler] = {
    "item": EntityHandler(validate=_default_validate, create=default_create, update=default_update),
    "trait": EntityHandler(validate=_default_validate, create=default_create, update=default_update),
    "clothing": EntityHandler(validate=_default_validate, create=default_create, update=default_update),
    "traitGroup": EntityHandler(validate=_default_validate, create=default_create, update=default_update),
    "outfitType": EntityHandler(validate=_default_validate, create=outfit_create, update=outfit_update),
    "lorebook": EntityHandler(validate=_default_validate, create=default_create, update=default_update),
    "worldVariable": EntityHandler(validate=_default_validate, create=wvar_create, update=default_update),
    "character": EntityHandler(validate=_char_validate_combined, create=char_create, update=char_update),
    "action": EntityHandler(validate=_default_validate, create=default_create, update=default_update),
    "event": EntityHandler(validate=_default_validate, create=default_create, update=default_update),
}


__all__ = [
    "EntityHandler",
    "ENTITY_HANDLERS",
    "_validate_field_values",
    "batch_create",
    "batch_update",
    "normalize_entity_id",
]
