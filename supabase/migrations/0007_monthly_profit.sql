-- =====================================================================
-- Migration 0007 — Declared monthly profit replaces the transactions ledger
--
-- WHY: this app is not a shop bookkeeping system. Each branch keeps its
-- own books for daily sales/purchases/salaries/rent. The only figure we
-- receive is one number per branch per month: that month's profit. The
-- old model derived net profit by summing a `transactions` ledger that
-- nobody will ever fill in, which meant distribution runs were computed
-- from an empty (or half-filled, therefore misleading) table.
--
-- WHAT CHANGES:
--   1. New table `monthly_profits` — one declared figure per branch/month.
--   2. `distribution_runs.monthly_profit_id` ties a run to the figure it
--      consumed; at most one non-void run per declared month.
--   3. `create_distribution_run()` now reads the declared figure instead
--      of taking income/expense totals from the caller.
--   4. `v_monthly_pnl` rebuilt on `monthly_profits`.
--   5. `compute_period_pnl()`, `transactions` and `categories` dropped.
--
-- SAFETY: this migration refuses to run if any approved/paid distribution
-- run exists, because dropping `transactions` would destroy the basis of
-- an already-settled payout. Existing DRAFT runs are voided (they were
-- computed from the ledger and are meaningless under the new model).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guard — never drop the ledger under a settled distribution
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from distribution_runs where status in ('approved', 'paid');
  if n > 0 then
    raise exception
      'Refusing to migrate: % approved/paid distribution run(s) were computed from the transactions ledger. Migrate or archive that payout history first.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) monthly_profits — the declared figure, one row per branch per month
-- ---------------------------------------------------------------------
create table if not exists monthly_profits (
  id              uuid primary key default gen_random_uuid(),
  -- Not nullable, unlike the old transactions.branch_id: an unattributed
  -- figure is invisible to every per-branch run, which is how a stray
  -- AED 840 row ended up counted nowhere.
  branch_id       uuid not null references branches(id) on delete restrict,
  period_month    date not null,
  -- The distributable figure. Zero and negative are allowed: a loss month
  -- is still worth recording. createDistributionRun rejects non-positive.
  net_profit      numeric(14,2) not null,
  -- Informational only — we display these but never compute from them.
  gross_income    numeric(14,2) check (gross_income is null or gross_income >= 0),
  total_expenses  numeric(14,2) check (total_expenses is null or total_expenses >= 0),
  notes           text,
  recorded_by     uuid references profiles(id) on delete set null,
  -- Set true when rolled into an approved run; blocks further edits.
  is_locked       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- The ::timestamp cast is deliberate: with a bare date argument Postgres
  -- resolves date_trunc() to the timestamptz overload, which is only STABLE
  -- and so is rejected inside a CHECK constraint.
  constraint monthly_profits_month_is_first_of_month
    check (period_month = date_trunc('month', period_month::timestamp)::date),
  constraint monthly_profits_branch_month_unique
    unique (branch_id, period_month)
);
create index if not exists idx_mp_month on monthly_profits(period_month desc);
create index if not exists idx_mp_branch on monthly_profits(branch_id);

-- ---------------------------------------------------------------------
-- 2) Link runs to the figure they consumed
-- ---------------------------------------------------------------------
alter table distribution_runs
  add column if not exists monthly_profit_id uuid
    references monthly_profits(id) on delete restrict;

-- At most one live run per declared month — void a draft before recreating.
-- Prevents distributing the same month's profit twice.
create unique index if not exists uq_runs_active_monthly_profit
  on distribution_runs(monthly_profit_id)
  where monthly_profit_id is not null and status <> 'void';

-- ---------------------------------------------------------------------
-- 3) RLS — mirrors the policies the transactions table had
-- ---------------------------------------------------------------------
alter table monthly_profits enable row level security;

drop policy if exists mp_read on monthly_profits;
create policy mp_read on monthly_profits for select using (is_active_user());

drop policy if exists mp_staff_write on monthly_profits;
create policy mp_staff_write on monthly_profits for all
  using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- 4) Lock enforcement — a distributed month is immutable
--    Tolerates the lock-flag-only flip done by approveDistributionRun.
-- ---------------------------------------------------------------------
create or replace function prevent_locked_profit_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_locked then
      raise exception 'Cannot delete monthly profit %: it has been distributed', old.id;
    end if;
    return old;
  end if;

  if old.is_locked then
    -- Allow the approve/unlock path to toggle is_locked and nothing else.
    if new.branch_id = old.branch_id
       and new.period_month = old.period_month
       and new.net_profit = old.net_profit
       and new.gross_income is not distinct from old.gross_income
       and new.total_expenses is not distinct from old.total_expenses
       and new.notes is not distinct from old.notes then
      return new;
    end if;
    raise exception 'Cannot edit monthly profit %: it has been distributed', old.id;
  end if;

  return new;
end $$;

drop trigger if exists trg_prevent_locked_profit on monthly_profits;
create trigger trg_prevent_locked_profit
  before update or delete on monthly_profits
  for each row execute function prevent_locked_profit_edit();

-- ---------------------------------------------------------------------
-- 5) Standard table plumbing: audit log, last_write bump, updated_at
-- ---------------------------------------------------------------------
drop trigger if exists trg_audit_monthly_profits on monthly_profits;
create trigger trg_audit_monthly_profits
  after insert or update or delete on monthly_profits
  for each row execute function audit_trigger();

