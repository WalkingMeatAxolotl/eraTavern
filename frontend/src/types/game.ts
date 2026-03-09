// --- Map types ---

export interface GridCell {
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
  tags?: string[];
  backgroundImage?: string;
  connections: { targetCell: number; targetMap?: string; travelTime?: number }[];
}

export interface GameMap {
  id: string;
  name: string;
  defaultColor: string;
  defaultBackgroundImage: string | null;
  grid: GridCell[][];
  cells: MapCell[];
}

// --- Decor / Raw map types ---

export interface DecorPreset {
  text: string;
  color: string;
  source?: "builtin" | "game";
}

export type RawGridCell = string | [string, string];

export interface RawMapData {
  id: string;
  name: string;
  defaultColor: string;
  defaultBackgroundImage?: string;
  grid: RawGridCell[][];
  cells: MapCell[];
}

// --- Game package types ---

export interface GameInfo {
  id: string;
  name: string;
  description: string;
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
  source: "builtin" | "game";
}

export interface ClothingDefinition {
  id: string;
  name: string;
  slot: string;
  occlusion: string[];
  effects?: TraitEffect[];
  source: "builtin" | "game";
}

export interface TraitGroup {
  id: string;
  name: string;
  category: string;
  traits: string[];
  source: "builtin" | "game";
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
  source: "builtin" | "game";
}

// --- Action definition types ---

export interface ActionCondition {
  type: "location" | "npcPresent" | "npcAbsent" | "resource" | "ability" | "trait" | "noTrait" | "favorability" | "hasItem" | "clothing" | "time" | "basicInfo";
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
}

export type ConditionItem = ActionCondition | { and: ConditionItem[] } | { or: ConditionItem[] } | { not: ConditionItem };

export interface ActionCost {
  type: "resource" | "basicInfo" | "item";
  key?: string;
  itemId?: string;
  amount: number;
}

export interface ActionEffect {
  type: "resource" | "ability" | "basicInfo" | "favorability" | "trait" | "item" | "clothing" | "position" | "experience";
  key?: string;
  op: string;
  value?: number;
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
  type: "ability" | "trait" | "favorability" | "experience";
  key?: string;       // ability key, trait category key, or experience key
  value?: string;     // trait value to match
  source?: string;    // favorability: "target" (default) or "self"
  per?: number;       // every `per` points → bonus (ability/favorability/experience)
  bonus: number;
  bonusMode?: "add" | "multiply";  // "add" (default): +bonus, "multiply": *bonus%
}

export type WeightModifier = ValueModifier;

export interface OutputTemplateEntry {
  text: string;
  conditions?: ConditionItem[];
  weight?: number;  // default 1, random among matching entries
}

export interface ActionOutcome {
  grade: string;
  label: string;
  weight: number;
  weightModifiers?: WeightModifier[];
  effects: ActionEffect[];
  outputTemplate?: string;
  outputTemplates?: OutputTemplateEntry[];
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
  source: "builtin" | "game";
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
  gameId: string;
  time: GameTime;
  maps: Record<string, GameMap>;
  characters: Record<string, CharacterState>;
  template: unknown;
}

export interface ActionResult {
  success: boolean;
  message: string;
  newPosition?: { mapId: string; cellId: number };
  restored?: Record<string, { label: string; old: number; new: number; max: number }>;
  npcLog?: string[];
}
