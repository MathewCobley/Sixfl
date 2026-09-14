import { getTeamMoveResponseContext } from "@/lib/teams/move-response";
import { teamMoveConfirmationLabel } from "@/lib/teams/move-confirmation";
import { submitTeamMoveResponseAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team move confirmation | SIXFL",
};

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[#050806] px-4 py-12 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-red-400/20 bg-white/[0.04] p-7 shadow-2xl">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-red-300">SIXFL</div>
        <h1 className="mt-3 text-2xl font-black">Move confirmation link unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-white/65">{message}</p>
        <p className="mt-5 text-sm text-white/45">If you still need to respond, contact SIXFL and we can send a fresh link.</p>
      </div>
    </main>
  );
}

export default async function TeamMoveResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ answer?: string; saved?: string; error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;

  let context: Awaited<ReturnType<typeof getTeamMoveResponseContext>>;
  try {
    context = await getTeamMoveResponseContext(token);
  } catch (error) {
    return (
      <ErrorCard
        message={
          error instanceof Error
            ? error.message
            : "This move confirmation link is invalid or has expired."
        }
      />
    );
  }

  const requestedAnswer = query.answer?.toUpperCase();
  const selectedAnswer =
    requestedAnswer === "YES" || requestedAnswer === "NO"
      ? requestedAnswer
      : context.team.status === "CONFIRMED"
        ? "YES"
        : context.team.status === "DECLINED"
          ? "NO"
          : "";
  const leagueLabel = `${context.league.name}${context.league.season ? ` — ${context.league.season}` : ""}`;
  const saved = query.saved === "1";

  return (
    <main className="min-h-screen bg-[#050806] px-4 py-10 text-white sm:py-16">
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-emerald-400/20 bg-white/[0.045] p-6 shadow-2xl sm:p-8">
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">SIXFL</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Can your team move with the league?</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Please confirm whether <span className="font-bold text-white">{context.team.name}</span> can move with {leagueLabel}.
          </p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            Current response: <span className="font-bold text-white">{teamMoveConfirmationLabel(context.team.status)}</span>
          </div>

          {saved ? (
            <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100">
              Thanks — your team’s response has been saved.
            </div>
          ) : null}

          {query.error ? (
            <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
              {query.error}
            </div>
          ) : null}

          <form action={submitTeamMoveResponseAction} className="mt-6 space-y-3">
            <input type="hidden" name="token" value={token} />

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 transition hover:bg-emerald-500/15">
              <input
                type="radio"
                name="answer"
                value="YES"
                defaultChecked={selectedAnswer === "YES"}
                className="mt-1 h-5 w-5 accent-emerald-500"
              />
              <span>
                <span className="block font-black text-emerald-100">YES — our team can move</span>
                <span className="mt-1 block text-xs leading-5 text-white/55">Record us as confirmed and OK to move.</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/[0.08] p-4 transition hover:bg-red-500/[0.12]">
              <input
                type="radio"
                name="answer"
                value="NO"
                defaultChecked={selectedAnswer === "NO"}
                className="mt-1 h-5 w-5 accent-red-500"
              />
              <span>
                <span className="block font-black text-red-100">NO — our team cannot move</span>
                <span className="mt-1 block text-xs leading-5 text-white/55">Record us as not moving so SIXFL can follow up.</span>
              </span>
            </label>

            <button
              type="submit"
              className="mt-2 flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-500 px-5 text-base font-black text-black transition hover:bg-emerald-400"
            >
              Confirm team response
            </button>
          </form>

          <p className="mt-5 text-xs leading-5 text-white/40">
            This records your team’s response only. It does not itself move your team, change fixtures or create a payment.
          </p>
        </div>
      </div>
    </main>
  );
}
