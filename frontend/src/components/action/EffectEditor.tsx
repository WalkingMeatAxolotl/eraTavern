/**
 * EffectEditor — single effect row editor.
 *
 * Extracted from ActionEditor.tsx. Reads shared definition lists from EditorContext.
 */
import type { ActionEffect } from "../../types/game";
import T from "../../theme";
import { useEditorContext } from "../shared/EditorContext";
import { inputStyle, SLOT_LABELS } from "../shared/ConditionEditor";

const EFFECT_TYPES: { value: ActionEffect["type"]; label: string }[] = [
  { value: "resource", label: "资源" },
  { value: "ability", label: "能力(经验值)" },
  { value: "experience", label: "经历记录" },
  { value: "basicInfo", label: "基本属性" },
  { value: "favorability", label: "好感度" },
  { value: "trait", label: "特质" },
  { value: "item", label: "物品" },
  { value: "clothing", label: "服装" },
  { value: "position", label: "位置" },
  { value: "worldVar", label: "世界变量" },
  { value: "outfit", label: "服装预设" },
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
        onChange={(e) => onChange({ type: e.target.value as ActionEffect["type"], op: "add" })}
        disabled={disabled}
      >
        {EFFECT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {(effect.type === "resource" || effect.type === "ability" || effect.type === "basicInfo") &&
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
                <option value="">选择</option>
                {(effect.type === "resource"
                  ? resourceKeys
                  : effect.type === "ability"
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
                <option value="add">增加</option>
                <option value="set">设为</option>
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
                title="切换固定值/变量引用"
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
                    <option value="">选择变量</option>
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

      {effect.type === "experience" && (
        <>
          <select
            style={inputStyle}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            disabled={disabled}
          >
            <option value="">选择</option>
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

      {effect.type === "favorability" && (
        <>
          <span style={{ color: T.textSub, fontSize: "11px" }}>源:</span>
          <select
            style={inputStyle}
            value={effect.favFrom ?? "{{targetId}}"}
            onChange={(e) => update({ favFrom: e.target.value })}
            disabled={disabled}
          >
            <option value="self">执行者</option>
            <option value="{{targetId}}">目标角色</option>
            <option value="{{player}}">玩家</option>
          </select>
          <span style={{ color: T.textSub, fontSize: "11px" }}>→</span>
          <span style={{ color: T.textSub, fontSize: "11px" }}>对象:</span>
          <select
            style={inputStyle}
            value={effect.favTo ?? "self"}
            onChange={(e) => update({ favTo: e.target.value })}
            disabled={disabled}
          >
            <option value="self">执行者</option>
            <option value="{{targetId}}">目标角色</option>
            <option value="{{player}}">玩家</option>
          </select>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value="add">增加</option>
            <option value="set">设为</option>
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
                  title="切换固定值/变量引用"
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
                      <option value="">选择变量</option>
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

      {effect.type === "trait" && (
        <>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value="add">添加</option>
            <option value="remove">移除</option>
          </select>
          <select
            style={inputStyle}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            disabled={disabled}
          >
            <option value="">分类</option>
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
            <option value="">特质</option>
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

      {effect.type === "item" && (
        <>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value="add">添加</option>
            <option value="remove">移除</option>
          </select>
          <select
            style={inputStyle}
            value={effect.itemId ?? ""}
            onChange={(e) => update({ itemId: e.target.value })}
            disabled={disabled}
          >
            <option value="">选择物品</option>
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

      {effect.type === "clothing" && (
        <>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value="set">设置状态</option>
            <option value="remove">脱下</option>
          </select>
          <select
            style={inputStyle}
            value={effect.slot ?? ""}
            onChange={(e) => update({ slot: e.target.value })}
            disabled={disabled}
          >
            <option value="">槽位</option>
            {clothingSlots.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <select
            style={inputStyle}
            value={effect.state ?? "worn"}
            onChange={(e) => update({ state: e.target.value })}
            disabled={disabled}
          >
            <option value="worn">穿着</option>
            <option value="halfWorn">半穿</option>
            <option value="off">脱下</option>
            <option value="empty">无衣物</option>
          </select>
        </>
      )}

      {effect.type === "outfit" && (
        <>
          <select
            style={inputStyle}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value="switch">切换预设</option>
            <option value="add">添加衣物</option>
            <option value="remove">移除衣物</option>
          </select>
          {effect.op === "switch" && (
            <select
              style={inputStyle}
              value={effect.outfitKey ?? ""}
              onChange={(e) => update({ outfitKey: e.target.value })}
              disabled={disabled}
            >
              <option value="">选择预设</option>
              {outfitTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {effect.op === "add" && (
            <>
              <select
                style={inputStyle}
                value={effect.outfitKey ?? ""}
                onChange={(e) => update({ outfitKey: e.target.value })}
                disabled={disabled}
              >
                <option value="">选择预设</option>
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
                <option value="">槽位</option>
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
                <option value="">选择服装</option>
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
          {effect.op === "remove" && (
            <>
              <select
                style={inputStyle}
                value={effect.outfitKey ?? ""}
                onChange={(e) => update({ outfitKey: e.target.value || undefined })}
                disabled={disabled}
              >
                <option value="">任意预设</option>
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
                <option value="">任意槽位</option>
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

      {effect.type === "position" &&
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
                <option value="">选择地图</option>
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
                  <option value="">选择格子</option>
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

      {effect.type === "worldVar" && (
        <>
          <select
            style={inputStyle}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            disabled={disabled}
          >
            <option value="">选择世界变量</option>
            {worldVarList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            style={inputStyle}
            value={effect.op ?? "add"}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            <option value="add">增加</option>
            <option value="set">设为</option>
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
