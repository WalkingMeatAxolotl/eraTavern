/**
 * ModifierListEditor — reusable modifier list for weight modifiers and value modifiers.
 *
 * Extracted from ActionEditor.tsx. Reads shared definition lists from EditorContext.
 */
import type { ValueModifier } from "../../types/game";
import T from "../../theme";
import { useEditorContext } from "../shared/EditorContext";
import {
  inputStyle,
  addBtnStyle,
  delBtnStyle,
  listRowStyle,
  SLOT_LABELS,
} from "../shared/ConditionEditor";

export function ModifierListEditor({
  modifiers,
  onChange,
  disabled,
  label,
}: {
  modifiers: ValueModifier[];
  onChange: (mods: ValueModifier[]) => void;
  disabled: boolean;
  label: string;
}) {
  const {
    targetType,
    resourceKeys,
    basicInfoNumKeys,
    abilityKeys,
    experienceKeys,
    traitCategories,
    traitList,
    itemList,
    outfitTypes,
    clothingSlots,
    variableList,
    biVarList,
    worldVarList,
  } = useEditorContext();

  const add = () => onChange([...modifiers, { type: "ability", key: abilityKeys[0]?.key ?? "", per: 1000, bonus: 5 }]);
  const remove = (idx: number) => onChange(modifiers.filter((_, i) => i !== idx));
  const update = (idx: number, mod: ValueModifier) => {
    const next = [...modifiers];
    next[idx] = mod;
    onChange(next);
  };

  return (
    <div style={{ marginBottom: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: T.textSub, fontSize: "11px" }}>{label}</span>
        {!disabled && (
          <button className="ae-add-btn" onClick={add} style={addBtnStyle}>
            [+]
          </button>
        )}
      </div>
      {modifiers.map((mod, idx) => (
        <div
          key={idx}
          style={{
            ...listRowStyle(idx, idx === modifiers.length - 1),
            display: "flex",
            gap: "4px",
            alignItems: "center",
            marginTop: "2px",
            flexWrap: "wrap",
          }}
        >
          <select
            style={{ ...inputStyle, width: "80px" }}
            value={mod.type}
            onChange={(e) => {
              const t = e.target.value as ValueModifier["type"];
              const base = { bonus: mod.bonus, bonusMode: mod.bonusMode, modTarget: mod.modTarget };
              if (t === "resource") update(idx, { type: t, key: resourceKeys[0]?.key ?? "", per: 100, ...base });
              else if (t === "basicInfo")
                update(idx, { type: t, key: basicInfoNumKeys[0]?.key ?? "", per: 100, ...base });
              else if (t === "ability") update(idx, { type: t, key: abilityKeys[0]?.key ?? "", per: 1000, ...base });
              else if (t === "experience") update(idx, { type: t, key: experienceKeys[0]?.key ?? "", per: 1, ...base });
              else if (t === "trait") update(idx, { type: t, key: traitCategories[0]?.key ?? "", value: "", ...base });
              else if (t === "hasItem") update(idx, { type: t, itemId: itemList[0]?.id ?? "", ...base });
              else if (t === "outfit") update(idx, { type: t, outfitId: outfitTypes[0]?.id ?? "default", ...base });
              else if (t === "clothing") update(idx, { type: t, slot: clothingSlots[0] ?? "", ...base });
              else if (t === "variable") update(idx, { type: t, varId: variableList[0]?.id ?? "", per: 1, ...base });
              else if (t === "worldVar") update(idx, { type: t, key: worldVarList[0]?.id ?? "", per: 1, ...base });
              else update(idx, { type: t, source: "target", per: 100, ...base });
            }}
            disabled={disabled}
          >
            <option disabled style={{ fontWeight: "bold" }}>
              ── 数值 ──
            </option>
            <option value="resource">资源</option>
            <option value="basicInfo">基本属性</option>
            <option value="ability">能力</option>
            <option value="experience">经验</option>
            {targetType === "npc" && <option value="favorability">好感度</option>}
            <option value="variable">派生变量</option>
            <option disabled style={{ fontWeight: "bold" }}>
              ── 状态 ──
            </option>
            <option value="trait">特质</option>
            <option value="hasItem">持有物品</option>
            <option value="outfit">服装预设</option>
            <option value="clothing">服装状态</option>
            <option disabled style={{ fontWeight: "bold" }}>
              ── 全局 ──
            </option>
            <option value="worldVar">世界变量</option>
          </select>

          {!["favorability", "worldVar"].includes(mod.type) &&
            !(mod.type === "variable" && (biVarList ?? []).some((v) => v.id === mod.varId)) && (
              <select
                style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
                value={mod.modTarget ?? "self"}
                onChange={(e) => update(idx, { ...mod, modTarget: e.target.value })}
                disabled={disabled || targetType !== "npc"}
              >
                <option value="self">执行者</option>
                {targetType === "npc" && <option value="target">目标角色</option>}
              </select>
            )}

          {mod.type === "resource" && (
            <>
              <select
                style={inputStyle}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {resourceKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span style={{ color: T.textSub, fontSize: "11px" }}>每</span>
              <input
                type="number"
                style={{ ...inputStyle, width: "55px" }}
                value={mod.per ?? 100}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === "basicInfo" && (
            <>
              <select
                style={inputStyle}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {basicInfoNumKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span style={{ color: T.textSub, fontSize: "11px" }}>每</span>
              <input
                type="number"
                style={{ ...inputStyle, width: "55px" }}
                value={mod.per ?? 100}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === "ability" && (
            <>
              <select
                style={inputStyle}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {abilityKeys.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <span style={{ color: T.textSub, fontSize: "11px" }}>每</span>
              <input
                type="number"
                style={{ ...inputStyle, width: "55px" }}
                value={mod.per ?? 1000}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === "experience" && (
            <>
              <select
                style={inputStyle}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {experienceKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span style={{ color: T.textSub, fontSize: "11px" }}>每</span>
              <input
                type="number"
                style={{ ...inputStyle, width: "55px" }}
                value={mod.per ?? 1}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === "trait" && (
            <>
              <select
                style={inputStyle}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {traitCategories
                  .filter((c) => c.key !== "ability" && c.key !== "experience")
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
              </select>
              <select
                style={inputStyle}
                value={mod.value ?? ""}
                onChange={(e) => update(idx, { ...mod, value: e.target.value })}
                disabled={disabled}
              >
                <option value="">任意值</option>
                {traitList
                  .filter((t) => t.category === mod.key)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </>
          )}

          {mod.type === "hasItem" && (
            <select
              style={inputStyle}
              value={mod.itemId ?? ""}
              onChange={(e) => update(idx, { ...mod, itemId: e.target.value })}
              disabled={disabled}
            >
              <option value="">选择物品</option>
              {itemList.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          )}

          {mod.type === "outfit" && (
            <select
              style={inputStyle}
              value={mod.outfitId ?? ""}
              onChange={(e) => update(idx, { ...mod, outfitId: e.target.value })}
              disabled={disabled}
            >
              {outfitTypes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          {mod.type === "clothing" && (
            <select
              style={inputStyle}
              value={mod.slot ?? ""}
              onChange={(e) => update(idx, { ...mod, slot: e.target.value })}
              disabled={disabled}
            >
              <option value="">选择槽位</option>
              {clothingSlots.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          )}

          {mod.type === "favorability" && (
            <>
              <select
                style={inputStyle}
                value={mod.source ?? "target"}
                onChange={(e) => update(idx, { ...mod, source: e.target.value })}
                disabled={disabled}
              >
                <option value="target">目标角色→执行者</option>
                <option value="self">执行者→目标角色</option>
              </select>
              <span style={{ color: T.textSub, fontSize: "11px" }}>每</span>
              <input
                type="number"
                style={{ ...inputStyle, width: "55px" }}
                value={mod.per ?? 100}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === "variable" &&
            (() => {
              const isBiVar = (biVarList ?? []).some((v) => v.id === mod.varId);
              return (
                <>
                  {isBiVar && targetType === "npc" && (
                    <select
                      style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
                      value={mod.modTarget ?? "self"}
                      onChange={(e) => update(idx, { ...mod, modTarget: e.target.value })}
                      disabled={disabled}
                    >
                      <option value="self">执行者→目标角色</option>
                      <option value="target">目标角色→执行者</option>
                    </select>
                  )}
                  <select
                    style={inputStyle}
                    value={mod.varId ?? ""}
                    onChange={(e) => update(idx, { ...mod, varId: e.target.value })}
                    disabled={disabled}
                  >
                    <option value="">选择变量</option>
                    {variableList.length > 0 && <option disabled>── 单向 ──</option>}
                    {variableList.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                    {targetType === "npc" && (biVarList ?? []).length > 0 && <option disabled>── 双向 ──</option>}
                    {targetType === "npc" &&
                      (biVarList ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                  <span style={{ color: T.textSub, fontSize: "11px" }}>每</span>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "55px" }}
                    value={mod.per ?? 1}
                    onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                    min={1}
                    disabled={disabled}
                  />
                </>
              );
            })()}

          {mod.type === "worldVar" && (
            <>
              <select
                style={inputStyle}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                <option value="">选择世界变量</option>
                {worldVarList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <span style={{ color: T.textSub, fontSize: "11px" }}>每</span>
              <input
                type="number"
                style={{ ...inputStyle, width: "55px" }}
                value={mod.per ?? 1}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          <select
            style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
            value={mod.bonusMode ?? "add"}
            onChange={(e) => update(idx, { ...mod, bonusMode: e.target.value as "add" | "multiply" })}
            disabled={disabled}
          >
            <option value="add">+</option>
            <option value="multiply">x%</option>
          </select>
          <input
            type="number"
            style={{ ...inputStyle, width: "60px" }}
            value={mod.bonus}
            onChange={(e) => update(idx, { ...mod, bonus: Number(e.target.value) })}
            disabled={disabled}
          />
          {!disabled && (
            <button className="ae-del-btn" onClick={() => remove(idx)} style={delBtnStyle}>
              x
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
