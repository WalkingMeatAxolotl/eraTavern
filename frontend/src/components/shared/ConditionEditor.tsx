/**
 * Shared condition editor — recursive AND/OR/NOT condition tree.
 *
 * Used by ActionEditor and EventManager.
 * Reads shared data from EditorContext (no props drilling).
 */
import type { ActionCondition, ConditionItem } from "../../types/game";
import T from "../../theme";
import { CondType, EF, CondTarget, TargetType, ClothingState, Season, DayOfWeek } from "../../constants";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { useEditorContext } from "./EditorContext";
import type { MapInfo } from "./EditorContext";
import { inputStyle, btn, listRowStyle } from "./styles";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_TYPES: { value: ActionCondition["type"]; label: string; group?: string }[] = [
  { value: CondType.RESOURCE, label: t("cond.resource"), group: t("cond.group.character") },
  { value: CondType.ABILITY, label: t("cond.ability"), group: t("cond.group.character") },
  { value: CondType.BASIC_INFO, label: t("cond.basicInfo"), group: t("cond.group.character") },
  { value: CondType.FAVORABILITY, label: t("cond.favorability"), group: t("cond.group.character") },
  { value: CondType.EXPERIENCE, label: t("cond.experience"), group: t("cond.group.character") },
  { value: CondType.VARIABLE, label: t("cond.variable"), group: t("cond.group.character") },
  { value: CondType.TRAIT, label: t("cond.trait"), group: t("cond.group.character") },
  { value: CondType.HAS_ITEM, label: t("cond.hasItem"), group: t("cond.group.character") },
  { value: CondType.OUTFIT, label: t("cond.outfit"), group: t("cond.group.character") },
  { value: CondType.CLOTHING, label: t("cond.clothing"), group: t("cond.group.character") },
  { value: CondType.LOCATION, label: t("cond.location"), group: t("cond.group.scene") },
  { value: CondType.NPC_PRESENT, label: t("cond.npcPresent"), group: t("cond.group.scene") },
  { value: CondType.TIME, label: t("cond.time"), group: t("cond.group.global") },
  { value: CondType.WORLD_VAR, label: t("cond.worldVar"), group: t("cond.group.global") },
];

const OPS = [">=", "<=", ">", "<", "==", "!="];

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isAndGroup(item: ConditionItem): item is { and: ConditionItem[] } {
  return "and" in item && !("type" in item);
}
export function isOrGroup(item: ConditionItem): item is { or: ConditionItem[] } {
  return "or" in item && !("type" in item);
}
export function isNotGroup(item: ConditionItem): item is { not: ConditionItem } {
  return "not" in item && !("type" in item);
}

const MAX_UI_DEPTH = 4;

// ---------------------------------------------------------------------------
// ConditionItemEditor — top-level recursive dispatcher
// ---------------------------------------------------------------------------

