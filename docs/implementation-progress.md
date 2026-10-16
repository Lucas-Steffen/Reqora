# Ordered feature implementation

Requested workflow: Specs → Plan → Build → Test → Review. Features advance only after the preceding feature's tests, Electron smoke checks, and review pass. Static Apidog facts are kept apart from implementation choices and runtime claims.

| Order | Feature | Current stage | Evidence and stage records |
| --- | --- | --- | --- |
| 1 | OpenAPI/Swagger import | Specs and Plan; artifact investigation in progress | `apidog-import/` |
| 2 | Multiple environments | Not started; gated on import | `apidog-environments/` |
| 3 | Pre/post scripts | Not started; gated on environments | `apidog-scripts/` |
| 4 | Authentication | Not started; gated on scripts | `apidog-auth/` |

Tests must use original fixtures, mocked providers, or loopback servers. They must not send API or OAuth requests to third-party services. Search stays pure; workspace, imports, environment secrets, scripts, and authentication use replaceable interfaces.
