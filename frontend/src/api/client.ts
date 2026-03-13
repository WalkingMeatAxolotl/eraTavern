import type { GameState, GameAction, ActionResult, WorldInfo, GameDefinitions, RawCharacterData, TraitDefinition, TraitGroup, ClothingDefinition, ItemDefinition, ActionDefinition, VariableDefinition, EventDefinition, WorldVariableDefinition, DecorPreset, RawMapData, SessionInfo } from "../types/game";

const API_BASE = "/api/game";

export interface AppConfig {
  maxWidth: number;
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  return res.json();
}

export async function fetchWorlds(): Promise<WorldInfo[]> {
  const res = await fetch("/api/worlds");
  if (!res.ok) throw new Error(`Failed to fetch worlds: ${res.status}`);
  const data = await res.json();
  return data.worlds;
}

export async function selectWorld(worldId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/worlds/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worldId }),
  });
  if (!res.ok) throw new Error(`Failed to select world: ${res.status}`);
  return res.json();
}

// --- Session & Addon APIs ---

export async function fetchSession(): Promise<SessionInfo> {
  const res = await fetch("/api/session");
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  return res.json();
}

export async function fetchAddons(): Promise<AddonInfo[]> {
  const res = await fetch("/api/addons");
  if (!res.ok) throw new Error(`Failed to fetch addons: ${res.status}`);
  const data = await res.json();
  return data.addons ?? [];
}

export async function unloadWorld(): Promise<{ success: boolean }> {
  const res = await fetch("/api/worlds/unload", { method: "POST" });
  if (!res.ok) throw new Error(`Failed to unload world: ${res.status}`);
  return res.json();
}

export async function updateSessionAddons(addons: { id: string; version: string }[]): Promise<{ success: boolean }> {
  const res = await fetch("/api/session/addons", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addons }),
  });
  if (!res.ok) throw new Error(`Failed to update addons: ${res.status}`);
  return res.json();
}

export async function createWorld(id: string, name: string, addons: { id: string; version: string }[]): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/worlds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, addons }),
  });
  return res.json();
}

export async function updateWorld(worldId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/worlds/${worldId}`, { method: "PUT" });
  return res.json();
}

export async function saveSession(
  addons?: { id: string; version: string }[],
): Promise<{ success: boolean; message: string }> {
  const body: Record<string, unknown> = {};
  if (addons !== undefined) body.addons = addons;
  const res = await fetch("/api/session/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function saveSessionAs(id: string, name: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/session/save-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name }),
  });
  return res.json();
}

export async function deleteWorld(worldId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
  return res.json();
}

export async function updateWorldMeta(worldId: string, data: { name?: string; description?: string; cover?: string }): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/worlds/${encodeURIComponent(worldId)}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateAddonMeta(addonId: string, version: string, data: { name?: string; description?: string; author?: string; cover?: string; categories?: string[] }): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/${encodeURIComponent(version)}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function createAddon(data: { id: string; name: string; version?: string; description?: string; author?: string }): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/addon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteAddon(addonId: string, version: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/${encodeURIComponent(version)}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function deleteAddonAll(addonId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}`, {
    method: "DELETE",
  });
  return res.json();
}



/** @deprecated Use fetchWorlds */
export const fetchGames = fetchWorlds;
/** @deprecated Use selectWorld */
export async function selectGame(gameId: string) { return selectWorld(gameId); }

export async function restartGame(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/restart`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to restart game: ${res.status}`);
  return res.json();
}

export async function fetchGameState(): Promise<GameState> {
  const res = await fetch(`${API_BASE}/state`);
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`);
  return res.json();
}

export async function fetchActions(characterId: string, targetId?: string | null): Promise<{ actions: GameAction[] }> {
  const params = targetId ? `?target_id=${encodeURIComponent(targetId)}` : "";
  const res = await fetch(`${API_BASE}/available-actions/${characterId}${params}`);
  if (!res.ok) throw new Error(`Failed to fetch actions: ${res.status}`);
  return res.json();
}

export async function performAction(
  characterId: string,
  type: string,
  targetCell?: number,
  targetMap?: string,
  actionId?: string,
  targetId?: string,
): Promise<ActionResult> {
  const res = await fetch(`${API_BASE}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, type, actionId, targetCell, targetMap, targetId }),
  });
  if (!res.ok) throw new Error(`Failed to perform action: ${res.status}`);
  return res.json();
}

