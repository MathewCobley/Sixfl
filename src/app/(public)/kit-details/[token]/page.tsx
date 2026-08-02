import { notFound } from "next/navigation";

import {
  TEAM_KIT_SIZE_OPTIONS,
  getTeamKitSizeLabel,
} from "@/lib/kits/constants";
import {
  getPublicKitAssignment,
  markKitAssignmentOpened,
} from "@/lib/kits/player-assignments";
import { completeKitDetailsAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Complete Kit Details | SIXFL",
};

type SearchParams = {
  completed?: string;
  error?: string;
};

function errorMessage(code: string | undefined) {
  switch (code) {
    case "invalid_number":
      return "Choose a shirt number from 1 to 99.";
    case "invalid_size":
      return "Choose your kit size.";
    case "number_taken":
      return "That shirt number has already been chosen by another player. Please choose a different number.";
    case "order_locked":
      return "The team kit order has already been submitted, so these details can no longer be changed.";
    case "not_found":
      return "This kit link is no longer valid.";
    case "save_failed":
      return "Your details could not be saved. Please check them and try again.";
    default:
      return null;
  }
}

export default async function PlayerKitDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const assignment = await getPublicKitAssignment(token);

  if (!assignment) notFound();

  await markKitAssignmentOpened(token);

  const locked = Boolean(
    assignment.orderStatus && assignment.orderStatus !== "DRAFT",
  );
  const error = errorMessage(sp.error);
  const completed = sp.completed === "1";

  return (
    <main className="min-h-screen bg-[#06110d] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.2),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            SIXFL team kit
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Complete your kit details
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
            {assignment.teamName} has assigned kit {assignment.position} to {assignment.playerName}.
            Choose the shirt details you want included in the team order.
          </p>
        </section>

        {completed ? (
          <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-6 text-emerald-50">
            <h2 className="text-xl font-semibold">Your kit details have been saved</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-100/75">
              Your captain can now see that you have completed the form. You may use this link again to correct the details until the team submits the order.
            </p>
          </section>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {locked ? (
          <section className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-6">
            <h2 className="text-xl font-semibold">The team order has been submitted</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              These details are now locked. Ask your captain to contact SIXFL if anything needs changing.
            </p>
            {assignment.completedAt ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">Name</div>
                  <div className="mt-2 font-semibold">{assignment.backName || "Number only"}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">Number</div>
                  <div className="mt-2 font-semibold">{assignment.shirtNumber}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">Size</div>
                  <div className="mt-2 font-semibold">
                    {assignment.kitSize ? getTeamKitSizeLabel(assignment.kitSize) : "Not selected"}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <form
            action={completeKitDetailsAction}
            className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:p-8"
          >
            <input type="hidden" name="token" value={token} />

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="block text-sm font-medium text-white/75">Name on the back</span>
                <input
                  type="text"
                  name="backName"
                  maxLength={18}
                  defaultValue={assignment.backName ?? ""}
                  placeholder="Leave blank for number only"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0d1428] px-4 text-sm uppercase text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15"
                />
                <span className="block text-xs text-white/40">
                  This will be printed in capital letters. Leave it blank when you only want a number.
                </span>
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-white/75">Shirt number</span>
                <input
                  type="number"
                  name="shirtNumber"
                  min={1}
                  max={99}
                  required
                  defaultValue={assignment.shirtNumber ?? ""}
                  placeholder="1–99"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15"
                />
                <span className="block text-xs text-white/40">
                  The system will tell you if another player has already chosen it.
                </span>
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-white/75">Kit size</span>
                <select
                  name="kitSize"
                  required
                  defaultValue={assignment.kitSize ?? ""}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15"
                >
                  <option value="" disabled>Choose your size</option>
                  {TEAM_KIT_SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4 text-sm leading-6 text-white/60">
              Socks are included automatically in the standard size. Your captain will see when this form is completed and the details will be added to kit {assignment.position}.
            </div>

            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-black text-black transition hover:bg-emerald-300 sm:w-auto"
            >
              Save my kit details
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
