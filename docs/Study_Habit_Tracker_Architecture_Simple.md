# Study Habit Tracker — Architecture & Tech Stack (Simple Version)

Oct 17, 2026 · @Adi

## 1. Overview and hard constraints

The product is one **Node.js + Express** server written in **plain JavaScript**, backed by one **PostgreSQL** database, with a small React front end (also plain JavaScript).

**Hard constraints**

- Backend: Node.js and Express only. No other backend language or framework.
- **JavaScript only.** No TypeScript anywhere.
- **One database.** No Redis, no message queues, no cache server.
- No WebSockets or Socket.IO, no background worker process, no external AI service, no Kubernetes.
- **Docker is planned for later, not now.** The design is already container-friendly (see section 11a), so dockerizing needs no code changes.

**Scope.** The simplified product PRD: timer, planner, goals and streaks, statistics, XP, syllabus and exams, rule-based insights, friends, leaderboards, CSV export.

## 2. Principles

1. **One server, one database.** A single Express app; no separate worker.
2. **Sessions are the source of truth.** Streaks, XP, heatmap and leaderboards are computed from saved sessions.
3. **Server decides, client suggests.** The server stamps start and stop times and applies the caps.
4. **Request/response only.** The browser asks, the server answers. Pages refresh data by fetching it again (no live push).
5. **One privacy check.** Every read of another user's data goes through one `canView` function.
6. **Boring technology.** Mature libraries one developer can debug.

## 3. System architecture

```text
Browser (React)  --HTTPS/JSON-->  Express API (Node.js)  -->  PostgreSQL
```

Three pieces only. When a session ends, the same request that saves it also updates `daily_totals`, XP and the streak inside one database transaction, so no queue or worker is needed.

**Session-end flow (inside `POST /sessions/:id/stop`)**

1. Validate the session (caps, overlap) and set the `verified` flag.
2. Insert or update `daily_totals`, splitting sessions that cross midnight in the user's time zone.
3. Add XP (1 per focused minute, capped at 4 hours per session) and bonuses.
4. Update the streak (apply the weekly freeze if a day was missed).
5. Commit the transaction and return the saved session.

All five steps succeed or fail together.

## 4. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | JavaScript (Node.js 22 LTS) | Required; no build step on the server |
| HTTP framework | Express 5 | Required; built-in async error handling |
| Database | PostgreSQL | Good fit for sessions, goals and syllabus trees; strong time zone support |
| Database access | `pg` with plain SQL | No ORM to learn; schema kept in a `schema.sql` file |
| Validation | Zod (works in plain JavaScript) | One place to check request bodies |
| Auth | Email + password (`bcrypt`), JWT in an httpOnly cookie | Simple; no third-party service |
| Time and zones | Luxon | Reliable day, week and month boundaries per time zone |
| Security middleware | Helmet, `cors`, `express-rate-limit` (in-memory) | Headers, CORS allow-list, login and friend-request limits |
| Front end | React + Vite (JavaScript) | Fast and simple |
| Data fetching | `fetch` (or TanStack Query) | Plain requests to the API |
| Charts | Recharts for graphs; custom SVG grid for the heatmap | Subject colors and non-color cues |
| Styling | Plain CSS or Tailwind | One light theme |
| Logging | `morgan` or `pino` | Request logs |
| Testing | Jest (or Vitest) + Supertest | Unit and API tests in one toolchain |
| Tooling | npm, ESLint, Prettier | Consistent code |
| Hosting | Any Node host (Render, Railway) + managed PostgreSQL | No containers needed |

Rate limiting uses in-memory counters. That is fine for a single server; it would need a shared store only if the app ever ran on several servers.

## 5. Backend design

One Express app split into feature folders. Each folder holds routes, service logic and SQL for its own tables.

```text
study-tracker/
  server/
    src/
      app.js             Express setup, middleware, routes
      server.js          starts the server
      db.js              pg connection pool
      modules/
        auth/            register, login, logout
        users/           profile, privacy, time zone, category
        subjects/        subjects and colors
        sessions/        start, pause, break, stop, manual entry, session-end logic
        planner/         goals, tasks, daily review
        syllabus/        topic tree, status, progress
        exams/           exam countdown
        stats/           heatmap, graphs, subject breakdown, rule-based insights
        progression/     XP, levels, streaks
        friends/         requests, blocks, visibility
        leaderboard/     ranking queries
        export/          CSV export, account delete
      middleware/        auth, validate, rate-limit, error handler
    schema.sql           all tables and indexes
  client/                React app (Vite, JavaScript)
```

**Request path.** Route, then middleware (rate limit, auth, Zod validation), then service, then SQL. Errors go to one central handler that returns a consistent JSON shape.

**REST API** (all under `/api`, JSON)

