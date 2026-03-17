import type { GameState, GameAction, ActionResult, WorldInfo, GameDefinitions, RawCharacterData, TraitDefinition, TraitGroup, ClothingDefinition, ItemDefinition, ActionDefinition, VariableDefinition, EventDefinition, WorldVariableDefinition, DecorPreset, RawMapData, SessionInfo, OutfitType, LLMPreset } from "../types/game";
import { translateError } from "../i18n/messages";

const API_BASE = "/api/game";

/**
 * Unified response handler.
 * - Translates backend error codes to localized messages via i18n.
 * - On HTTP error: throws with translated message.
 * - On success: returns parsed JSON with translated `message` field.
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) {
        msg = translateError(body.error, body.params) ?? body.error;
      } else if (body.message) {
        msg = body.message;
      }
    } catch { /* body not JSON, use status */ }
    throw new Error(msg);
  }
  const data = await res.json();
  // Translate error code to localized message for success responses too
  if (data.error) {
    data.message = translateError(data.error, data.params) ?? data.error;
  }
  return data;
}

export interface AppConfig {
  maxWidth: number;
  defaultLlmPreset: string;
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch("/api/config");
  return handleResponse(res);
}

export async function updateConfig(data: Partial<AppConfig>): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function fetchWorlds(): Promise<WorldInfo[]> {
  const res = await fetch("/api/worlds");
  const data = await handleResponse<{ worlds: WorldInfo[] }>(res);
  return data.worlds;
}

export async function selectWorld(worldId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/worlds/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worldId }),
  });
  return handleResponse(res);
}

// --- Session & Addon APIs ---

export async function fetchSession(): Promise<SessionInfo> {
  const res = await fetch("/api/session");
  return handleResponse(res);
}

export async function fetchAddons(): Promise<AddonInfo[]> {
  const res = await fetch("/api/addons");
  const data = await handleResponse<Record<string, any>>(res);
  return data.addons ?? [];
}

export async function unloadWorld(): Promise<{ success: boolean }> {
  const res = await fetch("/api/worlds/unload", { method: "POST" });
  return handleResponse(res);
}

export async function updateSessionAddons(addons: { id: string; version: string }[]): Promise<{ success: boolean }> {
  const res = await fetch("/api/session/addons", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addons }),
  });
  return handleResponse(res);
}

export async function createWorld(id: string, name: string, addons: { id: string; version: string }[]): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/worlds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, addons }),
  });
  return handleResponse(res);
}

export async function updateWorld(worldId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/worlds/${worldId}`, { method: "PUT" });
  return handleResponse(res);
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
  return handleResponse(res);
}

export async function saveSessionAs(id: string, name: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/session/save-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name }),
  });
  return handleResponse(res);
}

export async function deleteWorld(worldId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
  return handleResponse(res);
}

export async function updateWorldMeta(worldId: string, data: { name?: string; description?: string; cover?: string; llmPreset?: string }): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/worlds/${encodeURIComponent(worldId)}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateAddonMeta(addonId: string, version: string, data: { name?: string; description?: string; author?: string; cover?: string; categories?: string[] }): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/${encodeURIComponent(version)}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function createAddon(data: { id: string; name: string; version?: string; description?: string; author?: string }): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/addon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteAddon(addonId: string, version: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/${encodeURIComponent(version)}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function deleteAddonAll(addonId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}



/** @deprecated Use fetchWorlds */
export const fetchGames = fetchWorlds;
/** @deprecated Use selectWorld */
export async function selectGame(gameId: string) { return selectWorld(gameId); }

export async function restartGame(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/restart`, { method: "POST" });
  return handleResponse(res);
}

export async function fetchGameState(): Promise<GameState> {
  const res = await fetch(`${API_BASE}/state`);
  return handleResponse(res);
}

export async function fetchActions(characterId: string, targetId?: string | null): Promise<{ actions: GameAction[] }> {
  const params = targetId ? `?target_id=${encodeURIComponent(targetId)}` : "";
  const res = await fetch(`${API_BASE}/available-actions/${characterId}${params}`);
  return handleResponse(res);
}

