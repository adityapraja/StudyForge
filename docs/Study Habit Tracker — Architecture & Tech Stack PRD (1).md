# Study Habit Tracker — Architecture & Tech Stack PRD

Sep 29, 2026 · @Adi

## 1. Overview, scope and hard constraints

The product is built as a modular monolith on **Node.js and Express** (TypeScript), with a React PWA in front, PostgreSQL for records and Redis for live and cached data. This document turns the product PRD into concrete architecture and stack decisions.

**Hard constraint.** The backend runs on Node.js and Express only. No second backend language or framework (no Python, Go, Django, NestJS). Every server-side capability below is chosen to fit that rule, including real-time (Socket.IO), background jobs (BullMQ) and AI calls (Anthropic Node SDK).

**Scope.** All features in the product PRD: the five core features (timer, rooms, planner, leaderboards, heatmaps), the focus and habit tools (section 5), and XP, syllabus, friends and AI insights (section 6).

**Out of scope here.** Visual design, exact API payloads, launch dates and pricing. Non-goals from the product PRD (video rooms, app blocking, calendar sync, flashcards) stay out.

## 2. Architecture drivers and principles

Five requirements from the product PRD shape almost every decision: trusted study time, 2-second real-time updates, offline timer, cheap AI, and small-team operability.

| Driver | Source in product PRD | Architectural consequence |
| --- | --- | --- |
| Accurate, hard-to-fake time | Section 7 anti-cheating | Server is the source of truth; sessions store UTC timestamps, not counters; verified flag set by server |
| Live updates within 2 s | 4.2, 7 Real-time | WebSockets via Socket.IO, presence in Redis, Redis pub/sub for fan-out |
| Rankings within 1 min | 4.4 | Redis sorted sets updated on session end; Postgres is the rebuildable record |
| Offline timer, sync later | 7 Offline | PWA service worker + IndexedDB queue; idempotent session upload |
| Per-user time zones | 5.3, 7 | Store UTC, keep IANA zone per user, compute day boundaries server-side with Luxon |
| Controlled AI cost | 6.4, 10 | Generate once per period, cache, rule-based first, per-user limits |
| Small team, no dates yet | 10 | Modular monolith, managed services, one language (TypeScript) end to end |

**Principles**

1. **One deployable backend first.** A modular monolith with clear module boundaries; split out a service only when a measured bottleneck demands it.
2. **Sessions are the source of truth.** Streaks, XP, heatmaps, leaderboards and insights are derived from verified sessions and can be rebuilt.
3. **Server decides, client suggests.** The client sends start/stop events and timestamps; the server validates, caps and stamps them.
4. **Derived data is cached, never authoritative.** Redis holds leaderboards and presence; losing Redis must not lose study data.
5. **Privacy by default at the query layer.** Every read that exposes another user's data goes through one visibility check.
6. **Boring technology.** Prefer mature, well-documented libraries that one developer can debug.

## 3. System architecture

The system is one Node.js codebase run as an API process and a worker process, backed by PostgreSQL for records and Redis for live state.

&#91;embedded content: system architecture · 2 processes, 2 data stores, 2 external services\]

The browser reaches the API over HTTPS for data and over WebSocket for live events. The API serves requests and sockets; the worker handles everything that should not block a request. Postgres is the only store that cannot be rebuilt: Redis contents, including leaderboards, are recreated from it by a rebuild job.

## 3a. Data flow

Every number in the product starts as a study session written by the browser, saved once in Postgres, and then turned into totals, XP, streaks, rankings and live updates by the worker; screens only read the derived results.

&#91;embedded content: session data flow · write path, derived data and reads\]

The main path runs left to right along the top (browser, API, Postgres), then down through the queue and worker to the derived data, and finally up to the reader screens. Live events return to the browser over the socket. The table below covers the other flows.

| Flow | Path | Notes |
| --- | --- | --- |
| Session start | Browser, `POST /sessions/start`, open session in Postgres, presence key in Redis, `presence.update` to room members | Presence key expires after 90 s without a heartbeat |
| Heartbeat | Browser, socket, Redis TTL refresh | Every 30 s while studying; nothing written to Postgres |
| Offline session | IndexedDB, `POST /sessions/sync` when online, deduplicated by `client_id`, then the same worker pipeline | Sessions failing the checks count for personal stats but not leaderboards |
| Planner and goals | Browser, `PUT /planner/:date`, Postgres `daily_goals` and `tasks`; end-of-day review reads `daily_totals` and tasks | Carry-over copies unfinished tasks to the next day |
| Friends and privacy | Request, `friendships` row, then every read of another user's data passes `canView` | Blocks and opt-outs are applied at read time |
| Room chat (P1) | Browser, socket, validate, profanity filter, rate limit, broadcast to the room | Whether chat history is stored is not yet decided |
| Insights | Scheduled job, aggregate from Postgres, rule engine, optional Anthropic call (aggregates only), `insights` table, API, browser | One result per user and period, served from the table |
| Export and deletion | `GET /me/export.csv` reads `sessions`; `DELETE /me` cascades in Postgres and queues Redis cleanup | Both act only on the signed-in user's rows |
| Repair | Nightly job rebuilds Redis leaderboards from `daily_totals` | Postgres always wins over Redis |

**Rules for the flow**

1. **One writer per fact.** Only the session-end pipeline writes `daily_totals`, `xp_events`, streaks and leaderboard sets; API routes never update them directly.
2. **Idempotent everywhere.** Client ids, unique keys on `xp_events` and job ids let any step be retried without double counting.
3. **Write to Postgres first.** A session is never in Redis or a queue unless it is already saved.
4. **Read the derived tables.** Dashboards and boards read `daily_totals` and Redis, not raw sessions.

## 4. Tech stack decisions

The stack is TypeScript end to end: Node.js 22 LTS + Express on the server, React on the client, PostgreSQL and Redis for data. Each choice below names the main alternative and why it lost.

