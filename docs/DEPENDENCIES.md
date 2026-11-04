# KinetiCare — Dependencies

Pinned exact versions (save-exact). Verified against the live npm registry at build time with `npm view <pkg> version` (and `npm view <pkg> deprecated` / engines). No alpha/beta/rc/canary. Table updated as packages are installed.

| Package                 | Workspace       | Pinned version | Used for                                | Verified (date / command)                                        |
| ----------------------- | --------------- | -------------- | --------------------------------------- | ---------------------------------------------------------------- |
| react                   | web             | —              | UI framework                            | —                                                                |
| react-dom               | web             | —              | DOM rendering                           | —                                                                |
| react-router            | web             | —              | client-side routing                     | —                                                                |
| vite                    | web             | —              | build/dev server                        | 8.3.5 via `npm view vite version`                                |
| @vitejs/plugin-react    | web             | —              | React HMR/plugin                        | 6.2.1 via `npm view @vitejs/plugin-react version`                |
| vitest                  | web + shared    | —              | unit/component tests                    | 5.1.0 via `npm view vitest version` (engines ok on Node 22.22.3) |
| @testing-library/react  | web             | —              | component tests                         | 16.3.3 via `npm view @testing-library/react version`             |
| jsdom                   | web             | —              | DOM for tests                           | 30.1.3 via `npm view jsdom version`                              |
| typescript              | root            | 5.9.3          | typecheck (decision D2)                 | 5.9.3 = latest 5.x via `npm view typescript@5 version`           |
| zustand                 | web             | —              | session state store                     | —                                                                |
| react-router            | web             | —              | routing                                 | 8.5.1 via `npm view react-router version`                        |
| lucide-react            | web             | —              | icons                                   | 1.67.0 via `npm view lucide-react version`                       |
| recharts                | web             | —              | charts                                  | 3.10.1 via `npm view recharts version`                           |
| tailwindcss             | web             | —              | utility layer (tokens on top)           | 4.3.4 via `npm view tailwindcss version`                         |
| postcss                 | web             | —              | tailwind peer                           | 8.5.32                                                           |
| autoprefixer            | web             | —              | tailwind peer (v4 peer)                 | 10.6.2                                                           |
| fontsource-inter        | web             | —              | self-hosted UI font (Inter)             | 4.0.0 via `npm view fontsource-inter version`                    |
| fontsource-fira-code    | web             | —              | self-hosted tabular font                | 4.0.0 via `npm view fontsource-fira-code version`                |
| @mediapipe/tasks-vision | web             | —              | PoseLandmarker CV (WASM, self-hosted)   | 1.2.2 via `npm view @mediapipe/tasks-vision version`             |
| zod                     | shared + server | —              | schemas + validation                    | 4.6.7 via `npm view zod version`                                 |
| fastify                 | server          | —              | HTTP API framework                      | 5.12.8 via `npm view fastify version`                            |
| better-sqlite3          | server          | —              | SQLite (native, engines node>=22)       | 13.0.3 via `npm view better-sqlite3 version`                     |
| tsx                     | server (dev)    | —              | run TS server in dev                    | 4.23.15 via `npm view tsx version`                               |
| @types/node             | root            | —              | Node types                              | 26.6.6 via `npm view @types/node version`                        |
| @types/react            | web (dev)       | —              | React types                             | 19.3.0 via `npm view @types/react version`                       |
| @types/react-dom        | web (dev)       | —              | React DOM types                         | 19.3.0 via `npm view @types/react-dom version`                   |
| @types/better-sqlite3   | server (dev)    | —              | better-sqlite3 types                    | 9.6.0 via `npm view @types/better-sqlite3 version`               |
| @axe-core/playwright    | web (dev)       | —              | accessibility E2E checks                | 4.14.0 via `npm view @axe-core/playwright version`               |
| playwright              | web (dev)       | —              | E2E browser tests                       | 1.64.1 via `npm view playwright version`                         |
| msw                     | web (dev)       | —              | mocked Ollama HTTP server for API tests | 3.0.3 via `npm view msw version`                                 |
| supertest               | server (dev)    | —              | alt HTTP assertions                     | 7.3.1 via `npm view supertest version`                           |
| eslint                  | root (dev)      | —              | lint (flat config)                      | —                                                                |
| prettier                | root (dev)      | —              | formatting                              | —                                                                |

Deprecation check: `npm view <pkg> deprecated` returned empty for @vitejs/plugin-react, playwright, msw, recharts. TypeScript 7.0.2 not deprecated but not used (see D2). better-sqlite3 engines `{ node: '>=22' }` — compatible with Node 22.22.3. vitest engines `^22.12.0 || ^24.0.0 || >=26.0.0` — compatible.

Version-pinning note: exact versions (no `^`/`~`) are filled in below once `npm install --save-exact` is run in Phase 1.
