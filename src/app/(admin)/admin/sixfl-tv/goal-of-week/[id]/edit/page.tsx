import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { canonicalYouTubeUrl } from "@/lib/youtube";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
};

type GoalRow = {
  id: string;
  videoUrl: string;
  teamId: string;
  playerName: string | null;
  opponentName: string | null;
  caption: string | null;
  weekOf: Date;
  isFeatured: boolean;
};

type TeamOptionRow = {
  id: string;
  name: string;
  leagueName: string | null;
  leagueSeason: string | null;
  leagueIsActive: boolean | null;
};

function cleanOptionalText(value: FormDataEntryValue | null, maxLength: number) {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function parseWeekOf(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateInputValue(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

async function loadGoal(id: string) {
  const rows = await prisma.$queryRaw<GoalRow[]>(Prisma.sql`
    SELECT
      "id",
      "videoUrl",
      "teamId",
      "playerName",
      "opponentName",
      "caption",
      "weekOf",
      "isFeatured"
    FROM "GoalOfWeek"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function loadTeams() {
  return prisma.$queryRaw<TeamOptionRow[]>(Prisma.sql`
    SELECT
      team."id",
      team."name",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      league."isActive" AS "leagueIsActive"
    FROM "Team" team
    LEFT JOIN "League" league ON league."id" = team."leagueId"
    ORDER BY
      COALESCE(league."isActive", false) DESC,
      COALESCE(league."name", ''),
      team."name",
      COALESCE(league."season", '') DESC
  `);
}

async function updateGoalOfWeekAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const goalId = String(formData.get("goalId") ?? "").trim();
  if (!goalId) redirect("/admin/sixfl-tv?goalError=missing#goal-of-week-admin");

  const videoUrl = canonicalYouTubeUrl(String(formData.get("videoUrl") ?? ""));
  if (!videoUrl) redirect(`/admin/sixfl-tv/goal-of-week/${goalId}/edit?error=video`);

  const teamId = String(formData.get("teamId") ?? "").trim();
  const team = teamId
    ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } })
    : null;
  if (!team) redirect(`/admin/sixfl-tv/goal-of-week/${goalId}/edit?error=team`);

  const weekOf = parseWeekOf(formData.get("weekOf"));
  if (!weekOf) redirect(`/admin/sixfl-tv/goal-of-week/${goalId}/edit?error=date`);

  const playerName = cleanOptionalText(formData.get("playerName"), 100);
  const opponentName = cleanOptionalText(formData.get("opponentName"), 120);
  const caption = cleanOptionalText(formData.get("caption"), 500);

  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE "GoalOfWeek"
    SET
      "videoUrl" = ${videoUrl},
      "teamId" = ${team.id},
      "playerName" = ${playerName},
      "opponentName" = ${opponentName},
      "caption" = ${caption},
      "weekOf" = ${weekOf},
      "updatedAt" = NOW()
    WHERE "id" = ${goalId}
  `);

  if (!result) redirect("/admin/sixfl-tv?goalError=missing#goal-of-week-admin");

  revalidatePath("/");
  revalidatePath("/goal-of-the-week");
  revalidatePath("/admin/sixfl-tv");
  revalidatePath("/api/public/goal-of-week");
  redirect("/admin/sixfl-tv?goalSaved=edited#goal-of-week-admin");
}

function errorMessage(code?: string) {
  if (code === "video") return "Enter a valid YouTube video, Shorts or share link.";
  if (code === "team") return "Choose the team that scored the goal.";
  if (code === "date") return "Choose the week or date for the goal.";
  return null;
}

export default async function EditGoalOfWeekPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const [goal, teams] = await Promise.all([loadGoal(id), loadTeams()]);

  if (!goal) redirect("/admin/sixfl-tv?goalError=missing#goal-of-week-admin");

  const teamOptions = teams.map((team) => {
    const context = [team.leagueName, team.leagueSeason].filter(Boolean).join(" · ");
    const inactive = team.leagueIsActive === false ? " · previous season" : "";
    return {
      value: team.id,
      label: `${team.name}${context ? ` — ${context}` : ""}${inactive}`,
    };
  });

  const error = errorMessage(sp?.error);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div>
        <a href="/admin/sixfl-tv#goal-of-week-admin" className="text-sm font-semibold text-fuchsia-200 hover:text-fuchsia-100">
          ← Back to SIXFL TV
        </a>
        <h1 className="mt-3 text-4xl font-black text-white">Edit Goal of the Week</h1>
        <p className="mt-2 text-sm text-white/55">
          Correct the video, scoring team, scorer, opponent, week or caption. {goal.isFeatured ? "This entry is currently live on the homepage; your changes will update it there too." : "This entry is not currently featured on the homepage."}
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">{error}</div>
      ) : null}

      <form action={updateGoalOfWeekAction} className="rounded-3xl border border-fuchsia-400/25 bg-black/25 p-6">
        <input type="hidden" name="goalId" value={goal.id} />
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="block space-y-2 text-sm font-semibold text-white/80">
            <span>YouTube video link</span>
            <input type="url" name="videoUrl" required defaultValue={goal.videoUrl} className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15" />
          </label>

          <FormListboxField name="teamId" label="Team that scored" value={goal.teamId} options={teamOptions} placeholder="Choose the scoring team" />

          <label className="block space-y-2 text-sm font-semibold text-white/80">
            <span>Scorer name <span className="font-normal text-white/40">(optional)</span></span>
            <input type="text" name="playerName" maxLength={100} defaultValue={goal.playerName ?? ""} className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15" />
          </label>

          <label className="block space-y-2 text-sm font-semibold text-white/80">
            <span>Opponent <span className="font-normal text-white/40">(optional)</span></span>
            <input type="text" name="opponentName" maxLength={120} defaultValue={goal.opponentName ?? ""} className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15" />
          </label>

          <label className="block space-y-2 text-sm font-semibold text-white/80">
            <span>Week/date</span>
            <input type="date" name="weekOf" required defaultValue={dateInputValue(goal.weekOf)} className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15" />
          </label>
        </div>

        <label className="mt-5 block space-y-2 text-sm font-semibold text-white/80">
          <span>Short caption <span className="font-normal text-white/40">(optional)</span></span>
          <textarea name="caption" rows={4} maxLength={500} defaultValue={goal.caption ?? ""} className="w-full resize-y rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15" />
        </label>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-full bg-fuchsia-400 px-6 text-sm font-black text-black transition hover:bg-fuchsia-300">
            Save changes
          </button>
          <a href="/admin/sixfl-tv#goal-of-week-admin" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold text-white/75 hover:bg-white/10">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
