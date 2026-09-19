import Link from "next/link";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { monthKey, monthlyPeriod, validMonthKey } from "@/lib/goal-of-month/calendar";
import { getMonthlyPageData, safeVideoLinks, switchLegacyMonthlyCandidateToClip } from "@/lib/goal-of-month/community";
import FormListboxField from "@/components/ui/FormListboxField";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Goal of the Month | SIXFL Admin" };
type Row = { id: string; fixtureId: string; teamId: string; monthKey: string; goalNumber: number | null; clipAssetId: string | null; clipNumber: number | null; scorerTeamMemberId: string | null; scorerName: string | null; status: string; teamName: string; opponentName: string; sixflTvUrl: string; nominationCount: number; voteCount: number };
type ClipOption = { id: string; fixtureId: string; clipNumber: number; filename: string };
type SquadPlayer = { teamMemberId: string; teamId: string; name: string; squadNumber: number | null };

async function reviewNominee(form: FormData) {
  "use server";
  const { user } = await requireAdmin();
  if (!user?.id) throw new Error("An authenticated administrator is required.");
  const id = String(form.get("candidateId") ?? "");
  const key = String(form.get("monthKey") ?? "");
  const status = String(form.get("status") ?? "");
  const scorerTeamMemberId = String(form.get("scorerTeamMemberId") ?? "").trim();
  const switchClipAssetId = String(form.get("switchClipAssetId") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id) || !validMonthKey(key) || !["ACTIVE", "REMOVED"].includes(status)) throw new Error("Choose a valid nomination.");
  if (switchClipAssetId && !/^[A-Za-z0-9_-]{1,120}$/.test(switchClipAssetId)) throw new Error("Choose a valid SIXFL TV clip.");
  if (scorerTeamMemberId && !/^[A-Za-z0-9_-]{1,120}$/.test(scorerTeamMemberId)) throw new Error("Choose a valid squad player.");
  await prisma.$transaction(async tx => {
    const [candidate] = await tx.$queryRaw<Array<{ teamId: string }>>(Prisma.sql`
      SELECT "teamId" FROM "GoalOfMonthCandidate"
      WHERE "id"=${id} AND "monthKey"=${key}
      FOR UPDATE
    `);
    if (!candidate) throw new Error("That nomination no longer exists.");

    await tx.$executeRaw(Prisma.sql`
      UPDATE "GoalOfMonthCandidate" SET "status" = ${status}, "updatedAt" = NOW()
      WHERE "id" = ${id} AND "monthKey" = ${key}
    `);

    if (scorerTeamMemberId) {
      const [player] = await tx.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
        SELECT tm."id", BTRIM(u."name") AS "name"
        FROM "TeamMember" tm
        JOIN "User" u ON u."id"=tm."userId"
        WHERE tm."id"=${scorerTeamMemberId}
          AND tm."teamId"=${candidate.teamId}
          AND tm."role"::text <> 'COACH'
          AND NULLIF(BTRIM(COALESCE(u."name", '')), '') IS NOT NULL
        LIMIT 1
      `);
      if (!player) throw new Error("Choose a scorer who is currently on that team’s SIXFL squad.");
      await tx.$executeRaw(Prisma.sql`
        UPDATE "GoalOfMonthCandidate"
        SET "scorerTeamMemberId"=${player.id}, "scorerName"=${player.name}, "updatedAt"=NOW()
        WHERE "id"=${id} AND "monthKey"=${key}
      `);
    }
    if (switchClipAssetId) {
      if (status !== "ACTIVE") throw new Error("Reactivate the nominee before switching it to an exact clip.");
      await switchLegacyMonthlyCandidateToClip(id, switchClipAssetId, tx);
    } else if (status === "ACTIVE") {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "GoalOfMonthClipRender" ("candidateId","sourceAssetId")
        SELECT c."id", c."clipAssetId"
        FROM "GoalOfMonthCandidate" c
        JOIN "SixflTvFootageAsset" a ON a."id"=c."clipAssetId"
        WHERE c."id"=${id}
          AND c."clipAssetId" IS NOT NULL
          AND a."kind"='CLIP'
          AND a."state"='READY'
        ON CONFLICT ("candidateId") DO UPDATE SET
          "sourceAssetId"=EXCLUDED."sourceAssetId",
          "state"='QUEUED',
          "leaseToken"=NULL,
          "busyUntil"=NULL,
          "error"=NULL,
          "completedAt"=NULL,
          "updatedAt"=NOW()
      `);
    }
  });
  revalidatePath("/goal-of-the-month"); revalidatePath("/admin/sixfl-tv/goal-of-month"); revalidatePath("/");
  redirect(`/admin/sixfl-tv/goal-of-month?month=${key}&${switchClipAssetId ? "switched=1" : "saved=1"}`);
}
export default async function MonthlyGoalAdmin({ searchParams }: { searchParams?: Promise<{ month?: string; saved?: string; switched?: string }> }) {
  await requireAdmin();
  const query = (await searchParams) ?? {};
  const key = validMonthKey(query.month) ? query.month : monthKey(new Date());
  const period = monthlyPeriod(key);
  const [rows, page, clipOptions, squadPlayers] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT c."id", c."fixtureId", c."teamId", c."monthKey", c."goalNumber", c."clipAssetId", clip."clipNumber", c."scorerTeamMemberId", c."scorerName", c."status", t."name" AS "teamName",
        CASE WHEN f."homeTeamId" = c."teamId" THEN away."name" ELSE home."name" END AS "opponentName",
        COALESCE(f."sixflTvUrl",'') AS "sixflTvUrl", COUNT(DISTINCT n."id")::int AS "nominationCount", COUNT(DISTINCT v."id")::int AS "voteCount"
      FROM "GoalOfMonthCandidate" c JOIN "Fixture" f ON f."id"=c."fixtureId" JOIN "Team" t ON t."id"=c."teamId"
      JOIN "Team" home ON home."id"=f."homeTeamId" JOIN "Team" away ON away."id"=f."awayTeamId"
      LEFT JOIN "SixflTvFootageAsset" clip ON clip."id"=c."clipAssetId"
      LEFT JOIN "GoalOfMonthNomination" n ON n."candidateId"=c."id" LEFT JOIN "GoalOfMonthVote" v ON v."candidateId"=c."id"
      WHERE c."monthKey"=${key} GROUP BY c."id", t."name", f."homeTeamId", away."name", home."name", f."sixflTvUrl", clip."clipNumber"
      ORDER BY COUNT(DISTINCT n."id") DESC, c."createdAt" ASC, c."id" ASC
    `),
    getMonthlyPageData(null),
    prisma.$queryRaw<ClipOption[]>(Prisma.sql`
      SELECT DISTINCT a."id", a."fixtureId", a."clipNumber"::int AS "clipNumber", a."filename"
      FROM "SixflTvFootageAsset" a
      JOIN "GoalOfMonthCandidate" c ON c."fixtureId"=a."fixtureId"
      WHERE c."monthKey"=${key}
        AND c."clipAssetId" IS NULL
        AND c."status"='ACTIVE'
        AND a."kind"='CLIP'
        AND a."state"='READY'
        AND a."clipNumber" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "GoalOfMonthCandidate" used
          WHERE used."clipAssetId"=a."id"
        )
      ORDER BY a."fixtureId", a."clipNumber"
    `),
    prisma.$queryRaw<SquadPlayer[]>(Prisma.sql`
      SELECT tm."id" AS "teamMemberId", tm."teamId", BTRIM(u."name") AS "name",
        p."squadNumber"::int AS "squadNumber"
      FROM "TeamMember" tm
      JOIN "User" u ON u."id"=tm."userId"
      LEFT JOIN "TeamMemberProfile" p ON p."teamMemberId"=tm."id"
      WHERE tm."teamId" IN (
        SELECT DISTINCT "teamId" FROM "GoalOfMonthCandidate" WHERE "monthKey"=${key}
      )
        AND tm."role"::text <> 'COACH'
        AND NULLIF(BTRIM(COALESCE(u."name", '')), '') IS NOT NULL
      ORDER BY tm."teamId", p."squadNumber" NULLS LAST, LOWER(BTRIM(u."name")), tm."createdAt", tm."id"
    `),
  ]);
  const playersByTeam = new Map<string, SquadPlayer[]>();
  for (const player of squadPlayers) {
    const list = playersByTeam.get(player.teamId) ?? [];
    list.push({ ...player, squadNumber: player.squadNumber == null ? null : Number(player.squadNumber) });
    playersByTeam.set(player.teamId, list);
  }
  const clipsByFixture = new Map<string, ClipOption[]>();
  for (const clip of clipOptions) {
    const list = clipsByFixture.get(clip.fixtureId) ?? [];
    list.push(clip);
    clipsByFixture.set(clip.fixtureId, list);
  }
  return <div className="space-y-6">
    <header className="rounded-3xl border border-emerald-300/25 bg-emerald-400/5 p-6"><h1 className="text-3xl font-bold text-white">Goal of the Month</h1><p className="mt-3 text-sm leading-6 text-white/65">One monthly competition across SIXFL. Nominations run through the following 5th; the top six go to voting from the 6th–12th. Existing weekly records remain separate. Remove only incorrect or unsuitable nominations; removal preserves the original nominations and votes.</p><div className="mt-4 flex flex-wrap gap-4 text-sm text-emerald-100"><Link href="/goal-of-the-month">Open public competition →</Link><Link href="/admin/sixfl-tv/goal-of-week?legacy=1">Historical weekly nominations</Link><Link href="/admin/sixfl-tv/goal-of-week">SIXFL TV / weekly winner editor</Link></div></header>
    {query.saved === "1" ? <p role="status" className="text-emerald-100">Nomination changes saved.</p> : null}
    <form className="flex flex-wrap gap-3"><label className="text-sm">Award month <input name="month" type="month" defaultValue={key} className="rounded-lg border border-white/20 bg-black p-2 text-white" /></label><button type="submit" className="rounded-lg border border-white/20 px-4 py-2">Show month</button></form>
    <h2 className="text-xl font-bold">{period.label} — {rows.length} nominated goals</h2>
    <p className="text-sm text-white/60">{page.voting.open ? `${page.voting.label} voting is open.` : "Monthly voting is not currently open."} Winners are derived from the recorded player vote; there is no automatic message blast.</p>
    {query.switched === "1" ? <p role="status" className="rounded-xl border border-emerald-300/25 bg-emerald-400/10 p-3 text-emerald-100">Nominee switched to the exact SIXFL TV clip. Existing nominations and votes were kept, and a fresh nominee video has been queued.</p> : null}
    <div className="space-y-4">
      {rows.map(row => {
        const availableClips = !row.clipAssetId ? (clipsByFixture.get(row.fixtureId) ?? []) : [];
        return <article key={row.id} className="rounded-2xl border border-white/10 p-5">
          <h3 className="font-bold">{row.teamName} v {row.opponentName} · {row.clipNumber ? `Clip ${row.clipNumber}` : `Goal ${row.goalNumber ?? "—"}`}</h3>
          <p className="my-2 text-sm text-white/60">{row.nominationCount} nominations · {row.voteCount} votes · {row.status}</p>
          <div className="mb-3 flex flex-wrap gap-3">
            {row.clipAssetId ? <a href={`/api/goal-of-month/clips/${row.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-100 underline">Watch exact clip ↗</a> : safeVideoLinks(row.sixflTvUrl).map((url,index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-100 underline">Watch video {index+1}</a>)}
          </div>
          <form action={reviewNominee} className="space-y-4">
            <input type="hidden" name="candidateId" value={row.id} />
            <input type="hidden" name="monthKey" value={key} />
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1">
                <FormListboxField
                  name="scorerTeamMemberId"
                  label="Scorer"
                  value={row.scorerTeamMemberId ?? ""}
                  options={(playersByTeam.get(row.teamId) ?? []).map(player => ({
                    value: player.teamMemberId,
                    label: `${player.squadNumber ? `#${player.squadNumber} · ` : ""}${player.name}`,
                  }))}
                  placeholder={row.scorerName ? `Unlinked legacy scorer: ${row.scorerName}` : "Choose scorer from squad"}
                />
                {!row.scorerTeamMemberId ? <p className="mt-2 text-xs leading-5 text-amber-100">This nominee is still text-only. Link it to the correct squad player before player photos, squad numbers or profile awards are used.</p> : <p className="mt-2 text-xs text-emerald-100/70">Linked player: {row.scorerName}</p>}
                <Link href={`/admin/teams/${row.teamId}/squad`} className="mt-2 inline-block text-xs text-emerald-200 underline">Scorer missing? Open team squad →</Link>
              </div>
              <label className="text-sm">Status <select name="status" defaultValue={row.status} className="block rounded-lg border border-white/20 bg-black p-2"><option value="ACTIVE">Active nominee</option><option value="REMOVED">Removed — keep history</option></select></label>
              <button type="submit" className="rounded-lg bg-emerald-400 px-4 py-2 font-bold text-black">Save changes</button>
            </div>
            {!row.clipAssetId && row.status === "ACTIVE" ? <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-4">
              <p className="font-semibold text-amber-100">Legacy nomination — switch it to the exact highlights clip</p>
              <p className="mt-1 text-sm leading-6 text-white/60">This keeps the same nominee, nominations and votes. It only replaces the old goal-number/video reference with the exact SIXFL TV clip and queues the new branded nominee video.</p>
              {availableClips.length ? <div className="mt-3 flex flex-wrap gap-2">{availableClips.map(clip => <div key={clip.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 p-2">
                <a href={`/api/goal-of-month/fixtures/${row.fixtureId}/clips/${clip.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-100 underline">Watch Clip {clip.clipNumber}</a>
                <button type="submit" name="switchClipAssetId" value={clip.id} className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-sm font-bold text-emerald-100">Switch to Clip {clip.clipNumber}</button>
              </div>)}</div> : <p className="mt-3 text-sm text-white/50">No unused ready highlight clips are available for this match yet.</p>}
            </div> : null}
          </form>
        </article>;
      })}
    </div>
    {!rows.length ? <p className="text-white/60">No nominations for this month yet.</p> : null}
  </div>;
}
