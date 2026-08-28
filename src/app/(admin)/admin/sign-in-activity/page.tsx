import Link from "next/link";

import { ensureSignInLinkActivityTable } from "@/lib/auth/sign-in-link-activity";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Sign-in Activity | SIXFL Admin",
};

const FREQUENT_LINK_THRESHOLD = 3;

type SearchParams = {
  q?: string;
  view?: string;
};

type SignInSummaryRow = {
  email: string;
  userId: string | null;
  userName: string | null;
  accountType: string | null;
  teams: string | null;
  links7: number;
  links30: number;
  links90: number;
  linksTotal: number;
  used30: number;
  usedTotal: number;
  unused30: number;
  failed30: number;
  activeSessions: number;
  lastRequestedAt: Date | null;
  lastSentAt: Date | null;
  lastUsedAt: Date | null;
  lastCallbackUrl: string | null;
  lastLinkHost: string | null;
};

type SignInEventRow = {
  id: string;
  email: string;
  userId: string | null;
  userName: string | null;
  accountType: string | null;
  teamName: string | null;
  requestedAt: Date;
  sentAt: Date | null;
  usedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  callbackUrl: string | null;
  linkHost: string | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
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

function accountTypeLabel(value: string | null) {
  if (!value) return "User";

  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function normaliseSummary(row: SignInSummaryRow): SignInSummaryRow {
  return {
    ...row,
    links7: Number(row.links7 ?? 0),
    links30: Number(row.links30 ?? 0),
    links90: Number(row.links90 ?? 0),
    linksTotal: Number(row.linksTotal ?? 0),
    used30: Number(row.used30 ?? 0),
    usedTotal: Number(row.usedTotal ?? 0),
    unused30: Number(row.unused30 ?? 0),
    failed30: Number(row.failed30 ?? 0),
    activeSessions: Number(row.activeSessions ?? 0),
  };
}

function eventStatus(row: SignInEventRow) {
  if (row.failedAt) {
    return {
      label: "Failed",
      classes: "border-red-400/25 bg-red-500/10 text-red-100",
    };
  }

  if (row.usedAt) {
    return {
      label: "Used successfully",
      classes: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
    };
  }

  if (row.sentAt) {
    return {
      label: "Sent · not used",
      classes: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    };
  }

  return {
    label: "Requested",
    classes: "border-white/10 bg-white/[0.04] text-white/65",
  };
}

function destinationLabel(value: string | null) {
  if (!value) return "Default dashboard";

  try {
    const parsed = new URL(value, "https://www.sixfl.co.uk");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

async function loadSignInSummaries() {
  const rows = await prisma.$queryRaw<SignInSummaryRow[]>`
    WITH activity AS (
      SELECT
        "emailNormalized",
        MAX("userId") FILTER (WHERE "userId" IS NOT NULL) AS "userIdSnapshot",
        MAX("userNameSnapshot") FILTER (WHERE "userNameSnapshot" IS NOT NULL) AS "userNameSnapshot",
        MAX("accountTypeSnapshot") FILTER (WHERE "accountTypeSnapshot" IS NOT NULL) AS "accountTypeSnapshot",
        (COUNT(*) FILTER (
          WHERE "sentAt" IS NOT NULL
            AND "requestedAt" >= NOW() - INTERVAL '7 days'
        ))::int AS "links7",
        (COUNT(*) FILTER (
          WHERE "sentAt" IS NOT NULL
            AND "requestedAt" >= NOW() - INTERVAL '30 days'
        ))::int AS "links30",
        (COUNT(*) FILTER (
          WHERE "sentAt" IS NOT NULL
            AND "requestedAt" >= NOW() - INTERVAL '90 days'
        ))::int AS "links90",
        (COUNT(*) FILTER (WHERE "sentAt" IS NOT NULL))::int AS "linksTotal",
        (COUNT(*) FILTER (
          WHERE "usedAt" IS NOT NULL
            AND "requestedAt" >= NOW() - INTERVAL '30 days'
        ))::int AS "used30",
        (COUNT(*) FILTER (WHERE "usedAt" IS NOT NULL))::int AS "usedTotal",
        (COUNT(*) FILTER (
          WHERE "sentAt" IS NOT NULL
            AND "usedAt" IS NULL
            AND "failedAt" IS NULL
            AND "requestedAt" >= NOW() - INTERVAL '30 days'
            AND "requestedAt" < NOW() - INTERVAL '24 hours'
        ))::int AS "unused30",
        (COUNT(*) FILTER (
          WHERE "failedAt" IS NOT NULL
            AND "requestedAt" >= NOW() - INTERVAL '30 days'
        ))::int AS "failed30",
        MAX("requestedAt") AS "lastRequestedAt",
        MAX("sentAt") AS "lastSentAt",
        MAX("usedAt") AS "lastUsedAt"
      FROM "SignInLinkActivity"
      GROUP BY "emailNormalized"
    ),
    memberships AS (
      SELECT
        tm."userId",
        STRING_AGG(
          DISTINCT CONCAT(t."name", ' · ', tm."role"::text),
          ' | '
        ) AS "teams"
      FROM "TeamMember" tm
      JOIN "Team" t ON t."id" = tm."teamId"
      GROUP BY tm."userId"
    ),
    active_sessions AS (
      SELECT
        "userId",
        COUNT(*)::int AS "activeSessions"
      FROM "Session"
      WHERE "expires" > NOW()
      GROUP BY "userId"
    ),
    latest_activity AS (
      SELECT DISTINCT ON ("emailNormalized")
        "emailNormalized",
        "callbackUrl",
        "linkHost"
      FROM "SignInLinkActivity"
      ORDER BY "emailNormalized", "requestedAt" DESC
    )
    SELECT
      activity."emailNormalized" AS "email",
      COALESCE(user_account."id", activity."userIdSnapshot") AS "userId",
      COALESCE(user_account."name", activity."userNameSnapshot") AS "userName",
      CASE
        WHEN user_account."role"::text IN ('ADMIN', 'REFEREE') THEN user_account."role"::text
        ELSE COALESCE(activity."accountTypeSnapshot", 'USER')
      END AS "accountType",
      memberships."teams" AS "teams",
      activity."links7" AS "links7",
      activity."links30" AS "links30",
      activity."links90" AS "links90",
      activity."linksTotal" AS "linksTotal",
      activity."used30" AS "used30",
      activity."usedTotal" AS "usedTotal",
      activity."unused30" AS "unused30",
      activity."failed30" AS "failed30",
      COALESCE(active_sessions."activeSessions", 0)::int AS "activeSessions",
      activity."lastRequestedAt" AS "lastRequestedAt",
      activity."lastSentAt" AS "lastSentAt",
      activity."lastUsedAt" AS "lastUsedAt",
      latest_activity."callbackUrl" AS "lastCallbackUrl",
      latest_activity."linkHost" AS "lastLinkHost"
    FROM activity
    LEFT JOIN "User" user_account
      ON LOWER(BTRIM(user_account."email")) = activity."emailNormalized"
    LEFT JOIN memberships
      ON memberships."userId" = COALESCE(user_account."id", activity."userIdSnapshot")
    LEFT JOIN active_sessions
      ON active_sessions."userId" = COALESCE(user_account."id", activity."userIdSnapshot")
    LEFT JOIN latest_activity
      ON latest_activity."emailNormalized" = activity."emailNormalized"
    ORDER BY activity."links30" DESC, activity."lastRequestedAt" DESC
  `;

  return rows.map(normaliseSummary);
}

async function loadRecentEvents() {
  return prisma.$queryRaw<SignInEventRow[]>`
    SELECT
      activity."id",
      activity."emailNormalized" AS "email",
      COALESCE(user_account."id", activity."userId") AS "userId",
      COALESCE(user_account."name", activity."userNameSnapshot") AS "userName",
      CASE
        WHEN user_account."role"::text IN ('ADMIN', 'REFEREE') THEN user_account."role"::text
        ELSE COALESCE(activity."accountTypeSnapshot", 'USER')
      END AS "accountType",
      activity."teamNameSnapshot" AS "teamName",
      activity."requestedAt",
      activity."sentAt",
      activity."usedAt",
      activity."failedAt",
      activity."failureReason",
      activity."callbackUrl",
      activity."linkHost"
    FROM "SignInLinkActivity" activity
    LEFT JOIN "User" user_account
      ON LOWER(BTRIM(user_account."email")) = activity."emailNormalized"
    ORDER BY activity."requestedAt" DESC
    LIMIT 100
  `;
}

function StatCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: number;
  helper: string;
  tone?: "default" | "emerald" | "amber" | "sky";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-500/10"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10"
          : "border-white/10 bg-white/[0.04]";

  return (
    <div className={`rounded-3xl border p-5 ${classes}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(value)}</p>
      <p className="mt-2 text-sm leading-6 text-white/55">{helper}</p>
    </div>
  );
}

export default async function AdminSignInActivityPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  await ensureSignInLinkActivityTable();

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().toLowerCase();
  const frequentOnly = params.view === "frequent";

  const [summaries, recentEvents] = await Promise.all([
    loadSignInSummaries(),
    loadRecentEvents(),
  ]);

  const matchesQuery = (email: string, name: string | null, teams?: string | null) =>
    !query ||
    email.toLowerCase().includes(query) ||
    name?.toLowerCase().includes(query) ||
    teams?.toLowerCase().includes(query);

  const visibleSummaries = summaries.filter((row) => {
    if (frequentOnly && row.links30 < FREQUENT_LINK_THRESHOLD) return false;
    return matchesQuery(row.email, row.userName, row.teams);
  });
  const visibleEvents = recentEvents.filter((row) =>
    matchesQuery(row.email, row.userName, row.teamName),
  );

  const frequentUsers = summaries.filter(
    (row) => row.links30 >= FREQUENT_LINK_THRESHOLD,
  ).length;
  const linksSent30 = summaries.reduce((total, row) => total + row.links30, 0);
  const linksUsed30 = summaries.reduce((total, row) => total + row.used30, 0);
  const unusedLinks30 = summaries.reduce((total, row) => total + row.unused30, 0);
  const failedLinks30 = summaries.reduce((total, row) => total + row.failed30, 0);
  const generatedAt = formatDateTime(new Date());

  return (
    <div className="mx-auto max-w-[1600px] space-y-7 pb-12">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/80">
          Login reliability report
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Sign-in activity
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-white/65 sm:text-base">
          Records every SIXFL magic-link email accepted for sending and whether that link
          was then used successfully. Use the frequent-user list to identify people who
          may be losing their saved session or opening links in a different browser.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/45">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
            Calculated live at {generatedAt}
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
            Tracking begins when this feature is deployed
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
            Security tokens are never stored
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="People tracked"
          value={summaries.length}
          helper="Distinct email addresses that have received a recorded sign-in link."
          tone="sky"
        />
        <StatCard
          label="Links sent · 30 days"
          value={linksSent30}
          helper="Sign-in emails accepted by the email provider during the last 30 days."
          tone="emerald"
        />
        <StatCard
          label="Links used · 30 days"
          value={linksUsed30}
          helper="Recorded links that led to a successful SIXFL sign-in."
        />
        <StatCard
          label="Frequent users"
          value={frequentUsers}
          helper={`People sent ${FREQUENT_LINK_THRESHOLD} or more sign-in links in 30 days.`}
          tone="amber"
        />
        <StatCard
          label="Unused / failed · 30 days"
          value={unusedLinks30 + failedLinks30}
          helper="Unused links older than 24 hours, plus emails that failed to send."
          tone="amber"
        />
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              Per-user report
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Who is repeatedly requesting sign-in emails?
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
              Three or more links in 30 days is flagged for review. A high link count with
              successful uses usually suggests the browser is not retaining the session.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 lg:max-w-3xl sm:flex-row">
            <div className="flex rounded-2xl border border-white/10 bg-black/20 p-1">
              <Link
                href={`/admin/sign-in-activity${query ? `?q=${encodeURIComponent(query)}` : ""}`}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  !frequentOnly
                    ? "bg-emerald-500 text-black"
                    : "text-white/55 hover:text-white"
                }`}
              >
                All users
              </Link>
              <Link
                href={`/admin/sign-in-activity?view=frequent${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  frequentOnly
                    ? "bg-amber-400 text-black"
                    : "text-white/55 hover:text-white"
                }`}
              >
                Frequent only
              </Link>
            </div>

            <form action="/admin/sign-in-activity" className="flex flex-1 gap-2">
              {frequentOnly ? <input type="hidden" name="view" value="frequent" /> : null}
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search name, email or team"
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400/50"
              />
              <button
                type="submit"
                className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
              >
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
                <th className="px-4 py-3 font-semibold">Account / team</th>
                <th className="px-4 py-3 text-right font-semibold">7 days</th>
                <th className="px-4 py-3 text-right font-semibold">30 days</th>
                <th className="px-4 py-3 text-right font-semibold">90 days</th>
                <th className="px-4 py-3 text-right font-semibold">Used · 30d</th>
                <th className="px-4 py-3 text-right font-semibold">Unused · 30d</th>
                <th className="px-4 py-3 text-right font-semibold">Sessions</th>
                <th className="px-4 py-3 font-semibold">Last link</th>
                <th className="px-4 py-3 font-semibold">Last successful use</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleSummaries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-white/45">
                    No sign-in activity matches this view yet.
                  </td>
                </tr>
              ) : null}

              {visibleSummaries.map((row) => {
                const frequent = row.links30 >= FREQUENT_LINK_THRESHOLD;

                return (
                  <tr key={row.email} className="align-top text-white/70">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">
                        {row.userName || "Unnamed user"}
                      </div>
                      <div className="mt-1 text-xs text-white/45">{row.email}</div>
                      {frequent ? (
                        <span className="mt-2 inline-flex rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                          Frequent sign-in links
                        </span>
                      ) : null}
                      <div className="mt-2">
                        <Link
                          href={`/admin/users?q=${encodeURIComponent(row.email)}`}
                          className="text-xs font-semibold text-emerald-300 hover:text-emerald-200"
                        >
                          Open user record
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/70">
                        {accountTypeLabel(row.accountType)}
                      </span>
                      <div className="mt-2 max-w-sm text-xs leading-5 text-white/45">
                        {row.teams || "No currently linked team"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-white">
                      {formatNumber(row.links7)}
                    </td>
                    <td className={`px-4 py-4 text-right font-semibold ${frequent ? "text-amber-200" : "text-white"}`}>
                      {formatNumber(row.links30)}
                      <div className="mt-1 text-[10px] font-normal text-white/35">
                        {formatNumber(row.linksTotal)} total
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">{formatNumber(row.links90)}</td>
                    <td className="px-4 py-4 text-right text-emerald-200">
                      {formatNumber(row.used30)}
                      <div className="mt-1 text-[10px] text-white/35">
                        {formatNumber(row.usedTotal)} total
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={row.unused30 > 0 ? "text-amber-200" : "text-white/55"}>
                        {formatNumber(row.unused30)}
                      </span>
                      {row.failed30 > 0 ? (
                        <div className="mt-1 text-[10px] text-red-200">
                          {formatNumber(row.failed30)} failed
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {formatNumber(row.activeSessions)}
                      <div className="mt-1 text-[10px] text-white/35">valid now</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="whitespace-nowrap text-white/70">
                        {formatDateTime(row.lastRequestedAt)}
                      </div>
                      <div className="mt-1 max-w-xs truncate text-[10px] text-white/35" title={row.lastCallbackUrl || undefined}>
                        {destinationLabel(row.lastCallbackUrl)}
                      </div>
                      {row.lastLinkHost ? (
                        <div className="mt-1 text-[10px] text-white/30">{row.lastLinkHost}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatDateTime(row.lastUsedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              Recent events
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Latest sign-in link history
            </h2>
          </div>
          <p className="text-sm text-white/45">
            Showing {Math.min(visibleEvents.length, 100)} recent event{visibleEvents.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1100px] divide-y divide-white/10 text-left text-sm">
            <thead className="bg-black/25 text-white/45">
              <tr>
                <th className="px-4 py-3 font-semibold">Requested</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Destination</th>
                <th className="px-4 py-3 font-semibold">Successful use</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-white/45">
                    No individual sign-in link events have been recorded yet.
                  </td>
                </tr>
              ) : null}

              {visibleEvents.map((row) => {
                const status = eventStatus(row);

                return (
                  <tr key={row.id} className="align-top text-white/70">
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatDateTime(row.requestedAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">
                        {row.userName || "Unnamed user"}
                      </div>
                      <div className="mt-1 text-xs text-white/45">{row.email}</div>
                      <div className="mt-1 text-[10px] text-white/30">
                        {accountTypeLabel(row.accountType)}
                        {row.teamName ? ` · ${row.teamName}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.classes}`}>
                        {status.label}
                      </span>
                      {row.failureReason ? (
                        <div className="mt-2 max-w-md text-xs leading-5 text-red-100/70">
                          {row.failureReason}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="max-w-md truncate text-white/65" title={row.callbackUrl || undefined}>
                        {destinationLabel(row.callbackUrl)}
                      </div>
                      {row.linkHost ? (
                        <div className="mt-1 text-[10px] text-white/30">{row.linkHost}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatDateTime(row.usedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.06] p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-white">How to interpret the report</h2>
        <div className="mt-3 grid gap-4 text-sm leading-7 text-white/60 lg:grid-cols-3">
          <p>
            <strong className="text-white">Many links and many successful uses:</strong>{" "}
            the person can sign in, but their browser or in-app browser may not be keeping the session.
          </p>
          <p>
            <strong className="text-white">Many links but few successful uses:</strong>{" "}
            they may be opening an older email, switching browsers, using private mode or allowing links to expire.
          </p>
          <p>
            <strong className="text-white">Several active sessions:</strong>{" "}
            they may use more than one device or browser. This is information for diagnosis, not automatically a fault.
          </p>
        </div>
      </section>
    </div>
  );
}
