/** Centralized constants — mirrors backend game/constants.py */

// ---------------------------------------------------------------------------
// Shared entity field names (used across conditions, effects, modifiers, costs, variable steps)
// ---------------------------------------------------------------------------
export const EF = {
  RESOURCE: "resource",
  ABILITY: "ability",
  BASIC_INFO: "basicInfo",
  EXPERIENCE: "experience",
  FAVORABILITY: "favorability",
  TRAIT: "trait",
  CLOTHING: "clothing",
  OUTFIT: "outfit",
  VARIABLE: "variable",
  WORLD_VAR: "worldVar",
  HAS_ITEM: "hasItem",
  ITEM: "item",
} as const;

// ---------------------------------------------------------------------------
// Condition types — EF values + condition-only types
// ---------------------------------------------------------------------------
export const CondType = {
  ...EF,
  LOCATION: "location",
  NPC_PRESENT: "npcPresent",
  NPC_ABSENT: "npcAbsent",
  TIME: "time",
  NO_TRAIT: "noTrait",
} as const;

// ---------------------------------------------------------------------------
// Effect types — EF values + effect-only types
// ---------------------------------------------------------------------------
export const EffType = {
  ...EF,
  POSITION: "position",
} as const;

// ---------------------------------------------------------------------------
// Variable step types — EF values + step-only types
// ---------------------------------------------------------------------------
export const VarStepType = {
  ...EF,
  CONSTANT: "constant",
  TRAIT_COUNT: "traitCount",
  HAS_TRAIT: "hasTrait",
  ITEM_COUNT: "itemCount",
} as const;

// ---------------------------------------------------------------------------
// Effect / cost operations
// ---------------------------------------------------------------------------
export const EffectOp = {
  ADD: "add",
  SET: "set",
  REMOVE: "remove",
  SWITCH: "switch",
} as const;

// ---------------------------------------------------------------------------
// Bonus modes (how modifier bonus is applied)
// ---------------------------------------------------------------------------
export const BonusMode = {
  ADD: "add",
  MULTIPLY: "multiply",
} as const;

// ---------------------------------------------------------------------------
// Clothing / wear states
// ---------------------------------------------------------------------------
export const ClothingState = {
  WORN: "worn",
  HALF_WORN: "halfWorn",
  OFF: "off",
  EMPTY: "empty",
} as const;

// ---------------------------------------------------------------------------
// Condition / modifier target (which character to evaluate against)
// ---------------------------------------------------------------------------
export const CondTarget = {
  SELF: "self",
  TARGET: "target",
} as const;

// ---------------------------------------------------------------------------
// Action target types
// ---------------------------------------------------------------------------
export const TargetType = {
  NONE: "none",
  NPC: "npc",
} as const;

// ---------------------------------------------------------------------------
// Event trigger modes
// ---------------------------------------------------------------------------
export const TriggerMode = {
  ONCE: "once",
  ON_CHANGE: "on_change",
  WHILE: "while",
} as const;

// ---------------------------------------------------------------------------
// Event target scopes
// ---------------------------------------------------------------------------
export const EventScope = {
  EACH_CHARACTER: "each_character",
  NONE: "none",
} as const;

// ---------------------------------------------------------------------------
// Seasons & days of week (enum values for time conditions)
// ---------------------------------------------------------------------------
export const Season = {
  SPRING: "spring",
  SUMMER: "summer",
  AUTUMN: "autumn",
  WINTER: "winter",
} as const;

export const DayOfWeek = {
  MON: "mon",
  TUE: "tue",
  WED: "wed",
  THU: "thu",
  FRI: "fri",
  SAT: "sat",
  SUN: "sun",
} as const;

// ---------------------------------------------------------------------------
// Built-in action types
// ---------------------------------------------------------------------------
export const ActionType = {
  MOVE: "move",
  LOOK: "look",
  CHANGE_OUTFIT: "changeOutfit",
  CONFIGURED: "configured",
} as const;

// ---------------------------------------------------------------------------
// Effect direction (trait / clothing effects on stats)
// ---------------------------------------------------------------------------
export const EffectDirection = {
  INCREASE: "increase",
  DECREASE: "decrease",
} as const;

// ---------------------------------------------------------------------------
// Magnitude types (trait / clothing effect magnitude)
// ---------------------------------------------------------------------------
export const MagnitudeType = {
  FIXED: "fixed",
  PERCENTAGE: "percentage",
} as const;

// ---------------------------------------------------------------------------
// Arithmetic operators (variable engine steps)
// ---------------------------------------------------------------------------
export const ArithOp = {
  ADD: "add",
  SUBTRACT: "subtract",
  MULTIPLY: "multiply",
  DIVIDE: "divide",
  MIN: "min",
  MAX: "max",
  FLOOR: "floor",
  CAP: "cap",
} as const;

// ---------------------------------------------------------------------------
// Lorebook insert modes
// ---------------------------------------------------------------------------
export const LorebookMode = {
  ALWAYS: "always",
  KEYWORD: "keyword",
} as const;
