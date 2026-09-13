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
 * returns only names, ownership and split weights, not anyone's money.
 *
 * `split_weight` is what a team amount is divided by. It equals ownership
 * unless a branch sets its own (Ajwa: Ajmal 10,000 : Naser 5,000, while their
 * ownership there is not agreed yet). The fallback keeps this working against
 * a database that predates the split_weight column.
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
      type Row = {
        shareholder_id: string;
        display_name: string;
        ownership_pct: number;
        split_weight?: number | null;
      };
      return ((data ?? []) as Row[]).map((m) => ({
        branch_id: branchId,
        shareholder_id: m.shareholder_id,
        display_name: m.display_name,
        ownership_pct: Number(m.ownership_pct),
        split_weight: Number(m.split_weight ?? m.ownership_pct),
      }));
    }),
  );
  return perBranch.flat();
}
