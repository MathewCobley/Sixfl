// ========================================
// File: src/app/(admin)/admin/polls/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPublicSiteUrl } from "@/lib/stripe/client";
import {
  addPollRecipientAction,
  deletePollRecipientAction,
  updatePollStatusAction,
} from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Poll Results | SIXFL Admin",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PollRow = {
  id: string;
  title: string;
  question: string;
  slug: string;
  status: string;
  choiceMode: string;
  createdAt: Date;
};

type OptionRow = {
  id: string;
  label: string;
  sortOrder: number;
};

type RecipientRow = {
  id: string;
  teamName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  token: string;
  selectedOptionLabels: string | null;
  note: string | null;
  votedAt: Date | null;
  createdAt: Date;
};

type ResultRow = {
  optionId: string;
  label: string;
  sortOrder: number;
  voteCount: number;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function statusTone(status: string) {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "CLOSED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.05] text-white/65";
  }
}

function choiceModeLabel(choiceMode: string) {
  return choiceMode === "MULTIPLE" ? "multiple choice" : "single choice";
}

function voteUrl(token: string, optionId: string) {
  return `${getPublicSiteUrl()}/polls/${encodeURIComponent(token)}/vote/${encodeURIComponent(optionId)}`;
}

function pollUrl(token: string) {
  return `${getPublicSiteUrl()}/polls/${encodeURIComponent(token)}`;
}

function buildEmailText(input: {
  poll: PollRow;
  options: OptionRow[];
  recipient: RecipientRow;
}) {
  return [
    `Hi ${input.recipient.contactName || input.recipient.teamName},`,
    "",
    input.poll.title,
    "",
    input.poll.question,
    "",
    input.poll.choiceMode === "MULTIPLE"
      ? "You can choose more than one option. Click any quick option below, or open the full poll to review and tick several options."
      : "Please choose one option.",
    "",
    ...input.options.flatMap((option) => [
      `${option.label}:`,
      voteUrl(input.recipient.token, option.id),
      "",
    ]),
    "Open the full poll here to add a note or change your answer:",
    pollUrl(input.recipient.token),
    "",
    "Thanks,",
    "SIXFL",
  ].join("\n");
}

