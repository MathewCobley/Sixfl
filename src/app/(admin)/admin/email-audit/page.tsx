// ========================================
// File: src/app/(admin)/admin/email-audit/page.tsx
// ========================================

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Email Audit | SIXFL Admin",
};

type RawEmailRow = {
  source: string;
  email: string | null;
};

type EmailSummary = {
  email: string;
  entries: number;
  sources: Set<string>;
};

function normaliseEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  return email;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

async function loadPrimaryEmailRows() {
  const rows = await prisma.$queryRaw<RawEmailRow[]>`
    SELECT 'User accounts'::text AS "source", "email"::text AS "email"
    FROM "User"
    WHERE NULLIF(BTRIM("email"), '') IS NOT NULL

    UNION ALL

    SELECT 'Team primary contacts'::text AS "source", "contactEmail"::text AS "email"
    FROM "Team"
    WHERE NULLIF(BTRIM("contactEmail"), '') IS NOT NULL

    UNION ALL

    SELECT 'Team secondary contacts'::text AS "source", "secondaryContactEmail"::text AS "email"
    FROM "Team"
    WHERE NULLIF(BTRIM("secondaryContactEmail"), '') IS NOT NULL

    UNION ALL

    SELECT 'Captain invitations'::text AS "source", "captainInviteSentTo"::text AS "email"
    FROM "Team"
    WHERE NULLIF(BTRIM("captainInviteSentTo"), '') IS NOT NULL

    UNION ALL

    SELECT 'Player prospects'::text AS "source", "email"::text AS "email"
    FROM "TeamPlayerProspect"
    WHERE NULLIF(BTRIM("email"), '') IS NOT NULL

    UNION ALL

    SELECT 'Interest leads'::text AS "source", "email"::text AS "email"
    FROM "InterestLead"
    WHERE NULLIF(BTRIM("email"), '') IS NOT NULL

    UNION ALL

    SELECT
      'Notification recipients'::text AS "source",
      COALESCE(
        NULLIF(BTRIM("emailNormalized"), ''),
        NULLIF(BTRIM("email"), '')
      )::text AS "email"
    FROM "NotificationRecipient"
    WHERE COALESCE(
      NULLIF(BTRIM("emailNormalized"), ''),
      NULLIF(BTRIM("email"), '')
    ) IS NOT NULL
  `;

  const playerPoolTable = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('"PlayerPoolProfile"') IS NOT NULL AS "exists"
  `;

  if (!playerPoolTable[0]?.exists) return rows;

  const playerPoolRows = await prisma.$queryRaw<RawEmailRow[]>`
    SELECT 'PlayerPool profiles'::text AS "source", "emailNormalized"::text AS "email"
    FROM "PlayerPoolProfile"
    WHERE NULLIF(BTRIM("emailNormalized"), '') IS NOT NULL
  `;

  return [...rows, ...playerPoolRows];
}

async function loadCommunicationHistoryRows() {
  return prisma.$queryRaw<RawEmailRow[]>`
    SELECT 'Lead email history'::text AS "source", "sentTo"::text AS "email"
    FROM "InterestLeadEmail"
    WHERE NULLIF(BTRIM("sentTo"), '') IS NOT NULL

    UNION ALL

    SELECT
      'Message thread contacts'::text AS "source",
      COALESCE(
        NULLIF(BTRIM("emailNormalized"), ''),
        NULLIF(BTRIM("contactEmail"), '')
      )::text AS "email"
    FROM "MessageThread"
    WHERE COALESCE(
      NULLIF(BTRIM("emailNormalized"), ''),
      NULLIF(BTRIM("contactEmail"), '')
    ) IS NOT NULL

    UNION ALL

    SELECT 'Inbound/outbound message senders'::text AS "source", "fromEmail"::text AS "email"
    FROM "MessageEntry"
    WHERE NULLIF(BTRIM("fromEmail"), '') IS NOT NULL

    UNION ALL

    SELECT 'Inbound/outbound message recipients'::text AS "source", "toEmail"::text AS "email"
    FROM "MessageEntry"
    WHERE NULLIF(BTRIM("toEmail"), '') IS NOT NULL

    UNION ALL

    SELECT 'Inbox alert recipients'::text AS "source", "sentToEmail"::text AS "email"
    FROM "InboxAlert"
    WHERE NULLIF(BTRIM("sentToEmail"), '') IS NOT NULL
  `;
}

function buildAudit(rows: RawEmailRow[]) {
  const byEmail = new Map<string, EmailSummary>();
  const bySource = new Map<
    string,
    { entries: number; emails: Set<string>; invalid: number }
  >();
  let validEntries = 0;
  let invalidEntries = 0;

  for (const row of rows) {
    const email = normaliseEmail(row.email);
    const source = row.source.trim() || "Unknown source";
    const sourceSummary = bySource.get(source) ?? {
      entries: 0,
      emails: new Set<string>(),
      invalid: 0,
    };

    sourceSummary.entries += 1;

    if (!email) {
      sourceSummary.invalid += 1;
      invalidEntries += 1;
      bySource.set(source, sourceSummary);
      continue;
    }

    validEntries += 1;
    sourceSummary.emails.add(email);
    bySource.set(source, sourceSummary);

    const summary = byEmail.get(email) ?? {
      email,
      entries: 0,
      sources: new Set<string>(),
    };
    summary.entries += 1;
    summary.sources.add(source);
    byEmail.set(email, summary);
  }

  const sourceRows = Array.from(bySource.entries())
    .map(([source, summary]) => ({
      source,
      entries: summary.entries,
      unique: summary.emails.size,
      duplicateEntries: Math.max(0, summary.entries - summary.emails.size - summary.invalid),
      invalid: summary.invalid,
    }))
    .sort((a, b) => b.entries - a.entries || a.source.localeCompare(b.source));

  const duplicates = Array.from(byEmail.values())
    .filter((summary) => summary.entries > 1)
    .sort(
      (a, b) =>
        b.entries - a.entries ||
        b.sources.size - a.sources.size ||
        a.email.localeCompare(b.email),
    );

  return {
    byEmail,
    sourceRows,
    duplicates,
    validEntries,
    invalidEntries,
    uniqueEmails: byEmail.size,
    duplicateEntries: Math.max(0, validEntries - byEmail.size),
    sharedAcrossSources: Array.from(byEmail.values()).filter(
      (summary) => summary.sources.size > 1,
    ).length,
  };
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
  tone?: "default" | "emerald" | "sky" | "amber";
}) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10"
      : tone === "sky"
        ? "border-sky-400/20 bg-sky-500/10"
        : tone === "amber"
          ? "border-amber-400/20 bg-amber-500/10"
          : "border-white/10 bg-white/[0.04]";

  return (
    <div className={`rounded-3xl border p-5 ${toneClasses}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(value)}</p>
      <p className="mt-2 text-sm leading-6 text-white/55">{helper}</p>
    </div>
  );
}

