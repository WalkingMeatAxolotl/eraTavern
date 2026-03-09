import { useState, useMemo } from "react";
import type { GameDefinitions, TraitGroup } from "../types/game";
import { createTraitGroup, saveTraitGroup, deleteTraitGroup } from "../api/client";

interface Props {
  group: TraitGroup;
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
}

export default function TraitGroupEditor({ group, definitions, isNew, onBack }: Props) {
  const [data, setData] = useState<TraitGroup>(() => structuredClone(group));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isBuiltin = data.source === "builtin";
  const categories = definitions.template.traits;

  // Traits in the same category as the group
  const availableTraits = useMemo(() => {
    return Object.values(definitions.traitDefs)
      .filter((t) => t.category === data.category)
      .map((t) => ({ id: t.id, name: t.name }));
  }, [definitions.traitDefs, data.category]);

  const handleSave = async () => {
    if (!data.id || !data.name) {
      setMessage("ID 和名称不能为空");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = { id: data.id, name: data.name, category: data.category, traits: data.traits };
      const result = isNew
        ? await createTraitGroup(payload)
        : await saveTraitGroup(data.id, payload);
      setMessage(result.message);
      if (result.success && isNew) {
        onBack();
      }
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定删除特质组 "${data.name}" ？`)) return;
    setSaving(true);
    try {
      await deleteTraitGroup(data.id);
      onBack();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ddd",
        backgroundColor: "#1a1a2e",
        padding: "12px",
        borderRadius: "4px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: "#e94560", fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建特质组" : `编辑特质组: ${data.name}`} ==
        </span>
        <button onClick={onBack} style={btnStyle("#888")}>
          [返回]
        </button>
      </div>

      {/* ID */}
      <Row label="ID">
        <input
          value={data.id}
          onChange={(e) => setData((prev) => ({ ...prev, id: e.target.value }))}
          readOnly={!isNew || isBuiltin}
          style={inputStyle(!isNew || isBuiltin ? "#555" : undefined)}
        />
      </Row>

      {/* Name */}
      <Row label="名称">
        <input
          value={data.name}
          onChange={(e) => setData((prev) => ({ ...prev, name: e.target.value }))}
          readOnly={isBuiltin}
          style={inputStyle(isBuiltin ? "#555" : undefined)}
        />
      </Row>

      {/* Category */}
      <Row label="分类">
        <select
          value={data.category}
          onChange={(e) => setData((prev) => ({ ...prev, category: e.target.value, traits: [] }))}
          disabled={isBuiltin}
          style={selectStyle()}
        >
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>{cat.label}</option>
          ))}
        </select>
      </Row>

      {/* Member traits */}
      <div style={{ marginTop: "8px", marginBottom: "4px", color: "#aaa" }}>成员特质:</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginBottom: "8px" }}>
        {data.traits.map((tid) => {
          const def = definitions.traitDefs[tid];
          return (
            <span
              key={tid}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                padding: "1px 6px",
                backgroundColor: "#16213e",
                border: "1px solid #444",
                borderRadius: "3px",
                fontSize: "12px",
              }}
            >
              {def?.name ?? tid}
              {!isBuiltin && (
                <button
                  onClick={() => setData((prev) => ({ ...prev, traits: prev.traits.filter((x) => x !== tid) }))}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#e94560",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    lineHeight: 1,
                  }}
                >
                  x
                </button>
              )}
            </span>
          );
        })}
        {!isBuiltin && (
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setData((prev) => ({ ...prev, traits: [...prev.traits, e.target.value] }));
            }}
            style={selectStyle()}
          >
            <option value="">+</option>
            {availableTraits
              .filter((t) => !data.traits.includes(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>
        )}
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: "8px", marginTop: "12px", borderTop: "1px solid #333", paddingTop: "12px" }}>
        {!isBuiltin && (
          <button onClick={handleSave} disabled={saving} style={btnStyle("#0f0")}>
            [{saving ? "保存中..." : "保存"}]
          </button>
        )}
        {!isBuiltin && !isNew && (
          <button onClick={handleDelete} disabled={saving} style={btnStyle("#e94560")}>
            [删除]
          </button>
        )}
        <button onClick={onBack} style={btnStyle("#888")}>
          [返回]
        </button>
        {message && (
          <span style={{ color: message.includes("fail") || message.includes("not found") ? "#e94560" : "#0f0", marginLeft: "8px", alignSelf: "center" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
      <span style={{ minWidth: "60px", color: "#aaa" }}>{label}:</span>
      {children}
    </div>
  );
}

function inputStyle(color?: string): React.CSSProperties {
  return {
    backgroundColor: "#16213e",
    color: color ?? "#ddd",
    border: "1px solid #333",
    borderRadius: "3px",
    padding: "3px 6px",
    fontFamily: "monospace",
    fontSize: "13px",
    outline: "none",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    backgroundColor: "#16213e",
    color: "#ddd",
    border: "1px solid #333",
    borderRadius: "3px",
    padding: "3px 6px",
    fontFamily: "monospace",
    fontSize: "13px",
    outline: "none",
    cursor: "pointer",
  };
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "4px 12px",
    backgroundColor: "transparent",
    color,
    border: "1px solid #333",
    borderRadius: "3px",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "13px",
  };
}