async function getPoll(id: string) {
  const rows = await prisma.$queryRaw<PollRow[]>(Prisma.sql`
    SELECT "id", "title", "question", "slug", "status", COALESCE("choiceMode", 'SINGLE') AS "choiceMode", "createdAt"
    FROM "SIXFLPoll"
    WHERE "id" = ${id}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function getOptions(pollId: string) {
  return prisma.$queryRaw<OptionRow[]>(Prisma.sql`
    SELECT "id", "label", "sortOrder"
    FROM "SIXFLPollOption"
    WHERE "pollId" = ${pollId}
    ORDER BY "sortOrder" ASC, "label" ASC
  `);
}

async function getRecipients(pollId: string) {
  return prisma.$queryRaw<RecipientRow[]>(Prisma.sql`
    SELECT
      recipient."id",
      recipient."teamName",
      recipient."contactName",
      recipient."contactEmail",
      recipient."contactPhone",
      recipient."token",
      STRING_AGG(option."label", ', ' ORDER BY option."sortOrder", option."label") AS "selectedOptionLabels",
      recipient."note",
      recipient."votedAt",
      recipient."createdAt"
    FROM "SIXFLPollRecipient" recipient
    LEFT JOIN "SIXFLPollRecipientOption" selected ON selected."recipientId" = recipient."id"
    LEFT JOIN "SIXFLPollOption" option ON option."id" = selected."optionId"
    WHERE recipient."pollId" = ${pollId}
    GROUP BY recipient."id"
    ORDER BY recipient."createdAt" ASC, recipient."teamName" ASC
  `);
}

async function getResults(pollId: string) {
  return prisma.$queryRaw<ResultRow[]>(Prisma.sql`
    SELECT
      option."id" AS "optionId",
      option."label",
      option."sortOrder",
      COUNT(DISTINCT selected."recipientId")::int AS "voteCount"
    FROM "SIXFLPollOption" option
    LEFT JOIN "SIXFLPollRecipientOption" selected ON selected."optionId" = option."id"
    WHERE option."pollId" = ${pollId}
    GROUP BY option."id", option."label", option."sortOrder"
    ORDER BY option."sortOrder" ASC, option."label" ASC
  `);
}

export default async function PollDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const notice = getSearchParam(sp.created)
    ? "Poll created."
    : getSearchParam(sp.updated)
      ? "Poll updated."
      : getSearchParam(sp.recipient) === "added"
        ? "Recipient added."
        : getSearchParam(sp.status)
          ? "Poll status updated."
          : null;

  const [poll, options, recipients, results] = await Promise.all([
    getPoll(id),
    getOptions(id),
    getRecipients(id),
    getResults(id),
  ]);

  if (!poll) notFound();

  const totalVotes = recipients.filter((recipient) => recipient.selectedOptionLabels).length;
  const responseRate = recipients.length > 0 ? Math.round((totalVotes / recipients.length) * 100) : 0;
  const isMultiple = poll.choiceMode === "MULTIPLE";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/polls" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to polls
        </Link>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Poll results
          </p>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusTone(poll.status)}`}>
            {poll.status.toLowerCase()}
          </span>
          <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100">
            {choiceModeLabel(poll.choiceMode)}
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              {poll.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              {poll.question}
            </p>
          </div>
          <Link href={`/admin/polls/${poll.id}/edit`} className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07]">
            Edit poll
          </Link>
        </div>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <AdminCard className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Responses</p>
          <p className="mt-3 text-3xl font-semibold text-white">{totalVotes}/{recipients.length}</p>
          <p className="mt-2 text-sm text-emerald-100/75">{responseRate}% response rate.</p>
        </AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Options</p>
          <p className="mt-3 text-3xl font-semibold text-white">{options.length}</p>
          <p className="mt-2 text-sm text-white/60">{isMultiple ? "Teams can choose several options." : "Teams choose one option."}</p>
        </AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Status</p>
          <form action={updatePollStatusAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="pollId" value={poll.id} />
            {["DRAFT", "ACTIVE", "CLOSED"].map((status) => (
              <button key={status} name="status" value={status} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06]">
                {status.toLowerCase()}
              </button>
            ))}
          </form>
        </AdminCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-semibold text-white">Result totals</h2>
          <p className="mt-2 text-sm text-white/55">
            {isMultiple ? "Each tick is counted, so totals may add up to more than the number of teams." : "Each team contributes one vote."}
          </p>
          <div className="mt-5 space-y-3">
            {results.map((result) => {
              const width = totalVotes > 0 ? Math.max(4, Math.round((result.voteCount / totalVotes) * 100)) : 0;
              return (
                <div key={result.optionId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-semibold text-white">{result.label}</span>
                    <span className="text-white/60">{result.voteCount}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </AdminCard>

        <AdminCard className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.04] p-6">
          <h2 className="text-xl font-semibold text-white">Add recipient</h2>
          <p className="mt-2 text-sm text-white/55">Add one team/contact at a time. Each recipient gets their own unique voting links.</p>
          <form action={addPollRecipientAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="pollId" value={poll.id} />
            <label className="space-y-2 text-sm font-semibold text-white">
              Team name
              <input name="teamName" placeholder="Team name" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
            </label>
            <label className="space-y-2 text-sm font-semibold text-white">
              Contact name
              <input name="contactName" placeholder="Contact name" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
            </label>
            <label className="space-y-2 text-sm font-semibold text-white">
              Email
              <input name="contactEmail" type="email" placeholder="captain@example.com" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
            </label>
            <label className="space-y-2 text-sm font-semibold text-white">
              Phone
              <input name="contactPhone" placeholder="Optional" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
                Add recipient
              </button>
            </div>
          </form>
        </AdminCard>
      </section>

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-white">Recipients and votes</h2>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/55">
            {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {recipients.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">No recipients added yet.</div>
          ) : (
            recipients.map((recipient) => (
              <div key={recipient.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-white">{recipient.teamName}</div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${recipient.selectedOptionLabels ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>
                        {recipient.selectedOptionLabels ?? "No vote yet"}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-white/50">
                      {[recipient.contactName, recipient.contactEmail, recipient.contactPhone].filter(Boolean).join(" · ") || "No contact details"}
                    </div>
                    <div className="mt-1 text-xs text-white/35">Added {formatDate(recipient.createdAt)} · Voted {formatDate(recipient.votedAt)}</div>
                    {recipient.note ? <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/70">{recipient.note}</div> : null}
                  </div>

                  <form action={deletePollRecipientAction}>
                    <input type="hidden" name="pollId" value={poll.id} />
                    <input type="hidden" name="recipientId" value={recipient.id} />
                    <button className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/15">
                      Remove
                    </button>
                  </form>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">One-click option links</div>
                    <div className="space-y-2">
                      {options.map((option) => (
                        <div key={option.id} className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/65">
                          <div className="font-semibold text-white">{option.label}</div>
                          <div className="mt-1 break-all text-white/45">{voteUrl(recipient.token, option.id)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <label className="space-y-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                    Email copy
                    <textarea readOnly rows={12} value={buildEmailText({ poll, options, recipient })} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs normal-case tracking-normal text-white/65 outline-none" />
                  </label>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>
    </div>
  );
}
