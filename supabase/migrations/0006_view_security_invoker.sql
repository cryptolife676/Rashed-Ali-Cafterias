-- =====================================================================
-- Migration 0006 — make reporting views run as the querying user
--
-- By default a Postgres view executes against its base tables with the
-- VIEW OWNER's privileges, which bypasses the querying user's RLS. That
-- let any signed-in shareholder read v_shareholder_summary for EVERY
-- shareholder (all invested / profit / withdrawal totals), not just their
-- own — flagged CRITICAL "Security Definer View" by the Supabase advisor.
--
-- security_invoker = on makes the views honour the caller's RLS:
--   • admins (is_admin()) still see all rows
--   • shareholders see only their own rows (correct portfolio behaviour)
--   • v_monthly_pnl still works for any signed-in user (txn_read policy)
--
-- Requires Postgres 15+ (Supabase is 15+).
-- =====================================================================

alter view public.v_monthly_pnl        set (security_invoker = on);
alter view public.v_shareholder_summary set (security_invoker = on);
