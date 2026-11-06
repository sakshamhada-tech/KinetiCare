# KinetiCare — Test Plan

Maps every section-5/9 requirement to at least one test. Status column: planned / implemented.

## 9.1 Unit tests (Vitest, packages/shared)

| ID  | Requirement                  | Test                                                                                                                                                    | Status  |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| U1  | Vector/angle math            | 90/180/0/45 known geometries                                                                                                                            | planned |
| U2  | Angle math                   | degenerate/zero vectors, NaN/Infinity safety, symmetry                                                                                                  | planned |
| U3  | One-Euro filter              | constant signal stays constant; step response; jitter reduction on noisy sine (seeded); param validation                                                | planned |
| U4  | Synthetic landmark generator | parametric squat + shoulder ER frames, 33 landmarks, given FPS, optional valgus/asymmetry, seeded RNG deterministic                                     | planned |
| U5  | Rep state machine            | counts N clean reps exactly; no double-count under noise within hysteresis; ignores partial reps below min ROM; pauses; mid-rep tracking dropout; reset | planned |
| U6  | Fault detectors              | valgus TP when offset > threshold, TN when below; each fault TP/TN; threshold boundary tests                                                            | planned |
| U7  | Fatigue indicators           | declining ROM/velocity set yields indicators; stable set yields none                                                                                    | planned |
| U8  | Report validator             | accepts grounded text, rejects hallucinated numbers, tolerates rounding                                                                                 | planned |
| U9  | Feedback throttling          | cooldown logic with injected clock                                                                                                                      | planned |

## 9.2 Component tests (React Testing Library, apps/web)

| ID  | Requirement     | Test                                                                                  | Status  |
| --- | --------------- | ------------------------------------------------------------------------------------- | ------- |
| C1  | Screen states   | each screen renders loading / empty / error / populated                               | planned |
| C2  | Form validation | forms validate and surface errors accessibly                                          | planned |
| C3  | Live session UI | scripted ReplayPoseSource stream → rep counter, fault banner, ARIA live announcements | planned |

## 9.3 API / integration tests (apps/server)

| ID  | Requirement     | Test                                                                                                                                     | Status  |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| I1  | Every endpoint  | happy path, validation errors, 404s, pagination, error envelope                                                                          | planned |
| I2  | DB              | migrations fresh + upgrade; FK/constraint behavior                                                                                       | planned |
| I3  | ReportGenerator | mocked Ollama: success, malformed JSON, timeout, 500, model-not-found, hallucinated numbers → retry → fallback; asserts stored generator | planned |
| I4  | Live Ollama     | skipped with explicit logged reason if Ollama unreachable; real run if available                                                         | planned |

## 9.4 End-to-end tests (Playwright, apps/web)

| ID  | Requirement   | Test                                                                                                                                                                                                               | Status  |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| E1  | Golden path   | create patient → assign routine → start session → replay 8-squat fixture (3 valgus) → correct count + valgus cues → end + pain rating → summary matches → generate report (mock/template) → edit → review → export | planned |
| E2  | Wiring/crawl  | every route + nav item + primary button; fail on dead links, unhandled rejections, console errors, unexpected 4xx/5xx                                                                                              | planned |
| E3  | Privacy       | zero non-local requests; no image/base64/frame data in any body; no video/frames in IndexedDB/localStorage/sessionStorage                                                                                          | planned |
| E4  | Offline       | network blocked except localhost; pose WASM + model load from local assets                                                                                                                                         | planned |
| E5  | Resilience    | camera denied, camera unplugged mid-session, tab hidden, backend down (error + retry), Ollama down (template fallback labeled)                                                                                     | planned |
| E6  | Accessibility | axe on every screen; keyboard-only golden path                                                                                                                                                                     | planned |
| E7  | Visual        | screenshots every screen light/dark × desktop/tablet/mobile → artifacts/screenshots/                                                                                                                               | planned |

## 9.5 Quality gates

- Coverage ≥90% lines/branches: engine, rep machine, faults, validator; ≥80% server.
- `tsc --noEmit` clean; ESLint 0 errors + 0 warnings; Prettier clean.
- Prod build succeeds; bundle has no test-only code paths, no external URLs.
- `npm run verify`: `npm ci` → typecheck → lint → format → unit+component tests w/ coverage → API/integration → prod build → bundle sanity → E2E (all projects) → `npm audit --omit=dev`.
