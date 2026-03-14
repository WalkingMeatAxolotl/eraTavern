// --- Map types ---

export interface MapGrid {
  text: string;
  color: string;
  cellId: number | null;
}

export interface Connection {
  targetCell: number;
  targetCellName: string;
  targetMap?: string;
  targetMapName?: string;
  travelTime?: number;
}

export interface MapCell {
  id: number;
  row: number;
  col: number;
  name?: string;
  description?: string;
  tags?: string[];
  backgroundImage?: string;
  connections: { targetCell: number; targetMap?: string; travelTime?: number; senseBlocked?: boolean }[];
}

export interface GameMap {
  id: string;
  name: string;
  description?: string;
  defaultColor: string;
  defaultBackgroundImage: string | null;
  grid: MapGrid[][];
  cells: MapCell[];
}

// --- Decor / Raw map types ---

export interface DecorPreset {
  text: string;
  color: string;
  source?: string;
}

export type RawMapGrid = string | [string, string];

export interface RawMapData {
  id: string;
  name: string;
  description?: string;
  defaultColor: string;
  defaultBackgroundImage?: string;
  backgroundImage?: string;
  grid: RawMapGrid[][];
  cells: MapCell[];
}

// --- World / Addon types ---

export interface WorldInfo {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  addons?: { id: string; version: string }[];
  playerCharacter?: string;
}

/** @deprecated Use WorldInfo */
export type GameInfo = WorldInfo;

export interface AddonInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  cover?: string;
  categories?: string[];
  dependencies?: { id: string; version: string }[];
}

export interface SessionInfo {
  worldId: string;
  worldName: string;
  addons: { id: string; version: string }[];
  playerCharacter: string;
  dirty: boolean;
}

// --- Character types ---

export interface BasicInfoField {
  label: string;
  type: "string" | "number";
  value: string | number;
}

export interface Resource {
  label: string;
  value: number;
  max: number;
  color: string;
}

export interface ClothingSlot {
  slot: string;
  slotLabel: string;
  occluded: boolean;
  itemId: string | null;
  itemName: string | null;
  state: "worn" | "halfWorn" | null;
}

export interface Trait {
  key: string;
  label: string;
  values: string[];
  multiple: boolean;
}

export interface Ability {
  key: string;
  label: string;
  exp: number;
  grade: string;
}

export interface ExperienceEntry {
  key: string;
  label: string;
  count: number;
  first: {
    event: string;
    location: string;
    target: string;
    time?: string;
  } | null;
}

export interface InventoryItem {
  itemId: string;
  name: string;
  tags: string[];
  amount: number;
}

export interface FavorabilityEntry {
  id: string;
  name: string;
  value: number;
}

export interface CharacterState {
  id: string;
  isPlayer: boolean;
  basicInfo: Record<string, BasicInfoField>;
  resources: Record<string, Resource>;
  clothing: ClothingSlot[];
  traits: Trait[];
  abilities: Ability[];
  experiences: ExperienceEntry[];
  inventory: InventoryItem[];
  position: { mapId: string; cellId: number };
  portrait?: string;
  favorability: FavorabilityEntry[];
}

// --- Trait / Clothing definition types ---

export interface TraitEffect {
  target: string;
  effect: "increase" | "decrease";
  magnitudeType: "fixed" | "percentage";
  value: number;
}

export interface AbilityDecay {
  amount: number;
  type: "fixed" | "percentage";
  intervalMinutes: number;
}

export interface TraitDefinition {
  id: string;
  name: string;
  category: string;
  description?: string;
  effects: TraitEffect[];
  defaultValue?: number;       // ability category: default exp value
  decay?: AbilityDecay | null;  // ability category: auto-decay settings
  source: string;
}

export interface ClothingDefinition {
  id: string;
  name: string;
  slot: string;
  occlusion: string[];
  effects?: TraitEffect[];
  source: string;
}

export interface TraitGroup {
  id: string;
  name: string;
  category: string;
  traits: string[];
  exclusive?: boolean;
  source: string;
}

