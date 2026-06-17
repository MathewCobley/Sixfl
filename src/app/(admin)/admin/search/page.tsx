// ========================================
// File: src/app/(admin)/admin/search/page.tsx
// ========================================

import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

type ResultItem = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  details: string[];
  href: string;
};

function cleanQuery(value?: string | null) {
  return value?.trim() ?? "";
}

function getPhoneSearchValues(query: string) {
  const normalised = normalizePhoneNumber(query);
  const digits = query.replace(/\D/g, "");
  const lastSevenDigits = digits.length >= 7 ? digits.slice(-7) : null;

  return { normalised, digits, lastSevenDigits };
}

function nonEmpty(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

function buildUsersHref(input: { id?: string | null; email?: string | null; name?: string | null }) {
  const query = input.email?.trim() || input.name?.trim() || input.id?.trim() || "";
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  const suffix = input.id?.trim() ? `#user-${input.id.trim()}` : "";
  const queryString = params.toString();

  return `/admin/users${queryString ? `?${queryString}` : ""}${suffix}`;
}

function getRecipientHref(recipient: {
  sourceType: string;
  sourceId: string | null;
  email: string | null;
  displayName: string | null;
}) {
  const sourceId = recipient.sourceId?.trim();

  if (recipient.sourceType === "USER") {
    return buildUsersHref({ id: sourceId, email: recipient.email, name: recipient.displayName });
  }

  if (recipient.sourceType === "TEAM" && sourceId) {
    return `/admin/teams/${sourceId}`;
  }

  if (recipient.sourceType === "LEAD" && sourceId) {
    return `/admin/leads/${sourceId}`;
  }

  if (recipient.sourceType === "PLAYER" && sourceId) {
    return `/admin/player-prospects?q=${encodeURIComponent(recipient.email || recipient.displayName || sourceId)}`;
  }

  return "/admin/queue";
}

function resultCard(item: ResultItem) {
  return (
    <Link
      key={`${item.type}-${item.id}`}
      href={item.href}
      className="block rounded-2xl border border-white/10 bg-black/25 p-5 transition hover:border-emerald-400/30 hover:bg-white/[0.05]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            {item.type}
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {item.title}
          </div>
          <div className="mt-1 text-sm text-white/55">{item.subtitle}</div>
        </div>
        <div className="shrink-0 text-sm font-medium text-emerald-300">
          Open →
        </div>
      </div>

      {item.details.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.details.map((detail) => (
            <span
              key={detail}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60"
            >
              {detail}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

export default async function AdminSearchPage({ searchParams }: Props) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const q = cleanQuery(sp.q);
  const phone = getPhoneSearchValues(q);
  const hasQuery = q.length >= 2;

  const [users, leads, prospects, teams, recipients, threads] = hasQuery
    ? await Promise.all([
        prisma.user.findMany({
          where: {
            OR: [{ name: { contains: q } }, { email: { contains: q } }],
          },
          orderBy: [{ name: "asc" }, { email: "asc" }],
          take: 20,
          select: { id: true, name: true, email: true, role: true },
        }),
        prisma.interestLead.findMany({
          where: {
            OR: [
              { contactName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              { teamName: { contains: q } },
              { area: { contains: q } },
              ...(phone.normalised ? [{ phoneNormalized: phone.normalised }] : []),
              ...(phone.lastSevenDigits
                ? [{ phoneNormalized: { contains: phone.lastSevenDigits } }]
                : []),
            ],
          },
          orderBy: [{ createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            contactName: true,
            email: true,
            phone: true,
            phoneNormalized: true,
            teamName: true,
            area: true,
            status: true,
            interestType: true,
          },
        }),
        prisma.teamPlayerProspect.findMany({
          where: {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              ...(phone.lastSevenDigits
                ? [{ phone: { contains: phone.lastSevenDigits } }]
                : []),
            ],
          },
          orderBy: [{ createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            preferredPositions: true,
            team: { select: { id: true, name: true } },
          },
        }),
        prisma.team.findMany({
          where: {
            OR: [
              { name: { contains: q } },
              { contactName: { contains: q } },
              { contactEmail: { contains: q } },
              { contactPhone: { contains: q } },
              { secondaryContactName: { contains: q } },
              { secondaryContactEmail: { contains: q } },
              { secondaryContactPhone: { contains: q } },
              ...(phone.lastSevenDigits
                ? [
                    { contactPhone: { contains: phone.lastSevenDigits } },
                    { secondaryContactPhone: { contains: phone.lastSevenDigits } },
                  ]
                : []),
            ],
          },
          orderBy: [{ name: "asc" }],
          take: 30,
          select: {
            id: true,
            name: true,
            contactName: true,
            contactEmail: true,
            contactPhone: true,
            secondaryContactName: true,
            secondaryContactEmail: true,
            secondaryContactPhone: true,
            teamMode: true,
            league: { select: { name: true, season: true } },
          },
        }),
        prisma.notificationRecipient.findMany({
          where: {
            OR: [
              { displayName: { contains: q } },
              { email: { contains: q } },
              { emailNormalized: { contains: q.toLowerCase() } },
              { phone: { contains: q } },
              ...(phone.normalised ? [{ phoneNormalized: phone.normalised }] : []),
              ...(phone.lastSevenDigits
                ? [{ phoneNormalized: { contains: phone.lastSevenDigits } }]
                : []),
            ],
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 30,
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            audience: true,
            displayName: true,
            email: true,
            phone: true,
            phoneNormalized: true,
            isSuppressed: true,
          },
        }),
        prisma.messageThread.findMany({
          where: {
            OR: [
              { contactName: { contains: q } },
              { contactEmail: { contains: q } },
              { emailNormalized: { contains: q.toLowerCase() } },
              { contactPhone: { contains: q } },
              ...(phone.normalised ? [{ phoneNormalized: phone.normalised }] : []),
              ...(phone.lastSevenDigits
                ? [{ phoneNormalized: { contains: phone.lastSevenDigits } }]
                : []),
            ],
          },
          orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
          take: 30,
          select: {
            id: true,
            channel: true,
            status: true,
            contactName: true,
            contactEmail: true,
            contactPhone: true,
            phoneNormalized: true,
            team: { select: { id: true, name: true } },
          },
        }),
      ])
    : [[], [], [], [], [], []];

  const results: ResultItem[] = [
    ...users.map((user) => ({
      id: user.id,
      type: "User",
      title: user.name || user.email || "Unnamed user",
      subtitle: user.email || "No email stored",
      details: nonEmpty([user.role]),
      href: buildUsersHref({ id: user.id, email: user.email, name: user.name }),
    })),
    ...leads.map((lead) => ({
      id: lead.id,
      type: "Lead",
      title: lead.contactName,
      subtitle: lead.email || lead.phone || "No contact details stored",
      details: nonEmpty([
        lead.phoneNormalized || lead.phone,
        lead.interestType,
        lead.status,
        lead.teamName,
        lead.area,
      ]),
      href: `/admin/leads/${lead.id}/edit`,
    })),
    ...prospects.map((prospect) => ({
      id: prospect.id,
      type: "Team prospect",
      title: [prospect.firstName, prospect.lastName].filter(Boolean).join(" "),
      subtitle: `${prospect.team.name} prospect`,
      details: nonEmpty([
        prospect.email,
        prospect.phone,
        prospect.status,
        prospect.preferredPositions,
      ]),
      href: `/admin/teams/${prospect.team.id}/prospects`,
    })),
    ...teams.map((team) => ({
      id: team.id,
      type: "Team contact",
      title: team.name,
      subtitle: team.league
        ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
        : "No league assigned",
      details: nonEmpty([
        team.contactName,
        team.contactEmail,
        team.contactPhone,
        team.secondaryContactName,
        team.secondaryContactEmail,
        team.secondaryContactPhone,
        team.teamMode,
      ]),
      href: `/admin/teams/${team.id}`,
    })),
    ...recipients.map((recipient) => ({
      id: recipient.id,
      type: "Notification recipient",
      title:
        recipient.displayName || recipient.email || recipient.phone || "Unnamed recipient",
      subtitle: `${recipient.audience} · ${recipient.sourceType}${
        recipient.isSuppressed ? " · suppressed" : ""
      }`,
      details: nonEmpty([
        recipient.email,
        recipient.phoneNormalized || recipient.phone,
        recipient.sourceId,
      ]),
      href: getRecipientHref(recipient),
    })),
    ...threads.map((thread) => ({
      id: thread.id,
      type: "Message thread",
      title:
        thread.contactName || thread.contactEmail || thread.contactPhone || "Unnamed thread",
      subtitle: thread.team
        ? `${thread.channel} thread · ${thread.team.name}`
        : `${thread.channel} thread`,
      details: nonEmpty([
        thread.contactEmail,
        thread.phoneNormalized || thread.contactPhone,
        thread.status,
      ]),
      href: "/admin/messaging",
    })),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className="text-sm text-emerald-300">Admin search</div>
        <h1 className="text-3xl font-semibold text-white">
          Find a person or contact
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-white/60">
          Search by name, email address or mobile number. Mobile numbers are
          matched against both the typed version and the normalised UK format.
        </p>
      </div>

      <form className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 md:p-6">
        <label htmlFor="q" className="text-sm font-medium text-white/70">
          Search
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, email or mobile number"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
          >
            Search
          </button>
        </div>

        {phone.normalised ? (
          <div className="mt-3 text-xs text-white/45">
            Normalised phone search:{" "}
            <span className="font-mono text-white/70">{phone.normalised}</span>
          </div>
        ) : null}
      </form>

      {!hasQuery ? (
        <div className="rounded-3xl border border-white/10 bg-black/25 p-6 text-sm text-white/55">
          Enter at least two characters, or paste a mobile number, to search
          across leads, prospects, teams, recipients and message threads.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">
              {results.length} result{results.length === 1 ? "" : "s"}
            </h2>
            <div className="text-sm text-white/45">Query: {q}</div>
          </div>

          {results.length > 0 ? (
            <div className="grid gap-3">{results.map(resultCard)}</div>
          ) : (
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6 text-sm leading-6 text-amber-50/85">
              No matches found. Try the mobile number without spaces, with 07 at
              the start, or in +44 format.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