| Layer | Choice | Why | Alternative not chosen |
| --- | --- | --- | --- |
| Language | TypeScript (strict) | Shared types between API and client; fewer runtime bugs | Plain JavaScript |
| Runtime | Node.js 22 LTS | Required; long-term support | Bun, Deno |
| HTTP framework | Express 5 | Required; async error handling built in | Fastify, NestJS |
| Validation | Zod | One schema validates requests and generates types | Joi, express-validator |
| Database | PostgreSQL 16 | Relational fit for sessions, goals, syllabus trees; strong aggregation and time zone support | MongoDB |
| ORM / queries | Prisma (raw SQL for heavy aggregates) | Typed schema and migrations; escape hatch for leaderboard and heatmap queries | Drizzle, Knex |
| Cache, presence, leaderboards | Redis 7 | Sorted sets for ranks, TTL keys for presence, pub/sub, rate-limit counters | In-memory maps (break with 2+ servers) |
| Real-time | Socket.IO 4 + Redis adapter | Rooms, reconnect and fallback built in; stays inside Node | Raw `ws`, managed services (Ably, Pusher) |
| Background jobs | BullMQ (on Redis) | Retries, schedules, rate limits for XP, streak, insight jobs | node-cron alone (no retries, single instance) |
| Auth | Email + password (argon2id) and Google login (OAuth 2.0/OIDC via `openid-client`); short-lived JWT access token + rotating refresh token in httpOnly cookie | Covers both open login options; no third-party session service | Auth0, Clerk |
| Time and zones | Luxon | Reliable IANA zone maths for day, week and month boundaries | Moment, date-fns-tz |
| AI | Anthropic API via official Node SDK, called only from a worker | Plain-language insight text; server-side key; cost control | Self-hosted models |
| Frontend | React 18 + Vite + TypeScript | Fast builds, large ecosystem, easy PWA plugin | Next.js (SSR not needed for a logged-in app) |
| Client state and data | TanStack Query + Zustand | Cache and refetch server data; small local store for the live timer | Redux |
| PWA and offline | vite-plugin-pwa (Workbox) + IndexedDB via Dexie | Installable app, offline timer, queued sync | Hand-written service worker |
| Charts and heatmap | Recharts for graphs; custom SVG grid for the calendar heatmap | Controlled colors and pattern fills for accessibility | Chart.js |
| Styling | Tailwind CSS with CSS variables for themes | Light, dark and system themes from tokens | CSS-in-JS |
| Logging | pino | Fast structured JSON logs | winston |
| Errors and tracing | Sentry + OpenTelemetry | Error alerts and slow-request traces | Log-only monitoring |
| Testing | Vitest, Supertest, Playwright | Unit, API and end-to-end coverage in one toolchain | Jest, Cypress |
| Tooling | pnpm, ESLint, Prettier, Husky | Fast installs; consistent code | npm scripts only |
| Containers | Docker | Same image locally and in production | Bare VM deploys |

**Why real-time stays in Node.** The product PRD allows WebSockets or a managed service. Socket.IO with the Redis adapter satisfies the Node-only constraint, avoids a per-connection bill, and scales to several Express instances. A managed service remains a fallback if operating sockets becomes a burden.

## 5. Backend design

The backend is one Express app split into feature modules that each own their routes, service logic and data access; modules talk through service functions, never by reaching into each other's tables.

**Suggested repository layout**

```text
study-tracker/
  apps/
    api/                 Express + Socket.IO server
      src/
        modules/
          auth/          register, login, OAuth, refresh, sessions
          users/         profile, privacy, time zone, category
          subjects/      subjects and colors
          sessions/      timer state, save, manual entry, verification
          planner/       goals, tasks, daily review
          syllabus/      topic tree, status, progress
          rooms/         rooms, membership, presence, chat
          friends/       requests, blocks, visibility
          leaderboard/   ranking reads, category rules
          stats/         heatmap, graphs, subject breakdown
          progression/   XP, levels, streaks
          insights/      rule engine, AI generation, cache
          exams/         exam countdown
          export/        CSV export, account delete
        realtime/        Socket.IO setup, auth, room handlers
        jobs/            BullMQ queues and workers
        middleware/      auth, validate, rate-limit, error handler
        lib/             db, redis, logger, config, time utils
    web/                 React PWA
  packages/
    shared/              Zod schemas and TypeScript types
  docker-compose.yml     Postgres + Redis for local dev
```

**Request path.** Route, then middleware (rate limit, auth, Zod validation), then controller, service, data access. Errors go to one central handler that returns a consistent JSON error shape. Workers run the same codebase as a separate process (`node dist/worker.js`), so background work never blocks API requests.

**REST API surface** (all under `/api/v1`, JSON, cookie or bearer auth)