export function ConditionItemEditor({
  item,
  onChange,
  onRemove,
  disabled,
  depth,
}: {
  item: ConditionItem;
  onChange: (item: ConditionItem) => void;
  onRemove: () => void;
  disabled: boolean;
  depth: number;
}) {
  if (isAndGroup(item)) {
    return (
      <ConditionGroupEditor
        type="and"
        items={item.and}
        onChange={(items) => onChange({ and: items })}
        onRemove={onRemove}
        disabled={disabled}
        depth={depth}
      />
    );
  }
  if (isOrGroup(item)) {
    return (
      <ConditionGroupEditor
        type="or"
        items={item.or}
        onChange={(items) => onChange({ or: items })}
        onRemove={onRemove}
        disabled={disabled}
        depth={depth}
      />
    );
  }
  // NOT wrapping a group → unwrap and render as normal group
  if (isNotGroup(item) && !("type" in item.not)) {
    const inner = item.not;
    if (isOrGroup(inner)) {
      return (
        <ConditionGroupEditor
          type="or"
          items={inner.or}
          onChange={(items) => onChange({ or: items })}
          onRemove={onRemove}
          disabled={disabled}
          depth={depth}
        />
      );
    }
    const andItems = (inner as { and: ConditionItem[] }).and;
    return (
      <ConditionGroupEditor
        type="and"
        items={andItems}
        onChange={(items) => onChange({ and: items })}
        onRemove={onRemove}
        disabled={disabled}
        depth={depth}
      />
    );
  }
  // Leaf (possibly NOT-wrapped)
  const rawLeaf = isNotGroup(item) ? null : (item as ActionCondition);
  const isLegacyNot = rawLeaf && (rawLeaf.type === CondType.NPC_ABSENT || rawLeaf.type === CondType.NO_TRAIT);
  const isNot = isNotGroup(item) || !!isLegacyNot;
  const leaf = isNotGroup(item)
    ? ((item as { not: ConditionItem }).not as ActionCondition)
    : isLegacyNot
      ? { ...rawLeaf, type: (rawLeaf.type === CondType.NPC_ABSENT ? CondType.NPC_PRESENT : CondType.TRAIT) as ActionCondition["type"] }
      : rawLeaf!;
  const toggleNot = () => {
    if (isNot) onChange(leaf);
    else onChange({ not: item });
  };
  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      {!disabled ? (
        <button
          onClick={toggleNot}
          style={{
            ...btn("default", "sm"),
            color: isNot ? "#e9a045" : T.textDim,
            minWidth: "28px",
            textAlign: "center",
            padding: "1px 4px",
            fontWeight: isNot ? "bold" : "normal",
          }}
          title={isNot ? t("cond.negUntoggle") : t("cond.negToggle")}
        >
          {isNot ? t("cond.negFalse") : t("cond.negTrue")}
        </button>
      ) : (
        <span
          style={{
            color: isNot ? "#e9a045" : T.textDim,
            fontSize: "11px",
            minWidth: "28px",
            fontWeight: isNot ? "bold" : "normal",
          }}
        >
          {isNot ? t("cond.negFalse") : t("cond.negTrue")}
        </span>
      )}
      <ConditionLeafEditor
        condition={leaf}
        onChange={(c) => (isNot ? onChange({ not: c }) : onChange(c))}
        disabled={disabled}
      />
      {!disabled && (
        <button className="ae-del-btn" onClick={onRemove} style={btn("del", "sm")}>
          x
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConditionGroupEditor — AND/OR group
// ---------------------------------------------------------------------------

function ConditionGroupEditor({
  type,
  items,
  onChange,
  onRemove,
  disabled,
  depth,
}: {
  type: "and" | "or";
  items: ConditionItem[];
  onChange: (items: ConditionItem[]) => void;
  onRemove: () => void;
  disabled: boolean;
  depth: number;
}) {
  const label = type === "and" ? t("cond.andGroup") : t("cond.orGroup");
  const labelColor = type === "and" ? "#6ec6ff" : "#e9a045";
  const borderColor = [T.border, T.borderLight, T.textDim][depth % 3];

  const addLeaf = () => onChange([...items, { type: "location" }]);
  const addOr = () => onChange([...items, { or: [{ type: "location" }] }]);
  const addAnd = () => onChange([...items, { and: [{ type: "location" }] }]);
  const removeChild = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    if (next.length === 0) onRemove();
    else onChange(next);
  };
  const updateChild = (idx: number, child: ConditionItem) => {
    const next = [...items];
    next[idx] = child;
    onChange(next);
  };

  return (
    <div
      style={{
        border: `1px dashed ${borderColor}`,
        borderRadius: "3px",
        padding: "4px 6px",
        marginLeft: depth > 0 ? "16px" : "28px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <span style={{ color: labelColor, fontSize: "11px", fontWeight: "bold" }}>{label}</span>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {!disabled && depth + 1 < MAX_UI_DEPTH && (
            <>
              <button className="ae-add-btn" onClick={addLeaf} style={btn("add", "sm")}>
                [{t("cond.addCond")}]
              </button>
              <button className="ae-add-btn" onClick={addOr} style={btn("add", "sm")}>
                [{t("cond.addOr")}]
              </button>
              <button className="ae-add-btn" onClick={addAnd} style={btn("add", "sm")}>
                [{t("cond.addAnd")}]
              </button>
            </>
          )}
          {!disabled && depth + 1 >= MAX_UI_DEPTH && (
            <button className="ae-add-btn" onClick={addLeaf} style={btn("add", "sm")}>
              [{t("cond.addCond")}]
            </button>
          )}
          {!disabled && (
            <button className="ae-del-btn" onClick={onRemove} style={btn("del", "sm")}>
              x
            </button>
          )}
        </div>
      </div>
      {items.map((child, idx) => (
        <div key={idx} style={{ ...listRowStyle(idx, idx === items.length - 1), marginBottom: "2px" }}>
          <ConditionItemEditor
            item={child}
            onChange={(c) => updateChild(idx, c)}
            onRemove={() => removeChild(idx)}
            disabled={disabled}
            depth={depth + 1}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConditionLeafEditor — single leaf condition
// ---------------------------------------------------------------------------

function ConditionLeafEditor({
  condition,
  onChange,
  disabled,
}: {
  condition: ActionCondition;
  onChange: (c: ConditionItem) => void;
  disabled: boolean;
}) {
  const ctx = useEditorContext();
  const {
    targetType: actionTargetType,
    resourceKeys,
    abilityKeys,
    experienceKeys,
    basicInfoNumKeys,
    traitCategories,
    clothingSlots,
    mapList,
    traitList,
    itemList,
    npcList,
    outfitTypes,
    variableList,
    biVarList,
    worldVarList,
  } = ctx;

  const effectiveType =
    condition.type === CondType.NPC_ABSENT ? CondType.NPC_PRESENT : condition.type === CondType.NO_TRAIT ? CondType.TRAIT : condition.type;
  const isLegacyNot = condition.type === CondType.NPC_ABSENT || condition.type === CondType.NO_TRAIT;
  const update = (patch: Partial<ActionCondition>) => {
    const merged = { ...condition, ...patch };
    if (isLegacyNot && !patch.type) merged.type = effectiveType as ActionCondition["type"];
    onChange(merged);
  };

  const isBiVarSelected = effectiveType === EF.VARIABLE && (biVarList ?? []).some((v) => v.id === condition.varId);
  const noCondTarget =
    [CondType.LOCATION, CondType.NPC_PRESENT, CondType.TIME, EF.WORLD_VAR, EF.FAVORABILITY].includes(effectiveType) || isBiVarSelected;
  const showCondTarget = !noCondTarget;

  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
      <select
        style={{ ...inputStyle, width: "auto" }}
        value={effectiveType}
        onChange={(e) => onChange({ type: e.target.value as ActionCondition["type"] })}
        disabled={disabled}
      >
        {(() => {
          let lastGroup = "";
          const filtered = CONDITION_TYPES.filter((t) => {
            if (t.value === EF.FAVORABILITY && actionTargetType !== TargetType.NPC) return false;
            return true;
          });
          return filtered
            .map((t) => {
              const els: React.ReactNode[] = [];
              if (t.group && t.group !== lastGroup) {
                lastGroup = t.group;
                els.push(
                  <option key={`g-${t.group}`} disabled style={{ fontWeight: "bold" }}>
                    ── {t.group} ──
                  </option>,
                );
              }
              els.push(
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>,
              );
              return els;
            })
            .flat();
        })()}
      </select>

      {showCondTarget && (
        <select
          style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
          value={condition.condTarget ?? CondTarget.SELF}
          onChange={(e) => update({ condTarget: e.target.value as "self" | "target" })}
          disabled={disabled || actionTargetType !== TargetType.NPC}
        >
          <option value={CondTarget.SELF}>{t("target.self")}</option>
          {actionTargetType === TargetType.NPC && <option value={CondTarget.TARGET}>{t("target.target")}</option>}
        </select>
      )}

      {effectiveType === CondType.LOCATION && (
        <LocationCondEditor condition={condition} onChange={update} disabled={disabled} mapList={mapList} />
      )}

      {effectiveType === CondType.NPC_PRESENT && (
        <select
          style={inputStyle}
          value={condition.npcId ?? ""}
          onChange={(e) => update({ npcId: e.target.value || undefined })}
          disabled={disabled}
        >
          <option value="">{t("opt.anyNpc")}</option>
          {npcList.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      )}

      {[EF.RESOURCE, EF.ABILITY, EF.EXPERIENCE, EF.BASIC_INFO].includes(effectiveType) && (
        <>
          <select
            style={inputStyle}
            value={condition.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            disabled={disabled}
          >
            <option value="">{t("opt.select")}</option>
            {(effectiveType === EF.RESOURCE
              ? resourceKeys
              : effectiveType === EF.ABILITY
                ? abilityKeys
                : effectiveType === EF.EXPERIENCE
                  ? experienceKeys
                  : basicInfoNumKeys
            ).map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <select
            style={inputStyle}
            value={condition.op ?? ">="}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="number"
            style={{ ...inputStyle, width: "70px" }}
            value={condition.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })}
            disabled={disabled}
          />
        </>
      )}

      {effectiveType === EF.TRAIT && (
        <>
          <select
            style={inputStyle}
            value={condition.key ?? ""}
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
            value={condition.traitId ?? ""}
            onChange={(e) => update({ traitId: e.target.value })}
            disabled={disabled}
          >
            <option value="">{t("opt.selectTrait")}</option>
            {traitList
              .filter((t) => !condition.key || t.category === condition.key)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </>
      )}

      {effectiveType === EF.FAVORABILITY && (
        <>
          <select
            style={inputStyle}
            value={
              condition.condTarget === CondTarget.TARGET
                ? "target_to_self"
                : condition.targetId === "{{targetId}}"
                  ? "self_to_target"
                  : "self_to_target"
            }
            onChange={(e) => {
              if (e.target.value === "target_to_self") {
                update({ condTarget: CondTarget.TARGET, targetId: CondTarget.SELF });
              } else {
                update({ condTarget: CondTarget.SELF, targetId: "{{targetId}}" });
              }
            }}
            disabled={disabled}
          >
            <option value="self_to_target">{t("target.selfToTarget")}</option>
            <option value="target_to_self">{t("target.targetToSelf")}</option>
          </select>
          <select
            style={inputStyle}
            value={condition.op ?? ">="}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="number"
            style={{ ...inputStyle, width: "70px" }}
            value={condition.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })}
            disabled={disabled}
          />
        </>
      )}

      {effectiveType === EF.HAS_ITEM && (
        <>
          <select
            style={inputStyle}
            value={condition.itemId ?? ""}
            onChange={(e) => update({ itemId: e.target.value || undefined })}
            disabled={disabled}
          >
            <option value="">{t("opt.anyItem")}</option>
            {itemList.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            style={{ ...inputStyle, width: "80px" }}
            value={condition.tag ?? ""}
            onChange={(e) => update({ tag: e.target.value || undefined })}
            disabled={disabled}
            placeholder={t("cond.tagFilter")}
          />
          <select
            style={{ ...inputStyle, width: "auto" }}
            value={condition.op ?? ""}
            onChange={(e) =>
              update({ op: e.target.value || undefined, value: e.target.value ? (condition.value ?? 1) : undefined })
            }
            disabled={disabled}
          >
            <option value="">{t("opt.anyQty")}</option>
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          {condition.op && (
            <input
              type="number"
              style={{ ...inputStyle, width: "60px" }}
              value={condition.value ?? 1}
              onChange={(e) => update({ value: Number(e.target.value) })}
              disabled={disabled}
            />
          )}
        </>
      )}

      {effectiveType === EF.OUTFIT && (
        <select
          style={inputStyle}
          value={condition.outfitId ?? ""}
          onChange={(e) => update({ outfitId: e.target.value })}
          disabled={disabled}
        >
          <option value="">{t("opt.selectPreset")}</option>
          {outfitTypes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      {effectiveType === EF.CLOTHING &&
        (() => {
          const slotClothing = condition.slot
            ? Object.values(ctx.definitions.clothingDefs).filter((c) => (c.slots ?? [c.slot]).includes(condition.slot))
            : [];
          return (
            <>
              <select
                style={inputStyle}
                value={condition.slot ?? ""}
                onChange={(e) => update({ slot: e.target.value, itemId: undefined })}
                disabled={disabled}
              >
                <option value="">{t("opt.selectSlot")}</option>
                {clothingSlots.map((s) => (
                  <option key={s} value={s}>
                    {SLOT_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
              <select
                style={inputStyle}
                value={condition.itemId ?? ""}
                onChange={(e) => update({ itemId: e.target.value || undefined })}
                disabled={disabled}
              >
                <option value="">{t("opt.anyClothing")}</option>
                {slotClothing.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                style={inputStyle}
                value={condition.state ?? ""}
                onChange={(e) => update({ state: e.target.value || undefined })}
                disabled={disabled}
              >
                <option value="">{t("opt.anyState")}</option>
                <option value={ClothingState.WORN}>{t("clothingState.worn")}</option>
                <option value={ClothingState.HALF_WORN}>{t("clothingState.halfWorn")}</option>
                <option value={ClothingState.OFF}>{t("clothingState.off")}</option>
                <option value={ClothingState.EMPTY}>{t("clothingState.empty")}</option>
              </select>
            </>
          );
        })()}

      {effectiveType === CondType.TIME && (
        <>
          <input
            type="number"
            style={{ ...inputStyle, width: "50px" }}
            value={condition.hourMin ?? ""}
            onChange={(e) =>
              update({ hourMin: e.target.value ? Math.min(23, Math.max(0, Number(e.target.value))) : undefined })
            }
            disabled={disabled}
            placeholder={t("label.timeFrom")}
            min={0}
            max={23}
          />
          <span style={{ color: T.textDim }}>~</span>
          <input
            type="number"
            style={{ ...inputStyle, width: "50px" }}
            value={condition.hourMax ?? ""}
            onChange={(e) =>
              update({ hourMax: e.target.value ? Math.min(23, Math.max(0, Number(e.target.value))) : undefined })
            }
            disabled={disabled}
            placeholder={t("label.timeTo")}
            min={0}
            max={23}
          />
          <select
            style={{ ...inputStyle, width: "auto" }}
            value={condition.season ?? ""}
            onChange={(e) => update({ season: e.target.value || undefined })}
            disabled={disabled}
          >
            <option value="">{t("opt.anySeason")}</option>
            {([
              [Season.SPRING, "season.spring"],
              [Season.SUMMER, "season.summer"],
              [Season.AUTUMN, "season.autumn"],
              [Season.WINTER, "season.winter"],
            ] as const).map(([val, key]) => (
              <option key={val} value={val}>
                {t(key)}
              </option>
            ))}
          </select>
          <select
            style={{ ...inputStyle, width: "auto" }}
            value={condition.dayOfWeek ?? ""}
            onChange={(e) => update({ dayOfWeek: e.target.value || undefined })}
            disabled={disabled}
          >
            <option value="">{t("opt.anyWeekday")}</option>
            {([
              [DayOfWeek.MON, "day.mon"],
              [DayOfWeek.TUE, "day.tue"],
              [DayOfWeek.WED, "day.wed"],
              [DayOfWeek.THU, "day.thu"],
              [DayOfWeek.FRI, "day.fri"],
              [DayOfWeek.SAT, "day.sat"],
              [DayOfWeek.SUN, "day.sun"],
            ] as const).map(([val, key]) => (
              <option key={val} value={val}>
                {t(key)}
              </option>
            ))}
          </select>
          <select
            style={{ ...inputStyle, width: "auto" }}
            value={condition.weather ?? ""}
            onChange={(e) => update({ weather: e.target.value || undefined })}
            disabled={disabled}
          >
            <option value="">{t("opt.anyWeather")}</option>
            <option value="sunny">{t("weather.sunny")}</option>
            <option value="cloudy">{t("weather.cloudy")}</option>
            <option value="rainy">{t("weather.rainy")}</option>
            <option value="snowy">{t("weather.snowy")}</option>
          </select>
        </>
      )}

      {effectiveType === EF.VARIABLE &&
        (() => {
          const isBiVar = (biVarList ?? []).some((v) => v.id === condition.varId);
          return (
            <>
              {isBiVar && actionTargetType === TargetType.NPC && (
                <select
                  style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
                  value={condition.condTarget ?? CondTarget.SELF}
                  onChange={(e) => update({ condTarget: e.target.value as "self" | "target" })}
                  disabled={disabled}
                >
                  <option value={CondTarget.SELF}>{t("target.selfToTarget")}</option>
                  <option value={CondTarget.TARGET}>{t("target.targetToSelf")}</option>
                </select>
              )}
              <select
                style={inputStyle}
                value={condition.varId ?? ""}
                onChange={(e) => update({ varId: e.target.value })}
                disabled={disabled}
              >
                <option value="">{t("opt.selectVar")}</option>
                {variableList.length > 0 && <option disabled>{t("modGroup.uni")}</option>}
                {variableList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                {actionTargetType === TargetType.NPC && (biVarList ?? []).length > 0 && <option disabled>{t("modGroup.bi")}</option>}
                {actionTargetType === TargetType.NPC &&
                  (biVarList ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
              <select
                style={inputStyle}
                value={condition.op ?? ">="}
                onChange={(e) => update({ op: e.target.value })}
                disabled={disabled}
              >
                {OPS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                type="number"
                style={{ ...inputStyle, width: "70px" }}
                value={condition.value ?? 0}
                onChange={(e) => update({ value: Number(e.target.value) })}
                disabled={disabled}
              />
            </>
          );
        })()}

      {effectiveType === EF.WORLD_VAR && (
        <>
          <select
            style={inputStyle}
            value={condition.key ?? ""}
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
            value={condition.op ?? ">="}
            onChange={(e) => update({ op: e.target.value })}
            disabled={disabled}
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="number"
            style={{ ...inputStyle, width: "70px" }}
            value={condition.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LocationCondEditor — location with cell/tag selection
// ---------------------------------------------------------------------------

function LocationCondEditor({
  condition,
  onChange,
  disabled,
  mapList,
}: {
  condition: ActionCondition;
  onChange: (patch: Partial<ActionCondition>) => void;
  disabled: boolean;
  mapList: MapInfo[];
}) {
  const selectedMap = mapList.find((m) => m.id === condition.mapId);
  const cells = selectedMap?.cells ?? [];
  const selectedIds = new Set(condition.cellIds ?? []);
  const selectedTags = new Set(condition.cellTags ?? []);
  const allTags = [...new Set(cells.flatMap((c) => c.tags ?? []))].sort();
  const tagMatchedIds = new Set(cells.filter((c) => (c.tags ?? []).some((t) => selectedTags.has(t))).map((c) => c.id));

  const toggleCell = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ cellIds: [...next] });
  };
  const toggleTag = (tag: string) => {
    const next = new Set(selectedTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange({ cellTags: [...next] });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <select
        style={inputStyle}
        value={condition.mapId ?? ""}
        onChange={(e) => onChange({ mapId: e.target.value, cellIds: [], cellTags: [] })}
        disabled={disabled}
      >
        <option value="">{t("opt.selectMap")}</option>
        {mapList.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {condition.mapId && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
          {allTags.length > 0 &&
            allTags.map((tag) => (
              <label
                key={`tag-${tag}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "2px 6px",
                  fontSize: "11px",
                  cursor: disabled ? "default" : "pointer",
                  backgroundColor: selectedTags.has(tag) ? "#2a4a2a" : T.bg2,
                  border: `1px solid ${selectedTags.has(tag) ? "#4a8a4a" : T.border}`,
                  borderRadius: "3px",
                  color: selectedTags.has(tag) ? "#8f8" : T.textSub,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedTags.has(tag)}
                  onChange={() => toggleTag(tag)}
                  disabled={disabled}
                  style={{ margin: 0, width: "12px", height: "12px" }}
                />
                #{tag}
              </label>
            ))}
          {cells.map((c) => {
            const isTagged = tagMatchedIds.has(c.id);
            const isManual = selectedIds.has(c.id);
            const isActive = isTagged || isManual;
            return (
              <label
                key={c.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "2px 6px",
                  fontSize: "11px",
                  cursor: disabled ? "default" : "pointer",
                  backgroundColor: isActive ? (isTagged ? "#1a3a4a" : "#2a2a4a") : T.bg2,
                  border: `1px solid ${isActive ? (isTagged ? "#4a8aaa" : "#6a6aaa") : T.border}`,
                  borderRadius: "3px",
                  color: isActive ? T.text : T.textSub,
                  opacity: isTagged && !isManual ? 0.8 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={isManual}
                  onChange={() => toggleCell(c.id)}
                  disabled={disabled || isTagged}
                  style={{ margin: 0, width: "12px", height: "12px" }}
                />
                {c.name ?? `#${c.id}`}
                {isTagged && <span style={{ fontSize: "11px", color: "#4a8aaa" }}>(tag)</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
