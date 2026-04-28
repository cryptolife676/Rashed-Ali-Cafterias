-- =====================================================================
-- Rashed Ali Cafeteria — Business Management System
-- Initial schema, RLS, triggers, seed
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('super_admin','admin','accountant','shareholder','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_kind as enum ('income','expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type distribution_status as enum ('draft','approved','paid','void');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- CORE: branches
-- ---------------------------------------------------------------------
create table if not exists branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  location    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AUTH: profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'viewer',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_profiles_role on profiles(role);

-- Auto-create profile when an auth user is created
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), 'viewer')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Helper: is current user an admin-class role?
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('super_admin','admin') and is_active
  );
$$;

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('super_admin','admin','accountant') and is_active
  );
$$;

-- ---------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  kind        txn_kind not null,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (kind, name)
);

-- ---------------------------------------------------------------------
-- TRANSACTIONS (unified income + expense ledger)
-- ---------------------------------------------------------------------
create table if not exists transactions (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid references branches(id) on delete set null,
  kind          txn_kind not null,
  category_id   uuid references categories(id) on delete set null,
  entry_date    date not null,
  amount        numeric(14,2) not null check (amount > 0),
  notes         text,
  recorded_by   uuid references profiles(id) on delete set null,
  -- Lock flag: set true when included in an approved distribution_run, prevents edits
  is_locked     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_txn_date_kind on transactions(entry_date, kind);
create index if not exists idx_txn_branch on transactions(branch_id);
create index if not exists idx_txn_category on transactions(category_id);

-- ---------------------------------------------------------------------
-- SHAREHOLDERS
-- ---------------------------------------------------------------------
create table if not exists shareholders (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references profiles(id) on delete set null,
  branch_id       uuid references branches(id) on delete set null,
  display_name    text not null,
  ownership_pct   numeric(7,4) not null check (ownership_pct > 0 and ownership_pct <= 100),
  is_active       boolean not null default true,
  joined_at       date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_shareholders_branch on shareholders(branch_id);
create index if not exists idx_shareholders_profile on shareholders(profile_id);

-- Trigger: ensure SUM(ownership_pct) per branch among active shareholders <= 100
create or replace function check_ownership_sum()
returns trigger language plpgsql as $$
declare
  total numeric(10,4);
  bid uuid;
begin
  bid := coalesce(new.branch_id, old.branch_id);
  select coalesce(sum(ownership_pct),0) into total
  from shareholders
  where branch_id is not distinct from bid
    and is_active = true
    and id <> coalesce(new.id, old.id);
  if (tg_op in ('INSERT','UPDATE')) and new.is_active then
    total := total + new.ownership_pct;
  end if;
  if total > 100.0001 then
    raise exception 'Ownership % for branch exceeds 100%% (would be %)', bid, total;
  end if;
  return new;
end $$;

drop trigger if exists trg_ownership_sum on shareholders;
create trigger trg_ownership_sum
  before insert or update on shareholders
  for each row execute function check_ownership_sum();

-- ---------------------------------------------------------------------
-- INVESTMENTS & WITHDRAWALS
-- ---------------------------------------------------------------------
create table if not exists investments (
  id              uuid primary key default gen_random_uuid(),
  shareholder_id  uuid not null references shareholders(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  invested_at     date not null default current_date,
  notes           text,
  recorded_by     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_investments_sh on investments(shareholder_id);

create table if not exists withdrawals (
  id              uuid primary key default gen_random_uuid(),
  shareholder_id  uuid not null references shareholders(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  withdrawn_at    date not null default current_date,
  source          text not null default 'manual'  -- 'manual' | 'distribution'
                  check (source in ('manual','distribution')),
  distribution_item_id uuid,  -- backref filled when paid from a distribution
  notes           text,
  approved_by     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_withdrawals_sh on withdrawals(shareholder_id);

-- ---------------------------------------------------------------------
-- DISTRIBUTION RUNS + ITEMS
-- ---------------------------------------------------------------------
create table if not exists distribution_runs (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid references branches(id) on delete set null,
  period_start    date not null,
  period_end      date not null,
  gross_income    numeric(14,2) not null default 0,
  total_expenses  numeric(14,2) not null default 0,
  net_profit      numeric(14,2) not null default 0,
  status          distribution_status not null default 'draft',
  notes           text,
  created_by      uuid references profiles(id) on delete set null,
  approved_by     uuid references profiles(id) on delete set null,
  approved_at     timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists idx_runs_period on distribution_runs(period_start, period_end);
create index if not exists idx_runs_status on distribution_runs(status);

create table if not exists distribution_items (
  id                        uuid primary key default gen_random_uuid(),
  run_id                    uuid not null references distribution_runs(id) on delete cascade,
  shareholder_id            uuid not null references shareholders(id) on delete restrict,
  ownership_pct_snapshot    numeric(7,4) not null,
  computed_amount           numeric(14,2) not null,
  manual_adjustment         numeric(14,2) not null default 0,
  final_amount              numeric(14,2) generated always as (computed_amount + manual_adjustment) stored,
  paid_at                   timestamptz,
  created_at                timestamptz not null default now(),
  unique (run_id, shareholder_id)
);
create index if not exists idx_items_run on distribution_items(run_id);
create index if not exists idx_items_sh on distribution_items(shareholder_id);

-- ---------------------------------------------------------------------
-- AUDIT LOGS
-- ---------------------------------------------------------------------
create table if not exists audit_logs (
  id          bigserial primary key,
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null, -- INSERT | UPDATE | DELETE | CUSTOM
  table_name  text not null,
  row_id      text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_table_row on audit_logs(table_name, row_id);
create index if not exists idx_audit_actor on audit_logs(actor_id);
create index if not exists idx_audit_created on audit_logs(created_at desc);

create or replace function audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid;
begin
  actor := auth.uid();
  if (tg_op = 'DELETE') then
    insert into audit_logs(actor_id, action, table_name, row_id, before)
    values (actor, tg_op, tg_table_name, old.id::text, to_jsonb(old));
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into audit_logs(actor_id, action, table_name, row_id, before, after)
    values (actor, tg_op, tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into audit_logs(actor_id, action, table_name, row_id, after)
    values (actor, tg_op, tg_table_name, new.id::text, to_jsonb(new));
    return new;
  end if;
end $$;

-- Attach audit triggers to mutable business tables
do $$
declare t text;
begin
  foreach t in array array['transactions','shareholders','investments','withdrawals','distribution_runs','distribution_items','categories','branches','profiles']
  loop
    execute format('drop trigger if exists trg_audit_%I on %I', t, t);
    execute format('create trigger trg_audit_%I after insert or update or delete on %I for each row execute function audit_trigger()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- KEEP-ALIVE + SYSTEM ACTIVITY
-- ---------------------------------------------------------------------
create table if not exists keep_alive_logs (
  id          bigserial primary key,
  pinged_at   timestamptz not null default now(),
  source      text not null default 'cron', -- 'cron' | 'manual' | 'user_login'
  payload     jsonb
);
create index if not exists idx_keepalive_pinged on keep_alive_logs(pinged_at desc);

create table if not exists system_activity (
  id                  smallint primary key default 1,
  last_admin_login    timestamptz,
  last_write          timestamptz,
  last_keep_alive     timestamptz,
  updated_at          timestamptz not null default now(),
  check (id = 1)
);
insert into system_activity(id) values (1) on conflict (id) do nothing;

-- Update last_write whenever core tables change
create or replace function bump_last_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update system_activity set last_write = now(), updated_at = now() where id = 1;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['transactions','shareholders','investments','withdrawals','distribution_runs','distribution_items']
  loop
    execute format('drop trigger if exists trg_bump_write_%I on %I', t, t);
    execute format('create trigger trg_bump_write_%I after insert or update or delete on %I for each statement execute function bump_last_write()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade, -- null = broadcast to admins
  kind        text not null,    -- 'inactivity' | 'distribution_approved' | 'system'
  title       text not null,
  body        text,
  payload     jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_user_unread on notifications(user_id) where read_at is null;

-- ---------------------------------------------------------------------
-- VIEWS for fast dashboard reads
-- ---------------------------------------------------------------------
create or replace view v_monthly_pnl as
select
  date_trunc('month', entry_date)::date as month,
  branch_id,
  sum(case when kind = 'income' then amount else 0 end)::numeric(14,2) as income,
  sum(case when kind = 'expense' then amount else 0 end)::numeric(14,2) as expenses,
  (sum(case when kind = 'income' then amount else 0 end)
 - sum(case when kind = 'expense' then amount else 0 end))::numeric(14,2) as net_profit
from transactions
group by 1, 2;

create or replace view v_shareholder_summary as
select
  s.id as shareholder_id,
  s.profile_id,
  s.display_name,
  s.branch_id,
  s.ownership_pct,
  coalesce((select sum(amount) from investments i where i.shareholder_id = s.id), 0)::numeric(14,2) as total_invested,
  coalesce((select sum(final_amount) from distribution_items di
            join distribution_runs dr on dr.id = di.run_id
            where di.shareholder_id = s.id and dr.status in ('approved','paid')), 0)::numeric(14,2) as total_profit_earned,
  coalesce((select sum(amount) from withdrawals w where w.shareholder_id = s.id), 0)::numeric(14,2) as total_withdrawn
from shareholders s;

-- ---------------------------------------------------------------------
-- RPC: compute_period_pnl — used by distribution engine
-- ---------------------------------------------------------------------
create or replace function compute_period_pnl(p_branch uuid, p_start date, p_end date)
returns table(income numeric, expenses numeric, net_profit numeric)
language sql stable as $$
  select
    coalesce(sum(case when kind='income'  then amount end),0)::numeric(14,2) as income,
    coalesce(sum(case when kind='expense' then amount end),0)::numeric(14,2) as expenses,
    (coalesce(sum(case when kind='income'  then amount end),0)
   - coalesce(sum(case when kind='expense' then amount end),0))::numeric(14,2) as net_profit
  from transactions
  where entry_date between p_start and p_end
    and (p_branch is null or branch_id = p_branch);
$$;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table profiles            enable row level security;
alter table branches            enable row level security;
alter table categories          enable row level security;
alter table transactions        enable row level security;
alter table shareholders        enable row level security;
alter table investments         enable row level security;
alter table withdrawals         enable row level security;
alter table distribution_runs   enable row level security;
alter table distribution_items  enable row level security;
alter table audit_logs          enable row level security;
alter table keep_alive_logs     enable row level security;
alter table system_activity     enable row level security;
alter table notifications       enable row level security;

-- profiles: user can read own row; admins read all
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_admin());
drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles for all
  using (is_admin()) with check (is_admin());

-- branches & categories: readable by any signed-in user; writable by admin
drop policy if exists branches_read on branches;
create policy branches_read on branches for select using (auth.uid() is not null);
drop policy if exists branches_admin_write on branches;
create policy branches_admin_write on branches for all using (is_admin()) with check (is_admin());

drop policy if exists categories_read on categories;
create policy categories_read on categories for select using (auth.uid() is not null);
drop policy if exists categories_admin_write on categories;
create policy categories_admin_write on categories for all using (is_admin()) with check (is_admin());

-- transactions: read all signed-in (so shareholders see basis); write staff only
drop policy if exists txn_read on transactions;
create policy txn_read on transactions for select using (auth.uid() is not null);
drop policy if exists txn_staff_write on transactions;
create policy txn_staff_write on transactions for all using (is_staff()) with check (is_staff());

-- shareholders: own row OR admin
drop policy if exists sh_self_read on shareholders;
create policy sh_self_read on shareholders for select
  using (profile_id = auth.uid() or is_admin());
drop policy if exists sh_admin_write on shareholders;
create policy sh_admin_write on shareholders for all using (is_admin()) with check (is_admin());

-- investments / withdrawals: own rows OR admin read; admin write only
drop policy if exists inv_read on investments;
create policy inv_read on investments for select
  using (is_admin() or exists (select 1 from shareholders s where s.id = investments.shareholder_id and s.profile_id = auth.uid()));
drop policy if exists inv_admin_write on investments;
create policy inv_admin_write on investments for all using (is_admin()) with check (is_admin());

drop policy if exists wd_read on withdrawals;
create policy wd_read on withdrawals for select
  using (is_admin() or exists (select 1 from shareholders s where s.id = withdrawals.shareholder_id and s.profile_id = auth.uid()));
drop policy if exists wd_admin_write on withdrawals;
create policy wd_admin_write on withdrawals for all using (is_admin()) with check (is_admin());

-- distribution_runs: shareholders read approved/paid runs that include them; admins all
drop policy if exists dr_read on distribution_runs;
create policy dr_read on distribution_runs for select using (
  is_admin() or (
    status in ('approved','paid') and exists (
      select 1 from distribution_items di
      join shareholders s on s.id = di.shareholder_id
      where di.run_id = distribution_runs.id and s.profile_id = auth.uid()
    )
  )
);
drop policy if exists dr_admin_write on distribution_runs;
create policy dr_admin_write on distribution_runs for all using (is_admin()) with check (is_admin());

drop policy if exists di_read on distribution_items;
create policy di_read on distribution_items for select using (
  is_admin() or exists (
    select 1 from shareholders s
    where s.id = distribution_items.shareholder_id and s.profile_id = auth.uid()
  )
);
drop policy if exists di_admin_write on distribution_items;
create policy di_admin_write on distribution_items for all using (is_admin()) with check (is_admin());

-- audit_logs: admins read; nobody writes via API (only triggers, which run as security definer)
drop policy if exists audit_admin_read on audit_logs;
create policy audit_admin_read on audit_logs for select using (is_admin());

-- keep_alive_logs: admin read; writes only via service role (bypasses RLS)
drop policy if exists ka_admin_read on keep_alive_logs;
create policy ka_admin_read on keep_alive_logs for select using (is_admin());

-- system_activity: any signed-in user can read inactivity status; service role writes
drop policy if exists sa_read on system_activity;
create policy sa_read on system_activity for select using (auth.uid() is not null);

-- notifications: own + broadcast (user_id is null) for admins
drop policy if exists notif_read on notifications;
create policy notif_read on notifications for select using (
  user_id = auth.uid() or (user_id is null and is_admin())
);
drop policy if exists notif_update_own on notifications;
create policy notif_update_own on notifications for update
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','transactions','shareholders','distribution_runs']
  loop
    execute format('drop trigger if exists trg_set_updated_%I on %I', t, t);
    execute format('create trigger trg_set_updated_%I before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- SEED
-- ---------------------------------------------------------------------
insert into branches (name, location, is_active)
values ('Main Branch', 'Abu Dhabi', true)
on conflict do nothing;

insert into categories (kind, name) values
  ('income','Sales'),
  ('income','Other Income'),
  ('expense','Purchases'),
  ('expense','Salaries'),
  ('expense','Rent'),
  ('expense','Utilities'),
  ('expense','Maintenance'),
  ('expense','Other')
on conflict (kind, name) do nothing;