export async function performAction(
  characterId: string,
  type: string,
  targetCell?: number,
  targetMap?: string,
  actionId?: string,
  targetId?: string,
  outfitId?: string,
  selections?: Record<string, string>,
): Promise<ActionResult> {
  const res = await fetch(`${API_BASE}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, type, actionId, targetCell, targetMap, targetId, outfitId, selections }),
  });
  return handleResponse(res);
}

// --- Character config CRUD ---

export async function fetchDefinitions(): Promise<GameDefinitions> {
  const res = await fetch(`${API_BASE}/definitions`);
  return handleResponse(res);
}

export async function fetchCharacterConfigs(): Promise<RawCharacterData[]> {
  const res = await fetch(`${API_BASE}/characters/config`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.characters;
}

export async function fetchCharacterConfig(id: string): Promise<RawCharacterData> {
  const res = await fetch(`${API_BASE}/characters/config/${id}`);
  return handleResponse(res);
}

export async function saveCharacterConfig(id: string, data: RawCharacterData): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/characters/config/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function createCharacter(data: RawCharacterData): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/characters/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function patchCharacter(id: string, fields: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/characters/config/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return handleResponse(res);
}

export async function deleteCharacter(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/characters/config/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Trait CRUD ---

export async function fetchTraitDefs(): Promise<TraitDefinition[]> {
  const res = await fetch(`${API_BASE}/traits`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.traits;
}

export async function createTraitDef(data: Omit<TraitDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/traits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function saveTraitDef(id: string, data: Omit<TraitDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/traits/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteTraitDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/traits/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Clothing CRUD ---

export async function fetchClothingDefs(): Promise<ClothingDefinition[]> {
  const res = await fetch(`${API_BASE}/clothing`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.clothing;
}

export async function createClothingDef(data: Omit<ClothingDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/clothing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function saveClothingDef(id: string, data: Omit<ClothingDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/clothing/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteClothingDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/clothing/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Outfit Types ---

export async function fetchOutfitTypes(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/outfit-types`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.outfitTypes;
}

export async function saveOutfitTypes(outfitTypes: OutfitType[]): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/outfit-types`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outfitTypes }),
  });
  return handleResponse(res);
}

// --- Item CRUD ---

export async function fetchItemDefs(): Promise<ItemDefinition[]> {
  const res = await fetch(`${API_BASE}/items`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.items;
}

export async function createItemDef(data: Omit<ItemDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function saveItemDef(id: string, data: Omit<ItemDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteItemDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Item Tag pool ---

export async function fetchItemTags(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/item-tags`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.tags;
}

export async function createItemTag(tag: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/item-tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  });
  return handleResponse(res);
}

