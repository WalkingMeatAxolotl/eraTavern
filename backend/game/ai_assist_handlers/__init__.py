"""AI Assist entity handler registry.

Each entity type has a handler with validate/create/update methods.
The registry is used by ai_assist.execute_tool for dispatch.
"""

from __future__ import annotations

from game.ai_assist_handlers.default import (
    _validate_field_values,
    execute_tool_batch_create,
    execute_tool_batch_update,
    execute_tool_create_entity,
    execute_tool_update_entity,
)

__all__ = [
    "execute_tool_create_entity",
    "execute_tool_batch_create",
    "execute_tool_update_entity",
    "execute_tool_batch_update",
    "_validate_field_values",
]
