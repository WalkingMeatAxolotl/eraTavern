"""Character system package — re-exports public API for backward compatibility.

External code can continue using:
    from game.character import build_character_state, namespace_id, load_trait_defs, ...
"""

from __future__ import annotations

# --- entity_loader.py ---
from .entity_loader import (  # noqa: F401
    SLOT_LABELS,
    AddonDirs,
    _load_json_safe,
    delete_character,
    load_action_defs,
    load_characters,
    load_clothing_defs,
    load_event_defs,
    load_item_defs,
    load_item_tags,
    load_lorebook_entries,
    load_outfit_types,
    load_template,
    load_trait_defs,
    load_trait_groups,
    load_variable_defs,
    load_variable_tags,
    load_world_variable_defs,
    save_action_defs_file,
    save_character,
    save_clothing_defs_file,
    save_event_defs_file,
    save_item_defs_file,
    save_item_tags_file,
    save_lorebook_file,
    save_trait_defs_file,
    save_trait_groups_file,
    save_variable_defs_file,
    save_variable_tags_file,
    save_world_variable_defs_file,
)

# --- namespace.py ---
from .namespace import (  # noqa: F401
    NS_SEP,
    SYMBOLIC_REFS,
    _strip_action_refs,
    _strip_internal_fields,
    _strip_ref,
    get_addon_from_id,
    namespace_action_refs,
    namespace_character_data,
    namespace_id,
    resolve_ref,
    strip_character_namespaces,
    to_local_id,
    validate_local_id,
)

# --- state.py ---
from .state import (  # noqa: F401
    BUILTIN_DIR,
    GRADES,
    _apply_all_effects,
    _apply_computed_effect,
    _collect_effects,
    apply_ability_decay,
    apply_clothing_effects,
    apply_trait_effects,
    build_character_state,
    build_clothing_state,
    exp_to_grade,
    get_ability_defs,
    get_experience_defs,
)
