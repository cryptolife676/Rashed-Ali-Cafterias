-- =====================================================================
-- Migration 0015 — Correct Ajmal's Ajman investment to 12,875
--
-- Shabeer's Ajman sheet shows each of the four team members investing
-- 12,875 (51,500 in total). The site recorded 32,875 for Ajmal in Ajman:
--
--   12,875  "Ajmal contribution — C/O Mukthar"                       (correct)
--   10,000  "Investment in Ajwa - Ras Al Khaima (via Shabeer share)"  (Ajwa, not Ajman)
--   10,000  identical note, same date, same creation time             (duplicate)
--
-- The owner confirmed Ajmal's Ajwa investment is 10,000, so the two 10,000
-- rows are one Ajwa investment entered twice, and neither belongs to Ajman.
-- Owner's decision: correct Ajman to 12,875 now.
--
-- The genuine 10,000 is NOT lost: the audit trigger on investments stores the
-- full row (before-image) for every delete, so it can be re-created on Ajmal's
-- Ajwa holding once that deal is settled.
--
-- Guarded: deletes only these two exact rows, and only while they still hold
-- the amount and note read on 2026-09-13. Verifies the result and rolls back
-- if Ajmal's Ajman total is anything other than 12,875.
-- =====================================================================

do $$
declare
  v_branch  uuid;
  v_ajmal   uuid;
  v_deleted int;
  v_total   numeric(14,2);
begin
  select id into v_branch from branches where name = 'Ajman - Al Hamidiya';
  if v_branch is null then raise exception 'Branch "Ajman - Al Hamidiya" not found'; end if;

  select id into strict v_ajmal
    from shareholders where branch_id = v_branch and display_name = 'AJMAL';

  -- Already corrected? Nothing to do.
  select coalesce(sum(amount), 0) into v_total from investments where shareholder_id = v_ajmal;
  if v_total = 12875.00 then
    raise notice 'Ajmal Ajman investment already 12,875 — nothing to change';
    return;
  end if;

  delete from investments
  where shareholder_id = v_ajmal
    and id in ('de8e70fb-9ad3-4ede-91a3-46ccdea3aa19', '2c5a094d-4fa6-4331-bf48-2b34827c823c')
    and amount = 10000.00
    and notes like 'Investment in Ajwa - Ras Al Khaima%';
  get diagnostics v_deleted = row_count;

  select coalesce(sum(amount), 0) into v_total from investments where shareholder_id = v_ajmal;

  if v_deleted <> 2 or v_total <> 12875.00 then
    raise exception
      'Ajmal Ajman investment fix FAILED: deleted % row(s), Ajman total now % (expected 2 rows, 12875.00). Rolled back.',
      v_deleted, v_total;
  end if;

  raise notice 'Ajmal Ajman investment corrected: removed 2 Ajwa-labelled 10,000 rows (one a duplicate); Ajman total 12,875.00. Deleted rows are preserved in audit_logs.';
end $$;