// --- Item definition types ---

export interface ItemDefinition {
  id: string;
  name: string;
  tags: string[];
  description: string;
  maxStack: number;
  sellable: boolean;
  price: number;
  source: string;
}

// --- Derived variable types ---

export interface VariableStep {
  type: "ability" | "resource" | "basicInfo" | "traitCount" | "hasTrait" | "constant" | "variable";
  op?: "add" | "subtract" | "multiply" | "divide" | "min" | "max" | "clamp_min" | "clamp_max";
  key?: string;
  field?: "value" | "max";
  traitGroup?: string;
  traitId?: string;
  value?: number;
  varId?: string;
  label?: string;
}

export interface VariableDefinition {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  steps: VariableStep[];
  source: string;
}

// --- Action definition types ---

export interface ActionCondition {
  type: "location" | "npcPresent" | "npcAbsent" | "resource" | "ability" | "trait" | "noTrait" | "favorability" | "hasItem" | "clothing" | "time" | "basicInfo" | "variable" | "worldVar";
  condTarget?: "self" | "target";  // who to check: actor (default) or action target
  mapId?: string;
  cellIds?: number[];
  cellTags?: string[];
  npcId?: string;
  key?: string;
  op?: string;
  value?: number;
  traitId?: string;
  itemId?: string;
  tag?: string;
  slot?: string;
  state?: string;
  hourMin?: number;
  hourMax?: number;
  dayOfWeek?: string;
  season?: string;
  targetId?: string;
  varId?: string;
}

export type ConditionItem = ActionCondition | { and: ConditionItem[] } | { or: ConditionItem[] } | { not: ConditionItem };

export interface ActionCost {
  type: "resource" | "basicInfo" | "item";
  key?: string;
  itemId?: string;
  amount: number;
}

export interface ActionEffect {
  type: "resource" | "ability" | "basicInfo" | "favorability" | "trait" | "item" | "clothing" | "position" | "experience" | "worldVar";
  key?: string;
  op: string;
  value?: number | { varId: string; multiply?: number };
  valuePercent?: boolean;
  valueModifiers?: ValueModifier[];
  amount?: number;
  target?: string;
  targetId?: string;
  favFrom?: string;   // favorability: whose fav changes (self/{{targetId}}/npcId)
  favTo?: string;     // favorability: towards whom (self/{{targetId}}/npcId)
  traitId?: string;
  itemId?: string;
  slot?: string;
  state?: string;
  mapId?: string;
  cellId?: number;
}

export interface ValueModifier {
  type: "ability" | "trait" | "favorability" | "experience" | "variable" | "worldVar";
  key?: string;       // ability key, trait category key, or experience key
  value?: string;     // trait value to match
  source?: string;    // favorability: "target" (default) or "self"
  per?: number;       // every `per` points → bonus (ability/favorability/experience)
  bonus: number;
  bonusMode?: "add" | "multiply";  // "add" (default): +bonus, "multiply": *bonus%
  varId?: string;     // variable: derived variable ID
}

export type WeightModifier = ValueModifier;

export interface OutputTemplateEntry {
  text: string;
  conditions?: ConditionItem[];
  weight?: number;  // default 1, random among matching entries
}

export interface SuggestNext {
  actionId?: string;
  category?: string;
  bonus: number;
  decay: number;
}

export interface ActionOutcome {
  grade: string;
  label: string;
  weight: number;
  weightModifiers?: WeightModifier[];
  effects: ActionEffect[];
  suggestNext?: SuggestNext[];
  outputTemplate?: string;
  outputTemplates?: OutputTemplateEntry[];
}

// --- World variable types ---

export interface WorldVariableDefinition {
  id: string;
  name: string;
  description?: string;
  type: "number" | "boolean";
  default: number;
  source: string;
}

// --- Global event types ---