| Area | Key endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/google` |
| Subjects | `GET/POST /subjects`, `PATCH/DELETE /subjects/:id` |
| Sessions | `POST /sessions/start`, `/sessions/:id/pause`, `/resume`, `/break`, `/stop`; `POST /sessions/sync` (offline batch); `POST /sessions/manual`; `GET /sessions?from&to&q` |
| Planner | `GET/PUT /planner/:date` (goals, tasks, review); `POST /planner/:date/carry-over` |
| Syllabus | `GET /subjects/:id/syllabus`, `POST /topics`, `PATCH /topics/:id`, `POST /subjects/:id/syllabus/import` |
| Rooms | `POST /rooms`, `GET /rooms/:id`, `POST /rooms/join`, `DELETE /rooms/:id/members/:userId`, `POST /rooms/:id/report` |
| Friends | `POST /friends/requests`, `PATCH /friends/requests/:id`, `GET /friends`, `DELETE /friends/:id`, `POST /blocks` |
| Leaderboards | `GET /leaderboards?period=day\|week\|month&category&scope=all\|friends` |
| Stats | `GET /stats/heatmap?year`, `/stats/progress?range`, `/stats/subjects?range` |
| Progress | `GET /me/xp`, `/me/streak`, `GET/PUT /me/goals` |
| Exams | `GET/POST /exams`, `PATCH/DELETE /exams/:id` |
| Insights | `GET /insights?period`, `POST /insights/plan`, `PUT /me/insights-optin` |
| Account | `GET /me/export.csv`, `DELETE /me` |

**Conventions.** Cursor pagination on lists; idempotency key header on session write endpoints; UUID v7 primary keys (time-sortable); ISO 8601 UTC timestamps in all payloads; per-route rate limits held in Redis.

## 6. Real-time design

Rooms, presence and live leaderboards run on Socket.IO with Redis as the shared state, so a start or stop reaches every room member within the 2-second target and any API instance can serve any user.

**How it works**

1. The client opens one authenticated socket after login (JWT checked in the handshake) and joins `room:<id>` channels for the rooms it belongs to.
2. When a session starts, the API writes the session, sets a presence key in Redis (`presence:<userId>` with subject, start time and a 90-second TTL), and publishes a `presence.update` event to each of the user's rooms.
3. The client sends a heartbeat every 30 seconds; the server refreshes the TTL. A missed heartbeat expires the key, and the user shows as offline without any cleanup job.
4. Members render live elapsed time locally from the start timestamp, so the server sends one event per change, not one per second.
5. The Socket.IO Redis adapter delivers events across API instances.

**Events**

| Event | Direction | Payload | Notes |
| --- | --- | --- | --- |
| `room.join` / `room.leave` | client to server | room id | Checks membership and privacy before joining |
| `presence.update` | server to room | user, status, subject, start time | Respects each user's visibility setting |
| `presence.heartbeat` | client to server | none | Every 30 s while studying |
| `chat.send` / `chat.message` | both | text, max 300 characters | P1; rate-limited; profanity filter |
| `leaderboard.tick` | server to subscribers | top N delta | Sent at most every 5 s per board |
| `member.removed` | server to room | user id | Owner action; socket is dropped from the room |

**Rules**

- Presence shows only what the user's privacy setting allows (friends, everyone or nobody for status and subject).
- Blocked users never receive each other's presence events.
- Chat is P1 and ships after presence, as the product PRD's risk table recommends.
- On reconnect the client refetches room state over REST, then resumes events, so a dropped connection never leaves a stale room.

## 7. Data architecture

PostgreSQL holds every durable record and Redis holds only data that can be rebuilt from it. The schema follows the product PRD's data model, with a few added tables for auth, rooms and jobs.

**PostgreSQL tables**

| Table | Key columns | Notes and indexes |
| --- | --- | --- |
| `users` | id, email, password\_hash, username, time\_zone, category, privacy (JSONB), xp, level, theme, insights\_opt\_in, leaderboard\_hidden | Unique on email and lower(username) |
| `auth_identities` | user, provider, provider\_user\_id | Google login link |
| `refresh_tokens` | id, user, token\_hash, expires\_at, revoked\_at | Rotating tokens; hashed at rest |
| `subjects` | id, user, name, color, exam\_date | Unique on (user, name) |
| `sessions` | id, user, subject, started\_at, ended\_at, paused\_seconds, break\_seconds, note, source (timer or manual), verified, client\_id | Index (user, started\_at); unique (user, client\_id) for idempotent sync |
| `session_breaks` | id, session, started\_at, ended\_at | Keeps breaks separate from study time |
| `daily_goals` | id, user, date, target\_minutes, reflection | Unique on (user, date) |
| `tasks` | id, user, date, text, done, carried\_over | Index (user, date) |
| `syllabus_topics` | id, subject, parent\_id, title, status, position | Adjacency list; recursive queries for the tree |
| `topic_sessions` | topic, session | Ties a topic to study time |
| `rooms`, `room_members` | id, name, visibility, join\_code, owner; room, user, role | Unique on (room, user) |
| `friendships` | requester, receiver, status | Unique on the ordered pair |
| `streaks` | user, current, longest, freeze\_week, freezes\_used | One row per user |
| `xp_events` | id, user, session, kind, amount, day | Audit trail; unique per (session, kind) to stop double awards |
| `daily_totals` | user, day (local date), minutes, verified\_minutes, sessions | Materialized by a job; feeds heatmap, streaks and leaderboards |
| `exams` | id, user, subject, date, target\_hours |  |
| `insights` | id, user, period\_key, text, source\_numbers (JSONB), created\_at | Unique on (user, period\_key) |
| `reports`, `blocks` | reporter, target, reason; blocker, blocked | Moderation |

**Design choices**

- **All timestamps in UTC** (`timestamptz`); each session also stores the user's zone offset at save time so history stays correct if the user later travels or changes zone.
- **`daily_totals` is the read model.** The heatmap, streak check and weekly goals read from it, not from raw sessions, which keeps dashboard queries under the 2-second target.
- **Study time is computed as** `ended_at - started_at - paused_seconds - break_seconds`, stored once at save time so leaderboards never recompute it.
- **Soft limits enforced in the database:** check constraints for `ended_at > started_at`, non-negative pause and break seconds, and a maximum session length.
- **Account deletion** removes the user's rows in one transaction, with foreign keys set to cascade; backups roll off on their normal retention.
- **Migrations** run with Prisma Migrate in CI before each deploy.

**Redis keys**

| Key pattern | Type | Purpose | Lifetime |
| --- | --- | --- | --- |
| `presence:<user>` | string with TTL | Current subject and start time | 90 s, refreshed by heartbeat |
| `lb:<period>:<category>:<periodKey>` | sorted set | Verified focus minutes per user | Until the period ends, plus a grace window |
| `lb:friends:<user>:<period>` | computed on read | Friends-only view from the sorted set | Not stored |
| `rl:<route>:<user or ip>` | counter with TTL | Rate limiting | Window length |
| `insight:budget:<user>:<month>` | counter | AI call limits | Month |
| BullMQ keys | lists and hashes | Job queues | Managed by BullMQ |

## 8. Timer accuracy, offline PWA and sync

The timer never counts ticks: it stores a start timestamp and derives elapsed time from the clock, so background tabs, refreshes and offline use all stay accurate to the minute.

**Timer model**

- **State is a list of segments,** each with a type (study, pause or break), start and end. Elapsed study time is the sum of study segments; the display recalculates from `Date.now()` every second, and again on tab focus.
- **Recovery.** The active timer state is written to IndexedDB on every change and, when online, to the server via `POST /sessions/start`. On page load the client restores from IndexedDB, then reconciles with the server's open session.
- **Countdown mode and Pomodoro** are client-side phase plans over the same segments; the phase end fires a Notification API alert and a sound, and a scheduled server-side check ends any session left open past its planned length plus a grace period.
- **Clock drift.** On session start and stop the server compares the client's timestamp with its own; a drift beyond 2 minutes marks the session unverified for leaderboards and stores the server's time instead.

**Offline flow**

1. The service worker (Workbox) caches the app shell so the timer page opens without a connection.
2. Sessions finished offline are saved in IndexedDB with a client-generated UUID (`client_id`).
3. When connectivity returns, the client sends the queue to `POST /sessions/sync` in one batch (background sync where the browser supports it, otherwise on next app open).
4. The server validates each session (caps, overlaps, drift), inserts it once thanks to the unique (user, client\_id) constraint, and returns saved ids and any rejections.
5. Offline sessions are marked verified only if the client-reported segments pass the same checks as online ones and their timestamps fit within the server's drift limits; otherwise they count for the user's own stats but not the leaderboard.

**Idle check.** While a session runs, the client shows a "still studying?" prompt at a configurable interval (default 25 minutes; the interval is a product decision). Time since the last confirmation is discarded if unanswered after a 5-minute grace period, in line with the product PRD.

**Browser limits to plan for.** iOS Safari has weaker background sync and may pause timers in suspended tabs; that is why elapsed time comes from timestamps and never from an interval counter. Ambient sound loops should be cached in the service worker for offline play.

## 9. Leaderboards, streaks, XP and anti-cheat pipeline

Every saved session passes through one pipeline that verifies it, then updates totals, XP, streaks and leaderboards in a fixed order, so all numbers agree and can be replayed from the sessions table.

**Session-end pipeline** (runs as a BullMQ job, target under 10 seconds end to end)

1. **Validate.** Check the session against the rules table below; set the `verified` flag.
2. **Update `daily_totals`.** Split sessions that cross midnight in the user's time zone across both days.
3. **Award XP.** 1 XP per focused minute, capped at 4 hours per session; write `xp_events` rows; bonus XP for daily goal, syllabus topics and streak days (capped at 100 a day). Unique keys prevent double awards on retry.
4. **Update streak.** Compare the day's minutes with the user's minimum (default 15); apply the weekly freeze automatically on the first missed day in a week; update the longest streak.
5. **Update leaderboards.** Increment the user's verified minutes in the daily, weekly and monthly Redis sorted sets for their category, skipping users who opted out of public rankings.
6. **Notify.** Emit real-time events (presence stopped, leaderboard tick) and queue an insight refresh if the period is closing.

**Anti-cheat rules**

| Rule | Enforced where | Effect |
| --- | --- | --- |
| Idle prompt unanswered after grace period | Client prompt + server discard | Unconfirmed time removed from the session |
| Daily cap on logged hours (proposed default 16) | Validate step | Excess time not counted |
| Session longer than cap (proposed 4 h for XP) | XP step | XP capped, time still counted |
| Manual entries | Validate step | `verified = false`; excluded from leaderboards; earn no XP |
| Overlapping sessions for one user | Validate step | Later session rejected |
| Client clock drift over 2 minutes | Session start and stop | Server time used; session unverified |
| Heartbeat gaps while the session claims to be live | Presence records | Time in the gap flagged for review |
| Unusual patterns (for example many maximum-length days in a row) | Nightly job | Flag for review, no automatic ban |

The numeric defaults come from the product PRD's proposals and are configuration values, not code.

**Leaderboard reads**

- Top N and the user's own rank come from `ZREVRANGE` and `ZREVRANK`; friends-only view reads scores for the friend list from the same set.
- Keys are named with the period key computed in each user's zone, so the daily board of a user in Mumbai and one in New York are different boards. Category boards therefore mix time zones, which is a product decision to confirm (see section 14).
- The rankings update within 1 minute of a session ending because the pipeline is queued, not batched; a nightly job rebuilds the sorted sets from `daily_totals` to repair drift.
- Ties break by earlier time of reaching the score, kept as a secondary value in the score's fractional part.

## 10. AI study insights architecture

Insights are a two-stage pipeline: a rule engine in plain Node code finds the facts, and an optional Anthropic API call only rewrites those facts as friendly text, so numbers are always computed by code and never invented by the model.

**Pipeline**

1. **Schedule.** A BullMQ repeatable job runs at the end of each user's local week and month, only for users who opted in.
2. **Aggregate.** Queries on `daily_totals`, `sessions`, goals, syllabus progress and exams produce a small JSON summary per user: best time-of-day bucket, hours per subject against goal, streak, days to exam and hours needed per day.
3. **Rules.** Deterministic rules turn the summary into candidate findings, each with its source numbers (for example, Physics 3.5 h logged against 6 h planned).
4. **Phrase.** Phase A ships rule-based text templates only. Phase B sends the findings JSON to the Anthropic API and asks for a short, plain-language card; the response is validated against the findings so it cannot add numbers that are not in the input.
5. **Store.** The card and its source numbers are saved once per user and period in `insights` and served from the database afterwards.

**Suggest a plan.** A user-triggered endpoint sends exam dates, syllabus completion and weekly availability to the API and receives a structured plan (JSON validated with Zod). The user accepts, edits or dismisses it; accepted plans become planner goals and tasks.

**Controls**

| Concern | Control |
| --- | --- |
| Privacy | Only aggregated study data is sent: no email, username, notes, or room and friend data; opt-in at onboarding, switch-off in settings, which also stops the jobs |
| Cost | One generation per user per period, cached; monthly per-user call budget in Redis; a global daily spend ceiling that pauses generation and falls back to templates |
| Safety | System prompt limits output to study-planning advice; no medical or mental health advice; output length and schema checked before saving |
| Reliability | Job retries with backoff; on failure the rule-based card is shown instead |
| Key handling | API key held only in the worker's environment; never sent to the browser |
| Model choice | Configurable via an environment variable; start with a small, low-cost model for phrasing and review cost after launch |

**Session notes.** Free-text notes stay out of the insight prompt by default; using them would need a separate opt-in, since they can hold personal details.

## 11. Security, privacy and moderation

Security rests on a few enforced layers: hashed credentials, short-lived tokens, validation on every input, rate limits on abuse-prone routes, and one central visibility check for anything another user can see.

| Area | Design |
| --- | --- |
| Passwords | argon2id hashing; minimum length check; breached-password check optional |
| Sessions and tokens | 15-minute JWT access token; rotating refresh token stored hashed, in an httpOnly, secure, SameSite cookie; refresh reuse revokes the token family |
| Social login | Google via OIDC with state and PKCE; account linking by verified email only |
| Transport | HTTPS and HSTS everywhere; WebSocket over WSS |
| Input safety | Zod validation on every route; parameterised queries via Prisma; output encoding in React; strict Content-Security-Policy through Helmet |
| CSRF and CORS | SameSite cookies plus a CSRF token on cookie-authenticated writes; CORS allow-list of the web origin only |
| Rate limiting | Redis-backed limits on login, register, friend requests, room joins, chat and insight requests; stricter limits by IP for unauthenticated routes |
| Authorization | Ownership checks in the service layer (own sessions, own rooms); room roles for owner actions |
| Privacy | A single `canView(viewer, target, field)` function applies friend, everyone and nobody settings, blocks and leaderboard opt-out to every read of another user's data |
| Secrets | Environment variables from the host's secret store; no secrets in the repository; separate keys per environment |
| Data ownership | CSV export from `/me/export.csv`; account deletion removes all rows and queues cache cleanup |
| Logging | No passwords, tokens or note text in logs; user ids only |
| Dependencies | Automated dependency audit and update pull requests; lockfile committed |

**Moderation.** Report and block in rooms and chat; owners can remove members; a profanity filter checks usernames and chat messages; reports land in a `reports` table with a simple admin review page (protected admin role) in a later phase.

**Minors.** The minimum age and handling of minors' data are undecided in the product PRD. The architecture supports a date-of-birth field at signup, a lower-visibility default for under-age-of-majority users, and turning off public rooms and chat for them; the policy itself needs a legal decision before launch.

## 12. Infrastructure, deployment, CI/CD and observability

Start on a managed platform with three running pieces (API, worker, web) plus managed Postgres and Redis, so a small team runs almost no servers of its own.

**Environments.** Local (Docker Compose with Postgres and Redis), staging (auto-deployed from `main`) and production (deployed from a tagged release, with manual approval).

| Component | Recommended hosting | Notes |
| --- | --- | --- |
| Web (React PWA) | Static hosting with CDN (Cloudflare Pages, Netlify or Vercel) | Immutable hashed assets; service worker served with no-cache |
| API + Socket.IO | Container on Render, Railway or Fly.io | 2 instances minimum in production; sticky sessions or WebSocket-only transport for Socket.IO |
| Worker | Same image, second process | Runs BullMQ workers and scheduled jobs; scaled separately |
| PostgreSQL | Managed (Neon, Supabase, Render or RDS) | Daily backups, point-in-time recovery, connection pooling |
| Redis | Managed (Upstash or Redis Cloud, or the platform's Redis) | Persistence on so queues survive restarts |
| DNS, TLS, DDoS | Cloudflare | Proxy with WebSocket support |

The deployment target is Kubernetes (section 12a); this table lists the platform options considered before that decision, and the Postgres and Redis rows still apply as managed services.

**CI/CD (GitHub Actions)**

1. On every pull request: install with pnpm, lint, type-check, unit tests, API tests against Postgres and Redis service containers.
2. On merge to `main`: build the Docker image, run Prisma migrations against staging, deploy, run Playwright smoke tests.
3. On release tag: run migrations on production (backward-compatible only), deploy API and worker, then web.

**Observability**

- **Logs:** pino JSON, shipped to the platform's log service with request ids.
- **Errors:** Sentry for API, worker and web.
- **Metrics:** request latency, WebSocket connections, queue depth and job failures, session-end pipeline duration, leaderboard update lag, Postgres slow queries.
- **Alerts:** API error rate, queue backlog over threshold, pipeline lag above 60 seconds, Redis memory.
- **Health checks:** `/healthz` (process) and `/readyz` (Postgres and Redis reachable).

**Backups and recovery.** Postgres point-in-time recovery; Redis treated as rebuildable (a rebuild job restores leaderboards from `daily_totals`). Restore drill before launch.

## 12a. Docker and Kubernetes deployment

The app ships as two container images (one for the API and worker, one for the web app) and runs on Kubernetes, with PostgreSQL and Redis best kept outside the cluster as managed services. This replaces the platform hosting options listed in section 12.

&#91;embedded content: Kubernetes topology · 3 workloads, 2 data stores\]

Traffic enters through the Ingress and reaches web or api pods; the worker takes no inbound traffic and only pulls jobs from Redis. A migration Job runs before each rollout, and a NetworkPolicy limits database access to api and worker pods.

**Images**

| Image | Built from | Runs | Notes |
| --- | --- | --- | --- |
| `study-tracker-api` | `apps/api`, multi-stage build on Node 22 Alpine | `node dist/server.js` (API) or `node dist/worker.js` (worker) | One image, two commands; non-root user; production dependencies only |
| `study-tracker-web` | `apps/web` Vite build, served by nginx | Static PWA | Hashed assets cached long; `index.html` and the service worker file never cached; unknown paths fall back to `index.html` |

Images are tagged with the git commit SHA (plus a version tag on releases); manifests never use `latest`.

**API and worker Dockerfile** (a starting point: check the pnpm and Prisma steps against the versions you install)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter shared build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/packages/shared/dist packages/shared/dist
RUN pnpm --filter api exec prisma generate
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

The worker Deployment reuses this image and overrides the command. Keep `prisma` in the API's regular dependencies so generate and migrate work inside the image.

**Local development with Docker Compose**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: tracker
    ports: ['5432:5432']
  redis:
    image: redis:7
    command: ['redis-server', '--appendonly', 'yes']
    ports: ['6379:6379']
  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    env_file: .env
    depends_on: [postgres, redis]
    ports: ['3000:3000']
  worker:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    command: ['node', 'dist/worker.js']
    env_file: .env
    depends_on: [postgres, redis]
```

