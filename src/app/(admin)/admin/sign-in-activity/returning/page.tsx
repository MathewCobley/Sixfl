import Link from "next/link";

import { ensureAuthenticatedReturnVisitTable } from "@/lib/auth/authenticated-return-visits";
import { ensureSignInLinkActivityTable } from "@/lib/auth/sign-in-link-activity";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Session Return Diagnosis | SIXFL Admin",
};

type SearchParams = {
  q?: string;
  view?: string;
};

type DiagnosisRow = {
  userId: string;
  name: string | null;
  email: string | null;
  teams: string | null;
  magicUsed30: number;
  magicUsed90: number;
  magicSent90: number;
  returns7: number;
  returns30: number;
  returns90: number;
  activeSessions: number;
  lastMagicRequestedAt: Date | null;
  lastMagicUsedAt: Date | null;
  lastReturnAt: Date | null;
};

function normaliseRow(row: DiagnosisRow): DiagnosisRow {
  return {
    ...row,
    magicUsed30: Number(row.magicUsed30 ?? 0),
    magicUsed90: Number(row.magicUsed90 ?? 0),
    magicSent90: Number(row.magicSent90 ?? 0),
    returns7: Number(row.returns7 ?? 0),
    returns30: Number(row.returns30 ?? 0),
    returns90: Number(row.returns90 ?? 0),
    activeSessions: Number(row.activeSessions ?? 0),
  };
}

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function diagnosis(row: DiagnosisRow) {
  if (row.magicUsed90 >= 2 && row.returns90 === 0) {
    return {
      key: "watch",
      label: "Needs watching",
      classes: "border-amber-400/25 bg-amber-500/10 text-amber-100",
      text: "Repeat magic-link logins are recorded, but there is not yet evidence of a later return using an existing session.",
    };
  }

  if (row.magicUsed90 >= 2 && row.returns90 > 0) {
    return {
      key: "mixed",
      label: "Mixed evidence",
      classes: "border-sky-400/25 bg-sky-500/10 text-sky-100",
      text: "This user has needed repeat magic links, but SIXFL has also seen them return successfully on an existing session.",
    };
  }

  if (row.returns90 > 0) {
    return {
      key: "healthy",
      label: "Session retained",
      classes: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      text: "SIXFL has evidence that this user returned later and their existing authenticated session still worked.",
    };
  }

  return {
    key: "unknown",
    label: "Not enough data",
    classes: "border-white/10 bg-white/[0.04] text-white/60",
    text: "There is not yet enough return-session history to judge whether this browser reliably keeps the user signed in.",
  };
}

