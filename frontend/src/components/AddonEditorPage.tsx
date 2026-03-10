import { useState, useEffect, useCallback } from "react";
import type {
  AddonEntityData,
} from "../api/client";
import {
  fetchAddonData,
  fetchDefinitions,
  updateAddonMeta,
  addonCreateTrait, addonUpdateTrait, addonDeleteTrait,
  addonCreateTraitGroup, addonUpdateTraitGroup, addonDeleteTraitGroup,
  addonCreateClothing, addonUpdateClothing, addonDeleteClothing,
  addonCreateItem, addonUpdateItem, addonDeleteItem,
  addonCreateAction, addonUpdateAction, addonDeleteAction,
  addonCreateCharacter, addonUpdateCharacter, addonDeleteCharacter,
} from "../api/client";
import type { AddonInfo, GameDefinitions, TraitDefinition, TraitGroup, ClothingDefinition, ItemDefinition, ActionDefinition, RawCharacterData } from "../types/game";
import TraitEditor from "./TraitEditor";
import TraitGroupEditor from "./TraitGroupEditor";
import ClothingEditor from "./ClothingEditor";
import ItemEditor from "./ItemEditor";
import ActionEditor from "./ActionEditor";

type EditorTab = "info" | "traits" | "clothing" | "items" | "actions" | "characters";

interface AddonEditorPageProps {
  addonId: string;
  addonVersion: string;
  maxWidth: number;
  onBack: () => void;
}

const tabs: { key: EditorTab; label: string }[] = [
  { key: "info", label: "信息" },
  { key: "traits", label: "特质" },
  { key: "clothing", label: "服装" },
  { key: "items", label: "物品" },
  { key: "actions", label: "行动" },
  { key: "characters", label: "人物" },
];

// Reusable badge component for source + override indicators
function SourceBadge({ source, isOverride }: { source: string; isOverride?: boolean }) {
  return (
    <>
      {source && <span style={{ color: "#555", fontSize: "10px", marginLeft: "4px" }}>[{source}]</span>}
      {isOverride && <span style={{ color: "#e89a19", fontSize: "10px", marginLeft: "2px" }} title="覆盖依赖条目">⚡</span>}
    </>
  );
}

