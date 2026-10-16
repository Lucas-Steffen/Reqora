# Plan — OpenAPI/Swagger import

**Status: complete.** All steps done; gate passed (see [validation.md](validation.md)).

1. **Specs:** verify the installed ASAR identity; trace import ingress, parser/converter, folder rules, external references, and update settings. Save exact original snippets/locations and distinguish inferences.
2. **Build domain:** add serializable workspace/request/import models and pure JSON/YAML parsing, bounded reference resolution, conversion, and merge planning. Keep the search module unchanged.
3. **Build desktop adapters:** bounded HTTP(S)/file loaders, scoped references, sender-validated named IPC methods, and atomic workspace persistence. Expose only typed preload methods.
4. **Build UI:** add import file/drop/URL dialog, grouping, preview and explicit merge/overwrite commit. Rebuild the search adapter on workspace revision; render nested folders without losing existing search behavior.
5. **Test:** run focused Vitest suites, existing regression suites, typecheck, production build, existing search smoke, and import Electron smoke with isolated profiles and loopback fixtures.
6. **Review:** independent domain/IPC/UI review, resolve findings, record final validation and impact. Advance to environments only after this gate passes.

Ownership: root handles desktop IO/IPC and integration; domain and UI work may run in parallel after this specification/plan. No later feature is built before this feature passes its gate.
