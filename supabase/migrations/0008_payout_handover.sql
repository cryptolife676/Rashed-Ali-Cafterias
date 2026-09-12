-- =====================================================================
-- Migration 0008 — Per-item payout tracking + handover ("C/O") records
--
-- WHY: payDistributionRun settled every item at once and flipped the run
-- to 'paid' unconditionally, so the system could not express "three of
-- nine forwarded". The owner physically hands cash to some members
-- (Naser, Ajmal, Abdul Rahman) and needs to mark what he has already
-- forwarded and see what is still outstanding.
--
-- WHAT CHANGES:
--   1. shareholders.payout_via_profile_id — who forwards this member's
--      payout. The arrangement already exists in the business: migration
--      0005 records an investment as "Naser (C/O Mukthar)".
--   2. distribution_items.paid_by / payment_ref — who asserted the
--      handover, not just when.
--   3. distribution_runs.is_backfill — flags runs imported from records
--      that predate this system, whose net_profit is a PARTIAL figure
--      (see migration 0009). Must stay visually distinct everywhere.
--   4. pay_distribution_items() settles an arbitrary subset and promotes
--      the run to 'paid' only when nothing is outstanding.
--   5. pay_distribution_run() becomes "pay all remaining" on top of it.
--   6. unpay_distribution_item() reverses a handover marked in error.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Who hands over whose payout
--    Per shareholder ROW, not per person: Naser holds shares in both
--    Ummu Gaffa and Ajman, and those are two separate obligations.
-- ---------------------------------------------------------------------
alter table shareholders
  add column if not exists payout_via_profile_id uuid
    references profiles(id) on delete set null;

comment on column shareholders.payout_via_profile_id is
  'Profile who physically forwards this shareholder''s payouts. Null = paid directly.';

create index if not exists idx_sh_payout_via on shareholders(payout_via_profile_id)
  where payout_via_profile_id is not null;

-- ---------------------------------------------------------------------
-- 2) Who marked the item paid, and any reference for it
-- ---------------------------------------------------------------------
alter table distribution_items
  add column if not exists paid_by uuid references profiles(id) on delete set null;

alter table distribution_items
  add column if not exists payment_ref text;

-- ---------------------------------------------------------------------
-- 3) Flag for runs imported from pre-system records
-- ---------------------------------------------------------------------
alter table distribution_runs
  add column if not exists is_backfill boolean not null default false;

comment on column distribution_runs.is_backfill is
  'True for runs imported from records predating this system. Their net_profit '
  'covers only the shareholders we have data for, NOT the branch total, and '
  'their items do not form a 100% allocation. Label them wherever shown.';

