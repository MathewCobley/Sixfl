// ========================================
// File: src/app/(admin)/admin/polls/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { createPollAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Polls | SIXFL Admin",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PollListRow = {
  id: string;
  title: string;
  question: string;
  slug: string;
  status: string;
  choiceMode: string;
  createdAt: Date;
  optionCount: number;
  recipientCount: number;
  voteCount: number;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: Date) {
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

async function getPolls() {
  return prisma.$queryRaw<PollListRow[]>(Prisma.sql`
    SELECT
      poll."id",
      poll."title",
      poll."question",
      poll."slug",
      poll."status",
      COALESCE(poll."choiceMode", 'SINGLE') AS "choiceMode",
      poll."createdAt",
      COUNT(DISTINCT option."id")::int AS "optionCount",
      COUNT(DISTINCT recipient."id")::int AS "recipientCount",
      COUNT(DISTINCT recipient."id") FILTER (
        WHERE recipient."selectedOptionId" IS NOT NULL
           OR selected."recipientId" IS NOT NULL
      )::int AS "voteCount"
    FROM "SIXFLPoll" poll
    LEFT JOIN "SIXFLPollOption" option ON option."pollId" = poll."id"
    LEFT JOIN "SIXFLPollRecipient" recipient ON recipient."pollId" = poll."id"
    LEFT JOIN "SIXFLPollRecipientOption" selected ON selected."recipientId" = recipient."id"
    GROUP BY poll."id"
    ORDER BY poll."createdAt" DESC
  `);
}

export default async function PollsAdminPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const error = getSearchParam(params.error);
  const polls = await getPolls();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Comms & recruitment
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Polls
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Create quick team polls with one-click voting links. Use them for league nights, kick-off preferences, venue choices and cup interest.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error === "invalid_poll"
            ? "Add a title, question and at least two answer options."
            : "Something was missing. Please try again."}
        </div>
      ) : null}

      <AdminCard className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.04] p-6">
        <h2 className="text-xl font-semibold text-white">Create poll</h2>
        <form action={createPollAction} className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <label className="space-y-2 text-sm font-semibold text-white">
            Poll title
            <input
              name="title"
              placeholder="Northallerton league night preference"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-white">
            Question
            <input
              name="question"
              placeholder="Which nights can your team play?"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 lg:col-span-2">
            <div className="text-sm font-semibold text-white">Answer type</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                <input type="radio" name="choiceMode" value="SINGLE" defaultChecked className="mr-2" />
                Single choice — teams pick one option.
              </label>
              <label className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-50/85">
                <input type="radio" name="choiceMode" value="MULTIPLE" className="mr-2" />
                Multiple choice — teams can tick Monday and Tuesday, etc.
              </label>
            </div>
          </div>

          <label className="space-y-2 text-sm font-semibold text-white lg:col-span-2">
            Answer options — one per line
            <textarea
              name="options"
              rows={7}
              defaultValue={["Monday", "Tuesday", "Wednesday", "Thursday", "Need to check with squad"].join("\n")}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>

          <div className="lg:col-span-2">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
              Create poll
            </button>
          </div>
        </form>
      </AdminCard>

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-white">Existing polls</h2>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/55">
            {polls.length} poll{polls.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-5 divide-y divide-white/10">
          {polls.length === 0 ? (
            <div className="py-10 text-sm text-white/55">No polls created yet.</div>
          ) : (
            polls.map((poll) => (
              <div key={poll.id} className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/polls/${poll.id}`} className="text-lg font-semibold text-white underline-offset-4 hover:text-emerald-200 hover:underline">
                      {poll.title}
                    </Link>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusTone(poll.status)}`}>
                      {poll.status.toLowerCase()}
                    </span>
                    <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100">
                      {choiceModeLabel(poll.choiceMode)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/55">{poll.question}</p>
                  <p className="mt-2 text-xs text-white/35">
                    Created {formatDate(poll.createdAt)} · {poll.optionCount} options · {poll.voteCount}/{poll.recipientCount} responses
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/polls/${poll.id}/edit`} className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07]">
                    Edit
                  </Link>
                  <Link href={`/admin/polls/${poll.id}`} className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15">
                    Open results
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>
    </div>
  );
}