// --- Character config CRUD ---

export async function fetchDefinitions(): Promise<GameDefinitions> {
  const res = await fetch(`${API_BASE}/definitions`);
  if (!res.ok) throw new Error(`Failed to fetch definitions: ${res.status}`);
  return res.json();
}

export async function fetchCharacterConfigs(): Promise<RawCharacterData[]> {
  const res = await fetch(`${API_BASE}/characters/config`);
  if (!res.ok) throw new Error(`Failed to fetch character configs: ${res.status}`);
  const data = await res.json();
  return data.characters;
}

export async function fetchCharacterConfig(id: string): Promise<RawCharacterData> {
  const res = await fetch(`${API_BASE}/characters/config/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch character config: ${res.status}`);
  return res.json();
}

export async function saveCharacterConfig(id: string, data: RawCharacterData): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/characters/config/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save character config: ${res.status}`);
  return res.json();
}

export async function createCharacter(data: RawCharacterData): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/characters/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create character: ${res.status}`);
  return res.json();
}

export async function patchCharacter(id: string, fields: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/characters/config/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Failed to patch character: ${res.status}`);
  return res.json();
}

export async function deleteCharacter(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/characters/config/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete character: ${res.status}`);
  return res.json();
}

// --- Trait CRUD ---

export async function fetchTraitDefs(): Promise<TraitDefinition[]> {
  const res = await fetch(`${API_BASE}/traits`);
  if (!res.ok) throw new Error(`Failed to fetch traits: ${res.status}`);
  const data = await res.json();
  return data.traits;
}

export async function createTraitDef(data: Omit<TraitDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/traits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create trait: ${res.status}`);
  return res.json();
}

export async function saveTraitDef(id: string, data: Omit<TraitDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/traits/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save trait: ${res.status}`);
  return res.json();
}

export async function deleteTraitDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/traits/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete trait: ${res.status}`);
  return res.json();
}

// --- Clothing CRUD ---

export async function fetchClothingDefs(): Promise<ClothingDefinition[]> {
  const res = await fetch(`${API_BASE}/clothing`);
  if (!res.ok) throw new Error(`Failed to fetch clothing: ${res.status}`);
  const data = await res.json();
  return data.clothing;
}

export async function createClothingDef(data: Omit<ClothingDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/clothing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create clothing: ${res.status}`);
  return res.json();
}

export async function saveClothingDef(id: string, data: Omit<ClothingDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/clothing/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save clothing: ${res.status}`);
  return res.json();
}

export async function deleteClothingDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/clothing/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete clothing: ${res.status}`);
  return res.json();
}

// --- Item CRUD ---

export async function fetchItemDefs(): Promise<ItemDefinition[]> {
  const res = await fetch(`${API_BASE}/items`);
  if (!res.ok) throw new Error(`Failed to fetch items: ${res.status}`);
  const data = await res.json();
  return data.items;
}

export async function createItemDef(data: Omit<ItemDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create item: ${res.status}`);
  return res.json();
}

export async function saveItemDef(id: string, data: Omit<ItemDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save item: ${res.status}`);
  return res.json();
}

export async function deleteItemDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete item: ${res.status}`);
  return res.json();
}

// --- Item Tag pool ---

export async function fetchItemTags(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/item-tags`);
  if (!res.ok) throw new Error(`Failed to fetch item tags: ${res.status}`);
  const data = await res.json();
  return data.tags;
}

export async function createItemTag(tag: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/item-tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  });
  if (!res.ok) throw new Error(`Failed to create item tag: ${res.status}`);
  return res.json();
}

export async function deleteItemTag(tag: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/item-tags/${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete item tag: ${res.status}`);
  return res.json();
}

// --- Action Definition CRUD ---

export async function fetchActionDefs(): Promise<ActionDefinition[]> {
  const res = await fetch(`${API_BASE}/actions`);
  if (!res.ok) throw new Error(`Failed to fetch actions: ${res.status}`);
  const data = await res.json();
  return data.actions;
}

export async function createActionDef(data: Omit<ActionDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create action: ${res.status}`);
  return res.json();
}

