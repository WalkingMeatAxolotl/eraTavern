/**
 * EffectEditor — single effect row editor.
 *
 * Extracted from ActionEditor.tsx. Reads shared definition lists from EditorContext.
 */
import type { ActionEffect } from "../../types/game";
import T from "../../theme";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { EffType, EF, EffectOp, ClothingState } from "../../constants";
import { useEditorContext } from "../shared/EditorContext";
import { inputStyle } from "../shared/styles";

const EFFECT_TYPES: { value: ActionEffect["type"]; label: string }[] = [
  { value: EffType.RESOURCE, label: t("eff.resource") },
  { value: EffType.ABILITY, label: t("eff.ability") },
  { value: EffType.EXPERIENCE, label: t("eff.experience") },
  { value: EffType.BASIC_INFO, label: t("eff.basicInfo") },
  { value: EffType.FAVORABILITY, label: t("eff.favorability") },
  { value: EffType.TRAIT, label: t("eff.trait") },
  { value: EffType.ITEM, label: t("eff.item") },
  { value: EffType.CLOTHING, label: t("eff.clothing") },
  { value: EffType.POSITION, label: t("eff.position") },
  { value: EffType.WORLD_VAR, label: t("eff.worldVar") },
  { value: EffType.OUTFIT, label: t("eff.outfit") },
];

export interface EffectEditorProps {
  effect: ActionEffect;
  onChange: (e: ActionEffect) => void;
  disabled: boolean;
}

