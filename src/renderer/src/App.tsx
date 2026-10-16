import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Database,
  FileJson,
  FileText,
  Folder,
  Layers3,
  ListFilter,
  LoaderCircle,
  Search,
  Settings2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  createMemorySearchRepository,
  fieldText,
  SEARCH_FIELDS,
  type SearchField,
  type SearchKind,
  type SearchOptions,
  type SearchRecord,
  type SearchRepository,
  type SearchResult,
} from "../../search";
import {
  HISTORY_KEY,
  OPTIONS_KEY,
  readHistory,
  readOptions,
  rememberQuery,
  savePreference,
} from "./preferences";
import MetadataFilters from "./MetadataFilters";
import ImportDialog from "./ImportDialog";
import { defaultImportGateway, type ImportGateway } from "./importGateway";
import { defaultWorkspaceRepository, useWorkspace } from "./workspaceClient";
import type { WorkspaceRepository } from "../../workspace/repository";
import { toSearchRecords } from "../../workspace/records";
import { activeProject, replaceProject } from "../../workspace/types";

const kindLabels: Record<SearchKind, string> = {
  api: "APIs",
  folder: "Folders",
  schema: "Schemas",
  doc: "Docs",
  case: "Test cases",
  response: "Responses",
};
const kindSingular: Record<SearchKind, string> = {
  api: "API endpoint",
  folder: "Folder",
  schema: "Schema",
  doc: "Documentation",
  case: "Test case",
  response: "Response",
};
const kindIcons = {
  api: Code2,
  folder: Folder,
  schema: FileJson,
  doc: FileText,
  case: Check,
  response: Layers3,
};
const kinds = Object.keys(kindLabels) as SearchKind[];

function RecordIcon({ record }: { record: SearchRecord }): ReactNode {
  if (record.kind === "api")
    return (
      <span className={`method method-${record.method?.toLowerCase()}`}>
        {record.method ?? "API"}
      </span>
    );
  const Icon = kindIcons[record.kind];
  return (
    <span className={`record-icon icon-${record.kind}`}>
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}

function Highlight({
  value,
  result,
  field,
}: {
  value: string;
  result: SearchResult;
  field: SearchField;
}): ReactNode {
  const matches = result.matches
    .filter((match) => match.field === field)
    .sort((a, b) => a.start - b.start);
  if (!matches.length) return value;
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of matches) {
    if (match.start < offset) continue;
    parts.push(
      value.slice(offset, match.start),
      <mark key={`${match.start}-${match.end}`}>
        {value.slice(match.start, match.end)}
      </mark>,
    );
    offset = match.end;
  }
  parts.push(value.slice(offset));
  return <>{parts}</>;
}

interface AppProps {
  /** Overrides workspace-backed search (used by search-only tests). */
  repository?: SearchRepository;
  workspaceRepository?: WorkspaceRepository;
  importGateway?: ImportGateway;
}

