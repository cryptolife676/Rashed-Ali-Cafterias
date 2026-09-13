-- =====================================================================
-- Migration 0012 — Record WHEN a payout was handed over, and a remark
--
-- REQUIRES 0008.
--
-- WHY: pay_distribution_items stamped every handover with today's date and
-- no remark. The owner ticks payouts some time after handing the cash over
-- (e.g. Mar–Jun 2026 for Ummu Gaffa), so "today" was simply the wrong date
-- on the withdrawal record and in every portfolio, with nowhere to note how
-- or to whom it was given.
--
-- The function gains two optional parameters. It is dropped and recreated
-- rather than overloaded: two functions matching (uuid[], uuid) would make
-- every existing call ambiguous. pay_distribution_run calls it with two
-- arguments and resolves to the new version through the defaults.
-- =====================================================================

drop function if exists pay_distribution_items(uuid[], uuid);

create or replace function pay_distribution_items(
  p_item_ids uuid[],
  p_actor    uuid,
  p_paid_on  date default null,   -- null = today in Dubai
  p_remarks  text default null
)
returns table (paid_count int, total_amount numeric)
language plpgsql security definer set search_path = public as $$
declare
  -- The business runs on UAE time. current_date is UTC on Supabase, which
  -- would call a handover recorded after 8pm Dubai "tomorrow".
  v_today   date := (now() at time zone 'Asia/Dubai')::date;
  v_paid_on date := coalesce(p_paid_on, (now() at time zone 'Asia/Dubai')::date);
  v_remarks text := nullif(btrim(p_remarks), '');
  v_count   int := 0;
  v_total   numeric(14,2) := 0;
  v_run_ids uuid[] := '{}'::uuid[];
  r         record;
begin
  if v_paid_on > v_today then
    raise exception 'Paid date % is in the future', v_paid_on;
  end if;

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
      r.shareholder_id, r.final_amount, v_paid_on, 'distribution',
      r.id, p_actor,
      coalesce(v_remarks || ' — ', '') || 'Distribution payout (run ' || r.run_id || ')'
    )
    on conflict (distribution_item_id) where source = 'distribution'
    do nothing;

    update distribution_items
      set paid_at = v_paid_on::timestamptz, paid_by = p_actor, payment_ref = v_remarks
      where id = r.id and paid_at is null;

    v_count := v_count + 1;
    v_total := v_total + r.final_amount;
    v_run_ids := array_append(v_run_ids, r.run_id);
  end loop;

  -- Promote a run to 'paid' only when nothing is left outstanding on it.
  update distribution_runs dr
    set status = 'paid', paid_at = coalesce(dr.paid_at, v_paid_on::timestamptz)
    where dr.id = any(v_run_ids)
      and dr.status = 'approved'
      and not exists (
        select 1 from distribution_items di
        where di.run_id = dr.id and di.paid_at is null and di.final_amount > 0
      );

  return query select v_count, v_total;
end $$;

grant execute on function pay_distribution_items(uuid[], uuid, date, text)
  to authenticated, service_role;
