"""Centralized constants for game logic — eliminates magic strings across modules."""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Shared entity field names (used across conditions, effects, modifiers, costs, variable steps)
# ---------------------------------------------------------------------------
class EF:
    """EntityField — game data field identifiers shared by multiple subsystems."""

    RESOURCE = "resource"
    ABILITY = "ability"
    BASIC_INFO = "basicInfo"
    EXPERIENCE = "experience"
    FAVORABILITY = "favorability"
    TRAIT = "trait"
    CLOTHING = "clothing"
    OUTFIT = "outfit"
    VARIABLE = "variable"
    WORLD_VAR = "worldVar"
    HAS_ITEM = "hasItem"
    ITEM = "item"


# ---------------------------------------------------------------------------
# Condition types — EF values + condition-only types
# ---------------------------------------------------------------------------
class ConditionType(EF):
    LOCATION = "location"
    NPC_PRESENT = "npcPresent"
    NPC_ABSENT = "npcAbsent"
    TIME = "time"
    NO_TRAIT = "noTrait"


# ---------------------------------------------------------------------------
# Effect types — EF values + effect-only types
# ---------------------------------------------------------------------------
class EffectType(EF):
    POSITION = "position"


# ---------------------------------------------------------------------------
# Modifier types — all values are in EF, kept for semantic clarity
# ---------------------------------------------------------------------------
class ModifierType(EF):
    TIME = "time"


# ---------------------------------------------------------------------------
# Cost types — subset of EF
# ---------------------------------------------------------------------------
class CostType:
    RESOURCE = EF.RESOURCE
    BASIC_INFO = EF.BASIC_INFO
    ITEM = EF.ITEM


# ---------------------------------------------------------------------------
# Variable step types — EF values + step-only types
# ---------------------------------------------------------------------------
class VarStepType(EF):
    CONSTANT = "constant"
    TRAIT_COUNT = "traitCount"
    HAS_TRAIT = "hasTrait"
    ITEM_COUNT = "itemCount"


# ---------------------------------------------------------------------------
# Effect / cost operations
# ---------------------------------------------------------------------------
class EffectOp:
    ADD = "add"
    SET = "set"
    REMOVE = "remove"
    SWITCH = "switch"


# ---------------------------------------------------------------------------
# Bonus modes (how modifier bonus is applied)
# ---------------------------------------------------------------------------
class BonusMode:
    ADD = "add"
    MULTIPLY = "multiply"


# ---------------------------------------------------------------------------
# Comparison operators
# ---------------------------------------------------------------------------
class CompareOp:
    GTE = ">="
    LTE = "<="
    GT = ">"
    LT = "<"
    EQ = "=="
    NE = "!="


# ---------------------------------------------------------------------------
# Arithmetic operators (variable engine steps)
# ---------------------------------------------------------------------------
class ArithOp:
    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"
    MIN = "min"
    MAX = "max"
    FLOOR = "floor"
    CAP = "cap"


# ---------------------------------------------------------------------------
# Clothing / wear states
# ---------------------------------------------------------------------------
class ClothingState:
    WORN = "worn"
    HALF_WORN = "halfWorn"
    OFF = "off"
    EMPTY = "empty"


# ---------------------------------------------------------------------------
# Event trigger modes
# ---------------------------------------------------------------------------
class TriggerMode:
    ONCE = "once"
    ON_CHANGE = "on_change"
    WHILE = "while"


# ---------------------------------------------------------------------------
# Event target scopes
# ---------------------------------------------------------------------------
class EventScope:
    EACH_CHARACTER = "each_character"
    NONE = "none"


# ---------------------------------------------------------------------------
# Seasons & days of week (enum values for time conditions)
# ---------------------------------------------------------------------------
class Season:
    SPRING = "spring"
    SUMMER = "summer"
    AUTUMN = "autumn"
    WINTER = "winter"

    ALL = ["spring", "summer", "autumn", "winter"]


class DayOfWeek:
    MON = "mon"
    TUE = "tue"
    WED = "wed"
    THU = "thu"
    FRI = "fri"
    SAT = "sat"
    SUN = "sun"

    ALL = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


# ---------------------------------------------------------------------------
# Built-in action types
# ---------------------------------------------------------------------------
class ActionType:
    MOVE = "move"
    LOOK = "look"
    CHANGE_OUTFIT = "changeOutfit"
    CONFIGURED = "configured"


# ---------------------------------------------------------------------------
# Action target types
# ---------------------------------------------------------------------------
class TargetType:
    NONE = "none"
    NPC = "npc"


# ---------------------------------------------------------------------------
# Condition / modifier target (which character to evaluate against)
# ---------------------------------------------------------------------------
class CondTarget:
    SELF = "self"
    TARGET = "target"


# ---------------------------------------------------------------------------
# Effect direction (trait / clothing effects on stats)
# ---------------------------------------------------------------------------
class EffectDirection:
    INCREASE = "increase"
    DECREASE = "decrease"


# ---------------------------------------------------------------------------
# Magnitude types (trait / clothing effect magnitude)
# ---------------------------------------------------------------------------
class MagnitudeType:
    FIXED = "fixed"
    PERCENTAGE = "percentage"


# ---------------------------------------------------------------------------
# Lorebook insert modes
# ---------------------------------------------------------------------------
class LorebookMode:
    ALWAYS = "always"
    KEYWORD = "keyword"


# ---------------------------------------------------------------------------
# Prompt label keys (for LLM prompt text from template.promptLabels)
# ---------------------------------------------------------------------------
class PL:
    """PromptLabel keys — used with _pl(game_state, PL.xxx)."""

    MONEY = "money"
    TRAITS = "traits"
    ABILITIES = "abilities"
    EXPERIENCES = "experiences"
    CLOTHING = "clothing"
    INVENTORY = "inventory"
    FAVORABILITY = "favorability"
    VARIABLES = "variables"
    WORN = "worn"
    HALF_WORN = "halfWorn"
    OFF = "off"
    OCCLUDED = "occluded"
    NONE = "none"
    IDLE = "idle"
    TRAVELING = "traveling"
    EXP_UNIT = "expUnit"
    DEFAULT_OUTFIT = "defaultOutfit"
