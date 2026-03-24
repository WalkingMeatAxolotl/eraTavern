import { useState, useCallback } from "react";
import clsx from "clsx";
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
import { VarStepType, ArithOp } from "../../constants";
import { btnClass } from "../shared/buttons";
import CloneButton from "../shared/CloneDialog";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { toLocalId } from "../shared/idUtils";
import sh from "../shared/shared.module.css";
import s from "./VariableEditor.module.css";

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
    const step = steps[i];
    const val = stepValueLabel(step, bidirectional);
    const op = step.op ?? "";

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

function stepValueLabel(step: VariableStep, bidirectional?: boolean): string {
  const src = bidirectional ? (step.source === "target" ? "T:" : "S:") : "";
  switch (step.type) {
    case VarStepType.ABILITY:
      return `${src}${step.key ?? "?"}`;
    case VarStepType.RESOURCE:
      return `${src}${step.key ?? "?"}${step.field === "max" ? ".max" : ""}`;
    case VarStepType.BASIC_INFO:
      return `${src}${step.key ?? "?"}`;
    case VarStepType.TRAIT_COUNT:
      return `${src}count(${step.traitGroup ?? "?"})`;
    case VarStepType.HAS_TRAIT:
      return `${src}has(${step.traitId ?? "?"})`;
    case VarStepType.EXPERIENCE:
      return `${src}exp(${step.key ?? "?"})`;
    case VarStepType.ITEM_COUNT:
      return `${src}item(${step.key ?? "?"})`;
    case VarStepType.FAVORABILITY:
      return bidirectional && step.source === "target" ? "fav(T→S)" : "fav(S→T)";
    case VarStepType.CONSTANT:
      return String(step.value ?? 0);
    case VarStepType.VARIABLE:
      return `$${step.varId ?? "?"}`;
    default:
      return "?";
  }
}