**Kubernetes resources**

| Resource | Purpose | Key settings |
| --- | --- | --- |
| Namespaces | One per environment (`study-tracker-staging`, `study-tracker-prod`) | Separate secrets, quotas and data stores per namespace |
| `api` Deployment + Service | REST and Socket.IO | 2 replicas minimum; rolling update with `maxUnavailable: 0`; readiness `/readyz`, liveness `/healthz`; 30 s termination grace |
| `worker` Deployment | BullMQ workers and scheduled jobs | 1 to 2 replicas; no Service; same env as api |
| `web` Deployment + Service | nginx serving the PWA | 2 replicas; readiness on `/` |
| Ingress | TLS, routing, WebSocket | NGINX ingress controller; cert-manager for certificates; read and send timeouts raised for sockets |
| HorizontalPodAutoscaler | Scale api | CPU and memory targets; worker scaling on queue depth is optional (KEDA) |
| PodDisruptionBudget | Survive node drains | `minAvailable: 1` for api and web |
| Migration Job | Apply schema changes | Helm pre-upgrade hook running `prisma migrate deploy`; only backward-compatible migrations |
| ConfigMap + Secret | Configuration | Non-secret values in ConfigMap; database URL, JWT keys, OAuth and Anthropic keys in Secrets |
| NetworkPolicy | Limit reach | Data stores accept traffic from api and worker pods only |
| ResourceQuota, LimitRange | Cost and safety | Per-namespace ceilings and default requests |