drop trigger if exists trg_bump_write_monthly_profits on monthly_profits;
create trigger trg_bump_write_monthly_profits
  after insert or update or delete on monthly_profits
  for each statement execute function bump_last_write();

drop trigger if exists trg_set_updated_monthly_profits on monthly_profits;
create trigger trg_set_updated_monthly_profits
  before update on monthly_profits
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 6) create_distribution_run — now sourced from the declared figure
--
--    The run's income/expense/net snapshot is read from monthly_profits
--    inside the function, so the client cannot pass a figure that differs
--    from what was declared. p_expected_net_profit is an optimistic-
--    concurrency check: the caller already allocated that exact amount
--    across shareholders, so if the declaration moved in between we abort
--    rather than write a run whose items don't sum to its net_profit.
-- ---------------------------------------------------------------------
drop function if exists create_distribution_run(uuid,date,date,numeric,numeric,numeric,text,uuid,jsonb);

create or replace function create_distribution_run(
  p_monthly_profit_id   uuid,
  p_expected_net_profit numeric,
  p_notes               text,
  p_created_by          uuid,
  p_items               jsonb   -- [{shareholder_id, ownership_pct_snapshot, computed_amount}]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
  mp       monthly_profits;
  item     jsonb;
begin
  select * into mp from monthly_profits where id = p_monthly_profit_id for update;
  if not found then
    raise exception 'Monthly profit % not found', p_monthly_profit_id;
  end if;

  if mp.net_profit <> p_expected_net_profit then
    raise exception
      'Declared profit changed while the run was being prepared (expected %, now %). Recreate the draft.',
      p_expected_net_profit, mp.net_profit;
  end if;

  if mp.net_profit <= 0 then
    raise exception 'Monthly profit % is not distributable (net %)', p_monthly_profit_id, mp.net_profit;
  end if;

  -- uq_runs_active_monthly_profit would catch this, but under the row lock
  -- taken above we can fail with a message an admin can act on instead of a
  -- raw unique-violation.
  if exists (
    select 1 from distribution_runs
    where monthly_profit_id = mp.id and status <> 'void'
  ) then
    raise exception
      'This month already has a distribution run. Void it before creating another.';
  end if;

  insert into distribution_runs (
    branch_id, monthly_profit_id, period_start, period_end,
    gross_income, total_expenses, net_profit,
    notes, created_by, status
  ) values (
    mp.branch_id,
    mp.id,
    mp.period_month,
    (mp.period_month + interval '1 month' - interval '1 day')::date,
    coalesce(mp.gross_income, 0),
    coalesce(mp.total_expenses, 0),
    mp.net_profit,
    p_notes, p_created_by, 'draft'
  )
  returning id into v_run_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    insert into distribution_items (
      run_id, shareholder_id, ownership_pct_snapshot, computed_amount, manual_adjustment
    ) values (
      v_run_id,
      (item->>'shareholder_id')::uuid,
      (item->>'ownership_pct_snapshot')::numeric,
      (item->>'computed_amount')::numeric,
      0
    );
  end loop;

  return v_run_id;
end $$;

grant execute on function create_distribution_run(uuid,numeric,text,uuid,jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) Void the stale drafts computed from the old ledger
--    (0005 flagged one: all-branches, 2026-03-31..2026-04-29). Voided
--    rather than deleted so the attempt stays in the audit trail, and
--    void rows are excluded from uq_runs_active_monthly_profit.
-- ---------------------------------------------------------------------
update distribution_runs
  set status = 'void',
      notes = concat_ws(' ', notes, '[voided by migration 0007: computed from the retired transactions ledger]')
  where status = 'draft' and monthly_profit_id is null;

-- ---------------------------------------------------------------------
-- 8) Rebuild v_monthly_pnl on declared profit
--    Dropped rather than replaced so it stops depending on transactions
--    before that table goes away.
-- ---------------------------------------------------------------------
drop view if exists v_monthly_pnl;

create view v_monthly_pnl as
select
  mp.period_month as month,
  mp.branch_id,
  coalesce(mp.gross_income, 0)::numeric(14,2) as income,
  coalesce(mp.total_expenses, 0)::numeric(14,2) as expenses,
  mp.net_profit as net_profit
from monthly_profits mp;

-- Honour the caller's RLS, not the view owner's (see migration 0006).
alter view public.v_monthly_pnl set (security_invoker = on);

-- Explicit grants so the table and view are reachable through PostgREST even
-- if the schema's default privileges ever change. RLS still gates the rows.
grant select, insert, update, delete on table monthly_profits to authenticated;
grant select on table v_monthly_pnl to authenticated;

-- ---------------------------------------------------------------------
-- 9) Retire the ledger
--    compute_period_pnl summed transactions; net profit is now declared,
--    so callers read monthly_profits directly and the RPC has no purpose.
-- ---------------------------------------------------------------------
drop function if exists compute_period_pnl(uuid, date, date);

-- These triggers/functions existed only to police the transactions table.
drop function if exists prevent_locked_period_write() cascade;
drop function if exists prevent_locked_txn_edit() cascade;

drop table if exists transactions;

-- categories only ever classified transaction rows (Sales, Purchases,
-- Salaries, Rent, …) — all shop-bookkeeping concerns that live in the
-- branches' own books now. Dropping each table takes its policies,
-- triggers and indexes with it.
drop table if exists categories;

-- txn_kind was the income/expense enum, used only by those two tables.
drop type if exists txn_kind;
