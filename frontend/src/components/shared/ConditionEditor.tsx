/**
 * Shared condition editor — recursive AND/OR/NOT condition tree.
 *
 * Used by ActionEditor and EventManager.
 * Reads shared data from EditorContext (no props drilling).
 */
import type { ActionCondition, ConditionItem } from "../../types/game";
import T from "../../theme";
import { CondType, EF, CondTarget, TargetType, ClothingState } from "../../constants";
import { useEditorContext } from "./EditorContext";
import type { MapInfo } from "./EditorContext";
import { inputStyle, addBtnStyle, delBtnStyle, smallBtnStyle, listRowStyle } from "./styles";
export { inputStyle, addBtnStyle, delBtnStyle, smallBtnStyle, rowBg, listRowStyle } from "./styles";

export const SLOT_LABELS: Record<string, string> = {
  hat: "帽子",
  upperBody: "上半身",
  upperUnderwear: "上半身内衣",
  lowerBody: "下半身",
  lowerUnderwear: "下半身内衣",
  hands: "手",
  feet: "脚",
  shoes: "鞋子",
  mainHand: "主手",
  offHand: "副手",
  back: "背部",
  accessory1: "装饰品1",
  accessory2: "装饰品2",
  accessory3: "装饰品3",
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_TYPES: { value: ActionCondition["type"]; label: string; group?: string }[] = [
  { value: CondType.RESOURCE, label: "资源", group: "角色" },
  { value: CondType.ABILITY, label: "能力", group: "角色" },
  { value: CondType.BASIC_INFO, label: "基本属性", group: "角色" },
  { value: CondType.FAVORABILITY, label: "好感度", group: "角色" },
  { value: CondType.EXPERIENCE, label: "经验", group: "角色" },
  { value: CondType.VARIABLE, label: "派生变量", group: "角色" },
  { value: CondType.TRAIT, label: "特质", group: "角色" },
  { value: CondType.HAS_ITEM, label: "持有物品", group: "角色" },
  { value: CondType.OUTFIT, label: "服装预设", group: "角色" },
  { value: CondType.CLOTHING, label: "服装状态", group: "角色" },
  { value: CondType.LOCATION, label: "地点", group: "场景" },
  { value: CondType.NPC_PRESENT, label: "NPC在场", group: "场景" },
  { value: CondType.TIME, label: "时间", group: "全局" },
  { value: CondType.WORLD_VAR, label: "世界变量", group: "全局" },
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
            ...smallBtnStyle(isNot ? "#e9a045" : T.textDim),
            minWidth: "28px",
            textAlign: "center",
            padding: "1px 4px",
            fontWeight: isNot ? "bold" : "normal",
          }}
          title={isNot ? "取消取反" : "点击取反"}
        >
          {isNot ? "非" : "是"}
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
          {isNot ? "非" : "是"}
        </span>
      )}
      <ConditionLeafEditor
        condition={leaf}
        onChange={(c) => (isNot ? onChange({ not: c }) : onChange(c))}
        disabled={disabled}
      />
      {!disabled && (
        <button className="ae-del-btn" onClick={onRemove} style={delBtnStyle}>
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
  const label = type === "and" ? "AND 组" : "OR 组";
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
              <button className="ae-add-btn" onClick={addLeaf} style={addBtnStyle}>
                [+条件]
              </button>
              <button className="ae-add-btn" onClick={addOr} style={addBtnStyle}>
                [+OR]
              </button>
              <button className="ae-add-btn" onClick={addAnd} style={addBtnStyle}>
                [+AND]
              </button>
            </>
          )}
          {!disabled && depth + 1 >= MAX_UI_DEPTH && (
            <button className="ae-add-btn" onClick={addLeaf} style={addBtnStyle}>
              [+条件]
            </button>
          )}
          {!disabled && (
            <button className="ae-del-btn" onClick={onRemove} style={delBtnStyle}>
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
          <option value={CondTarget.SELF}>执行者</option>
          {actionTargetType === TargetType.NPC && <option value={CondTarget.TARGET}>目标角色</option>}
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
          <option value="">任意NPC</option>
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
            <option value="">选择</option>
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
            <option value="">分类</option>
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
            <option value="">选择特质</option>
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
            <option value="self_to_target">执行者→目标角色</option>
            <option value="target_to_self">目标角色→执行者</option>
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
            <option value="">任意物品</option>
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
            placeholder="标签筛选"
          />
          <select
            style={{ ...inputStyle, width: "auto" }}
            value={condition.op ?? ""}
            onChange={(e) =>
              update({ op: e.target.value || undefined, value: e.target.value ? (condition.value ?? 1) : undefined })
            }
            disabled={disabled}
          >
            <option value="">不限数量</option>
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
          <option value="">选择预设</option>
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
                <option value="">选择槽位</option>
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
                <option value="">任意衣物</option>
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
                <option value="">任意状态</option>
                <option value={ClothingState.WORN}>穿着</option>
                <option value={ClothingState.HALF_WORN}>半穿</option>
                <option value={ClothingState.OFF}>脱下</option>
                <option value={ClothingState.EMPTY}>无衣物</option>
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
            placeholder="时起"
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
            placeholder="时止"
            min={0}
            max={23}
          />
          <select
            style={{ ...inputStyle, width: "auto" }}
            value={condition.season ?? ""}
            onChange={(e) => update({ season: e.target.value || undefined })}
            disabled={disabled}
          >
            <option value="">任意季节</option>
            {["春", "夏", "秋", "冬"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            style={{ ...inputStyle, width: "auto" }}
            value={condition.dayOfWeek ?? ""}
            onChange={(e) => update({ dayOfWeek: e.target.value || undefined })}
            disabled={disabled}
          >
            <option value="">任意星期</option>
            {["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            style={{ ...inputStyle, width: "auto" }}
            value={condition.weather ?? ""}
            onChange={(e) => update({ weather: e.target.value || undefined })}
            disabled={disabled}
          >
            <option value="">任意天气</option>
            <option value="sunny">☀ 晴天</option>
            <option value="cloudy">☁ 多云</option>
            <option value="rainy">🌧 雨天</option>
            <option value="snowy">❄ 雪天</option>
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
                  <option value={CondTarget.SELF}>执行者→目标角色</option>
                  <option value={CondTarget.TARGET}>目标角色→执行者</option>
                </select>
              )}
              <select
                style={inputStyle}
                value={condition.varId ?? ""}
                onChange={(e) => update({ varId: e.target.value })}
                disabled={disabled}
              >
                <option value="">选择变量</option>
                {variableList.length > 0 && <option disabled>── 单向 ──</option>}
                {variableList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                {actionTargetType === TargetType.NPC && (biVarList ?? []).length > 0 && <option disabled>── 双向 ──</option>}
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
            <option value="">选择世界变量</option>
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
        <option value="">选择地图</option>
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