| Area | Key endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout` |
| Subjects | `GET/POST /subjects`, `PATCH/DELETE /subjects/:id` |
| Sessions | `POST /sessions/start`, `/sessions/:id/pause`, `/resume`, `/break`, `/stop`; `GET /sessions/active`; `POST /sessions/manual`; `GET /sessions?from&to&q` |
| Planner | `GET/PUT /planner/:date`; `POST /planner/:date/carry-over` |
| Syllabus | `GET /subjects/:id/syllabus`, `POST /topics`, `PATCH /topics/:id`, `POST /subjects/:id/syllabus/import` |
| Exams | `GET/POST /exams`, `PATCH/DELETE /exams/:id` |
| Stats | `GET /stats/heatmap?year`, `/stats/progress?range`, `/stats/subjects?range`, `/stats/insights` |
| Progress | `GET /me/xp`, `/me/streak`, `GET/PUT /me/goals` |
| Friends | `POST /friends/requests`, `PATCH /friends/requests/:id`, `GET /friends`, `DELETE /friends/:id`, `POST /blocks` |
| Leaderboards | `GET /leaderboards?period=day\|week\|month&category&scope=all\|friends` |
| Account | `GET /me/export.csv`, `DELETE /me` |

## 6. Data architecture

PostgreSQL holds everything.

| Table | Key columns | Notes |
| --- | --- | --- |
| `users` | id, email, password_hash, username, time_zone, category, privacy (JSONB), xp, level, leaderboard_hidden | Unique on email and lower(username) |
| `subjects` | id, user_id, name, color | Unique on (user_id, name) |
| `sessions` | id, user_id, subject_id, started_at, ended_at, paused_seconds, break_seconds, note, source, verified | Index (user_id, started_at); `ended_at` empty while the session is open |
| `planner_days` | id, user_id, date, reflection | Unique on (user_id, date) |
| `planner_goals` | id, user_id, date, subject_id, text, target_seconds | API limits each day to 1-3 goals |
| `tasks` | id, user_id, date, text, done, carried_over, carried_from_task_id | Index (user_id, date); unique carry-over per source task and destination date |
| `syllabus_topics` | id, subject_id, parent_id, title, status, position | Parent link; recursive query for the tree |
| `exams` | id, user_id, subject_id, date, target_hours | |
| `friendships` | requester_id, receiver_id, status | Unique on the pair |
| `streaks` | user_id, current, longest, freeze_week, freezes_used | One row per user |
| `xp_events` | id, user_id, session_id, kind, amount, day | Unique on (session_id, kind) to stop double awards |
| `daily_totals` | user_id, day (local date), minutes, verified_minutes | Updated at session end; feeds heatmap, progress, streaks and leaderboards |
| `subject_daily_totals` | user_id, subject_id, day (local date), minutes, verified_minutes | Updated in the session-end transaction; feeds subject statistics |

**Design choices**

- All timestamps are stored in UTC (`timestamptz`).
- Study time = `ended_at - started_at - paused_seconds - break_seconds`, calculated once when the session is saved.
- `daily_totals` is the read model for daily activity; `subject_daily_totals` keeps the same counted minutes by subject for subject statistics.
- **Leaderboards are SQL queries**, not a cache: sum `verified_minutes` from `daily_totals` for the period, grouped by user, filtered by category, ordered descending, limited to the top N. An index on (day, user_id) keeps this fast.
- Database check constraints: `ended_at > started_at`, non-negative pause and break seconds, maximum session length.
- Account deletion removes the user's rows in one transaction (foreign keys cascade).
- Schema changes are plain SQL files run in order and recorded in `schema_migrations`.

## 7. Timer accuracy and session recovery

The timer never counts ticks. It stores a start timestamp and calculates elapsed time from the clock.

- **Start.** `POST /sessions/start` creates an open session row with the server's current time.
- **Pause, break, stop.** Each action is a request; the server records the time and updates `paused_seconds` or `break_seconds`.
- **Display.** The browser calculates elapsed time from the stored start time every second, and again when the tab regains focus, so background tabs stay accurate.
- **Recovery.** On page load the client calls `GET /sessions/active`; if an open session exists it resumes the display. A refresh or closed tab loses nothing.
- **Countdown mode.** The browser counts down to the planned length and the user taps stop; a server-side check ends any session left open past the maximum session length.
- **Single open session.** A second `start` while one is open is rejected.

## 8. XP, streaks, leaderboards and anti-cheat

All of this runs inside the session-end transaction (section 3).

**Anti-cheat rules**

| Rule | Effect |
| --- | --- |
| Daily cap on logged hours (proposed default 16) | Excess time not counted |
| Maximum session length (proposed 4 h for XP) | XP capped; time still counted |
| Manual entries | `verified = false`; no leaderboard, no XP |
| Overlapping sessions | Later session rejected |
| Server clock for start and stop | Browser time is never trusted |

Numeric defaults are configuration values, not code.

**Streaks.** Compare the day's minutes with the user's minimum (default 15). Apply the weekly freeze automatically the first time a day is missed in a week. Update the longest streak.

**Leaderboard reads.** Top N and the user's own rank come from one SQL query with `RANK()`. The friends-only view adds a filter on accepted friends. Period boundaries use each user's time zone, so category boards mix time zones (a product decision to confirm).

## 9. Rule-based insights (no AI)

A plain function reads `daily_totals`, `sessions`, goals and exams and returns a few lines, each with its source numbers, for example "Physics: 3.5 h logged against 6 h planned" or "Best time of day: 6–8 pm". No external service, no scheduled job: the result is calculated when the user opens the insights page.

## 10. Security and privacy

| Area | Design |
| --- | --- |
| Passwords | `bcrypt` hashing; minimum length check |
| Login | JWT (about 7 days) in an httpOnly, secure, SameSite cookie |
| Transport | HTTPS everywhere |
| Input safety | Zod validation on every route; parameterised SQL only; Helmet headers |
| CORS and CSRF | CORS allow-list of the web origin; SameSite cookies |
| Rate limiting | `express-rate-limit` on login, register and friend requests |
| Authorization | Every query filters by the signed-in user's id |
| Privacy | One `canView(viewer, target, field)` function applies friends, everyone and nobody settings, blocks and leaderboard opt-out |
| Secrets | Environment variables only; never in the repository |
| Logging | No passwords, tokens or note text in logs |

**Minors.** The minimum age is undecided; a date-of-birth field at signup keeps the option open.

## 11. Deployment and testing

**Deployment.** Run the Express server on any Node host and use a managed PostgreSQL database. Serve the built React files from Express (`express.static`) or from any static host. Configuration comes from environment variables (`DATABASE_URL`, `JWT_SECRET`, `PORT`). For local development, install PostgreSQL locally or use a free hosted database.

**Testing.** Jest (or Vitest) with Supertest against a test PostgreSQL database. Focus on the rules users must be able to trust.

| Area | Key test cases |
| --- | --- |
| Auth | Register, duplicate email rejected, wrong password rejected, login rate limit, password stored hashed |
| Timer | 30-minute session saved; 10-minute pause not counted; break not counted; second open session rejected; end before start rejected; refresh restores the open session; day total equals sum of sessions |
| Time zones | A session from 23:50 to 00:20 splits across two local days; correct boundaries on a daylight-saving day |
| Anti-cheat | Daily cap respected; 5-hour session capped at 4 hours of XP; manual entry not on leaderboard and earns no XP; overlap rejected |
| Streaks and XP | 14 minutes does not extend a streak, 15 does; freeze used once a week; XP awarded once per session and per bonus; level rises with XP |
| Planner | Fourth daily goal rejected; carry-over copies only unfinished tasks; review shows goals met and total time |
| Syllabus and exams | Pasted list creates nested topics; 100% when all topics done; days left and hours per day correct |
| Friends and privacy | Accepted friends see streak, level and weekly time; non-friends do not; blocked users see nothing; `canView` checked for every setting |
| Leaderboards | Correct category only; opted-out user hidden; friends-only filter; ties ranked consistently; unverified minutes excluded |
| Export and delete | CSV has only the user's own sessions; delete removes all rows |
| Security | SQL injection strings treated as text; another user's session id refused |

Run all tests on every push (GitHub Actions or locally before deploying).

## 11a. Dockerizing later (future step)

Docker is not part of the first version, but the app is built so it can be added without changing code:

- **One server process** and one database: just two containers.
- **Configuration from environment variables** (`DATABASE_URL`, `JWT_SECRET`, `PORT`), which is what containers expect.
- **No local state:** no files, sessions or caches stored on the server's disk; everything lives in PostgreSQL.
- **Built React files served by Express**, so a single image contains the whole app.
- **A `/healthz` route** can be added for container health checks.

**Starting-point Dockerfile** (add when you dockerize)

```dockerfile
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist ../client/dist
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
```

**Starting-point `docker-compose.yml`** (local development and simple single-server hosting)

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: tracker
    volumes:
      - dbdata:/var/lib/postgresql/data
      - ./server/schema.sql:/docker-entrypoint-initdb.d/schema.sql
  app:
    build: .
    environment:
      DATABASE_URL: postgres://postgres:dev@db:5432/tracker
      JWT_SECRET: change-me
      PORT: 3000
    depends_on: [db]
    ports: ['3000:3000']
volumes:
  dbdata:
```

Check paths and versions against your final folder layout before using these. In production, a managed PostgreSQL is usually safer than a database container, and the secrets must come from the host rather than the compose file.

## 12. Delivery phases and open decisions

| Phase | Contents |
| --- | --- |
| 1 — Tracker | Accounts, subjects, timer, planner, goals, streaks, statistics, CSV export |
| 2 — Progress | Syllabus, exams, XP and levels, rule-based insights |
| 3 — Social | Friends, privacy, leaderboards (after time accuracy is proven) |

**Open decisions**

- [ ] Category leaderboards mix time zones: accept this, or fix one reference zone per category
- [ ] Minimum age and handling of minors' data
- [ ] Whether XP and levels unlock anything or are display-only
- [ ] Target launch date and team size
