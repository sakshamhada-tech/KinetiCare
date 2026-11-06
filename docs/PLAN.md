# KinetiCare — Project Plan

**Status:** Phase 0 (recon + planning). See `docs/DECISIONS.md` for recorded decisions and `docs/DEPENDENCIES.md` for the pinned dependency table.

## 1. Product vision (one paragraph)

KinetiCare is a privacy-first, edge-AI physical-therapy copilot. The browser captures webcam video, runs MediaPipe Pose Landmarker entirely client-side (WASM, CPU delegate, self-hosted assets), derives joint angles and rep/form metrics with a pure TypeScript kinematics engine, and gives immediate visual + audio form cues. At session end a numbers-only summary is posted to a local Node/Fastify + SQLite backend; a local LLM (Ollama, localhost only) or a deterministic template drafts a clinical progress note. Raw video frames never leave the tab; no third-party network calls at runtime; backend binds to 127.0.0.1 by default. Not a medical device — decision support for a licensed clinician.

## 2. Architecture

```
Browser (apps/web)                    Node (apps/server)              Local LLM
----------------                    ------------------              ---------
Camera -> PoseSource (iface)        Fastify REST API                  Ollama (127.0.0.1:11434)
   |- LiveCameraPoseSource          |- /api/health                     ^  (server calls only)
   '- ReplayPoseSource (test only)  |- /api/exercises                  |
   |                                |- /api/patients                   |
   v One-Euro smoothing             |- /api/routines                   |
Landmark frames                     |- /api/sessions                   |
   v                                |- /api/sessions/:id/report ------+- ReportGenerator
Kinematics engine (pure TS)         |                                |- OllamaGenerator
   v (angles, faults, rep SM)       SQLite                            '- TemplateGenerator (fallback)
Rep state machine + fault detectors |- exercises, thresholds
   v                                |- patients, sessions, sets,
Feedback overlay + speechSynthesis  |- reps, fault_events, reports
   v                                '- migrations
Session summary (numbers only) -----> POST /api/sessions
```

**Key boundaries**

- `PoseSource` abstraction: pipeline consumes landmark frames from an interface; live camera and recorded-landmark replay both implement it → deterministic CI testing without a real person.
- Kinematics engine is pure, framework-free, in `packages/shared/src/engine`: functions take landmark arrays + thresholds + timestamps and return angles/faults. No DOM, React, timers, or clocks inside (time passed in).
- Shared contracts: zod schemas + inferred TS types in `packages/shared/src/schemas` are the single source of truth for API payloads and DB row shapes; web and server both import `@kineticare/shared`.
- Config over constants: angle thresholds, hysteresis bands, smoothing params, fatigue parameters come from the exercise definition (DB-backed, seeded), not hardcoded in components.
- Privacy: no raw frames persisted/transmitted; no external origins at runtime; backend 127.0.0.1 by default; CSP `default-src 'self'`.

## 3. Folder tree

```
KinetiCare/
├── package.json                 # root workspace, verify script, engines
├── .npmrc                       # save-exact=true
├── .nvmrc                       # "22"
├── .eslintrc.mjs / eslint.config.mjs   # flat config, zero warnings allowed
├── .prettierrc
├── tsconfig.base.json
├── vitest.config.ts             # root workspace project for engine/shared tests
├── playwright.config.ts         # 3 projects: desktop, tablet, mobile
├── docs/                        # PLAN, DECISIONS, DEPENDENCIES, KINEMATICS, API, DESIGN, DESIGN_REVIEW, TEST_PLAN, PRIVACY
├── scripts/
│   ├── copy-mediapipe-assets.js # copy self-hosted WASM from package -> apps/web/public/mediapipe
│   ├── setup-models.js          # download checksum-verified pose_landmarker task model
│   ├── seed-db.js               # seed exercises/routines/thresholds
│   └── reset-db.js              # dev DB reset
├── apps/
│   ├── web/
│   │   ├── package.json         # React 19 + Vite + RTL + design system
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── public/              # mediapipe/ WASM + .task model (gitignored model)
│   │   │   └── mediapipe/
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── router.tsx
│   │   │   ├── store/           # Zustand stores
│   │   │   ├── api/             # generated fetch client from shared schemas
│   │   │   ├── components/      # design-system + page components
│   │   │   │   ├── ui/          # primitive UI (button, input, card, …)
│   │   │   │   ├── session/     # live session: camera, overlay, feedback
│   │   │   │   └── layout/      # app shell, nav
│   │   │   ├── engine/          # re-export of @kineticare/shared engine + wiring
│   │   │   ├── features/        # dashboard, patients, routines, reports, settings
│   │   │   └── lib/             # utils, privacy self-check, zod fetch wrapper
│   │   └── __tests__/           # component tests (RTL)
│   └── server/
│       ├── package.json         # Fastify + better-sqlite3 + zod + tsx
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts         # HTTP entry (127.0.0.1), env validation (zod)
│       │   ├── db.ts            # better-sqlite3 connection, migrations, FKs
│       │   ├── migrations/      # forward-only SQL migrations
│       │   ├── routes/          # /api/... route modules
│       │   ├── services/        # ReportGenerator, OllamaGenerator, TemplateGenerator, validator
│       │   ├── seed.ts          # seed script
│       │   └── lib/             # logger (sanitized), error envelope
│       └── __tests__/           # API + integration tests (fastify inject + msw fake Ollama)
└── packages/
    └── shared/
        ├── package.json         # @kineticare/shared (no build; TS src entry)
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts
        │   ├── schemas.ts        # zod schemas + inferred types (single source of truth)
        │   ├── engine/           # pure kinematics (math, filter, SM, detectors, fatigue)
        │   │   ├── math.ts
        │   │   ├── one-euro.ts
        │   │   ├── angles.ts
        │   │   ├── rep-machine.ts
        │   │   ├── faults.ts
        │   │   ├── fatigue.ts
        │   │   └── synthetic.ts  # seeded parametric landmark generator (test util)
        │   └── synthetic.ts re-exported only in test mode
        └── __tests__/           # engine unit tests (Vitest)
```