export async function saveActionDef(id: string, data: Omit<ActionDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/actions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save action: ${res.status}`);
  return res.json();
}

export async function deleteActionDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/actions/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete action: ${res.status}`);
  return res.json();
}

// --- Variable CRUD ---

export async function fetchVariableDefs(): Promise<VariableDefinition[]> {
  const res = await fetch(`${API_BASE}/variables`);
  if (!res.ok) throw new Error(`Failed to fetch variables: ${res.status}`);
  const data = await res.json();
  return data.variables;
}

export async function createVariableDef(data: Omit<VariableDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create variable: ${res.status}`);
  return res.json();
}

export async function saveVariableDef(id: string, data: Omit<VariableDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variables/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save variable: ${res.status}`);
  return res.json();
}

export async function deleteVariableDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variables/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete variable: ${res.status}`);
  return res.json();
}

export async function evaluateVariable(id: string, characterId: string): Promise<{ success: boolean; result?: number; steps?: Array<{ index: number; label: string; op: string; type: string; stepValue: number; accumulated: number }>; message?: string }> {
  const res = await fetch(`${API_BASE}/variables/${id}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) throw new Error(`Failed to evaluate variable: ${res.status}`);
  return res.json();
}

// --- Variable Tag pool ---

export async function fetchVariableTags(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/variable-tags`);
  if (!res.ok) throw new Error(`Failed to fetch variable tags: ${res.status}`);
  const data = await res.json();
  return data.tags;
}

export async function createVariableTag(tag: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variable-tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  });
  if (!res.ok) throw new Error(`Failed to create variable tag: ${res.status}`);
  return res.json();
}

export async function deleteVariableTag(tag: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variable-tags/${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete variable tag: ${res.status}`);
  return res.json();
}

// --- Event Definition CRUD ---

export async function fetchEventDefs(): Promise<EventDefinition[]> {
  const res = await fetch(`${API_BASE}/events`);
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  const data = await res.json();
  return data.events;
}

export async function createEventDef(data: Omit<EventDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create event: ${res.status}`);
  return res.json();
}

export async function saveEventDef(id: string, data: Omit<EventDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/events/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save event: ${res.status}`);
  return res.json();
}

export async function deleteEventDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/events/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete event: ${res.status}`);
  return res.json();
}

// --- World Variable Definition CRUD ---

export async function fetchWorldVariableDefs(): Promise<WorldVariableDefinition[]> {
  const res = await fetch(`${API_BASE}/world-variables`);
  if (!res.ok) throw new Error(`Failed to fetch world variables: ${res.status}`);
  const data = await res.json();
  return data.worldVariables;
}

export async function createWorldVariableDef(data: Omit<WorldVariableDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/world-variables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create world variable: ${res.status}`);
  return res.json();
}

export async function saveWorldVariableDef(id: string, data: Omit<WorldVariableDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/world-variables/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save world variable: ${res.status}`);
  return res.json();
}

export async function deleteWorldVariableDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/world-variables/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete world variable: ${res.status}`);
  return res.json();
}

// --- Trait Group CRUD ---

export async function fetchTraitGroups(): Promise<TraitGroup[]> {
  const res = await fetch(`${API_BASE}/trait-groups`);
  if (!res.ok) throw new Error(`Failed to fetch trait groups: ${res.status}`);
  const data = await res.json();
  return data.traitGroups;
}

export async function createTraitGroup(data: Omit<TraitGroup, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/trait-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create trait group: ${res.status}`);
  return res.json();
}

export async function saveTraitGroup(id: string, data: Omit<TraitGroup, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/trait-groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save trait group: ${res.status}`);
  return res.json();
}

export async function deleteTraitGroup(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/trait-groups/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete trait group: ${res.status}`);
  return res.json();
}

// --- Map CRUD ---

export async function fetchMapsRaw(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${API_BASE}/maps/raw`);
  if (!res.ok) throw new Error(`Failed to fetch maps: ${res.status}`);
  const data = await res.json();
  return data.maps;
}

export async function fetchMapRaw(mapId: string): Promise<RawMapData> {
  const res = await fetch(`${API_BASE}/maps/raw/${mapId}`);
  if (!res.ok) throw new Error(`Failed to fetch map: ${res.status}`);
  return res.json();
}

export async function createMap(id: string, name: string, rows: number, cols: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/maps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, rows, cols }),
  });
  if (!res.ok) throw new Error(`Failed to create map: ${res.status}`);
  return res.json();
}

