import { useState, useCallback } from "react";
import type { VariableDefinition, VariableStep, GameDefinitions } from "../../types/game";
import {
  createVariableDef,
  saveVariableDef,
  deleteVariableDef,
  evaluateVariable,
  fetchCharacterConfigs,
} from "../../api/client";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { VarStepType, EF, ArithOp } from "../../constants";
import { inputStyle, labelStyle } from "../shared/styles";
import CloneButton from "../shared/CloneDialog";

interface Props {
  variable: VariableDefinition;
  isNew: boolean;
  allTags: string[];
  allVariables: VariableDefinition[];
  definitions: GameDefinitions | null;
  onBack: () => void;
  addonIds?: string[];
}

const OP_OPTIONS: { value: string; label: string }[] = [
  { value: ArithOp.ADD, label: "+" },
  { value: ArithOp.SUBTRACT, label: "-" },
  { value: ArithOp.MULTIPLY, label: "x" },
  { value: ArithOp.DIVIDE, label: "/" },
  { value: ArithOp.MIN, label: "min" },
  { value: ArithOp.MAX, label: "max" },
  { value: ArithOp.FLOOR, label: t("op.floor") },
  { value: ArithOp.CAP, label: t("op.cap") },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: VarStepType.ABILITY, label: t("varStep.ability") },
  { value: VarStepType.RESOURCE, label: t("varStep.resource") },
  { value: VarStepType.BASIC_INFO, label: t("varStep.basicInfo") },
  { value: VarStepType.TRAIT_COUNT, label: t("varStep.traitCount") },
  { value: VarStepType.HAS_TRAIT, label: t("varStep.hasTrait") },
  { value: VarStepType.EXPERIENCE, label: t("varStep.experience") },
  { value: VarStepType.ITEM_COUNT, label: t("varStep.itemCount") },
  { value: VarStepType.FAVORABILITY, label: t("varStep.favorability") },
  { value: VarStepType.CONSTANT, label: t("varStep.constant") },
  { value: VarStepType.VARIABLE, label: t("varStep.variable") },
];

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const btnBase: React.CSSProperties = {
  padding: "5px 16px",
  backgroundColor: T.bg2,
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "12px",
};

function makeBlankStep(): VariableStep {
  return { type: VarStepType.CONSTANT, value: 0, op: ArithOp.ADD };
}

function isAdditive(op: string): boolean {
  return op === ArithOp.ADD || op === ArithOp.SUBTRACT;
}

function isMultiplicative(op: string): boolean {
  return op === ArithOp.MULTIPLY || op === ArithOp.DIVIDE;
}

function formulaPreview(steps: VariableStep[], bidirectional?: boolean): string {
  if (steps.length === 0) return t("empty.slot");

  const parts: string[] = [];
  let i = 0;

  while (i < steps.length) {
    const s = steps[i];
    const val = stepValueLabel(s, bidirectional);
    const op = s.op ?? "";

    if (i === 0) {
      // Look ahead: if next ops are additive followed by multiplicative, need parens
      let j = i + 1;
      while (j < steps.length && isAdditive(steps[j].op ?? "add")) j++;

      if (j > i + 1 && j < steps.length && isMultiplicative(steps[j].op ?? "add")) {
        // Group i..j-1 in parens
        const group = [val];
        for (let k = i + 1; k < j; k++) {
          group.push(`${opSymbol(steps[k].op ?? "add")} ${stepValueLabel(steps[k], bidirectional)}`);
        }
        parts.push(`(${group.join(" ")})`);
        i = j;
        continue;
      }

      parts.push(val);
    } else {
      const sym = opSymbol(op);
      if ([ArithOp.MIN, ArithOp.MAX, ArithOp.FLOOR, ArithOp.CAP].includes(op)) {
        parts.push(`${sym}(${val})`);
      } else {
        parts.push(`${sym} ${val}`);
      }
    }
    i++;
  }
  return parts.join(" ");
}

