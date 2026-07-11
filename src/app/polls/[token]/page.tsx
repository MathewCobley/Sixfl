// ========================================
// File: src/app/polls/[token]/page.tsx
// ========================================

import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import TeamBadge from "@/components/admin/TeamBadge";
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
  teamLogoUrl: string | null;
  selectedOptionId: string | null;
  note: string | null;
  votedAt: Date | null;
  pollId: string;
  title: string;
  question: string;
  status: string;
  choiceMode: string;
  allowQuantity: boolean;
};

type OptionRow = {
  id: string;
  label: string;
  sortOrder: number;
};

type SelectedOptionRow = {
  optionId: string;
  quantity: number;
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
      team."logoUrl" AS "teamLogoUrl",
      recipient."selectedOptionId",
      recipient."note",
      recipient."votedAt",
      poll."id" AS "pollId",
      poll."title",
      poll."question",
      poll."status",
      COALESCE(poll."choiceMode", 'SINGLE') AS "choiceMode",
      COALESCE(poll."allowQuantity", false) AS "allowQuantity"
    FROM "SIXFLPollRecipient" recipient
    INNER JOIN "SIXFLPoll" poll ON poll."id" = recipient."pollId"
    LEFT JOIN "Team" team ON team."id" = recipient."sourceId" AND recipient."sourceType" = 'TEAM'
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

async function getSelectedOptions(recipientId: string) {
  return prisma.$queryRaw<SelectedOptionRow[]>(Prisma.sql`
    SELECT "optionId", COALESCE("quantity", 1)::int AS "quantity"
    FROM "SIXFLPollRecipientOption"
    WHERE "recipientId" = ${recipientId}
  `);
}

export default async function PollVotePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const saved = getSearchParam(sp.saved) === "1";
  const error = getSearchParam(sp.error);

  const recipient = await getRecipient(token);
  if (!recipient) notFound();

  const [options, selectedRowsFromJoin] = await Promise.all([
    getOptions(recipient.pollId),
    getSelectedOptions(recipient.recipientId),
  ]);

  const selectedQuantityByOptionId = new Map(
    selectedRowsFromJoin.map((row) => [row.optionId, Math.max(1, row.quantity || 1)]),
  );
  const selectedOptionIds = selectedRowsFromJoin.length > 0
    ? selectedRowsFromJoin.map((row) => row.optionId)
    : recipient.selectedOptionId
      ? [recipient.selectedOptionId]
      : [];
  const selectedOptions = options.filter((option) => selectedOptionIds.includes(option.id));
  const isActive = recipient.status === "ACTIVE";
  const isMultiple = recipient.choiceMode === "MULTIPLE";
  const allowQuantity = recipient.allowQuantity;

  return (
    <main className="min-h-screen bg-[#06120e] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-8">
          {recipient.teamLogoUrl ? (
            <div className="mb-5 flex justify-center">
              <TeamBadge name={recipient.teamName} logoUrl={recipient.teamLogoUrl} size="lg" />
            </div>
          ) : null}
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">SIXFL poll</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">{recipient.title}</h1>
          <p className="mt-4 text-base leading-7 text-white/70">{recipient.question}</p>
          <div className="mt-5 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/70">
            {recipient.teamName}{recipient.contactName ? ` · ${recipient.contactName}` : ""}
          </div>
          <div className="mx-auto mt-3 w-fit rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-100">
            {isMultiple ? "You can choose more than one option" : "Choose one option"}
            {allowQuantity ? " · add quantities where needed" : ""}
          </div>
        </section>

        {saved ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">Thanks — your answer has been recorded.</div> : null}
        {error === "closed" ? <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">This poll is not currently open for voting.</div> : null}
        {error === "invalid" ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">Please choose at least one valid option.</div> : null}

        {selectedOptions.length > 0 ? (
          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
            Current answer:{" "}
            <strong>
              {selectedOptions.map((option) => {
                const quantity = selectedQuantityByOptionId.get(option.id) ?? 1;
                return allowQuantity ? `${option.label} × ${quantity}` : option.label;
              }).join(", ")}
            </strong>.
            {isActive ? " You can change it below while the poll is open." : ""}
          </div>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
          <form action={submitPollVoteAction} className="space-y-6">
            <input type="hidden" name="token" value={recipient.token} />

            <div className="space-y-3">
              {options.map((option) => {
                const checked = selectedOptionIds.includes(option.id);
                const quantity = selectedQuantityByOptionId.get(option.id) ?? 1;
                return (
                  <div key={option.id} className={[
                    "rounded-2xl border p-4 transition",
                    checked ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:bg-white/[0.06]",
                  ].join(" ")}
                  >
                    <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-white/85">
                      <input type={isMultiple ? "checkbox" : "radio"} name="optionId" value={option.id} defaultChecked={checked} disabled={!isActive} required={!isMultiple} />
                      <span>{option.label}</span>
                    </label>

                    {allowQuantity ? (
                      <label className="mt-3 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45 sm:flex-row sm:items-center sm:justify-between">
                        Quantity
                        <input
                          name={`quantity_${option.id}`}
                          type="number"
                          min="1"
                          max="999"
                          step="1"
                          defaultValue={quantity}
                          disabled={!isActive}
                          className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm font-semibold text-white outline-none focus:border-emerald-400/50 disabled:opacity-60 sm:w-32"
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <label className="space-y-2 text-sm font-semibold text-white">
              Optional note
              <textarea name="note" rows={4} defaultValue={recipient.note ?? ""} placeholder={isMultiple ? "For example: Monday and Tuesday work, but Tuesday would need to be after 8pm." : "For example: Thursday works, but only after 8pm."} disabled={!isActive} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50 disabled:opacity-60" />
            </label>

            <button type="submit" disabled={!isActive} className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/45">
              {selectedOptions.length > 0 ? "Update answer" : "Submit answer"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
