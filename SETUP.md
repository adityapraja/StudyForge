# StudyForge — Local Machine Setup Guide

This guide provides a comprehensive, step-by-step walkthrough to set up, configure, and run **StudyForge** locally from scratch.

---

## 1. Tech Stack Overview

- **Frontend:** React 19, Vite, Plain JavaScript, CSS
- **Backend:** Node.js (v20+ or v22+), Express 5, JWT Authentication (httpOnly cookies), Zod
- **Database:** PostgreSQL 16 (via Docker Compose or native PostgreSQL)
- **Testing:** Vitest, Supertest

---

## 2. Prerequisites

Ensure you have the following installed on your machine:

| Requirement | Recommended Version | Verification Command |
| :--- | :--- | :--- |
| **Node.js** | `v20.x` or `v22.x+` | `node -v` |
| **npm** | `v10.x+` | `npm -v` |
| **Docker & Docker Compose** | Docker 24+ / Compose v2+ *(Option A)* | `docker --version && docker compose version` |
| **PostgreSQL** | v14+ *(Option B, if not using Docker)* | `psql --version` |
| **Git** | Any modern version | `git --version` |

---

## 3. Clone and Install Dependencies

### 3.1. Open Project Root
Open your terminal and navigate to the project directory:
```bash
cd /path/to/StudyForge
```

### 3.2. Install Backend Dependencies
```bash
npm --prefix server install
```

### 3.3. Install Frontend Dependencies
```bash
npm --prefix client install
```

---

## 4. Environment Configuration

The backend reads configuration from `.env` in the repository root and `server/.env`.

### 4.1. Create Environment Files
Copy the example configuration file:
```bash
cp .env.example .env
cp server/.env.example server/.env
```

### 4.2. Verify Environment Variables
Ensure both `.env` and `server/.env` contain the following configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database (Port 5434 when using Docker Compose)
DATABASE_URL=postgres://postgres:postgres@localhost:5434/tracker

# Authentication
JWT_SECRET=change-this-to-a-secure-random-secret-at-least-32-chars
JWT_EXPIRES_IN=7d
COOKIE_NAME=token

# CORS Allow-list
CLIENT_URL=http://localhost:5173

# Anti-cheat & Session Rules
DAILY_CAP_HOURS=16
MAX_SESSION_HOURS=12
SESSION_XP_CAP_HOURS=4
DEFAULT_STREAK_MINIMUM_MINUTES=15
```

> [!NOTE]
> In StudyForge, host port **`5434`** is mapped to container port `5432` by default. This ensures zero port conflicts with any native PostgreSQL running on `5432` or the automated test cluster on `5433`.

---

## 5. Database Setup

Choose **Option A (Recommended via Docker)** or **Option B (Native PostgreSQL)**.

### Option A: Using Docker Compose (Recommended)

StudyForge includes a pre-configured [`docker-compose.yml`](docker-compose.yml) file.

1. **Start the PostgreSQL Container:**
   ```bash
   docker compose up -d
   # or using the npm shortcut:
   npm run docker:up
   ```

2. **Verify the Container is Running:**
   ```bash
   docker ps
   ```
   You should see `studyforge-postgres` running and healthy with port mapping `0.0.0.0:5434->5432/tcp`.

3. **Check Container Logs (Optional):**
   ```bash
   docker compose logs -f db
   ```

4. **Stopping the Container:**
   ```bash
   docker compose down
   # or: npm run docker:down
   ```
   *(To wipe all database data and start fresh, run `docker compose down -v`)*

---

### Option B: Using Native PostgreSQL (Without Docker)

If you prefer to run a local PostgreSQL service directly on your host:

1. **Start your PostgreSQL service:**
   ```bash
   # On Linux (systemd)
   sudo systemctl start postgresql

   # On macOS (Homebrew)
   brew services start postgresql@16
   ```

2. **Create the Database:**
   ```bash
   psql -U postgres -c "CREATE DATABASE tracker;"
   ```

3. **Update `.env` and `server/.env`:**
   Change the port in `DATABASE_URL` to match your local PostgreSQL port (usually `5432`):
   ```env
   DATABASE_URL=postgres://<username>:<password>@localhost:5432/tracker
   ```

---

## 6. Automatic Database Schema & Migrations

You **do not** need to manually execute SQL files. 

When you start the backend server in `development` mode (`NODE_ENV=development`):
1. It automatically connects to the database specified in `DATABASE_URL`.
2. It executes [`server/schema.sql`](server/schema.sql) if tables do not exist.
3. It inspects [`server/migrations/`](server/migrations/) and runs all pending migrations in sequential order (`001_planner_phase1.sql`, `002_phase2_xp_bonuses.sql`, etc.), recording them in `schema_migrations`.

---

## 7. Running the Automated Test Suite

Before running the app, you can verify that all 16 test suites (91 test cases) pass:

```bash
npm test
# or: npm --prefix server test
```

> [!TIP]
> The automated test suite runs against an isolated, sandboxed test database instance on port `5433` (`/tmp/test_pgdata`) and does not modify your development database.

---

## 8. Starting the Full Application

To run the complete application (Backend API + Frontend UI), open two terminal windows:

### Terminal 1: Start Backend API Server
From the project root:
```bash
npm run dev
# or: cd server && npm run dev
```

You should see:
```text
[DB] Connected to PostgreSQL successfully.
[DB] Schema verified/initialized.
[Server] StudyForge backend listening on port 3000 (development)
```

---

### Terminal 2: Start Frontend Client
From the project root:
```bash
npm run client:dev
# or: cd client && npm run dev
```

You should see:
```text
  VITE v8.3.4  ready in 150 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## 9. Accessing and Testing the App

