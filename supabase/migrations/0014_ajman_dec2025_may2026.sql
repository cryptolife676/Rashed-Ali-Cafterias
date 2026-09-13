-- =====================================================================
-- Migration 0014 — Ajman (Al Hamidiya), Dec 2025 → May 2026, from Shabeer's sheet
--
-- REQUIRES 0010 (declared_amount, payout group) and 0012.
--
-- The sheet computes: branch profit → franchisee 30% → five 14% shares →
-- Shabeer's 14% pool → Shabeer 42.86% / "We" 57.14% → We split four ways.
-- What this app records is the team's slice, the "We (8%)" column, exactly
-- as Shabeer declared it (rounded to fils). How he arrived at it (including
-- the 42.86/57.14 rounding, which leaves the team ~0.27 AED under an exact
-- 8/14 over six months) happens upstream and is not second-guessed here.
--
-- Decisions confirmed by the owner:
--   * The sheet's "Muthu (2%)" is ABDUL RAHMAN EK (not Muthu (Musthafa), 14%).
--   * All six months are recorded as approved and OWED. The owner ticks each
--     forwarded payout on the Payouts page with the real date and a remark,
--     even where the sheet notes a forward (Dec-25 → Ajmal; Jan-26 → Ajmal,
--     Naser "for NEM project") — kept in the month's notes for reference.
--   * Dec-25 "announced Jan-25" is a typo for Jan 2026.
--   * Dec-25: the sheet's Shabeer 300.02 + We 400 = 700.02 against a 700 pool;
--     the team's 400 is the exact 8/14 figure and is what is recorded.
--
-- Split: equal 25% each, largest remainder to the fil, in the order the site's
-- engine uses (payout_group_members: ownership desc, then name) — Abdul Rahman,
-- Ajmal, Mukthar, Naser — so any leftover fil lands where the site would put it.
--
-- Idempotent: skips any month already present for the branch, verifies the
-- result, and rolls back on any mismatch.
-- =====================================================================

do $$
declare
  v_branch uuid;
  v_ar     uuid;   -- ABDUL RAHMAN EK ("Muthu" on the sheet)
  v_aj     uuid;   -- AJMAL
  v_mu     uuid;   -- MUKTHAR
  v_na     uuid;   -- NASER
  v_mp     uuid;
  v_run    uuid;
  r        record;
  v_months int;
  v_decl   numeric(14,2);
  v_runs   int;
  v_items  int;
  v_s_ar   numeric(14,2);
  v_s_aj   numeric(14,2);
  v_s_mu   numeric(14,2);
  v_s_na   numeric(14,2);
  v_paid   int;
