-- =====================================================================
-- Migration 0016 — Ajman Dec 2025 – May 2026: equal shares for all four members
--
-- REQUIRES 0014.
--
-- WHY: Shabeer's sheet gives each of the four team members the same share
-- every month (We ÷ 4, rounded) — e.g. Jan 2026: 523.97 each. 0014 instead
-- rounded the team total first (2,095.90) and spread the leftover fils, so
-- members differed by a fil in four months and over six months Ajmal and
-- Abdul Rahman had 1,470.47, Mukthar 1,470.45, Naser 1,470.43 — against the
-- sheet's 1,470.45 each. Both of the owner's Ajman sheets agree cell for cell.
--
-- FIX: each member gets the sheet's per-member figure; the month's team
-- amount becomes exactly four times it.
--
--   month     each     team (was)   team (now)
--   Dec 2025  100.00     400.00       400.00
--   Jan 2026  523.97   2,095.90     2,095.88
--   Feb 2026  401.98   1,607.92     1,607.92
--   Mar 2026  119.99     479.98       479.96
--   Apr 2026   74.00     295.99       296.00
--   May 2026  250.51   1,002.03     1,002.04
--   total              5,881.82     5,881.80   (1,470.45 per member)
--
-- SAFETY: refuses to run if any of these 24 payouts has already been marked
-- paid, so a confirmed handover is never silently re-valued. Each month is
-- unlocked (a lock-flag-only update the lock trigger allows), corrected, and
-- re-locked. Verifies and rolls back on any mismatch.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Repair the monthly_profits lock trigger (bug since 0010)
--
--    prevent_locked_profit_edit() was written in 0007 against net_profit,
--    gross_income and total_expenses. 0010 renamed net_profit to
--    declared_amount and dropped the other two without updating it, so ANY
--    update to a locked month now fails with "record new has no field
--    net_profit" — including the lock-flag-only unlock that voiding an
--    approved run performs. This correction is the first unlock since 0010,
--    which is how it surfaced. Recreated against the current columns; the
--    trigger itself is unchanged and picks up the new function body.
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
       and new.declared_amount = old.declared_amount
       and new.notes is not distinct from old.notes then
      return new;
    end if;
    raise exception 'Cannot edit monthly profit %: it has been distributed', old.id;
  end if;

  return new;
end $$;

do $$
declare
  v_branch uuid;
  r        record;
  v_mp     uuid;
  v_run    uuid;
  v_paid   int;
  v_decl   numeric(14,2);
  v_min    numeric(14,2);
  v_max    numeric(14,2);
  v_bad    int;
begin
  select id into v_branch from branches where name = 'Ajman - Al Hamidiya';
  if v_branch is null then raise exception 'Branch "Ajman - Al Hamidiya" not found'; end if;

  select count(*) into v_paid
  from distribution_items di
  join distribution_runs dr on dr.id = di.run_id
  where dr.branch_id = v_branch and dr.status <> 'void'
    and dr.period_start between '2025-12-01' and '2026-05-01'
    and di.paid_at is not null;
  if v_paid > 0 then
    raise exception
      'Refusing to re-value: % Ajman payout(s) for Dec 2025 – May 2026 are already marked paid. Undo those on Payouts first, then run this again.',
      v_paid;
  end if;

  for r in
    select * from (values
      ('2025-12-01'::date, 100.00),
      ('2026-01-01'::date, 523.97),
      ('2026-02-01'::date, 401.98),
      ('2026-03-01'::date, 119.99),
      ('2026-04-01'::date,  74.00),
      ('2026-05-01'::date, 250.51)
    ) as t(month, each_amt)
  loop
    select id into strict v_mp
      from monthly_profits where branch_id = v_branch and period_month = r.month;
    select id into strict v_run
      from distribution_runs where monthly_profit_id = v_mp and status <> 'void';

    update monthly_profits set is_locked = false where id = v_mp;
    update monthly_profits set declared_amount = r.each_amt * 4 where id = v_mp;
    update monthly_profits set is_locked = true where id = v_mp;

    update distribution_runs set net_profit = r.each_amt * 4 where id = v_run;
    update distribution_items
      set computed_amount = r.each_amt, manual_adjustment = 0
      where run_id = v_run;
  end loop;

  -- Verify: six months totalling 5,881.80, every item equal within its month,
  -- 1,470.45 per member, still locked, nothing paid.
  select coalesce(sum(declared_amount), 0),
         count(*) filter (where not is_locked)
    into v_decl, v_bad
  from monthly_profits
  where branch_id = v_branch and period_month between '2025-12-01' and '2026-05-01';

  select min(t.total), max(t.total) into v_min, v_max
  from (
    select di.shareholder_id, sum(di.final_amount) as total
    from distribution_items di
    join distribution_runs dr on dr.id = di.run_id
    where dr.branch_id = v_branch and dr.status <> 'void'
      and dr.period_start between '2025-12-01' and '2026-05-01'
    group by di.shareholder_id
  ) t;

  if v_decl <> 5881.80 or v_bad <> 0 or v_min <> 1470.45 or v_max <> 1470.45 then
    raise exception
      'Equal-share correction FAILED: team total %, unlocked months %, per-member min % max % (expected 5881.80 / 0 / 1470.45 / 1470.45). Rolled back.',
      v_decl, v_bad, v_min, v_max;
  end if;

  raise notice 'Ajman Dec 2025 – May 2026 corrected: team total %, each member %', v_decl, v_min;
end $$;
