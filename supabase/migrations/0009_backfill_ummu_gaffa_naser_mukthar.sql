-- =====================================================================
-- Migration 0009 — Backfill Naser & Mukthar's Ummu Gaffa payout history
--                  (profit months Aug 2023 → Aug 2025, 25 months)
--
-- SOURCE: the owner's spreadsheet, three money columns — NASER, MUKTHAR,
-- TOTAL.
--
-- READ THIS BEFORE CHANGING ANYTHING HERE:
--
--   TOTAL is the sum of those two people's payouts. It is NOT Ummu
--   Gaffa's monthly profit. Naser holds 2.8966% and Mukthar 1.8104% of
--   the branch (migration 0005) — 4.707% between them. Naser's share OF
--   THE PAIR is 2.8966/4.707 = 0.615381, and every one of the 25 rows
--   splits at exactly 0.6154 / 0.3846. So TOTAL is ~4.7% of the branch's
--   profit, not 100% of it.
--
--   Importing TOTAL as a declared monthly profit would be wrong by a
--   factor of ~21 and would make the distribution engine allocate
--   fabricated amounts to the other seven Ummu Gaffa shareholders. Nor
--   can the branch total be back-derived by dividing by 0.04707: 0005
--   changed the cap table, so today's percentages did not necessarily
--   produce these 2023-24 figures.
--
--   We know what these two were paid. We do not know the branch's profit
--   or what anyone else received. Only the former is recorded here.
--
-- WHY distribution_items AND withdrawals, not just withdrawals:
--   v_shareholder_summary derives total_profit_earned from
--   distribution_items.final_amount (runs in 'approved'/'paid') and
--   total_withdrawn from withdrawals.amount. Withdrawals without matching
--   items would show both men withdrawing more than they ever earned,
--   with a negative remaining balance. The items are what make it true.
--
-- SHAPE: one run per profit month, flagged is_backfill, monthly_profit_id
-- left NULL (no figure was ever declared for these months), status 'paid'.
-- ownership_pct_snapshot holds each man's share OF THIS RUN (61.54/38.46),
-- not his branch percentage, so that
-- ownership_pct_snapshot × net_profit = computed_amount stays internally
-- consistent for a run whose pool is just the pair.
--
-- ROUNDING: the sheet carries 4 decimals (residue of multiplying by
-- 0.6154); money here is numeric(14,2). Rounding to fils is lossless at
-- both levels — all 25 rows still satisfy Naser + Mukthar = TOTAL exactly,
-- and the totals land on 15,894.55 / 9,933.45 / 25,828.00 with no drift,
-- so the assertion below needs no tolerance.
--
-- IDEMPOTENT: skips any profit month already backfilled for this branch,
-- and the partial unique index on withdrawals(distribution_item_id)
-- prevents a double payment even if run twice.
-- =====================================================================

do $$
declare
  v_branch    uuid;
  v_naser     uuid;
  v_mukthar   uuid;
  v_run       uuid;
  v_item      uuid;
  r           record;
  v_runs      int;
  v_total_n   numeric(14,2);
  v_total_m   numeric(14,2);
  v_inserted  int := 0;
