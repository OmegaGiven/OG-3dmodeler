export function serializeDesignTemplate(kind: string, design: object): string {
  return JSON.stringify({ kind, version: 1, design }, null, 2);
}

export function parseDesignTemplate<T extends object>(
  json: string,
  base: T,
  enums: Partial<Record<keyof T, readonly string[]>> = {},
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("That file doesn't look like a template.");
  }
  const record = parsed as Record<string, unknown>;
  const design = record.design && typeof record.design === "object" ? (record.design as Record<string, unknown>) : record;

  const result = { ...base } as Record<string, unknown>;
  const baseRecord = base as Record<string, unknown>;
  for (const key of Object.keys(baseRecord)) {
    const value = design[key];
    const baseValue = baseRecord[key];

    if (typeof baseValue === "number") {
      if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    } else if (typeof baseValue === "boolean") {
      if (typeof value === "boolean") result[key] = value;
    } else if (typeof baseValue === "string") {
      const allowed = enums[key as keyof T];
      if (allowed) {
        if (typeof value === "string" && allowed.includes(value)) result[key] = value;
      } else if (typeof value === "string" && value.trim()) {
        result[key] = value;
      }
    }
  }
  return result as T;
}
