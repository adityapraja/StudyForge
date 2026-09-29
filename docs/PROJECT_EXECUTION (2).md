# Study Habit Tracker — Project Execution Plan (for AI agents)

This file tells an AI coding agent how to build the Study Habit Tracker **one phase at a time**, testing each phase before moving on. It is derived from two source documents that must be present in the repo under `docs/`:

- `docs/prd.md` — the product PRD (features, priorities, acceptance criteria)
- `docs/architecture.md` — the Architecture & Tech Stack PRD (stack, data model, flows, test cases). Section numbers below (for example "arch §9") refer to this document.

If a detail is missing from this file, look it up in those two documents. If it is missing from both, do not invent it: log it in `docs/BLOCKERS.md` and follow the rules below.

---

## 1. Rules for the agent (read first, follow always)

1. **One phase at a time.** Work only on the first phase in the Status table that is not `DONE`. Never start phase N+1 until every exit criterion of phase N is met.
2. **Build, then test, then verify.** For each phase: do the Build tasks, write the listed tests, run the Verify commands, then tick the Exit criteria. A phase is done only when all commands pass and all boxes are ticked.
3. **Tests for trust rules come first.** Where a phase says `TDD`, write the failing test before the code (time accuracy, streaks, XP, anti-cheat, privacy).
4. **Do not break earlier phases.** Run the full test suite (`pnpm test:all`) at the end of every phase. A failing older test is a regression: fix it before continuing.
5. **Stay inside the phase.** Do not add features from later phases. Do not build the non-goals (video rooms, website blocking, calendar sync, group whiteboards, group challenges, flashcards).
6. **Backend is Node.js + Express only**, TypeScript strict. No other backend language or framework.
7. **No secrets in the repo.** Configuration comes from environment variables; keep `.env.example` current.
8. **Log decisions.** Any deviation from the source documents, and any choice you had to make, goes into `docs/DECISIONS.md` with the reason (one short entry each).
9. **Stop when blocked.** If something needs a human (credentials, a product decision, a real device, a cluster), write it to `docs/BLOCKERS.md`, finish everything else in the phase, and stop with a clear message. Do not guess and do not skip the test that needs it.
10. **Commit at the end of each phase** with the message `phase-N: <title>` and tag it `phase-N-done`. Update the Status table and tick the checkboxes in this file in the same commit.
11. **Report at the end of each phase:** what was built, test results (counts passed), anything deferred, and the next phase.

### Prompt to start or resume work

> Read `PROJECT_EXECUTION.md`, `docs/prd.md` and `docs/architecture.md`. Find the first phase not marked DONE and execute only that phase, following the rules in section 1. Run the Verify commands and finish with the phase report.

---

## 2. Status

Update this table as phases finish. Allowed values: `TODO`, `IN PROGRESS`, `BLOCKED`, `DONE`.

| Phase | Title | Release group | Status |
| --- | --- | --- | --- |
| 0 | Scaffold, tooling and CI | Setup | TODO |
| 1 | Backend foundation | Phase 1: tracker | TODO |
| 2 | Accounts, auth and privacy core | Phase 1: tracker | TODO |
| 3 | Subjects and study sessions | Phase 1: tracker | TODO |
| 4 | Worker and session-end pipeline (totals, streaks) | Phase 1: tracker | TODO |
| 5 | Web app foundation and timer UI | Phase 1: tracker | TODO |
| 6 | Offline PWA and sync | Phase 1: tracker | TODO |
| 7 | Planner, goals, exams, notes and Pomodoro | Phase 1: tracker | TODO |
| 8 | Statistics, heatmap, export, themes, sounds | Phase 1: tracker | TODO |
| 9 | **Gate 1**: time is accurate (hardening) | Phase 1: tracker | TODO |
| 10 | Docker, Kubernetes, CI/CD and staging | Phase 1: tracker | TODO |
| 11 | Friends and privacy controls | Phase 2: social | TODO |
| 12 | Rooms and real-time presence (chat optional) | Phase 2: social | TODO |
| 13 | **Gate 2**: anti-cheat and verified sessions | Phase 2: social | TODO |
| 14 | Leaderboards | Phase 3: ranking and AI | TODO |
| 15 | XP, levels and syllabus tracker | Phase 3: ranking and AI | TODO |
| 16 | AI study insights | Phase 3: ranking and AI | TODO |
| 17 | Final hardening and production release | Release | TODO |

Phases 9 and 13 are **gates**: the agent stops after them and waits for a human to review the report before continuing.

---

## 3. Project conventions

### 3.1 Repository layout

```text
study-tracker/
  apps/
    api/                    Express + Socket.IO server (TypeScript)
      src/
        modules/            auth, users, subjects, sessions, planner, syllabus,
                            rooms, friends, leaderboard, stats, progression,
                            insights, exams, export
        realtime/           Socket.IO setup, auth, room handlers
        jobs/               BullMQ queues, workers, pipeline steps
        middleware/         auth, validate, rate-limit, error handler
        lib/                db, redis, logger, config, clock, ids
        server.ts           API entry
        worker.ts           worker entry
      prisma/               schema.prisma and migrations
      test/                 helpers, factories, integration and realtime tests
    web/                    React PWA (Vite)
  packages/
    shared/                 Zod schemas and shared TypeScript types
  deploy/                   Dockerfiles, Helm chart, scripts (from phase 10)
  docs/                     prd.md, architecture.md, DECISIONS.md, BLOCKERS.md
  docker-compose.yml        Postgres + Redis (+ api, worker) for local use
  PROJECT_EXECUTION.md      this file
```

### 3.2 Stack (fixed)

Node.js 22 LTS, Express 5, TypeScript strict, Zod, PostgreSQL 16 with Prisma (raw SQL for heavy aggregates), Redis 7 (ioredis), Socket.IO 4 with Redis adapter, BullMQ, argon2 (argon2id), `openid-client` for Google login, Luxon for time zones, pino, Sentry, Anthropic Node SDK. Frontend: React 18, Vite, TanStack Query, Zustand, Tailwind CSS with CSS-variable tokens, Recharts, vite-plugin-pwa (Workbox), Dexie (IndexedDB). Tests: Vitest, Supertest, Testcontainers, `socket.io-client`, Testing Library, Playwright, `axe-core`, Lighthouse CI, k6. Package manager: pnpm.