Open your browser and navigate to:
👉 **`http://localhost:5173`**

### Step-by-Step Feature Walkthrough:

1. **Register / Login:**
   - Click **Register**, enter username (e.g. `alex`), email, category (`College`), and password.
   - Click **Create account**. You will be authenticated immediately with secure `httpOnly` cookies.
2. **Create Subjects:**
   - Navigate to the **Subjects** tab.
   - Create a subject: Name `Computer Science`, pick a color (e.g. `#3b82f6`).
   - Create a second subject: Name `Calculus`, color `#10b981`.
3. **Timer & Session Tracking:**
   - Go to the **Timer** tab.
   - Select `Computer Science` and click **Start focus**.
   - Test **Pause**, **Short break**, **Resume**, and **Stop & save session**.
   - Test refresh recovery: Start a timer and refresh the browser (`F5`); the timer re-hydrates seamlessly.
4. **Daily Planner:**
   - Go to the **Planner** tab.
   - Add a daily focus goal (max 3 allowed) and to-do tasks.
   - Mark tasks done and test the **Carry over** button for unfinished tasks.
5. **Syllabus & 20 XP Bonus:**
   - Go to the **Syllabus** tab.
   - Add a topic or click **Import** to paste indented topics.
   - Mark a topic as **Done** $\rightarrow$ Observe celebratory **+20 XP** notification!
   - Toggle back to `in_progress` and `done` again $\rightarrow$ Observe database idempotency preventing double awards.
6. **Exams & Countdown:**
   - Go to the **Exams** tab and add an upcoming exam date.
   - View the calculated countdown chip (`X days left`).
7. **Heatmap & Statistics:**
   - Go to the **Statistics** tab to view the annual GitHub-style heatmap, weekly/monthly progress charts, and subject breakdown.
8. **Insights:**
   - Go to the **Insights** tab to inspect rule-based habit analytics (e.g., Burnout Risk, Subject Neglect, Best Study Day).
9. **Weekly Goals:**
   - Go to the **Weekly goals** tab to see the 7-day Monday–Sunday visual target progress grid.
10. **Settings & CSV Export:**
    - Go to **Settings** to update profile and study targets.
    - Click **Download session CSV** to export your study session history.

---

## 10. Troubleshooting & Common Issues

### Issue 1: `failed to bind host port 0.0.0.0:5432/tcp: address already in use`
- **Cause:** Your host machine already has a native PostgreSQL service running on port `5432`.
- **Solution:** StudyForge's [`docker-compose.yml`](docker-compose.yml) is mapped to port **`5434`** (`5434:5432`). Ensure `DATABASE_URL` in `.env` uses `localhost:5434`.

### Issue 2: `password authentication failed for user "postgres"` (Error code: `28P01`)
- **Cause:** The server is connecting to an unexpected local PostgreSQL instance with different credentials.
- **Solution:** Verify `DATABASE_URL` in `.env` and `server/.env` points to `postgres://postgres:postgres@localhost:5434/tracker`.

### Issue 3: Vite Dev Server Proxy 404s
- **Cause:** The backend server on port `3000` is not running.
- **Solution:** Verify the backend is active in Terminal 1. The Vite client proxies all `/api/*` requests from `5173` to `http://localhost:3000`.

### Issue 4: Resetting Development Database
If you ever want a completely fresh database:
```bash
# Wipe container volume
docker compose down -v

# Start fresh
docker compose up -d

# Restart backend (will re-run schema.sql and all migrations)
npm run dev
```

---

## 11. Useful Monorepo NPM Scripts

From the repository root:

| Command | Action |
| :--- | :--- |
| `npm run dev` | Start backend server with hot reload (`server/src/server.js`) |
| `npm run client:dev` | Start frontend Vite development server (`http://localhost:5173`) |
| `npm run client:build` | Build production frontend bundle into `client/dist/` |
| `npm test` | Run all 16 Vitest test suites (91 test cases) |
| `npm run docker:up` | Spin up PostgreSQL container in background |
| `npm run docker:down` | Stop and remove PostgreSQL container |

