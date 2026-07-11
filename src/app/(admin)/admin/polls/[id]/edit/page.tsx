// ========================================
// File: src/app/(admin)/admin/polls/[id]/edit/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { updatePollAction, updatePollStatusAction } from "../../actions";

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
  buttonText: string | null;
  allowQuantity: boolean;
};

type OptionRow = {
  id: string;
  label: string;
  sortOrder: number;
  voteCount: number;
};

const POLL_STATUSES = [
  { value: "DRAFT", label: "Draft", helper: "Hidden from teams" },
  { value: "ACTIVE", label: "Active", helper: "Teams can vote" },
  { value: "CLOSED", label: "Closed", helper: "Voting disabled" },
] as const;

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getPoll(id: string) {
  const rows = await prisma.$queryRaw<PollRow[]>(Prisma.sql`
    SELECT
      "id",
      "title",
      "question",
      "slug",
      "status",
      COALESCE("choiceMode", 'SINGLE') AS "choiceMode",
      COALESCE("buttonText", 'Open poll') AS "buttonText",
      COALESCE("allowQuantity", false) AS "allowQuantity"
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

function statusPillClass(status: string) {
  if (status === "ACTIVE") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  if (status === "CLOSED") return "border-red-400/30 bg-red-500/10 text-red-100";
  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
}

const radioCardClass = [
  "block h-full cursor-pointer rounded-2xl border p-4 text-left text-sm font-semibold transition",
  "border-white/10 bg-black/25 text-white/65 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
  "peer-checked:border-emerald-400/40 peer-checked:bg-emerald-500/15 peer-checked:text-emerald-50",
  "peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400/30",
].join(" ");

const modeRadioCardClass = [
  "block h-full cursor-pointer rounded-2xl border p-4 text-left text-sm font-semibold transition",
  "border-white/10 bg-black/25 text-white/65 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
  "peer-checked:border-sky-400/35 peer-checked:bg-sky-500/15 peer-checked:text-sky-50",
  "peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400/30",
].join(" ");

const quantityRadioCardClass = [
  "block h-full cursor-pointer rounded-2xl border p-4 text-left text-sm font-semibold transition",
  "border-white/10 bg-black/25 text-white/65 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
  "peer-checked:border-emerald-400/35 peer-checked:bg-emerald-500/15 peer-checked:text-emerald-50",
  "peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400/30",
].join(" ");

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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Edit poll
          </h1>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusPillClass(poll.status)}`}>
            {poll.status.toLowerCase()}
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Edit the wording, answer type, email button text and options. Existing options are renamed rather than deleted so existing votes do not break.
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
              <input name="title" defaultValue={poll.title} className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
            </label>

            <fieldset className="space-y-2 text-sm font-semibold text-white">
              <legend>Status</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {POLL_STATUSES.map((status) => (
                  <label key={status.value}>
                    <input type="radio" name="status" value={status.value} defaultChecked={poll.status === status.value} className="peer sr-only" />
                    <span className={radioCardClass}>
                      <span className="block text-white">{status.label}</span>
                      <span className="mt-1 block text-xs font-normal text-white/55">{status.helper}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs font-normal text-white/45">Choose Closed and save to stop teams submitting more votes.</p>
            </fieldset>
          </div>

          <section className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">Answer type</h2>
            <p className="mt-1 text-sm text-white/55">Use multiple choice when a team may be available on more than one night.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <input type="radio" name="choiceMode" value="SINGLE" defaultChecked={poll.choiceMode !== "MULTIPLE"} className="peer sr-only" />
                <span className={modeRadioCardClass}>
                  <span className="block text-white">Single choice</span>
                  <span className="mt-1 block text-xs font-normal text-white/55">Each team can pick one option only.</span>
                </span>
              </label>
              <label>
                <input type="radio" name="choiceMode" value="MULTIPLE" defaultChecked={poll.choiceMode === "MULTIPLE"} className="peer sr-only" />
                <span className={modeRadioCardClass}>
                  <span className="block text-white">Multiple choice</span>
                  <span className="mt-1 block text-xs font-normal text-white/55">Teams can tick several options, such as Monday and Tuesday.</span>
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">Option quantities</h2>
            <p className="mt-1 text-sm text-white/55">Turn this on when teams should be able to enter a number beside each selected option.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <input type="radio" name="allowQuantity" value="false" defaultChecked={!poll.allowQuantity} className="peer sr-only" />
                <span className={quantityRadioCardClass}>
                  <span className="block text-white">No quantities</span>
                  <span className="mt-1 block text-xs font-normal text-white/55">A selected option counts as one response.</span>
                </span>
              </label>
              <label>
                <input type="radio" name="allowQuantity" value="true" defaultChecked={poll.allowQuantity} className="peer sr-only" />
                <span className={quantityRadioCardClass}>
                  <span className="block text-white">Allow quantities</span>
                  <span className="mt-1 block text-xs font-normal text-white/55">Voters can enter quantities beside selected options.</span>
                </span>
              </label>
            </div>
          </section>

          <label className="space-y-2 text-sm font-semibold text-white">
            Question
            <input name="question" defaultValue={poll.question} className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
          </label>

          <label className="space-y-2 text-sm font-semibold text-white">
            Email button text
            <input name="buttonText" defaultValue={poll.buttonText ?? "Open poll"} placeholder="Choose your nights" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
            <span className="block text-xs font-normal text-white/45">This is the single button shown in team emails when you use {'{{pollOptions}}'}.</span>
          </label>

          <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Existing options</h2>
              <p className="mt-1 text-sm text-white/55">Rename options here. Options with existing votes are preserved so results stay linked.</p>
            </div>

            <div className="mt-5 space-y-3">
              {options.map((option) => (
                <div key={option.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[minmax(0,1fr)_120px] md:items-center">
                  <input type="hidden" name="optionId" value={option.id} />
                  <label className="space-y-2 text-sm font-semibold text-white">
                    Option text
                    <input name="optionLabel" defaultValue={option.label} className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
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
            <textarea name="newOptions" rows={5} placeholder={"Another option\nOne more option"} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40" />
          </label>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">Save poll changes</button>
            <button type="submit" formAction={updatePollStatusAction} name="status" value="CLOSED" className="inline-flex h-12 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/10 px-6 text-sm font-semibold text-red-100 transition hover:bg-red-500/15">Close poll now</button>
            <Link href={`/admin/polls/${poll.id}`} className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 text-sm font-semibold text-white/75 transition hover:bg-white/[0.07]">Cancel</Link>
          </div>
        </form>
      </AdminCard>
    </div>
  );
}
