# StudyForge — Production Deployment Guide

This guide covers deploying **StudyForge** using the best free, modern, and reliable cloud infrastructure available today.

---

## 1. Cloud Architecture & Free Alternatives

### Recommended Stack:
| Layer | Service | Free Tier Allowance | Why Chosen |
| :--- | :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com) | Unlimited bandwidth / 100 GB, Edge CDN, HTTPS | Instant load times, zero cold starts, seamless GitHub auto-deploys for Vite/React. |
| **Backend** | [Render](https://render.com) | 750 free instance hours/month (Free Web Service) | Full Node.js runtime, automatic HTTPS, environment variable secrets manager. |
| **Database** | [Neon](https://neon.tech) | 0.5 GiB storage, serverless PostgreSQL 16 | **Never deleted or expired** (unlike Render's free DB which is erased after 30 days!). Native SSL & connection pooling. |
| **Keep-Awake** | [cron-job.org](https://cron-job.org) / [UptimeRobot](https://uptimerobot.com) | Free 5-minute pings | Prevents Render's free container from sleeping after 15 min, eliminating the ~50s cold start! |

> [!IMPORTANT]
> **Why Neon instead of "Prisma" or Render PostgreSQL?**
> - **Prisma is not a database host:** Prisma is an ORM (Object-Relational Mapping library) for TypeScript/Node.js, not a free database hosting provider. StudyForge uses raw PostgreSQL with connection pooling (`pg`).
> - **Render's free database expires:** Render offers a free PostgreSQL database, but it is **automatically deleted after 30 days**.
> - **Neon is 100% free and permanent:** Neon gives you a real, persistent cloud PostgreSQL database that does not expire after 30 days.

---

## 2. Step-by-Step Deployment Guide

```mermaid
flowchart LR
    User["User Browser"] -->|HTTPS · Same Origin /api Proxy| Vercel["Vercel (React Frontend)"]
    Vercel -->|Proxies /api/*| Render["Render (Express Backend)"]
    Render -->|Encrypted SSL Pool| Neon[("Neon (Cloud PostgreSQL 16)")]
    Ping["cron-job.org (Free Ping)"] -->|Every 10 min to /healthz| Render
```

---

### Step 1: Create Free PostgreSQL Database on Neon (2 mins)

1. Go to [neon.tech](https://neon.tech) and sign up for free (using GitHub or Google).
2. Click **Create Project**:
   - **Project Name:** `studyforge-db`
   - **Postgres version:** `16` (or latest)
   - **Region:** Pick the region closest to you or closest to your Render service (e.g., `US East (Ohio)` or `Frankfurt`).
3. Once created, your dashboard will display the **Connection Details**:
   - Ensure the dropdown is set to **`Node.js`** or **`Connection string`**.
   - Copy the connection string. It looks like:
     ```text
     postgresql://alex:AbCdEf123456@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   *(Keep this string handy for Step 2).*

---

### Step 2: Deploy Express Backend on Render (5 mins)

1. Go to [render.com](https://render.com) and sign in.
2. Click **New +** and select **Web Service**.
3. Choose **Build and deploy from a Git repository**, and connect your GitHub repository `StudyForge`.
4. Configure the Web Service settings:
   - **Name:** `studyforge-api` (or your preferred name)
   - **Region:** Same general region as your Neon database (e.g., `Ohio (US East)` or `Frankfurt (EU Central)`)
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Scroll down to **Environment Variables** and add the following keys:

   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Enables production security & optimizations |
   | `PORT` | `3000` | Render injects `PORT` automatically if omitted |
   | `DATABASE_URL` | `postgresql://...neon.tech/neondb?sslmode=require` | Paste your Neon connection string from Step 1 |
   | `JWT_SECRET` | `your-secure-random-secret-at-least-32-chars-long` | Generate a strong random key |
   | `CLIENT_URL` | `https://your-studyforge.vercel.app` | Will be your Vercel frontend URL (you can update this after Step 3) |
   | `AUTO_INIT_DB` | `true` | **Crucial:** Automatically creates all tables and runs schema migrations on first startup! |
   | `COOKIE_SAME_SITE` | `lax` | Use `lax` if using Vercel proxy (Option A), or `none` if calling cross-origin (Option B) |

6. Click **Deploy Web Service**.
7. Wait 2-3 minutes for the build to finish. Once live, Render will provide your public URL:
   ```text
   https://studyforge-api.onrender.com
   ```
8. **Verify Backend Health:**
   Open `https://studyforge-api.onrender.com/healthz` in your browser. It should return:
   ```json
   {"ok":true}
   ```

---

### Step 3: Deploy React Frontend on Vercel (3 mins)

You have two options for connecting the frontend to your backend:

#### Option A: Vercel Proxy Rewrites (Highly Recommended)
> [!TIP]
> **Why this is best:** By having Vercel proxy `/api/*` requests to Render, your app acts as a **single origin**.
> - Browsers treat authentication cookies as **first-party**, completely eliminating third-party cookie blocking in Chrome and Safari.
> - Zero CORS preflight lag.

1. In your local repository, edit [`client/vercel.json`](client/vercel.json) to proxy to your Render URL:
   ```json
   {
     "framework": "vite",
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://studyforge-api.onrender.com/api/:path*"
       },
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```
   *(Replace `https://studyforge-api.onrender.com` with your actual Render service URL).*

2. Commit and push:
   ```bash
   git add client/vercel.json
   git commit -m "Configure Vercel API proxy rewrites to Render backend"
   git push origin main
   ```

3. Go to [vercel.com](https://vercel.com) and log in.
4. Click **Add New...** > **Project**, and select your `StudyForge` GitHub repo.
5. In the configuration screen:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click **Edit** and set it to `client`
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default)
6. Click **Deploy**.
7. Vercel will build and assign you a free production URL:
   ```text
   https://studyforge-yourname.vercel.app
   ```
8. **Final Step:** Go back to Render > `studyforge-api` > **Environment Variables**, and ensure `CLIENT_URL` is set to your new Vercel domain:
   ```text
   CLIENT_URL=https://studyforge-yourname.vercel.app
   ```

---

#### Option B: Direct Cross-Origin API Calls (Alternative)
If you prefer not using proxy rewrites and want the browser to call Render directly:
1. In Vercel > Project Settings > **Environment Variables**, add:
   ```text
   VITE_API_URL=https://studyforge-api.onrender.com
   ```
2. In Render > Web Service > **Environment Variables**, set:
   ```text
   COOKIE_SAME_SITE=none
   COOKIE_SECURE=true
   CLIENT_URL=https://studyforge-yourname.vercel.app
   ```
3. Trigger a redeploy on both services.

---

### Step 4: Keep Backend Awake 24/7 (Free Ping)

Render's free tier sleeps after 15 minutes of inactivity. When a student visits your website, they would experience a ~50-second wait on the first request.

**How to make it respond instantly 24/7 for free:**
1. Sign up for free at [cron-job.org](https://cron-job.org) or [uptimerobot.com](https://uptimerobot.com).
2. Create a new monitor / cron job:
   - **URL to Ping:** `https://studyforge-api.onrender.com/healthz`
   - **Execution Schedule:** Every 10 minutes (`*/10 * * * *`)
   - **HTTP Method:** `GET`
3. Save the job.
Now your Render backend stays active in memory and never experiences a cold start!

---

## 3. Database Bootstrap & CLI Management

### Automatic Initialization (Default)
When you deploy to Render with `AUTO_INIT_DB=true`, StudyForge automatically:
- Checks if the tables exist.
- Executes `server/schema.sql` if not present.
- Applies all migrations from `server/migrations/`.
- Logs `[DB] Schema verified/initialized.` to the Render deploy console.

### Manual Local Initialization (Optional)
If you ever want to run schema setup or inspect your remote Neon database from your local machine:
```bash
# Set your Neon database URL and run db:setup
DATABASE_URL="postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require" npm run db:setup
```

---

## 4. Alternative: All-In-One Hosting (Render or Railway)

If you prefer to host both Frontend and Backend together in one single service:

### Railway ($5 Free Trial Credit)
- Provides full Docker / Node support and instant PostgreSQL databases.
- Single dashboard for Database, Backend, and Frontend.

### Render Static Site + Web Service
- Render can also host the Vite frontend as a **Static Site** alongside the backend **Web Service**, keeping everything under one Render account.

---

## 5. Verification Checklist

After deploying, verify the complete loop:
- [ ] **Health Check:** `curl https://your-backend.onrender.com/healthz` returns `{"ok":true}`.
- [ ] **Frontend Loads:** Navigate to your Vercel URL; the StudyForge UI and brand logo render cleanly.
- [ ] **User Registration:** Create a new account with username, email, password, and category.
- [ ] **Cookie Persistence:** Refresh the browser; your active session and user profile remain logged in.
- [ ] **Timer Test:** Start a 1-minute study session, stop it, and verify that study minutes, XP, and daily totals update accurately.
- [ ] **Leaderboards & Friends:** Test navigating to the Leaderboard and Friends tabs.
- [ ] **CSV Export:** In Settings, click "Download CSV" to verify file generation and export streaming.