The manifests are packaged as one Helm chart with a values file per environment (Kustomize is an acceptable alternative).

**Sample API Deployment** (values are starting points to tune after load testing)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: study-tracker-prod
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      terminationGracePeriodSeconds: 30
      securityContext: { runAsNonRoot: true }
      containers:
        - name: api
          image: REGISTRY/study-tracker-api:GIT_SHA
          command: ['node', 'dist/server.js']
          ports: [{ containerPort: 3000 }]
          envFrom:
            - configMapRef: { name: app-config }
            - secretRef: { name: app-secrets }
          readinessProbe:
            httpGet: { path: /readyz, port: 3000 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: 3000 }
            periodSeconds: 10
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { memory: 512Mi }
```

**Sample Ingress** (replace the host with your domain)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: study-tracker
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
    nginx.ingress.kubernetes.io/proxy-read-timeout: '3600'
    nginx.ingress.kubernetes.io/proxy-send-timeout: '3600'
spec:
  ingressClassName: nginx
  tls:
    - hosts: [app.example.com]
      secretName: app-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - { path: /api, pathType: Prefix, backend: { service: { name: api, port: { number: 3000 } } } }
          - { path: /socket.io, pathType: Prefix, backend: { service: { name: api, port: { number: 3000 } } } }
          - { path: /, pathType: Prefix, backend: { service: { name: web, port: { number: 80 } } } }
```

**Rules for running on Kubernetes**

