# KinetiCare

Privacy-first, edge-AI physical therapy copilot — local-first, no cloud calls.

A patient/routine/session tracking system with a kinematics engine (angle math, One-Euro smoothing, rep state machine, form-fault detectors, fatigue indicators), a Fastify + SQLite API, a React + React Router frontend, and AI-assisted report generation with Ollama + deterministic template fallback.

## Monorepo layout

```
kineticare/
├── apps/web/              # React 19 + React Router 8 + Vite frontend
├── apps/server/           # Fastify 5 + better-sqlite3 API
├── packages/shared/       # Shared Zod schemas + kinematics engine
├── e2e/                   # Playwright end-to-end tests
├── docs/                  # Architecture, decisions, dependencies, design, test plan
├── scripts/               # Bundle sanity, mediapipe asset copying
├── package.json           # Root workspace config
└── README.md              # This file
```

Workspaces: `apps/web`, `apps/server`, `packages/shared`

## Core principles

- **Local-first / privacy by design:** The browser never calls Ollama or any external origin. All MediaPipe WASM/assets are self-hosted. Patient names, notes, and report contents are redacted from server logs.
- **No cloud:** Reports are generated server-side via Ollama (`http://127.0.0.1:11434`) with a deterministic `TemplateGenerator` fallback when Ollama is unreachable.
- **Not a medical device:** Every report carries a fixed disclaimer ("Draft - requires clinician review"). This is a prototype/MVP, not clinical software.
- **Type safety:** TypeScript 5.9.3 strict across all three workspaces; shared Zod schemas validate every API request/response.

## Prerequisites

- **Node.js ≥ 22.12.0** (Node 22 Active LTS; `.nvmrc` pins `22`)
- **npm** (comes with Node)
- **Ollama** (optional — for live AI report generation). Download at https://ollama.com and pull a model, e.g. `ollama pull llama3:8b-instruct`. If Ollama is not reachable, the `TemplateGenerator` fallback is exercised automatically and the reason is logged.

## Install & setup (fresh clone)

From the repository root:

```bash
# 1. Install all workspace dependencies (exact pinned versions, commit lockfile)
npm ci

# 2. Copy self-hosted MediaPipe assets into the web app
npm run copy:mediapipe-assets

# 3. Download + checksum-verify the Ollama model task file (one-time, offline after this)
npm run setup:models

# 4. Seed the development database (patients, exercises, routines, thresholds)
npm run db:seed
```

The combined one-liner:

```bash
npm run setup
```

> Note: `better-sqlite3` ships prebuilt binaries for Linux x64. The sandbox blocks `nodejs.org`, so `.npmrc` sets `ignore-scripts=true` to use the bundled prebuilt under `npm ci`. If you are on a different platform and hit a native build error, ensure you have a C toolchain and Python, then run `npm install` without `ignore-scripts`.

## Run the prototype

### Development (frontend + API together)

```bash
npm run dev
```

This starts both workspaces concurrently:
- **Web (Vite dev server):** `http://127.0.0.1:5173`
- **API server (Fastify):** `http://127.0.0.1:8080`

Open `http://127.0.0.1:5173` in your browser.

### Production build

```bash
npm run build
```

This builds the web app (`apps/web/dist`) and compiles the server (`apps/server/dist`).

### Start production server

```bash
npm run start
```

Equivalent to `npm run build && node apps/server/dist/cli.js`. The server reads `DB_PATH` (default `./data/kineticare.db`) and binds to `HOST`/`PORT` (defaults `127.0.0.1:8080`).

## Available npm scripts