export interface EventDefinition {
  id: string;
  name: string;
  description?: string;
  triggerMode: "on_change" | "while" | "once";
  cooldown?: number;
  enabled?: boolean;
  targetScope: "each_character" | "none";
  conditions: ConditionItem[];
  effects: ActionEffect[];
  outputTemplate?: string;
  outputTemplates?: OutputTemplateEntry[];
  source: string;
}

export interface ActionDefinition {
  id: string;
  name: string;
  category: string;
  targetType: "none" | "npc" | "self";
  triggerLLM: boolean;
  timeCost: number;
  npcWeight: number;
  npcWeightModifiers?: WeightModifier[];
  conditions: ConditionItem[];
  costs: ActionCost[];
  outcomes: ActionOutcome[];
  outputTemplate?: string;
  outputTemplates?: OutputTemplateEntry[];
  source: string;
}

// --- Raw character config (for editing) ---

export interface RawCharacterData {
  id: string;
  template: string;
  isPlayer: boolean;
  active?: boolean;
  portrait?: string | null;
  basicInfo: Record<string, string | number>;
  resources?: Record<string, { value: number; max: number }>;
  clothing: Record<string, { itemId: string; state: "worn" | "halfWorn" }>;
  traits: Record<string, string[]>;
  abilities: Record<string, number>;
  experiences?: Record<string, { count: number; first?: { event: string; location: string; target: string } }>;
  inventory?: { itemId: string; amount: number }[];
  position: { mapId: string; cellId: number };
  restPosition?: { mapId: string; cellId: number };
  favorability?: Record<string, number>;
}

export interface MapSummary {
  id: string;
  name: string;
  cells: { id: number; name?: string; tags?: string[] }[];
}

export interface GameDefinitions {
  template: {
    id: string;
    name: string;
    basicInfo: { key: string; label: string; type: "string" | "number"; defaultValue: string | number }[];
    resources: { key: string; label: string; defaultMax: number; defaultValue: number; color: string }[];
    clothingSlots: string[];
    traits: { key: string; label: string; multiple: boolean }[];
    abilities: { key: string; label: string; defaultValue: number }[];
    experiences: { key: string; label: string }[];
    inventory: { key: string; label: string; maxSlots?: number }[];
  };
  clothingDefs: Record<string, ClothingDefinition>;
  itemDefs: Record<string, ItemDefinition>;
  traitDefs: Record<string, TraitDefinition>;
  traitGroups: Record<string, TraitGroup>;
  actionDefs: Record<string, ActionDefinition>;
  variableDefs: Record<string, VariableDefinition>;
  eventDefs: Record<string, EventDefinition>;
  worldVariableDefs: Record<string, WorldVariableDefinition>;
  maps: Record<string, MapSummary>;
  characters: Record<string, { id: string; name: string; isPlayer: boolean }>;
}

// --- Action types ---

export interface MoveTarget {
  targetCell: number;
  targetCellName: string;
  targetMap?: string;
  targetMapName?: string;
  travelTime?: number;
}

export interface GameAction {
  id: string;
  name: string;
  type: "move" | "look" | "configured";
  category?: string;
  targetType?: "none" | "npc" | "self";
  enabled?: boolean;
  disabledReason?: string;
  targets?: MoveTarget[];
}

// --- Time types ---

export interface GameTime {
  year: number;
  season: number;
  seasonName: string;
  day: number;
  totalDays: number;
  weekday: string;
  hour: number;
  minute: number;
  weatherId: string;
  weatherName: string;
  weatherIcon: string;
  temperature: number;
  displayText: string;
}

// --- Game state ---

export interface GameState {
  worldId: string;
  gameId: string;  // legacy alias for worldId
  time: GameTime;
  maps: Record<string, GameMap>;
  characters: Record<string, CharacterState>;
  template: unknown;
  dirty: boolean;
}

export interface ActionResult {
  success: boolean;
  message: string;
  newPosition?: { mapId: string; cellId: number };
  restored?: Record<string, { label: string; old: number; new: number; max: number }>;
  npcLog?: string[];
}
