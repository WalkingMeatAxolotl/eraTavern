"""StagingLayer — incremental overlay for uncommitted entity edits.

Edits go into the staging layer instead of directly into GameState.
The game engine reads only active (non-staged) data.
Editors read merged (active + staged) data via ``merged_defs``.
On apply, ``persist_over`` merges staged data into GameState for disk write,
then ``load_world`` reloads everything from disk.
"""

from __future__ import annotations

import copy
from typing import Any

# Sentinel for marking entities as deleted in staging
_DELETED = object()


class StagingLayer:
    """Overlay buffer for uncommitted entity edits."""

    # All dict-type definition attributes mirroring GameState
    DICT_ATTRS = (
        "trait_defs",
        "clothing_defs",
        "item_defs",
        "action_defs",
        "trait_groups",
        "variable_defs",
        "event_defs",
        "lorebook_defs",
        "world_variable_defs",
        "character_data",
        "maps",
    )

    # All list-type definition attributes (replace-whole semantics)
    LIST_ATTRS = (
        "outfit_types",
        "item_tags",
        "variable_tags",
        "decor_presets",
    )

    def __init__(self) -> None:
        self._dicts: dict[str, dict[str, Any]] = {a: {} for a in self.DICT_ATTRS}
        self._lists: dict[str, Any] = {a: None for a in self.LIST_ATTRS}

    # ── Dict operations ──────────────────────────────────

    def put(self, attr: str, entity_id: str, data: dict) -> None:
        """Stage an entity create or update."""
        self._dicts[attr][entity_id] = data

    def delete(self, attr: str, entity_id: str) -> None:
        """Stage an entity deletion."""
        self._dicts[attr][entity_id] = _DELETED

    def get(self, attr: str, entity_id: str) -> Any:
        """Get a staged entity, or None if not staged."""
        val = self._dicts[attr].get(entity_id)
        if val is _DELETED:
            return _DELETED
        return val

    def has(self, attr: str, entity_id: str) -> bool:
        """Check if an entity is staged (including deletions)."""
        return entity_id in self._dicts[attr]

    def is_deleted(self, attr: str, entity_id: str) -> bool:
        """Check if an entity is staged for deletion."""
        return self._dicts[attr].get(entity_id) is _DELETED

    def merged_defs(
        self, attr: str, active_defs: dict[str, dict], *, mark_staged: bool = False
    ) -> dict[str, Any]:
        """Return active + staged merged dict (does NOT modify active).

        - Staged creates/updates override active entries.
        - Staged deletions remove active entries.
        - Active entries not in staging pass through unchanged.
        - If mark_staged=True, staged entries get ``_staged: True`` for UI display.
        """
        staged = self._dicts[attr]
        if not staged:
            return active_defs
        result = {}
        for eid, entry in active_defs.items():
            if eid in staged:
                if staged[eid] is not _DELETED:
                    if mark_staged:
                        result[eid] = {**staged[eid], "_staged": True}
                    else:
                        result[eid] = staged[eid]
                # else: deleted — omit from result
            else:
                result[eid] = entry
        # Add staged entries not in active (new creates)
        for eid, entry in staged.items():
            if eid not in active_defs and entry is not _DELETED:
                if mark_staged:
                    result[eid] = {**entry, "_staged": True}
                else:
                    result[eid] = entry
        return result

    # ── List operations ──────────────────────────────────

    def set_list(self, attr: str, data: Any) -> None:
        """Stage a list-type replacement (outfit_types, tags, etc.)."""
        self._lists[attr] = data

    def get_list(self, attr: str) -> Any:
        """Get a staged list, or None if not staged."""
        return self._lists[attr]

    def merged_list(self, attr: str, active_list: Any) -> Any:
        """Return staged list if set, otherwise active list."""
        staged = self._lists[attr]
        return staged if staged is not None else active_list

    # ── Bulk operations ──────────────────────────────────

    def is_empty(self) -> bool:
        """Check if staging has no pending changes."""
        for d in self._dicts.values():
            if d:
                return False
        for v in self._lists.values():
            if v is not None:
                return False
        return True

    def clear(self) -> None:
        """Discard all staged changes."""
        for a in self.DICT_ATTRS:
            self._dicts[a] = {}
        for a in self.LIST_ATTRS:
            self._lists[a] = None

    def persist_over(self, gs: Any) -> None:
        """Merge all staged changes into GameState's active dicts.

        Called only inside ``save_all`` just before writing to disk.
        After this call, the active dicts contain the merged state
        ready for ``_persist_entity_files()``.
        """
        for attr in self.DICT_ATTRS:
            staged = self._dicts[attr]
            if not staged:
                continue
            active = getattr(gs, attr)
            for eid, entry in staged.items():
                if entry is _DELETED:
                    active.pop(eid, None)
                else:
                    active[eid] = copy.deepcopy(entry)

        for attr in self.LIST_ATTRS:
            staged = self._lists[attr]
            if staged is not None:
                setattr(gs, attr, copy.deepcopy(staged))

    def staged_count(self) -> int:
        """Return total number of staged changes (for UI display)."""
        count = 0
        for d in self._dicts.values():
            count += len(d)
        for v in self._lists.values():
            if v is not None:
                count += 1
        return count