// Entity list item
function EntityRow({
  id, name, source, isOwn, isOverride, isReadOnly, onEdit, onDelete,
}: {
  id: string; name: string; source: string; isOwn: boolean; isOverride: boolean;
  isReadOnly: boolean; onEdit: () => void; onDelete?: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "4px 10px",
      backgroundColor: isOwn ? "#1a1a2e" : "#111118",
      border: isOverride ? "1px solid #e89a19" : "1px solid #222",
      borderRadius: "3px",
      opacity: isReadOnly ? 0.6 : 1,
    }}>
      <button
        onClick={onEdit}
        style={{
          flex: 1, textAlign: "left", background: "none", border: "none",
          color: isOwn ? "#ddd" : "#777", cursor: isReadOnly ? "default" : "pointer",
          fontFamily: "monospace", fontSize: "12px", padding: 0,
        }}
      >
        {name || id}
        <SourceBadge source={source} isOverride={isOverride} />
      </button>
      {!isReadOnly && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: "none", border: "none", color: "#e94560",
            cursor: "pointer", fontFamily: "monospace", fontSize: "11px",
            padding: "0 4px",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function AddonEditorPage({ addonId, addonVersion, onBack }: AddonEditorPageProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("info");
  const [data, setData] = useState<AddonEntityData | null>(null);
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  // Editor state
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [addonData, defs] = await Promise.all([
        fetchAddonData(addonId, addonVersion),
        fetchDefinitions(),
      ]);
      setData(addonData);
      setDefinitions(defs);
    } catch (e) {
      setMessage(`加载失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [addonId, addonVersion]);

  useEffect(() => { loadData(); }, [loadData]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  const handleBack = () => {
    setEditingType(null);
    setEditingId(null);
    setIsNew(false);
    loadData();
  };

  const handleDelete = async (category: string, id: string) => {
    if (!confirm(`确认删除 ${id}？`)) return;
    try {
      const deleteFns: Record<string, (a: string, v: string, id: string) => Promise<{ success: boolean; message: string }>> = {
        traits: addonDeleteTrait,
        traitGroups: addonDeleteTraitGroup,
        clothing: addonDeleteClothing,
        items: addonDeleteItem,
        actions: addonDeleteAction,
        characters: addonDeleteCharacter,
      };
      const result = await deleteFns[category](addonId, addonVersion, id);
      showMessage(result.message);
      loadData();
    } catch (e) {
      showMessage(`删除失败: ${e}`);
    }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    backgroundColor: "transparent",
    color: active ? "#e94560" : "#888",
    border: "none",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "12px",
    fontWeight: active ? "bold" : "normal",
  });

  const newBtnStyle: React.CSSProperties = {
    padding: "4px 12px",
    backgroundColor: "#16213e",
    color: "#0f0",
    border: "1px solid #333",
    borderRadius: "3px",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "12px",
  };

  if (loading || !data || !definitions) {
    return (
      <div style={{ color: "#666", fontFamily: "monospace", padding: "20px", textAlign: "center" }}>
        加载中...
      </div>
    );
  }

  // --- Sub-editors (reuse existing editor components with addon-specific save) ---

  if (editingType === "trait" && editingId !== null) {
    const allTraits = [...data.traits.deps, ...data.traits.own];
    const existing = allTraits.find((t) => t.id === editingId);
    const blank: TraitDefinition = {
      id: "", name: "", category: definitions.template.traits[0]?.key ?? "",
      description: "", effects: [], source: addonId,
    };
    const traitData = isNew ? blank : (existing ?? blank);

    // Build a modified definitions that includes both own + dep data
    const mergedDefs: GameDefinitions = {
      ...definitions,
      traitDefs: Object.fromEntries(allTraits.map((t) => [t.id, t])),
      traitGroups: Object.fromEntries(
        [...data.traitGroups.deps, ...data.traitGroups.own].map((g) => [g.id, g])
      ),
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <AddonEditorHeader addonId={addonId} addonVersion={addonVersion} onBack={handleBack} message={message} />
        <TraitEditor
          trait={traitData}
          definitions={mergedDefs}
          isNew={isNew}
          onBack={handleBack}
          addonCrud={{
            save: async (id, d) => { const r = await addonUpdateTrait(addonId, addonVersion, id, d); showMessage(r.message); handleBack(); },
            create: async (d) => { const r = await addonCreateTrait(addonId, addonVersion, d); showMessage(r.message); handleBack(); },
            delete: async (id) => { const r = await addonDeleteTrait(addonId, addonVersion, id); showMessage(r.message); handleBack(); },
          }}
        />
      </div>
    );
  }

  if (editingType === "traitGroup" && editingId !== null) {
    const allGroups = [...data.traitGroups.deps, ...data.traitGroups.own];
    const existing = allGroups.find((g) => g.id === editingId);
    const blank: TraitGroup = {
      id: "", name: "", category: definitions.template.traits[0]?.key ?? "",
      traits: [], source: addonId,
    };
    const groupData = isNew ? blank : (existing ?? blank);

    const mergedDefs: GameDefinitions = {
      ...definitions,
      traitDefs: Object.fromEntries(
        [...data.traits.deps, ...data.traits.own].map((t) => [t.id, t])
      ),
      traitGroups: Object.fromEntries(allGroups.map((g) => [g.id, g])),
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <AddonEditorHeader addonId={addonId} addonVersion={addonVersion} onBack={handleBack} message={message} />
        <TraitGroupEditor
          group={groupData}
          definitions={mergedDefs}
          isNew={isNew}
          onBack={handleBack}
          addonCrud={{
            save: async (id, d) => { const r = await addonUpdateTraitGroup(addonId, addonVersion, id, d); showMessage(r.message); handleBack(); },
            create: async (d) => { const r = await addonCreateTraitGroup(addonId, addonVersion, d); showMessage(r.message); handleBack(); },
            delete: async (id) => { const r = await addonDeleteTraitGroup(addonId, addonVersion, id); showMessage(r.message); handleBack(); },
          }}
        />
      </div>
    );
  }

  if (editingType === "clothing" && editingId !== null) {
    const allClothing = [...data.clothing.deps, ...data.clothing.own];
    const existing = allClothing.find((c) => c.id === editingId);
    const blank: ClothingDefinition = {
      id: "", name: "", slot: definitions.template.clothingSlots[0] ?? "",
      occlusion: [], effects: [], source: addonId,
    };
    const clothingData = isNew ? blank : (existing ?? blank);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <AddonEditorHeader addonId={addonId} addonVersion={addonVersion} onBack={handleBack} message={message} />
        <ClothingEditor
          clothing={clothingData}
          definitions={definitions}
          isNew={isNew}
          onBack={handleBack}
          addonCrud={{
            save: async (id, d) => { const r = await addonUpdateClothing(addonId, addonVersion, id, d); showMessage(r.message); handleBack(); },
            create: async (d) => { const r = await addonCreateClothing(addonId, addonVersion, d); showMessage(r.message); handleBack(); },
            delete: async (id) => { const r = await addonDeleteClothing(addonId, addonVersion, id); showMessage(r.message); handleBack(); },
          }}
        />
      </div>
    );
  }

  if (editingType === "item" && editingId !== null) {
    const allItems = [...data.items.deps, ...data.items.own];
    const existing = allItems.find((i) => i.id === editingId);
    const blank: ItemDefinition = {
      id: "", name: "", tags: [], description: "", maxStack: 1,
      sellable: true, price: 0, source: addonId,
    };
    const itemData = isNew ? blank : (existing ?? blank);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <AddonEditorHeader addonId={addonId} addonVersion={addonVersion} onBack={handleBack} message={message} />
        <ItemEditor
          item={itemData}
          isNew={isNew}
          onBack={handleBack}
          addonCrud={{
            save: async (id, d) => { const r = await addonUpdateItem(addonId, addonVersion, id, d); showMessage(r.message); handleBack(); },
            create: async (d) => { const r = await addonCreateItem(addonId, addonVersion, d); showMessage(r.message); handleBack(); },
            delete: async (id) => { const r = await addonDeleteItem(addonId, addonVersion, id); showMessage(r.message); handleBack(); },
          }}
        />
      </div>
    );
  }

  if (editingType === "action" && editingId !== null) {
    const allActions = [...data.actions.deps, ...data.actions.own];
    const existing = allActions.find((a) => a.id === editingId);
    const blank: ActionDefinition = {
      id: "", name: "", category: "general", targetType: "none",
      triggerLLM: false, timeCost: 30, npcWeight: 0,
      conditions: [], costs: [], outcomes: [], source: addonId,
    };
    const actionData = isNew ? blank : (existing ?? blank);

    const mergedDefs: GameDefinitions = {
      ...definitions,
      traitDefs: Object.fromEntries(
        [...data.traits.deps, ...data.traits.own].map((t) => [t.id, t])
      ),
      itemDefs: Object.fromEntries(
        [...data.items.deps, ...data.items.own].map((i) => [i.id, i])
      ),
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <AddonEditorHeader addonId={addonId} addonVersion={addonVersion} onBack={handleBack} message={message} />
        <ActionEditor
          action={actionData}
          definitions={mergedDefs}
          isNew={isNew}
          onBack={handleBack}
          addonCrud={{
            save: async (id, d) => { const r = await addonUpdateAction(addonId, addonVersion, id, d); showMessage(r.message); handleBack(); },
            create: async (d) => { const r = await addonCreateAction(addonId, addonVersion, d); showMessage(r.message); handleBack(); },
            delete: async (id) => { const r = await addonDeleteAction(addonId, addonVersion, id); showMessage(r.message); handleBack(); },
          }}
        />
      </div>
    );
  }

  // --- Main list views ---

  const renderTraitsTab = () => {
    const overrides = new Set(data.traits.overrides);
    const groupOverrides = new Set(data.traitGroups.overrides);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
          <button style={newBtnStyle} onClick={() => { setEditingType("trait"); setEditingId("__new__"); setIsNew(true); }}>
            [+ 新建特质]
          </button>
          <button style={newBtnStyle} onClick={() => { setEditingType("traitGroup"); setEditingId("__new__"); setIsNew(true); }}>
            [+ 新建特质组]
          </button>
        </div>

        {/* Own trait groups */}
        {data.traitGroups.own.length > 0 && (
          <div style={{ marginBottom: "4px" }}>
            <div style={{ color: "#888", fontSize: "11px", marginBottom: "4px" }}>特质组 (本 Add-on)</div>
            {data.traitGroups.own.map((g) => (
              <EntityRow
                key={`g-${g.id}`} id={g.id} name={g.name} source={addonId}
                isOwn isOverride={groupOverrides.has(g.id)} isReadOnly={false}
                onEdit={() => { setEditingType("traitGroup"); setEditingId(g.id); setIsNew(false); }}
                onDelete={() => handleDelete("traitGroups", g.id)}
              />
            ))}
          </div>
        )}

        {/* Own traits */}
        {data.traits.own.length > 0 && (
          <div style={{ marginBottom: "8px" }}>
            <div style={{ color: "#888", fontSize: "11px", marginBottom: "4px" }}>特质 (本 Add-on)</div>
            {data.traits.own.map((t) => (
              <EntityRow
                key={t.id} id={t.id} name={t.name} source={addonId}
                isOwn isOverride={overrides.has(t.id)} isReadOnly={false}
                onEdit={() => { setEditingType("trait"); setEditingId(t.id); setIsNew(false); }}
                onDelete={() => handleDelete("traits", t.id)}
              />
            ))}
          </div>
        )}

        {/* Dependency traits */}
        {data.traits.deps.length > 0 && (
          <div>
            <div style={{ color: "#666", fontSize: "11px", marginBottom: "4px" }}>依赖 Add-on 的特质 (只读)</div>
            {data.traitGroups.deps.map((g) => (
              <EntityRow
                key={`dg-${g.id}`} id={g.id} name={`[组] ${g.name}`} source={g.source}
                isOwn={false} isOverride={false} isReadOnly
                onEdit={() => {}}
              />
            ))}
            {data.traits.deps.map((t) => (
              <EntityRow
                key={`d-${t.id}`} id={t.id} name={t.name} source={t.source}
                isOwn={false} isOverride={false} isReadOnly
                onEdit={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderClothingTab = () => {
    const overrides = new Set(data.clothing.overrides);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ marginBottom: "8px" }}>
          <button style={newBtnStyle} onClick={() => { setEditingType("clothing"); setEditingId("__new__"); setIsNew(true); }}>
            [+ 新建服装]
          </button>
        </div>
        {data.clothing.own.length > 0 && (
          <div style={{ marginBottom: "8px" }}>
            <div style={{ color: "#888", fontSize: "11px", marginBottom: "4px" }}>服装 (本 Add-on)</div>
            {data.clothing.own.map((c) => (
              <EntityRow
                key={c.id} id={c.id} name={c.name} source={addonId}
                isOwn isOverride={overrides.has(c.id)} isReadOnly={false}
                onEdit={() => { setEditingType("clothing"); setEditingId(c.id); setIsNew(false); }}
                onDelete={() => handleDelete("clothing", c.id)}
              />
            ))}
          </div>
        )}
        {data.clothing.deps.length > 0 && (
          <div>
            <div style={{ color: "#666", fontSize: "11px", marginBottom: "4px" }}>依赖 Add-on 的服装 (只读)</div>
            {data.clothing.deps.map((c) => (
              <EntityRow
                key={`d-${c.id}`} id={c.id} name={c.name} source={c.source}
                isOwn={false} isOverride={false} isReadOnly
                onEdit={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderItemsTab = () => {
    const overrides = new Set(data.items.overrides);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ marginBottom: "8px" }}>
          <button style={newBtnStyle} onClick={() => { setEditingType("item"); setEditingId("__new__"); setIsNew(true); }}>
            [+ 新建物品]
          </button>
        </div>
        {data.items.own.length > 0 && (
          <div style={{ marginBottom: "8px" }}>
            <div style={{ color: "#888", fontSize: "11px", marginBottom: "4px" }}>物品 (本 Add-on)</div>
            {data.items.own.map((i) => (
              <EntityRow
                key={i.id} id={i.id} name={i.name} source={addonId}
                isOwn isOverride={overrides.has(i.id)} isReadOnly={false}
                onEdit={() => { setEditingType("item"); setEditingId(i.id); setIsNew(false); }}
                onDelete={() => handleDelete("items", i.id)}
              />
            ))}
          </div>
        )}
        {data.items.deps.length > 0 && (
          <div>
            <div style={{ color: "#666", fontSize: "11px", marginBottom: "4px" }}>依赖 Add-on 的物品 (只读)</div>
            {data.items.deps.map((i) => (
              <EntityRow
                key={`d-${i.id}`} id={i.id} name={i.name} source={i.source}
                isOwn={false} isOverride={false} isReadOnly
                onEdit={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderActionsTab = () => {
    const overrides = new Set(data.actions.overrides);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ marginBottom: "8px" }}>
          <button style={newBtnStyle} onClick={() => { setEditingType("action"); setEditingId("__new__"); setIsNew(true); }}>
            [+ 新建行动]
          </button>
        </div>
        {data.actions.own.length > 0 && (
          <div style={{ marginBottom: "8px" }}>
            <div style={{ color: "#888", fontSize: "11px", marginBottom: "4px" }}>行动 (本 Add-on)</div>
            {data.actions.own.map((a) => (
              <EntityRow
                key={a.id} id={a.id} name={a.name} source={addonId}
                isOwn isOverride={overrides.has(a.id)} isReadOnly={false}
                onEdit={() => { setEditingType("action"); setEditingId(a.id); setIsNew(false); }}
                onDelete={() => handleDelete("actions", a.id)}
              />
            ))}
          </div>
        )}
        {data.actions.deps.length > 0 && (
          <div>
            <div style={{ color: "#666", fontSize: "11px", marginBottom: "4px" }}>依赖 Add-on 的行动 (只读)</div>
            {data.actions.deps.map((a) => (
              <EntityRow
                key={`d-${a.id}`} id={a.id} name={a.name} source={a.source}
                isOwn={false} isOverride={false} isReadOnly
                onEdit={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCharactersTab = () => {
    const overrides = new Set(data.characters.overrides);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ marginBottom: "8px" }}>
          <button style={newBtnStyle} onClick={() => {
            // Character creation - simple JSON approach for now
            const id = prompt("输入角色 ID:");
            if (!id) return;
            const name = prompt("输入角色名称:") || id;
            addonCreateCharacter(addonId, addonVersion, {
              id, template: "default", isPlayer: false, active: true,
              basicInfo: { name }, resources: {}, clothing: {}, traits: {},
              abilities: {}, position: { mapId: "", cellId: 0 },
            }).then((r) => {
              showMessage(r.message);
              loadData();
            }).catch((e) => showMessage(`创建失败: ${e}`));
          }}>
            [+ 新建角色]
          </button>
        </div>
        {data.characters.own.length > 0 && (
          <div style={{ marginBottom: "8px" }}>
            <div style={{ color: "#888", fontSize: "11px", marginBottom: "4px" }}>角色 (本 Add-on)</div>
            {data.characters.own.map((c: RawCharacterData) => (
              <EntityRow
                key={c.id} id={c.id}
                name={typeof c.basicInfo?.name === "string" ? c.basicInfo.name : c.id}
                source={addonId}
                isOwn isOverride={overrides.has(c.id)} isReadOnly={false}
                onEdit={() => showMessage("角色编辑器开发中 — 暂时请在世界模式下编辑")}
                onDelete={() => handleDelete("characters", c.id)}
              />
            ))}
          </div>
        )}
        {data.characters.deps.length > 0 && (
          <div>
            <div style={{ color: "#666", fontSize: "11px", marginBottom: "4px" }}>依赖 Add-on 的角色 (只读)</div>
            {data.characters.deps.map((c: RawCharacterData) => (
              <EntityRow
                key={`d-${c.id}`} id={c.id}
                name={typeof c.basicInfo?.name === "string" ? c.basicInfo.name : c.id}
                source={(c as unknown as { _source: string })._source ?? ""}
                isOwn={false} isOverride={false} isReadOnly
                onEdit={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderInfoTab = () => {
    const meta = data.meta;
    return <AddonMetaEditor meta={meta} addonId={addonId} addonVersion={addonVersion} onSaved={loadData} />;
  };

  const renderContent = () => {
    switch (activeTab) {
      case "info": return renderInfoTab();
      case "traits": return renderTraitsTab();
      case "clothing": return renderClothingTab();
      case "items": return renderItemsTab();
      case "actions": return renderActionsTab();
      case "characters": return renderCharactersTab();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <AddonEditorHeader addonId={addonId} addonVersion={addonVersion} onBack={onBack} message={message}>
        {tabs.map((t) => (
          <button key={t.key} style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            [{t.label}]
          </button>
        ))}
      </AddonEditorHeader>
      {renderContent()}
    </div>
  );
}

// Header sub-component
function AddonEditorHeader({
  addonId, addonVersion, onBack, message, children,
}: {
  addonId: string; addonVersion: string; onBack: () => void;
  message?: string; children?: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid #333", paddingBottom: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={onBack}
            style={{
              padding: "4px 10px", backgroundColor: "transparent", color: "#888",
              border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: "12px",
            }}
          >
            [返回]
          </button>
          <span style={{ color: "#333" }}>|</span>
          {children}
        </div>
        <span style={{ color: "#888", fontSize: "11px" }}>
          {addonId} v{addonVersion}
        </span>
      </div>
      {message && (
        <div style={{
          color: message.includes("失败") ? "#e94560" : "#0f0",
          fontSize: "11px", marginTop: "4px", paddingLeft: "10px",
        }}>
          {message}
        </div>
      )}
    </div>
  );
}

// Addon metadata editor (info tab)
function AddonMetaEditor({ meta, addonId, addonVersion, onSaved }: {
  meta: AddonInfo; addonId: string; addonVersion: string; onSaved: () => void;
}) {
  const [name, setName] = useState(meta.name);
  const [description, setDescription] = useState(meta.description ?? "");
  const [author, setAuthor] = useState(meta.author ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "4px 8px", backgroundColor: "#0a0a1a",
    color: "#ddd", border: "1px solid #333", borderRadius: "3px",
    fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box",
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await updateAddonMeta(addonId, addonVersion, { name, description, author });
      setMessage(result.success ? "已保存" : result.message);
      if (result.success) onSaved();
    } catch (e) {
      setMessage(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "500px" }}>
      <div style={{ color: "#e94560", fontSize: "13px", fontWeight: "bold" }}>Add-on 信息</div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ color: "#888", fontSize: "12px", width: "50px", flexShrink: 0 }}>ID</span>
          <span style={{ color: "#555", fontSize: "12px", fontFamily: "monospace" }}>{meta.id}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ color: "#888", fontSize: "12px", width: "50px", flexShrink: 0 }}>版本</span>
          <span style={{ color: "#555", fontSize: "12px", fontFamily: "monospace" }}>{meta.version}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ color: "#888", fontSize: "12px", width: "50px", flexShrink: 0 }}>名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ color: "#888", fontSize: "12px", width: "50px", flexShrink: 0 }}>作者</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="(可选)" />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
          <span style={{ color: "#888", fontSize: "12px", width: "50px", flexShrink: 0, paddingTop: "4px" }}>简介</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ ...inputStyle, flex: 1, resize: "vertical" }}
            placeholder="(可选)"
          />
        </div>

        {meta.dependencies && meta.dependencies.length > 0 && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "#888", fontSize: "12px", width: "50px", flexShrink: 0 }}>依赖</span>
            <span style={{ color: "#666", fontSize: "11px" }}>
              {meta.dependencies.map(d => `${d.id}@${d.version}`).join(", ")}
            </span>
          </div>
        )}

        {meta.categories && meta.categories.length > 0 && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "#888", fontSize: "12px", width: "50px", flexShrink: 0 }}>类目</span>
            <span style={{ color: "#666", fontSize: "11px" }}>{meta.categories.join(", ")}</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "4px 16px", backgroundColor: "#16213e", color: "#0f0",
            border: "1px solid #333", borderRadius: "3px", cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "monospace", fontSize: "12px",
          }}
        >
          {saving ? "保存中..." : "[保存]"}
        </button>
        {message && (
          <span style={{ color: message.includes("失败") ? "#e94560" : "#0f0", fontSize: "11px" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