function opSymbol(op: string): string {
  switch (op) {
    case ArithOp.ADD:
      return "+";
    case ArithOp.SUBTRACT:
      return "\u2212";
    case ArithOp.MULTIPLY:
      return "\u00D7";
    case ArithOp.DIVIDE:
      return "\u00F7";
    case ArithOp.MIN:
      return "min";
    case ArithOp.MAX:
      return "max";
    case ArithOp.FLOOR:
      return "\u2265";
    case ArithOp.CAP:
      return "\u2264";
    default:
      return "?";
  }
}

function stepValueLabel(s: VariableStep, bidirectional?: boolean): string {
  const src = bidirectional ? (s.source === "target" ? "T:" : "S:") : "";
  switch (s.type) {
    case VarStepType.ABILITY:
      return `${src}${s.key ?? "?"}`;
    case VarStepType.RESOURCE:
      return `${src}${s.key ?? "?"}${s.field === "max" ? ".max" : ""}`;
    case VarStepType.BASIC_INFO:
      return `${src}${s.key ?? "?"}`;
    case VarStepType.TRAIT_COUNT:
      return `${src}count(${s.traitGroup ?? "?"})`;
    case VarStepType.HAS_TRAIT:
      return `${src}has(${s.traitId ?? "?"})`;
    case VarStepType.EXPERIENCE:
      return `${src}exp(${s.key ?? "?"})`;
    case VarStepType.ITEM_COUNT:
      return `${src}item(${s.key ?? "?"})`;
    case VarStepType.FAVORABILITY:
      return bidirectional && s.source === "target" ? "fav(T→S)" : "fav(S→T)";
    case VarStepType.CONSTANT:
      return String(s.value ?? 0);
    case VarStepType.VARIABLE:
      return `$${s.varId ?? "?"}`;
    default:
      return "?";
  }
}

