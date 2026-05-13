-- =====================================================================
-- Migration 0003 — Security & correctness fixes
-- - New auth users default to inactive (must be approved by admin)
-- - Tighter RLS: business reads require is_active profile
-- - Atomic pay_distribution_run() with partial unique index on payouts
-- - Skip audit logging for no-op updates
-- - Index withdrawals.distribution_item_id
-- - Trigger: prevent writes to transactions in a locked period
-- - Trigger: prevent edits to is_locked transactions
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) New auth users get an INACTIVE profile by default
--    (was: is_active default true, role 'viewer' — anyone with Google
--     could sign up and get DB read access via the auth.uid() RLS policies)
-- ---------------------------------------------------------------------
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    'viewer',
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Lock down any pre-existing viewer rows that were auto-created
update profiles set is_active = false
  where role = 'viewer' and is_active = true;

-- ---------------------------------------------------------------------
-- 2) is_active_user() helper, then tighten reads
-- ---------------------------------------------------------------------
create or replace function is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active);
$$;

drop policy if exists branches_read on branches;
create policy branches_read on branches for select using (is_active_user());

drop policy if exists categories_read on categories;
create policy categories_read on categories for select using (is_active_user());

drop policy if exists txn_read on transactions;
create policy txn_read on transactions for select using (is_active_user());

drop policy if exists sa_read on system_activity;
create policy sa_read on system_activity for select using (is_active_user());

-- ---------------------------------------------------------------------
-- 3) Audit trigger — skip true no-op updates
-- ---------------------------------------------------------------------
create or replace function audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid;
begin
  actor := auth.uid();
  if (tg_op = 'DELETE') then
    insert into audit_logs(actor_id, action, table_name, row_id, before)
    values (actor, tg_op, tg_table_name, old.id::text, to_jsonb(old));
    return old;
  elsif (tg_op = 'UPDATE') then
    if to_jsonb(old) = to_jsonb(new) then
      return new;  -- no change, don't pollute the audit log
    end if;
    insert into audit_logs(actor_id, action, table_name, row_id, before, after)
    values (actor, tg_op, tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into audit_logs(actor_id, action, table_name, row_id, after)
    values (actor, tg_op, tg_table_name, new.id::text, to_jsonb(new));
    return new;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) Withdrawals: index + partial unique on distribution payouts
--    (one withdrawal per distribution_item — backstops the pay race)
-- ---------------------------------------------------------------------
create index if not exists idx_withdrawals_distitem on withdrawals(distribution_item_id);

-- Drop any pre-existing duplicate distribution withdrawals before adding the unique
delete from withdrawals w
where source = 'distribution'
  and exists (
    select 1 from withdrawals w2
    where w2.source = 'distribution'
      and w2.distribution_item_id = w.distribution_item_id
      and w2.created_at < w.created_at
  );

create unique index if not exists uq_withdrawals_one_per_distitem
  on withdrawals(distribution_item_id)
  where source = 'distribution';

-- ---------------------------------------------------------------------
-- 5) Atomic pay_distribution_run — single SQL call replaces the
--    select-then-insert race in the server action
-- ---------------------------------------------------------------------
create or replace function pay_distribution_run(p_run_id uuid, p_actor uuid)
returns table (paid_count int, total_amount numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_total numeric(14,2) := 0;
  r record;
begin
  -- Lock the run row and verify status
  perform 1 from distribution_runs
    where id = p_run_id and status = 'approved'
    for update;
  if not found then
    raise exception 'Distribution run % is not in approved status', p_run_id;
  end if;

  for r in
    select id, shareholder_id, final_amount
    from distribution_items
    where run_id = p_run_id
      and paid_at is null
      and final_amount > 0
    for update
  loop
    -- Partial unique index makes this idempotent under concurrent calls
    insert into withdrawals (
      shareholder_id, amount, withdrawn_at, source,
      distribution_item_id, approved_by, notes
    ) values (
      r.shareholder_id, r.final_amount, current_date, 'distribution',
      r.id, p_actor, 'Distribution payout (run ' || p_run_id || ')'
    )
    on conflict (distribution_item_id) where source = 'distribution'
    do nothing;

    update distribution_items
      set paid_at = now()
      where id = r.id and paid_at is null;

    v_count := v_count + 1;
    v_total := v_total + r.final_amount;
  end loop;

  update distribution_runs
    set status = 'paid', paid_at = now()
    where id = p_run_id;

  return query select v_count, v_total;
end $$;

-- ---------------------------------------------------------------------
-- 6) Lock-period enforcement on transactions
--    - Prevent INSERT/UPDATE that lands a row in an approved/paid run
--    - Prevent edits to a transaction whose is_locked = true
--    Both triggers tolerate the lock-flag-only flip done by approve()
-- ---------------------------------------------------------------------
create or replace function prevent_locked_period_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare conflict_id uuid;
begin
  -- Allow approveDistributionRun's lock-flag-only update to pass through
  if tg_op = 'UPDATE'
     and new.is_locked is distinct from old.is_locked
     and new.entry_date = old.entry_date
     and new.branch_id is not distinct from old.branch_id
     and new.amount = old.amount
     and new.kind = old.kind
     and new.category_id is not distinct from old.category_id
     and new.notes is not distinct from old.notes then
    return new;
  end if;

  select id into conflict_id
  from distribution_runs
  where status in ('approved','paid')
    and new.entry_date between period_start and period_end
    and (branch_id is null or new.branch_id is null or branch_id = new.branch_id)
  limit 1;

  if conflict_id is not null then
    raise exception
      'Cannot write transaction: date % falls in a locked distribution period (run %)',
      new.entry_date, conflict_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_locked_period on transactions;
create trigger trg_prevent_locked_period
  before insert or update on transactions
  for each row execute function prevent_locked_period_write();

create or replace function prevent_locked_txn_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.is_locked = true then
    -- Allow lock-flag-only changes (approve/unlock paths)
    if new.entry_date = old.entry_date
       and new.branch_id is not distinct from old.branch_id
       and new.amount = old.amount
       and new.kind = old.kind
       and new.category_id is not distinct from old.category_id
       and new.notes is not distinct from old.notes then
      return new;
    end if;
    raise exception 'Cannot edit transaction %: row is locked', old.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_locked_edit on transactions;
create trigger trg_prevent_locked_edit
  before update on transactions
  for each row execute function prevent_locked_txn_edit();