async function loadRows() {
  const rows = await prisma.$queryRaw<DiagnosisRow[]>`
    WITH magic AS (
      SELECT
        COALESCE("userId", user_account."id") AS "userId",
        (COUNT(*) FILTER (
          WHERE activity."usedAt" IS NOT NULL
            AND activity."usedAt" >= NOW() - INTERVAL '30 days'
        ))::int AS "magicUsed30",
        (COUNT(*) FILTER (
          WHERE activity."usedAt" IS NOT NULL
            AND activity."usedAt" >= NOW() - INTERVAL '90 days'
        ))::int AS "magicUsed90",
        (COUNT(*) FILTER (
          WHERE activity."sentAt" IS NOT NULL
            AND activity."requestedAt" >= NOW() - INTERVAL '90 days'
        ))::int AS "magicSent90",
        MAX(activity."requestedAt") AS "lastMagicRequestedAt",
        MAX(activity."usedAt") AS "lastMagicUsedAt"
      FROM "SignInLinkActivity" activity
      LEFT JOIN "User" user_account
        ON LOWER(BTRIM(user_account."email")) = activity."emailNormalized"
      WHERE COALESCE(activity."userId", user_account."id") IS NOT NULL
      GROUP BY COALESCE(activity."userId", user_account."id")
    ),
    returning AS (
      SELECT
        "userId",
        (COUNT(*) FILTER (WHERE "observedAt" >= NOW() - INTERVAL '7 days'))::int AS "returns7",
        (COUNT(*) FILTER (WHERE "observedAt" >= NOW() - INTERVAL '30 days'))::int AS "returns30",
        (COUNT(*) FILTER (WHERE "observedAt" >= NOW() - INTERVAL '90 days'))::int AS "returns90",
        MAX("observedAt") AS "lastReturnAt"
      FROM "AuthenticatedReturnVisit"
      GROUP BY "userId"
    ),
    relevant_users AS (
      SELECT "userId" FROM magic
      UNION
      SELECT "userId" FROM returning
    ),
    memberships AS (
      SELECT
        tm."userId",
        STRING_AGG(DISTINCT CONCAT(t."name", ' · ', tm."role"::text), ' | ') AS "teams"
      FROM "TeamMember" tm
      JOIN "Team" t ON t."id" = tm."teamId"
      GROUP BY tm."userId"
    ),
    active_sessions AS (
      SELECT "userId", COUNT(*)::int AS "activeSessions"
      FROM "Session"
      WHERE "expires" > NOW()
      GROUP BY "userId"
    )
    SELECT
      user_account."id" AS "userId",
      user_account."name" AS "name",
      user_account."email" AS "email",
      memberships."teams" AS "teams",
      COALESCE(magic."magicUsed30", 0)::int AS "magicUsed30",
      COALESCE(magic."magicUsed90", 0)::int AS "magicUsed90",
      COALESCE(magic."magicSent90", 0)::int AS "magicSent90",
      COALESCE(returning."returns7", 0)::int AS "returns7",
      COALESCE(returning."returns30", 0)::int AS "returns30",
      COALESCE(returning."returns90", 0)::int AS "returns90",
      COALESCE(active_sessions."activeSessions", 0)::int AS "activeSessions",
      magic."lastMagicRequestedAt" AS "lastMagicRequestedAt",
      magic."lastMagicUsedAt" AS "lastMagicUsedAt",
      returning."lastReturnAt" AS "lastReturnAt"
    FROM relevant_users
    JOIN "User" user_account ON user_account."id" = relevant_users."userId"
    LEFT JOIN magic ON magic."userId" = user_account."id"
    LEFT JOIN returning ON returning."userId" = user_account."id"
    LEFT JOIN memberships ON memberships."userId" = user_account."id"
    LEFT JOIN active_sessions ON active_sessions."userId" = user_account."id"
    ORDER BY COALESCE(magic."magicUsed90", 0) DESC,
             COALESCE(returning."returns90", 0) ASC,
             user_account."name" ASC NULLS LAST
  `;

  return rows.map(normaliseRow);
}

export default async function SessionReturnDiagnosisPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  await Promise.all([
    ensureSignInLinkActivityTable(),
    ensureAuthenticatedReturnVisitTable(),
  ]);

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().toLowerCase();
  const concernsOnly = params.view === "concerns";
  const rows = await loadRows();

  const matchesQuery = (row: DiagnosisRow) =>
    !query ||
    row.name?.toLowerCase().includes(query) ||
    row.email?.toLowerCase().includes(query) ||
    row.teams?.toLowerCase().includes(query);

  const visible = rows.filter((row) => {
    const state = diagnosis(row);
    if (concernsOnly && state.key !== "watch" && state.key !== "mixed") return false;
    return matchesQuery(row);
  });

  const needsWatching = rows.filter((row) => diagnosis(row).key === "watch").length;
  const mixed = rows.filter((row) => diagnosis(row).key === "mixed").length;
  const retained = rows.filter((row) => diagnosis(row).key === "healthy").length;
  const totalReturns90 = rows.reduce((sum, row) => sum + row.returns90, 0);

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.06] p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-200/70">
          Session return diagnosis
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
          Does the browser keep the user signed in?
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-white/65 sm:text-base">
          This compares successful magic-link logins with later visits where SIXFL restored an existing authenticated session. Return observations are throttled to one per user every 12 hours and are ignored for 20 minutes after a new magic link is sent, so the login itself is not counted as a return.
        </p>
        <p className="mt-3 text-xs leading-5 text-white/40">
          Return-session tracking starts with this deployment and cannot reconstruct earlier normal visits.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Needs watching</p>
          <p className="mt-2 text-3xl font-semibold text-white">{needsWatching}</p>
          <p className="mt-2 text-sm text-white/55">2+ successful magic links in 90 days, but no later session-return evidence yet.</p>
        </div>
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Mixed evidence</p>
          <p className="mt-2 text-3xl font-semibold text-white">{mixed}</p>
          <p className="mt-2 text-sm text-white/55">Repeat magic links, but at least one existing-session return also worked.</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Session retained</p>
          <p className="mt-2 text-3xl font-semibold text-white">{retained}</p>
          <p className="mt-2 text-sm text-white/55">There is evidence that an existing browser session survived a later visit.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Return observations · 90d</p>
          <p className="mt-2 text-3xl font-semibold text-white">{totalReturns90}</p>
          <p className="mt-2 text-sm text-white/55">Throttled authenticated returns recorded without a recent magic-link request.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Per-user evidence</h2>
            <p className="mt-2 text-sm text-white/50">
              A user with repeat magic-link logins but no return observations is a candidate for cookie, in-app-browser or session-retention problems — not proof on its own.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
              <Link
                href={`/admin/sign-in-activity/returning${query ? `?q=${encodeURIComponent(query)}` : ""}`}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${!concernsOnly ? "bg-emerald-500 text-black" : "text-white/55"}`}
              >
                All users
              </Link>
              <Link
                href={`/admin/sign-in-activity/returning?view=concerns${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${concernsOnly ? "bg-amber-400 text-black" : "text-white/55"}`}
              >
                Concerns only
              </Link>
            </div>
            <form action="/admin/sign-in-activity/returning" className="flex gap-2">
              {concernsOnly ? <input type="hidden" name="view" value="concerns" /> : null}
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search name, email or team"
                className="min-w-64 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/50"
              />
              <button className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-black">
                Search
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1450px] divide-y divide-white/10 text-left text-sm">
            <thead className="bg-black/25 text-white/45">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Diagnosis</th>
                <th className="px-4 py-3 text-right font-semibold">Magic used · 30d</th>
                <th className="px-4 py-3 text-right font-semibold">Magic used · 90d</th>
                <th className="px-4 py-3 text-right font-semibold">Returns · 7d</th>
                <th className="px-4 py-3 text-right font-semibold">Returns · 30d</th>
                <th className="px-4 py-3 text-right font-semibold">Returns · 90d</th>
                <th className="px-4 py-3 text-right font-semibold">Sessions</th>
                <th className="px-4 py-3 font-semibold">Last magic login</th>
                <th className="px-4 py-3 font-semibold">Last existing-session return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-white/45">No users match this view yet.</td>
                </tr>
              ) : null}
              {visible.map((row) => {
                const state = diagnosis(row);
                return (
                  <tr key={row.userId} className="align-top text-white/70">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{row.name || "Unnamed user"}</div>
                      <div className="mt-1 text-xs text-white/45">{row.email || "No email"}</div>
                      <div className="mt-1 max-w-sm text-[10px] leading-5 text-white/35">{row.teams || "No currently linked team"}</div>
                      {row.email ? (
                        <Link href={`/admin/users?q=${encodeURIComponent(row.email)}`} className="mt-2 inline-flex text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                          Open user record
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${state.classes}`}>{state.label}</span>
                      <p className="mt-2 max-w-md text-xs leading-5 text-white/45">{state.text}</p>
                    </td>
                    <td className="px-4 py-4 text-right">{row.magicUsed30}</td>
                    <td className="px-4 py-4 text-right font-semibold text-white">{row.magicUsed90}</td>
                    <td className="px-4 py-4 text-right">{row.returns7}</td>
                    <td className="px-4 py-4 text-right">{row.returns30}</td>
                    <td className={`px-4 py-4 text-right font-semibold ${row.returns90 > 0 ? "text-emerald-200" : "text-white/45"}`}>{row.returns90}</td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-semibold text-white">{row.activeSessions}</div>
                      <div className="mt-1 text-[10px] text-white/35">valid now</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">{formatDateTime(row.lastMagicUsedAt)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{formatDateTime(row.lastReturnAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