export default function VariableEditor({ variable, isNew, allTags, allVariables, definitions, onBack, addonIds }: Props) {
  const addonPrefix = variable.source || "";
  const [id, setId] = useState(isNew ? "" : toLocalId(variable.id));
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
      const fullId = addonPrefix ? `${addonPrefix}.${id.trim()}` : id.trim();
      const data = {
        id: fullId,
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
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));
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
      return next.map((step, i) => {
        if (i === 0) {
          const { op: _, ...rest } = step;
          return rest;
        }
        return step.op ? step : { ...step, op: ArithOp.ADD as const };
      });
    });
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header}>
        <span className={sh.editorTitle}>
          == {isNew ? t("editor.newVar") : t("editor.editNamed", { name: variable.name || variable.id })} ==
        </span>
        <button onClick={onBack} className={btnClass("neutral")}>
          [{t("btn.back")}]
        </button>
      </div>

      {/* Basic fields */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-blue)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>基础信息</span>
        </div>
        <div className={s.sectionContent}>
          <div className={s.fieldRow}>
            <div style={{ flex: 1 }}>
              <div className={sh.label}>ID</div>
              <PrefixedIdInput
                prefix={addonPrefix}
                value={id}
                onChange={setId}
                disabled={!isNew || isReadOnly}
              />
            </div>
            <div style={{ flex: 2 }}>
              <div className={sh.label}>{t("field.name")}</div>
              <input
                className={sh.input}
                style={{ width: "100%", boxSizing: "border-box" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isReadOnly}
                placeholder={t("ph.displayName")}
              />
            </div>
          </div>

          <div className={s.fieldBlock}>
            <div className={sh.label}>{t("field.description")}</div>
            <textarea
              className={sh.input}
              style={{ width: "100%", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isReadOnly}
              placeholder={t("ph.optionalDesc")}
            />
          </div>

          {/* Bidirectional */}
          <div className={s.fieldBlock}>
            <label className={s.checkLabel}>
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
          <div className={s.fieldBlock}>
            <div className={sh.label}>{t("field.tags")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => !isReadOnly && toggleTag(tag)}
                  className={clsx(
                    tags.includes(tag) ? s.tagBtnActive : s.tagBtnInactive,
                    isReadOnly && s.tagBtnReadonly,
                  )}
                >
                  {tag}
                </button>
              ))}
              {allTags.length === 0 && <span className={sh.textDim}>{t("empty.noAvailTags")}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Formula preview */}
      <div className={s.formulaBox}>
        <div className={s.formulaLabel}>{t("section.formulaPreview")}</div>
        <div className={s.formulaText}>
          {formulaPreview(steps, isBidirectional)}
        </div>
      </div>

      {/* Steps editor */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-orange)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("section.computeSteps")}</span>
        </div>
        <div className={s.sectionContent}>
          <div className={s.stepsColumn}>
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
              className={clsx(btnClass("create"), s.addStepBtn)}
            >
              [{t("btn.addStep")}]
            </button>
          )}
        </div>
      </div>

      {/* Test panel */}
      <div className={s.testPanel}>
        <button
          onClick={() => {
            const next = !testOpen;
            setTestOpen(next);
            if (next && testCharacters.length === 0) loadTestCharacters();
          }}
          className={testOpen ? s.testToggleOpen : s.testToggle}
        >
          {testOpen ? "\u25BC" : "\u25B6"} {t("ui.testCompute")}
        </button>
        {testOpen && (
          <div className={s.testContent}>
            <div className={s.testRow}>
              <span className={sh.textSub}>{t("target.self")}:</span>
              <select
                className={clsx(s.selectInput, sh.flex1)}
                style={{ minWidth: "120px" }}
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
                  <span className={sh.textSub}>{t("target.target")}:</span>
                  <select
                    className={clsx(s.selectInput, sh.flex1)}
                    style={{ minWidth: "120px" }}
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
                className={btnClass("primary", "md")}
                disabled={!testCharId || isNew}
              >
                [{t("btn.compute")}]
              </button>
            </div>

            {testError && <div className={sh.errorText} style={{ marginBottom: "6px" }}>{testError}</div>}

            {testResult && (
              <div>
                <div className={s.testStepList}>
                  {testResult.steps.map((step) => (
                    <div key={step.index} className={s.testStepRow}>
                      <span style={{ color: T.textSub }}>
                        {step.index === 0 ? t("var.initial") : opSymbol(step.op)} <span style={{ color: T.textSub }}>{step.type}</span>
                        {step.label && <span style={{ color: T.textDim }}> ({step.label})</span>} ={" "}
                        <span style={{ color: T.text }}>{step.stepValue}</span>
                      </span>
                      <span style={{ color: T.accent }}>
                        {"\u2192"} {step.accumulated}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={s.testResult}>
                  {t("var.result")}: {testResult.result}
                </div>
              </div>
            )}

            {isNew && (
              <div className={sh.textSub} style={{ marginTop: "4px" }}>{t("msg.saveFirstTestNote")}</div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className={s.actionBar}>
        {!isReadOnly && (
          <button onClick={handleSave} disabled={saving} className={btnClass("create")}>
            [{saving ? t("status.submitting") : t("btn.confirm")}]
          </button>
        )}
        {!isReadOnly && !isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={variable.source || ""}
            entityType="variables"
            sourceId={variable.id}
            onSuccess={onBack}
            className={btnClass("neutral")}
          />
        )}
        {!isReadOnly && !isNew && (
          <button onClick={handleDelete} className={btnClass("danger")}>
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={onBack} className={btnClass("neutral")}>
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

  // Available variables for dropdown (exclude self, single vars can't reference bidirectional)
  const varOptions = allVariables.filter((v) => {
    if (v.id === currentVarId) return false;
    // Single-direction variables cannot reference bidirectional ones
    if (!isBidirectional && v.isBidirectional) return false;
    return true;
  });

  return (
    <div
      className={clsx(s.stepRow, dragOver && s.stepRowDragOver)}
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
        <span className={s.dragHandle} title={t("ui.dragSort")}>
          {"\u2807"}
        </span>
      )}

      {/* Step number */}
      <span className={s.stepNum}>{index + 1}</span>

      {/* Operator */}
      {isFirst ? (
        <span className={s.stepInitLabel}>{t("var.initialValue")}</span>
      ) : (
        <select
          className={clsx(s.selectInput, sh.w60)}
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
        className={clsx(s.selectInput, sh.w80)}
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
        {TYPE_OPTIONS.map((typeOpt) => (
          <option key={typeOpt.value} value={typeOpt.value}>
            {typeOpt.label}
          </option>
        ))}
      </select>

      {/* Source (self/target) — only for bidirectional variables, not for constant/variable */}
      {isBidirectional && ![VarStepType.CONSTANT, VarStepType.VARIABLE].includes(step.type) && (
        <select
          className={clsx(s.selectInput, sh.w60)}
          value={step.source ?? "self"}
          onChange={(e) => onChange({ source: e.target.value as "self" | "target" })}
          disabled={readOnly}
        >
          <option value="self">{t("target.self")}</option>
          <option value="target">{t("target.target")}</option>
        </select>
      )}

      {/* Type-specific fields */}
      <div className={s.stepFields}>
        {step.type === VarStepType.CONSTANT && (
          <input
            type="number"
            className={clsx(sh.input, sh.flex1)}
            value={step.value ?? 0}
            onChange={(e) => onChange({ value: parseFloat(e.target.value) || 0 })}
            disabled={readOnly}
          />
        )}

        {step.type === VarStepType.ABILITY && (
          <select
            className={clsx(s.selectInput, sh.flex1)}
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
            className={clsx(s.selectInput, sh.flex1)}
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
              className={clsx(s.selectInput, sh.flex1)}
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
              className={clsx(s.selectInput, sh.w60)}
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
            className={clsx(s.selectInput, sh.flex1)}
            value={step.traitGroup ?? ""}
            onChange={(e) => onChange({ traitGroup: e.target.value })}
            disabled={readOnly}
          >
            <option value="">{t("opt.selectTraitCat")}</option>
            {(definitions?.template.traits ?? []).map((tr) => (
              <option key={tr.key} value={tr.key}>
                {tr.label} ({tr.key})
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
                  className={clsx(s.selectInput, sh.flex1)}
                  value={step.traitGroup ?? ""}
                  onChange={(e) => onChange({ traitGroup: e.target.value, traitId: "" })}
                  disabled={readOnly}
                >
                  <option value="">{t("opt.selectCategory")}</option>
                  {templateTraits.map((tr) => (
                    <option key={tr.key} value={tr.key}>
                      {tr.label} ({tr.key})
                    </option>
                  ))}
                </select>
                <select
                  className={clsx(s.selectInput, sh.flex1)}
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
                <span className={s.hintText} title={t("ph.hasTraitNote")}>
                  1/0
                </span>
              </>
            );
          })()}

        {step.type === VarStepType.EXPERIENCE && (
          <select
            className={clsx(s.selectInput, sh.flex1)}
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
            className={clsx(s.selectInput, sh.flex1)}
            value={step.key ?? ""}
            onChange={(e) => onChange({ key: e.target.value })}
            disabled={readOnly}
          >
            <option value="">{t("opt.selectItem")}</option>
            {Object.entries(definitions?.itemDefs ?? {}).map(([itemId, def]) => (
              <option key={itemId} value={itemId}>
                {(def as any).name} ({itemId})
              </option>
            ))}
          </select>
        )}

        {step.type === VarStepType.FAVORABILITY && (
          <span className={s.hintText}>
            {step.source === "target" ? t("target.targetToSelf") : t("target.selfToTarget")}
          </span>
        )}

        {step.type === VarStepType.VARIABLE && (
          <select
            className={clsx(s.selectInput, sh.flex1)}
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
        className={s.labelInput}
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
          className={s.removeBtn}
        >
          x
        </button>
      )}
    </div>
  );
}
