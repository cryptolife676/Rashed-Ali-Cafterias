-- =====================================================================
-- Migration 0010 — The declared figure is the GROUP's share, not the
--                  branch's profit. Income/expenses dropped.
--
-- REQUIRES 0008 (shareholders.payout_via_profile_id).
--
-- WHY: this app tracks one group of members — the people whose money
-- Mukthar handles (Ajmal, Naser, Abdul Rahman, and Mukthar himself). The
-- branches keep their own books AND compute their own splits; what
-- reaches this system is a single figure per branch per month: what that
-- group is collectively owed. Shabeer types that figure, and the app
-- divides it among the group by each member's share WITHIN the group.
--
-- This is the same shape as the historical spreadsheet backfilled in
-- 0009, and the arithmetic corroborates it exactly: in Ummu Gaffa the
-- group is Naser (2.8966%) + Mukthar (1.8104%) = 4.707% of the branch,
-- so Naser's share of the GROUP is 2.8966/4.707 = 61.5381% — and every
-- one of the 25 historical rows splits at precisely 0.6154 / 0.3846.
--
-- WHAT CHANGES:
--   1. monthly_profits.net_profit -> declared_amount. The old name was
--      actively misleading: this is ~4.7% of Ummu Gaffa's profit, not
--      100% of it, and reading it as branch profit is a ~21x error.
--   2. gross_income / total_expenses dropped — the branches' own books
--      hold those, and they were never used in any calculation.
--   3. create_distribution_run allocates among GROUP members only,
--      weighted by ownership_pct relative to the group's total.
--   4. Mukthar's own shareholder rows join the group (he "hands over" to
--      himself), so the group is one uniform query.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Mukthar's own rows belong to the group
--    0008 set the other three; he is in the group too — the figure
--    Shabeer types covers him as well.
-- ---------------------------------------------------------------------
do $$
declare
  v_profile uuid;
  v_n       int;
  v_rows    int;
begin
  select count(distinct profile_id) into v_n
    from shareholders where display_name = 'MUKTHAR' and profile_id is not null;

  if v_n <> 1 then
    raise notice
      'Skipping: found % profile(s) linked to MUKTHAR (expected 1). Set "Payout handed over by" from the shareholder page.', v_n;
  else
    select distinct profile_id into v_profile
      from shareholders where display_name = 'MUKTHAR' and profile_id is not null;

    update shareholders
      set payout_via_profile_id = v_profile
      where display_name = 'MUKTHAR' and payout_via_profile_id is null;

    get diagnostics v_rows = row_count;
    raise notice 'Added MUKTHAR to the payout group on % row(s)', v_rows;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Rename and slim monthly_profits
--    The view depends on the columns, so drop it first and rebuild in 4.
-- ---------------------------------------------------------------------
drop view if exists v_monthly_pnl;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_profits'
      and column_name = 'net_profit'
  ) then
    alter table monthly_profits rename column net_profit to declared_amount;
  end if;
end $$;

alter table monthly_profits drop column if exists gross_income;
alter table monthly_profits drop column if exists total_expenses;

comment on column monthly_profits.declared_amount is
  'What the payout group is collectively owed for this branch and month — '
  'NOT the branch''s profit. Divided among the group by each member''s '
  'ownership_pct relative to the group total.';

-- ---------------------------------------------------------------------
-- 3) Who is in the group, for a given branch
--    A member with no intermediary is not tracked by this app, so the
--    group is exactly "payouts routed through someone".
-- ---------------------------------------------------------------------
create or replace function payout_group_members(p_branch uuid)
returns table (shareholder_id uuid, display_name text, ownership_pct numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.display_name, s.ownership_pct
  from shareholders s
  where s.branch_id = p_branch
    and s.is_active
    and s.payout_via_profile_id is not null
  order by s.ownership_pct desc, s.display_name;
$$;

grant execute on function payout_group_members(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Rebuild the reporting view on the new column
-- ---------------------------------------------------------------------
create view v_monthly_pnl as
select
  mp.period_month    as month,
  mp.branch_id,
  mp.declared_amount as declared_amount
from monthly_profits mp;

alter view public.v_monthly_pnl set (security_invoker = on);
grant select on table v_monthly_pnl to authenticated;

-- ---------------------------------------------------------------------
-- 5) create_distribution_run — reads declared_amount
--    Signature keeps p_expected_net_profit's role (optimistic
--    concurrency) but renamed for what it now holds.
-- ---------------------------------------------------------------------
drop function if exists create_distribution_run(uuid,numeric,text,uuid,jsonb);

create or replace function create_distribution_run(
  p_monthly_profit_id uuid,
  p_expected_amount   numeric,
  p_notes             text,
  p_created_by        uuid,
  p_items             jsonb   -- [{shareholder_id, ownership_pct_snapshot, computed_amount}]
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

  if mp.declared_amount <> p_expected_amount then
    raise exception
      'Declared amount changed while the run was being prepared (expected %, now %). Recreate the draft.',
      p_expected_amount, mp.declared_amount;
  end if;

  if mp.declared_amount <= 0 then
    raise exception 'Declared amount % is not distributable', mp.declared_amount;
  end if;

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
    0, 0,
    mp.declared_amount,
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
