/**
 * Error code → localized message mapping.
 *
 * Backend returns { success, error, params? }.
 * This module translates `error` codes into user-friendly Chinese messages.
 *
 * Placeholders use {key} syntax, interpolated from `params`.
 */

const ENTITY_NAMES: Record<string, string> = {
  character: "角色",
  trait: "特质",
  clothing: "服装",
  item: "物品",
  action: "行动",
  traitGroup: "特质组",
  variable: "变量",
  event: "事件",
  lorebook: "世界书条目",
  worldVariable: "世界变量",
  map: "地图",
};

const ERROR_MESSAGES: Record<string, string> = {
  // --- Entity CRUD ---
  ENTITY_NOT_FOUND: "{entity}不存在",
  ENTITY_ALREADY_EXISTS: "{entity}已存在",
  ENTITY_CREATED: "{entity}已创建",
  ENTITY_UPDATED: "{entity}已更新",
  ENTITY_DELETED: "{entity}已删除",
  ENTITY_MISSING_ID: "缺少{entity} ID",

  // --- World ---
  WORLD_NOT_FOUND: "世界 '{id}' 不存在",
  WORLD_ALREADY_EXISTS: "世界 '{id}' 已存在",
  WORLD_CREATED: "世界 '{name}' 已创建",
  WORLD_UPDATED: "世界已更新",
  WORLD_DELETED: "世界已删除",
  WORLD_META_UPDATED: "世界信息已更新",
  WORLD_SWITCHED: "已切换到 {name}",
  WORLD_RESTARTED: "世界 '{name}' 已重启",
  WORLD_SAVE_AS_SUCCESS: "世界 '{name}' 已创建并保存",

  // --- Session ---
  NO_WORLD_LOADED: "未加载世界",
  SESSION_SAVED: "已保存变更",
  DECOR_PRESETS_SAVED: "装饰预设已保存",

  // --- Save slots ---
  SAVE_NOT_FOUND: "存档不存在",
  SAVE_SLOTS_FULL: "最多 {max} 个存档位",
  SAVE_LOADED: "存档已加载",
  SAVE_DELETED: "存档已删除",
  SAVE_RENAMED: "存档已重命名为 '{name}'",

  // --- Addon ---
  ADDON_NOT_FOUND: "扩展包不存在",
  ADDON_VERSION_NOT_FOUND: "扩展包版本不存在",
  ADDON_ALREADY_EXISTS: "扩展包 '{id}@{version}' 已存在",
  ADDON_IN_USE: "不能删除当前世界正在使用的扩展包，请先禁用",
  ADDON_VERSION_IN_USE: "不能删除当前世界正在使用的扩展包版本",
  ADDON_OVERWRITE_SAME: "源版本和目标版本相同",
  ADDON_FORK_FAILED: "分支创建失败",
  ADDON_COPY_EXISTS: "目标版本已存在",
  ADDON_COPY_NOT_FOUND: "源版本不存在",
  ADDON_OVERWRITE_FAILED: "覆盖失败",
  ADDON_META_UPDATED: "扩展包信息已更新",
  ADDON_CREATED: "扩展包已创建",
  ADDON_DELETED: "扩展包已删除",
  ADDON_VERSION_DELETED: "扩展包版本已删除",
  ADDON_OVERWRITTEN: "已复制 {source} → {target}",

  // --- Tags ---
  TAG_EMPTY: "标签不能为空",
  TAG_ALREADY_EXISTS: "标签 '{tag}' 已存在",
  TAG_NOT_FOUND: "标签 '{tag}' 不存在",
  TAG_ADDED: "标签已添加",
  TAG_DELETED: "标签已删除",

  // --- Validation ---
  VALIDATION_ID_EMPTY: "ID 不能为空",
  VALIDATION_ID_INVALID: "ID 不能包含 '{separator}'",
  FIELD_REQUIRED: "缺少必填项",

  // --- Asset ---
  FILE_NOT_FOUND: "文件不存在",
  ASSET_INVALID_FOLDER: "无效的文件夹类型",
  ASSET_UNSUPPORTED_TYPE: "不支持的文件类型: {ext}",
  ASSET_MISSING_OWNER: "上传封面需要指定 worldId 或 addonId",
  ASSET_NO_ADDON: "没有可用的扩展包用于上传",

  // --- Character-specific ---
  CHARACTER_CANNOT_FREEZE_PLAYER: "请先切换玩家角色后再冻结该角色",
};

/**
 * Translate a backend error code + params into a localized message.
 * Returns the translated string, or null if the code is unknown.
 */
export function translateError(
  error: string,
  params?: Record<string, unknown>,
): string | null {
  const template = ERROR_MESSAGES[error];
  if (!template) return null;

  // Resolve {entity} param to Chinese name
  const resolvedParams: Record<string, string> = {};
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (k === "entity" && typeof v === "string") {
        resolvedParams[k] = ENTITY_NAMES[v] ?? v;
      } else {
        resolvedParams[k] = String(v);
      }
    }
  }

  // Interpolate {key} placeholders
  return template.replace(/\{(\w+)\}/g, (_, key) => resolvedParams[key] ?? `{${key}}`);
}
