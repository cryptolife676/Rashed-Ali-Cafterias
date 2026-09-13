-- =====================================================================
-- Migration 0017 — Ajwa team: Ajmal and Naser, split 2 : 1
--
-- REQUIRES 0008 (payout_via_profile_id) and 0010 (payout_group_members).
--
-- WHY: Shabeer enters Ajwa's team amount and it must go 2 parts to Ajmal
-- (invested 10,000) and 1 part to Naser (invested 5,000). The owner is not
-- settling Ajwa's cap table or investments yet.
--
-- The engine splits a team amount by ownership_pct, but Ajwa already sums to
-- exactly 100% (four partners at 25%). Giving Ajmal and Naser any percentage
-- would mean cutting Shabeer's 25% — the decision the owner deferred. So:
--
--   * shareholders.split_weight (optional) is what a team amount is divided
--     by; when null it falls back to ownership_pct, so Ummu Gaffa and Ajman
--     split exactly as before.
--   * Ajmal and Naser get Ajwa rows at 0% ownership (nothing agreed yet) with
--     weights 10,000 and 5,000. Ajwa's ownership total stays 100%; Shabeer's
--     25% and all investments are untouched.
--   * The ownership check is relaxed from > 0 to >= 0 so a team member can
--     hold a row before their percentage is agreed.
--
-- Idempotent; verifies and rolls back on any mismatch.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Allow 0% ownership. The original inline check was auto-named, so find
--    it by definition rather than guessing the name.
-- ---------------------------------------------------------------------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.shareholders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%ownership_pct%'
  loop
    execute format('alter table shareholders drop constraint %I', c);
  end loop;
end $$;

alter table shareholders
  add constraint shareholders_ownership_pct_range
  check (ownership_pct >= 0 and ownership_pct <= 100);

-- ---------------------------------------------------------------------
-- 2) Optional split weight
-- ---------------------------------------------------------------------
alter table shareholders
  add column if not exists split_weight numeric(14,4)
  check (split_weight is null or split_weight > 0);

comment on column shareholders.split_weight is
  'Divides a team amount between team members. Null = use ownership_pct. '
  'Used where ownership is not agreed yet (Ajwa: Ajmal 10000, Naser 5000).';

-- ---------------------------------------------------------------------
-- 3) Team lookup returns the effective weight. The return type changes, so
--    the function is dropped and recreated (still security definer: callers
--    such as the accountant cannot read other members' rows under RLS).
--    Ordering is unchanged for branches without weights.
-- ---------------------------------------------------------------------
drop function if exists payout_group_members(uuid);

create function payout_group_members(p_branch uuid)
returns table (shareholder_id uuid, display_name text, ownership_pct numeric, split_weight numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.display_name, s.ownership_pct, coalesce(s.split_weight, s.ownership_pct)
  from shareholders s
  where s.branch_id = p_branch
    and s.is_active
    and s.payout_via_profile_id is not null
    and coalesce(s.split_weight, s.ownership_pct) > 0
  order by coalesce(s.split_weight, s.ownership_pct) desc, s.display_name;
$$;

grant execute on function payout_group_members(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Ajmal and Naser in Ajwa
-- ---------------------------------------------------------------------
do $$
declare
  v_branch uuid;
  v_via    uuid;
  v_aj     uuid;
  v_na     uuid;
  v_n      int;
  v_total  numeric(10,4);
  v_count  int;
  v_weight numeric;
  v_ajw    numeric;
  v_naw    numeric;
begin
  select id into v_branch from branches where name = 'Ajwa - Ras Al Khaima';
  if v_branch is null then raise exception 'Branch "Ajwa - Ras Al Khaima" not found'; end if;

  -- Same handler as the team's other rows (Mukthar), resolved, not hardcoded.
  select count(distinct payout_via_profile_id) into v_n
    from shareholders
    where display_name in ('AJMAL', 'NASER') and payout_via_profile_id is not null;
  if v_n <> 1 then
    raise exception 'Expected one handover profile on AJMAL/NASER rows, found %', v_n;
  end if;
  select distinct payout_via_profile_id into v_via
    from shareholders
    where display_name in ('AJMAL', 'NASER') and payout_via_profile_id is not null;

  -- Link to their existing logins so their portfolios include Ajwa.
  select distinct profile_id into strict v_aj
    from shareholders where display_name = 'AJMAL' and profile_id is not null;
  select distinct profile_id into strict v_na
    from shareholders where display_name = 'NASER' and profile_id is not null;

  if not exists (select 1 from shareholders where branch_id = v_branch and display_name = 'AJMAL') then
    insert into shareholders (profile_id, branch_id, display_name, ownership_pct, split_weight, payout_via_profile_id)
    values (v_aj, v_branch, 'AJMAL', 0, 10000, v_via);
  end if;

  if not exists (select 1 from shareholders where branch_id = v_branch and display_name = 'NASER') then
    insert into shareholders (profile_id, branch_id, display_name, ownership_pct, split_weight, payout_via_profile_id)
    values (v_na, v_branch, 'NASER', 0, 5000, v_via);
  end if;

  -- Verify: ownership still 100%, team is exactly Ajmal 10,000 + Naser 5,000.
  select coalesce(sum(ownership_pct), 0) into v_total
    from shareholders where branch_id = v_branch and is_active;

  select count(*), coalesce(sum(g.split_weight), 0),
         max(g.split_weight) filter (where g.display_name = 'AJMAL'),
         max(g.split_weight) filter (where g.display_name = 'NASER')
    into v_count, v_weight, v_ajw, v_naw
  from payout_group_members(v_branch) g;

  if v_total <> 100 or v_count <> 2 or v_ajw <> 10000 or v_naw <> 5000 then
    raise exception
      'Ajwa team verification FAILED: ownership total %, team members %, Ajmal weight %, Naser weight % (expected 100 / 2 / 10000 / 5000)',
      v_total, v_count, v_ajw, v_naw;
  end if;

  raise notice 'Ajwa team OK: Ajmal 10,000 : Naser 5,000 (2 : 1); Ajwa ownership still 100%%';
end $$;
