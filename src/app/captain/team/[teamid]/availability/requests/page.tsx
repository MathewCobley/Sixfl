import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  closeFixturePlayerRequest,
  getOpenFixturePlayerRequests,
} from "@/lib/fixturePlayerRequests";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Requests | SIXFL",
};

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function closeRequestAction(formData: FormData) {
  "use server";

  const teamId = String(formData.get("teamId") ?? "").trim();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();

  await requireCaptain(teamId);

  if (teamId && requestId) {
    await closeFixturePlayerRequest({
      requestId,
      teamId,
      status: "RESOLVED",
    });
  }

  revalidatePath(`/captain/team/${teamId}/availability`);
  revalidatePath(`/captain/team/${teamId}/availability/requests`);
  redirect(
    `/captain/team/${teamId}/availability/requests${
      fixtureId ? `?fixtureId=${encodeURIComponent(fixtureId)}` : ""
    }`,
  );
}

export default async function CaptainPlayerRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ fixtureId?: string }>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  await requireCaptain(teamid);

  const requests = await getOpenFixturePlayerRequests({
    teamId: teamid,
    fixtureIds: sp.fixtureId ? [sp.fixtureId] : undefined,
  });
  const withdrawalCount = requests.filter(
    (request) => request.type === "WITHDRAWAL",
  ).length;
  const waitlistCount = requests.filter(
    (request) => request.type === "WAITLIST",
  ).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] lg:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/75">
          Matchday decisions
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Player requests
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          Selected players cannot silently change their availability. Withdrawal requests and players waiting for a spare place appear here for you to review before changing the squad or payment records.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-100">
            {withdrawalCount} withdrawal{withdrawalCount === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100">
            {waitlistCount} waiting
          </span>
        </div>
      </section>

      {requests.length === 0 ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/60">
          There are no open withdrawal or waiting-list requests.
        </section>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const isWithdrawal = request.type === "WITHDRAWAL";
            return (
              <section
                key={request.id}
                id={`request-${request.id}`}
                className={`rounded-3xl border p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] ${
                  isWithdrawal
                    ? "border-red-400/25 bg-red-500/[0.07]"
                    : "border-sky-400/25 bg-sky-500/[0.07]"
                }`}
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-white">
                        {request.playerName}
                      </h2>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          isWithdrawal
                            ? "border-red-400/30 bg-red-500/15 text-red-100"
                            : "border-sky-400/30 bg-sky-500/15 text-sky-100"
                        }`}
                      >
                        {isWithdrawal ? "Cannot play" : "Waiting list"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/45">
                      {request.playerEmail ?? "No email saved"}
                    </p>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="font-semibold text-white">
                        {request.homeTeamName} vs {request.awayTeamName}
                      </div>
                      <div className="mt-1 text-sm text-white/55">
                        {formatDateTime(request.kickoffAt)}
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/75">
                      {isWithdrawal
                        ? request.reason || "The player says they can no longer play."
                        : "The player is available if a place becomes free."}
                    </p>
                    <p className="mt-2 text-xs text-white/40">
                      Requested {formatDateTime(request.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:w-64 lg:flex-col">
                    <Link
                      href={`/captain/team/${teamid}/match-fees?fixtureId=${encodeURIComponent(request.fixtureId)}`}
                      className={`inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                        isWithdrawal
                          ? "border-red-400/30 bg-red-500/15 text-red-50 hover:bg-red-500/20"
                          : "border-sky-400/30 bg-sky-500/15 text-sky-50 hover:bg-sky-500/20"
                      }`}
                    >
                      Open Matchday Squad
                    </Link>
                    <form action={closeRequestAction}>
                      <input type="hidden" name="teamId" value={teamid} />
                      <input type="hidden" name="requestId" value={request.id} />
                      <input
                        type="hidden"
                        name="fixtureId"
                        value={sp.fixtureId ?? ""}
                      />
                      <button
                        type="submit"
                        className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        Mark handled
                      </button>
                    </form>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
