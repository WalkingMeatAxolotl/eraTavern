# TraitGroup（特质组）

将特质分组管理，可设置互斥（同组只能拥有一个特质）。

## 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 英文标识符，下划线命名（如 `gender`） |
| name | string | ✅ | 中文显示名称 |
| category | string | ✅ | 所属分类 key（必须与组内特质的 category 一致） |
| traits | array | | 特质 ID 列表（完整 ID，如 `["Base.male", "Base.female"]`） |
| exclusive | boolean | | 是否互斥（默认 false）— 互斥组中角色只能拥有一个特质 |

## traits 字段说明

`traits` 是一个**字符串数组**，包含属于该组的特质 ID 列表。

**重要：修改 traits 时，必须传入完整的数组值（整体替换），不是追加。**

例如，已有 `traits: ["Base.male", "Base.female"]`，要添加 `Base.other`：
- ✅ 正确：`{"traits": ["Base.male", "Base.female", "Base.other"]}`
- ❌ 错误：`{"traits": ["Base.other"]}`（这会丢失原有的 male 和 female）

如果要往现有 traits 列表中添加/删除元素，先用 `get_entities` 获取当前完整数据，再构建新的完整列表传入。

## category 分类

category 的值必须从系统 template 定义的分类 key 中选取，且必须与组内特质的 category 一致。
使用 `get_schema(entityType: "trait")` 查看可用的 category 值。

## 示例

```json
{
  "id": "gender",
  "name": "性别",
  "category": "sexTrait",
  "traits": ["Base.male", "Base.female"],
  "exclusive": true
}
```

互斥组（`exclusive: true`）：角色只能拥有组内的一个特质。
非互斥组（`exclusive: false`）：角色可以同时拥有组内的多个特质。
