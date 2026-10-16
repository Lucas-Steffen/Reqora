# Ordered feature implementation

Each feature goes through Specs → Plan → Build → Test → Review → Ship and only moves on once its tests, the Electron smoke checks and the review have passed. Static Apidog facts are kept separate from implementation choices and runtime claims. Every checkpoint is committed and pushed.

| Order | Feature | Current stage | Records |
| --- | --- | --- | --- |
| 1 | OpenAPI/Swagger import | **Done**: tests, build, smoke and review passed | `apidog-import/` |
| 2 | Multiple environments + encrypted secrets | **Built and tested**; review in progress (joint review with 2a/2b) | `apidog-environments/` |
| 2a | Request sending for imported endpoints (root-cause fix) | **Built and tested**; review in progress | `request-sending/` |
| 2b | Unlimited projects + v1→v2 migration | **Built and tested**; review in progress | `projects/` |
| 3 | Pre/post scripts | Not started (evidence collected); waits on 2/2a/2b | `apidog-scripts/` |
| 4 | Authentication | Not started (evidence collected); waits on scripts | `apidog-auth/` |

Items 2a and 2b were inserted at the user's request (2026-10-16), ahead of scripts and authentication. Reqora exists partly because Apidog limits imports to five projects, so Reqora has no project limit.

Tests use original fixtures, mocked providers or loopback servers. They never send API or OAuth requests to third-party services. Search stays pure. Workspace, imports, environment secrets, scripts and authentication sit behind replaceable interfaces.
