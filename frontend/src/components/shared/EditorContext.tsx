/**
 * EditorContext — shared data for condition/effect/modifier sub-editors.
 *
 * Eliminates 15+ props drilling through component trees.
 * Provider wraps ActionEditor / EventManager; children use useEditorContext().
 */
import { createContext, useContext } from "react";
import type { GameDefinitions, ClothingDefinition } from "../../types/game";

export interface KeyLabel {
  key: string;
  label: string;
}
export interface MapInfo {
  id: string;
  name: string;
  cells: { id: number; name?: string; tags?: string[] }[];
}
export interface TraitInfo {
  id: string;
  name: string;
  category: string;
}
export interface ItemInfo {
  id: string;
  name: string;
}
export interface IdName {
  id: string;
  name: string;
}

export interface EditorContextValue {
  definitions: GameDefinitions;
  targetType: string;
  resourceKeys: KeyLabel[];
  abilityKeys: KeyLabel[];
  experienceKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
  mapList: MapInfo[];
  traitList: TraitInfo[];
  itemList: ItemInfo[];
  npcList: IdName[];
  outfitTypes: IdName[];
  variableList: IdName[];
  biVarList: IdName[];
  worldVarList: IdName[];
  clothingList: ClothingDefinition[];
  actionList: IdName[];
  categoryList: string[];
}

const EditorCtx = createContext<EditorContextValue | null>(null);

export const EditorProvider = EditorCtx.Provider;

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorCtx);
  if (!ctx) throw new Error("useEditorContext must be used within EditorProvider");
  return ctx;
}
