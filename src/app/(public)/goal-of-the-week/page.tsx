import Link from "next/link";
import { redirect } from "next/navigation";
import LegacyWeeklyPage from "@/components/goal-of-week/LegacyWeeklyPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Weekly winner archive | SIXFL" };

type Query = { legacy?: string; from?: string; teamId?: string; previewMembershipId?: string };
export default async function WeeklyCompatibilityPage({ searchParams }: { searchParams?: Promise<Query> }) {
  const query = (await searchParams) ?? {};
  if (query.legacy !== "1") {
    const params = new URLSearchParams();
    if (query.from === "player" || query.from === "captain") params.set("from", query.from);
    for (const key of ["teamId", "previewMembershipId"] as const) {
      const value = query[key];
      if (typeof value === "string" && /^[A-Za-z0-9_-]{6,120}$/.test(value)) params.set(key, value);
    }
    redirect(`/goal-of-the-month${params.size ? `?${params}` : ""}`);
  }
  return <>
    <div className="mx-auto max-w-[1400px] px-4 pt-6"><p className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">Weekly winner archive and final weekly round. Previous awards keep their original weekly labels. The final round ends on its original timetable; new competitions are monthly. <Link href="/goal-of-the-month" className="underline">Open Goal of the Month →</Link></p></div>
    <LegacyWeeklyPage searchParams={Promise.resolve(query)} />
  </>;
}
