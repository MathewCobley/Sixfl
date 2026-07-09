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

async function getPolls() {
  return prisma.$queryRaw<PollListRow[]>(Prisma.sql`
    SELECT
      poll."id",
      poll."title",
      poll."question",
      poll."slug",
      poll."status",
      poll."createdAt",
      COUNT(DISTINCT option."id")::int AS "optionCount",
      COUNT(DISTINCT recipient."id")::int AS "recipientCount",
      COUNT(DISTINCT recipient."id") FILTER (WHERE recipient."selectedOptionId" IS NOT NULL)::int AS "voteCount"
    FROM "SIXFLPoll" poll
    LEFT JOIN "SIXFLPollOption" option ON option."pollId" = poll."id"
    LEFT JOIN "SIXFLPollRecipient" recipient ON recipient."pollId" = poll."id"
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
              placeholder="Which night would your team prefer?"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-white lg:col-span-2">
            Answer options — one per line
            <textarea
              name="options"
              rows={7}
              defaultValue={["Wednesday only", "Thursday only", "Either Wednesday or Thursday", "Prefer Wednesday but could do Thursday", "Prefer Thursday but could do Wednesday", "Need to check with squad"].join("\n")}
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
                  </div>
                  <p className="mt-1 text-sm text-white/55">{poll.question}</p>
                  <p className="mt-2 text-xs text-white/35">
                    Created {formatDate(poll.createdAt)} · {poll.optionCount} options · {poll.voteCount}/{poll.recipientCount} responses
                  </p>
                </div>
                <Link href={`/admin/polls/${poll.id}`} className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15">
                  Open results
                </Link>
              </div>
            ))
          )}
        </div>
      </AdminCard>
    </div>
  );
}
