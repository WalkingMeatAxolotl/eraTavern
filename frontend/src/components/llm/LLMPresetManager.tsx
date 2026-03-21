import { useEffect, useState, useCallback, useRef } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";
import type { LLMPreset, LLMPromptEntry, LLMParameters, LLMProvider } from "../../types/game";
import LLMDebugPanel from "./LLMDebugPanel";
import type { LLMDebugEntry } from "./LLMDebugPanel";
import {
  fetchLLMPresets,
  fetchLLMPreset,
  saveLLMPreset,
  deleteLLMPreset,
  fetchLLMProviders,
  fetchLLMProvider,
  saveLLMProvider,
  deleteLLMProvider,
  fetchConfig,
  updateConfig,
} from "../../api/client";

import { HelpButton, HelpPanel, helpP } from "../shared/HelpToggle";
import { btn, inputStyle as _inputStyle, labelStyle } from "../shared/styles";
import PromptEntryRow from "./PromptEntryRow";
import ProviderEditor from "./ProviderEditor";

// --- Styles ---

export const inputStyle: React.CSSProperties = {
  ..._inputStyle,
  width: "100%",
  boxSizing: "border-box",
};

export const sectionStyle: React.CSSProperties = {
  borderLeft: `2px solid ${T.borderLight}`,
  paddingLeft: "10px",
  marginBottom: "12px",
};


// --- Default objects ---

export const BUILTIN_CONTEXT_ENTRY_ID = "__assist_context__";

function makeBlankPreset(type: "narrative" | "assist" = "narrative"): LLMPreset {
  const base: LLMPreset = {
    id: "",
    name: "",
    description: "",
    type,
    providerId: "",
    postProcessing: "mergeConsecutiveSameRole",
    parameters: {
      temperature: 0.8,
      maxTokens: 4096,
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
    },
    promptEntries: [],
  };
  if (type === "assist") {
    // Assist presets start with a builtin context entry
    base.promptEntries = [
      {
        id: BUILTIN_CONTEXT_ENTRY_ID,
        name: t("llm.builtinContext"),
        enabled: true,
        role: "system",
        content: "",
        position: 0,
      },
    ];
  }
  return base;
}

function makeBlankProvider(): LLMProvider {
  return {
    id: "",
    name: "",
    apiType: "chatCompletion",
    apiSource: "openaiCompatible",
    baseUrl: "",
    apiKey: "",
    model: "",
    streaming: true,
  };
}

// --- Available variables ---

