import {
  DEFAULT_SEARCH_OPTIONS,
  SEARCH_FIELDS,
  type SearchKind,
  type SearchMetadataFilter,
  type SearchOptions,
} from "../../search";

/** Pre-multi-project global history; migrated to the first active project. */
export const HISTORY_KEY = "reqora.search.history.v1";
export const OPTIONS_KEY = "reqora.search.options.v1";
export const SCOPE_KEY = "reqora.search.scope.v1";

export type SearchScope = "project" | "all";

/** Search history is isolated per project. */
export function historyKey(projectId: string): string {
  return `${HISTORY_KEY}:${projectId}`;
}
const kinds: SearchKind[] = [
  "api",
  "folder",
  "schema",
  "doc",
  "case",
  "response",
];

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function readHistory(key: string = HISTORY_KEY): string[] {
  const value = read(key);
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter(
              (item): item is string =>
                typeof item === "string" && !!item.trim(),
            )
            .map((item) => item.trim()),
        ),
      ].slice(0, 10)
    : [];
}

export function rememberQuery(history: string[], query: string): string[] {
  const clean = query.trim();
  if (!clean) return history;
  return [clean, ...history.filter((item) => item !== clean)].slice(0, 10);
}

export function readOptions(): SearchOptions {
  const fallback = {
    fields: [...DEFAULT_SEARCH_OPTIONS.fields],
    kinds: [...DEFAULT_SEARCH_OPTIONS.kinds],
  };
  const value = read(OPTIONS_KEY);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.fields) || !Array.isArray(candidate.kinds))
    return fallback;
  const fields = SEARCH_FIELDS.map((field) => field.value).filter((field) =>
    (candidate.fields as unknown[]).includes(field),
  );
  const selectedKinds = kinds.filter((kind) =>
    (candidate.kinds as unknown[]).includes(kind),
  );
  const metadataKeys = [
    "status",
    "tags",
    "maintainer",
    "creator",
    "latestEditor",
  ];
  const filters: SearchMetadataFilter[] = [];
  if (Array.isArray(candidate.filters)) {
    for (const item of candidate.filters) {
      if (
        !item ||
        typeof item !== "object" ||
        !metadataKeys.includes(item.key) ||
        !Array.isArray(item.values)
      )
        continue;
      const values = [
        ...new Set(
          item.values.filter(
            (value: unknown): value is string =>
              typeof value === "string" && value.length > 0,
          ),
        ),
      ] as string[];
      if (values.length && !filters.some((filter) => filter.key === item.key))
        filters.push({
          key: item.key,
          values,
          exclude: item.key === "tags" && item.exclude === true,
        });
    }
  }
  return { fields, kinds: selectedKinds, filters };
}

/** Moves the legacy global history to a project once, without overwriting existing project history. */
export function migrateLegacyHistory(projectId: string): void {
  try {
    if (localStorage.getItem(HISTORY_KEY) === null) return;
    if (localStorage.getItem(historyKey(projectId)) === null)
      localStorage.setItem(historyKey(projectId), localStorage.getItem(HISTORY_KEY)!);
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* Unavailable storage: nothing to migrate. */
  }
}

export function removePreference(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readScope(): SearchScope {
  return read(SCOPE_KEY) === "all" ? "all" : "project";
}

export function savePreference(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Search remains usable when browser storage is unavailable. */
  }
}
