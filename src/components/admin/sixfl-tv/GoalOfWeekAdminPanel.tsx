import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  canonicalYouTubeUrl,
  getYouTubeVideoId,
} from "@/lib/youtube";

type GoalSearchParams = {
  goalSaved?: string;
  goalError?: string;
};

type TeamOptionRow = {
  id: string;
  name: string;
  leagueName: string | null;
  leagueSeason: string | null;
  leagueIsActive: boolean | null;
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
  publishedAt: Date | null;
  createdAt: Date;
  teamName: string;
  teamLogoUrl: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
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

function getTodayInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/London",
  }).formatToParts(new Date());

  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function formatWeekOf(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(value);
}

function formatPublishedAt(value: Date | null) {
  if (!value) return "Draft";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function goalErrorMessage(code: string | undefined) {
  if (code === "video") return "Enter a valid YouTube video, Shorts or share link.";
  if (code === "team") return "Choose the team that scored the goal.";
  if (code === "date") return "Choose the week or date for the goal.";
  if (code === "missing") return "That Goal of the Week entry could not be found.";
  if (code === "save") return "The Goal of the Week could not be saved. Please try again.";
  return null;
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

async function loadGoals() {
  try {
    return await prisma.$queryRaw<GoalRow[]>(Prisma.sql`
      SELECT
        goal."id",
        goal."videoUrl",
        goal."teamId",
        goal."playerName",
        goal."opponentName",
        goal."caption",
        goal."weekOf",
        goal."isFeatured",
        goal."publishedAt",
        goal."createdAt",
        team."name" AS "teamName",
        team."logoUrl" AS "teamLogoUrl",
        league."name" AS "leagueName",
        league."season" AS "leagueSeason"
      FROM "GoalOfWeek" goal
      JOIN "Team" team ON team."id" = goal."teamId"
      LEFT JOIN "League" league ON league."id" = team."leagueId"
      ORDER BY
        goal."isFeatured" DESC,
        goal."weekOf" DESC,
        goal."createdAt" DESC
      LIMIT 24
    `);
  } catch (error) {
    console.error("Failed to load Goal of the Week entries", error);
    return [];
  }
}

async function saveGoalOfWeekAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const videoUrl = canonicalYouTubeUrl(String(formData.get("videoUrl") ?? ""));
  if (!videoUrl) redirect("/admin/sixfl-tv?goalError=video");

  const teamId = String(formData.get("teamId") ?? "").trim();
  const team = teamId
    ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } })
    : null;
  if (!team) redirect("/admin/sixfl-tv?goalError=team");

  const weekOf = parseWeekOf(formData.get("weekOf"));
  if (!weekOf) redirect("/admin/sixfl-tv?goalError=date");

  const playerName = cleanOptionalText(formData.get("playerName"), 100);
  const opponentName = cleanOptionalText(formData.get("opponentName"), 120);
  const caption = cleanOptionalText(formData.get("caption"), 500);
  const publishNow = formData.get("publishNow") === "on";
  const publishedAt = publishNow ? new Date() : null;
  const goalId = randomUUID();

  try {
    await prisma.$transaction(async (tx) => {
      if (publishNow) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "GoalOfWeek"
          SET "isFeatured" = false, "updatedAt" = NOW()
          WHERE "isFeatured" = true
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "GoalOfWeek" (
          "id",
          "videoUrl",
          "teamId",
          "playerName",
          "opponentName",
          "caption",
          "weekOf",
          "isFeatured",
          "publishedAt",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${goalId},
          ${videoUrl},
          ${team.id},
          ${playerName},
          ${opponentName},
          ${caption},
          ${weekOf},
          ${publishNow},
          ${publishedAt},
          NOW(),
          NOW()
        )
      `);
    });
  } catch (error) {
    console.error("Failed to save Goal of the Week", error);
    redirect("/admin/sixfl-tv?goalError=save");
  }

  revalidatePath("/");
  revalidatePath("/admin/sixfl-tv");
  revalidatePath("/api/public/goal-of-week");
  redirect("/admin/sixfl-tv?goalSaved=created");
}

async function featureGoalOfWeekAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const goalId = String(formData.get("goalId") ?? "").trim();
  if (!goalId) redirect("/admin/sixfl-tv?goalError=missing");

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "GoalOfWeek" WHERE "id" = ${goalId} LIMIT 1
  `);
  if (!rows[0]) redirect("/admin/sixfl-tv?goalError=missing");

  try {
    await prisma.$transaction([
      prisma.$executeRaw(Prisma.sql`
        UPDATE "GoalOfWeek"
        SET "isFeatured" = false, "updatedAt" = NOW()
        WHERE "isFeatured" = true
      `),
      prisma.$executeRaw(Prisma.sql`
        UPDATE "GoalOfWeek"
        SET
          "isFeatured" = true,
          "publishedAt" = COALESCE("publishedAt", NOW()),
          "updatedAt" = NOW()
        WHERE "id" = ${goalId}
      `),
    ]);
  } catch (error) {
    console.error("Failed to feature Goal of the Week", error);
    redirect("/admin/sixfl-tv?goalError=save");
  }

  revalidatePath("/");
  revalidatePath("/admin/sixfl-tv");
  revalidatePath("/api/public/goal-of-week");
  redirect("/admin/sixfl-tv?goalSaved=featured");
}

async function unfeatureGoalOfWeekAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const goalId = String(formData.get("goalId") ?? "").trim();
  if (!goalId) redirect("/admin/sixfl-tv?goalError=missing");

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "GoalOfWeek"
    SET "isFeatured" = false, "updatedAt" = NOW()
    WHERE "id" = ${goalId}
  `);

  revalidatePath("/");
  revalidatePath("/admin/sixfl-tv");
  revalidatePath("/api/public/goal-of-week");
  redirect("/admin/sixfl-tv?goalSaved=hidden");
}

async function deleteGoalOfWeekAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const goalId = String(formData.get("goalId") ?? "").trim();
  if (!goalId) redirect("/admin/sixfl-tv?goalError=missing");

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "GoalOfWeek" WHERE "id" = ${goalId}
  `);

  revalidatePath("/");
  revalidatePath("/admin/sixfl-tv");
  revalidatePath("/api/public/goal-of-week");
  redirect("/admin/sixfl-tv?goalSaved=deleted");
}

