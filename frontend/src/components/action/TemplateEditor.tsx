/**
 * Template editors — output template list, conditions, and variable help panel.
 *
 * Extracted from ActionEditor.tsx.
 */
import type { OutputTemplateEntry, ConditionItem } from "../../types/game";
import T from "../../theme";
import { useEditorContext } from "../shared/EditorContext";
import { ConditionItemEditor } from "../shared/ConditionEditor";
import { inputStyle, addBtnStyle, delBtnStyle, listRowStyle } from "../shared/styles";
import { t } from "../../i18n/ui";

export function TemplateListEditor({
  templates,
  onChange,
  disabled,
}: {
  templates: OutputTemplateEntry[];
  onChange: (tpls: OutputTemplateEntry[]) => void;
  disabled: boolean;
}) {
  const add = () => onChange([...templates, { text: "" }]);
  const remove = (idx: number) => onChange(templates.filter((_, i) => i !== idx));
  const update = (idx: number, entry: OutputTemplateEntry) => {
    const next = [...templates];
    next[idx] = entry;
    onChange(next);
  };

  // Single template: simple textarea (no conditions/weight UI needed)
  if (templates.length <= 1) {
    return (
      <div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
          {!disabled && templates.length === 0 && (
            <button className="ae-add-btn" onClick={add} style={addBtnStyle}>
              [{t("btn.addTemplate")}]
            </button>
          )}
          {templates.length === 1 && !disabled && (
            <button className="ae-add-btn" onClick={add} style={addBtnStyle}>
              [{t("btn.addBranch")}]
            </button>
          )}
        </div>
        {templates.length === 1 && (
          <div style={{ display: "flex", gap: "4px", alignItems: "flex-start" }}>
            <textarea
              style={{ ...inputStyle, flex: 1, boxSizing: "border-box", minHeight: "32px", resize: "vertical" }}
              value={templates[0].text}
              onChange={(e) => update(0, { ...templates[0], text: e.target.value })}
              disabled={disabled}
              placeholder="{{player}} ..."
            />
            {!disabled && (
              <button className="ae-del-btn" onClick={() => remove(0)} style={delBtnStyle}>
                x
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Multiple templates: show conditions + weight for each
  return (
    <div>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
        {!disabled && (
          <button className="ae-add-btn" onClick={add} style={addBtnStyle}>
            [{t("btn.addBranch")}]
          </button>
        )}
        <span style={{ color: T.textDim, fontSize: "11px" }}>{t("tpl.randomHelp")}</span>
      </div>
      {templates.map((entry, idx) => (
        <div
          key={idx}
          style={{
            ...listRowStyle(idx, idx === templates.length - 1),
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            padding: "4px 6px",
          }}
        >
          <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
            <span style={{ color: "#6ec6ff", fontSize: "11px", fontWeight: "bold" }}>#{idx + 1}</span>
            <span style={{ color: T.textSub, fontSize: "11px" }}>{t("label.weight")}</span>
            <input
              type="number"
              min={0}
              style={{ ...inputStyle, width: "50px" }}
              value={entry.weight ?? 1}
              onChange={(e) => update(idx, { ...entry, weight: Math.max(0, Number(e.target.value)) })}
              disabled={disabled}
            />
            {!disabled && (
              <button className="ae-del-btn" onClick={() => remove(idx)} style={{ ...delBtnStyle, marginLeft: "auto" }}>
                x
              </button>
            )}
          </div>
          <textarea
            style={{
              ...inputStyle,
              width: "100%",
              boxSizing: "border-box",
              minHeight: "32px",
              resize: "vertical",
              marginBottom: "2px",
            }}
            value={entry.text}
            onChange={(e) => update(idx, { ...entry, text: e.target.value })}
            disabled={disabled}
            placeholder="{{player}} ..."
          />
          {/* Conditions */}
          <TemplateConditionsEditor
            conditions={entry.conditions ?? []}
            onChange={(conds) => update(idx, { ...entry, conditions: conds.length > 0 ? conds : undefined })}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

export function TemplateConditionsEditor({
  conditions,
  onChange,
  disabled,
}: {
  conditions: ConditionItem[];
  onChange: (conds: ConditionItem[]) => void;
  disabled: boolean;
}) {
  const addCond = () => onChange([...conditions, { type: "location" }]);
  const removeCond = (idx: number) => {
    const next = conditions.filter((_, i) => i !== idx);
    onChange(next);
  };
  const updateCond = (idx: number, item: ConditionItem) => {
    const next = [...conditions];
    next[idx] = item;
    onChange(next);
  };

  return (
    <div
      style={{
        paddingLeft: "8px",
        borderLeft: "2px solid #333",
        marginTop: "2px",
      }}
    >
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
        <span style={{ color: T.textSub, fontSize: "11px" }}>{t("outcome.condLabel")}</span>
        {!disabled && (
          <button className="ae-add-btn" onClick={addCond} style={addBtnStyle}>
            [+]
          </button>
        )}
        {conditions.length === 0 && <span style={{ color: T.textDim, fontSize: "11px" }}>{t("empty.noCondSelect")}</span>}
      </div>
      {conditions.map((item, idx) => (
        <div key={idx} style={{ marginBottom: "2px" }}>
          <ConditionItemEditor
            item={item}
            onChange={(newItem) => updateCond(idx, newItem)}
            onRemove={() => removeCond(idx)}
            disabled={disabled}
            depth={0}
          />
        </div>
      ))}
    </div>
  );
}

export function TemplateVarHelp() {
  const { resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, clothingSlots } = useEditorContext();

  const s: React.CSSProperties = { color: "#0ff", fontSize: "11px" };
  const d: React.CSSProperties = { color: T.textSub, fontSize: "11px" };
  const row = (v: string, desc: string) => (
    <div key={v} style={{ display: "flex", gap: "8px", marginBottom: "1px" }}>
      <span style={{ ...s, minWidth: "220px" }}>{`{{${v}}}`}</span>
      <span style={d}>{desc}</span>
    </div>
  );

  return (
    <div
      style={{
        marginTop: "6px",
        padding: "8px",
        backgroundColor: T.bg3,
        border: `1px solid ${T.border}`,
        borderRadius: "3px",
        maxHeight: "300px",
        overflowY: "auto",
      }}
    >
      <div style={{ color: T.accent, fontSize: "11px", fontWeight: "bold", marginBottom: "4px" }}>
        {t("tpl.varHelp")}
      </div>
      {row("player", t("tpl.var.player"))}
      {row("target", t("tpl.var.target"))}
      {row("outcome", t("tpl.var.outcome"))}
      {row("outcomeGrade", t("tpl.var.outcomeGrade"))}
      {row("effects", t("tpl.var.effects"))}
      {row("time", t("tpl.var.time"))}
      {row("weather", t("tpl.var.weather"))}
      {row("location", t("tpl.var.location"))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        {t("tpl.cat.resource")}
      </div>
      {resourceKeys.map((r) => row(`self.resource.${r.key}`, r.label))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        {t("tpl.cat.ability")}
      </div>
      {abilityKeys.map((a) => row(`self.ability.${a.key}`, t("tpl.abilityLevel", { label: a.label })))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        {t("tpl.cat.basicInfo")}
      </div>
      {basicInfoNumKeys.map((b) => row(`self.basicInfo.${b.key}`, b.label))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        {t("tpl.cat.clothing")}
      </div>
      {clothingSlots.map((sl) => row(`self.clothing.${sl}`, t("tpl.slotClothing", { slot: sl })))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        {t("tpl.cat.trait")}
      </div>
      {traitCategories.map((tc) => row(`self.trait.${tc.key}`, t("tpl.traitValue", { label: tc.label })))}
    </div>
  );
}
