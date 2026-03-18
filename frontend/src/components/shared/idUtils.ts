/** Strip addon namespace prefix from a dotted ID. */
export function toLocalId(nsId: string): string {
  const dot = nsId.indexOf(".");
  return dot >= 0 ? nsId.slice(dot + 1) : nsId;
}
