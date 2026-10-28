import {
  DEFAULT_SEARCH_OPTIONS,
  SEARCH_FIELDS,
  type SearchKind,
  type SearchMetadataFilter,
  type SearchOptions,
} from "../../search";
import type { ReqoraApi } from "../../shared/api";

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

type PreferencesApi = NonNullable<ReqoraApi["preferences"]>;

/** Prefix of every key this module owns; also what is migrated from browser storage. */
const PREFIX = "reqora.search.";

/**
 * With a desktop backend, preferences live in an in-memory copy of the
 * backend's file, loaded once before the first render; writes update the copy
 * and are persisted in order, newest state last. Without one (browser, tests)
 * they stay in localStorage.
 */
let backend: { cache: Map<string, unknown>; persist(): void } | null = null;
let pending: Promise<void> | null = null;

function getRaw(key: string): string | null {
  if (!backend) return localStorage.getItem(key);
  return backend.cache.has(key) ? JSON.stringify(backend.cache.get(key)) : null;
}

function setRaw(key: string, text: string): void {
  if (!backend) return localStorage.setItem(key, text);
  backend.cache.set(key, JSON.parse(text));
  backend.persist();
}

function removeRaw(key: string): void {
  if (!backend) return localStorage.removeItem(key);
  if (backend.cache.delete(key)) backend.persist();
}

/** The preferences kept in browser storage before they moved to the backend. */
function browserPreferences(): Map<string, unknown> {
  const values = new Map<string, unknown>();
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        values.set(key, JSON.parse(localStorage.getItem(key) ?? "null"));
      } catch {
        /* Unreadable entries were already ignored by the readers. */
      }
    }
  } catch {
    /* Unavailable storage: nothing to migrate. */
  }
  return values;
}

/**
 * Loads the backend's preferences. On the first run with a backend, imports
 * the browser-storage preferences once and saves them; the browser copies are
 * left in place as a backup. If the backend cannot be read, preferences keep
 * using browser storage for this session.
 */
export async function initPreferences(
  api: PreferencesApi | undefined = window.reqora?.preferences,
): Promise<void> {
  if (!api) return;
  let snapshot;
  try {
    snapshot = await api.load();
  } catch {
    return;
  }
  const cache = snapshot.initialized
    ? new Map(Object.entries(snapshot.values))
    : browserPreferences();
  let dirty = false;
  const persist = () => {
    dirty = true;
    pending ??= (async () => {
      while (dirty) {
        dirty = false;
        try {
          await api.save(Object.fromEntries(cache));
        } catch {
          /* Kept in memory; the next change retries. */
        }
      }
      pending = null;
    })();
  };
  backend = { cache, persist };
  if (!snapshot.initialized) {
    persist();
    await pending;
  }
}

/** Resolves once every pending preference write has reached the backend. */
export async function flushPreferences(): Promise<void> {
  while (pending) await pending;
}

/** Test hook: back to browser storage. */
export function resetPreferences(): void {
  backend = null;
  pending = null;
}

function read(key: string): unknown {
  try {
    return JSON.parse(getRaw(key) ?? "null");
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
    if (getRaw(HISTORY_KEY) === null) return;
    if (getRaw(historyKey(projectId)) === null)
      setRaw(historyKey(projectId), getRaw(HISTORY_KEY)!);
    removeRaw(HISTORY_KEY);
  } catch {
    /* Unavailable storage: nothing to migrate. */
  }
}

export function removePreference(key: string): void {
  try {
    removeRaw(key);
  } catch {
    /* ignore */
  }
}

export function readScope(): SearchScope {
  return read(SCOPE_KEY) === "all" ? "all" : "project";
}

export function savePreference(key: string, value: unknown): void {
  try {
    setRaw(key, JSON.stringify(value));
  } catch {
    /* Search remains usable when browser storage is unavailable. */
  }
}
