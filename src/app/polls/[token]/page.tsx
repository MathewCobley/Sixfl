// ========================================
// File: src/app/polls/[token]/page.tsx
// ========================================

import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { submitPollVoteAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "SIXFL Poll",
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PollRecipientRow = {
  recipientId: string;
  token: string;
  teamName: string;
  contactName: string | null;
  selectedOptionId: string | null;
  note: string | null;
  votedAt: Date | null;
  pollId: string;
  title: string;
  question: string;
  status: string;
};

type OptionRow = {
  id: string;
  label: string;
  sortOrder: number;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getRecipient(token: string) {
  const rows = await prisma.$queryRaw<PollRecipientRow[]>(Prisma.sql`
    SELECT
      recipient."id" AS "recipientId",
      recipient."token",
      recipient."teamName",
      recipient."contactName",
      recipient."selectedOptionId",
      recipient."note",
      recipient."votedAt",
      poll."id" AS "pollId",
      poll."title",
      poll."question",
      poll."status"
    FROM "SIXFLPollRecipient" recipient
    INNER JOIN "SIXFLPoll" poll ON poll."id" = recipient."pollId"
    WHERE recipient."token" = ${token}
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

export default async function PollVotePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const saved = getSearchParam(sp.saved) === "1";
  const error = getSearchParam(sp.error);

  const recipient = await getRecipient(token);
  if (!recipient) notFound();

  const options = await getOptions(recipient.pollId);
  const selectedOption = options.find((option) => option.id === recipient.selectedOptionId) ?? null;
  const isActive = recipient.status === "ACTIVE";

  return (
    <main className="min-h-screen bg-[#06120e] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            SIXFL poll
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">
            {recipient.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-white/70">
            {recipient.question}
          </p>
          <div className="mt-5 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/70">
            {recipient.teamName}{recipient.contactName ? ` · ${recipient.contactName}` : ""}
          </div>
        </section>

        {saved ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Thanks — your vote has been recorded.
          </div>
        ) : null}

        {error === "closed" ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            This poll is not currently open for voting.
          </div>
        ) : null}

        {selectedOption ? (
          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
            Current answer: <strong>{selectedOption.label}</strong>. You can change it below while the poll is open.
          </div>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
          <form action={submitPollVoteAction} className="space-y-6">
            <input type="hidden" name="token" value={recipient.token} />

            <div className="space-y-3">
              {options.map((option) => (
                <label
                  key={option.id}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition",
                    recipient.selectedOptionId === option.id
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                      : "border-white/10 bg-black/20 text-white/75 hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="optionId"
                    value={option.id}
                    defaultChecked={recipient.selectedOptionId === option.id}
                    disabled={!isActive}
                    required
                  />
                  {option.label}
                </label>
              ))}
            </div>

            <label className="space-y-2 text-sm font-semibold text-white">
              Optional note
              <textarea
                name="note"
                rows={4}
                defaultValue={recipient.note ?? ""}
                placeholder="For example: Thursday works, but only after 8pm."
                disabled={!isActive}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50 disabled:opacity-60"
              />
            </label>

            <button
              type="submit"
              disabled={!isActive}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/45"
            >
              {selectedOption ? "Update vote" : "Submit vote"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
