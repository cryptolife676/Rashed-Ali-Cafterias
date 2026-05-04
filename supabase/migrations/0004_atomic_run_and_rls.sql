-- =====================================================================
-- Migration 0004 — Atomic distribution-run creation + tighter self-access RLS
--
-- 1) create_distribution_run(): single SQL call that inserts a run row
--    and all item rows atomically — replaces the non-atomic two-step
--    insert that could leave orphaned run rows on partial failure.
--
-- 2) Self-access RLS policies on shareholders, investments, withdrawals,
--    distribution_items and distribution_runs now require is_active_user()
--    in addition to auth.uid() ownership, so deactivated users cannot
--    read their own historical data until an admin reactivates them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) create_distribution_run — atomic insert of run + items
--    Called by server/actions/distributions.ts via adminClient.rpc()
-- ---------------------------------------------------------------------
create or replace function create_distribution_run(
  p_branch_id       uuid,
  p_period_start    date,
  p_period_end      date,
  p_gross_income    numeric,
  p_total_expenses  numeric,
  p_net_profit      numeric,
  p_notes           text,
  p_created_by      uuid,
  p_items           jsonb   -- [{shareholder_id, ownership_pct_snapshot, computed_amount}]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
  item     jsonb;
begin
  -- Insert the distribution run
  insert into distribution_runs (
    branch_id, period_start, period_end,
    gross_income, total_expenses, net_profit,
    notes, created_by, status
  ) values (
    p_branch_id, p_period_start, p_period_end,
    p_gross_income, p_total_expenses, p_net_profit,
    p_notes, p_created_by, 'draft'
  )
  returning id into v_run_id;

  -- Insert all items in the same transaction
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

-- Grant execute to authenticated and service_role (admin client uses service_role)
grant execute on function create_distribution_run(uuid,date,date,numeric,numeric,numeric,text,uuid,jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Tighten self-access RLS policies to require is_active_user()
--    An inactive (pending-approval) user should not be able to read
--    their own shareholder data, investments, or withdrawal history
--    until an admin activates them.
-- ---------------------------------------------------------------------

-- profiles: own-row read requires active profile
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (
    (id = auth.uid() and is_active_user())
    or is_admin()
  );

-- shareholders: own row requires active user
drop policy if exists sh_self_read on shareholders;
create policy sh_self_read on shareholders for select
  using (
    (profile_id = auth.uid() and is_active_user())
    or is_admin()
  );

-- investments: own rows require active user
drop policy if exists inv_read on investments;
create policy inv_read on investments for select
  using (
    is_admin()
    or (
      is_active_user()
      and exists (
        select 1 from shareholders s
        where s.id = investments.shareholder_id
          and s.profile_id = auth.uid()
      )
    )
  );

-- withdrawals: own rows require active user
drop policy if exists wd_read on withdrawals;
create policy wd_read on withdrawals for select
  using (
    is_admin()
    or (
      is_active_user()
      and exists (
        select 1 from shareholders s
        where s.id = withdrawals.shareholder_id
          and s.profile_id = auth.uid()
      )
    )
  );

-- distribution_runs: shareholder read requires active user
drop policy if exists dr_read on distribution_runs;
create policy dr_read on distribution_runs for select using (
  is_admin()
  or (
    is_active_user()
    and status in ('approved','paid')
    and exists (
      select 1 from distribution_items di
      join shareholders s on s.id = di.shareholder_id
      where di.run_id = distribution_runs.id
        and s.profile_id = auth.uid()
    )
  )
);

-- distribution_items: shareholder read requires active user
drop policy if exists di_read on distribution_items;
create policy di_read on distribution_items for select using (
  is_admin()
  or (
    is_active_user()
    and exists (
      select 1 from shareholders s
      where s.id = distribution_items.shareholder_id
        and s.profile_id = auth.uid()
    )
  )
);

-- notifications: own + broadcast requires active user
drop policy if exists notif_read on notifications;
create policy notif_read on notifications for select using (
  (user_id = auth.uid() and is_active_user())
  or (user_id is null and is_admin())
);

drop policy if exists notif_update_own on notifications;
create policy notif_update_own on notifications for update
  using (
    (user_id = auth.uid() and is_active_user())
    or is_admin()
  )
  with check (
    (user_id = auth.uid() and is_active_user())
    or is_admin()
  );