1. **Sockets across pods.** The Redis adapter (section 6) lets any api pod serve any user. Configure the client for WebSocket-only transport so no sticky sessions are needed; if polling stays enabled, turn on cookie affinity at the Ingress.
2. **Graceful shutdown.** On SIGTERM the api stops accepting new connections, finishes in-flight requests, closes sockets (clients reconnect on their own) and exits inside the 30 s grace period; the worker finishes or requeues its current job.
3. **Config from the environment.** One image per commit, promoted unchanged from staging to production; only values differ.
4. **Health endpoints.** `/healthz` reports the process is alive; `/readyz` also checks Postgres and Redis so a pod without them receives no traffic.
5. **Logs and metrics.** Everything logs to stdout as JSON for the cluster's log agent; the api exposes `/metrics` for Prometheus (request latency, socket count, queue depth).
6. **Stateful data stays out.** Managed Postgres and Redis are preferred; running them in the cluster needs an operator (for example CloudNativePG) and tested backups, which is a heavier operating load.

**Deploy pipeline (extends section 12)**

1. On merge to `main`: build both images, scan them (for example with Trivy), push to the registry tagged with the commit SHA.
2. Deploy to staging with `helm upgrade --install --atomic`; the migration Job runs first.
3. Run the post-deploy smoke tests (section 12b) against staging.
4. On a release tag and manual approval: deploy the same image tags to production the same way.
5. Roll back with `helm rollback`; because migrations are backward compatible, the previous version keeps working against the new schema.

## 12b. Testing strategy

Testing concentrates on the parts users must be able to trust: study-time accuracy, streak and day-boundary logic, anti-cheat rules, real-time delivery and offline sync. Everything runs in TypeScript with one toolchain, and every check runs automatically in CI before a release.

**Test layers**

| Layer | Tool | What it covers | Runs |
| --- | --- | --- | --- |
| Unit | Vitest | Pure logic: time maths, XP rules, streak rules, anti-cheat validators, `canView` privacy check, Zod schemas | Every pull request; under 1 minute |
| Integration (API + database) | Vitest + Supertest + Testcontainers (real PostgreSQL and Redis in Docker) | Routes, services, Prisma queries, migrations, BullMQ pipeline, rate limits | Every pull request |
| Real-time | Vitest + `socket.io-client` against a test server with two instances on a shared Redis | Presence, room events, heartbeat expiry, cross-instance delivery | Every pull request |
| Frontend component | Vitest + Testing Library | Timer display, heatmap rendering, forms, theme switch | Every pull request |
| End-to-end | Playwright | Full user journeys in a real browser, including offline mode and two users at once | Merge to `main` and after each staging deploy |
| Accessibility | `axe-core` inside Playwright | Keyboard use, contrast for subject colors and heatmap, non-color cues | Merge to `main` |
| PWA quality | Lighthouse CI | Installability, offline shell, performance budget | Merge to `main` |
| Load and performance | k6 | Dashboard time, socket fan-out, leaderboard writes | Before Phase 2 and each release candidate |
| Security | Dependency audit, container image scan, OWASP ZAP baseline scan | Known vulnerabilities, common web flaws | Every pull request (audit, scan); weekly (ZAP) |
| Deployment smoke | Playwright or `curl` scripts | `/readyz`, login, start and stop a session, socket connect | After every deploy, staging and production |

**Environments and test data**

- **Real services, not mocks, for data.** Integration tests start PostgreSQL and Redis with Testcontainers, apply migrations, and reset data between tests, so queries and constraints are tested as they run in production.
- **Controlled time.** All code reads time from one injectable clock, so tests can freeze it, cross midnight, move between time zones and simulate daylight-saving changes.
- **Seed data builders.** Factory functions create users, subjects, sessions and rooms with sensible defaults, so each test states only what it cares about.
- **External services faked.** Google login uses a mock OIDC provider; the Anthropic API is replaced by a stub returning fixed text or errors. No test spends real money or needs internet.
- **Staging** mirrors production in Kubernetes, with its own database, and runs the end-to-end and smoke suites.

**Quality gates (proposed defaults, adjust once the code exists)**

| Gate | Rule |
| --- | --- |
| Pull request merge | Lint, type-check, unit, integration, real-time and component tests all pass |
| Coverage | At least 80% line coverage on services and validators; 100% of the anti-cheat, streak and XP rules covered by named test cases (section 12c) |
| Release | End-to-end, accessibility and smoke suites pass on staging; no critical or high vulnerabilities open |
| Performance | Dashboard under 2 seconds on 4G with mid-range phone throttling; room presence within 2 seconds; rankings within 1 minute (targets from the product PRD) |

**Practices**

1. **Test-first for the trust rules.** Write the failing test for a streak, XP or anti-cheat rule before the code.
2. **Every bug gets a test.** A fix merges only with a test that failed before it.
3. **No shared state.** Tests run in parallel, each with its own data.
4. **Flaky tests are fixed or removed within a week**, never retried indefinitely.
5. **Manual checks stay small.** Real-phone testing of the timer in background tabs (iOS Safari and Android Chrome) before Gate 1, since browsers differ there.

## 12c. Test cases

These are the acceptance checks for every feature, tied to the product PRD's acceptance criteria and the trust rules in sections 8 and 9. Each ID is stable so it can be used as the test name in code. Levels: Unit, API (route plus database), Realtime (socket tests), E2E (browser), Load, Manual. Numeric limits such as the 16-hour daily cap are the proposed defaults and change with the configuration.

**Accounts and security**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| AUTH-01 | Register with a valid email and password | Account created; password stored as an argon2id hash, never plain text | API |
| AUTH-02 | Register with an email that already exists | Rejected with a conflict error; no second user | API |
| AUTH-03 | Six failed logins in one minute from one address | Later attempts rate-limited | API |
| AUTH-04 | Call an endpoint with an expired access token and a valid refresh cookie | New access token issued; refresh token rotated | API |
| AUTH-05 | Reuse a refresh token after it was rotated | Token family revoked; user must log in again | API |
| AUTH-06 | Google login with a verified email that matches an existing account | Identity linked to that account; no duplicate user | API |
| AUTH-07 | Delete the account | All user rows removed; presence and leaderboard entries cleared | API |
| AUTH-08 | Download the CSV export | Only the user's own sessions; columns date, subject, start, end, duration, note | API |
| SEC-01 | Send SQL injection strings in the session search parameter | Treated as plain text; no error and no extra rows | API |
| SEC-02 | Request another user's session by its id | Refused (not found or forbidden) | API |
| SEC-03 | Send a write with cookie auth and no valid CSRF token | Rejected | API |
| SEC-04 | Fetch the web app and the API | CSP, HSTS and other Helmet headers present | API |
| SEC-05 | Run a login and a session save, then inspect logs | No passwords, tokens or note text in the logs | API |

