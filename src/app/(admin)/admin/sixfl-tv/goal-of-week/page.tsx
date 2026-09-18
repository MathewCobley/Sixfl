import Link from "next/link";
import GoalOfWeekAdminPanel from "@/components/admin/sixfl-tv/GoalOfWeekAdminPanel";
import LegacyWeeklyAdminPage from "@/components/admin/sixfl-tv/LegacyWeeklyAdminPage";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GoalOfWeekAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ legacy?: string; goalSaved?: string; goalError?: string }>;
}) {
  await requireAdmin();
  const query = (await searchParams) ?? {};

  if (query.legacy === "1") {
    return <div className="space-y-5">
      <p className="text-sm text-amber-100">
        Historical weekly administration. <Link className="underline" href="/admin/sixfl-tv/goal-of-week">Back to Goal of the Week editor →</Link>
      </p>
      <LegacyWeeklyAdminPage />
    </div>;
  }

  return <div className="space-y-6">
    <div className="flex justify-end">
      <Link href="/admin/sixfl-tv/goal-of-week?legacy=1" className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70">
        Historical nominations & voting
      </Link>
    </div>
    <GoalOfWeekAdminPanel searchParams={query} />
  </div>;
}
