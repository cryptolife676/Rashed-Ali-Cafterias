import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { TeamMember } from '@/components/ProfitEntryForm';

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The team (the members this app tracks) for each branch.
 *
 * Always goes through payout_group_members(), which is security definer. A
 * direct read of `shareholders` is filtered by RLS to the caller's own rows
 * unless they are an admin — so for Shabeer (accountant) it found nobody,
 * the dashboard showed 0 members and he could not save a figure. The function
 * returns only names and ownership percentages, not anyone's money.
 *
 * Single source for the dashboard, the Monthly Profit page and the save action,
 * so they can't disagree about who is on the team.
 */
export async function getTeamByBranch(
  supabase: ServerSupabase,
  branchIds: string[],
): Promise<TeamMember[]> {
  const perBranch = await Promise.all(
    branchIds.map(async (branchId) => {
      const { data, error } = await supabase.rpc('payout_group_members', { p_branch: branchId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { shareholder_id: string; display_name: string; ownership_pct: number }[]).map(
        (m) => ({
          branch_id: branchId,
          shareholder_id: m.shareholder_id,
          display_name: m.display_name,
          ownership_pct: Number(m.ownership_pct),
        }),
      );
    }),
  );
  return perBranch.flat();
}
