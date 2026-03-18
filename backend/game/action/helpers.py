"""Shared constants and utilities for the action system."""

from __future__ import annotations

import math

TICK_MINUTES = 5
DISTANCE_PENALTY = 0.5  # desire reduction per minute of travel distance


def _snap_to_tick(minutes: int | float) -> int:
    """Snap a minute value up to the nearest multiple of TICK_MINUTES."""
    return max(TICK_MINUTES, math.ceil(minutes / TICK_MINUTES) * TICK_MINUTES)
