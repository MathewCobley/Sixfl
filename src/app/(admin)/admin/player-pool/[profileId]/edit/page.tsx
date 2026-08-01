import Link from "next/link";
import { notFound } from "next/navigation";

import { ensurePlayerPoolTables } from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { updatePlayerPoolDetailsAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Edit PlayerPool player | SIXFL Admin",
};

type SearchParams = Promise<{ error?: string }>;

type PlayerPoolEditRow = {
  profileId: string;
  prospectId: string;
  leadId: string | null;
  profileToken: string;
  publicCode: string;
  profileStatus: string;
  area: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  leagueName: string | null;
};

type SuppressionRow = {
  id: string;
  email: string | null;
  sourceId: string | null;
  suppressionReason: string | null;
};

function nameOf(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

export default async function EditPlayerPoolPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  await ensurePlayerPoolTables();

  const { profileId } = await params;
  const query = (await searchParams) ?? {};

  const rows = await prisma.$queryRaw<PlayerPoolEditRow[]>`
    SELECT
      profile."id" AS "profileId",
      profile."prospectId",
      profile."leadId",
      profile."profileToken",
      profile."publicCode",
      profile."status" AS "profileStatus",
      profile."area",
      prospect."firstName",
      prospect."lastName",
      prospect."email",
      prospect."phone",
      COALESCE(competition."name", league."name") AS "leagueName"
    FROM "PlayerPoolProfile" profile
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    LEFT JOIN "League" league ON league."id" = profile."leagueId"
    LEFT JOIN "LeagueCompetition" competition
      ON competition."id" = league."competitionId"
    WHERE profile."id" = ${profileId}
    LIMIT 1
  `;

  const player = rows[0];
  if (!player) notFound();

  const suppressedRecipients = await prisma.$queryRaw<SuppressionRow[]>`
    SELECT
      recipient."id",
      recipient."email",
      recipient."sourceId",
      recipient."suppressionReason"
    FROM "NotificationRecipient" recipient
    WHERE recipient."isSuppressed" = TRUE
      AND (
        recipient."sourceId" IN (
          ${`player-pool-profile:${player.profileId}`},
          ${`team-prospect:${player.prospectId}`}
        )
        OR (
          recipient."audience" = 'PLAYER'
          AND LOWER(TRIM(COALESCE(recipient."emailNormalized", recipient."email", ''))) =
              LOWER(TRIM(COALESCE(${player.email}, '')))
        )
      )
    ORDER BY recipient."updatedAt" DESC
  `;

  const playerName = nameOf(player.firstName, player.lastName) || "PlayerPool player";

  return (
    <div className="mx-auto max-w-4xl space-y-7 pb-12">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-8">
        <Link
          href="/admin/player-pool"
          className="text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
        >
          ← Back to PlayerPool
        </Link>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-100">
            {player.publicCode}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
            {player.profileStatus.replaceAll("_", " ")}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Edit {playerName}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/65 sm:text-base">
          Correct the player&apos;s contact details here. SIXFL will update the PlayerPool profile,
          the linked player prospect, the original player lead and the related communication
          recipient records together.
        </p>
      </section>

      {query.error ? (
        <section className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
          {query.error}
        </section>
      ) : null}

      {suppressedRecipients.length > 0 ? (
        <section className="rounded-3xl border border-red-400/25 bg-red-500/[0.08] p-5 sm:p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-red-200/75">
            Email delivery problem
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            The current address is suppressed in SIXFL
          </h2>
          <p className="mt-3 text-sm leading-7 text-white/70">
            Changing the email to a different corrected address will clear SIXFL&apos;s local
            suppression for the new address. The old failed message remains in the communication
            history for audit purposes.
          </p>
          <div className="mt-4 space-y-2">
            {suppressedRecipients.map((recipient) => (
              <div
                key={recipient.id}
                className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm"
              >
                <div className="break-all font-semibold text-white">
                  {recipient.email || player.email || "No email saved"}
                </div>
                <div className="mt-2 text-red-100/70">
                  {recipient.suppressionReason || "Previous email delivery failed or was suppressed."}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <form
        action={updatePlayerPoolDetailsAction}
        className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7"
      >
        <input type="hidden" name="profileId" value={player.profileId} />

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="block text-sm font-semibold text-white/75">Full name</span>
            <input
              name="fullName"
              required
              autoComplete="name"
              defaultValue={playerName}
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
            />
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-semibold text-white/75">Email address</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={player.email ?? ""}
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
            />
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-semibold text-white/75">Mobile number</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={player.phone ?? ""}
              placeholder="Optional"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="block text-sm font-semibold text-white/75">
              Other area or travel limits
            </span>
            <input
              name="area"
              defaultValue={player.area ?? ""}
              placeholder="Optional — for example Harrogate only, or within 20 minutes of Ripon"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/55">
          <div>
            <strong className="text-white/75">League:</strong>{" "}
            {player.leagueName || "No primary league selected"}
          </div>
          <div className="mt-1">
            <strong className="text-white/75">PlayerPool form:</strong>{" "}
            <Link
              href={`/player-pool/profile/${player.profileToken}`}
              className="font-semibold text-emerald-300 hover:text-emerald-200"
            >
              open current form
            </Link>
          </div>
          <div className="mt-1">
            <strong className="text-white/75">Communications:</strong>{" "}
            <Link
              href={`/admin/player-prospects/${player.prospectId}/communications`}
              className="font-semibold text-emerald-300 hover:text-emerald-200"
            >
              open player comms
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <button
            type="submit"
            name="intent"
            value="save"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-black text-white transition hover:bg-white/10"
          >
            Save changes
          </button>
          <button
            type="submit"
            name="intent"
            value="save-and-resend"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-500 px-5 text-sm font-black text-black transition hover:bg-emerald-400"
          >
            Save and resend PlayerPool form
          </button>
          <Link
            href="/admin/player-pool"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-white/55 transition hover:text-white"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