| Script | Purpose |
|--------|---------|
| `npm run setup` | Full one-time setup: install + copy assets + setup models + seed DB |
| `npm run dev` | Run web + server in dev mode concurrently |
| `npm run build` | Build web (Vite) + server (tsc) |
| `npm run start` | Build + start production server |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run lint` | ESLint (0 errors + 0 warnings) |
| `npm run format` | Prettier check |
| `npm run test:unit` | Shared engine tests + web component tests |
| `npm run test:api` | Server API/integration tests |
| `npm run test:e2e` | Playwright E2E (skips with logged reason if no browser installed) |
| `npm run bundle:sanity` | Verify prod bundle has no external URLs or test-only code |
| `npm run verify` | Full quality gate: `npm ci` → typecheck → lint → format → unit tests → API tests → build → bundle sanity → E2E → `npm audit --omit=dev` |
| `npm run db:seed` | Seed the SQLite database |
| `npm run db:reset` | Reset the database |

## Configuration (environment variables)

All read by the server via Zod validation (`apps/server/src/index.ts`):

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `8080` | API server port |
| `HOST` | `127.0.0.1` | Bind host (loopback only by default) |
| `APP_ORIGIN` | `http://127.0.0.1:5173` | CORS origin locked to the web app |
| `DB_PATH` | `./data/kineticare.db` | SQLite database file path |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `llama3:8b-instruct` | Ollama model name |
| `OLLAMA_TIMEOUT_MS` | `30000` | Ollama request timeout |

## API reference

Base URL: `http://127.0.0.1:8080` (configurable via `PORT`/`HOST`). All responses use a consistent error envelope: `{ error: { code, message, details? } }`.

### Health

`GET /api/health` → `{ status, service, host, port }`

### Patients

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/patients?page=&page_size=` | — | Paginated patient list |
| `GET` | `/api/patients/:id` | — | Single patient |
| `POST` | `/api/patients` | `{ name, pseudonymous_id, notes? }` | Create patient (409 on duplicate `pseudonymous_id`) |
| `PUT` | `/api/patients/:id` | `{ name?, pseudonymous_id?, notes? }` | Update patient |

### Exercises

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/exercises?page=&page_size=` | — | Paginated exercise list |
| `GET` | `/api/exercises/:id` | — | Single exercise |
| `POST` | `/api/exercises` | `{ key, name, view, target_reps, target_sets }` | Create exercise (seeds threshold version 1) |
| `PUT` | `/api/exercises/:id` | `{ name?, view?, target_reps?, target_sets? }` | Update exercise |
| `PUT` | `/api/exercises/:id/thresholds` | `{ kneeValgusMaxPercent, ... }` | Replace thresholds (new immutable version) |

### Routines

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/routines?page=&page_size=` | — | Paginated routine list |
| `POST` | `/api/routines` | `{ name, items: [{ exercise_id, order_index, sets, reps }] }` | Create routine with items |
| `GET` | `/api/routines/:id/items` | — | Routine items with exercise names |

### Sessions

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/sessions?page=&page_size=` | — | Paginated session list (joins patient/exercise names) |
| `GET` | `/api/sessions/:id` | — | Single session |
| `POST` | `/api/sessions` | Session summary (patient_id, exercise_id, duration_ms, sets[].reps[], ...) | Create session + sets + reps (400 on unknown patient/exercise) |
| `POST` | `/api/sessions/:id/report` | — | Generate a draft report (Ollama → template fallback) |

### Routes index

`GET /api/_routes` → list of registered API paths.

## Data model (SQLite, `apps/server/src/migrations/001__schema.sql`)

- `patients` — id, created_at, name, pseudonymous_id, notes
- `exercises` — id, key, name, view, target_reps, target_sets, created_at, updated_at
- `exercise_threshold_versions` — id, exercise_id, version, thresholds (JSON), created_at
- `routines` — id, name, created_at
- `routine_items` — id, routine_id, exercise_id, order_index, sets, reps
- `patient_routines` — id, patient_id, routine_id, assigned_at
- `sessions` — id, patient_id, routine_id, exercise_id, threshold_version_id, started_at, ended_at, duration_ms, pain_score, rpe, status
- `session_sets` — id, session_id, set_index, started_at, ended_at, reps_count
- `reps` — id, session_set_id, rep_index, started_at, ended_at, duration_ms, min_angle_deg, max_angle_deg, rom_deg, peak_velocity_deg_per_s, faults (JSON)
- `reports` — id, session_id, generator, model, status, content_json, validation_result, created_at
- `fault_events` — id, rep_id, set_index, fault_type, timestamp_ms, cue, value?, threshold?
- `schema_migrations` — version, name, applied_at