### 3.3 Standard commands (created in phase 0; every phase must keep them working)

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run api, worker and web in watch mode |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | Unit and component tests |
| `pnpm test:integration` | API, database, Redis, worker and realtime tests (Testcontainers) |
| `pnpm test:e2e` | Playwright end-to-end tests against the local stack |
| `pnpm test:all` | lint + typecheck + test + test:integration (+ test:e2e from phase 5) |
| `pnpm build` | Build all packages |
| `pnpm db:migrate` | Apply Prisma migrations |

### 3.4 Coding rules

- All times are UTC (`timestamptz`); each user has an IANA time zone; day, week and month boundaries come from Luxon in the user's zone.
- All code reads time from `lib/clock.ts` (injectable), never from `Date.now()` directly in business logic, so tests can freeze and move time.
- IDs are UUID v7. JSON timestamps are ISO 8601 UTC. Lists use cursor pagination.
- Every route validates input with Zod schemas from `packages/shared`. Errors use one shape: `{ "error": { "code": "...", "message": "...", "details": {} } }`.
- Session write endpoints accept an `Idempotency-Key` header.
- Every read of another user's data goes through `canView(viewer, target, field)`.
- No password, token or note text in logs.
- API is under `/api/v1`.

### 3.5 Environment variables (all in `.env.example`)

`NODE_ENV`, `PORT`, `LOG_LEVEL`, `WEB_ORIGIN`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_DOMAIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `INSIGHTS_ENABLED`, `SENTRY_DSN`.

### 3.6 Tunable defaults (keep in one config module, override by environment)

These are the product PRD's proposed defaults. Never hard-code them elsewhere.

| Setting | Default |
| --- | --- |
| Streak minimum per day | 15 minutes (user adjustable) |
| Streak freezes | 1 per week, applied automatically |
| Daily logged-time cap | 16 hours |
| XP cap per session | 4 hours |
| Idle prompt interval / grace | 25 minutes / 5 minutes |
| Clock drift tolerance | 2 minutes |
| Presence TTL / heartbeat | 90 seconds / 30 seconds |
| Room size cap | 200 members |
| Chat message max length | 300 characters |
| Daily goals per day | 1 to 3 |

### 3.7 Definition of done (every phase)

- `pnpm test:all` passes with no skipped tests except those marked `Manual` or `Needs human`.
- New code has tests; services and validators keep at least 80% line coverage.
- `.env.example`, README and `docs/DECISIONS.md` are up to date.
- The Status table and the phase checkboxes are updated and committed.

---

## Phase 0 — Scaffold, tooling and CI

**Goal:** an empty but fully wired monorepo where lint, type-check, tests and CI already run.
**Depends on:** nothing. **Spec:** arch §5, §12b.

### Build

- [ ] Create the pnpm workspace (`apps/api`, `apps/web`, `packages/shared`) with a strict base `tsconfig`.
- [ ] Add ESLint, Prettier, Husky and lint-staged; add the standard commands from 3.3 (commands for not-yet-existing tests may run an empty suite).
- [ ] Add `docker-compose.yml` with `postgres:16` and `redis:7` (append-only on), with health checks.
- [ ] Add `.env.example` and a config loader in `apps/api/src/lib/config.ts` that validates env with Zod and fails fast; include the tunable defaults from 3.6.
- [ ] Add `lib/clock.ts` (injectable clock backed by Luxon) and `lib/ids.ts` (UUID v7).
- [ ] Set up Vitest in each package and a Testcontainers helper that starts Postgres and Redis for integration tests.
- [ ] Add GitHub Actions workflow: install, lint, typecheck, unit, integration (service containers or Testcontainers).
- [ ] Add README (setup, commands) and `docs/` with `prd.md`, `architecture.md`, `DECISIONS.md`, `BLOCKERS.md`.

### Tests to write

- One smoke test per package; a config test (missing env fails with a clear message); a clock test (freeze and advance time); an ids test (UUID v7 sorts by creation time).

