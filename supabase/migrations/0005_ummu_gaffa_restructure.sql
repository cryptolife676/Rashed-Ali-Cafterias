-- =====================================================================
-- Migration 0005 — Ummu Gaffa cap-table update
--
-- Updates the Ummu Gaffa profit shares + investment records to the
-- confirmed structure. No shareholder is removed (all 8 existing rows
-- stay, one new partner "Muthumol" is added), so distribution history
-- is untouched and no delete-and-rebuild is needed.
--
-- Profit model: franchise (Rashed Ali Licence) takes 30% off the top;
-- partners split the remaining 70%. Within Shabeer's pool he keeps a
-- 50% facilitator cut and the rest is shared among ALL cash backers
-- strictly by dirhams invested (equal cash = equal profit).
--
-- INVESTMENT (cash)                        PROFIT SHARE (ownership_pct)
--   Shajahan .............. 95,830           Shajahan ............ 35.0000%
--   Muthu ................. 28,332           Rashed Ali Licence .. 30.0000%
--   Rafeek ................ 19,166           Muthu ............... 10.5000%
--   Naser (C/O Mukthar) ... 16,000           Shabeer .............  9.1722%
--   Mukthar (own) ......... 10,000           Rafeek ..............  7.0000%
--   Syd Mashud ............ 10,000           Naser ...............  2.8966%
--   Muthumol .............. 10,000           Mukthar .............  1.8104%
--   Shabeer (own) .........  2,332           Syd Mashud ..........  1.8104%
--   (Rashed Ali Licence ...      0)          Muthumol ............  1.8104%
--   ----------------------                   -----------------------------
--   TOTAL ................ 191,660           TOTAL .............. 100.0000%
--
-- Ownership updates are ordered decreases-first so the per-row
-- "SUM(ownership_pct) <= 100" trigger never trips mid-transaction.
--
-- HEADS-UP: an existing DRAFT distribution run (all branches, period
-- 2026-03-31..2026-04-29) was computed on the OLD percentages and is now
-- stale. It is not touched here; delete and regenerate it when you next
-- run distributions.
-- =====================================================================

begin;

-- 1) ownership_pct — apply DECREASES first (always safe for the sum trigger)
update shareholders s set ownership_pct = 10.5000 from branches b
  where b.id = s.branch_id and b.name = 'Ummu Gaffa' and s.display_name = 'Muthu (Musthafa)';
update shareholders s set ownership_pct =  2.8966 from branches b
  where b.id = s.branch_id and b.name = 'Ummu Gaffa' and s.display_name = 'NASER';
update shareholders s set ownership_pct =  1.8104 from branches b
  where b.id = s.branch_id and b.name = 'Ummu Gaffa' and s.display_name = 'MUKTHAR';
update shareholders s set ownership_pct =  1.8104 from branches b
  where b.id = s.branch_id and b.name = 'Ummu Gaffa' and s.display_name = 'Syd Mashud';

-- 2) ownership_pct — then INCREASES
update shareholders s set ownership_pct =  7.0000 from branches b
  where b.id = s.branch_id and b.name = 'Ummu Gaffa' and s.display_name = 'Rafeek';
update shareholders s set ownership_pct =  9.1722 from branches b
  where b.id = s.branch_id and b.name = 'Ummu Gaffa' and s.display_name = 'SHABEER MOORKANAD';

-- (Shajahan 35.0000 and Rashed Ali Licence 30.0000 already correct — no change)

-- 3) add the new partner Muthumol (idempotent)
insert into shareholders (display_name, ownership_pct, profile_id, branch_id)
select 'Muthumol (Shabeer''s wife)', 1.8104, null, b.id
from branches b
where b.name = 'Ummu Gaffa'
  and not exists (
    select 1 from shareholders s2
    where s2.branch_id = b.id and s2.display_name = 'Muthumol (Shabeer''s wife)'
  );

-- 4) replace investment (cash) records for the branch — total 191,660
delete from investments i
using shareholders s, branches b
where i.shareholder_id = s.id and s.branch_id = b.id and b.name = 'Ummu Gaffa';

insert into investments (shareholder_id, amount, invested_at, notes, recorded_by)
select s.id, v.amount, date '2024-01-01', v.notes, v.recorded_by
from (values
  ('Shajahan',                   95830::numeric, '50% of partner pool',                                            null::uuid),
  ('Muthu (Musthafa)',           28332::numeric, 'Actual cash — absorbs rounding to land branch total on 191,660', null::uuid),
  ('Rafeek',                     19166::numeric, '10% of partner pool',                                            null::uuid),
  ('NASER',                      16000::numeric, 'C/O Mukthar — part of Shabeer 20% tranche',                      'caf5fb92-85d2-4c53-bc2d-44150aac026e'::uuid),
  ('MUKTHAR',                    10000::numeric, 'Own — part of Shabeer 20% tranche',                              null::uuid),
  ('Syd Mashud',                 10000::numeric, 'Part of Shabeer 20% tranche',                                    null::uuid),
  ('Muthumol (Shabeer''s wife)', 10000::numeric, 'Backs Shabeer 5% tranche',                                       null::uuid),
  ('SHABEER MOORKANAD',           2332::numeric, 'Own — fills 20% tranche to exactly 38,332',                      null::uuid)
) as v(name, amount, notes, recorded_by)
join branches b on b.name = 'Ummu Gaffa'
join shareholders s on s.branch_id = b.id and s.display_name = v.name;

commit;

-- ---- verification (run after; should print 100.0000 and 191660) ----
-- select display_name, ownership_pct from shareholders s
--   join branches b on b.id = s.branch_id where b.name = 'Ummu Gaffa'
--   order by ownership_pct desc;
-- select round(sum(ownership_pct),4) as pct_sum from shareholders s
--   join branches b on b.id = s.branch_id where b.name = 'Ummu Gaffa';
-- select sum(i.amount) as total_invested from investments i
--   join shareholders s on s.id = i.shareholder_id
--   join branches b on b.id = s.branch_id where b.name = 'Ummu Gaffa';