## 4. Data model (SQLite, forward-only migrations)

`patients(id, created_at, name, pseudonymous_id, notes)` — pseudonym ID default, minimal PII.
`exercises(id, key, name, view, target_reps, target_sets, created_at, updated_at)` — seeded squat + shoulder ER.
`exercise_threshold_versions(id, exercise_id, version, thresholds_json, created_at)` — immutable snapshots so past sessions keep the thresholds they were evaluated against.
`routines(id, name, created_at)`, `routine_items(id, routine_id, exercise_id, order_index, sets, reps)`.
`patient_routines(id, patient_id, routine_id, assigned_at)`.
`sessions(id, patient_id, routine_id, exercise_id, threshold_version_id, started_at, ended_at, duration_ms, pain_score, rpe, status)`.
`session_sets(id, session_id, set_index, started_at, ended_at, reps_count, rom_min, rom_max, ...)`.
`reps(id, session_set_id, rep_index, started_at, ended_at, duration_ms, min_angle, max_angle, rom, peak_velocity, faults_json)`.
`fault_events(id, rep_id, set_index, fault_type, timestamp_ms, cue)`.
`reports(id, session_id, generator, model, status, content_json, validation_result, created_at, reviewed_at, reviewed_by)`.

FKs enforced, indexes on `sessions(patient_id)`, `reps(session_set_id)`, `fault_events(rep_id)`, `reports(session_id)`. ISO-8601 UTC timestamps.

## 5. API contract (versioned under /api, zod-validated)

Error envelope: `{ error: { code, message, details? } }`. CORS locked to app origin. Request-size limits.

- `GET /api/health`
- `GET /api/exercises` (list, paginated), `GET /api/exercises/:id`, `PUT /api/exercises/:id/thresholds` (validated, creates new threshold version)
- `GET /api/patients` + `POST`, `GET/PUT /api/patients/:id`
- `GET /api/routines` + `POST`, `GET /api/routines/:id`
- `GET /api/sessions` (list, paginated), `POST /api/sessions` (numbers-only summary), `GET /api/sessions/:id`
- `POST /api/sessions/:id/report` → report; `GET /api/reports/:id`; `PUT /api/reports/:id/review`; `GET /api/reports/:id/export.md`
- `GET /api/settings/system` + Ollama diagnostics
  See `docs/API.md` for full OpenAPI-style doc.

## 6. State machines

**Rep state machine** (per rep): `idle -> descending -> bottom -> ascending -> top -> (rep complete -> idle)`.

- Hysteresis bands on the primary angle prevent double counting.
- Minimum rep duration enforced; aborted/partial reps below min ROM discarded.
- Tracking dropout mid-rep: rep marked incomplete, faults not manufactured.
- Each completed rep record: duration, peak/min angles, ROM, peak velocity, faults raised.

**Session flow:** `patient select -> routine select -> camera check -> countdown -> active set(s) -> rest -> summary -> report -> review`. Supports pause/resume/end-early; tab visibility loss and camera disconnect handled without data loss.

**Report generation:** `request -> OllamaGenerator (structured JSON, validated against grounding rules) -> retry once -> TemplateGenerator fallback`. Stored with `generator` + `status`; "Draft - requires clinician review".

## 7. Test plan (mapped in docs/TEST_PLAN.md)

| Layer           | Tool                  | Scope                                                                                                                           |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unit            | Vitest                | math, One-Euro, rep machine, faults, fatigue, synthetic generator, report validator, feedback throttling                        |
| Component       | React Testing Library | screen states, form validation, session UI from scripted ReplayPoseSource stream                                                |
| API/integration | fastify inject + msw  | all endpoints, migrations, FKs, Ollama success/malformed/timeout/500/hallucination→fallback                                     |
| Live Ollama     | Vitest                | skipped with logged reason if Ollama unreachable                                                                                |
| E2E             | Playwright            | golden path, route/button crawl, privacy (zero external requests, no frames stored), offline, resilience, axe a11y, screenshots |

Coverage gates: ≥90% lines/branches for engine, rep machine, faults, validator; ≥80% server; `tsc --noEmit` clean; ESLint zero errors + zero warnings; Prettier clean.

## 8. Task checklist (execution phases)

- [x] Phase 0 — Recon: env check, package version verification, PLAN/DECISIONS/DEPENDENCIES/DESIGN docs, commit
- [ ] Phase 1 — Foundations: monorepo workspaces, tooling (TS/Vite/Vitest/ESLint/Prettier/Playwright), shared schemas, `verify` skeleton
- [ ] Phase 2 — Engine (test-first): math, One-Euro, synthetic generator, rep state machine, fault detectors, fatigue, validator
- [ ] Phase 3 — Backend: SQLite, migrations, seed, Fastify API, report generators, mocked-Ollama + live tests
- [ ] Phase 4 — Frontend shell: design tokens, layout shell, routing, core components, data layer
- [ ] Phase 5 — Live session: camera, PoseSource impls, MediaPipe overlay, feedback, session flow, persistence
- [ ] Phase 6 — Summary, reports, settings, privacy panel, print/PDF export
- [ ] Phase 7 — E2E, a11y, privacy/offline tests, screenshot review loop, UI polish to DESIGN.md
- [ ] Phase 8 — Hardening: `npm run verify` from fresh clone twice, fix root causes

Each phase ends with a conventional commit.
