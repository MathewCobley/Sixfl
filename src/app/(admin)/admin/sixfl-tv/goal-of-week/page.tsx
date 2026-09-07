import Link from "next/link";
import { redirect } from "next/navigation";
import LegacyWeeklyAdminPage from "@/components/admin/sixfl-tv/LegacyWeeklyAdminPage";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function GoalAwardAdminCompatibility({ searchParams }: { searchParams?: Promise<{ legacy?: string }> }) {
  await requireAdmin();
  const query = (await searchParams) ?? {};
  if (query.legacy !== "1") redirect("/admin/sixfl-tv/goal-of-month");
  return <><p className="mb-5 text-sm text-amber-100">Historical weekly administration. <Link className="underline" href="/admin/sixfl-tv/goal-of-month">Open monthly nominations instead →</Link></p><LegacyWeeklyAdminPage /></>;
}