export const VARIABLE_GROUPS = [
  {
    label: t("llmVar.action"),
    vars: [
      { name: "rawOutput", desc: t("llm.desc.rawOutput") },
      { name: "action.name", desc: t("llm.desc.actionName") },
      { name: "action.description", desc: t("llm.desc.actionDescription") },
      { name: "action.category", desc: t("llm.desc.actionCategory") },
    ],
  },
  {
    label: t("llmVar.player"),
    vars: [
      { name: "player", desc: t("llm.desc.player") },
      { name: "player.name", desc: t("llm.desc.playerName") },
      { name: "player.money", desc: t("llm.desc.playerMoney") },
      { name: "player.resources", desc: t("llm.desc.playerResources") },
      { name: "player.traits", desc: t("llm.desc.playerTraits") },
      { name: "player.traits.names", desc: t("llm.desc.playerTraitsNames") },
      { name: "player.abilities", desc: t("llm.desc.playerAbilities") },
      { name: "player.experiences", desc: t("llm.desc.playerExperiences") },
      { name: "player.clothing", desc: t("llm.desc.playerClothing") },
      { name: "player.clothing.detail", desc: t("llm.desc.playerClothingDetail") },
      { name: "player.outfit", desc: t("llm.desc.playerOutfit") },
      { name: "player.inventory", desc: t("llm.desc.playerInventory") },
      { name: "player.inventory.detail", desc: t("llm.desc.playerInventoryDetail") },
      { name: "player.favorability", desc: t("llm.desc.playerFavorability") },
      { name: "player.variables", desc: t("llm.desc.playerVariables") },
      { name: "player.llm", desc: t("llm.desc.playerLlm") },
      { name: "player.llm.xxx", desc: t("llm.desc.playerLlmField") },
    ],
  },
  {
    label: t("llmVar.target"),
    vars: [
      { name: "target", desc: t("llm.desc.target") },
      { name: "target.name", desc: t("llm.desc.targetName") },
      { name: "target.traits", desc: t("llm.desc.targetTraits") },
      { name: "target.clothing", desc: t("llm.desc.targetClothing") },
      { name: "target.favorability", desc: t("llm.desc.targetFavorability") },
      { name: "target.llm", desc: t("llm.desc.targetLlm") },
      { name: "target.llm.xxx", desc: t("llm.desc.targetLlmField") },
    ],
  },
  {
    label: t("llmVar.scene"),
    vars: [
      { name: "location", desc: t("llm.desc.location") },
      { name: "location.description", desc: t("llm.desc.locationDescription") },
      { name: "location.neighbors", desc: t("llm.desc.locationNeighbors") },
      { name: "mapName", desc: t("llm.desc.mapName") },
      { name: "mapName.description", desc: t("llm.desc.mapDescription") },
      { name: "time", desc: t("llm.desc.time") },
      { name: "weather", desc: t("llm.desc.weather") },
      { name: "npcsHere", desc: t("llm.desc.npcsHere") },
      { name: "npcsNearby", desc: t("llm.desc.npcsNearby") },
      { name: "worldVars", desc: t("llm.desc.worldVars") },
    ],
  },
  { label: t("llmVar.lorebook"), vars: [{ name: "lorebook", desc: t("llm.desc.lorebook") }] },
  {
    label: t("llmVar.history"),
    vars: [
      { name: "recentActions", desc: t("llm.desc.recentActions") },
      { name: "recentNpcActivity", desc: t("llm.desc.recentNpcActivity") },
      { name: "previousNarrative", desc: t("llm.desc.previousNarrative") },
    ],
  },
];


// --- Main component ---