**Timer and sessions**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| TMR-01 | Start a timer on a subject, study 30 minutes, stop | One session of 30 minutes saved against that subject | E2E |
| TMR-02 | Pause for 10 minutes inside a 40-minute session | Study time 30 minutes; paused seconds 600 | Unit |
| TMR-03 | Take a break during a session | Break seconds stored separately; not counted as study time | Unit |
| TMR-04 | Refresh the page or close the tab mid-session, then reopen | Session restored with correct elapsed time | E2E |
| TMR-05 | Keep the tab in the background for 20 minutes | Elapsed time matches the clock to the minute | E2E |
| TMR-06 | Start a second session while one is open | Second start rejected | API |
| TMR-07 | Save several sessions in one day | Day total equals the sum of saved sessions to the minute (product PRD acceptance) | API |
| TMR-08 | Study from 23:50 to 00:20 in the user's zone | Minutes split across the two local days | Unit |
| TMR-09 | Add a manual entry | Saved with source manual and verified false | API |
| TMR-10 | Run a 25/5 Pomodoro | Alert and sound at phase end; break starts; break not counted | E2E |
| TMR-11 | Save a session whose end is before its start | Rejected | API |
| TMR-12 | Change subject color or name after sessions exist | Old sessions keep their link and show the new color | API |

**Offline and sync**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| OFF-01 | Go offline, run and stop a session | Saved in the browser and shown in the local log | E2E |
| OFF-02 | Reconnect after OFF-01 | Session uploaded once and visible on the server | E2E |
| OFF-03 | Send the same sync batch twice | One session only (unique client id) | API |
| OFF-04 | Sync an offline session that overlaps an existing one | Rejected with a reason in the response | API |
| OFF-05 | Open the installed app with no network after one visit | App shell and timer load | E2E |
| OFF-06 | Sync a session whose timestamps drift more than 2 minutes from server time | Saved with server time; not verified for leaderboards | API |

**Anti-cheat**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| CHT-01 | Leave the "still studying?" prompt unanswered past the grace period | Unconfirmed time removed from the session | E2E |
| CHT-02 | Save a 5-hour session | XP capped at 4 hours' worth; full time still counted | Unit |
| CHT-03 | Log more than the daily cap in one day | Excess time not counted | Unit |
| CHT-04 | Start a session with the device clock 5 minutes ahead | Server time used; session not verified | API |
| CHT-05 | Add manual entries | Not on leaderboards and earn no XP | API |
| CHT-06 | Finish a session flagged idle | No XP awarded | Unit |
| CHT-07 | Log a maximum-length day on many days in a row | Nightly job flags the account for review; no automatic ban | API |

**Streaks, XP, levels and goals**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| STK-01 | A day with 14 minutes, then a day with 15 (default minimum) | 14 does not extend the streak; 15 does | Unit |
| STK-02 | User sets a 30-minute minimum | Rule uses 30 minutes | Unit |
| STK-03 | Miss one day while a freeze is available | Streak kept; freeze marked used | Unit |
| STK-04 | Miss a second day in the same week | Streak resets; longest streak kept | Unit |
| STK-05 | Study across midnight in Asia/Kolkata | Each local day counted separately | Unit |
| STK-06 | Streak check on a daylight-saving change day in America/New\_York | Day boundaries correct; no lost or double day | Unit |
| XP-01 | Study 60 focused minutes with pauses and a break | 60 XP; paused and break time earn none | Unit |
| XP-02 | Meet the daily goal, then retry the job | +50 XP once only | API |
| XP-03 | Trigger all bonuses in one day | Streak bonus capped at 100 for the day | Unit |
| XP-04 | Mark a syllabus topic done | +20 XP once per topic | API |
| XP-05 | Cross a level threshold | Level rises; early levels need less XP than later ones | Unit |
| GOL-01 | Set daily and weekly hour targets and log time | Progress ring matches logged minutes; review shows met or missed | E2E |

**Planner, syllabus, exams and statistics**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| PLN-01 | Create 3 daily goals, then a 4th | First three saved; fourth rejected | API |
| PLN-02 | Check off a task and reload | Task still shown as done | E2E |
| PLN-03 | Open the end-of-day review | Shows goals met, tasks done, total time logged, optional reflection note | API |
| PLN-04 | Carry over unfinished tasks | Copied to tomorrow marked as carried over; done tasks not copied | API |
| SYL-01 | Paste a plain-text list of topics | Nested topics created in the same order | API |
| SYL-02 | Mark every topic in a subject done | Completion shows 100% | E2E |
| EXM-01 | Add an exam with a target total of hours | Days left and required average hours per day shown correctly | Unit |
| STA-01 | Open the heatmap after logging different amounts per day | Color deepens with hours; each cell also has a non-color cue (text or pattern) | E2E |
| STA-02 | Open the subject breakdown for a week | Uses each subject's color; totals equal the sum of that week's sessions | API |
| STA-03 | Toggle light, dark and system theme | Choice applied and saved to the account | E2E |

**Rooms and real-time**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| RTM-01 | A member starts a session | Others see status, subject and live time within 2 seconds (product PRD acceptance) | Realtime |
| RTM-02 | The member stops the session | Others see the change within 2 seconds | Realtime |
| RTM-03 | Stop sending heartbeats for more than 90 seconds | User shows as offline | Realtime |
| RTM-04 | Two members connected to different API instances | Both receive every event | Realtime |
| RTM-05 | Join a private room with a wrong code, then the right code | Wrong code refused; right code accepted | API |
| RTM-06 | A non-member tries to join a room's socket channel | Refused | Realtime |
| RTM-07 | Owner removes a member | Member's socket leaves; cannot rejoin without a new invite | Realtime |
| RTM-08 | A blocked user studies in a shared room | Blocker receives no presence events for that user | Realtime |
| RTM-09 | A member sets status visibility to nobody | Others see them as hidden, without subject or time | API |
| RTM-10 | Send a chat message over 300 characters, one with profanity, and a rapid burst | Long message rejected; profanity filtered; burst beyond the limit refused | Realtime |
| RTM-11 | Drop and restore the connection | Client refetches room state, then resumes live events | E2E |
| RTM-12 | Report a member | Report row created; reporter and target recorded | API |

**Friends and privacy**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| FRD-01 | Send and accept a friend request by username | Each sees the other's streak, level, status and weekly time | API |
| FRD-02 | Set status visibility to friends and view as a non-friend | Status not returned | API |
| FRD-03 | Block a friend | Friendship removed; no requests or presence between them | API |
| FRD-04 | Send friend requests in a rapid flood | Rate limited | API |
| FRD-05 | Run `canView` for every field and every setting (everyone, friends, nobody) with friend, stranger and blocked viewers | Result matches the rules table in every combination | Unit |

