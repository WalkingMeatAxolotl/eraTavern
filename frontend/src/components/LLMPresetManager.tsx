import { useEffect, useState, useCallback, useRef } from "react";
import T from "../theme";
import type { LLMPreset, LLMPromptEntry, LLMApiConfig, LLMParameters } from "../types/game";
import {
  fetchLLMPresets,
  fetchLLMPreset,
  saveLLMPreset,
  deleteLLMPreset,
  fetchLLMModels,
  testLLMConnection,
} from "../api/client";

// --- Styles ---

const inputStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: T.bg3,
  color: T.text,
  border: `1px solid ${T.borderLight}`,
  borderRadius: "3px",
  fontSize: "12px",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  color: T.textSub,
  fontSize: "11px",
  marginBottom: "2px",
};

const sectionStyle: React.CSSProperties = {
  borderLeft: `2px solid ${T.borderLight}`,
  paddingLeft: "10px",
  marginBottom: "12px",
};

const btnStyle = (color: string): React.CSSProperties => ({
  padding: "5px 16px",
  backgroundColor: T.bg2,
  color,
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "13px",
});

// --- Default preset ---

function makeBlankPreset(): LLMPreset {
  return {
    id: "",
    name: "",
    description: "",
    api: {
      apiType: "chatCompletion",
      apiSource: "openaiCompatible",
      baseUrl: "",
      apiKey: "",
      model: "",
      streaming: true,
      postProcessing: "mergeConsecutiveSameRole",
      parameters: {
        temperature: 0.8,
        maxTokens: 4096,
        topP: 1.0,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
    },
    promptEntries: [],
  };
}

// --- Available variables ---

const VARIABLE_GROUPS = [
  { label: "核心", vars: ["rawOutput"] },
  { label: "角色", vars: ["playerName", "playerInfo", "targetName", "targetInfo", "clothingState"] },
  { label: "场景", vars: ["location", "mapName", "time", "weather"] },
];

// --- Prompt entry editor ---

function PromptEntryRow({
  entry,
  index,
  total,
  expanded,
  onToggle,
  onChange,
  onMove,
  onDelete,
  contentRef,
}: {
  entry: LLMPromptEntry;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (e: LLMPromptEntry) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  contentRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const roleColors: Record<string, string> = {
    system: T.accent,
    user: T.success,
    assistant: "#8888cc",
  };

  return (
    <div style={{ marginBottom: "4px" }}>
      {/* Collapsed row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 8px",
          backgroundColor: expanded ? T.bg2 : T.bg1,
          border: `1px solid ${expanded ? T.borderLight : T.border}`,
          borderRadius: "3px",
          cursor: "pointer",
        }}
        onClick={onToggle}
      >
        <button
          style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
          onClick={(e) => { e.stopPropagation(); onMove(-1); }}
          disabled={index === 0}
        >▲</button>
        <button
          style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
          onClick={(e) => { e.stopPropagation(); onMove(1); }}
          disabled={index === total - 1}
        >▼</button>
        <input
          type="checkbox"
          checked={entry.enabled}
          onChange={(e) => { e.stopPropagation(); onChange({ ...entry, enabled: e.target.checked }); }}
          onClick={(e) => e.stopPropagation()}
          style={{ accentColor: T.accent }}
        />
        <span style={{ color: roleColors[entry.role] || T.textSub, fontSize: "11px", fontWeight: "bold", minWidth: "50px" }}>
          {entry.role}
        </span>
        <span style={{ color: T.text, fontSize: "12px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.name || entry.id}
        </span>
        <span style={{ color: T.textDim, fontSize: "10px" }}>{expanded ? "▼" : "▶"}</span>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ ...sectionStyle, marginTop: "4px", marginBottom: "8px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>名称</div>
              <input
                style={inputStyle}
                value={entry.name}
                onChange={(e) => onChange({ ...entry, name: e.target.value })}
              />
            </div>
            <div style={{ width: "120px" }}>
              <div style={labelStyle}>角色</div>
              <select
                style={{ ...inputStyle }}
                value={entry.role}
                onChange={(e) => onChange({ ...entry, role: e.target.value as LLMPromptEntry["role"] })}
              >
                <option value="system">system</option>
                <option value="user">user</option>
                <option value="assistant">assistant</option>
              </select>
            </div>
          </div>

          <div style={labelStyle}>内容</div>
          <textarea
            ref={contentRef}
            style={{ ...inputStyle, minHeight: "100px", resize: "vertical", fontFamily: T.fontMono }}
            value={entry.content}
            onChange={(e) => onChange({ ...entry, content: e.target.value })}
          />

          {/* Variable chips */}
          <div style={{ marginTop: "6px", padding: "6px 8px", backgroundColor: T.bg3, borderRadius: "3px" }}>
            <div style={{ ...labelStyle, marginBottom: "4px" }}>可用变量（点击插入）</div>
            {VARIABLE_GROUPS.map((g) => (
              <div key={g.label} style={{ marginBottom: "2px" }}>
                <span style={{ color: T.textDim, fontSize: "10px", marginRight: "6px" }}>{g.label}:</span>
                {g.vars.map((v) => (
                  <button
                    key={v}
                    style={{
                      padding: "1px 6px",
                      margin: "1px 2px",
                      backgroundColor: T.bg2,
                      color: T.accent,
                      border: `1px solid ${T.border}`,
                      borderRadius: "2px",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontFamily: T.fontMono,
                    }}
                    onClick={() => {
                      const ta = contentRef.current;
                      if (!ta) return;
                      const tag = `{{${v}}}`;
                      const start = ta.selectionStart;
                      const end = ta.selectionEnd;
                      const val = ta.value;
                      const newVal = val.substring(0, start) + tag + val.substring(end);
                      onChange({ ...entry, content: newVal });
                      // Restore cursor after React re-render
                      setTimeout(() => {
                        ta.focus();
                        ta.setSelectionRange(start + tag.length, start + tag.length);
                      }, 0);
                    }}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "6px" }}>
            <button style={btnStyle(T.danger)} onClick={onDelete}>[删除条目]</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main component ---

export default function LLMPresetManager() {
  const [presets, setPresets] = useState<{ id: string; name: string; description: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preset, setPreset] = useState<LLMPreset>(makeBlankPreset());
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [modelList, setModelList] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [testResult, setTestResult] = useState("");
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const loadPresets = useCallback(async () => {
    try {
      const list = await fetchLLMPresets();
      setPresets(list);
    } catch (e) {
      console.error("Failed to load presets:", e);
    }
  }, []);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  const handleSelectPreset = async (id: string) => {
    try {
      const data = await fetchLLMPreset(id);
      setPreset(data);
      setEditingId(id);
      setIsNew(false);
      setMessage("");
      setExpandedEntry(null);
      setModelList([]);
      setTestResult("");
    } catch (e) {
      setMessage(`加载失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleNew = () => {
    setPreset(makeBlankPreset());
    setEditingId("__new__");
    setIsNew(true);
    setMessage("");
    setExpandedEntry(null);
    setModelList([]);
    setTestResult("");
  };

  const handleBack = () => {
    setEditingId(null);
    setIsNew(false);
    setMessage("");
    loadPresets();
  };

  const handleSave = async () => {
    const id = preset.id.trim();
    if (!id) { setMessage("ID 不能为空"); return; }
    if (!preset.name.trim()) { setMessage("名称不能为空"); return; }
    setSaving(true);
    setMessage("");
    try {
      const result = await saveLLMPreset(id, preset);
      if (result.success) {
        setMessage("已保存");
        if (isNew) {
          setIsNew(false);
          setEditingId(id);
        }
        loadPresets();
      } else {
        setMessage(result.message || "保存失败");
      }
    } catch (e) {
      setMessage(`保存失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除预设「${preset.name || preset.id}」吗？`)) return;
    setSaving(true);
    try {
      const result = await deleteLLMPreset(preset.id);
      if (result.success) {
        handleBack();
      } else {
        setMessage(result.message || "删除失败");
      }
    } catch (e) {
      setMessage(`删除失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFetchModels = async () => {
    const url = preset.api.baseUrl.trim();
    if (!url) { setTestResult("请先填写 API URL"); return; }
    setModelLoading(true);
    setTestResult("");
    try {
      const models = await fetchLLMModels(url, preset.api.apiKey);
      setModelList(models);
      if (models.length === 0) setTestResult("未获取到模型");
    } catch (e) {
      setTestResult(`获取模型失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setModelLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const url = preset.api.baseUrl.trim();
    if (!url) { setTestResult("请先填写 API URL"); return; }
    if (!preset.api.model) { setTestResult("请先选择模型"); return; }
    setTestResult("测试中...");
    try {
      const result = await testLLMConnection({
        baseUrl: url,
        apiKey: preset.api.apiKey,
        model: preset.api.model,
      });
      setTestResult(result.success ? "连接成功 ✓" : (result.message || "连接失败"));
    } catch (e) {
      setTestResult(`连接失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  const updateApi = (patch: Partial<LLMApiConfig>) => {
    setPreset((p) => ({ ...p, api: { ...p.api, ...patch } }));
  };

  const updateParams = (patch: Partial<LLMParameters>) => {
    setPreset((p) => ({
      ...p,
      api: { ...p.api, parameters: { ...p.api.parameters, ...patch } },
    }));
  };

  const updateEntry = (idx: number, entry: LLMPromptEntry) => {
    setPreset((p) => {
      const entries = [...p.promptEntries];
      entries[idx] = entry;
      return { ...p, promptEntries: entries };
    });
  };

  const moveEntry = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    setPreset((p) => {
      const entries = [...p.promptEntries];
      if (target < 0 || target >= entries.length) return p;
      // Swap positions
      const tmpPos = entries[idx].position;
      entries[idx] = { ...entries[idx], position: entries[target].position };
      entries[target] = { ...entries[target], position: tmpPos };
      // Swap array positions
      [entries[idx], entries[target]] = [entries[target], entries[idx]];
      return { ...p, promptEntries: entries };
    });
    setExpandedEntry((cur) => (cur === idx ? target : cur === target ? idx : cur));
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

  // --- List view ---
  if (editingId === null) {
    return (
      <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
            == LLM 预设 ==
          </span>
          <button onClick={handleNew} style={btnStyle(T.successDim)}>[+ 新建预设]</button>
        </div>

        {presets.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "12px", padding: "8px 0" }}>
            暂无预设。点击 [+ 新建预设] 创建。
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
                <span style={{ fontWeight: "bold" }}>{p.name || p.id}</span>
                {p.name && <span style={{ color: T.textDim, marginLeft: "8px", fontSize: "11px" }}>{p.id}</span>}
              </span>
              <span style={{ color: T.textDim, fontSize: "11px", maxWidth: "40%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.description}
              </span>
            </button>
          ))}
        </div>

        {message && (
          <div style={{ color: T.danger, fontSize: "12px", marginTop: "8px" }}>{message}</div>
        )}
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
          == {isNew ? "新建预设" : "编辑预设"} ==
        </span>
        <button onClick={handleBack} style={btnStyle(T.textSub)}>[返回列表]</button>
      </div>

      {/* Basic info */}
      <div style={sectionStyle}>
        <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>基本信息</div>
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
            <div style={labelStyle}>名称</div>
            <input
              style={inputStyle}
              value={preset.name}
              onChange={(e) => setPreset((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <div style={labelStyle}>描述</div>
          <input
            style={inputStyle}
            value={preset.description}
            onChange={(e) => setPreset((p) => ({ ...p, description: e.target.value }))}
          />
        </div>
      </div>

      {/* API config */}
      <div style={sectionStyle}>
        <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>API 配置</div>
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div style={{ flex: 2 }}>
            <div style={labelStyle}>API URL</div>
            <input
              style={inputStyle}
              value={preset.api.baseUrl}
              onChange={(e) => updateApi({ baseUrl: e.target.value })}
              placeholder="http://127.0.0.1:8317/v1"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>API Key</div>
            <input
              style={inputStyle}
              type="password"
              value={preset.api.apiKey}
              onChange={(e) => updateApi({ apiKey: e.target.value })}
              placeholder="（可选）"
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "6px" }}>
          <div style={{ flex: 2 }}>
            <div style={labelStyle}>模型</div>
            {modelList.length > 0 ? (
              <select
                style={inputStyle}
                value={preset.api.model}
                onChange={(e) => updateApi({ model: e.target.value })}
              >
                <option value="">-- 选择模型 --</option>
                {modelList.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input
                style={inputStyle}
                value={preset.api.model}
                onChange={(e) => updateApi({ model: e.target.value })}
                placeholder="模型名称"
              />
            )}
          </div>
          <button onClick={handleFetchModels} disabled={modelLoading} style={btnStyle(T.textSub)}>
            {modelLoading ? "[获取中...]" : "[获取模型]"}
          </button>
          <button onClick={handleTestConnection} style={btnStyle(T.textSub)}>
            [测试连接]
          </button>
        </div>
        {testResult && (
          <div style={{ color: testResult.includes("✓") ? T.success : T.danger, fontSize: "12px", marginBottom: "6px" }}>
            {testResult}
          </div>
        )}
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "4px" }}>
              <input
                type="checkbox"
                checked={preset.api.streaming}
                onChange={(e) => updateApi({ streaming: e.target.checked })}
                style={{ accentColor: T.accent }}
              />
              流式输出
            </label>
          </div>
          <div>
            <div style={labelStyle}>后处理</div>
            <select
              style={{ ...inputStyle, width: "auto" }}
              value={preset.api.postProcessing}
              onChange={(e) => updateApi({ postProcessing: e.target.value })}
            >
              <option value="mergeConsecutiveSameRole">合并相邻同角色</option>
              <option value="none">不处理</option>
            </select>
          </div>
        </div>

        {/* Generation parameters */}
        <div style={{ color: T.textSub, fontSize: "11px", fontWeight: "bold", marginBottom: "4px", marginTop: "8px" }}>生成参数</div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {([
            ["temperature", "Temperature", preset.api.parameters.temperature],
            ["maxTokens", "Max Tokens", preset.api.parameters.maxTokens],
            ["topP", "Top P", preset.api.parameters.topP],
            ["frequencyPenalty", "Freq Penalty", preset.api.parameters.frequencyPenalty],
            ["presencePenalty", "Pres Penalty", preset.api.parameters.presencePenalty],
          ] as [keyof LLMParameters, string, number][]).map(([key, label, val]) => (
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
          <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold" }}>提示词条目</div>
          <button onClick={addEntry} style={btnStyle(T.successDim)}>[+ 新增条目]</button>
        </div>

        {sortedEntries.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "12px", padding: "8px 0" }}>暂无条目。</div>
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
              const realIdx = preset.promptEntries.findIndex((pe) => pe.id === entry.id);
              if (realIdx >= 0) deleteEntry(realIdx);
            }}
            contentRef={contentRef}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px" }}>
        <button onClick={handleSave} disabled={saving} style={btnStyle(T.successDim)}>
          [保存预设]
        </button>
        {!isNew && (
          <button onClick={handleDelete} disabled={saving} style={btnStyle(T.danger)}>
            [删除预设]
          </button>
        )}
        <button onClick={handleBack} style={btnStyle(T.textSub)}>[返回列表]</button>
        {message && (
          <span style={{ color: message === "已保存" ? T.success : T.danger, fontSize: "12px" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