export default async function AdminEmailAuditPage() {
  await requireAdmin();

  const [primaryRows, historyRows] = await Promise.all([
    loadPrimaryEmailRows(),
    loadCommunicationHistoryRows(),
  ]);

  const primaryAudit = buildAudit(primaryRows);
  const historyAudit = buildAudit(historyRows);
  const historyOnlyEmails = Array.from(historyAudit.byEmail.keys()).filter(
    (email) => !primaryAudit.byEmail.has(email),
  );
  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date());

  return (
    <div className="mx-auto max-w-[1450px] space-y-7 pb-12">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/80">
          Live production audit
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Email address audit
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-white/65 sm:text-base">
          Counts structured contact email fields across user accounts, teams, prospects,
          leads, notification recipients and PlayerPool. Addresses are trimmed and compared
          case-insensitively, so differently capitalised copies count as one person.
        </p>
        <p className="mt-3 text-xs text-white/35">Calculated live at {generatedAt}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Unique contact emails"
          value={primaryAudit.uniqueEmails}
          helper="The main total: distinct valid addresses in primary contact records."
          tone="emerald"
        />
        <StatCard
          label="Stored contact entries"
          value={primaryAudit.validEntries}
          helper="All valid contact rows before removing duplicates."
          tone="sky"
        />
        <StatCard
          label="Duplicate entries"
          value={primaryAudit.duplicateEntries}
          helper="Extra stored copies above the unique total."
          tone="amber"
        />
        <StatCard
          label="Shared across sources"
          value={primaryAudit.sharedAcrossSources}
          helper="Addresses appearing in more than one type of record."
        />
        <StatCard
          label="History-only emails"
          value={historyOnlyEmails.length}
          helper="Found in message history but not in a current primary contact record."
        />
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              Primary contact coverage
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Breakdown by source</h2>
          </div>
          <p className="text-sm text-white/45">
            {formatNumber(primaryAudit.invalidEntries)} non-empty malformed entr{primaryAudit.invalidEntries === 1 ? "y" : "ies"} excluded
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-black/25 text-white/45">
              <tr>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 text-right font-semibold">Stored entries</th>
                <th className="px-4 py-3 text-right font-semibold">Unique in source</th>
                <th className="px-4 py-3 text-right font-semibold">Duplicate entries</th>
                <th className="px-4 py-3 text-right font-semibold">Malformed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {primaryAudit.sourceRows.map((row) => (
                <tr key={row.source} className="text-white/70">
                  <td className="px-4 py-3 font-semibold text-white">{row.source}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.entries)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.unique)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.duplicateEntries)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.invalid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              Duplicate and overlap review
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Repeated addresses</h2>
          </div>
          <p className="text-sm text-white/45">
            Showing {Math.min(primaryAudit.duplicates.length, 100)} of {formatNumber(primaryAudit.duplicates.length)} repeated addresses
          </p>
        </div>

        {primaryAudit.duplicates.length ? (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-black/25 text-white/45">
                <tr>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 text-right font-semibold">Entries</th>
                  <th className="px-4 py-3 font-semibold">Sources</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {primaryAudit.duplicates.slice(0, 100).map((row) => (
                  <tr key={row.email} className="text-white/70">
                    <td className="px-4 py-3 font-medium text-white">{row.email}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.entries)}</td>
                    <td className="px-4 py-3">{Array.from(row.sources).sort().join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-white/50">
            No repeated contact email addresses were found.
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.06] p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-white">How the totals are defined</h2>
        <p className="mt-3 max-w-5xl text-sm leading-7 text-white/65">
          The headline total excludes copies stored only in sent and received message logs,
          because counting every delivery record would heavily inflate the number. Message
          history currently contains {formatNumber(historyAudit.uniqueEmails)} unique valid
          addresses, of which {formatNumber(historyOnlyEmails.length)} do not appear in the
          current primary contact records. System-generated reply addresses are not counted.
        </p>
      </section>
    </div>
  );
}
