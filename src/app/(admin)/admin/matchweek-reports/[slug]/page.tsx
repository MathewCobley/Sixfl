import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { getReportView } from "@/lib/matchweek-reports/service";
import ReportEditor from "@/components/admin/matchweek-reports/ReportEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Admin matchweek report | SIXFL", robots: { index: false, follow: false } };
export default async function AdminWeeklyLeagueReportPreview({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const { date } = await searchParams ?? {};
  const view = await getReportView(slug, date);
  if (!view) notFound();
  return <div className="space-y-5">
    <Link href="/admin/matchweek-reports" className="inline-flex min-h-10 items-center font-semibold text-emerald-300">← All matchweek reports</Link>
    <ReportEditor key={`${slug}:${view.source.matchDate}`} slug={slug} initialView={view} />
  </div>;
}
