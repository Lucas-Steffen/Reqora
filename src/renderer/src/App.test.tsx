import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  createMemorySearchRepository,
  demoRecords,
  type SearchRecord,
  type SearchRepository,
  type SearchResult,
} from "../../search";
import App from "./App";
import { HISTORY_KEY, historyKey, OPTIONS_KEY } from "./preferences";

const searchbox = () =>
  screen.getByRole("searchbox", { name: "Search project" });
const selectedResource = () =>
  within(screen.getByRole("region", { name: "Selected resource" }));
const results = () =>
  within(screen.getByRole("region", { name: "Project search results" }));

describe("Project search workspace", () => {
  it("focuses with Ctrl/Cmd+K, navigates results, opens the selected resource, and remembers on Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    await selectedResource().findByRole("heading", { name: "List users" });
    await user.keyboard("{Control>}k{/Control}");
    expect(searchbox()).toHaveFocus();
    await user.type(searchbox(), "/v1/users/42");
    await waitFor(() => expect(results().getAllByRole("option")).toHaveLength(2));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(
      selectedResource().getByRole("heading", { name: "Update user" }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    expect(searchbox()).toHaveValue("");
    expect(
      results().getByRole("button", { name: "/v1/users/42" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Focus workspace" }));
    await user.keyboard("{Meta>}k{/Meta}");
    expect(searchbox()).toHaveFocus();
    expect(JSON.parse(localStorage.getItem(historyKey("commerce"))!)).toEqual([
      "/v1/users/42",
    ]);
  });

  it("opens a match and reveals a collapsed ancestor in the collection", async () => {
    const user = userEvent.setup();
    render(<App />);
    const folder = await screen.findByRole("button", { name: "Orders" });
    await user.click(folder);
    expect(folder).toHaveAttribute("aria-expanded", "false");
    await user.type(searchbox(), "create-order");
    const match = await results().findByRole("option");
    await user.click(match);
    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(
      selectedResource().getByRole("heading", { name: "Create order" }),
    ).toBeVisible();
  });

  it("supports filter-only search with status, tag exclusion, and maintainer categories", async () => {
    const user = userEvent.setup();
    render(<App />);
    await selectedResource().findByRole("heading", { name: "List users" });
    await user.click(
      screen.getByRole("button", { name: "Choose search fields" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Draft" }));
    await waitFor(() => expect(results().getAllByRole("option")).toHaveLength(1));
    expect(results().getByRole("option")).toHaveTextContent("Cancel order");
    expect(searchbox()).toHaveValue("");
    await user.click(screen.getByRole("checkbox", { name: "commerce" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Exclude selected tags" }),
    );
    await results().findByRole("heading", {
      name: "No resources match these filters",
    });
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await user.click(screen.getByRole("checkbox", { name: "Alex Morgan" }));
    await waitFor(() =>
      expect(results().getAllByRole("option").length).toBeGreaterThan(0),
    );
    const expected = demoRecords.filter(
      (record) => record.maintainer === "Alex Morgan",
    ).length;
    expect(results().getAllByRole("option")).toHaveLength(expected);
  });

  it("restores validated search fields and metadata preferences after remount", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      OPTIONS_KEY,
      JSON.stringify({
        fields: ["name", "unsafe-field"],
        kinds: ["api", "unsafe-kind"],
        filters: [
          { key: "status", values: ["Released", 99] },
          { key: "unsupported", values: ["unsafe"] },
        ],
      }),
    );
    const first = render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Choose search fields" }),
    );
    expect(screen.getByRole("checkbox", { name: "Name" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "URL path" }),
    ).not.toBeChecked();
    expect(
      await screen.findByRole("checkbox", { name: "Released" }),
    ).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "URL path" }));
    first.unmount();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Choose search fields" }),
    );
    expect(screen.getByRole("checkbox", { name: "URL path" })).toBeChecked();
    expect(
      await screen.findByRole("checkbox", { name: "Released" }),
    ).toBeChecked();
    const stored = JSON.parse(localStorage.getItem(OPTIONS_KEY)!);
    expect(stored.fields).toEqual(["name", "path"]);
    expect(stored.kinds).toEqual(["api"]);
    expect(stored.filters).toEqual([
      { key: "status", values: ["Released"], exclude: false },
    ]);
  });

  it("waits for IME composition and ignores composition Enter/Escape events", async () => {
    const repository = createMemorySearchRepository(demoRecords);
    const search = vi.spyOn(repository, "search");
    render(<App repository={repository} />);
    fireEvent.compositionStart(searchbox());
    fireEvent.change(searchbox(), { target: { value: "users" } });
    fireEvent.keyDown(searchbox(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(searchbox(), { key: "Escape", isComposing: true });
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(search).not.toHaveBeenCalled();
    expect(searchbox()).toHaveValue("users");
    expect(JSON.parse(localStorage.getItem(historyKey("commerce"))!)).toEqual([]);
    fireEvent.compositionEnd(searchbox());
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await results().findAllByRole("option");
  });

  it("keeps the latest result when an earlier asynchronous request completes late", async () => {
    let resolveOld!: (results: SearchResult[]) => void;
    const stale: SearchRecord = {
      id: "old",
      kind: "doc",
      name: "Old response",
      breadcrumbs: [],
    };
    const current: SearchRecord = {
      id: "new",
      kind: "doc",
      name: "Current response",
      breadcrumbs: [],
    };
    const repository: SearchRepository = {
      getAll: async () => [stale, current],
      search: vi.fn((query: string) =>
        query === "old"
          ? new Promise<SearchResult[]>((resolve) => {
              resolveOld = resolve;
            })
          : Promise.resolve([{ record: current, matches: [], ancestors: [] }]),
      ),
    };
    render(<App repository={repository} />);
    fireEvent.change(searchbox(), { target: { value: "old" } });
    await waitFor(() => expect(repository.search).toHaveBeenCalledTimes(1));
    fireEvent.change(searchbox(), { target: { value: "new" } });
    await results().findByRole("option", { name: /Current response/ });
    await act(async () => {
      resolveOld([{ record: stale, matches: [], ancestors: [] }]);
      await Promise.resolve();
    });
    expect(
      results().queryByRole("option", { name: /Old response/ }),
    ).not.toBeInTheDocument();
    expect(
      results().getByRole("option", { name: /Current response/ }),
    ).toBeVisible();
  });

  it("highlights a later tag using repository field offsets and renders markup as text", async () => {
    const markup = "<img src=x onerror=alert(1)>";
    const records: SearchRecord[] = [
      {
        id: "safe",
        kind: "doc",
        name: markup,
        breadcrumbs: [],
        tags: ["first", "second"],
      },
    ];
    render(<App repository={createMemorySearchRepository(records)} />);
    fireEvent.change(searchbox(), { target: { value: "second" } });
    const option = await results().findByRole("option");
    expect(option.querySelector("mark")).toHaveTextContent("second");
    expect(option).toHaveTextContent(markup);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    fireEvent.change(searchbox(), {
      target: { value: "<script>unsafe</script>" },
    });
    await results().findByRole("heading", {
      name: "No matches for “<script>unsafe</script>”",
    });
    expect(document.querySelector("script")).not.toBeInTheDocument();
  });

  it("clears history and recovers from malformed or unavailable browser storage", async () => {
    const user = userEvent.setup();
    localStorage.setItem(OPTIONS_KEY, "{broken");
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(["users", "users", null, "orders"]),
    );
    render(<App />);
    // Pre-multi-project global history migrates to the active project.
    expect(await results().findByRole("button", { name: "users" })).toBeVisible();
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
    expect(results().getByRole("button", { name: "orders" })).toBeVisible();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    await user.click(screen.getByRole("button", { name: "Clear history" }));
    expect(
      results().queryByRole("button", { name: "users" }),
    ).not.toBeInTheDocument();
    await user.type(searchbox(), "users");
    await results().findAllByRole("option");
    await user.keyboard("{Enter}");
    expect(
      selectedResource().getByRole("heading", { name: "Users" }),
    ).toBeVisible();
  });
});
