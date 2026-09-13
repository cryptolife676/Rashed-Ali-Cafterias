-- =====================================================================
-- Migration 0011 — Drop the dead income/expense columns on distribution_runs
--
-- REQUIRES 0010.
--
-- WHY: income and expenses left the model in 0010 — the branches keep their
-- own books and nothing here ever computed from them. The two columns
-- survived on distribution_runs, always written as 0. No application code
-- reads them any more, and a column that is permanently zero is a trap for
-- whoever reads the schema next.
--
-- ORDER MATTERS: create_distribution_run still INSERTs into both columns,
-- so it is recreated without them first. plpgsql bodies are not dependency-
-- tracked, so dropping the columns would not have flagged the breakage —
-- the function would simply have failed on its next call.
-- =====================================================================

create or replace function create_distribution_run(
  p_monthly_profit_id uuid,
  p_expected_amount   numeric,
  p_notes             text,
  p_created_by        uuid,
  p_items             jsonb   -- [{shareholder_id, ownership_pct_snapshot, computed_amount}]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
  mp       monthly_profits;
  item     jsonb;
begin
  select * into mp from monthly_profits where id = p_monthly_profit_id for update;
  if not found then
    raise exception 'Monthly profit % not found', p_monthly_profit_id;
  end if;

  if mp.declared_amount <> p_expected_amount then
    raise exception
      'Declared amount changed while the run was being prepared (expected %, now %). Recreate the draft.',
      p_expected_amount, mp.declared_amount;
  end if;

  if mp.declared_amount <= 0 then
    raise exception 'Declared amount % is not distributable', mp.declared_amount;
  end if;

  if exists (
    select 1 from distribution_runs
    where monthly_profit_id = mp.id and status <> 'void'
  ) then
    raise exception
      'This month already has a distribution run. Void it before creating another.';
  end if;

  insert into distribution_runs (
    branch_id, monthly_profit_id, period_start, period_end,
    net_profit, notes, created_by, status
  ) values (
    mp.branch_id,
    mp.id,
    mp.period_month,
    (mp.period_month + interval '1 month' - interval '1 day')::date,
    mp.declared_amount,
    p_notes, p_created_by, 'draft'
  )
  returning id into v_run_id;

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

grant execute on function create_distribution_run(uuid,numeric,text,uuid,jsonb)
  to authenticated, service_role;

-- Safe now that nothing writes or reads them.
alter table distribution_runs drop column if exists gross_income;
alter table distribution_runs drop column if exists total_expenses;
