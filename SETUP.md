# Rashed Ali Cafeterias — Full Setup Guide

## Overview

This app is built with:
- **React + Vite** (JavaScript, no TypeScript)
- **Supabase** (PostgreSQL database, no Supabase Auth — custom auth)
- **Vercel** (deployment via GitHub)

---

## STEP 1 — Supabase Setup

### 1.1 Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Choose your organization, set a project name (e.g. `rashed-ali-cafeteria`), set a strong database password, pick a region close to UAE (e.g. `eu-central-1` Frankfurt or `ap-southeast-1` Singapore)
4. Wait for the project to be provisioned (~1 min)

### 1.2 Run the Database SQL
1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the entire contents of `database.sql` and paste it in
4. Click **"Run"** (or press Ctrl+Enter)
5. You should see "Success. No rows returned."

This creates all 5 tables: `branches`, `users`, `income_entries`, `expense_entries`, `partners`.

### 1.3 Get Your API Keys
1. In Supabase, go to **Project Settings → API**
2. Copy:
   - **Project URL** → looks like `https://abcdefgh.supabase.co`
   - **anon/public key** → a long JWT string
3. You'll need both in Step 3

### 1.4 Disable RLS (as per spec)
The SQL script does not enable RLS. By default in new Supabase projects, RLS is **disabled** — no action needed. If you previously enabled it on any table, go to **Table Editor → [table] → RLS** and disable it.

---

## STEP 2 — Local Development Setup

### 2.1 Prerequisites
- Node.js 18+ installed
- Git installed

### 2.2 Clone / Create Project Folder
```bash
mkdir rashed-ali-cafeteria
cd rashed-ali-cafeteria
```
Copy all project files into this folder maintaining the structure:
```
rashed-ali-cafeteria/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── .env.example
├── database.sql
├── public/
│   ├── logo.png          ← Add your logo here
│   ├── dashboard.png     ← Add dashboard image here
│   └── favicon.png       ← Add your coffee cup favicon here
└── src/
    ├── main.jsx
    └── App.jsx
```

### 2.3 Add Images to `/public`
Place these files in the `public/` folder:
- `logo.png` — main brand logo (shown on login page and sidebar)
- `dashboard.png` — decorative image for dashboard header
- `favicon.png` — coffee cup icon (shown as browser tab icon)

The app gracefully hides images if they are missing (shows emoji fallback ☕).

### 2.4 Create Environment File
```bash
cp .env.example .env
```
Edit `.env` and fill in your Supabase values:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here
```

### 2.5 Install Dependencies & Run
```bash
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### 2.6 First Login
- Email: `admin@rashedali.com`
- Password: `admin123`

**⚠️ Important:** Change this password immediately after first login! Go to Users → Change Password.

The system auto-upgrades plain-text passwords to PBKDF2 (secure hash) on first login.

---

## STEP 3 — GitHub Setup

### 3.1 Create a GitHub Repository
1. Go to [https://github.com/new](https://github.com/new)
2. Create a new repository named `rashed-ali-cafeteria`
3. Set it to **Private** (recommended)
4. Do NOT initialize with README (you'll push your own files)

### 3.2 Push Your Code
```bash
git init
git add .
git commit -m "Initial commit — Rashed Ali Cafeterias app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/rashed-ali-cafeteria.git
git push -u origin main
```

---

## STEP 4 — Vercel Deployment

### 4.1 Import Project to Vercel
1. Go to [https://vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Click **"Import"** next to your `rashed-ali-cafeteria` repository
4. Vercel will auto-detect it as a **Vite** project

### 4.2 Configure Environment Variables
Before clicking "Deploy", scroll to **"Environment Variables"** and add:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT_ID.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `your_anon_key_here` |

### 4.3 Deploy
1. Click **"Deploy"**
2. Wait ~2 minutes for the build to complete
3. Your app will be live at `https://rashed-ali-cafeteria.vercel.app` (or similar)

### 4.4 Future Updates
Every time you `git push` to the `main` branch, Vercel will automatically redeploy.

```bash
git add .
git commit -m "your changes"
git push
```

---

## STEP 5 — Custom Domain (Optional)

1. In Vercel, go to your project → **Settings → Domains**
2. Add your custom domain (e.g. `cafeteria.rashedali.com`)
3. Follow Vercel's DNS instructions to point your domain

---

## User Roles Reference

| Role | Dashboard | Branches | Income | Expenses | Partners | Users | Reports |
|------|-----------|----------|--------|----------|----------|-------|---------|
| super_admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | — | ✅ | ✅ | — | — | ✅ |
| accountant | ✅ | — | ✅ | ✅ | ✅ | — | ✅ |
| partner | ✅ | — | — | — | ✅ | — | ✅ |
| viewer | ✅ | — | — | — | — | — | — |

---

## Security Notes

- Passwords are hashed using **PBKDF2 (Web Crypto API)** with 100,000 iterations + random salt
- Password hashes are **never** stored in localStorage — only user metadata (id, name, email, role)
- Only `super_admin` can access the Users management page
- Plain-text passwords (like the seed admin) are automatically upgraded to PBKDF2 on first login

---

## Troubleshooting

**"Failed to fetch" or blank page:**
- Check that your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct in `.env`
- Make sure the `.env` file is NOT committed to git (it's in `.gitignore`)
- In Vercel, double-check that environment variables are set correctly

**"Invalid email or password":**
- Make sure you ran the SQL seed script successfully
- The initial email is `admin@rashedali.com` and password is `admin123`

**Tables not found:**
- Re-run `database.sql` in Supabase SQL Editor
- Check that there are no errors in the SQL output

**Images not showing:**
- Place `logo.png`, `dashboard.png`, and `favicon.png` in the `public/` folder
- The app shows emoji fallbacks if images are missing — this is expected

---

## File Structure

```
src/
└── App.jsx          — Complete single-file React application
    ├── Supabase client setup (inline)
    ├── PBKDF2 password hashing (Web Crypto API)
    ├── LoginPage component
    ├── Sidebar component
    ├── Dashboard component
    ├── Branches component (super_admin only)
    ├── EntriesPage component (shared for Income & Expenses)
    ├── Partners component (with ownership enforcement)
    ├── Users component (super_admin only)
    ├── Reports component (monthly P&L + partner shares)
    └── Main App (session management + routing)
```
