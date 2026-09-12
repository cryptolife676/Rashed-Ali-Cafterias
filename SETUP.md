# Rashed Ali Cafeteria — Business Management System

Production-grade Next.js 15 + Supabase app: accounting, profit sharing, shareholder portal, keep-alive cron.

---

## 1. Architecture overview

```
app/
  (admin pages — gated by middleware + requireStaff/Admin)
    dashboard/  monthly-profit/  shareholders/  distributions/
    reports/    audit-logs/
  portfolio/                        # shareholder-only page
  login/
  api/
    cron/keep-alive/                # Vercel cron — DB write every 2 days
    cron/inactivity-check/          # daily — notification + email
    activity/login/                 # records admin login activity
    auth/signout/                   # POST signout
  auth/callback/                    # Supabase OAuth/magic link callback

lib/
  supabase/   { client, server, admin }   # 3 clients, RLS-aware
  auth/       guards.ts                   # requireUser/Admin/Staff
  validators/ zod schemas
  accounting/ distribution.ts (largest-remainder allocation)

server/actions/   monthly-profit, shareholders, distributions  ('use server')
components/       Sidebar, InactivityBanner

supabase/migrations/                     # 0001 schema/RLS/triggers → 0007 monthly profit
vercel.json                              # cron schedules
middleware.ts                            # auth gate
```

### Roles
- `super_admin`, `admin` — full access (admin panel)
- `accountant` — can declare monthly profit only
- `shareholder` — can read own portfolio
- `viewer` — default role for new sign-ups, but profile starts **inactive** until an admin promotes them. Inactive users have no DB read access via RLS.

### Reliability features
- **Keep-alive**: `/api/cron/keep-alive` runs every 2 days, inserts a row into `keep_alive_logs` and updates `system_activity.last_keep_alive`. A real WRITE — Supabase counts this as activity.
- **Inactivity check**: `/api/cron/inactivity-check` runs daily. If admin hasn't logged in >5 days, broadcasts an in-app notification; >6 days, also emails via Resend.
- **Admin banner**: every admin page renders `InactivityBanner` showing the day count.
- **Locked months**: once a month's declared profit is rolled into an `approved` distribution run, `is_locked = true` blocks further edits. Voiding the run unlocks it.
- **RLS on every table** — shareholders can read only their own rows; mutations go through server actions using the user's session.

---

## 2. Local setup

```bash
npm install
cp .env.example .env.local      # fill in values (see below)
npm run dev
```

### Required environment variables

| Var | Where to find | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | public |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (under "service_role") | **secret, server-only** |
| `SUPABASE_PROJECT_ID` | URL slug | for `db:types` |
| `CRON_SECRET` | generate (`openssl rand -hex 32`) | Vercel sends as Bearer token to cron paths |
| `RESEND_API_KEY` | resend.com | optional, for inactivity email |
| `ALERT_EMAIL_TO` / `ALERT_EMAIL_FROM` | your domain | optional |
| `INACTIVITY_WARN_DAYS` (default 5), `INACTIVITY_ALERT_DAYS` (default 6) | | |

---

## 3. Database setup

Run the migrations in Supabase SQL editor in order:

1. Open Supabase dashboard → SQL editor
2. Paste and run `supabase/migrations/0001_init.sql`
3. Paste and run `supabase/migrations/0002_seed_data.sql`
4. Paste and run `supabase/migrations/0003_security_and_correctness.sql`
5. Paste and run `supabase/migrations/0004_atomic_run_and_rls.sql`
6. (Optional) regenerate types: `npm run db:types`

Then create your first admin:

```sql
-- 1) Create the auth user via Supabase dashboard (Authentication → Add user)
--    Use your email + a strong password.
-- 2) Promote to super_admin (replace UUID with the auth.users.id from step 1):
update profiles set role = 'super_admin', full_name = 'Your Name'
where id = '<USER_UUID>';
```