export async function saveMapRaw(mapId: string, data: RawMapData): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/maps/raw/${mapId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save map: ${res.status}`);
  return res.json();
}

export async function deleteMap(mapId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/maps/${mapId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete map: ${res.status}`);
  return res.json();
}

export async function fetchDecorPresets(): Promise<DecorPreset[]> {
  const res = await fetch(`${API_BASE}/decor-presets`);
  if (!res.ok) throw new Error(`Failed to fetch decor presets: ${res.status}`);
  const data = await res.json();
  return data.presets;
}

export async function saveDecorPresets(presets: DecorPreset[]): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/decor-presets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presets }),
  });
  if (!res.ok) throw new Error(`Failed to save decor presets: ${res.status}`);
  return res.json();
}

// --- Asset upload ---

export async function uploadAsset(
  file: File,
  folder: "characters" | "backgrounds" | "covers",
  name: string,
  opts?: { addonId?: string; worldId?: string },
): Promise<{ success: boolean; filename?: string; message?: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const params = new URLSearchParams({ folder, name });
  if (opts?.addonId) params.set("addonId", opts.addonId);
  if (opts?.worldId) params.set("worldId", opts.worldId);
  const res = await fetch(`/api/assets/upload?${params.toString()}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Failed to upload asset: ${res.status}`);
  return res.json();
}

// --- Save Slot APIs ---

export interface SaveSlotMeta {
  slotId: string;
  name: string;
  timestamp: string;
  worldId: string;
  worldName: string;
  gameTimeDisplay: string;
  addonRefs: { id: string; version: string }[];
}

export async function fetchSaves(): Promise<SaveSlotMeta[]> {
  const res = await fetch("/api/saves");
  if (!res.ok) throw new Error(`Failed to fetch saves: ${res.status}`);
  const data = await res.json();
  return data.saves ?? [];
}

export async function createSave(slotId: string, name: string): Promise<{ success: boolean; meta?: SaveSlotMeta; message?: string }> {
  const res = await fetch("/api/saves", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotId, name }),
  });
  return res.json();
}

export async function loadSave(slotId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/saves/${encodeURIComponent(slotId)}/load`, {
    method: "POST",
  });
  return res.json();
}

export async function deleteSave(slotId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/saves/${encodeURIComponent(slotId)}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function renameSave(slotId: string, name: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/saves/${encodeURIComponent(slotId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

// --- Addon version management ---

export async function forkAddon(addonId: string, baseVersion: string, worldId: string): Promise<{ success: boolean; newVersion?: string; message?: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/fork`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseVersion, worldId }),
  });
  return res.json();
}

export async function copyAddonVersion(addonId: string, sourceVersion: string, newVersion: string, forkedFrom?: string): Promise<{ success: boolean; newVersion?: string; message?: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceVersion, newVersion, forkedFrom: forkedFrom ?? null }),
  });
  return res.json();
}

export interface AddonVersionInfo {
  version: string;
  forkedFrom: string | null;
  worldId: string | null;
}

export async function overwriteAddonVersion(addonId: string, sourceVersion: string, targetVersion: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/overwrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceVersion, targetVersion }),
  });
  return res.json();
}

export async function fetchAddonVersions(addonId: string): Promise<string[]> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/versions`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.versions ?? [];
}

export async function fetchAddonVersionsDetail(addonId: string): Promise<AddonVersionInfo[]> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/versions?detail=true`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.versions ?? [];
}

// WebSocket connection
export function connectWebSocket(
  onStateUpdate: (state: GameState) => void,
  onGameChanged?: (state: GameState) => void,
  onDirtyUpdate?: (dirty: boolean) => void
): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "state_update") {
      onStateUpdate(msg.data);
    } else if (msg.type === "game_changed") {
      if (onGameChanged) {
        onGameChanged(msg.data);
      } else {
        onStateUpdate(msg.data);
      }
    } else if (msg.type === "dirty_update") {
      onDirtyUpdate?.(msg.dirty);
    }
  };

  ws.onclose = () => {
    // Reconnect after 2 seconds
    setTimeout(() => connectWebSocket(onStateUpdate, onGameChanged, onDirtyUpdate), 2000);
  };

  return ws;
}
