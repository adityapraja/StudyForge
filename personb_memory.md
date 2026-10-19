# Person B Memory & Development Log

**Role:** Person B — Backend Core, Authentication & Security  
**Phase:** Step 0 (Setup) & Phase 1 (Tracker Core)  
**Branch:** `aditya-backend`  
**Date:** Oct 19, 2026  

---

## 1. Executive Summary & Overview of Responsibilities

As Person B, our ownership scope as established in `docs/Study_Habit_Tracker_Project_Execution (1).md` and `docs/Study_Habit_Tracker_Architecture_Simple.md` encompasses:
1. **Repository & Express Setup (Step 0):** Setting up the Express 5 server structure, configuration, security middleware, error handling, `.env.example`, and CI pipelines.
2. **Authentication & Security:** Register, login, logout, bcrypt hashing, JWT issuance in httpOnly cookies, auth middleware, and rate limiting.
3. **User & Progression Modules:** User profiles, time zone management, goal configuration (`/me/goals`), XP calculation, and streak tracking with weekly freeze automation.
4. **Subjects Module:** Full CRUD for user study subjects with hex color validation and per-user name uniqueness.
5. **Sessions Module & Timer Logic:** Start, pause, break, resume, active session recovery on refresh, manual session entry, search/filtering, and deletion.
6. **Session-End Transaction & Anti-Cheat:**
   - Single atomic PostgreSQL transaction for session ending.
   - Enforcing anti-cheat caps: 16-hour daily study cap, 12-hour max session cap, 4-hour XP session cap.
   - Unverified flag for manual sessions (excluded from XP and leaderboards).
   - Time zone-aware midnight boundary splitting across local calendar days for `daily_totals`.
   - Prevention of overlapping sessions.

---

## 2. Code Changes & Detailed Rationale

### A. Root & Setup Files

#### 1. `.gitignore`
- **Change:** Fixed `node-modules` typo to `node_modules/`, and added `.env`, `.env.*`, `!.env.example`, `dist/`, and `coverage/`.
- **Why:** Avoid tracking dependencies and secrets while ensuring example configuration files remain tracked for teammates.

#### 2. Root `package.json`
- **Change:** Added root `package.json` delegating scripts (`start`, `dev`, `test`) to `server/` via `npm --prefix server`.
- **Why:** Provides seamless monorepo orchestration for teammates running commands from the root directory.

#### 3. `.env.example` (Root & `server/.env.example`)
- **Change:** Documented all environment variables with defaults: `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_NAME`, `CLIENT_URL`, `DAILY_CAP_HOURS`, `MAX_SESSION_HOURS`, `SESSION_XP_CAP_HOURS`, `DEFAULT_STREAK_MINIMUM_MINUTES`.
- **Why:** Adheres to the working agreement (never commit secrets, maintain `.env.example`) and ensures numeric limits are configurable rather than hardcoded.

#### 4. `.github/workflows/ci.yml`
- **Change:** Created a GitHub Actions CI pipeline testing Node.js 22 against PostgreSQL 16 on push and PR.
- **Why:** Fulfills Person B's Step 0 commitment to enforce automated verification on every commit.

---

### B. Database Schema & Connection (`server/schema.sql`, `server/src/db.js`)

#### 1. `server/schema.sql`
- **Change:** Defined clean PostgreSQL schema with keys, indexes, foreign key cascades, and check constraints for:
  - `users` (unique on lowercase email and username, JSONB privacy, category check, level, xp, study target seconds)
  - `subjects` (unique on `(user_id, name)`, hex color regex check)
  - `sessions` (status enum check, index on `(user_id, started_at DESC)`, unique partial index `idx_sessions_user_open` ensuring only 1 open session per user)
  - `daily_totals` (unique on `(user_id, day)`, index on `(day, user_id)`)
  - `streaks` (streak counters, weekly freeze tracking, last counted date)
  - `xp_events` (unique on `(session_id, kind)` preventing double awards)
  - Future data modules: `daily_goals`, `tasks`, `syllabus_topics`, `exams`, `friendships`, `blocks`.
