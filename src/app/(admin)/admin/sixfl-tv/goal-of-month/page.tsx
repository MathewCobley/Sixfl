import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { monthKey, monthlyPeriod, validMonthKey } from "@/lib/goal-of-month/calendar";
import { getMonthlyPageData, safeVideoLinks } from "@/lib/goal-of-month/community";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Goal of the Month | SIXFL Admin" };
type Row = { id: string; monthKey: string; goalNumber: number; scorerName: string | null; status: string; teamName: string; opponentName: string; sixflTvUrl: string; nominationCount: number; voteCount: number };

async function reviewNominee(form: FormData) {
  "use server";
  const { user } = await requireAdmin();
  if (!user?.id) throw new Error("An authenticated administrator is required.");
  const id = String(form.get("candidateId") ?? "");
  const key = String(form.get("monthKey") ?? "");
  const status = String(form.get("status") ?? "");
  const scorer = String(form.get("scorerName") ?? "").trim().slice(0, 100) || null;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id) || !validMonthKey(key) || !["ACTIVE", "REMOVED"].includes(status)) throw new Error("Choose a valid nomination.");
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "GoalOfMonthCandidate" SET "status" = ${status}, "scorerName" = ${scorer}, "updatedAt" = NOW()
    WHERE "id" = ${id} AND "monthKey" = ${key}
  `);
  revalidatePath("/goal-of-the-month"); revalidatePath("/admin/sixfl-tv/goal-of-month"); revalidatePath("/");
  redirect(`/admin/sixfl-tv/goal-of-month?month=${key}&saved=1`);
}
export default async function MonthlyGoalAdmin({ searchParams }: { searchParams?: Promise<{ month?: string; saved?: string }> }) {
  await requireAdmin();
  const query = (await searchParams) ?? {};
  const key = validMonthKey(query.month) ? query.month : monthKey(new Date());
  const period = monthlyPeriod(key);
  const [rows, page] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT c."id", c."monthKey", c."goalNumber", c."scorerName", c."status", t."name" AS "teamName",
        CASE WHEN f."homeTeamId" = c."teamId" THEN away."name" ELSE home."name" END AS "opponentName",
        f."sixflTvUrl", COUNT(DISTINCT n."id")::int AS "nominationCount", COUNT(DISTINCT v."id")::int AS "voteCount"
      FROM "GoalOfMonthCandidate" c JOIN "Fixture" f ON f."id"=c."fixtureId" JOIN "Team" t ON t."id"=c."teamId"
      JOIN "Team" home ON home."id"=f."homeTeamId" JOIN "Team" away ON away."id"=f."awayTeamId"
      LEFT JOIN "GoalOfMonthNomination" n ON n."candidateId"=c."id" LEFT JOIN "GoalOfMonthVote" v ON v."candidateId"=c."id"
      WHERE c."monthKey"=${key} GROUP BY c."id", t."name", f."homeTeamId", away."name", home."name", f."sixflTvUrl"
      ORDER BY COUNT(DISTINCT n."id") DESC, c."createdAt" ASC, c."id" ASC
    `), getMonthlyPageData(null),
  ]);
  return <div className="space-y-6">
    <header className="rounded-3xl border border-fuchsia-300/25 bg-fuchsia-400/5 p-6"><h1 className="text-3xl font-bold text-white">Goal of the Month</h1><p className="mt-3 text-sm leading-6 text-white/65">One monthly competition across SIXFL. Nominations run through the following 5th; the top six go to voting from the 6th–12th. Existing weekly records remain separate. Remove only incorrect or unsuitable nominations; removal preserves the original nominations and votes.</p><div className="mt-4 flex flex-wrap gap-4 text-sm text-emerald-100"><Link href="/goal-of-the-month">Open public competition →</Link><Link href="/admin/sixfl-tv/goal-of-week?legacy=1">Historical weekly nominations</Link><Link href="/admin/sixfl-tv">SIXFL TV / weekly winner editor</Link></div></header>
    {query.saved === "1" ? <p role="status" className="text-emerald-100">Nomination changes saved.</p> : null}
    <form className="flex flex-wrap gap-3"><label className="text-sm">Award month <input name="month" type="month" defaultValue={key} className="rounded-lg border border-white/20 bg-black p-2 text-white" /></label><button type="submit" className="rounded-lg border border-white/20 px-4 py-2">Show month</button></form>
    <h2 className="text-xl font-bold">{period.label} — {rows.length} nominated goals</h2>
    <p className="text-sm text-white/60">{page.voting.open ? `${page.voting.label} voting is open.` : "Monthly voting is not currently open."} Winners are derived from the recorded player vote; there is no automatic message blast.</p>
    <div className="space-y-4">{rows.map(row => <article key={row.id} className="rounded-2xl border border-white/10 p-5"><h3 className="font-bold">{row.teamName} v {row.opponentName} · Goal {row.goalNumber}</h3><p className="my-2 text-sm text-white/60">{row.nominationCount} nominations · {row.voteCount} votes · {row.status}</p><div className="mb-3 flex gap-3">{safeVideoLinks(row.sixflTvUrl).map((url,index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-100 underline">Watch video {index+1}</a>)}</div><form action={reviewNominee} className="flex flex-wrap items-end gap-3"><input type="hidden" name="candidateId" value={row.id} /><input type="hidden" name="monthKey" value={key} /><label className="text-sm">Scorer <input name="scorerName" defaultValue={row.scorerName ?? ""} maxLength={100} className="block rounded-lg border border-white/20 bg-black p-2" /></label><label className="text-sm">Status <select name="status" defaultValue={row.status} className="block rounded-lg border border-white/20 bg-black p-2"><option value="ACTIVE">Active nominee</option><option value="REMOVED">Removed — keep history</option></select></label><button type="submit" className="rounded-lg bg-emerald-400 px-4 py-2 font-bold text-black">Save changes</button></form></article>)}</div>
    {!rows.length ? <p className="text-white/60">No nominations for this month yet.</p> : null}
  </div>;
}