### Verify

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
docker compose up -d && docker compose ps    # postgres and redis healthy
pnpm test:integration                          # Testcontainers helper works
```

### Exit criteria

- [ ] All commands above pass locally; the CI workflow file is valid and runs the same steps.
- [ ] `git tag phase-0-done` created.

---

## Phase 1 — Backend foundation

**Goal:** a testable Express app with health checks, error handling, logging, rate limiting and database and Redis connections.
**Depends on:** phase 0. **Spec:** arch §5, §11, §12.

### Build

- [ ] `createApp()` factory (so tests can build the app without listening) and `server.ts` entry.
- [ ] Middleware: request id, pino-http logging (redact secrets), Helmet with strict CSP, CORS allow-list from `WEB_ORIGIN`, JSON body size limit, Zod `validate()` helper, Redis-backed rate limiter, central error handler with the standard error shape.
- [ ] `lib/db.ts` (Prisma client, `prisma` folder initialised) and `lib/redis.ts` (ioredis).
- [ ] `GET /healthz` (process alive) and `GET /readyz` (`SELECT 1` on Postgres and `PING` on Redis).
- [ ] Graceful shutdown: on SIGTERM stop accepting connections, finish in-flight requests, close DB and Redis, exit within 30 seconds.
- [ ] `worker.ts` stub that connects to Redis and idles cleanly.
- [ ] Test helpers: `createTestApp()`, database reset between tests, factory folder.

### Tests to write

- `DEP-02` readyz fails when Postgres is down and recovers.
- `DEP-04` SIGTERM lets an in-flight request finish and exits in time.
- `SEC-04` security headers present.
- Unit: error handler shape; validate middleware returns field errors; rate limiter blocks after the limit.

### Verify

```bash
pnpm test && pnpm test:integration
pnpm --filter api dev &  curl -s localhost:3000/healthz && curl -s localhost:3000/readyz
```

### Exit criteria

- [ ] Health endpoints work; readiness reflects real dependencies.
- [ ] Every error response uses the standard shape.
- [ ] `phase-1-done` tagged.

---

## Phase 2 — Accounts, auth and privacy core

**Goal:** users can register, log in (email or Google), stay logged in securely, edit their profile and delete their account.
**Depends on:** phase 1. **Spec:** arch §7 (users, auth_identities, refresh_tokens), §11.

### Build

- [ ] Prisma models and migration: `users`, `auth_identities`, `refresh_tokens`. Users hold email, password hash, unique username (case-insensitive), IANA time zone, category, privacy settings (JSON), theme, insights opt-in, leaderboard-hidden flag, streak minimum, and XP and level fields (unused until phase 15).
- [ ] Register and login with argon2id; minimum password length check.
- [ ] Access token: JWT, 15 minutes. Refresh token: random value stored hashed, rotated on every use, sent as httpOnly, secure, SameSite cookie; reuse of an old token revokes the whole token family.
- [ ] `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/google` and callback using OIDC with state and PKCE; link to an existing account only by verified email. Make the provider swappable for a mock in tests.
- [ ] CSRF token check on cookie-authenticated write requests.
- [ ] Rate limits on register, login and refresh.
- [ ] `GET/PATCH /me`: username (profanity filter), time zone (validated IANA name), category (default list: school, college, competitive exams, professional), theme, privacy settings, leaderboard opt-out, streak minimum.
- [ ] `canView(viewer, target, field)` in one module with the rules table (visibility: friends, everyone, nobody; blocked users see nothing). Friendship data does not exist yet: accept a `relationship` argument and stub it.
- [ ] `DELETE /me` removes the user in one transaction (cascade).
- [ ] Auth middleware that puts the user on the request.

### Tests to write (TDD for token rotation and `canView`)

- `AUTH-01` register stores argon2id hash. `AUTH-02` duplicate email rejected. `AUTH-03` login rate limit. `AUTH-04` refresh rotates. `AUTH-05` reuse revokes family. `AUTH-06` Google login links by verified email. `AUTH-07` delete account removes all rows.
- `SEC-02` another user's resource refused (test on `/me` variants). `SEC-03` missing CSRF token rejected. `SEC-05` logs contain no passwords or tokens.
- `FRD-05` table-driven `canView` test: every field × every setting × friend, stranger, blocked viewer.

### Verify

```bash
pnpm db:migrate && pnpm test && pnpm test:integration
```

Manual: register, log in, call `/me`, refresh, log out, using `curl` or a REST client.

### Exit criteria

- [ ] All listed tests pass; no password or token appears in logs.
- [ ] `phase-2-done` tagged.

---

## Phase 3 — Subjects and study sessions

**Goal:** the core record. Users create subjects and record accurate study sessions through the API (timer flow and manual entry).
**Depends on:** phase 2. **Spec:** arch §7 (subjects, sessions, session_breaks), §8, §5 API table; prd §4.1.

### Build

- [ ] Models and migration: `subjects` (name, color, optional exam date, unique per user and name), `sessions` (start, end, paused seconds, break seconds, note, source `timer|manual`, verified, client id, zone offset at save), `session_breaks`, `daily_totals` (table only; filled in phase 4). Add check constraints: end after start, non-negative pause and break seconds, maximum session length.
- [ ] Subject CRUD.
- [ ] Session endpoints: `POST /sessions/start`, `/sessions/:id/pause`, `/resume`, `/break`, `/stop`, `GET /sessions/active`, `GET /sessions` (date range, cursor pagination), `POST /sessions/manual`.
- [ ] One open session per user. Overlapping sessions rejected.
- [ ] Study time = end − start − paused − break, stored once at save time.
- [ ] Clock drift check on start and stop: if the client time differs from server time by more than the drift tolerance, use server time and set `verified = false`.
- [ ] Manual entries: `source = manual`, `verified = false`.
- [ ] A pure function `splitByLocalDay(session, zone)` that splits a session across local midnight (used by phase 4).
- [ ] Support `Idempotency-Key` on start, stop and manual.

### Tests to write (TDD for time maths)

- `TMR-02` pause not counted. `TMR-03` break separate. `TMR-06` second open session rejected. `TMR-08` midnight split (unit, include Asia/Kolkata and a DST day in America/New_York). `TMR-09` manual entry flags. `TMR-11` end before start rejected. `TMR-12` subject rename or recolor keeps history. `CHT-04` clock drift marks session unverified.
- Overlap rejection; idempotency-key replay returns the same session.

### Verify

```bash
pnpm test && pnpm test:integration
```

### Exit criteria

- [ ] A full timer flow works through the API: start, pause, resume, break, stop, list.
- [ ] Time maths tests pass across zones and DST.
- [ ] `phase-3-done` tagged.

---

## Phase 4 — Worker and session-end pipeline (totals, streaks)

**Goal:** a background worker that processes each saved session and keeps daily totals and streaks correct. The pipeline is an ordered list of steps so later phases can add steps.
**Depends on:** phase 3. **Spec:** arch §9, §3a data flow; prd §5.3.

### Build

- [ ] BullMQ queue `session.saved`; job id equals session id (idempotent). Enqueue only after the session is committed to Postgres.
- [ ] `worker.ts` runs the pipeline with retries and backoff. Pipeline step interface: `run(context) → result`, steps run in a fixed order.
- [ ] Step 1 `validate` (structure only for now; anti-cheat rules arrive in phase 13). Step 2 `updateDailyTotals`: uses `splitByLocalDay`, writes minutes and verified minutes per local day. Step 3 `updateStreak`.
- [ ] `streaks` table (current, longest, freeze week, freezes used). Rules: a day counts if minutes reach the user's minimum (default 15); one freeze per week is applied automatically the first time a day is missed in that week; a second miss resets the streak; longest streak is kept.
- [ ] Nightly job `rebuildDailyTotals` that recomputes totals from sessions (used for repair and tests).
- [ ] Endpoints: `GET /me/streak`, `GET /stats/today`.
- [ ] Log pipeline duration per job.

### Tests to write (TDD)

- `TMR-07` sum of saved sessions equals the day total, to the minute (add a property test with random sessions over several days and zones).
- `STK-01` 14 vs 15 minutes. `STK-02` custom minimum. `STK-03` freeze used. `STK-04` second miss resets, longest kept. `STK-05` streak across midnight in Asia/Kolkata. `STK-06` DST day.
- Job retried twice produces the same totals and streak (idempotency). `DEP-09` worker killed mid-queue resumes without duplicates.

### Verify

```bash
pnpm test && pnpm test:integration
pnpm --filter api dev   # run api and worker, complete a session by curl, check GET /stats/today
```

### Exit criteria

- [ ] Totals and streaks always match sessions, including retries and rebuilds.
- [ ] Pipeline completes a job in well under 10 seconds locally.
- [ ] `phase-4-done` tagged.

## Phase 5 — Web app foundation and timer UI

**Goal:** a working React app where a user can sign up, create subjects, run a timer and see their session log.
**Depends on:** phase 4. **Spec:** arch §4, §8; prd §4.1.

### Build

- [ ] Vite + React + TypeScript + Tailwind with CSS-variable colour tokens (light and dark defined now, switch UI in phase 8). Router, TanStack Query, Zustand.
- [ ] API client with automatic access-token refresh and CSRF handling; shared Zod types from `packages/shared`.
- [ ] Screens: register, login (email and Google button), app layout with navigation, settings (time zone auto-detected and editable).
- [ ] Subjects manager with colour picker that warns on low contrast.
- [ ] Timer page: timer (countdown) and stopwatch modes, subject picker, start, pause, resume, break, stop. Elapsed time is derived from the start timestamp on every render and on tab focus, never from a ticking counter.
- [ ] Session recovery: on load, restore the open session from the server (`GET /sessions/active`) and keep the timer state in local storage as a fallback.
- [ ] Session log page (list by day) and manual entry form.
- [ ] Set up Playwright with a script that starts the local stack and seeds a user.

### Tests to write

- Component tests with a fake clock: elapsed time correct after a simulated 20-minute background gap; pause and break excluded.
- `TMR-01` E2E: start, study, stop, session saved on the chosen subject. `TMR-04` E2E: refresh mid-session, timer restored. `TMR-05` E2E: background tab, elapsed time matches the clock.

### Verify

```bash
pnpm test && pnpm test:integration && pnpm test:e2e
pnpm dev   # manual: sign up, add subject, run a 2-minute timer, refresh, stop, see the log
```

### Exit criteria

- [ ] A new user can complete the whole timer flow in the browser.
- [ ] E2E tests pass in CI mode (headless).
- [ ] `phase-5-done` tagged.

---

## Phase 6 — Offline PWA and sync

**Goal:** the app installs like a mobile app, the timer works offline, and sessions sync safely when the connection returns.
**Depends on:** phase 5. **Spec:** arch §8 (offline flow); prd §7 Offline.

### Build

- [ ] `vite-plugin-pwa` (Workbox): web manifest, icons, app-shell caching; service worker file served with no-cache.
- [ ] IndexedDB via Dexie: active timer state, queued finished sessions, each with a client-generated UUID (`client_id`).
- [ ] `POST /sessions/sync` accepting a batch. For each item: validate (drift, overlap, length), insert once using the unique (user, client_id) constraint, return per-item results (saved, duplicate, rejected with reason). Offline sessions that pass the same checks as online ones are verified only if timestamps fit the drift limit; otherwise unverified.
- [ ] Client sync triggers: back online, app open, Background Sync where supported. Show pending and synced state in the session log.
- [ ] Enqueue the pipeline job for each newly saved session.

### Tests to write

- `OFF-01` offline session stored locally. `OFF-02` sync on reconnect saves once. `OFF-03` duplicate batch creates one session. `OFF-04` overlap rejected with reason. `OFF-05` installed app opens offline. `OFF-06` drift over 2 minutes saves server time, unverified.
- Lighthouse CI: installable, offline shell works.

### Verify

```bash
pnpm test && pnpm test:integration && pnpm test:e2e   # e2e uses Playwright offline mode
```

Manual (`Needs human`): install the PWA on a real phone, run a session in airplane mode, reconnect.

### Exit criteria

- [ ] Automated offline tests pass; the real-phone check is recorded in `docs/BLOCKERS.md` if not done yet.
- [ ] `phase-6-done` tagged.

---

## Phase 7 — Planner, goals, exams, notes and Pomodoro

**Goal:** the 10-minute daily planner and the focus tools.
**Depends on:** phase 6. **Spec:** arch §5, §7; prd §4.3, §5.1, §5.2, §5.5, §5.6.

### Build

- [ ] Models and migration: `daily_goals`, `tasks`, `exams`; add `note` search support on sessions.
- [ ] Planner API: `GET/PUT /planner/:date` (1 to 3 goals as target minutes plus subject, task list with check-off), `POST /planner/:date/carry-over`, end-of-day review (goals met, tasks done, total time from `daily_totals`, optional reflection note).
- [ ] Daily and weekly hour targets and progress values (`GET/PUT /me/goals`, progress from `daily_totals`).
- [ ] Exams: `GET/POST /exams`, `PATCH/DELETE /exams/:id`; countdown shows days left and required average hours per day when a target total is set.
- [ ] Session notes: one-line prompt when a session ends (optional, skippable); `GET /sessions?q=` search using parameterised queries.
- [ ] UI: planner page, review screen, goal progress rings on the dashboard, exam list and countdown, notes prompt.
- [ ] Pomodoro and custom focus modes: presets 25/5 and 50/10 plus custom lengths; phase-end sound and browser notification; optional auto-start of the next phase; breaks are logged as breaks.

### Tests to write

- `PLN-01` goal limit of 3. `PLN-02` task check-off persists. `PLN-03` review contents. `PLN-04` carry-over. `GOL-01` progress ring matches logged minutes. `EXM-01` days left and required hours. `TMR-10` Pomodoro phases and notification. `SEC-01` injection strings in `?q=` are inert.

### Verify

```bash
pnpm test && pnpm test:integration && pnpm test:e2e
```

### Exit criteria

- [ ] A user can plan a day, run a Pomodoro, finish the day and see the review.
- [ ] `phase-7-done` tagged.

---

## Phase 8 — Statistics, heatmap, export, themes and sounds

**Goal:** progress becomes visible; users can export their data and personalise the app.
**Depends on:** phase 7. **Spec:** arch §7 (`daily_totals` as read model), §11; prd §4.5, §5.4, §5.7, §5.8, §5.9.

### Build

- [ ] Stats API from `daily_totals`: `GET /stats/heatmap?year`, `/stats/progress?range=day|week|month`, `/stats/subjects?range`. Cache per user and year, invalidate on new totals.
- [ ] Calendar heatmap (custom SVG): colour deepens with hours **and** each cell carries a non-colour cue (text value or pattern); keyboard navigable; readable contrast.
- [ ] Progress graphs by day, week and month (Recharts); subject breakdown as pie or bar using each subject's colour; total-time summary cards.
- [ ] `GET /me/export.csv` streaming all sessions with columns date, subject, start, end, duration, note (own data only).
- [ ] Theme switch: light, dark, system; saved to the account (`PATCH /me`).
- [ ] Ambient sounds: rain, white noise, lo-fi, cafe loops with a volume slider; plays during a session; keeps playing while navigating; loops cached by the service worker. Use only royalty-free or self-generated audio and record the licence in `docs/DECISIONS.md` (`Needs human` if none is available).

### Tests to write

- `STA-01` heatmap levels plus non-colour cue. `STA-02` subject breakdown totals equal session sums. `STA-03` theme saved. `AUTH-08` CSV contents and ownership. `PRF-04` full-year heatmap query time (record the baseline).
- Accessibility: `axe-core` on dashboard, timer, planner and settings pages.

### Verify

```bash
pnpm test && pnpm test:integration && pnpm test:e2e
```

### Exit criteria

- [ ] Dashboard shows heatmap, graphs and breakdown from real data; export downloads correctly.
- [ ] No serious `axe` violations.
- [ ] `phase-8-done` tagged.

---

## Phase 9 — Gate 1: time is accurate (hardening)

**Goal:** prove that study time is accurate before anything social is built. **No new features in this phase.**
**Depends on:** phases 0–8. **Spec:** arch §12b quality gates; prd §4.1 acceptance.

### Build

- [ ] Write a randomised accuracy test: generate at least 1,000 sessions across several time zones and DST changes, run them through the pipeline, and assert that every day total equals the sum of its sessions to the minute. Keep it in the suite.
- [ ] Add a soak script that runs timers with paused and break segments and compares stored study time with the expected value.
- [ ] Run the complete E2E suite, `axe-core` on all pages, Lighthouse CI (installable, offline shell, performance budget), dependency audit, and coverage report.
- [ ] Fix every failure found. Remove or repair any flaky test.
- [ ] Write `docs/GATE1_REPORT.md`: test counts, coverage, Lighthouse and axe results, known issues, and the manual checklist below.

### Manual checklist for a human (`Needs human`)

- [ ] Timer keeps correct time in a background tab for 20 minutes on iOS Safari and on Android Chrome.
- [ ] Airplane-mode session syncs correctly on a real phone.
- [ ] Install to home screen works on both.

### Verify

```bash
pnpm test:all
pnpm audit --prod
```

### Exit criteria

- [ ] `TMR-07` and the randomised accuracy test pass; all `TMR`, `OFF`, `STK`, `PLN`, `STA` tests pass; coverage at least 80% on services and validators.
- [ ] No critical or high vulnerabilities.
- [ ] `docs/GATE1_REPORT.md` written. **STOP and wait for human approval before phase 10.**
- [ ] `phase-9-done` tagged after approval.

---

## Phase 10 — Docker, Kubernetes, CI/CD and staging

**Goal:** the app runs in containers and deploys to Kubernetes with a repeatable pipeline.
**Depends on:** phase 9 approved. **Spec:** arch §12, §12a.

### Build

- [ ] `deploy/Dockerfile.api` (multi-stage, Node 22 Alpine, non-root, production dependencies only; one image, two commands: `node dist/server.js` and `node dist/worker.js`) and `deploy/Dockerfile.web` (nginx serving the PWA: hashed assets cached long, `index.html` and the service worker never cached, fallback to `index.html`). Add `.dockerignore`.
- [ ] Extend `docker-compose.yml` with `api`, `worker` and `web` so the whole stack runs with `docker compose up`.
- [ ] Helm chart in `deploy/helm/study-tracker`: Deployments (api, worker, web), Services, Ingress (NGINX, cert-manager, WebSocket-friendly timeouts), ConfigMap and Secret templates, HorizontalPodAutoscaler for api, PodDisruptionBudget, NetworkPolicy (data stores reachable only from api and worker), migration Job as a pre-upgrade hook running `prisma migrate deploy`, probes on `/healthz` and `/readyz`, resource requests and limits, `values-staging.yaml` and `values-prod.yaml`.
- [ ] `/metrics` endpoint (Prometheus format) for latency, socket count and queue depth; structured JSON logs to stdout; Sentry wiring behind `SENTRY_DSN`.
- [ ] GitHub Actions: build images tagged with the commit SHA, scan with Trivy, push to the registry, deploy to staging with `helm upgrade --install --atomic`, run smoke tests, promote the same tags to production on a release tag with manual approval.
- [ ] Smoke test script: `/readyz`, register or login, start and stop a session, socket connect (socket check activates in phase 12).

### Tests to write

- `DEP-01` image runs as non-root with env vars only. `DEP-04` SIGTERM in the container. `DEP-05` migration applied, previous API version still works. `DEP-06` `helm rollback` restores the previous version. `DEP-07` NetworkPolicy blocks other pods.
- `helm lint`, `helm template | kubeconform`, and a full install on a local `kind` cluster with the smoke script.

### Verify

```bash
docker compose up --build -d && ./deploy/scripts/smoke.sh http://localhost:8080
helm lint deploy/helm/study-tracker
kind create cluster && helm install study-tracker deploy/helm/study-tracker -f deploy/helm/study-tracker/values-staging.yaml
./deploy/scripts/smoke.sh <ingress-or-port-forward-url>
```

### Human-required steps (`Needs human`)

- Container registry, staging cluster access and DNS/TLS details. Record what is needed in `docs/BLOCKERS.md` and stop the real staging deploy until they are provided; everything else above must still be completed and tested on `kind`.

### Exit criteria

- [ ] Images build, run as non-root, and pass the smoke test locally and on `kind`.
- [ ] Chart passes lint and schema validation; rollback tested.
- [ ] Pipeline file is complete (staging deploy runs once credentials exist).
- [ ] `phase-10-done` tagged.

---

## Phase 11 — Friends and privacy controls

**Goal:** users can connect with friends and control what others see.
**Depends on:** phase 10 (or phase 9 approved if deployment work is delayed). **Spec:** arch §7 (friendships, blocks), §11; prd §6.3.

### Build

- [ ] Models and migration: `friendships` (requester, receiver, status pending/accepted/blocked; unique on the ordered pair), `blocks`, invite links (token, owner, expiry).
- [ ] API: `POST /friends/requests` (by username or invite link), `PATCH /friends/requests/:id` (accept, decline), `GET /friends` (streak, level, current study status, weekly study minutes), `DELETE /friends/:id`, `POST /blocks`.
- [ ] Replace the `canView` relationship stub with real friendship and block lookups; every endpoint that returns another user's data must use it.
- [ ] Privacy settings UI: visibility of study status and subjects (friends, everyone, nobody).
- [ ] Rate limits on friend requests.
- [ ] UI: friend list, requests inbox, add-by-username, invite link copy, block and remove.

### Tests to write

- `FRD-01` request and accept. `FRD-02` status visibility. `FRD-03` block removes friendship and stops requests. `FRD-04` request flood rate-limited. `FRD-05` `canView` matrix now with real relationships. `SEC-02` no access to a stranger's private data.

### Verify

```bash
pnpm test && pnpm test:integration && pnpm test:e2e
```

### Exit criteria

- [ ] Two test users can befriend, see each other's allowed data, and block each other with correct effects.
- [ ] `phase-11-done` tagged.

---

## Phase 12 — Rooms and real-time presence (chat optional)

**Goal:** study rooms that show who is studying right now, updated within 2 seconds.
**Depends on:** phase 11. **Spec:** arch §6, §7 (rooms), §9; prd §4.2.

### Build

- [ ] Models and migration: `rooms` (name, visibility public/private, join code, owner), `room_members` (role), `reports`.
- [ ] REST: `POST /rooms`, `GET /rooms/:id`, `POST /rooms/join` (private rooms by code or invite link), leave, owner `DELETE /rooms/:id/members/:userId`, `POST /rooms/:id/report`. Room size cap from config. Blocked users cannot join each other's rooms.
- [ ] Socket.IO server in `realtime/`: JWT checked in the handshake; Redis adapter so several API instances share events; WebSocket-only transport. Events: `room.join`, `room.leave`, `presence.update`, `presence.heartbeat`, `member.removed`.
- [ ] Presence in Redis: key `presence:<userId>` with subject, start time and a 90-second TTL, refreshed by a 30-second heartbeat. On session start or stop (from the sessions module), publish `presence.update` to the user's rooms. Respect privacy settings and blocks.
- [ ] Web room page: members list, who is studying, subject and live elapsed time computed on the client from the start timestamp; on reconnect refetch room state over REST, then resume events.
- [ ] Optional sub-step 12b (only after everything above passes): room chat — `chat.send` and `chat.message`, 300-character limit, profanity filter, rate limit. Whether history is stored is an open decision: default to **not stored** and record it in `docs/DECISIONS.md`.
- [ ] Test harness that starts two API instances on one Redis.

### Tests to write

- `RTM-01` start appears to others within 2 seconds. `RTM-02` stop appears within 2 seconds. `RTM-03` heartbeat expiry shows offline. `RTM-04` two instances both deliver. `RTM-05` private room code check. `RTM-06` non-member cannot join channel. `RTM-07` removed member cannot rejoin. `RTM-08` blocked user's presence hidden. `RTM-09` status hidden when set to nobody. `RTM-10` chat limits (if 12b built). `RTM-11` reconnect refetch. `RTM-12` report created.
- `DEP-08` scale api to 3 replicas during a room session (run on `kind`).
- Activate the socket check in `deploy/scripts/smoke.sh`.

### Verify

```bash
pnpm test && pnpm test:integration && pnpm test:e2e   # e2e opens two browser contexts as two users
```

### Exit criteria

- [ ] Two browsers in one room see each other's start and stop within 2 seconds, including across two API instances.
- [ ] `phase-12-done` tagged.

---

## Phase 13 — Gate 2: anti-cheat and verified sessions

**Goal:** make fake study time hard, so rankings can be trusted. Adds the trust rules to the pipeline.
**Depends on:** phase 12. **Spec:** arch §8 (idle check), §9 (anti-cheat rules); prd §7 Anti-cheating.

### Build

- [ ] Client idle detection: periodic "still studying?" prompt (interval and grace from config). Time since the last confirmation is discarded if unanswered after the grace period; the server applies the same discard.
- [ ] Pipeline `validate` step (extend): daily logged-time cap (excess not counted), session length limit, overlap rule, manual entries and drifted sessions unverified, heartbeat-gap flags for sessions that claim to be live.
- [ ] `verified` flag drives `verified_minutes` in `daily_totals`.
- [ ] Nightly anomaly job: flag accounts with unusual patterns (for example many maximum-length days in a row) into a review table; no automatic ban.
- [ ] Collect all limits in `config/anticheat.ts` with the defaults from 3.6.
- [ ] Simulation script `scripts/cheat-sim.ts` that replays cheating scenarios (timer left running, clock skew, overlaps, manual spam) and prints the outcome for each.

### Tests to write (TDD)

- `CHT-01` unanswered idle prompt removes time. `CHT-03` daily cap. `CHT-04` clock drift. `CHT-05` manual entries excluded. `CHT-07` anomaly flag. Also: heartbeat-gap flagging; overlap rejection unchanged.
- (`CHT-02` and `CHT-06`, the XP caps, are written in phase 15 when XP exists.)

### Verify

```bash
pnpm test:all
pnpm tsx scripts/cheat-sim.ts
```

### Exit criteria

- [ ] All `CHT` tests written so far pass; the simulation shows every cheat scenario ends unverified, capped or flagged.
- [ ] `docs/GATE2_REPORT.md` written (rules, results, known gaps). **STOP and wait for human approval before phase 14.**
- [ ] `phase-13-done` tagged after approval.

---

## Phase 14 — Leaderboards

**Goal:** daily, weekly and monthly rankings by category, based on verified time only.
**Depends on:** phase 13 approved. **Spec:** arch §7 (Redis keys), §9 (leaderboard reads); prd §4.4.

### Build

- [ ] Pipeline step `updateLeaderboards`: increment the user's verified minutes in Redis sorted sets `lb:<period>:<category>:<periodKey>` for day, week and month, with the period key computed in the user's time zone. Skip users who opted out. Break ties by who reached the score first (fractional part of the score). Expire finished periods after a grace window.
- [ ] `GET /leaderboards?period=day|week|month&category=&scope=all|friends`: top N plus the caller's own rank (`ZREVRANGE`, `ZREVRANK`); friends-only view reads friend scores from the same set.
- [ ] Nightly job `rebuildLeaderboards` from `daily_totals`.
- [ ] Throttled `leaderboard.tick` socket event (at most every 5 seconds per board).
- [ ] UI: leaderboard page with period tabs, category selector, friends filter, opt-out toggle in settings; show "your rank" even when outside the top N.
- [ ] Note in `docs/DECISIONS.md`: category boards mix time zones because periods follow each user's zone (open decision in arch §14). Keep the behaviour behind one config flag.

### Tests to write

- `LBD-01` update within 1 minute. `LBD-02` category filter. `LBD-03` opt-out. `LBD-04` friends only. `LBD-05` tie-break. `LBD-06` midnight rollover in the user's zone. `LBD-07` Redis flush then rebuild gives identical scores. `LBD-08` only verified minutes count.
- `PRF-03` many sessions ending together: pipeline under 10 seconds each, leaderboard lag under 1 minute (k6 or a script).

### Verify

```bash
pnpm test:all
```

### Exit criteria

- [ ] Leaderboards match `daily_totals` and survive a Redis flush and rebuild.
- [ ] `phase-14-done` tagged.

---

## Phase 15 — XP, levels and syllabus tracker

**Goal:** game-like feedback and syllabus progress, feeding the planner and exams.
**Depends on:** phase 14. **Spec:** arch §9, §7; prd §6.1, §6.2.

### Build

- [ ] Models and migration: `xp_events` (unique per session and kind), `syllabus_topics` (adjacency list: subject, parent, title, status, position), `topic_sessions`.
- [ ] Pipeline step `awardXp` (after `validate`): 1 XP per focused minute; paused and break time earn nothing; per-session XP capped at 4 hours; manual, unverified and idle sessions earn no XP. Bonuses: 50 for meeting the daily goal (once per day), 20 per completed syllabus topic, 10 per streak day, with total bonus per day capped at 100.
- [ ] Level curve as a pure, configurable function. Proposed default: `level = floor(sqrt(totalXp / 50)) + 1` (level 2 at 50 XP, level 3 at 200, level 4 at 450). Record it in `docs/DECISIONS.md`. XP and level are display-only unless the product owner decides otherwise.
- [ ] `GET /me/xp`; show level and XP on the profile, friends list and room member cards.
- [ ] Syllabus API: nested topics per subject, status (not started, in progress, done), attach a topic to a session, paste a plain-text list to import, completion percentage and estimated hours per topic.
- [ ] Planner: suggested tasks from unfinished syllabus topics; exam countdown reads syllabus progress.
- [ ] UI: syllabus tree editor and progress bar per subject.

### Tests to write (TDD for XP rules)

- `XP-01` 60 focused minutes gives 60 XP. `XP-02` daily-goal bonus once even if the job retries. `XP-03` bonus cap of 100. `XP-04` topic completion +20. `XP-05` level thresholds rise. `CHT-02` XP cap for a 5-hour session. `CHT-06` idle session earns nothing. `SYL-01` paste import. `SYL-02` all done shows 100%.

### Verify

```bash
pnpm test:all
```

### Exit criteria

- [ ] XP totals equal the sum of `xp_events`; retries never double-award.
- [ ] `phase-15-done` tagged.

---

## Phase 16 — AI study insights

**Goal:** weekly and monthly insight cards computed by code, optionally phrased by the Anthropic API, always opt-in and always showing their numbers.
**Depends on:** phase 15. **Spec:** arch §10; prd §6.4.

### Build

- [ ] Model and migration: `insights` (unique per user and period key, text, source numbers as JSON, created at).
- [ ] Opt-in during onboarding and a switch in settings; switching off stops jobs for that user.
- [ ] Scheduled job at the end of each user's local week and month, only for opted-in users. It aggregates from `daily_totals`, `sessions`, goals, syllabus progress and exams into a small JSON summary.
- [ ] Rule engine (plain code) that turns the summary into findings with source numbers: best time of day, subject below its plan, days to exam and hours needed per day.
- [ ] **Stage A:** template text for each finding (ships first and always works as the fallback).
- [ ] **Stage B (behind `INSIGHTS_ENABLED`):** `insights/phrase.ts` calls the Anthropic API with the official Node SDK, model from `ANTHROPIC_MODEL`, key from `ANTHROPIC_API_KEY` (worker only). Send aggregates only: no email, username, session notes, room or friend data. Validate that the returned text adds no number that is not in the input; otherwise use the template.
- [ ] Budget controls: one generation per user per period (cache in `insights`), per-user monthly call counter in Redis, global daily spend ceiling that falls back to templates. Retries with backoff, then fall back.
- [ ] `GET /insights?period=`, `POST /insights/plan` ("suggest a plan": structured JSON validated with Zod, user accepts, edits or dismisses; accepted plans become planner goals and tasks), `PUT /me/insights-optin`.
- [ ] System prompt limits output to study-planning advice; no medical or mental-health advice.
- [ ] UI: insight cards with a "numbers behind this" expander; plan suggestion review screen.
- [ ] Tests use a stub Anthropic client; no test calls the real API.

### Tests to write

- `INS-01` no opt-in means no job and no call. `INS-02` cached second run makes no call. `INS-03` source numbers match the database. `INS-04` invented number rejected. `INS-05` API errors fall back. `INS-06` request contains aggregates only. `INS-07` budget exhausted uses templates. `INS-08` switching off stops jobs.

### Verify

```bash
pnpm test:all
```

Manual (`Needs human`): set a real `ANTHROPIC_API_KEY` in staging and review three generated cards for tone and accuracy.

### Exit criteria

- [ ] Stage A works with no key at all; Stage B works with a stub and, once a key exists, with the real API.
- [ ] `phase-16-done` tagged.

---

## Phase 17 — Final hardening and production release

**Goal:** confirm the whole product meets the targets and ship it.
**Depends on:** phases 0–16. **Spec:** arch §12b, §13; prd §2 success metrics.

### Build

- [ ] Write k6 scripts and run them on staging: `PRF-01` dashboard under 2 seconds on throttled 4G with a mid-range phone profile; `PRF-02` ramp to the launch online-user level in arch §13 with room events inside 2 seconds; `PRF-03` many simultaneous session endings; `PRF-04` full-year heatmap.
- [ ] Security: OWASP ZAP baseline scan, dependency audit, image scan; fix critical and high findings. Re-check `SEC-01` to `SEC-05`.
- [ ] Full regression: run every test ID in the appendix; run the accessibility and Lighthouse suites again.
- [ ] Restore drill: restore Postgres from backup into a scratch database and run the rebuild jobs.
- [ ] Analytics or logging needed to measure the success metrics (day-7 retention, weekly active users with 3+ study days, sessions per user per week, friends or groups, AI insight opens) without collecting anything beyond what the privacy rules allow.
- [ ] Write `docs/RUNBOOK.md` (deploy, rollback, scale, Redis rebuild, incident checklist) and `docs/RELEASE_NOTES.md`.
- [ ] Production deploy through the pipeline with manual approval; run the smoke test.

### Human decisions required before launch (`Needs human`)

- [ ] Minimum age and handling of minors' data and public rooms.
- [ ] Final leaderboard category list, and whether users can create categories.
- [ ] Whether XP and levels unlock anything.
- [ ] Free product or paid tier for AI insights.
- [ ] Whether room chat history is stored.
- [ ] Domain, TLS, registry and production cluster access.

### Exit criteria

- [ ] All test IDs in the appendix pass; performance targets met on staging.
- [ ] No critical or high vulnerabilities; restore drill succeeded.
- [ ] Production deploy healthy; `release-1.0` tagged.

---

## Appendix A — Test ID to phase map (regression checklist)

| Test IDs | Written in phase |
| --- | --- |
| `DEP-02`, `DEP-04`, `SEC-04` | 1 |
| `AUTH-01` to `AUTH-07`, `SEC-02`, `SEC-03`, `SEC-05`, `FRD-05` (stub) | 2 |
| `TMR-02`, `TMR-03`, `TMR-06`, `TMR-08`, `TMR-09`, `TMR-11`, `TMR-12`, `CHT-04` | 3 |
| `TMR-07`, `STK-01` to `STK-06`, `DEP-09` | 4 |
| `TMR-01`, `TMR-04`, `TMR-05` | 5 |
| `OFF-01` to `OFF-06` | 6 |
| `PLN-01` to `PLN-04`, `GOL-01`, `EXM-01`, `TMR-10`, `SEC-01` | 7 |
| `STA-01` to `STA-03`, `AUTH-08`, `PRF-04` (baseline) | 8 |
| accuracy property test, Gate 1 report | 9 |
| `DEP-01`, `DEP-05`, `DEP-06`, `DEP-07` | 10 |
| `FRD-01` to `FRD-05` | 11 |
| `RTM-01` to `RTM-12`, `DEP-08` | 12 |
| `CHT-01`, `CHT-03`, `CHT-05`, `CHT-07` | 13 |
| `LBD-01` to `LBD-08`, `PRF-03` | 14 |
| `XP-01` to `XP-05`, `CHT-02`, `CHT-06`, `SYL-01`, `SYL-02` | 15 |
| `INS-01` to `INS-08` | 16 |
| `PRF-01` to `PRF-04` (targets on staging) | 17 |

The description of each test ID is in `docs/architecture.md` section 12c.

## Appendix B — Handoff checklist at the end of every phase

- [ ] `pnpm test:all` output attached to the phase report.
- [ ] Status table updated; boxes ticked in this file.
- [ ] `docs/DECISIONS.md` and `docs/BLOCKERS.md` updated.
- [ ] Commit `phase-N: <title>` and tag `phase-N-done` created.
- [ ] Next phase named in the report; gates (9 and 13) wait for human approval.