function savedMessage(code: string | undefined) {
  if (code === "created") return "Goal of the Week saved.";
  if (code === "featured") return "That goal is now featured on the homepage.";
  if (code === "hidden") return "The featured goal has been removed from the homepage.";
  if (code === "deleted") return "Goal of the Week entry deleted.";
  return null;
}

export default async function GoalOfWeekAdminPanel({
  searchParams,
}: {
  searchParams?: GoalSearchParams;
}) {
  await requireAdmin();

  const [teams, goals] = await Promise.all([loadTeams(), loadGoals()]);
  const currentGoal = goals.find((goal) => goal.isFeatured) ?? null;
  const errorMessage = goalErrorMessage(searchParams?.goalError);
  const successMessage = savedMessage(searchParams?.goalSaved);

  const teamOptions = teams.map((team) => {
    const context = [team.leagueName, team.leagueSeason].filter(Boolean).join(" · ");
    const inactive = team.leagueIsActive === false ? " · previous season" : "";

    return {
      value: team.id,
      label: `${team.name}${context ? ` — ${context}` : ""}${inactive}`,
    };
  });

  return (
    <section className="overflow-hidden rounded-3xl border border-fuchsia-400/25 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] shadow-[0_24px_90px_rgba(0,0,0,0.35)]">
      <div className="border-b border-white/10 px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-fuchsia-200/75">
              SIXFL TV feature
            </p>
            <h2 className="mt-2 text-3xl font-black text-white">Goal of the Week</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              Paste the YouTube clip, choose the scoring team and publish it. The homepage will embed the video and show the team, week and any scorer or opponent details you add.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/65">
            {currentGoal ? (
              <>
                <span className="font-semibold text-fuchsia-100">Currently live:</span>{" "}
                {currentGoal.teamName} · {formatWeekOf(currentGoal.weekOf)}
              </>
            ) : (
              "No Goal of the Week is currently live."
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6 lg:p-8">
        {successMessage ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {errorMessage}
          </div>
        ) : null}

        <form action={saveGoalOfWeekAction} className="rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <label className="block space-y-2 text-sm font-semibold text-white/80">
              <span>YouTube video link</span>
              <input
                type="url"
                name="videoUrl"
                required
                placeholder="https://youtube.com/shorts/... or https://youtu.be/..."
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15"
              />
            </label>

            <FormListboxField
              name="teamId"
              label="Team that scored"
              options={teamOptions}
              placeholder="Choose the scoring team"
            />

            <label className="block space-y-2 text-sm font-semibold text-white/80">
              <span>Scorer name <span className="font-normal text-white/40">(optional)</span></span>
              <input
                type="text"
                name="playerName"
                maxLength={100}
                placeholder="Player name"
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15"
              />
            </label>

            <label className="block space-y-2 text-sm font-semibold text-white/80">
              <span>Opponent <span className="font-normal text-white/40">(optional)</span></span>
              <input
                type="text"
                name="opponentName"
                maxLength={120}
                placeholder="Who was the goal scored against?"
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15"
              />
            </label>

            <label className="block space-y-2 text-sm font-semibold text-white/80">
              <span>Week/date</span>
              <input
                type="date"
                name="weekOf"
                required
                defaultValue={getTodayInputValue()}
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15"
              />
            </label>

            <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm font-semibold text-white/80">
              <span>
                Publish on the homepage
                <span className="mt-1 block text-xs font-normal text-white/40">This replaces the previous featured goal.</span>
              </span>
              <input
                type="checkbox"
                name="publishNow"
                defaultChecked
                className="h-5 w-5 shrink-0 accent-fuchsia-500"
              />
            </label>
          </div>

          <label className="mt-5 block space-y-2 text-sm font-semibold text-white/80">
            <span>Short caption <span className="font-normal text-white/40">(optional)</span></span>
            <textarea
              name="caption"
              rows={3}
              maxLength={500}
              placeholder="For example: A first-time finish after a brilliant team move."
              className="w-full resize-y rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/50 focus:ring-2 focus:ring-fuchsia-400/15"
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-fuchsia-400 px-6 text-sm font-black text-black transition hover:bg-fuchsia-300"
            >
              Save Goal of the Week
            </button>
            <p className="text-xs leading-5 text-white/40">
              YouTube hosts the video; SIXFL only stores the link and display details.
            </p>
          </div>
        </form>

        <div className="rounded-3xl border border-white/10 bg-black/15">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <h3 className="text-lg font-semibold text-white">Previous entries</h3>
            <p className="mt-1 text-sm text-white/45">Feature an older goal again or remove an incorrect entry.</p>
          </div>

          <div className="divide-y divide-white/10">
            {goals.length === 0 ? (
              <div className="px-5 py-8 text-sm text-white/50 sm:px-6">
                No Goal of the Week entries have been added yet.
              </div>
            ) : (
              goals.map((goal) => {
                const videoId = getYouTubeVideoId(goal.videoUrl);
                const context = [goal.leagueName, goal.leagueSeason].filter(Boolean).join(" · ");

                return (
                  <article key={goal.id} className="px-5 py-5 sm:px-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        {videoId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
                            alt=""
                            className="h-20 w-32 shrink-0 rounded-xl border border-white/10 object-cover"
                          />
                        ) : null}

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-base font-semibold text-white">{goal.teamName}</h4>
                            {goal.isFeatured ? (
                              <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-100">
                                Live
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-white/55">
                            {goal.playerName ?? "Scorer not added"}
                            {goal.opponentName ? ` · vs ${goal.opponentName}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-white/40">
                            Week of {formatWeekOf(goal.weekOf)}{context ? ` · ${context}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-white/35">
                            {formatPublishedAt(goal.publishedAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                        <a
                          href={goal.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
                        >
                          Open YouTube ↗
                        </a>

                        {goal.isFeatured ? (
                          <form action={unfeatureGoalOfWeekAction}>
                            <input type="hidden" name="goalId" value={goal.id} />
                            <button
                              type="submit"
                              className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/15"
                            >
                              Remove from homepage
                            </button>
                          </form>
                        ) : (
                          <form action={featureGoalOfWeekAction}>
                            <input type="hidden" name="goalId" value={goal.id} />
                            <button
                              type="submit"
                              className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-3 py-2 text-xs font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/20"
                            >
                              Feature again
                            </button>
                          </form>
                        )}

                        <form action={deleteGoalOfWeekAction}>
                          <input type="hidden" name="goalId" value={goal.id} />
                          <button
                            type="submit"
                            className="rounded-xl border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/15"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
