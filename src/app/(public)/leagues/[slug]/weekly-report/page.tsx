import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Retain old bookmarks for administrators only. Never query or render a report here.
export default async function LegacyWeeklyReport({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  redirect(`/admin/matchweek-reports/${encodeURIComponent(slug)}`);
}
