import type {
  SearchMetadataFilter,
  SearchOptions,
  SearchRecord,
} from "../../search";

interface Props {
  records: SearchRecord[];
  options: SearchOptions;
  onChange: (options: SearchOptions) => void;
}
const categories = [
  { key: "status", label: "Status" },
  { key: "tags", label: "Tags" },
  { key: "maintainer", label: "Maintainer" },
] as const;

export default function MetadataFilters({ records, options, onChange }: Props) {
  function update(
    key: SearchMetadataFilter["key"],
    values: string[],
    exclude = false,
  ): void {
    const remaining = (options.filters ?? []).filter(
      (filter) => filter.key !== key,
    );
    onChange({
      ...options,
      filters: values.length
        ? [...remaining, { key, values, exclude }]
        : remaining,
    });
  }
  return (
    <div className="metadata-settings">
      <div className="metadata-heading">
        <strong>Filter resources</strong>
        <span>Match every category · any selected value</span>
        {!!options.filters?.length && (
          <button onClick={() => onChange({ ...options, filters: [] })}>
            Reset filters
          </button>
        )}
      </div>
      <div className="metadata-categories">
        {categories.map((category) => {
          const filter = options.filters?.find(
            (item) => item.key === category.key,
          );
          const values = [
            ...new Set(
              records.flatMap((record) => {
                const value = record[category.key];
                return Array.isArray(value) ? value : value ? [value] : [];
              }),
            ),
          ].sort();
          return (
            <fieldset key={category.key}>
              <legend>{category.label}</legend>
              <div className="metadata-values">
                {values.map((value) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={filter?.values.includes(value) ?? false}
                      onChange={() =>
                        update(
                          category.key,
                          filter?.values.includes(value)
                            ? filter.values.filter((item) => item !== value)
                            : [...(filter?.values ?? []), value],
                          filter?.exclude,
                        )
                      }
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
              {category.key === "tags" && (
                <label className="exclude-tags">
                  <input
                    type="checkbox"
                    checked={filter?.exclude ?? false}
                    disabled={!filter?.values.length}
                    onChange={(event) =>
                      update("tags", filter?.values ?? [], event.target.checked)
                    }
                  />
                  <span>Exclude selected tags</span>
                </label>
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
