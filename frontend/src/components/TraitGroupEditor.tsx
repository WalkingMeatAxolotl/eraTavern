import { useState, useMemo } from "react";
import type { GameDefinitions, TraitGroup } from "../types/game";
import { createTraitGroup, saveTraitGroup, deleteTraitGroup } from "../api/client";
import T from "../theme";
import PrefixedIdInput from "./PrefixedIdInput";

function toLocalId(nsId: string): string {
  const dot = nsId.indexOf(".");
  return dot >= 0 ? nsId.slice(dot + 1) : nsId;
}

interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface Props {
  group: TraitGroup;
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
  addonCrud?: AddonCrud;
}

export default function TraitGroupEditor({ group, definitions, isNew, onBack, addonCrud }: Props) {
  const addonPrefix = group.source || "";
  const [data, setData] = useState<TraitGroup>(() => structuredClone(group));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isReadOnly = false;  // all addon entities are editable
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
      const payload = { id: data.id, name: data.name, category: data.category, traits: data.traits, exclusive: data.exclusive !== false, source: group.source };
      if (addonCrud) {
        if (isNew) { await addonCrud.create(payload); } else { await addonCrud.save(group.id, payload); }
        return;
      }
      const result = isNew
        ? await createTraitGroup(payload)
        : await saveTraitGroup(group.id, payload);
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
      if (addonCrud) { await addonCrud.delete(data.id); return; }
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
        fontSize: "13px",
        color: T.text,
        backgroundColor: T.bg2,
        padding: "12px",
        borderRadius: "4px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建特质组" : `编辑特质组: ${data.name}`} ==
        </span>
        <button onClick={onBack} style={btnStyle(T.textSub)}>
          [返回]
        </button>
      </div>

      {/* ID */}
      <Row label="ID">
        <PrefixedIdInput
          prefix={addonPrefix}
          value={isNew ? data.id : toLocalId(data.id)}
          onChange={(v) => setData((prev) => ({ ...prev, id: v }))}
          disabled={!isNew || isReadOnly}
        />
      </Row>

      {/* Name */}
      <Row label="名称">
        <input
          value={data.name}
          onChange={(e) => setData((prev) => ({ ...prev, name: e.target.value }))}
          readOnly={isReadOnly}
          style={inputStyle(isReadOnly ? T.textDim : undefined)}
        />
      </Row>

      {/* Category */}
      <Row label="分类">
        <select
          value={data.category}
          onChange={(e) => setData((prev) => ({ ...prev, category: e.target.value, traits: [] }))}
          disabled={isReadOnly}
          style={selectStyle()}
        >
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>{cat.label}</option>
          ))}
        </select>
      </Row>

      {/* Exclusive */}
      <Row label="互斥">
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px", color: T.textSub }}>
          <input
            type="checkbox"
            checked={data.exclusive !== false}
            onChange={(e) => setData((prev) => ({ ...prev, exclusive: e.target.checked }))}
            disabled={isReadOnly}
            style={{ cursor: isReadOnly ? "default" : "pointer" }}
          />
          同组只能选一个
        </label>
      </Row>

      {/* Member traits */}
      <div style={{ marginTop: "8px", marginBottom: "4px", color: T.textSub }}>成员特质:</div>
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
                backgroundColor: T.bg2,
                border: `1px solid ${T.borderLight}`,
                borderRadius: "3px",
                fontSize: "12px",
              }}
            >
              {def?.name ?? tid}
              {!isReadOnly && (
                <button
                  onClick={() => setData((prev) => ({ ...prev, traits: prev.traits.filter((x) => x !== tid) }))}
                  style={{
                    background: "none",
                    border: "none",
                    color: T.danger,
                    cursor: "pointer",
                    padding: "0 2px",
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
        {!isReadOnly && (
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
      <div style={{ display: "flex", gap: "8px", marginTop: "12px", borderTop: `1px solid ${T.border}`, paddingTop: "12px" }}>
        {!isReadOnly && (
          <button onClick={handleSave} disabled={saving} style={btnStyle(T.successDim)}>
            [{saving ? "提交中..." : "确定"}]
          </button>
        )}
        {!isReadOnly && !isNew && (
          <button onClick={handleDelete} disabled={saving} style={btnStyle(T.danger)}>
            [删除]
          </button>
        )}
        <button onClick={onBack} style={btnStyle(T.textSub)}>
          [返回]
        </button>
        {message && (
          <span style={{ color: message.includes("fail") || message.includes("not found") ? T.danger : T.success, marginLeft: "8px", alignSelf: "center" }}>
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
      <span style={{ minWidth: "60px", color: T.textSub }}>{label}:</span>
      {children}
    </div>
  );
}

function inputStyle(color?: string): React.CSSProperties {
  return {
    backgroundColor: T.bg2,
    color: color ?? T.text,
    border: `1px solid ${T.borderLight}`,
    borderRadius: "3px",
    padding: "3px 6px",
    fontSize: "13px",
    outline: "none",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    backgroundColor: T.bg2,
    color: T.text,
    border: `1px solid ${T.borderLight}`,
    borderRadius: "3px",
    padding: "3px 6px",
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
    border: `1px solid ${T.border}`,
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "13px",
  };
}