export default function LLMPresetManager({ debugEntries = [] }: { debugEntries?: LLMDebugEntry[] }) {
  const [presets, setPresets] = useState<{ id: string; name: string; description: string; type?: string }[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preset, setPreset] = useState<LLMPreset>(makeBlankPreset());
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [showTypeHelp, setShowTypeHelp] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const [globalPreset, setGlobalPreset] = useState("");
  const [aiAssistPreset, setAiAssistPreset] = useState("");
  const [subTab, setSubTab] = useState<"presets" | "providers" | "global" | "debug">("presets");

  // Provider editor state (within global tab)
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [isNewProvider, setIsNewProvider] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [presetList, providerList, cfg] = await Promise.all([
        fetchLLMPresets(),
        fetchLLMProviders(),
        fetchConfig(),
      ]);
      setPresets(presetList);
      setProviders(providerList);
      setGlobalPreset(cfg.defaultLlmPreset || "");
      setAiAssistPreset(cfg.aiAssistPresetId || "");
    } catch (e) {
      console.error("Failed to load LLM data:", e);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // --- Preset handlers ---

  const handleSelectPreset = async (id: string) => {
    try {
      const data = await fetchLLMPreset(id);
      // Migrate old preset format: extract api block into top-level fields
      const raw = data as any;
      if (raw.api && !raw.parameters) {
        data.parameters = raw.api.parameters || makeBlankPreset().parameters;
        data.postProcessing = raw.api.postProcessing || "mergeConsecutiveSameRole";
        if (!data.providerId) data.providerId = "";
      }
      if (!data.parameters) data.parameters = makeBlankPreset().parameters;
      if (!data.postProcessing) data.postProcessing = "mergeConsecutiveSameRole";
      if (!data.type) data.type = "narrative";
      setPreset(data);
      setEditingId(id);
      setIsNew(false);
      setMessage("");
      setExpandedEntry(null);
    } catch (e) {
      setMessage(t("msg.loadFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const handleNew = (type: "narrative" | "assist" = "narrative") => {
    setPreset(makeBlankPreset(type));
    setEditingId("__new__");
    setIsNew(true);
    setMessage("");
    setExpandedEntry(null);
  };

  const handleBack = () => {
    setEditingId(null);
    setIsNew(false);
    setMessage("");
    loadAll();
  };

  const handleSave = async () => {
    const id = preset.id.trim();
    if (!id) {
      setMessage(t("val.idRequired"));
      return;
    }
    if (!preset.name.trim()) {
      setMessage(t("val.nameRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await saveLLMPreset(id, preset);
      if (result.success) {
        setMessage(t("msg.saved"));
        if (isNew) {
          setIsNew(false);
          setEditingId(id);
        }
        loadAll();
      } else {
        setMessage(result.message || t("msg.saveFailedShort"));
      }
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deletePreset", { name: preset.name || preset.id }))) return;
    setSaving(true);
    try {
      const result = await deleteLLMPreset(preset.id);
      if (result.success) {
        handleBack();
      } else {
        setMessage(result.message || t("msg.deleteFailedShort"));
      }
    } catch (e) {
      setMessage(t("msg.deleteFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  // --- Provider handlers ---

  const handleNewProvider = () => {
    setEditingProvider(makeBlankProvider());
    setIsNewProvider(true);
    setProviderMessage("");
  };

  const handleEditProvider = async (id: string) => {
    try {
      const data = await fetchLLMProvider(id);
      setEditingProvider(data);
      setIsNewProvider(false);
      setProviderMessage("");
    } catch (e) {
      setProviderMessage(t("msg.loadFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const handleSaveProvider = async (prov: LLMProvider) => {
    try {
      const result = await saveLLMProvider(prov.id, prov);
      if (result.success) {
        setEditingProvider(null);
        setProviderMessage(t("msg.saved"));
        loadAll();
      } else {
        setProviderMessage(result.message || t("msg.saveFailedShort"));
      }
    } catch (e) {
      setProviderMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const handleDeleteProvider = async () => {
    if (!editingProvider) return;
    if (!confirm(t("confirm.deleteProvider", { name: editingProvider.name || editingProvider.id }))) return;
    try {
      const result = await deleteLLMProvider(editingProvider.id);
      if (result.success) {
        setEditingProvider(null);
        loadAll();
      } else {
        setProviderMessage(result.message || t("msg.deleteFailedShort"));
      }
    } catch (e) {
      setProviderMessage(t("msg.deleteFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  // --- Preset entry handlers ---

  const updateParams = (patch: Partial<LLMParameters>) => {
    setPreset((p) => ({
      ...p,
      parameters: { ...p.parameters, ...patch },
    }));
  };

  const updateEntry = (idx: number, entry: LLMPromptEntry) => {
    setPreset((p) => {
      const entries = [...p.promptEntries];
      entries[idx] = entry;
      return { ...p, promptEntries: entries };
    });
  };

  const deleteEntry = (idx: number) => {
    setPreset((p) => ({
      ...p,
      promptEntries: p.promptEntries.filter((_, i) => i !== idx),
    }));
    setExpandedEntry(null);
  };

  const addEntry = () => {
    const maxPos = preset.promptEntries.reduce((m, e) => Math.max(m, e.position), -1);
    const entry: LLMPromptEntry = {
      id: `entry-${Date.now()}`,
      name: "",
      enabled: true,
      role: "user",
      content: "",
      position: maxPos + 1,
    };
    setPreset((p) => ({ ...p, promptEntries: [...p.promptEntries, entry] }));
    setExpandedEntry(preset.promptEntries.length);
  };

  // --- Sub-tab bar ---
  const subTabBtn = (key: "presets" | "providers" | "global" | "debug", label: string) => (
    <button
      key={key}
      onClick={() => setSubTab(key)}
      style={{
        padding: "4px 14px",
        backgroundColor: subTab === key ? T.bg2 : "transparent",
        color: subTab === key ? T.accent : T.textSub,
        border: subTab === key ? `1px solid ${T.border}` : "1px solid transparent",
        borderRadius: "3px",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: subTab === key ? "bold" : "normal",
      }}
    >
      [{label}]
    </button>
  );

  // --- List / global settings view ---
  if (editingId === null) {
    return (
      <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
          {subTabBtn("presets", t("llm.tabPresets"))}
          {subTabBtn("providers", t("llm.tabProviders"))}
          {subTabBtn("global", t("llm.tabGlobal"))}
          {subTabBtn("debug", `${t("llm.tabDebug")}(${debugEntries.length})`)}
        </div>

        {subTab === "presets" && (
          <>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}
            >
              <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.llmPresets")} ==</span>
              <button onClick={() => handleNew()} style={btn("create")}>
                [{t("btn.newPresetFull")}]
              </button>
            </div>

            {presets.length === 0 && (
              <div style={{ color: T.textDim, fontSize: "12px", padding: "8px 0" }}>
                {t("empty.llmPresets")}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    backgroundColor: T.bg1,
                    color: T.text,
                    border: `1px solid ${T.border}`,
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "12px",
                    textAlign: "left",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.borderLight)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
                >
                  <span>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "1px 4px",
                        borderRadius: "2px",
                        marginRight: "6px",
                        backgroundColor: p.type === "assist" ? T.accent : T.bg3,
                        color: p.type === "assist" ? T.bg1 : T.textDim,
                      }}
                    >
                      {p.type === "assist" ? t("llm.presetTypeAssist") : t("llm.presetTypeNarrative")}
                    </span>
                    <span style={{ fontWeight: "bold" }}>{p.name || p.id}</span>
                    {p.name && <span style={{ color: T.textDim, marginLeft: "8px", fontSize: "11px" }}>{p.id}</span>}
                  </span>
                  <span
                    style={{
                      color: T.textDim,
                      fontSize: "11px",
                      maxWidth: "40%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.description}
                  </span>
                </button>
              ))}
            </div>

            {message && <div style={{ color: T.danger, fontSize: "12px", marginTop: "8px" }}>{message}</div>}
          </>
        )}

        {subTab === "providers" && (
          <>
            {editingProvider ? (
              <ProviderEditor
                provider={editingProvider}
                isNew={isNewProvider}
                onSave={handleSaveProvider}
                onDelete={handleDeleteProvider}
                onBack={() => {
                  setEditingProvider(null);
                  loadAll();
                }}
              />
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.apiServices")} ==</span>
                  <button onClick={handleNewProvider} style={btn("create")}>
                    [{t("btn.newApiService")}]
                  </button>
                </div>

                {providers.length === 0 && (
                  <div style={{ color: T.textDim, fontSize: "12px", padding: "8px 0" }}>
                    {t("empty.llmApis")}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleEditProvider(p.id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        backgroundColor: T.bg1,
                        color: T.text,
                        border: `1px solid ${T.border}`,
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontSize: "12px",
                        textAlign: "left",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.borderLight)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
                    >
                      <span style={{ fontWeight: "bold" }}>{p.name || p.id}</span>
                      <span style={{ color: T.textDim, fontSize: "11px" }}>{p.id}</span>
                    </button>
                  ))}
                </div>

                {providerMessage && (
                  <div
                    style={{
                      color: providerMessage === t("msg.saved") ? T.success : T.danger,
                      fontSize: "12px",
                      marginTop: "8px",
                    }}
                  >
                    {providerMessage}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {subTab === "global" && (
          <>
            <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.globalSettings")} ==</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
              <span style={{ fontSize: "12px", color: T.textSub, minWidth: "90px" }}>{t("llm.defaultPreset")}</span>
              <select
                style={{ ...inputStyle, width: "200px" }}
                value={globalPreset}
                onChange={async (e) => {
                  const val = e.target.value;
                  setGlobalPreset(val);
                  await updateConfig({ defaultLlmPreset: val });
                }}
              >
                <option value="">{t("llm.noPreset")}</option>
                {presets
                  .filter((p) => p.type !== "assist")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
              </select>
              <span style={{ fontSize: "11px", color: T.textDim }}>{t("llm.globalPresetHint")}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
              <span style={{ fontSize: "12px", color: T.textSub, minWidth: "90px" }}>{t("llm.aiAssistPreset")}</span>
              <select
                style={{ ...inputStyle, width: "200px" }}
                value={aiAssistPreset}
                onChange={async (e) => {
                  const val = e.target.value;
                  setAiAssistPreset(val);
                  await updateConfig({ aiAssistPresetId: val });
                }}
              >
                <option value="">{t("llm.noPreset")}</option>
                {presets
                  .filter((p) => p.type === "assist")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
              </select>
              <span style={{ fontSize: "11px", color: T.textDim }}>{t("llm.aiAssistPresetHint")}</span>
            </div>
          </>
        )}

        {subTab === "debug" && <LLMDebugPanel entries={debugEntries} defaultExpanded />}
      </div>
    );
  }

  // --- Edit view ---
  const sortedEntries = [...preset.promptEntries].sort((a, b) => a.position - b.position);

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newPreset") : t("editor.editPreset")} ==
        </span>
        <button onClick={handleBack} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
      </div>

      {/* Basic info */}
      <div style={sectionStyle}>
        <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>{t("section.basicInfo")}</div>
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <input
              style={{ ...inputStyle, ...(isNew ? {} : { color: T.textDim }) }}
              value={preset.id}
              onChange={(e) => setPreset((p) => ({ ...p, id: e.target.value }))}
              disabled={!isNew}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>{t("field.name")}</div>
            <input
              style={inputStyle}
              value={preset.name}
              onChange={(e) => setPreset((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ marginBottom: "6px" }}>
          <div style={labelStyle}>{t("field.description")}</div>
          <input
            style={inputStyle}
            value={preset.description}
            onChange={(e) => setPreset((p) => ({ ...p, description: e.target.value }))}
          />
        </div>
        <div>
          <div style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "6px" }}>
            {t("llm.presetType")}
            <HelpButton show={showTypeHelp} onToggle={() => setShowTypeHelp((v) => !v)} />
          </div>
          {showTypeHelp && (
            <HelpPanel>
              <p style={helpP}>
                <b>{t("llm.presetTypeNarrative")}</b>：{t("llm.presetTypeNarrativeDesc")}
              </p>
              <p style={helpP}>
                <b>{t("llm.presetTypeAssist")}</b>：{t("llm.presetTypeAssistDesc")}
              </p>
            </HelpPanel>
          )}
          <select
            style={{ ...inputStyle, width: "200px" }}
            value={preset.type || "narrative"}
            onChange={(e) => {
              const newType = e.target.value as "narrative" | "assist";
              setPreset((p) => {
                const updated = { ...p, type: newType };
                // When switching to assist, ensure builtin context entry exists
                if (newType === "assist" && !p.promptEntries.some((pe) => pe.id === BUILTIN_CONTEXT_ENTRY_ID)) {
                  const maxPos = p.promptEntries.reduce((m, pe) => Math.max(m, pe.position), -1);
                  updated.promptEntries = [
                    ...p.promptEntries,
                    {
                      id: BUILTIN_CONTEXT_ENTRY_ID,
                      name: t("llm.builtinContext"),
                      enabled: true,
                      role: "system" as const,
                      content: "",
                      position: maxPos + 1,
                    },
                  ];
                }
                // When switching to narrative, remove builtin entry
                if (newType === "narrative") {
                  updated.promptEntries = p.promptEntries.filter((pe) => pe.id !== BUILTIN_CONTEXT_ENTRY_ID);
                }
                return updated;
              });
            }}
          >
            <option value="narrative">{t("llm.presetTypeNarrative")}</option>
            <option value="assist">{t("llm.presetTypeAssist")}</option>
          </select>
        </div>
      </div>

      {/* API service + parameters */}
      <div style={sectionStyle}>
        <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>
          {t("llm.apiServiceParams")}
        </div>
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div style={{ flex: 2 }}>
            <div style={labelStyle}>{t("llm.apiService")}</div>
            <select
              style={inputStyle}
              value={preset.providerId}
              onChange={(e) => setPreset((p) => ({ ...p, providerId: e.target.value }))}
            >
              <option value="">{t("llm.selectApiService")}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>{t("llm.postProcessing")}</div>
            <select
              style={inputStyle}
              value={preset.postProcessing}
              onChange={(e) => setPreset((p) => ({ ...p, postProcessing: e.target.value }))}
            >
              <option value="mergeConsecutiveSameRole">{t("llm.mergeConsecutive")}</option>
              <option value="none">{t("llm.noProcessing")}</option>
            </select>
          </div>
        </div>
        {!preset.providerId && (
          <div style={{ color: T.danger, fontSize: "11px", marginBottom: "6px" }}>
            {t("llm.selectApiHint")}
          </div>
        )}

        {/* Generation parameters */}
        <div style={{ color: T.textSub, fontSize: "11px", fontWeight: "bold", marginBottom: "4px", marginTop: "8px" }}>
          {t("llm.genParams")}
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {(
            [
              ["temperature", "Temperature", preset.parameters.temperature],
              ["maxTokens", "Max Tokens", preset.parameters.maxTokens],
              ["topP", "Top P", preset.parameters.topP],
              ["frequencyPenalty", "Freq Penalty", preset.parameters.frequencyPenalty],
              ["presencePenalty", "Pres Penalty", preset.parameters.presencePenalty],
            ] as [keyof LLMParameters, string, number][]
          ).map(([key, label, val]) => (
            <div key={key} style={{ width: "120px" }}>
              <div style={labelStyle}>{label}</div>
              <input
                style={{ ...inputStyle, width: "100%" }}
                type="number"
                step={key === "maxTokens" ? 1 : 0.1}
                value={val}
                onChange={(e) => {
                  const v = key === "maxTokens" ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0;
                  updateParams({ [key]: v });
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Prompt entries */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold" }}>{t("section.promptEntries")}</div>
          <button onClick={addEntry} style={btn("create")}>
            [{t("btn.newPromptEntry")}]
          </button>
        </div>

        {sortedEntries.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "12px", padding: "8px 0" }}>{t("empty.llmEntries")}</div>
        )}

        {sortedEntries.map((entry, idx) => (
          <PromptEntryRow
            key={entry.id}
            entry={entry}
            index={idx}
            total={sortedEntries.length}
            expanded={expandedEntry === idx}
            onToggle={() => setExpandedEntry(expandedEntry === idx ? null : idx)}
            onChange={(e) => {
              // Find actual index in unsorted array
              const realIdx = preset.promptEntries.findIndex((pe) => pe.id === entry.id);
              if (realIdx >= 0) updateEntry(realIdx, e);
            }}
            onMove={(dir) => {
              const realIdx = preset.promptEntries.findIndex((pe) => pe.id === entry.id);
              const targetEntry = sortedEntries[idx + dir];
              const realTarget = preset.promptEntries.findIndex((pe) => pe.id === targetEntry?.id);
              if (realIdx >= 0 && realTarget >= 0) {
                setPreset((p) => {
                  const entries = [...p.promptEntries];
                  const tmpPos = entries[realIdx].position;
                  entries[realIdx] = { ...entries[realIdx], position: entries[realTarget].position };
                  entries[realTarget] = { ...entries[realTarget], position: tmpPos };
                  return { ...p, promptEntries: entries };
                });
                setExpandedEntry(idx + dir);
              }
            }}
            onDelete={() => {
              // Prevent deleting builtin context entry
              if (entry.id === BUILTIN_CONTEXT_ENTRY_ID) return;
              const realIdx = preset.promptEntries.findIndex((pe) => pe.id === entry.id);
              if (realIdx >= 0) deleteEntry(realIdx);
            }}
            contentRef={contentRef}
            isAssistPreset={preset.type === "assist"}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px" }}>
        <button onClick={handleSave} disabled={saving} style={btn("create")}>
          [{t("btn.savePreset")}]
        </button>
        {!isNew && (
          <button onClick={handleDelete} disabled={saving} style={btn("danger")}>
            [{t("btn.deletePreset")}]
          </button>
        )}
        <button onClick={handleBack} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
        {message && (
          <span style={{ color: message === t("msg.saved") ? T.success : T.danger, fontSize: "12px" }}>{message}</span>
        )}
      </div>
    </div>
  );
}