- **Why:** Built using PostgreSQL native `gen_random_uuid()` (standard in PG 13+) and robust constraints so data integrity is enforced at the database level. Person C can immediately build on this schema.

#### 2. `server/src/db.js`
- **Change:** Implemented connection pool with lazy instantiation via `Proxy`, query helper, `withTransaction(callback)` for atomic transactions, and `initDb()` for schema initialization.
- **Why:** Ensures consistent transaction management (`BEGIN` / `COMMIT` / `ROLLBACK`) across all modules and allows tests to dynamically connect to test databases.

---

### C. Configuration & Middlewares (`server/src/config.js`, `server/src/middleware/`)

#### 1. `server/src/config.js`
- **Change:** Created centralized config parsing `process.env` with sensible defaults. Added a dynamic getter for `databaseUrl`.
- **Why:** Guarantees single source of truth for configuration and allows dynamic test database switching.

#### 2. `server/src/middleware/error-handler.js`
- **Change:** Built `AppError` class and central error middleware returning the exact contract shape `{ error: { code, message, fields } }` with support for optional metadata like `open_session`. Also translates Zod errors to `VALIDATION_ERROR` with field mappings.
- **Why:** Required by `API.md` section 1. All errors across the API have a predictable, standard format.

#### 3. `server/src/middleware/validate.js`
- **Change:** Built validation middleware supporting `body`, `query`, and `params`. In Express 5, `req.query` is a getter, so `Object.defineProperty` was used to safely update `req.query` and `req.params`.
- **Why:** Centralizes request validation using Zod in plain JavaScript without boilerplate in routes.

#### 4. `server/src/middleware/rate-limit.js`
- **Change:** Built `authRateLimiter` using `express-rate-limit` allowing 6 attempts per minute per IP, returning HTTP 429 with `{ error: { code: "RATE_LIMITED", message: "..." } }`. Relaxed in test mode.
- **Why:** Fulfills security requirements against brute-force attacks on auth endpoints.

#### 5. `server/src/middleware/auth.js`
- **Change:** Middleware extracting JWT from httpOnly cookie `token` (with Bearer fallback), verifying signature, and querying the database for user details, attaching `req.user`.
- **Why:** Ensures all private endpoints are protected and have access to authenticated user context.

---

### D. Progression Module (`server/src/modules/progression/`)

#### 1. `xp.service.js`
- **Change:** Implemented XP and level calculation:
  - Base level 1 requires 200 XP; each subsequent level requires 50 more XP ($200 + (L-1) \times 50$).
  - At 1240 XP: Level 5, 140 in level, 400 for next level (matches `API.md` contract line 183).
  - Session XP: 1 XP per minute, capped at 4 hours (240 XP). Manual/unverified sessions earn 0 XP.
- **Why:** Adheres strictly to PRD section 4.6 and `API.md`.

#### 2. `streak.service.js`
- **Change:**
  - `getStreakInfo`: reads user streak, today's minutes from `daily_totals`, checks minimum threshold, and computes freeze availability.
  - `updateStreakOnSessionEnd`: checks if day's study minutes $\ge$ `streak_minimum_minutes`. If so, increments streak for consecutive day, applies automatic weekly freeze if 1 day was missed, or resets streak if $>1$ day missed or freeze was already consumed this ISO week.
  - Formats date strings via `TO_CHAR(..., 'YYYY-MM-DD')` to prevent timezone skews.
- **Why:** Satisfies PRD 4.5 and Architecture section 8 rules for streaks and weekly freeze automation.

---

### E. Auth Module (`server/src/modules/auth/`)

- **Change:**
  - `POST /api/auth/register`: validates body, checks uniqueness for email and username (case-insensitive), hashes password with `bcryptjs`, creates user + streak row in one transaction, signs JWT, sets httpOnly cookie `token`, returns 201 with User object.
  - `POST /api/auth/login`: rate-limited, verifies credentials with `bcrypt.compare`, sets httpOnly cookie, returns 200 with User object.
  - `POST /api/auth/logout`: clears `token` cookie, returns `{ ok: true }`.