export default function VariableEditor({ variable, isNew, allTags, allVariables, definitions, onBack, addonIds }: Props) {
  const [id, setId] = useState(variable.id);
  const [name, setName] = useState(variable.name);
  const [description, setDescription] = useState(variable.description ?? "");
  const [isBidirectional, setIsBidirectional] = useState(variable.isBidirectional ?? false);
  const [tags, setTags] = useState<string[]>(variable.tags ?? []);
  const [steps, setSteps] = useState<VariableStep[]>(variable.steps ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Test panel state
  const [testOpen, setTestOpen] = useState(false);
  const [testCharacters, setTestCharacters] = useState<{ id: string; name: string }[]>([]);
  const [testCharId, setTestCharId] = useState("");
  const [testTargetId, setTestTargetId] = useState("");
  const [testResult, setTestResult] = useState<{
    result: number;
    steps: { index: number; label: string; op: string; type: string; stepValue: number; accumulated: number }[];
  } | null>(null);
  const [testError, setTestError] = useState("");

  const isReadOnly = !variable.source && !isNew;

  const loadTestCharacters = useCallback(async () => {
    const chars = await fetchCharacterConfigs();
    const list = chars.map((c) => ({
      id: c.id,
      name: (c.basicInfo?.name as string) || c.id,
    }));
    setTestCharacters(list);
    if (list.length > 0 && !testCharId) {
      setTestCharId(list[0].id);
    }
  }, [testCharId]);

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage(t("val.idNameRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data = {
        id: id.trim(),
        name: name.trim(),
        description: description.trim(),
        isBidirectional: isBidirectional || undefined,
        tags,
        steps,
        source: variable.source,
      };
      const result = isNew ? await createVariableDef(data) : await saveVariableDef(variable.id, data);
      if (result.success) {
        setMessage(t("status.saved"));
        if (isNew) setTimeout(onBack, 500);
      } else {
        setMessage(result.message);
      }
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteVar", { name: name || id }))) return;
    const result = await deleteVariableDef(variable.id);
    if (result.success) onBack();
    else setMessage(result.message);
  };

  const handleTest = async () => {
    if (!testCharId) return;
    setTestResult(null);
    setTestError("");

    // Need to save first if there are unsaved changes
    const varId = isNew ? "" : variable.id;
    if (!varId) {
      setTestError(t("msg.saveFirstTest"));
      return;
    }

    try {
      const res = await evaluateVariable(varId, testCharId, isBidirectional ? testTargetId : undefined);
      if (res.success && res.result !== undefined && res.steps) {
        setTestResult({ result: res.result, steps: res.steps });
      } else {
        setTestError(res.message ?? t("ui.evalFailed"));
      }
    } catch (e) {
      setTestError(t("ui.requestFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  // Step management
  const updateStep = (index: number, patch: Partial<VariableStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeStep = (index: number) => {
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If removed first step, clear op on new first
      if (index === 0 && next.length > 0) {
        next[0] = { ...next[0] };
        delete next[0].op;
      }
      return next;
    });
  };

  const addStep = () => {
    if (steps.length === 0) {
      setSteps([{ type: VarStepType.CONSTANT, value: 0 }]);
    } else {
      setSteps((prev) => [...prev, makeBlankStep()]);
    }
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      // Fix ops: first step has no op, others need op
      return next.map((s, i) => {
        if (i === 0) {
          const { op: _, ...rest } = s;
          return rest;
        }
        return s.op ? s : { ...s, op: ArithOp.ADD as const };
      });
    });
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newVar") : t("editor.editNamed", { name: variable.name || variable.id })} ==
        </span>
        <button onClick={onBack} style={{ ...btnBase, color: T.textSub }}>
          [{t("btn.back")}]
        </button>
      </div>

      {/* Basic fields */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>ID</div>
          <input
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={!isNew || isReadOnly}
            placeholder={t("ph.varId")}
          />
        </div>
        <div style={{ flex: 2 }}>
          <div style={labelStyle}>{t("field.name")}</div>
          <input
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isReadOnly}
            placeholder={t("ph.displayName")}
          />
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <div style={labelStyle}>{t("field.description")}</div>
        <textarea
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isReadOnly}
          placeholder={t("ph.optionalDesc")}
        />
      </div>

      {/* Bidirectional */}
      <div style={{ marginBottom: "12px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: T.textSub }}>
          <input
            type="checkbox"
            checked={isBidirectional}
            onChange={(e) => setIsBidirectional(e.target.checked)}
            disabled={isReadOnly}
            style={{ accentColor: T.accent }}
          />
          {t("var.bidirectional")}
        </label>
      </div>

      {/* Tags */}
      <div style={{ marginBottom: "12px" }}>
        <div style={labelStyle}>{t("field.tags")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => !isReadOnly && toggleTag(tag)}
              style={{
                padding: "2px 8px",
                backgroundColor: tags.includes(tag) ? T.accentBg : T.bg2,
                color: tags.includes(tag) ? T.accent : T.textDim,
                border: `1px solid ${tags.includes(tag) ? T.accentDim : T.border}`,
                borderRadius: "3px",
                cursor: isReadOnly ? "default" : "pointer",
                fontSize: "11px",
              }}
            >
              {tag}
            </button>
          ))}
          {allTags.length === 0 && <span style={{ color: T.textDim, fontSize: "11px" }}>{t("empty.noAvailTags")}</span>}
        </div>
      </div>

      {/* Formula preview */}
      <div
        style={{
          marginBottom: "12px",
          padding: "8px 12px",
          backgroundColor: T.bg3,
          border: `1px solid ${T.border}`,
          borderRadius: "3px",
        }}
      >
        <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "4px" }}>{t("section.formulaPreview")}</div>
        <div style={{ color: T.accent, fontSize: "13px", wordBreak: "break-all" }}>
          {formulaPreview(steps, isBidirectional)}
        </div>
      </div>

      {/* Steps editor */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ ...labelStyle, marginBottom: "6px" }}>{t("section.computeSteps")}</div>
        <div style={{ borderLeft: `2px solid ${T.borderLight}`, paddingLeft: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {steps.map((step, i) => (
              <StepRow
                key={i}
                step={step}
                index={i}
                isFirst={i === 0}
                isLast={i === steps.length - 1}
                readOnly={isReadOnly}
                isBidirectional={isBidirectional}
                allVariables={allVariables}
                currentVarId={variable.id}
                definitions={definitions}
                onChange={(patch) => updateStep(i, patch)}
                onRemove={() => removeStep(i)}
                onMove={moveStep}
              />
            ))}
          </div>
          {!isReadOnly && (
            <button
              onClick={addStep}
              style={{
                ...btnBase,
                color: T.successDim,
                marginTop: "6px",
                width: "100%",
                textAlign: "center",
              }}
            >
              [{t("btn.addStep")}]
            </button>
          )}
        </div>
      </div>

      {/* Test panel */}
      <div
        style={{
          border: `1px solid ${T.border}`,
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => {
            const next = !testOpen;
            setTestOpen(next);
            if (next && testCharacters.length === 0) loadTestCharacters();
          }}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "8px 12px",
            backgroundColor: T.bg2,
            color: testOpen ? T.accent : T.textSub,
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          {testOpen ? "\u25BC" : "\u25B6"} {t("ui.testCompute")}
        </button>
        {testOpen && (
          <div style={{ padding: "8px 12px", backgroundColor: T.bg3 }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
              <span style={{ color: T.textSub, fontSize: "12px" }}>{t("target.self")}:</span>
              <select
                style={{ ...selectStyle, flex: 1, minWidth: "120px" }}
                value={testCharId}
                onChange={(e) => setTestCharId(e.target.value)}
              >
                {testCharacters.length === 0 && <option value="">{t("ui.noCharacter")}</option>}
                {testCharacters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
              {isBidirectional && (
                <>
                  <span style={{ color: T.textSub, fontSize: "12px" }}>{t("target.target")}:</span>
                  <select
                    style={{ ...selectStyle, flex: 1, minWidth: "120px" }}
                    value={testTargetId}
                    onChange={(e) => setTestTargetId(e.target.value)}
                  >
                    <option value="">{t("ui.noSelection")}</option>
                    {testCharacters
                      .filter((c) => c.id !== testCharId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id})
                        </option>
                      ))}
                  </select>
                </>
              )}
              <button
                onClick={handleTest}
                style={{ ...btnBase, color: T.accent, padding: "4px 12px" }}
                disabled={!testCharId || isNew}
              >
                [{t("btn.compute")}]
              </button>
            </div>

            {testError && <div style={{ color: T.danger, fontSize: "12px", marginBottom: "6px" }}>{testError}</div>}

            {testResult && (
              <div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    marginBottom: "6px",
                    fontSize: "12px",
                  }}
                >
                  {testResult.steps.map((s) => (
                    <div
                      key={s.index}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "2px 8px",
                        backgroundColor: T.bg2,
                        borderRadius: "2px",
                      }}
                    >
                      <span style={{ color: T.textSub }}>
                        {s.index === 0 ? t("var.initial") : opSymbol(s.op)} <span style={{ color: T.textSub }}>{s.type}</span>
                        {s.label && <span style={{ color: T.textDim }}> ({s.label})</span>} ={" "}
                        <span style={{ color: T.text }}>{s.stepValue}</span>
                      </span>
                      <span style={{ color: T.accent }}>
                        {"\u2192"} {s.accumulated}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    padding: "4px 8px",
                    backgroundColor: T.bg2,
                    borderRadius: "3px",
                    color: T.success,
                    fontSize: "13px",
                    fontWeight: "bold",
                  }}
                >
                  {t("var.result")}: {testResult.result}
                </div>
              </div>
            )}

            {isNew && (
              <div style={{ color: T.textSub, fontSize: "11px", marginTop: "4px" }}>{t("msg.saveFirstTestNote")}</div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          marginTop: "12px",
          borderTop: `1px solid ${T.border}`,
          paddingTop: "12px",
        }}
      >
        {!isReadOnly && (
          <button onClick={handleSave} disabled={saving} style={{ ...btnBase, color: T.successDim }}>
            [{saving ? t("status.submitting") : t("btn.confirm")}]
          </button>
        )}
        {!isReadOnly && !isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={variable.source || ""}
            getData={() => ({ name: name.trim(), description: description.trim(), isBidirectional: isBidirectional || undefined, tags, steps })}
            createFn={(d) => createVariableDef(d)}
            onSuccess={onBack}
            buttonStyle={{ ...btnBase, color: T.accent }}
          />
        )}
        {!isReadOnly && !isNew && (
          <button onClick={handleDelete} style={{ ...btnBase, color: T.danger }}>
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={onBack} style={{ ...btnBase, color: T.textSub }}>
          [{t("btn.back")}]
        </button>
        {message && (
          <span style={{ color: message === t("status.saved") ? T.success : T.danger, fontSize: "12px", marginLeft: "8px" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

// --- Step Row Component ---

interface StepRowProps {
  step: VariableStep;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  readOnly: boolean;
  isBidirectional: boolean;
  allVariables: VariableDefinition[];
  currentVarId: string;
  definitions: GameDefinitions | null;
  onChange: (patch: Partial<VariableStep>) => void;
  onRemove: () => void;
  onMove: (from: number, to: number) => void;
}

function StepRow({
  step,
  index,
  isFirst,
  readOnly,
  isBidirectional,
  allVariables,
  currentVarId,
  definitions,
  onChange,
  onRemove,
  onMove,
}: StepRowProps) {
  const [dragOver, setDragOver] = useState(false);

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 6px",
    backgroundColor: dragOver ? T.bg2 : T.bg1,
    borderRadius: "3px",
    border: dragOver ? `1px solid ${T.accentDim}` : `1px solid ${T.borderDim}`,
    transition: "background-color 0.1s, border-color 0.1s",
  };

  const smallBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    color: T.textDim,
    cursor: readOnly ? "default" : "pointer",
    fontSize: "12px",
    padding: "2px 4px",
    lineHeight: 1,
  };

  // Available variables for dropdown (exclude self, single vars can't reference bidirectional)
  const varOptions = allVariables.filter((v) => {
    if (v.id === currentVarId) return false;
    // Single-direction variables cannot reference bidirectional ones
    if (!isBidirectional && v.isBidirectional) return false;
    return true;
  });

  return (
    <div
      style={rowStyle}
      draggable={!readOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (!isNaN(fromIdx) && fromIdx !== index) {
          onMove(fromIdx, index);
        }
      }}
    >
      {/* Drag handle */}
      {!readOnly && (
        <span
          style={{ cursor: "grab", color: T.textDim, fontSize: "14px", userSelect: "none", padding: "0 2px" }}
          title={t("ui.dragSort")}
        >
          {"\u2807"}
        </span>
      )}

      {/* Step number */}
      <span style={{ color: T.textDim, fontSize: "11px", minWidth: "18px", textAlign: "center" }}>{index + 1}</span>

      {/* Operator */}
      {isFirst ? (
        <span style={{ color: T.textSub, fontSize: "11px", minWidth: "60px", textAlign: "center" }}>{t("var.initialValue")}</span>
      ) : (
        <select
          style={{ ...selectStyle, minWidth: "60px" }}
          value={step.op ?? ArithOp.ADD}
          onChange={(e) => onChange({ op: e.target.value as VariableStep["op"] })}
          disabled={readOnly}
        >
          {OP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {/* Type */}
      <select
        style={{ ...selectStyle, minWidth: "80px" }}
        value={step.type}
        onChange={(e) => {
          const newType = e.target.value as VariableStep["type"];
          // Reset type-specific fields
          const patch: Partial<VariableStep> = { type: newType };
          if (newType === VarStepType.CONSTANT) {
            patch.value = 0;
            patch.key = undefined;
            patch.varId = undefined;
            patch.traitGroup = undefined;
            patch.traitId = undefined;
          } else if (newType === VarStepType.VARIABLE) {
            patch.varId = "";
            patch.key = undefined;
            patch.value = undefined;
          } else if (newType === VarStepType.HAS_TRAIT) {
            patch.traitGroup = "";
            patch.traitId = "";
            patch.key = undefined;
            patch.value = undefined;
          } else if (newType === VarStepType.TRAIT_COUNT) {
            patch.traitGroup = "";
            patch.key = undefined;
            patch.value = undefined;
          } else {
            patch.key = "";
            patch.value = undefined;
            patch.varId = undefined;
            patch.traitGroup = undefined;
            patch.traitId = undefined;
          }
          onChange(patch);
        }}
        disabled={readOnly}
      >
        {TYPE_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Source (self/target) — only for bidirectional variables, not for constant/variable */}
      {isBidirectional && ![VarStepType.CONSTANT, VarStepType.VARIABLE].includes(step.type) && (
        <select
          style={{ ...selectStyle, minWidth: "60px" }}
          value={step.source ?? "self"}
          onChange={(e) => onChange({ source: e.target.value as "self" | "target" })}
          disabled={readOnly}
        >
          <option value="self">{t("target.self")}</option>
          <option value="target">{t("target.target")}</option>
        </select>
      )}

      {/* Type-specific fields */}
      <div style={{ flex: 1, display: "flex", gap: "4px", alignItems: "center" }}>
        {step.type === VarStepType.CONSTANT && (
          <input
            type="number"
            style={{ ...inputStyle, flex: 1 }}
            value={step.value ?? 0}
            onChange={(e) => onChange({ value: parseFloat(e.target.value) || 0 })}
            disabled={readOnly}
          />
        )}

        {step.type === VarStepType.ABILITY && (
          <select
            style={{ ...selectStyle, flex: 1 }}
            value={step.key ?? ""}
            onChange={(e) => onChange({ key: e.target.value })}
            disabled={readOnly}
          >
            <option value="">{t("opt.selectAbility")}</option>
            {(definitions?.template.abilities ?? []).map((a) => (
              <option key={a.key} value={a.key}>
                {a.label} ({a.key})
              </option>
            ))}
          </select>
        )}

        {step.type === VarStepType.BASIC_INFO && (
          <select
            style={{ ...selectStyle, flex: 1 }}
            value={step.key ?? ""}
            onChange={(e) => onChange({ key: e.target.value })}
            disabled={readOnly}
          >
            <option value="">{t("opt.selectField")}</option>
            {(definitions?.template.basicInfo ?? [])
              .filter((f) => f.type === "number")
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.key})
                </option>
              ))}
          </select>
        )}

        {step.type === VarStepType.RESOURCE && (
          <>
            <select
              style={{ ...selectStyle, flex: 1 }}
              value={step.key ?? ""}
              onChange={(e) => onChange({ key: e.target.value })}
              disabled={readOnly}
            >
              <option value="">{t("opt.selectResource")}</option>
              {(definitions?.template.resources ?? []).map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label} ({r.key})
                </option>
              ))}
            </select>
            <select
              style={{ ...selectStyle, minWidth: "60px" }}
              value={step.field ?? "value"}
              onChange={(e) => onChange({ field: e.target.value as "value" | "max" })}
              disabled={readOnly}
            >
              <option value="value">{t("opt.currentValue")}</option>
              <option value="max">{t("opt.maxValue")}</option>
            </select>
          </>
        )}

        {step.type === VarStepType.TRAIT_COUNT && (
          <select
            style={{ ...selectStyle, flex: 1 }}
            value={step.traitGroup ?? ""}
            onChange={(e) => onChange({ traitGroup: e.target.value })}
            disabled={readOnly}
          >
            <option value="">{t("opt.selectTraitCat")}</option>
            {(definitions?.template.traits ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} ({t.key})
              </option>
            ))}
          </select>
        )}

        {step.type === VarStepType.HAS_TRAIT &&
          (() => {
            const templateTraits = definitions?.template.traits ?? [];
            const traitDefs = definitions?.traitDefs ?? {};
            // Filter trait defs by selected category
            const traitsInCategory = step.traitGroup
              ? Object.values(traitDefs).filter((d) => d.category === step.traitGroup)
              : [];
            return (
              <>
                <select
                  style={{ ...selectStyle, flex: 1 }}
                  value={step.traitGroup ?? ""}
                  onChange={(e) => onChange({ traitGroup: e.target.value, traitId: "" })}
                  disabled={readOnly}
                >
                  <option value="">{t("opt.selectCategory")}</option>
                  {templateTraits.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label} ({t.key})
                    </option>
                  ))}
                </select>
                <select
                  style={{ ...selectStyle, flex: 1 }}
                  value={step.traitId ?? ""}
                  onChange={(e) => onChange({ traitId: e.target.value })}
                  disabled={readOnly}
                >
                  <option value="">{t("opt.selectTrait")}</option>
                  {traitsInCategory.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id})
                    </option>
                  ))}
                </select>
                <span style={{ color: T.textSub, fontSize: "11px", whiteSpace: "nowrap" }} title={t("ph.hasTraitNote")}>
                  1/0
                </span>
              </>
            );
          })()}

        {step.type === VarStepType.EXPERIENCE && (
          <select
            style={{ ...selectStyle, flex: 1 }}
            value={step.key ?? ""}
            onChange={(e) => onChange({ key: e.target.value })}
            disabled={readOnly}
          >
            <option value="">{t("opt.selectExp")}</option>
            {(definitions?.template.experiences ?? []).map((ex) => (
              <option key={ex.key} value={ex.key}>
                {ex.label} ({ex.key})
              </option>
            ))}
          </select>
        )}

        {step.type === VarStepType.ITEM_COUNT && (
          <select
            style={{ ...selectStyle, flex: 1 }}
            value={step.key ?? ""}
            onChange={(e) => onChange({ key: e.target.value })}
            disabled={readOnly}
          >
            <option value="">{t("opt.selectItem")}</option>
            {Object.entries(definitions?.itemDefs ?? {}).map(([id, def]) => (
              <option key={id} value={id}>
                {(def as any).name} ({id})
              </option>
            ))}
          </select>
        )}

        {step.type === VarStepType.FAVORABILITY && (
          <span style={{ color: T.textSub, fontSize: "11px", whiteSpace: "nowrap" }}>
            {step.source === "target" ? t("target.targetToSelf") : t("target.selfToTarget")}
          </span>
        )}

        {step.type === VarStepType.VARIABLE && (
          <select
            style={{ ...selectStyle, flex: 1 }}
            value={step.varId ?? ""}
            onChange={(e) => onChange({ varId: e.target.value })}
            disabled={readOnly}
          >
            <option value="">{t("opt.selectVar")}</option>
            {varOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name || v.id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Label */}
      <input
        style={{ ...inputStyle, width: "80px" }}
        value={step.label ?? ""}
        onChange={(e) => onChange({ label: e.target.value })}
        disabled={readOnly}
        placeholder={t("ph.stepNote")}
        title={t("ph.stepNoteTitle")}
      />

      {/* Remove button */}
      {!readOnly && (
        <button
          onClick={onRemove}
          style={{
            ...smallBtn,
            color: T.danger,
            fontSize: "14px",
          }}
        >
          x
        </button>
      )}
    </div>
  );
}