To create a shareholder account:
1. Add user via Authentication → Add user (or invite via email)
2. Update their profile: `update profiles set role = 'shareholder', full_name = '...' where id = '<UUID>';`
3. In the admin UI → Shareholders → fill `display_name`, `ownership_pct`, set `profile_id` = the auth user ID via SQL:
   `update shareholders set profile_id = '<UUID>' where id = '<SHAREHOLDER_UUID>';`

(A future iteration will add an admin "Invite shareholder" flow that does both atomically.)

---

## 4. Vercel deployment

1. Push to GitHub.
2. Import in Vercel — set framework to **Next.js** (auto-detected).
3. Add all env vars from `.env.example` in **Project Settings → Environment Variables**. Add `CRON_SECRET` to all three environments.
4. Deploy.

Vercel will auto-pick up `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/keep-alive",       "schedule": "0 6 */2 * *" },
    { "path": "/api/cron/inactivity-check", "schedule": "0 8 * * *"   }
  ]
}
```

Vercel cron requests automatically include `Authorization: Bearer ${CRON_SECRET}` — both endpoints reject missing/invalid tokens.

### Verify keep-alive
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.vercel.app/api/cron/keep-alive
# → {"ok":true,"pinged_at":"..."}
```
Then in Supabase: `select * from keep_alive_logs order by pinged_at desc limit 5;`

---

## 5. Business workflow

This app does not keep the branches' books. Each branch tracks its own daily
sales and costs; what it reports here is one figure per month.

### Once a month, per branch
1. Accountant or admin opens **Monthly Profit** → picks branch + month → enters the
   net profit the branch reported. Income and expenses are optional context.
   - Re-saving the same branch and month replaces the earlier figure.
2. Dashboard shows the declared profit per branch and which branches have reported.

### Then distribute
1. Admin opens **Distributions** → selects the same branch + month → "Create draft run".
   - Engine reads the declared `net_profit`, snapshots ownership %, allocates with largest-remainder rounding (sum = exact net to the cent).
2. Review per-shareholder amounts. Optionally enter `manual_adjustment` per item.
3. **Approve** → that month's declared profit becomes `is_locked = true`; status → `approved`.
4. **Pay out** → creates `withdrawals` rows with `source='distribution'`, sets `paid_at`, status → `paid`. Shareholders can now see it in their portfolio.

### Shareholder
- Logs in → redirected to `/portfolio`.
- Sees: ownership %, total invested, profit earned, total withdrawn, remaining balance, all distributions, investments, withdrawals — all RLS-restricted to their own rows.

---

## 6. Key design decisions

- **Snapshots, not live calculations.** `distribution_items.ownership_pct_snapshot` and `computed_amount` are frozen at draft creation. Changing a shareholder's % later does NOT rewrite history.
- **Largest-remainder allocation** ensures `Σ amounts == net_profit` exactly. Plain `pct/100*net` would lose pennies.
- **Declared profit, not a derived ledger.** The branches keep their own books; this app stores one `monthly_profits` row per branch per month and distributes from it. (Migration 0007 replaced a daily `transactions` ledger that nobody was going to fill in.)
- **Locked months** prevent editing the basis of a settled payout. Admin can `void` a run to re-open (records remain in audit log).
- **No service-role key in the browser, ever.** All mutations go through server actions or route handlers.
- **Audit triggers** on every business table; `audit_logs` is admin-readable only.
- **Singleton `system_activity`** table tracks last admin login + last write + last keep-alive — drives the inactivity banner without scanning audit logs.

---

## 7. What's deliberately NOT included yet

- PDF/Excel export endpoints (route handlers stubbed at `/admin/reports`)
- Recharts visualizations on the dashboard (table view only for now)
- Admin "Invite shareholder" UI (use SQL workaround above)
- Multi-branch UI (data model supports it; UI uses single dropdown)
- Notifications dropdown in admin header (notifications are written; UI display TODO)

These are all small additions — the hard parts (schema, RLS, distribution engine, cron) are done.

---