## Kinematics engine (`packages/shared/src/engine`)

Pure, framework-free functions with no DOM/React dependency:

- `math.ts` — vector/sub/dot/cross/norm/distance, `angleABC` / `angleABC2d` (0–180°, degenerate-safe, NaN-free), clamp, deg/rad conversion
- `one-euro.ts` — One-Euro adaptive low-pass filter per signal
- `smoothing.ts` — `LandmarkSmoother` (per-landmark, per-coordinate smoothing; missing landmarks pass through)
- `angles.ts` — `jointAngle`, `kneeFlexion`, `elbowFlexion`, `trunkLean`, `frontalPoints` (MediaPipe pose indices)
- `rep-machine.ts` — `RepMachine` state machine (idle → descending → bottom → ascending → complete/abort → idle) with hysteresis, dropout timeout, min ROM/duration
- `faults.ts` — knee valgus, insufficient depth, trunk lean, asymmetry, elbow drift, etc.
- `fatigue.ts` — ROM decline, concentric slowdown, fault rate rise, asymmetry rise
- `synthetic.ts` — deterministic seeded 33-landmark squat / shoulder-ER frame generator for tests

## Testing & quality gates

### Unit tests (Vitest)

Shared engine tests (97 tests): math, One-Euro, rep machine, faults, fatigue, synthetic generator, angles, smoothing, validator smoke.

```bash
npm --prefix packages/shared run test
```

Web component test:

```bash
npm --prefix apps/web run test
```

### API / integration tests (server)

38 tests covering all endpoints, validation errors (400), conflicts (409), not-found (404), pagination, consistent error envelopes, and report generation with mocked Ollama (success / malformed JSON / 500 / 404 / hallucinated numbers → retry → template fallback / unreachable).

```bash
npm --prefix apps/server run test
```

### Coverage gates

| Scope | Lines | Branches | Functions | Statements |
|-------|-------|----------|-----------|------------|
| Shared (engine/rep/faults/validator) | ≥90% | ≥90% | ≥90% | ≥90% |
| Server | ≥80% | ≥80% | ≥80% | ≥80% |

Run with coverage: `npx vitest run --coverage` inside `packages/shared` or `apps/server`.

### E2E (Playwright)

Golden path + privacy/offline/a11y tests live in `e2e/`. Requires a Playwright browser installed:

```bash
npx playwright install chromium
npm run test:e2e
```

If no browser is installed, `test:e2e` skips with a logged reason.

### Full verification

```bash
npm run verify
```

Runs: `npm ci` → typecheck → lint → format → unit tests → API tests → prod build → bundle sanity → E2E → `npm audit --omit=dev`. Must exit 0 from a fresh clone, twice consecutively.

## Project documentation

All in `docs/`:

| File | Contents |
|------|----------|
| `DESIGN.md` | UI/UX design system, palette, color-blind-safe rules, session flow |
| `DECISIONS.md` | Recorded architectural decisions (D1–D15) |
| `DEPENDENCIES.md` | Pinned exact versions table with verification |
| `KINEMATICS.md` | Kinematics engine specification |
| `PLAN.md` | Execution phases (0–8) and task checklist |
| `TEST_PLAN.md` | Test ID → requirement mapping and quality gates |

## Contributing

- Conventional commits (e.g. `feat:`, `fix:`, `docs:`, `test:`)
- Pin exact versions; commit `package-lock.json`; install via `npm ci` (no `--force`, no `--legacy-peer-deps`)
- No placeholders in shipped paths; no weakening/skipping tests
- `npm audit --omit=dev` must be clean
- `@mediapipe/tasks-vision` only (no deprecated `@mediapipe/pose`)

## License

Private prototype. Not a medical device — reports state "Draft - requires clinician review."