export default function App({
  repository: searchOverride,
  workspaceRepository,
  importGateway,
}: AppProps): ReactNode {
  const [workspaceStore] = useState(
    () => workspaceRepository ?? defaultWorkspaceRepository(),
  );
  const [gateway] = useState(() => importGateway ?? defaultImportGateway());
  const workspaceState = useWorkspace(workspaceStore);
  const project = workspaceState.workspace
    ? activeProject(workspaceState.workspace)
    : null;
  const [workspaceSearch] = useState(() => createMemorySearchRepository([]));
  const repository = searchOverride ?? workspaceSearch;
  const [recordsVersion, setRecordsVersion] = useState(0);
  const [importOpen, setImportOpen] = useState<{ file?: File } | null>(null);
  const [notice, setNotice] = useState("");
  const [records, setRecords] = useState<SearchRecord[]>([]);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchOptions>(readOptions);
  const [history, setHistory] = useState(readHistory);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "example">(
    "overview",
  );
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const requestVersion = useRef(0);
  const resultsId = useId();
  const hasQuery =
    !!query.trim() ||
    !!options.filters?.some((filter) => filter.values.length > 0) ||
    options.kinds.length !== kinds.length;
  const selected =
    records.find((record) => record.id === selectedId) ??
    records.find((record) => record.kind === "api") ??
    records[0];
  const visibleResults = hasQuery ? results : [];
  const apiCount = records.filter((record) => record.kind === "api").length;
  const fieldCount = options.fields.length;
  const rootRecord = records.find((record) => !record.parentId);
  const childrenOf = useMemo(() => {
    const map = new Map<string, SearchRecord[]>();
    for (const record of records) {
      if (!record.parentId) continue;
      map.set(record.parentId, [...(map.get(record.parentId) ?? []), record]);
    }
    return map;
  }, [records]);

  // Feed the workspace into the pure search module whenever it changes.
  useEffect(() => {
    if (searchOverride || !project) return;
    workspaceSearch.replaceRecords(toSearchRecords(project));
    setRecordsVersion((value) => value + 1);
  }, [project, searchOverride, workspaceSearch]);

  useEffect(() => {
    if (workspaceState.error) setError(workspaceState.error);
  }, [workspaceState.error]);

  useEffect(() => {
    if (!searchOverride && !recordsVersion) return;
    let disposed = false;
    repository
      .getAll()
      .then((items) => {
        if (!disposed) setRecords(items);
      })
      .catch(() => {
        if (!disposed)
          setError("The workspace could not be loaded. Please restart Reqora.");
      });
    return () => {
      disposed = true;
    };
  }, [repository, recordsVersion, searchOverride]);

  useEffect(() => {
    savePreference(HISTORY_KEY, history);
  }, [history]);
  useEffect(() => {
    savePreference(OPTIONS_KEY, options);
  }, [options]);

  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setActiveIndex(0);
    setResults([]);
    setError("");
    if (!hasQuery || isComposing) {
      setIsSearching(false);
      return () => controller.abort();
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      repository
        .search(query, options, controller.signal)
        .then((items) => {
          if (
            version === requestVersion.current &&
            !controller.signal.aborted
          ) {
            setResults(items);
            setIsSearching(false);
          }
        })
        .catch((reason: unknown) => {
          if (
            version === requestVersion.current &&
            !controller.signal.aborted
          ) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Search could not finish. Try again.",
            );
            setIsSearching(false);
          }
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, options, repository, hasQuery, isComposing, recordsVersion]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent): void {
      if (event.isComposing || isComposing || event.keyCode === 229) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (event.key === "Escape") {
        setQuery("");
        setShowSettings(false);
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isComposing]);

  function commitQuery(value = query): void {
    setHistory((previous) => rememberQuery(previous, value));
  }
  function openRecord(record: SearchRecord): void {
    setSelectedId(record.id);
    setActiveTab("overview");
    setCollapsed((previous) =>
      previous.filter((id) => !findAncestors(record).includes(id)),
    );
  }
  function findAncestors(record: SearchRecord): string[] {
    const found: string[] = [];
    let parentId = record.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      found.push(parentId);
      parentId = records.find((item) => item.id === parentId)?.parentId;
    }
    return found;
  }
  function openResult(result: SearchResult): void {
    commitQuery();
    openRecord(result.record);
  }
  function inputKeys(event: KeyboardEvent<HTMLInputElement>): void {
    if (isComposing || event.nativeEvent.isComposing || event.keyCode === 229)
      return;
    if (event.key === "Enter") {
      event.preventDefault();
      commitQuery();
      if (visibleResults[activeIndex]) openResult(visibleResults[activeIndex]);
      return;
    }
    if (!visibleResults.length || !["ArrowDown", "ArrowUp"].includes(event.key))
      return;
    event.preventDefault();
    const next =
      event.key === "ArrowDown"
        ? (activeIndex + 1) % visibleResults.length
        : (activeIndex - 1 + visibleResults.length) % visibleResults.length;
    setActiveIndex(next);
    resultRefs.current[next]?.scrollIntoView?.({ block: "nearest" });
  }
  function renderTreeItem(record: SearchRecord, depth: number): ReactNode {
    const indent = { paddingLeft: `${10 + depth * 14}px` };
    if (record.kind !== "folder")
      return (
        <button
          key={record.id}
          className={`tree-record ${selected?.id === record.id ? "selected" : ""}`}
          style={depth ? { paddingLeft: `${30 + depth * 14}px` } : undefined}
          onClick={() => openRecord(record)}
        >
          <RecordIcon record={record} />
          <span>{record.name}</span>
        </button>
      );
    const isCollapsed = collapsed.includes(record.id);
    const children = childrenOf.get(record.id) ?? [];
    return (
      <div className="tree-group" key={record.id}>
        <button
          className={`tree-folder ${selected?.id === record.id ? "selected" : ""}`}
          style={depth ? indent : undefined}
          onClick={() => {
            setCollapsed((value) =>
              value.includes(record.id)
                ? value.filter((id) => id !== record.id)
                : [...value, record.id],
            );
            openRecord(record);
          }}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <Folder size={14} />
          <span>{record.name}</span>
        </button>
        {!isCollapsed &&
          [
            ...children.filter((child) => child.kind !== "folder"),
            ...children.filter((child) => child.kind === "folder"),
          ].map((child) => renderTreeItem(child, depth + 1))}
      </div>
    );
  }
  async function commitImport(next: typeof project, summary: string): Promise<void> {
    if (!next) return;
    await workspaceState.update((workspace) => replaceProject(workspace, next));
    setImportOpen(null);
    setNotice(summary);
  }
  function toggleField(field: SearchField): void {
    setOptions((previous) => ({
      ...previous,
      fields: previous.fields.includes(field)
        ? previous.fields.filter((item) => item !== field)
        : [...previous.fields, field],
    }));
  }
  function toggleKind(kind: SearchKind): void {
    setOptions((previous) => ({
      ...previous,
      kinds: previous.kinds.includes(kind)
        ? previous.kinds.filter((item) => item !== kind)
        : [...previous.kinds, kind],
    }));
  }

  return (
    <div
      className="app-shell"
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer?.files?.[0];
        if (file && project && !importOpen) setImportOpen({ file });
      }}
    >
      <nav className="activity-bar" aria-label="Primary navigation">
        <div className="brand-mark" aria-label="Reqora">
          r<span>•</span>
        </div>
        <button
          className="rail-button"
          title="Focus workspace"
          aria-label="Focus workspace"
          onClick={() => document.getElementById("workspace-tree")?.focus()}
        >
          <Layers3 size={21} />
        </button>
        <button
          className="rail-button active"
          title="Search project (Ctrl+K)"
          aria-label="Search project"
          onClick={() => inputRef.current?.focus()}
        >
          <Search size={21} />
        </button>
        <div className="rail-spacer" />
        <button
          className="rail-button"
          title="Search settings"
          aria-label="Search settings"
          onClick={() => setShowSettings((value) => !value)}
        >
          <Settings2 size={20} />
        </button>
        <div className="avatar" aria-label="Local workspace">
          LS
        </div>
      </nav>

      <aside className="workspace-sidebar">
        <div className="workspace-header">
          <span className="workspace-symbol">
            <Layers3 size={17} />
          </span>
          <div>
            <strong>Personal workspace</strong>
            <span>Local collection</span>
          </div>
        </div>
        <div className="sidebar-section-label">
          PROJECT <span className="local-dot" title="Stored locally" />
        </div>
        <div className="project-title">
          <span className="project-icon">
            {(project?.name ?? rootRecord?.name ?? "P").slice(0, 1)}
          </span>
          <div>
            <strong>{project?.name ?? rootRecord?.name ?? "Project"}</strong>
            <span>{apiCount} endpoints</span>
          </div>
          <button
            className="icon-button"
            title="Import OpenAPI / Swagger"
            aria-label="Import OpenAPI / Swagger"
            disabled={!project}
            onClick={() => setImportOpen({})}
          >
            <Upload size={15} />
          </button>
        </div>
        <button
          className="sidebar-search"
          onClick={() => inputRef.current?.focus()}
        >
          <Search size={15} /> Search project <kbd>⌃ K</kbd>
        </button>
        <div
          id="workspace-tree"
          className="workspace-tree"
          tabIndex={-1}
          aria-label="Workspace files"
        >
          <div className="tree-heading">
            COLLECTION <span>{records.length}</span>
          </div>
          {rootRecord &&
            (childrenOf.get(rootRecord.id) ?? []).map((record) =>
              renderTreeItem(record, 0),
            )}
        </div>
        <div className="sidebar-footer">
          <span className="local-dot" /> All changes are local <span>v0.1</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <span>{project?.name ?? rootRecord?.name ?? "Project"}</span>
            <ChevronRight size={13} />
            <strong>Search</strong>
          </div>
          <span className="prototype-badge">
            <span /> LOCAL PROTOTYPE
          </span>
        </header>
        <section className="search-workspace" aria-labelledby="search-title">
          <div className="search-heading">
            <div>
              <div className="eyebrow">YOUR WORKSPACE, CONNECTED</div>
              <h1 id="search-title">
                Find your next endpoint<span>.</span>
              </h1>
              <p>Search APIs, schemas, and docs across your project.</p>
            </div>
            <span className="heading-decoration">
              <Search size={29} strokeWidth={1.4} />
            </span>
          </div>

          <div className="search-controls">
            <div className="search-input-wrap">
              <Search size={21} aria-hidden="true" />
              <label className="sr-only" htmlFor="project-search">
                Search project
              </label>
              <input
                id="project-search"
                ref={inputRef}
                type="search"
                autoComplete="off"
                spellCheck={false}
                placeholder="Search by name, URL, tag, or ID…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={inputKeys}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                aria-controls={resultsId}
                aria-activedescendant={
                  hasQuery && visibleResults.length
                    ? `${resultsId}-${activeIndex}`
                    : undefined
                }
              />
              {query ? (
                <button
                  className="clear-query"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <X size={17} />
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
              <span className="input-divider" />
              <button
                className={`filter-button ${showSettings ? "selected" : ""}`}
                aria-label="Choose search fields"
                aria-expanded={showSettings}
                onClick={() => setShowSettings((value) => !value)}
              >
                <ListFilter size={19} />
                <span>{fieldCount} fields</span>
              </button>
            </div>
            {showSettings && (
              <div className="settings-panel">
                <fieldset className="field-settings">
                  <legend>Search in</legend>
                  {SEARCH_FIELDS.map((field) => (
                    <label key={field.value}>
                      <input
                        type="checkbox"
                        checked={options.fields.includes(field.value)}
                        onChange={() => toggleField(field.value)}
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                  <p>Matches any selected field. Search is case-insensitive.</p>
                </fieldset>
                <MetadataFilters
                  records={records}
                  options={options}
                  onChange={setOptions}
                />
              </div>
            )}
            <div className="scope-row">
              <span className="scope-label">INCLUDE</span>
              <button
                className={`scope-chip ${options.kinds.length === kinds.length ? "selected" : ""}`}
                onClick={() =>
                  setOptions((previous) => ({ ...previous, kinds: [...kinds] }))
                }
                aria-pressed={options.kinds.length === kinds.length}
              >
                Everything
              </button>
              {kinds.map((kind) => (
                <button
                  key={kind}
                  className={`scope-chip ${options.kinds.includes(kind) && options.kinds.length !== kinds.length ? "selected" : ""}`}
                  onClick={() => toggleKind(kind)}
                  aria-pressed={options.kinds.includes(kind)}
                >
                  {kindLabels[kind]}
                </button>
              ))}
            </div>
            {!!options.filters?.length && (
              <div
                className="active-filters"
                aria-label="Active metadata filters"
              >
                {options.filters.map((filter) => (
                  <button
                    key={filter.key}
                    aria-label={`Remove ${filter.key} filter`}
                    onClick={() =>
                      setOptions((previous) => ({
                        ...previous,
                        filters: previous.filters?.filter(
                          (item) => item.key !== filter.key,
                        ),
                      }))
                    }
                  >
                    {filter.key === "tags" && filter.exclude
                      ? "Exclude tags"
                      : filter.key[0].toUpperCase() + filter.key.slice(1)}
                    : {filter.values.join(", ")}
                    <X size={11} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="workspace-panels">
            <section
              className="results-panel"
              aria-label="Project search results"
            >
              <div className="panel-title">
                <span>{hasQuery ? "SEARCH RESULTS" : "START EXPLORING"}</span>
                <span className="count-badge" role="status" aria-live="polite">
                  {isSearching
                    ? "Searching…"
                    : hasQuery
                      ? `${results.length} ${results.length === 1 ? "result" : "results"}`
                      : `${records.length} resources`}
                </span>
              </div>
              {error ? (
                <div className="empty-state" role="alert">
                  <CircleHelp size={26} />
                  <h2>Search needs a moment</h2>
                  <p>{error}</p>
                </div>
              ) : isSearching || isComposing ? (
                <div className="empty-state loading">
                  <LoaderCircle size={27} />
                  <p>Searching your workspace…</p>
                </div>
              ) : hasQuery ? (
                <>
                  {(!!query.trim() && !options.fields.length) ||
                  !options.kinds.length ? (
                    <div className="empty-state">
                      <ListFilter size={27} />
                      <h2>Choose where to search</h2>
                      <p>
                        Select at least one field and one resource type to find
                        a match.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setShowSettings(true)}
                      >
                        Open search fields <ArrowUpRight size={13} />
                      </button>
                    </div>
                  ) : !results.length ? (
                    <div className="empty-state">
                      <Search size={28} />
                      <h2>
                        {query.trim()
                          ? `No matches for “${query.trim()}”`
                          : "No resources match these filters"}
                      </h2>
                      <p>
                        Try a shorter name, URL path, or tag. Search matches the
                        complete phrase you enter.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setOptions({
                            fields: SEARCH_FIELDS.map((field) => field.value),
                            kinds: [...kinds],
                          });
                          setShowSettings(false);
                        }}
                      >
                        Reset fields and filters <ArrowUpRight size={13} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="result-list"
                      id={resultsId}
                      role="listbox"
                      aria-label="Search matches"
                    >
                      {results.map((result, index) => (
                        <button
                          key={result.record.id}
                          id={`${resultsId}-${index}`}
                          ref={(element) => {
                            resultRefs.current[index] = element;
                          }}
                          role="option"
                          aria-selected={index === activeIndex}
                          className={`result-item ${index === activeIndex ? "active" : ""} ${result.record.id === selected?.id ? "opened" : ""}`}
                          onClick={() => {
                            setActiveIndex(index);
                            openResult(result);
                          }}
                          onFocus={() => setActiveIndex(index)}
                          onKeyDown={(event) => {
                            if (
                              event.key === "ArrowDown" ||
                              event.key === "ArrowUp"
                            ) {
                              event.preventDefault();
                              const next =
                                (index +
                                  (event.key === "ArrowDown" ? 1 : -1) +
                                  results.length) %
                                results.length;
                              setActiveIndex(next);
                              resultRefs.current[next]?.focus();
                            }
                          }}
                        >
                          <div className="result-main">
                            <RecordIcon record={result.record} />
                            <strong>
                              <Highlight
                                value={result.record.name}
                                result={result}
                                field="name"
                              />
                            </strong>
                            <ArrowUpRight
                              size={15}
                              className="result-open-icon"
                            />
                          </div>
                          {result.record.path && (
                            <div className="result-path">
                              <Highlight
                                value={result.record.path}
                                result={result}
                                field="path"
                              />
                            </div>
                          )}
                          <div className="result-breadcrumb">
                            <Highlight
                              value={
                                result.record.breadcrumbs.join(" / ") ||
                                "Project root"
                              }
                              result={result}
                              field="folder"
                            />
                          </div>
                          {result.matches.some(
                            (match) =>
                              match.field === "tags" || match.field === "id",
                          ) && (
                            <div className="result-meta">
                              {result.matches.some(
                                (match) => match.field === "tags",
                              ) && (
                                <span>
                                  Tags:{" "}
                                  <Highlight
                                    value={fieldText(result.record, "tags")}
                                    result={result}
                                    field="tags"
                                  />
                                </span>
                              )}
                              {result.matches.some(
                                (match) => match.field === "id",
                              ) && (
                                <span>
                                  ID:{" "}
                                  <Highlight
                                    value={result.record.id}
                                    result={result}
                                    field="id"
                                  />
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="explore-content">
                  {history.length > 0 && (
                    <div className="recent-section">
                      <div className="subsection-heading">
                        <span>Recent searches</span>
                        <button onClick={() => setHistory([])}>
                          Clear history
                        </button>
                      </div>
                      {history.map((item) => (
                        <button
                          className="history-item"
                          key={item}
                          onClick={() => {
                            setQuery(item);
                            inputRef.current?.focus();
                          }}
                        >
                          <Clock3 size={15} />
                          <span>{item}</span>
                          <ArrowUpRight size={13} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="search-tip">
                    <span className="tip-icon">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <h2>A shortcut to your entire API.</h2>
                      <p>
                        Find an endpoint by its URL, a schema by name, or a
                        collection by its folder.
                      </p>
                    </div>
                  </div>
                  <div className="subsection-heading">
                    <span>Try a search</span>
                    <span className="suggestion-label">SAMPLE WORKSPACE</span>
                  </div>
                  <div className="suggestions">
                    {[
                      {
                        query: "users",
                        label: "Find customer endpoints",
                        icon: Code2,
                      },
                      {
                        query: "checkout",
                        label: "Follow the checkout flow",
                        icon: Layers3,
                      },
                      {
                        query: "onboarding",
                        label: "Find a tag across the project",
                        icon: BookOpen,
                      },
                    ].map((item) => (
                      <button
                        key={item.query}
                        onClick={() => {
                          setQuery(item.query);
                          inputRef.current?.focus();
                        }}
                      >
                        <item.icon size={18} />
                        <div>
                          <strong>{item.query}</strong>
                          <span>{item.label}</span>
                        </div>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                  </div>
                  <div className="search-note">
                    <Database size={14} />
                    <span>Synthetic demo data · searched on this device</span>
                  </div>
                </div>
              )}
              <footer className="results-footer">
                <span>
                  <kbd>
                    <ArrowUp size={10} />
                  </kbd>
                  <kbd>
                    <ArrowDown size={10} />
                  </kbd>{" "}
                  navigate
                </span>
                <span>
                  <kbd>↵</kbd> open result
                </span>
                <span>
                  <kbd>esc</kbd> clear
                </span>
              </footer>
            </section>

            <section className="detail-panel" aria-label="Selected resource">
              <div className="panel-title">
                <span>WORKSPACE PREVIEW</span>
                <span className="preview-indicator">
                  <span /> {selected ? kindSingular[selected.kind] : "Loading"}
                </span>
              </div>
              {selected ? (
                <div className="detail-content">
                  <div className="detail-breadcrumb">
                    {selected.breadcrumbs.map((part, index) => (
                      <span key={`${part}-${index}`}>
                        {part}
                        <ChevronRight size={11} />
                      </span>
                    ))}
                  </div>
                  <div className="resource-type">
                    <RecordIcon record={selected} />
                    <span>{kindSingular[selected.kind]}</span>
                  </div>
                  <h2>{selected.name}</h2>
                  <p className="resource-description">
                    {selected.description ||
                      "Explore this resource in your API workspace."}
                  </p>
                  {selected.path && (
                    <div className="endpoint-url">
                      <span
                        className={`http-method method-${selected.method?.toLowerCase()}`}
                      >
                        {selected.method}
                      </span>
                      <code>{selected.path}</code>
                    </div>
                  )}
                  <div
                    className="detail-tabs"
                    role="tablist"
                    aria-label="Resource detail"
                  >
                    <button
                      id="overview-tab"
                      role="tab"
                      aria-selected={activeTab === "overview"}
                      aria-controls="resource-tabpanel"
                      onClick={() => setActiveTab("overview")}
                    >
                      Overview
                    </button>
                    <button
                      id="example-tab"
                      role="tab"
                      aria-selected={activeTab === "example"}
                      aria-controls="resource-tabpanel"
                      onClick={() => setActiveTab("example")}
                    >
                      {selected.kind === "doc" ? "Content" : "Example"}
                    </button>
                  </div>
                  <div
                    id="resource-tabpanel"
                    role="tabpanel"
                    aria-labelledby={
                      activeTab === "overview" ? "overview-tab" : "example-tab"
                    }
                  >
                    {activeTab === "overview" ? (
                      <>
                        <div className="detail-section-heading">
                          RESOURCE DETAILS
                        </div>
                        <dl className="resource-details">
                          <div>
                            <dt>Resource ID</dt>
                            <dd>
                              <code>{selected.id}</code>
                            </dd>
                          </div>
                          <div>
                            <dt>Type</dt>
                            <dd>{kindSingular[selected.kind]}</dd>
                          </div>
                          <div>
                            <dt>Folder</dt>
                            <dd>
                              {selected.breadcrumbs.at(-1) || "Project root"}
                            </dd>
                          </div>
                          <div>
                            <dt>Tags</dt>
                            <dd className="tags">
                              {selected.tags?.length ? (
                                selected.tags.map((tag) => (
                                  <span key={tag}>{tag}</span>
                                ))
                              ) : (
                                <span className="muted">No tags</span>
                              )}
                            </dd>
                          </div>
                        </dl>
                        {selected.content && (
                          <>
                            <div className="detail-section-heading example-heading">
                              {selected.kind === "doc"
                                ? "DOCUMENT PREVIEW"
                                : "EXAMPLE PREVIEW"}
                              <span>
                                {selected.kind === "doc" ||
                                selected.kind === "case"
                                  ? "TEXT"
                                  : "JSON"}
                              </span>
                            </div>
                            <pre className="code-preview">
                              <code>{selected.content}</code>
                            </pre>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="detail-section-heading example-heading">
                          {selected.kind === "doc"
                            ? "DOCUMENT CONTENT"
                            : "SAMPLE CONTENT"}
                          <span>
                            {selected.kind === "doc" || selected.kind === "case"
                              ? "TEXT"
                              : "JSON"}
                          </span>
                        </div>
                        <pre className="code-preview">
                          <code>
                            {selected.content ??
                              "No example is defined for this resource."}
                          </code>
                        </pre>
                      </>
                    )}
                  </div>
                  <div className="detail-note">
                    <CircleHelp size={15} />
                    <p>
                      Search opens the matching resource and reveals its folder
                      in the collection.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <LoaderCircle size={25} />
                  <p>Loading your collection…</p>
                </div>
              )}
            </section>
          </div>
        </section>
        <footer className="statusbar">
          <span>
            <span className="local-dot" /> Local search ready
          </span>
          {notice && (
            <span className="status-notice" role="status">
              {notice}
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                <X size={11} />
              </button>
            </span>
          )}
          <span>
            {project?.name ?? rootRecord?.name}{" "}
            <span className="status-separator">/</span>{" "}
            {records.length} resources{" "}
            <span className="status-separator">/</span> UTF-8
          </span>
        </footer>
      </main>
      {importOpen && project && (
        <ImportDialog
          project={project}
          gateway={gateway}
          initialFile={importOpen.file}
          onCancel={() => setImportOpen(null)}
          onCommit={commitImport}
        />
      )}
    </div>
  );
}
