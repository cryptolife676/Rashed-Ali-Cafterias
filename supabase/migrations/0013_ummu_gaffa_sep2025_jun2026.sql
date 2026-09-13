-- =====================================================================
-- Migration 0013 — Ummu Gaffa, Sep 2025 → Jun 2026 (from Shabeer's sheet)
--
-- REQUIRES 0010 (declared_amount, payout group) and 0011.
--
-- The sheet continues the one backfilled in 0009. Its first 25 rows
-- (Aug 2023 – Aug 2025) are already recorded and match exactly, so only
-- the 10 months after them are added here. Unlike 0009 these are real
-- declared figures in the live model: in Ummu Gaffa the payout group IS
-- Naser + Mukthar, so each figure is precisely a monthly_profits row, and
-- the runs are ordinary (is_backfill = false).
--
-- Decisions confirmed by the owner:
--   * Split: EXACT from ownership_pct (2.8966 / 1.8104), largest remainder —
--     the same allocation the site computes. Amounts below were produced
--     by the site's own allocator; each pair sums to its month exactly.
--   * Sep–Dec 2025: already paid (the sheet gives handover months Oct-25 →
--     Jan-26). Recorded as paid on the 1st of that month — approximate,
--     since the day was not recorded, and noted as such.
--   * Jan & Feb 2026: "NIL – WORK". Recorded as 0.00 with that note so the
--     gap is explained; no run, since there is nothing to distribute.
--   * Mar–Jun 2026: approved but NOT paid. The owner will tick them on the
--     Payouts page with the real date and a remark.
--
-- Idempotent: skips any month already present for the branch, and verifies
-- the result against the sheet, rolling back on any mismatch.
-- =====================================================================

do $$
declare
  v_branch  uuid;
  v_naser   uuid;
  v_mukthar uuid;
  v_mp      uuid;
  v_run     uuid;
  v_item    uuid;
  r         record;
  v_months  int;
  v_decl    numeric(14,2);
  v_runs    int;
  v_n       numeric(14,2);
  v_m       numeric(14,2);
  v_paid    numeric(14,2);
  v_owed    numeric(14,2);
begin
  select id into v_branch from branches where name = 'Ummu Gaffa';
  if v_branch is null then raise exception 'Branch "Ummu Gaffa" not found'; end if;

  -- STRICT: both names also exist under Ajman; the wrong row would corrupt
  -- another branch's history.
  select id into strict v_naser
    from shareholders where branch_id = v_branch and display_name = 'NASER';
  select id into strict v_mukthar
    from shareholders where branch_id = v_branch and display_name = 'MUKTHAR';

  for r in
    select * from (values
      -- month,        total,   naser,   mukthar, state,  handed over
      ('2025-09-01'::date, 1004.00, 617.84,  386.16, 'paid',   '2025-10-01'::date),
      ('2025-10-01'::date, 1538.00, 946.46,  591.54, 'paid',   '2025-11-01'::date),
      ('2025-11-01'::date, 1837.00, 1130.46, 706.54, 'paid',   '2025-12-01'::date),
      ('2025-12-01'::date,  750.00, 461.54,  288.46, 'paid',   '2026-01-01'::date),
      ('2026-01-01'::date,    0.00,   0.00,    0.00, 'nil',    null::date),
      ('2026-02-01'::date,    0.00,   0.00,    0.00, 'nil',    null::date),
      ('2026-03-01'::date, 1068.00, 657.23,  410.77, 'owed',   null::date),
      ('2026-04-01'::date, 1558.00, 958.76,  599.24, 'owed',   null::date),
      ('2026-05-01'::date, 1778.00, 1094.15, 683.85, 'owed',   null::date),
      ('2026-06-01'::date,  332.00, 204.31,  127.69, 'owed',   null::date)
    ) as t(month, total, naser, mukthar, state, handed_over)
  loop
    if exists (
      select 1 from monthly_profits where branch_id = v_branch and period_month = r.month
    ) then
      continue;
    end if;

    if r.naser + r.mukthar <> r.total then
      raise exception 'Split for % does not sum: % + % <> %', r.month, r.naser, r.mukthar, r.total;
    end if;

    insert into monthly_profits (branch_id, period_month, declared_amount, notes, is_locked)
    values (
      v_branch, r.month, r.total,
      case r.state
        when 'nil'  then 'NIL – work'
        when 'paid' then 'From Shabeer''s sheet. Handed over '
                         || to_char(r.handed_over, 'Mon YYYY') || ' (day not recorded).'
        else             'From Shabeer''s sheet.'
      end,
      r.state <> 'nil'   -- a distributed month is locked; a NIL month is not
    )
    returning id into v_mp;

    if r.state = 'nil' then
      continue;
    end if;

    insert into distribution_runs (
      branch_id, monthly_profit_id, period_start, period_end, net_profit,
      status, is_backfill, approved_at, paid_at, notes
    ) values (
      v_branch, v_mp, r.month,
      (r.month + interval '1 month' - interval '1 day')::date,
      r.total,
      case when r.state = 'paid' then 'paid' else 'approved' end::distribution_status,
      false,
      coalesce(r.handed_over::timestamptz, now()),
      r.handed_over::timestamptz,
      'Imported from Shabeer''s sheet (Ummu Gaffa, Naser + Mukthar).'
    )
    returning id into v_run;

    -- Naser
    insert into distribution_items (
      run_id, shareholder_id, ownership_pct_snapshot, computed_amount, manual_adjustment,
      paid_at, payment_ref
    ) values (
      v_run, v_naser, 61.54, r.naser, 0,
      r.handed_over::timestamptz,
      case when r.state = 'paid' then 'Handover day not recorded (sheet gave month only)' end
    )
    returning id into v_item;
    if r.state = 'paid' then
      insert into withdrawals (shareholder_id, amount, withdrawn_at, source, distribution_item_id, notes)
      values (v_naser, r.naser, r.handed_over, 'distribution', v_item,
              'Distribution payout (run ' || v_run || '), from Shabeer''s sheet');
    end if;

    -- Mukthar
    insert into distribution_items (
      run_id, shareholder_id, ownership_pct_snapshot, computed_amount, manual_adjustment,
      paid_at, payment_ref
    ) values (
      v_run, v_mukthar, 38.46, r.mukthar, 0,
      r.handed_over::timestamptz,
      case when r.state = 'paid' then 'Handover day not recorded (sheet gave month only)' end
    )
    returning id into v_item;
    if r.state = 'paid' then
      insert into withdrawals (shareholder_id, amount, withdrawn_at, source, distribution_item_id, notes)
      values (v_mukthar, r.mukthar, r.handed_over, 'distribution', v_item,
              'Distribution payout (run ' || v_run || '), from Shabeer''s sheet');
    end if;
  end loop;

  -- ---------------------------------------------------------------
  -- Verify against the sheet; roll back on any drift.
  -- ---------------------------------------------------------------
  select count(*), coalesce(sum(declared_amount), 0)
    into v_months, v_decl
  from monthly_profits
  where branch_id = v_branch and period_month between '2025-09-01' and '2026-06-01';

  select count(distinct dr.id),
         coalesce(sum(di.final_amount) filter (where di.shareholder_id = v_naser), 0),
         coalesce(sum(di.final_amount) filter (where di.shareholder_id = v_mukthar), 0),
         coalesce(sum(di.final_amount) filter (where di.paid_at is not null), 0),
         coalesce(sum(di.final_amount) filter (where di.paid_at is null), 0)
    into v_runs, v_n, v_m, v_paid, v_owed
  from distribution_runs dr
  join distribution_items di on di.run_id = dr.id
  where dr.branch_id = v_branch and not dr.is_backfill
    and dr.period_start between '2025-09-01' and '2026-06-01';

  if v_months <> 10 or v_decl <> 9865.00 or v_runs <> 8
     or v_n <> 6070.75 or v_m <> 3794.25
     or v_paid <> 5129.00 or v_owed <> 4736.00 then
    raise exception
      'Import verification FAILED: months %, declared %, runs %, Naser %, Mukthar %, paid %, owed % (expected 10 / 9865.00 / 8 / 6070.75 / 3794.25 / 5129.00 / 4736.00)',
      v_months, v_decl, v_runs, v_n, v_m, v_paid, v_owed;
  end if;

  raise notice 'Ummu Gaffa Sep 2025–Jun 2026 OK: 10 months, declared %, Naser %, Mukthar %, paid %, still owed %',
    v_decl, v_n, v_m, v_paid, v_owed;
end $$;