- **Why:** Implements Phase 1 authentication handoff so Person A and Person C can sign in and authenticate during development.

---

### F. Users / Me Module (`server/src/modules/users/`)

- **Change:**
  - `GET /api/me`: returns user profile matching User object schema.
  - `PATCH /api/me`: updates `username` (uniqueness checked), `time_zone`, `category`, `leaderboard_hidden`, and `privacy` (deep JSONB merge).
  - `GET /api/me/xp`: returns current level and XP breakdown.
  - `GET /api/me/streak`: returns streak status and freeze availability.
  - `GET /api/me/goals`: returns daily/weekly target seconds, streak minimum, plus computed `today_seconds` and `week_seconds` from `daily_totals`.
  - `PUT /api/me/goals`: updates target seconds and streak minimum.
- **Why:** Delivers all current-user endpoints assigned to Person B in `API.md` section 4.

---

### G. Subjects Module (`server/src/modules/subjects/`)

- **Change:**
  - `GET /api/subjects`: lists user's subjects ordered by creation time.
  - `POST /api/subjects`: validates 1–40 char name, hex color format (`#RRGGBB`), enforces per-user name uniqueness (409 `SUBJECT_NAME_TAKEN`), returns 201.
  - `PATCH /api/subjects/:id`: updates name and/or color with conflict checking.
  - `DELETE /api/subjects/:id`: deletes subject cascading all associated records, returns `{ ok: true }`.
- **Why:** Fulfills Person B's server ownership for Subjects under Section 14 of `API.md`.

---

### H. Sessions & Timer Module (`server/src/modules/sessions/`)

#### 1. Core Timer Endpoints
- `POST /api/sessions/start`: validates subject ownership, ensures no open session exists (409 `SESSION_ALREADY_OPEN` with `open_session` details), stamps start time with server clock.
- `GET /api/sessions/active`: returns active session or `{ session: null }` for page refresh recovery.
- `POST /api/sessions/:id/pause`: checks running state, transitions to `paused`, records `segment_started_at`.
- `POST /api/sessions/:id/break`: checks running state, transitions to `on_break`, records `segment_started_at`.
- `POST /api/sessions/:id/resume`: accumulates elapsed segment time to `paused_seconds` or `break_seconds`, transitions back to `running`.
- Disallowed state moves return 409 `INVALID_STATE`.

#### 2. Session-End Transaction (`session-end.transaction.js`)
- Executed atomically in `POST /api/sessions/:id/stop`:
  - Locks session row `FOR UPDATE`.
  - Finalizes active pause or break if stopped while paused/on break.
  - Enforces 12-hour max session cap.
  - Calculates `study_seconds = total_elapsed - paused_seconds - break_seconds`.
  - **Midnight Splitting in User Timezone:** Calculates boundary intervals against user's local timezone. Divides study time across calendar days proportionally.
  - **Daily Cap Enforcement:** Enforces 16-hour daily study cap on `daily_totals`. Excess study time is not added to daily totals.
  - **XP Awarding:** Awards 1 XP per focused minute (capped at 240 XP). Records event in `xp_events` with unique constraint `(session_id, kind)` to prevent double awards. Updates user `xp` and `level`.
  - **Streak Update:** Calls streak service to extend streak or apply weekly freeze.
  - Returns session and summary with `study_seconds`, `counted_seconds`, `verified`, `xp_awarded`, `streak`, and `today_seconds`.

#### 3. Manual Entry & Anti-Cheat
- `POST /api/sessions/manual`:
  - Validates `ended_at > started_at` and `started_at, ended_at <= NOW()`.
  - Rejects overlapping sessions with 409 `SESSION_OVERLAP`.
  - Sets `source = 'manual'` and `verified = false`.
  - Updates `daily_totals.minutes` but NOT `verified_minutes`.
  - Awards 0 XP.