export function EffectEditor({ effect, onChange, disabled }: EffectEditorProps) {
  const {
    resourceKeys,
    abilityKeys,
    experienceKeys,
    basicInfoNumKeys,
    traitCategories,
    clothingSlots,
    clothingList,
    outfitTypes,
    mapList,
    traitList,
    itemList,
    variableList,
    worldVarList,
  } = useEditorContext();

  const update = (patch: Partial<ActionEffect>) => onChange({ ...effect, ...patch });

  return (
    <>
      <select
        style={inputStyle}
        value={effect.type}
        onChange={(e) => onChange({ type: e.target.value as ActionEffect["type"], op: EffectOp.ADD })}
        disabled={disabled}
      >
        {EFFECT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {(effect.type === EF.RESOURCE || effect.type === EF.ABILITY || effect.type === EF.BASIC_INFO) &&
        (() => {
          const isVarMode = typeof effect.value === "object" && effect.value !== null;
          const varVal = isVarMode ? (effect.value as { varId: string; multiply?: number }) : null;
          return (
            <>
              <select
                style={inputStyle}
                value={effect.key ?? ""}
                onChange={(e) => update({ key: e.target.value })}
                disabled={disabled}
              >
                <option value="">{t("opt.select")}</option>
                {(effect.type === EF.RESOURCE
                  ? resourceKeys
                  : effect.type === EF.ABILITY
                    ? abilityKeys
                    : basicInfoNumKeys
                ).map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <select
                style={inputStyle}
                value={effect.op}
                onChange={(e) => update({ op: e.target.value })}
                disabled={disabled}
              >
                <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
                <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
              </select>
              <button
                type="button"
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  color: isVarMode ? T.danger : T.textSub,
                  minWidth: "28px",
                  textAlign: "center",
                }}
                onClick={() => {
                  if (isVarMode) {
                    update({ value: 0 });
                  } else {
                    update({ value: { varId: variableList[0]?.id ?? "", multiply: 1 } as any });
                  }
                }}
                disabled={disabled}
                title={t("eff.toggleVarRef")}
              >
                V
              </button>
              {isVarMode ? (
                <>
                  <select
                    style={inputStyle}
                    value={varVal?.varId ?? ""}
                    onChange={(e) => update({ value: { ...varVal!, varId: e.target.value } as any })}
                    disabled={disabled}
                  >
                    <option value="">{t("opt.selectVar")}</option>
                    {variableList.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <span style={{ color: T.textSub, fontSize: "11px" }}>×</span>
                  <input
                    type="number"
                    step="0.1"
                    style={{ ...inputStyle, width: "55px" }}
                    value={varVal?.multiply ?? 1}
                    onChange={(e) => update({ value: { ...varVal!, multiply: Number(e.target.value) } as any })}
                    disabled={disabled}
                  />
                </>
              ) : (
                <>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "70px" }}
                    value={(effect.value as number) ?? 0}
                    onChange={(e) => update({ value: Number(e.target.value) })}
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    style={{
                      ...inputStyle,
                      cursor: "pointer",
                      color: effect.valuePercent ? T.danger : T.textSub,
                      minWidth: "28px",
                      textAlign: "center",
                    }}
                    onClick={() => update({ valuePercent: !effect.valuePercent })}
                    disabled={disabled}
                  >
                    %
                  </button>
                </>
              )}
            </>
          );
        })()}

      {effect.type === EF.EXPERIENCE && (
        <>
          <select
            style={inputStyle}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            disabled={disabled}
          >
            <option value="">{t("opt.select")}</option>
            {experienceKeys.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <span style={{ color: T.textSub, fontSize: "11px" }}>+</span>
          <input
            type="number"
            style={{ ...inputStyle, width: "50px" }}
            value={effect.value ?? 1}
            onChange={(e) => update({ value: Number(e.target.value) })}
            disabled={disabled}
          />
        </>
      )}

      {effect.type === EF.FAVORABILITY && (
        <>
          <span style={{ color: T.textSub, fontSize: "11px" }}>{t("eff.favFrom")}</span>
          <select
            style={inputStyle}
            value={effect.favFrom ?? "{{targetId}}"}
            onChange={(e) => update({ favFrom: e.target.value })}
            disabled={disabled}
          >
            <option value="self">{t("target.self")}</option>
            <option value="{{targetId}}">{t("target.target")}</option>
            <option value="{{player}}">{t("target.player")}</option>
          </select>
          <span style={{ color: T.textSub, fontSize: "11px" }}>→</span>
          <span style={{ color: T.textSub, fontSize: "11px" }}>{t("eff.favTo")}</span>
          <select
            style={inputStyle}
            value={effect.favTo ?? "self"}
            onChange={(e) => update({ favTo: e.target.value })}
            disabled={disabled}
          >
            <option value="self">{t("target.self")}</option>
            <option value="{{targetId}}">{t("target.target")}</option>
            <option value="{{player}}">{t("target.player")}</option>
          </select>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
            <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
          </select>
          {(() => {
            const isVarMode = typeof effect.value === "object" && effect.value !== null;
            const varVal = isVarMode ? (effect.value as { varId: string; multiply?: number }) : null;
            return (
              <>
                <button
                  type="button"
                  style={{
                    ...inputStyle,
                    cursor: "pointer",
                    color: isVarMode ? T.danger : T.textSub,
                    minWidth: "28px",
                    textAlign: "center",
                  }}
                  onClick={() => {
                    if (isVarMode) update({ value: 0 });
                    else update({ value: { varId: variableList[0]?.id ?? "", multiply: 1 } as any });
                  }}
                  disabled={disabled}
                  title={t("eff.toggleVarRef")}
                >
                  V
                </button>
                {isVarMode ? (
                  <>
                    <select
                      style={inputStyle}
                      value={varVal?.varId ?? ""}
                      onChange={(e) => update({ value: { ...varVal!, varId: e.target.value } as any })}
                      disabled={disabled}
                    >
                      <option value="">{t("opt.selectVar")}</option>
                      {variableList.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <span style={{ color: T.textSub, fontSize: "11px" }}>×</span>
                    <input
                      type="number"
                      step="0.1"
                      style={{ ...inputStyle, width: "55px" }}
                      value={varVal?.multiply ?? 1}
                      onChange={(e) => update({ value: { ...varVal!, multiply: Number(e.target.value) } as any })}
                      disabled={disabled}
                    />
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      style={{ ...inputStyle, width: "70px" }}
                      value={(effect.value as number) ?? 0}
                      onChange={(e) => update({ value: Number(e.target.value) })}
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      style={{
                        ...inputStyle,
                        cursor: "pointer",
                        color: effect.valuePercent ? T.danger : T.textSub,
                        minWidth: "28px",
                        textAlign: "center",
                      }}
                      onClick={() => update({ valuePercent: !effect.valuePercent })}
                      disabled={disabled}
                    >
                      %
                    </button>
                  </>
                )}
              </>
            );
          })()}
        </>
      )}

      {effect.type === EF.TRAIT && (
        <>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value={EffectOp.ADD}>{t("effOp.add")}</option>
            <option value={EffectOp.REMOVE}>{t("effOp.remove")}</option>
          </select>
          <select
            style={inputStyle}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            disabled={disabled}
          >
            <option value="">{t("opt.category")}</option>
            {traitCategories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            style={inputStyle}
            value={effect.traitId ?? ""}
            onChange={(e) => update({ traitId: e.target.value })}
            disabled={disabled}
          >
            <option value="">{t("cond.trait")}</option>
            {traitList
              .filter((t) => !effect.key || t.category === effect.key)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </>
      )}

      {effect.type === EF.ITEM && (
        <>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value={EffectOp.ADD}>{t("effOp.add")}</option>
            <option value={EffectOp.REMOVE}>{t("effOp.remove")}</option>
          </select>
          <select
            style={inputStyle}
            value={effect.itemId ?? ""}
            onChange={(e) => update({ itemId: e.target.value })}
            disabled={disabled}
          >
            <option value="">{t("opt.selectItem")}</option>
            {itemList.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            style={{ ...inputStyle, width: "50px" }}
            value={effect.amount ?? 1}
            onChange={(e) => update({ amount: Math.max(1, Number(e.target.value)) })}
            disabled={disabled}
          />
        </>
      )}

      {effect.type === EF.CLOTHING && (
        <>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value={EffectOp.SET}>{t("effOp.setState")}</option>
            <option value={EffectOp.REMOVE}>{t("effOp.undress")}</option>
          </select>
          <select
            style={inputStyle}
            value={effect.slot ?? ""}
            onChange={(e) => update({ slot: e.target.value })}
            disabled={disabled}
          >
            <option value="">{t("opt.slot")}</option>
            {clothingSlots.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <select
            style={inputStyle}
            value={effect.state ?? ClothingState.WORN}
            onChange={(e) => update({ state: e.target.value })}
            disabled={disabled}
          >
            <option value={ClothingState.WORN}>{t("clothingState.worn")}</option>
            <option value={ClothingState.HALF_WORN}>{t("clothingState.halfWorn")}</option>
            <option value={ClothingState.OFF}>{t("clothingState.off")}</option>
            <option value={ClothingState.EMPTY}>{t("clothingState.empty")}</option>
          </select>
        </>
      )}

      {effect.type === EF.OUTFIT && (
        <>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value={EffectOp.SWITCH}>{t("effOp.switchPreset")}</option>
            <option value={EffectOp.ADD}>{t("effOp.addClothing")}</option>
            <option value={EffectOp.REMOVE}>{t("effOp.removeClothing")}</option>
          </select>
          {effect.op === EffectOp.SWITCH && (
            <select
              style={inputStyle}
              value={effect.outfitKey ?? ""}
              onChange={(e) => update({ outfitKey: e.target.value })}
              disabled={disabled}
            >
              <option value="">{t("opt.selectPreset")}</option>
              {outfitTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {effect.op === EffectOp.ADD && (
            <>
              <select
                style={inputStyle}
                value={effect.outfitKey ?? ""}
                onChange={(e) => update({ outfitKey: e.target.value })}
                disabled={disabled}
              >
                <option value="">{t("opt.selectPreset")}</option>
                {outfitTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                style={inputStyle}
                value={effect.slot ?? ""}
                onChange={(e) => update({ slot: e.target.value, itemId: undefined })}
                disabled={disabled}
              >
                <option value="">{t("opt.slot")}</option>
                {clothingSlots.map((s) => (
                  <option key={s} value={s}>
                    {SLOT_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
              <select
                style={inputStyle}
                value={effect.itemId ?? ""}
                onChange={(e) => update({ itemId: e.target.value })}
                disabled={disabled}
              >
                <option value="">{t("opt.selectClothing")}</option>
                {clothingList
                  .filter((c) => !effect.slot || (c.slots ?? [c.slot]).includes(effect.slot))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </>
          )}
          {effect.op === EffectOp.REMOVE && (
            <>
              <select
                style={inputStyle}
                value={effect.outfitKey ?? ""}
                onChange={(e) => update({ outfitKey: e.target.value || undefined })}
                disabled={disabled}
              >
                <option value="">{t("opt.anyPreset")}</option>
                {outfitTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                style={inputStyle}
                value={effect.slot ?? ""}
                onChange={(e) => update({ slot: e.target.value || undefined })}
                disabled={disabled}
              >
                <option value="">{t("opt.anySlot")}</option>
                {clothingSlots.map((s) => (
                  <option key={s} value={s}>
                    {SLOT_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}

      {effect.type === EffType.POSITION &&
        (() => {
          const cellOptions = effect.mapId ? (mapList.find((m) => m.id === effect.mapId)?.cells ?? []) : [];
          return (
            <>
              <select
                style={inputStyle}
                value={effect.mapId ?? ""}
                onChange={(e) => update({ mapId: e.target.value, cellId: undefined })}
                disabled={disabled}
              >
                <option value="">{t("opt.selectMap")}</option>
                {mapList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {effect.mapId && (
                <select
                  style={inputStyle}
                  value={effect.cellId != null ? String(effect.cellId) : ""}
                  onChange={(e) => update({ cellId: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={disabled}
                >
                  <option value="">{t("opt.selectCell")}</option>
                  {cellOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? `#${c.id}`}
                    </option>
                  ))}
                </select>
              )}
            </>
          );
        })()}

      {effect.type === EF.WORLD_VAR && (
        <>
          <select
            style={inputStyle}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            disabled={disabled}
          >
            <option value="">{t("opt.selectWorldVar")}</option>
            {worldVarList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            style={inputStyle}
            value={effect.op ?? EffectOp.ADD}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
            <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
          </select>
          <input
            type="number"
            style={{ ...inputStyle, width: "70px" }}
            value={effect.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })}
            disabled={disabled}
          />
        </>
      )}
    </>
  );
}
