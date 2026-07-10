// ========================================
// File: src/app/(admin)/admin/polls/[id]/edit/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { updatePollAction } from "../../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Edit Poll | SIXFL Admin",
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
};

type OptionRow = {
  id: string;
  label: string;
  sortOrder: number;
  voteCount: number;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getPoll(id: string) {
  const rows = await prisma.$queryRaw<PollRow[]>(Prisma.sql`
    SELECT "id", "title", "question", "slug", "status", COALESCE("choiceMode", 'SINGLE') AS "choiceMode"
    FROM "SIXFLPoll"
    WHERE "id" = ${id}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function getOptions(pollId: string) {
  return prisma.$queryRaw<OptionRow[]>(Prisma.sql`
    SELECT
      option."id",
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

function statusButtonClass(isActive: boolean) {
  return [
    "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
    isActive
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-50"
      : "border-white/10 bg-black/25 text-white/65 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
  ].join(" ");
}

function modeButtonClass(isActive: boolean) {
  return [
    "rounded-2xl border p-4 text-left text-sm font-semibold transition",
    isActive
      ? "border-sky-400/35 bg-sky-500/15 text-sky-50"
      : "border-white/10 bg-black/25 text-white/65 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
  ].join(" ");
}

export default async function EditPollPage({ params, searchParams }: PageProps) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const error = getSearchParam(sp.error);
  const [poll, options] = await Promise.all([getPoll(id), getOptions(id)]);

  if (!poll) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href={`/admin/polls/${poll.id}`} className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to poll results
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Poll editor
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Edit poll
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Edit the wording, answer type and options. Existing options are renamed rather than deleted so existing votes do not break.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          Add a title and question before saving.
        </div>
      ) : null}

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <form action={updatePollAction} className="space-y-6">
          <input type="hidden" name="pollId" value={poll.id} />

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-white">
              Poll title
              <input
                name="title"
                defaultValue={poll.title}
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40"
              />
            </label>

            <label className="space-y-2 text-sm font-semibold text-white">
              Status
              <div className="grid gap-2 sm:grid-cols-3">
                {["DRAFT", "ACTIVE", "CLOSED"].map((status) => (
                  <label key={status} className={statusButtonClass(poll.status === status)}>
                    <input
                      type="radio"
                      name="status"
                      value={status}
                      defaultChecked={poll.status === status}
                      className="sr-only"
                    />
                    {status.toLowerCase()}
                  </label>
                ))}
              </div>
            </label>
          </div>

          <section className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">Answer type</h2>
            <p className="mt-1 text-sm text-white/55">
              Use multiple choice when a team may be available on more than one night.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={modeButtonClass(poll.choiceMode !== "MULTIPLE")}>
                <input
                  type="radio"
                  name="choiceMode"
                  value="SINGLE"
                  defaultChecked={poll.choiceMode !== "MULTIPLE"}
                  className="sr-only"
                />
                <span className="block text-white">Single choice</span>
                <span className="mt-1 block text-xs font-normal text-white/55">Each team can pick one option only.</span>
              </label>
              <label className={modeButtonClass(poll.choiceMode === "MULTIPLE")}>
                <input
                  type="radio"
                  name="choiceMode"
                  value="MULTIPLE"
                  defaultChecked={poll.choiceMode === "MULTIPLE"}
                  className="sr-only"
                />
                <span className="block text-white">Multiple choice</span>
                <span className="mt-1 block text-xs font-normal text-white/55">Teams can tick several options, such as Monday and Tuesday.</span>
              </label>
            </div>
          </section>

          <label className="space-y-2 text-sm font-semibold text-white">
            Question
            <input
              name="question"
              defaultValue={poll.question}
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40"
            />
          </label>

          <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Existing options</h2>
              <p className="mt-1 text-sm text-white/55">
                Rename options here. Options with existing votes are preserved so results stay linked.
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {options.map((option) => (
                <div key={option.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[minmax(0,1fr)_120px] md:items-center">
                  <input type="hidden" name="optionId" value={option.id} />
                  <label className="space-y-2 text-sm font-semibold text-white">
                    Option text
                    <input
                      name="optionLabel"
                      defaultValue={option.label}
                      className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40"
                    />
                  </label>
                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/60">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Votes</div>
                    <div className="mt-1 text-lg font-semibold text-white">{option.voteCount}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <label className="space-y-2 text-sm font-semibold text-white">
            Add new options — one per line
            <textarea
              name="newOptions"
              rows={5}
              placeholder="Another option\nOne more option"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
              Save poll changes
            </button>
            <Link href={`/admin/polls/${poll.id}`} className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07]">
              Cancel
            </Link>
          </div>
        </form>
      </AdminCard>
    </div>
  );
}
