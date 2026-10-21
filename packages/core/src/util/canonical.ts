/** Deterministic JSON: object keys sorted recursively, `undefined` values dropped. Shared with the signing Worker. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as any)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as any)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