export async function deleteItemTag(tag: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/item-tags/${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Action Definition CRUD ---

export async function fetchActionDefs(): Promise<ActionDefinition[]> {
  const res = await fetch(`${API_BASE}/actions`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.actions;
}

export async function createActionDef(data: Omit<ActionDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function saveActionDef(id: string, data: Omit<ActionDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/actions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteActionDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/actions/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Variable CRUD ---

export async function fetchVariableDefs(): Promise<VariableDefinition[]> {
  const res = await fetch(`${API_BASE}/variables`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.variables;
}

export async function createVariableDef(data: Omit<VariableDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function saveVariableDef(id: string, data: Omit<VariableDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variables/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteVariableDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variables/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function evaluateVariable(id: string, characterId: string): Promise<{ success: boolean; result?: number; steps?: Array<{ index: number; label: string; op: string; type: string; stepValue: number; accumulated: number }>; message?: string }> {
  const res = await fetch(`${API_BASE}/variables/${id}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  return handleResponse(res);
}

// --- Variable Tag pool ---

export async function fetchVariableTags(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/variable-tags`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.tags;
}

export async function createVariableTag(tag: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variable-tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  });
  return handleResponse(res);
}

export async function deleteVariableTag(tag: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/variable-tags/${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Event Definition CRUD ---

export async function fetchEventDefs(): Promise<EventDefinition[]> {
  const res = await fetch(`${API_BASE}/events`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.events;
}

export async function createEventDef(data: Omit<EventDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function saveEventDef(id: string, data: Omit<EventDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/events/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteEventDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/events/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- World Variable Definition CRUD ---

export async function fetchWorldVariableDefs(): Promise<WorldVariableDefinition[]> {
  const res = await fetch(`${API_BASE}/world-variables`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.worldVariables;
}

export async function createWorldVariableDef(data: Omit<WorldVariableDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/world-variables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function saveWorldVariableDef(id: string, data: Omit<WorldVariableDefinition, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/world-variables/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteWorldVariableDef(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/world-variables/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Trait Group CRUD ---

export async function fetchTraitGroups(): Promise<TraitGroup[]> {
  const res = await fetch(`${API_BASE}/trait-groups`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.traitGroups;
}

export async function createTraitGroup(data: Omit<TraitGroup, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/trait-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function saveTraitGroup(id: string, data: Omit<TraitGroup, "source">): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/trait-groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteTraitGroup(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/trait-groups/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

// --- Map CRUD ---

export async function fetchMapsRaw(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${API_BASE}/maps/raw`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.maps;
}

export async function fetchMapRaw(mapId: string): Promise<RawMapData> {
  const res = await fetch(`${API_BASE}/maps/raw/${mapId}`);
  return handleResponse(res);
}

export async function createMap(id: string, name: string, rows: number, cols: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/maps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, rows, cols }),
  });
  return handleResponse(res);
}

export async function saveMapRaw(mapId: string, data: RawMapData): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/maps/raw/${mapId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteMap(mapId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/maps/${mapId}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function fetchDecorPresets(): Promise<DecorPreset[]> {
  const res = await fetch(`${API_BASE}/decor-presets`);
  const data = await handleResponse<Record<string, any>>(res);
  return data.presets;
}

export async function saveDecorPresets(presets: DecorPreset[]): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/decor-presets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presets }),
  });
  return handleResponse(res);
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
  const res = await fetch(`/api/assets?${params.toString()}`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
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
  const data = await handleResponse<Record<string, any>>(res);
  return data.saves ?? [];
}

export async function createSave(slotId: string, name: string): Promise<{ success: boolean; meta?: SaveSlotMeta; message?: string }> {
  const res = await fetch("/api/saves", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotId, name }),
  });
  return handleResponse(res);
}

export async function loadSave(slotId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/saves/${encodeURIComponent(slotId)}/load`, {
    method: "POST",
  });
  return handleResponse(res);
}

export async function deleteSave(slotId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/saves/${encodeURIComponent(slotId)}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function renameSave(slotId: string, name: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/saves/${encodeURIComponent(slotId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handleResponse(res);
}

// --- Addon version management ---

export async function forkAddon(addonId: string, baseVersion: string, worldId: string): Promise<{ success: boolean; newVersion?: string; message?: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/fork`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseVersion, worldId }),
  });
  return handleResponse(res);
}

export async function copyAddonVersion(addonId: string, sourceVersion: string, newVersion: string, forkedFrom?: string): Promise<{ success: boolean; newVersion?: string; message?: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceVersion, newVersion, forkedFrom: forkedFrom ?? null }),
  });
  return handleResponse(res);
}

export interface AddonVersionInfo {
  version: string;
  forkedFrom: string | null;
}

export async function overwriteAddonVersion(addonId: string, sourceVersion: string, targetVersion: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/overwrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceVersion, targetVersion }),
  });
  return handleResponse(res);
}

export async function fetchAddonVersions(addonId: string): Promise<string[]> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/versions`);
  if (!res.ok) return [];
  const data = await handleResponse<Record<string, any>>(res);
  return data.versions ?? [];
}

export async function fetchAddonVersionsDetail(addonId: string): Promise<AddonVersionInfo[]> {
  const res = await fetch(`/api/addon/${encodeURIComponent(addonId)}/versions?detail=true`);
  if (!res.ok) return [];
  const data = await handleResponse<Record<string, any>>(res);
  return data.versions ?? [];
}

// SSE connection
export function connectSSE(
  onStateUpdate: (state: GameState) => void,
  onGameChanged?: (state: GameState) => void,
  onDirtyUpdate?: (dirty: boolean) => void
): EventSource {
  const es = new EventSource("/api/events");

  es.addEventListener("state_update", (e) => {
    onStateUpdate(JSON.parse(e.data));
  });

  es.addEventListener("game_changed", (e) => {
    const state = JSON.parse(e.data);
    if (onGameChanged) {
      onGameChanged(state);
    } else {
      onStateUpdate(state);
    }
  });

  es.addEventListener("dirty_update", (e) => {
    const msg = JSON.parse(e.data);
    onDirtyUpdate?.(msg.dirty);
  });

  // EventSource auto-reconnects on connection loss

  return es;
}

// --- LLM Preset API ---

const LLM_BASE = "/api/llm";

export async function fetchLLMPresets(): Promise<{ id: string; name: string; description: string }[]> {
  const res = await fetch(`${LLM_BASE}/presets`);
  const data = await handleResponse<{ presets: { id: string; name: string; description: string }[] }>(res);
  return data.presets;
}

export async function fetchLLMPreset(id: string): Promise<LLMPreset> {
  const res = await fetch(`${LLM_BASE}/presets/${encodeURIComponent(id)}`);
  const data = await handleResponse<{ preset: LLMPreset }>(res);
  return data.preset;
}

export async function saveLLMPreset(id: string, preset: LLMPreset): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${LLM_BASE}/presets/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preset),
  });
  return handleResponse(res);
}

export async function deleteLLMPreset(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${LLM_BASE}/presets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function fetchLLMModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const params = new URLSearchParams({ base_url: baseUrl });
  if (apiKey) params.set("api_key", apiKey);
  const res = await fetch(`${LLM_BASE}/models?${params}`);
  const data = await handleResponse<{ models: string[] }>(res);
  return data.models;
}

export async function testLLMConnection(api: { baseUrl: string; apiKey: string; model: string }): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${LLM_BASE}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api }),
  });
  return handleResponse(res);
}
