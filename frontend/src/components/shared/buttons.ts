import b from "./buttons.module.css";

type BtnType = "default" | "neutral" | "create" | "danger" | "primary" | "add" | "del";
type BtnSize = "sm" | "md" | "lg";

/**
 * Button className helper — replaces the old `btn()` style factory.
 *
 * @example btnClass()              // default lg
 * @example btnClass("create", "md") // green md
 * @example btnClass("del", "sm")    // red sm
 */
export function btnClass(type: BtnType = "default", size: BtnSize = "lg"): string {
  return `${b.btn} ${b[size]} ${b[type]}`;
}
