# Study Habit Tracker — API Contract

Version 1 · Oct 17, 2026 · @Adi

This file is the single agreement between frontend (Person A), backend core (Person B) and data modules (Person C). **Change an endpoint here first, then announce it to the team, then change the code.**

Items marked **(new)** are not in the architecture document's endpoint list; they were added because a screen needs them.

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `/api` (for example `/api/sessions/start`) |
| Format | JSON in and out. Request header `Content-Type: application/json` |
| Auth | httpOnly cookie named `token`, set at login. The client sends it automatically (`fetch(..., { credentials: "include" })`). Every endpoint except register and login needs it |
| IDs | Strings (UUIDs) |
| Timestamps | ISO 8601 in UTC, for example `"2026-10-17T14:30:00Z"` |
| Dates | Local calendar date as `"YYYY-MM-DD"`, in the user's own time zone |
| Durations | Whole **seconds** (integers) in all payloads. The screen converts to minutes or hours |
| Time zone | IANA name such as `"Asia/Kolkata"`, stored on the user |
| Lists | `?limit=` (default 50, max 200) and `?cursor=` (from the previous response's `next_cursor`). Response shape: `{ "items": [...], "next_cursor": "..." or null }` |
| Naming | `snake_case` for all JSON fields |
| Server clock | The server stamps all session start and stop times. The browser's clock is never trusted |

### Success and error responses

Success returns the resource as JSON (or `{ "ok": true }` when there is nothing to return).

Every error uses one shape:

```json
{
  "error": {
    "code": "SESSION_ALREADY_OPEN",
    "message": "You already have an open session.",
    "fields": { "subject_id": "Required" }
  }
}
```

`fields` appears only for validation errors.

| HTTP status | When | Example `code` |
| --- | --- | --- |
| 200 | OK | |
| 201 | Created | |
| 400 | Invalid input | `VALIDATION_ERROR` |
| 401 | Not signed in or bad login | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | Signed in but not allowed | `FORBIDDEN`, `BLOCKED` |
| 404 | Not found (also used for other users' private data) | `NOT_FOUND` |
| 409 | Conflict | `EMAIL_TAKEN`, `USERNAME_TAKEN`, `SESSION_ALREADY_OPEN`, `SESSION_OVERLAP`, `SUBJECT_NAME_TAKEN`, `GOAL_LIMIT_REACHED` |
| 429 | Rate limited | `RATE_LIMITED` |
| 500 | Server error | `INTERNAL` |

## 2. Shared objects

**User (own profile)**

```json
{
  "id": "u1",
  "email": "adi@example.com",
  "username": "adi",
  "time_zone": "Asia/Kolkata",
  "category": "college",
  "leaderboard_hidden": false,
  "privacy": { "weekly_time": "friends", "subjects": "friends" },
  "xp": 1240,
  "level": 5,
  "streak_minimum_minutes": 15
}
```

`category` is one of `school`, `college`, `competitive_exams`, `professional`.
Privacy values are `everyone`, `friends` or `nobody`.

**Subject**

```json
{ "id": "s1", "name": "Physics", "color": "#4F8EF7" }
```

**Session**

```json
{
  "id": "ss1",
  "subject_id": "s1",
  "started_at": "2026-10-17T14:30:00Z",
  "ended_at": null,
  "status": "running",
  "paused_seconds": 0,
  "break_seconds": 0,
  "segment_started_at": "2026-10-17T14:30:00Z",
  "study_seconds": null,
  "note": null,
  "source": "timer",
  "verified": true
}
```

- `status` is `running`, `paused`, `on_break` or `ended`.
- `segment_started_at` is when the current running, paused or break stretch began. The screen uses it with `paused_seconds` and `break_seconds` to draw elapsed time without asking the server every second.
- `study_seconds` is `null` while the session is open and calculated once at stop: `ended_at - started_at - paused_seconds - break_seconds`.
- `source` is `timer` or `manual`.

**Task**

```json
{ "id": "t1", "text": "Solve chapter 4 problems", "done": false, "carried_over": false }
```

**Syllabus topic**

```json
{
  "id": "tp1",
  "subject_id": "s1",
  "parent_id": null,
  "title": "Mechanics",
  "status": "in_progress",
  "position": 0,
  "children": []
}
```

`status` is `not_started`, `in_progress` or `done`.

## 3. Auth

| Method and path | Purpose |
| --- | --- |
| `POST /auth/register` | Create an account and sign in |
| `POST /auth/login` | Sign in |
| `POST /auth/logout` | Sign out (clears the cookie) |

**`POST /auth/register`**

```json
// request
{
  "email": "adi@example.com",
  "password": "at-least-8-characters",
  "username": "adi",
  "time_zone": "Asia/Kolkata",
  "category": "college"
}
// 201 response: the User object, and the cookie is set
```

Rules: valid email, password at least 8 characters, username 3 to 20 letters, digits or underscore (unique, case-insensitive). Errors: `EMAIL_TAKEN`, `USERNAME_TAKEN`, `VALIDATION_ERROR`.

**`POST /auth/login`**

```json
// request
{ "email": "adi@example.com", "password": "..." }
// 200 response: the User object, and the cookie is set
```

Errors: `INVALID_CREDENTIALS` (same message whether the email or password is wrong), `RATE_LIMITED` after 6 failed attempts per minute.

**`POST /auth/logout`** returns `{ "ok": true }`.

## 4. Current user

| Method and path | Purpose |
| --- | --- |
| `GET /me` **(new)** | Get the signed-in user's profile |
| `PATCH /me` **(new)** | Update time zone, category, username, privacy, leaderboard opt-out |
| `GET /me/xp` | XP and level |
| `GET /me/streak` | Streak status |
| `GET /me/goals` | Study targets and streak minimum |
| `PUT /me/goals` | Update study targets and streak minimum |
| `GET /me/export.csv` | Download all sessions as CSV |
| `DELETE /me` | Delete the account and all data |

**`PATCH /me`** accepts any of: `username`, `time_zone`, `category`, `leaderboard_hidden`, `privacy`. Returns the updated User.

**`GET /me/xp`**

```json
{ "xp": 1240, "level": 5, "xp_in_level": 140, "xp_for_next_level": 400 }
```

**`GET /me/streak`**

```json
{
  "current": 6,
  "longest": 14,
  "today_minutes": 20,
  "minimum_minutes": 15,
  "today_counted": true,
  "freeze_available": true
}
```

**`GET /me/goals`** and **`PUT /me/goals`**

```json
{ "daily_target_seconds": 14400, "weekly_target_seconds": 72000, "streak_minimum_minutes": 15 }
```

`GET /me/goals` also returns progress:

```json
{
  "daily_target_seconds": 14400,
  "weekly_target_seconds": 72000,
  "streak_minimum_minutes": 15,
  "today_seconds": 5400,
  "week_seconds": 30000
}
```

**`GET /me/export.csv`** returns a file with the header `date,subject,start,end,duration_minutes,note`. Only the signed-in user's sessions.

**`DELETE /me`** requires `{ "password": "..." }`. Returns `{ "ok": true }` and clears the cookie.

## 5. Subjects

| Method and path | Purpose |
| --- | --- |
| `GET /subjects` | List own subjects |
| `POST /subjects` | Create a subject |
| `PATCH /subjects/:id` | Rename or recolor |
| `DELETE /subjects/:id` | Delete a subject (and its sessions, syllabus and exams) |

```json
// POST /subjects request
{ "name": "Physics", "color": "#4F8EF7" }
// 201 response: the Subject object
```

Rules: name 1 to 40 characters, unique per user (`SUBJECT_NAME_TAKEN`); color is a hex value like `#RRGGBB`. Renaming or recoloring keeps old sessions linked.

`DELETE` returns `{ "ok": true }`. The screen must ask for confirmation first because sessions are removed too.

## 6. Sessions (timer)

| Method and path | Purpose |
| --- | --- |
| `POST /sessions/start` | Start a session |
| `GET /sessions/active` | Get the open session, if any (used for recovery after refresh) |
| `POST /sessions/:id/pause` | Pause (paused time is not counted) |
| `POST /sessions/:id/break` | Start a break (not counted as study time) |
| `POST /sessions/:id/resume` | End a pause or a break |
| `POST /sessions/:id/stop` | Stop and save |
| `POST /sessions/manual` | Add a forgotten session |
| `GET /sessions` | List and search past sessions |
| `DELETE /sessions/:id` **(new)** | Delete one of your own sessions |

**`POST /sessions/start`**

```json
// request
{ "subject_id": "s1" }
// 201 response: the Session object with status "running"
```

Error: `SESSION_ALREADY_OPEN` if an open session exists (the response also includes the open session in `error.open_session`).

**`GET /sessions/active`** returns the Session object, or `{ "session": null }` if none. Also used by the client on every page load to resume the timer display.

**`POST /sessions/:id/pause`**, **`/break`**, **`/resume`** need no body and return the updated Session. Allowed moves:

| From status | pause | break | resume |
| --- | --- | --- | --- |
| `running` | to `paused` | to `on_break` | not allowed |
| `paused` | not allowed | not allowed | to `running` |
| `on_break` | not allowed | not allowed | to `running` |

A disallowed move returns 409 with code `INVALID_STATE`.

**`POST /sessions/:id/stop`**

```json
// request (note is optional, max 200 characters)
{ "note": "Finished chapter 4" }
// 200 response
{
  "session": { "...Session with status ended, study_seconds, verified...": "" },
  "summary": {
    "study_seconds": 1800,
    "counted_seconds": 1800,
    "verified": true,
    "xp_awarded": 30,
    "streak": { "current": 6, "longest": 14 },
    "today_seconds": 5400
  }
}
```

`counted_seconds` can be lower than `study_seconds` when the daily cap applies. A stop on a paused or break session ends that stretch first.

**`POST /sessions/manual`**

```json
// request
{
  "subject_id": "s1",
  "started_at": "2026-10-16T16:00:00Z",
  "ended_at": "2026-10-16T17:00:00Z",
  "note": "Forgot to start the timer"
}
// 201 response: the Session object with source "manual", verified false
```

Rules: end after start; not in the future; not overlapping another session (`SESSION_OVERLAP`). Manual sessions never reach leaderboards and earn no XP.

**`GET /sessions?from=2026-10-01&to=2026-10-17&q=chapter&subject_id=s1&limit=50&cursor=...`**

All filters are optional. `from` and `to` are local dates. `q` searches notes. Returns `{ "items": [Session...], "next_cursor": ... }`, newest first.

### Server-side limits (configuration values)

| Setting | Default |
| --- | --- |
| Daily cap on counted study time | 16 hours |
| Maximum session length | 12 hours; the server ends longer open sessions |
| XP cap per session | 4 hours' worth |
| Manual entry | Not verified, no XP, no leaderboard |
| Overlap | Rejected |

## 7. Planner

| Method and path | Purpose |
| --- | --- |
| `GET /planner/:date` | Get goals, tasks and review for a local date |
| `PUT /planner/:date` | Save goals, tasks and reflection for that date |
| `POST /planner/:date/carry-over` | Copy unfinished tasks to the next day |

**`GET /planner/2026-10-17`**

```json
{
  "date": "2026-10-17",
  "goals": [
    { "id": "g1", "text": "Physics", "target_seconds": 7200 }
  ],
  "tasks": [
    { "id": "t1", "text": "Solve chapter 4 problems", "done": true, "carried_over": false }
  ],
  "reflection": null,
  "review": {
    "total_seconds": 5400,
    "goals_met": 0,
    "goals_total": 1,
    "tasks_done": 1,
    "tasks_total": 1
  }
}
```

`review` is calculated by the server from sessions and tasks; the client never sends it.

**`PUT /planner/2026-10-17`** replaces the day's data. Send the full list:

```json
{
  "goals": [{ "text": "Physics", "target_seconds": 7200, "subject_id": "s1" }],
  "tasks": [{ "id": "t1", "text": "Solve chapter 4 problems", "done": true }, { "text": "New task", "done": false }],
  "reflection": "Good focus today."
}
```

Tasks with an `id` are updated, tasks without one are created, tasks missing from the list are deleted. Rules: at most **3 goals** (`GOAL_LIMIT_REACHED`), task text 1 to 200 characters, reflection up to 500 characters. Returns the same shape as `GET`.

**`POST /planner/2026-10-17/carry-over`** copies today's unfinished tasks to the next day marked `carried_over: true`. Done tasks are not copied, and running it twice does not create duplicates. Returns `{ "carried": 2 }`.

## 8. Syllabus

| Method and path | Purpose |
| --- | --- |
| `GET /subjects/:id/syllabus` | Get the topic tree and completion percentage |
| `POST /topics` | Add a topic |
| `PATCH /topics/:id` | Rename, move or change status |
| `DELETE /topics/:id` **(new)** | Delete a topic and its children |
| `POST /subjects/:id/syllabus/import` | Create topics from pasted text |

**`GET /subjects/s1/syllabus`**

```json
{
  "subject_id": "s1",
  "completion_percent": 40,
  "topics_total": 10,
  "topics_done": 4,
  "topics": [ { "...Syllabus topic with nested children...": "" } ]
}
```

**`POST /topics`**: `{ "subject_id": "s1", "parent_id": null, "title": "Mechanics" }`, returns the topic with status `not_started`.

**`PATCH /topics/:id`**: any of `title`, `status`, `parent_id`, `position`. Marking a topic `done` for the first time awards **20 XP once**; setting it back and forth never awards it twice. The response is the topic plus `{ "xp_awarded": 20 }` when XP was given.

**`POST /subjects/:id/syllabus/import`**

```json
{
  "text": "Mechanics\n  Kinematics\n  Dynamics\nOptics\n  Reflection"
}
```

Indentation (two spaces or a tab) sets nesting. Order is kept. Returns `{ "created": 5 }`. Maximum 500 lines.

## 9. Exams

| Method and path | Purpose |
| --- | --- |
| `GET /exams` | List upcoming exams with countdown figures |
| `POST /exams` | Add an exam |
| `PATCH /exams/:id` | Edit |
| `DELETE /exams/:id` | Delete |

```json
// POST /exams request
{ "subject_id": "s1", "date": "2026-12-05", "target_hours": 120 }
```

`GET /exams` item:

```json
{
  "id": "e1",
  "subject_id": "s1",
  "date": "2026-12-05",
  "target_hours": 120,
  "days_left": 49,
  "logged_hours": 36.5,
  "hours_needed_per_day": 1.7
}
```

`target_hours` is optional; when missing, `hours_needed_per_day` is `null`. `logged_hours` counts study time on that subject since the exam was added. Exams in the past are not returned.

## 10. Statistics

All statistics use verified and unverified time for the user's own view (manual entries included). Leaderboards are the only place where unverified time is excluded.

| Method and path | Purpose |
| --- | --- |
| `GET /stats/heatmap?year=2026` | One value per day for the calendar heatmap |
| `GET /stats/progress?range=week\|month\|year` | Study time per day (week, month) or per month (year) |
| `GET /stats/subjects?range=week\|month\|year` | Time per subject |
| `GET /stats/insights` | Rule-based insight lines |

**`GET /stats/heatmap?year=2026`**

```json
{
  "year": 2026,
  "days": [
    { "date": "2026-10-16", "seconds": 7200 },
    { "date": "2026-10-17", "seconds": 5400 }
  ],
  "max_seconds": 14400
}
```

Only days with study time are listed (at most 366 entries).

**`GET /stats/progress?range=week`**

```json
{
  "range": "week",
  "points": [
    { "label": "2026-10-11", "seconds": 3600 },
    { "label": "2026-10-12", "seconds": 0 }
  ],
  "total_seconds": 30000,
  "daily_average_seconds": 4286
}
```

`week` is the last 7 local days, `month` the last 30 local days (one point per day), `year` the last 12 months (one point per month, label `"2026-10"`). Empty days are included with `0`.

**`GET /stats/subjects?range=week`**

```json
{
  "range": "week",
  "subjects": [
    { "subject_id": "s1", "name": "Physics", "color": "#4F8EF7", "seconds": 18000, "percent": 60 }
  ],
  "total_seconds": 30000
}
```

**`GET /stats/insights`**

```json
{
  "items": [
    {
      "kind": "subject_behind",
      "text": "Physics got less time than planned this week.",
      "numbers": { "logged_seconds": 12600, "planned_seconds": 21600 }
    },
    {
      "kind": "best_time",
      "text": "You study most between 6 pm and 8 pm.",
      "numbers": { "start_hour": 18, "end_hour": 20, "share_percent": 35 }
    }
  ]
}
```

Every item carries its `numbers`. The list can be empty when there is not enough data. No AI is used; these are fixed rules.

## 11. Friends

| Method and path | Purpose |
| --- | --- |
| `POST /friends/requests` | Send a request by username |
| `GET /friends/requests` **(new)** | List incoming and outgoing pending requests |
| `PATCH /friends/requests/:id` | Accept or decline |
| `GET /friends` | List friends with their visible stats |
| `DELETE /friends/:id` | Remove a friend |
| `POST /blocks` | Block a user |
| `DELETE /blocks/:userId` **(new)** | Unblock |

**`POST /friends/requests`**: `{ "username": "riya" }`. Returns the request. A user who blocked you, or whom you blocked, gets `NOT_FOUND`. Rate limited.

**`GET /friends/requests`**

```json
{
  "incoming": [{ "id": "r1", "from": { "id": "u2", "username": "riya" } }],
  "outgoing": [{ "id": "r2", "to": { "id": "u3", "username": "sam" } }]
}
```

**`PATCH /friends/requests/:id`**: `{ "action": "accept" }` or `{ "action": "decline" }`. Only the receiver can do this.

**`GET /friends`**

```json
{
  "items": [
    {
      "user_id": "u2",
      "username": "riya",
      "level": 7,
      "streak_current": 12,
      "week_seconds": 36000
    }
  ]
}
```

`week_seconds` is `null` when that friend set weekly time to `nobody`. All fields pass through the single `canView` privacy check. There is no live "studying now" status.

**`POST /blocks`**: `{ "user_id": "u4" }`. Removes any friendship and hides both users from each other everywhere.

## 12. Leaderboards

| Method and path | Purpose |
| --- | --- |
| `GET /leaderboards?period=day\|week\|month&category=college&scope=all\|friends` | Ranking for a period |

`category` defaults to the signed-in user's own category. `scope` defaults to `all`.

```json
{
  "period": "week",
  "category": "college",
  "scope": "all",
  "period_start": "2026-10-12",
  "period_end": "2026-10-18",
  "entries": [
    { "rank": 1, "user_id": "u2", "username": "riya", "level": 7, "seconds": 36000 },
    { "rank": 2, "user_id": "u1", "username": "adi", "level": 5, "seconds": 30000 }
  ],
  "me": { "rank": 2, "seconds": 30000 }
}
```

- `entries` is the top 50.
- Only **verified** time counts; manual entries are excluded.
- Users with `leaderboard_hidden: true` are not listed, and their own `me` is `null` on public boards.
- Periods follow the **signed-in viewer's** time zone (day, Monday-to-Sunday week, calendar month).
- Ties: the user who reached the score first ranks higher.
- The ranking is calculated when requested, so it shows a finished session on the next call.

## 13. Endpoint summary

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout` |
| Me | `GET/PATCH /me`, `GET /me/xp`, `/me/streak`, `GET/PUT /me/goals`, `GET /me/export.csv`, `DELETE /me` |
| Subjects | `GET/POST /subjects`, `PATCH/DELETE /subjects/:id` |
| Sessions | `POST /sessions/start`, `GET /sessions/active`, `POST /sessions/:id/pause`, `/break`, `/resume`, `/stop`, `POST /sessions/manual`, `GET /sessions`, `DELETE /sessions/:id` |
| Planner | `GET/PUT /planner/:date`, `POST /planner/:date/carry-over` |
| Syllabus | `GET /subjects/:id/syllabus`, `POST /topics`, `PATCH/DELETE /topics/:id`, `POST /subjects/:id/syllabus/import` |
| Exams | `GET/POST /exams`, `PATCH/DELETE /exams/:id` |
| Stats | `GET /stats/heatmap`, `/stats/progress`, `/stats/subjects`, `/stats/insights` |
| Friends | `POST /friends/requests`, `GET /friends/requests`, `PATCH /friends/requests/:id`, `GET /friends`, `DELETE /friends/:id`, `POST /blocks`, `DELETE /blocks/:userId` |
| Leaderboards | `GET /leaderboards` |

## 14. Who builds what

| Area | Server | Client |
| --- | --- | --- |
| Auth, Me (profile, XP, streak, goals), Sessions | Person B | Person A |
| Planner, Syllabus, Exams, Stats, Friends, Leaderboards, Export | Person C | Person A |
| Subjects | Person B | Person A |

## 15. Rules for changing this file

1. Edit this file in a pull request; the other two people review it.
2. Adding a field is safe. Renaming or removing one needs everyone's agreement.
3. Update the version line and add a line below.

**Change log**

| Version | Date | Change |
| --- | --- | --- |
| 1 | Oct 17, 2026 | First version |