begin
  select id into v_branch from branches where name = 'Ajman - Al Hamidiya';
  if v_branch is null then raise exception 'Branch "Ajman - Al Hamidiya" not found'; end if;

  -- STRICT on branch + name: NASER and MUKTHAR also hold in Ummu Gaffa.
  select id into strict v_ar from shareholders where branch_id = v_branch and display_name = 'ABDUL RAHMAN EK';
  select id into strict v_aj from shareholders where branch_id = v_branch and display_name = 'AJMAL';
  select id into strict v_mu from shareholders where branch_id = v_branch and display_name = 'MUKTHAR';
  select id into strict v_na from shareholders where branch_id = v_branch and display_name = 'NASER';

  for r in
    select * from (values
      -- month,        team (We), AbdulRahman, Ajmal,  Mukthar, Naser,  note
      ('2025-12-01'::date,  400.00, 100.00, 100.00, 100.00, 100.00,
        'Branch profit 5,000. Announced Jan 2026 (sheet shows "Jan-25"). Received. Sheet: forwarded to Ajmal.'),
      ('2026-01-01'::date, 2095.90, 523.98, 523.98, 523.97, 523.97,
        'Branch profit 26,200. Announced Feb 2026. Received. Sheet: forwarded to Ajmal, Naser (for NEM project).'),
      ('2026-02-01'::date, 1607.92, 401.98, 401.98, 401.98, 401.98,
        'Branch profit 20,100. Announced Mar 2026. Received 20 Jun 2026.'),
      ('2026-03-01'::date,  479.98, 120.00, 120.00, 119.99, 119.99,
        'Branch profit 6,000. Announced Apr 2026. Received 20 Jun 2026.'),
      ('2026-04-01'::date,  295.99,  74.00,  74.00,  74.00,  73.99,
        'Branch profit 3,700. Announced Jun 2026. Received 20 Jun 2026.'),
      ('2026-05-01'::date, 1002.03, 250.51, 250.51, 250.51, 250.50,
        'Branch profit 12,526. Announced Jun 2026. Sheet: received "June 26", not ticked.')
    ) as t(month, team, ar, aj, mu, na, note)
  loop
    if exists (select 1 from monthly_profits where branch_id = v_branch and period_month = r.month) then
      continue;
    end if;

    if r.ar + r.aj + r.mu + r.na <> r.team then
      raise exception 'Split for % does not sum: % + % + % + % <> %', r.month, r.ar, r.aj, r.mu, r.na, r.team;
    end if;

    insert into monthly_profits (branch_id, period_month, declared_amount, notes, is_locked)
    values (v_branch, r.month, r.team, 'From Shabeer''s sheet. ' || r.note, true)
    returning id into v_mp;

    insert into distribution_runs (
      branch_id, monthly_profit_id, period_start, period_end, net_profit,
      status, is_backfill, approved_at, notes
    ) values (
      v_branch, v_mp, r.month,
      (r.month + interval '1 month' - interval '1 day')::date,
      r.team, 'approved', false, now(),
      'Imported from Shabeer''s sheet (Ajman, team of four).'
    )
    returning id into v_run;

    insert into distribution_items (run_id, shareholder_id, ownership_pct_snapshot, computed_amount, manual_adjustment)
    values (v_run, v_ar, 25.00, r.ar, 0),
           (v_run, v_aj, 25.00, r.aj, 0),
           (v_run, v_mu, 25.00, r.mu, 0),
           (v_run, v_na, 25.00, r.na, 0);
  end loop;

  -- ---------------------------------------------------------------
  -- Verify against the sheet; roll back on any drift.
  -- ---------------------------------------------------------------
  select count(*), coalesce(sum(declared_amount), 0) into v_months, v_decl
  from monthly_profits
  where branch_id = v_branch and period_month between '2025-12-01' and '2026-05-01';

  select count(distinct dr.id), count(di.id),
         coalesce(sum(di.final_amount) filter (where di.shareholder_id = v_ar), 0),
         coalesce(sum(di.final_amount) filter (where di.shareholder_id = v_aj), 0),
         coalesce(sum(di.final_amount) filter (where di.shareholder_id = v_mu), 0),
         coalesce(sum(di.final_amount) filter (where di.shareholder_id = v_na), 0),
         count(di.id) filter (where di.paid_at is not null)
    into v_runs, v_items, v_s_ar, v_s_aj, v_s_mu, v_s_na, v_paid
  from distribution_runs dr
  join distribution_items di on di.run_id = dr.id
  where dr.branch_id = v_branch and dr.status <> 'void' and not dr.is_backfill
    and dr.period_start between '2025-12-01' and '2026-05-01';

  if v_months <> 6 or v_decl <> 5881.82 or v_runs <> 6 or v_items <> 24
     or v_s_ar <> 1470.47 or v_s_aj <> 1470.47 or v_s_mu <> 1470.45 or v_s_na <> 1470.43
     or v_paid <> 0 then
    raise exception
      'Ajman import verification FAILED: months %, declared %, runs %, items %, AbdulRahman %, Ajmal %, Mukthar %, Naser %, paid items % (expected 6 / 5881.82 / 6 / 24 / 1470.47 / 1470.47 / 1470.45 / 1470.43 / 0)',
      v_months, v_decl, v_runs, v_items, v_s_ar, v_s_aj, v_s_mu, v_s_na, v_paid;
  end if;

  raise notice 'Ajman Dec 2025–May 2026 OK: 6 months, team total %, Abdul Rahman %, Ajmal %, Mukthar %, Naser %, all owed',
    v_decl, v_s_ar, v_s_aj, v_s_mu, v_s_na;
end $$;