#### 4. Listing, Search & Deletion
- `GET /api/sessions`: cursor pagination (`limit` default 50, max 200), filters by `from`, `to`, `q` (note ILIKE search), `subject_id`, ordered newest first.
- `DELETE /api/sessions/:id`: deletes own session.

---

### I. Express Application Setup (`server/src/app.js`, `server/src/server.js`)

- `app.js`: Configured Helmet, CORS with credentials, cookie-parser, JSON body parser, route mountings under `/api`, `/healthz` endpoint, catch-all 404 handler, and central error handler.
- `server.js`: Connects to PostgreSQL, checks connection, runs schema verification, starts HTTP server on port 3000, and registers graceful shutdown handlers (`SIGTERM`, `SIGINT`).

---

## 3. Testing & Verification

A test suite with 45 tests across 6 test files was implemented using Vitest + Supertest with an isolated PostgreSQL database test cluster:

| Test File | Test Cases | Status |
| :--- | :--- | :--- |
| `test/auth.test.js` | Registration, bcrypt hashing, duplicate checks, login, wrong passwords, logout, auth middleware | **10 / 10 Passed** |
| `test/me.test.js` | Profile read/update, privacy merging, username uniqueness, XP formula breakdown, streak status, goal updates | **7 / 7 Passed** |
| `test/subjects.test.js` | CRUD operations, hex color validation, user isolation, name conflict rejection | **6 / 6 Passed** |
| `test/sessions.test.js` | Timer start, recovery, pause/break/resume transitions, stop accounting, pause finalization, list/search/delete | **10 / 10 Passed** |
| `test/anti-cheat.test.js` | Manual session verification flag, 0 XP, overlap rejection, 4-hour XP cap, 16-hour daily cap, midnight timezone split | **6 / 6 Passed** |
| `test/progression.test.js` | XP breakdown, 15-minute streak threshold, consecutive streak extension, weekly freeze automation, freeze exhaustion reset | **6 / 6 Passed** |
| **Total** | **45 comprehensive integration & unit test cases** | **45 / 45 Passed (100%)** |

All tests run cleanly via `npm test` from both `server/` and repository root.

---

## 4. CI Fix & Cross-Platform Test Database Resolution

### Issue Encountered in GitHub Actions CI
- **Error:**
  ```text
  Error: Command failed: /usr/pgsql-18/bin/initdb -D /tmp/test_pgdata -U postgres -A trust
  status: 127
  ```
- **Root Cause:**
  `server/test/global-setup.js` was hardcoding a fallback connection URL and attempting to spawn a local PostgreSQL cluster using `/usr/pgsql-18/bin/initdb`. While `/usr/pgsql-18` existed in the local development environment, GitHub Actions Ubuntu runners run an external PostgreSQL service container (`postgres:16` on `localhost:5432`) and pass `DATABASE_URL` via the workflow environment. Because `global-setup.js` overwrote `process.env.DATABASE_URL`, it ignored the active CI PostgreSQL service and failed when trying to invoke the non-existent `/usr/pgsql-18/bin/initdb` binary.

### Resolution & Code Changes
1. **Support External `DATABASE_URL` First (`server/test/global-setup.js`):**
   - The setup hook now checks if `process.env.DATABASE_URL` is already supplied.
   - If present, it waits for the service to be healthy, applies `server/schema.sql`, and immediately returns without attempting to spawn any local processes.
2. **Dynamic Binary Discovery for Local Development:**
   - Added a `findPgBinary(name)` helper that checks `PATH` (`which initdb`) and standard package locations across distros (Fedora `/usr/pgsql-*` and Ubuntu/Debian `/usr/lib/postgresql/*`), ensuring portability across any environment.
3. **Verification:**
   - Both CI environment (where `DATABASE_URL` is supplied) and local development (where fallback embedded cluster is used) run seamlessly and pass all 45 test cases.