**Leaderboards**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| LBD-01 | End a verified session | User's daily, weekly and monthly scores update within 1 minute (product PRD acceptance) | API |
| LBD-02 | View the college board as a school-category user | User does not appear on the college board | API |
| LBD-03 | Opt out of public rankings | Absent from public boards; own stats still shown | API |
| LBD-04 | Switch to friends only | Only accepted friends listed | API |
| LBD-05 | Two users with the same score | The one who reached it first ranks higher | Unit |
| LBD-06 | Cross midnight in the user's zone | Daily board period rolls over at the user's local midnight | Unit |
| LBD-07 | Flush Redis, then run the rebuild job | Boards return to the same scores computed from `daily_totals` | API |
| LBD-08 | Verified and unverified sessions on the same day | Only verified minutes count | API |

**AI insights**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| INS-01 | User has not opted in, weekly job runs | No insight created; no API call made | API |
| INS-02 | Run the job twice for one period | One stored insight; second run returns it without a new API call | API |
| INS-03 | Read an insight's source numbers | Match the database aggregates exactly | API |
| INS-04 | Stub returns text with a number not in the input | Output rejected; rule-based card shown instead | Unit |
| INS-05 | Stub returns errors | Job retries, then falls back to the rule-based card | API |
| INS-06 | Inspect the request sent to the API | No email, username, session notes or room and friend data | Unit |
| INS-07 | Monthly per-user budget used up | No call made; template card shown | API |
| INS-08 | Switch insights off in settings | Scheduled jobs stop for that user | API |

**Docker and Kubernetes deployment**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| DEP-01 | Build and run the API image with only environment variables | Starts as a non-root user and answers `/healthz` | Manual |
| DEP-02 | Stop Postgres and call `/readyz`, then restore it | Not ready while down; ready again after | API |
| DEP-03 | Roll out a new version while users have open sockets | Clients reconnect; no saved session lost | E2E |
| DEP-04 | Send SIGTERM during an in-flight request | Request completes; process exits within the 30 s grace period | API |
| DEP-05 | Apply a migration on a staging copy, then run the previous API version | Previous version still works | Manual |
| DEP-06 | Run `helm rollback` after a bad release | Previous version restored; smoke tests pass | Manual |
| DEP-07 | From a pod outside api and worker, connect to Postgres and Redis | Connection blocked by the NetworkPolicy | Manual |
| DEP-08 | Scale api from 2 to 3 replicas during a room session | Presence and leaderboard stay consistent | E2E |
| DEP-09 | Kill the worker pod while jobs are queued | Jobs resume after restart; no duplicate XP | API |

**Performance**

| ID | Test case | Expected result | Level |
| --- | --- | --- | --- |
| PRF-01 | Load the dashboard with throttled 4G and a mid-range phone profile | Loads in under 2 seconds | Load |
| PRF-02 | Ramp k6 to the online-user level assumed for launch in section 13 | Room events stay within 2 seconds; error rate stays low | Load |
| PRF-03 | Finish many sessions at once | Session-end pipeline completes each within 10 seconds; leaderboard lag under 1 minute | Load |
| PRF-04 | Request a full-year heatmap for a user with a year of sessions | Answer returned within the dashboard budget | Load |

## 13. Scaling and cost plan

The first bottlenecks will be WebSocket connections and leaderboard writes, not the database; each has a known next step. Figures below are planning estimates, not measurements, and should be replaced by load-test results before launch.

| Stage | Approximate scale (assumption) | What changes |
| --- | --- | --- |
| Launch | Up to about 5,000 registered users, a few hundred online at once | 2 API instances, 1 worker, small managed Postgres and Redis |
| Growth | About 50,000 users, a few thousand online at once | Scale API instances horizontally; Socket.IO Redis adapter carries fan-out; add a Postgres read replica for stats reads; PgBouncer-style pooling |
| Large | 500,000+ users, tens of thousands online | Split Socket.IO into its own service; partition `sessions` by month; shard leaderboard keys by category; move insight jobs to a dedicated worker pool |

**Known pressure points and mitigations**

- **Presence fan-out in large public rooms:** cap room size (proposed 200 members) and send diffs, not full member lists.
- **Midnight in popular time zones:** many users' days roll over together; stagger daily rollover jobs by zone and keep them idempotent.
- **Heatmap queries:** served from `daily_totals` (at most 366 rows per user per year), cached per user and year with invalidation on write.
- **Leaderboard memory:** one sorted set per category and period; expire finished periods after a grace window.
- **AI spend:** bounded by the once-per-period rule, per-user budget and a global ceiling (section 10).

**Main cost drivers, in likely order:** managed Postgres and Redis, always-on API and WebSocket instances, AI calls once Phase B is on, then observability tooling. Static hosting and CDN are small. Pricing depends on the chosen providers and should be checked at selection time; this document sets no figures. A paid tier for AI insights is an open product question and would affect how much AI budget per user is acceptable.

## 14. Delivery phases, risks and open decisions

Three phases ship in order, and two gates decide when social and ranking features may go live. The grouping below is proposed here, because the product PRD's roadmap graphic could not be read when this document was written; confirm it against that graphic.

&#91;embedded content: delivery roadmap · 3 phases, 2 gates\]

Phase 1 needs only the API, Postgres and the PWA, so Redis, Socket.IO and the worker can be added when Phase 2 begins. The session-end pipeline (section 9) is built in Phase 1 for totals and streaks and extended with XP and leaderboards later.

**Architecture risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Socket.IO connections outgrow the first instances | Room updates slower than 2 seconds | Redis adapter from day one; load test before Phase 2; managed real-time service kept as fallback |
| Timer stops or drifts in suspended mobile tabs, especially iOS Safari | Users distrust their numbers | Timestamp-based timer, IndexedDB recovery, tests on real phones before Gate 1 |
| Fake study time reaches leaderboards | Rankings lose credibility | Verified-only ranking, idle checks, daily cap, Gate 2 before Phase 3 |
| Redis loses data | Wrong leaderboards or presence | Nightly rebuild from `daily_totals`; Postgres stays the record |
| AI text is generic or wrong | Insights ignored | Rule engine computes the facts; model only rephrases; source numbers shown |
| AI spend grows faster than users | Unplanned cost | Once per period, cache, per-user budget, global ceiling |

**Open decisions**

- [ ] Kubernetes platform (managed EKS, GKE or AKS, or self-managed) and where Postgres and Redis run: affects cost, backups and WebSocket setup
- [ ] Category leaderboards mix time zones when periods follow each user's zone: accept this, or fix one reference zone per category
- [ ] Login: this document assumes email and Google together; confirm
- [ ] Minimum age and handling of minors' data (product PRD open question)
- [ ] Whether XP and levels unlock anything or are display-only
- [ ] Free product or a paid tier for AI insights, which sets the AI budget per user
- [ ] Target launch date and team size, so the phases can be scheduled