-- ---------------------------------------------------------------------
-- 4) pay_distribution_items — settle a subset
--
--    Same idempotent insert as the original pay_distribution_run: the
--    partial unique index uq_withdrawals_one_per_distitem makes a repeat
--    call a no-op rather than a double payment.
-- ---------------------------------------------------------------------
create or replace function pay_distribution_items(p_item_ids uuid[], p_actor uuid)
returns table (paid_count int, total_amount numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_count   int := 0;
  v_total   numeric(14,2) := 0;
  v_run_ids uuid[] := '{}'::uuid[];
  r         record;
begin
  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    return query select 0, 0::numeric;
    return;
  end if;

  for r in
    select di.id, di.shareholder_id, di.final_amount, di.run_id
    from distribution_items di
    join distribution_runs dr on dr.id = di.run_id
    where di.id = any(p_item_ids)
      and di.paid_at is null
      and di.final_amount > 0
      and dr.status in ('approved', 'paid')
    for update of di
  loop
    insert into withdrawals (
      shareholder_id, amount, withdrawn_at, source,
      distribution_item_id, approved_by, notes
    ) values (
      r.shareholder_id, r.final_amount, current_date, 'distribution',
      r.id, p_actor, 'Distribution payout (run ' || r.run_id || ')'
    )
    on conflict (distribution_item_id) where source = 'distribution'
    do nothing;

    update distribution_items
      set paid_at = now(), paid_by = p_actor
      where id = r.id and paid_at is null;

    v_count := v_count + 1;
    v_total := v_total + r.final_amount;
    v_run_ids := array_append(v_run_ids, r.run_id);
  end loop;

  -- Promote a run to 'paid' ONLY when nothing is left outstanding on it.
  -- This is the whole point of the migration: a partially settled run must
  -- stay 'approved' so the remaining items keep showing as payable.
  update distribution_runs dr
    set status = 'paid', paid_at = coalesce(dr.paid_at, now())
    where dr.id = any(v_run_ids)
      and dr.status = 'approved'
      and not exists (
        select 1 from distribution_items di
        where di.run_id = dr.id and di.paid_at is null and di.final_amount > 0
      );

  return query select v_count, v_total;
end $$;

grant execute on function pay_distribution_items(uuid[], uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) pay_distribution_run — now "pay everything still outstanding"
--    Kept for the existing "Pay out" button. Status stays 'approved'
--    only as the entry condition; a partially paid run is still approved,
--    so the button correctly remains available to settle the rest.
-- ---------------------------------------------------------------------
create or replace function pay_distribution_run(p_run_id uuid, p_actor uuid)
returns table (paid_count int, total_amount numeric)
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  perform 1 from distribution_runs
    where id = p_run_id and status = 'approved'
    for update;
  if not found then
    raise exception 'Distribution run % is not in approved status', p_run_id;
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids
  from distribution_items
  where run_id = p_run_id and paid_at is null and final_amount > 0;

  return query select * from pay_distribution_items(v_ids, p_actor);
end $$;

grant execute on function pay_distribution_run(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6) unpay_distribution_item — reverse a handover marked in error
--    Deletes the withdrawal so total_withdrawn stays truthful, and drops
--    the run back to 'approved' since it is no longer fully settled.
-- ---------------------------------------------------------------------
create or replace function unpay_distribution_item(p_item_id uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  select run_id into v_run from distribution_items where id = p_item_id for update;
  if not found then
    raise exception 'Distribution item % not found', p_item_id;
  end if;

  delete from withdrawals
    where distribution_item_id = p_item_id and source = 'distribution';

  update distribution_items
    set paid_at = null, paid_by = null, payment_ref = null
    where id = p_item_id;

  update distribution_runs
    set status = 'approved', paid_at = null
    where id = v_run and status = 'paid';

  -- Attribute the reversal explicitly. The row-level audit trigger fires as
  -- auth.uid(), which is null when this is called through the service-role
  -- client, so un-recording money would otherwise have no named actor.
  insert into audit_logs (actor_id, action, table_name, row_id, before)
  values (
    p_actor, 'CUSTOM', 'distribution_items', p_item_id::text,
    jsonb_build_object('op', 'unpay_distribution_item', 'run_id', v_run)
  );
end $$;

grant execute on function unpay_distribution_item(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) Record the current handover arrangement
--    The owner (Mukthar) forwards the payouts for Naser, Ajmal and
--    Abdul Rahman in person. NASER matches in two branches (Ummu Gaffa
--    and Ajman) and both are genuinely his, so both rows are set — they
--    are two separate obligations.
--
--    Resolved from the MUKTHAR shareholder rows' profile link rather
--    than a hardcoded uuid. Skips with a notice rather than failing if
--    the link is missing or ambiguous (e.g. a fresh database), since it
--    is also settable from the shareholder edit form.
-- ---------------------------------------------------------------------
do $$
declare
  v_profile uuid;
  v_n       int;
  v_rows    int;
begin
  select count(distinct profile_id) into v_n
    from shareholders
    where display_name = 'MUKTHAR' and profile_id is not null;

  if v_n <> 1 then
    raise notice
      'Skipping handover assignment: found % distinct profile(s) linked to MUKTHAR (expected 1). Set "Payout handed over by" from the shareholder page instead.',
      v_n;
    return;
  end if;

  select distinct profile_id into v_profile
    from shareholders
    where display_name = 'MUKTHAR' and profile_id is not null;

  update shareholders
    set payout_via_profile_id = v_profile
    where display_name in ('NASER', 'AJMAL', 'ABDUL RAHMAN EK')
      and payout_via_profile_id is null;

  get diagnostics v_rows = row_count;
  raise notice 'Handover via Mukthar set on % shareholder row(s)', v_rows;
end $$;