begin
  select id into v_branch from branches where name = 'Ummu Gaffa';
  if v_branch is null then
    raise exception 'Branch "Ummu Gaffa" not found';
  end if;

  -- STRICT: raises unless exactly one row matches. Both names also exist
  -- under Ajman - Al Hamidiya at 2%, and writing this history against the
  -- wrong branch row would corrupt a different branch's portfolio.
  select id into strict v_naser
    from shareholders where branch_id = v_branch and display_name = 'NASER';
  select id into strict v_mukthar
    from shareholders where branch_id = v_branch and display_name = 'MUKTHAR';

  for r in
    select * from (values
      ('2023-08-01'::date, '2023-09-01'::date, 723.71, 452.29, 1176.00, true),
      ('2023-09-01'::date, '2023-10-01'::date, 766.79, 479.21, 1246.00, true),
      ('2023-10-01'::date, '2023-11-01'::date, 650.48, 406.52, 1057.00, true),
      ('2023-11-01'::date, '2023-12-01'::date, 575.40, 359.60, 935.00, true),
      ('2023-12-01'::date, '2024-01-01'::date, 355.70, 222.30, 578.00, true),
      ('2024-01-01'::date, '2024-02-01'::date, 604.94, 378.06, 983.00, true),
      ('2024-02-01'::date, '2024-03-01'::date, 971.10, 606.90, 1578.00, true),
      ('2024-03-01'::date, '2024-04-01'::date, 444.93, 278.07, 723.00, true),
      ('2024-04-01'::date, '2024-05-01'::date, 1019.10, 636.90, 1656.00, true),
      ('2024-05-01'::date, '2024-06-01'::date, 834.48, 521.52, 1356.00, true),
      ('2024-06-01'::date, '2024-07-01'::date, 289.85, 181.15, 471.00, true),
      ('2024-07-01'::date, '2024-08-01'::date, 758.17, 473.83, 1232.00, true),
      ('2024-08-01'::date, '2024-09-01'::date, 676.94, 423.06, 1100.00, true),
      ('2024-09-01'::date, '2024-10-01'::date, 392.01, 244.99, 637.00, true),
      ('2024-10-01'::date, '2024-11-01'::date, 527.40, 329.60, 857.00, true),
      ('2024-11-01'::date, '2024-12-01'::date, 865.87, 541.13, 1407.00, true),
      ('2024-12-01'::date, '2025-01-01'::date, 295.39, 184.61, 480.00, true),
      ('2025-01-01'::date, '2025-02-01'::date, 937.25, 585.75, 1523.00, true),
      ('2025-02-01'::date, '2025-03-21'::date, 693.56, 433.44, 1127.00, false),
      ('2025-03-01'::date, '2025-04-21'::date, 256.01, 159.99, 416.00, false),
      ('2025-04-01'::date, '2025-05-15'::date, 964.95, 603.05, 1568.00, false),
      ('2025-05-01'::date, '2025-06-17'::date, 904.64, 565.36, 1470.00, false),
      ('2025-06-01'::date, '2025-07-28'::date, 192.62, 120.38, 313.00, false),
      ('2025-07-01'::date, '2025-08-21'::date, 608.63, 380.37, 989.00, false),
      ('2025-08-01'::date, '2025-09-20'::date, 584.63, 365.37, 950.00, false)
    ) as t(profit_month, handover_date, naser, mukthar, total, date_approx)
  loop
    -- Already backfilled? leave it alone.
    if exists (
      select 1 from distribution_runs
      where branch_id = v_branch
        and is_backfill
        and period_start = r.profit_month
    ) then
      continue;
    end if;

    insert into distribution_runs (
      branch_id, monthly_profit_id, period_start, period_end,
      gross_income, total_expenses, net_profit,
      status, is_backfill, paid_at, notes
    ) values (
      v_branch,
      null,                                   -- no figure was ever declared
      r.profit_month,
      (r.profit_month + interval '1 month' - interval '1 day')::date,
      0, 0,
      r.total,                                -- Naser + Mukthar ONLY
      'paid',
      true,
      r.handover_date::timestamptz,
      'Backfilled from the owner''s spreadsheet. Covers NASER and MUKTHAR only '
        || '(4.707% of the branch between them) — this is NOT Ummu Gaffa''s total '
        || 'profit for the month, which is unknown.'
        || case when r.date_approx
             then ' Handover date is approximate (source gave month only).'
             else '' end
    )
    returning id into v_run;

    insert into distribution_items (
      run_id, shareholder_id, ownership_pct_snapshot, computed_amount, manual_adjustment, paid_at
    ) values (v_run, v_naser, 61.5400, r.naser, 0, r.handover_date::timestamptz)
    returning id into v_item;

    insert into withdrawals (
      shareholder_id, amount, withdrawn_at, source, distribution_item_id, notes
    ) values (
      v_naser, r.naser, r.handover_date, 'distribution', v_item,
      'Historical distribution payout (backfilled, run ' || v_run || ')'
    );

    insert into distribution_items (
      run_id, shareholder_id, ownership_pct_snapshot, computed_amount, manual_adjustment, paid_at
    ) values (v_run, v_mukthar, 38.4600, r.mukthar, 0, r.handover_date::timestamptz)
    returning id into v_item;

    insert into withdrawals (
      shareholder_id, amount, withdrawn_at, source, distribution_item_id, notes
    ) values (
      v_mukthar, r.mukthar, r.handover_date, 'distribution', v_item,
      'Historical distribution payout (backfilled, run ' || v_run || ')'
    );

    v_inserted := v_inserted + 1;
  end loop;

  -- ---------------------------------------------------------------
  -- Verify against the source totals. Raise (and roll back) on drift
  -- rather than reporting success.
  -- ---------------------------------------------------------------
  select count(distinct dr.id),
         coalesce(sum(case when di.shareholder_id = v_naser   then di.final_amount end), 0),
         coalesce(sum(case when di.shareholder_id = v_mukthar then di.final_amount end), 0)
    into v_runs, v_total_n, v_total_m
  from distribution_runs dr
  join distribution_items di on di.run_id = dr.id
  where dr.branch_id = v_branch and dr.is_backfill;

  if v_runs <> 25 or v_total_n <> 15894.55 or v_total_m <> 9933.45 then
    raise exception
      'Backfill verification FAILED: % runs, Naser %, Mukthar % (expected 25 / 15894.55 / 9933.45)',
      v_runs, v_total_n, v_total_m;
  end if;

  raise notice 'Backfill OK: % new run(s); 25 months total, Naser %, Mukthar %, combined %',
    v_inserted, v_total_n, v_total_m, v_total_n + v_total_m;
end $$;
