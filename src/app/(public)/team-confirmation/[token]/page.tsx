// ========================================
// File: src/app/(public)/team-confirmation/[token]/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  confirmTeamPlaceFromLead,
  declineTeamPlaceFromLead,
  getTeamPlaceConfirmationStatus,
  verifyTeamPlaceConfirmationToken,
} from "@/lib/leads/teamPlaceConfirmation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Confirm Team Place | SIXFL",
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ confirmed?: string; declined?: string }>;
};

function getLeadTitle(input: { teamName: string | null; contactName: string }) {
  return input.teamName?.trim() || `${input.contactName}'s team`;
}

async function confirmTeamPlaceAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();
  const leadId = verifyTeamPlaceConfirmationToken(token);

  if (!leadId) {
    throw new Error("This confirmation link is not valid.");
  }

  await confirmTeamPlaceFromLead(leadId);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  redirect(`/team-confirmation/${encodeURIComponent(token)}?confirmed=1`);
}

async function declineTeamPlaceAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();
  const leadId = verifyTeamPlaceConfirmationToken(token);

  if (!leadId) {
    throw new Error("This confirmation link is not valid.");
  }

  await declineTeamPlaceFromLead(leadId);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  redirect(`/team-confirmation/${encodeURIComponent(token)}?declined=1`);
}

function InvalidLinkCard() {
  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <section className="mx-auto max-w-2xl rounded-3xl border border-red-400/20 bg-red-500/10 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200/80">
          Team place confirmation
        </p>
        <h1 className="mt-3 text-2xl font-semibold">This confirmation link is not valid</h1>
        <p className="mt-3 text-sm leading-6 text-red-100/80">
          Please reply to SIXFL and we’ll send you a fresh confirmation link.
        </p>
      </section>
    </main>
  );
}

export default async function TeamConfirmationPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const leadId = verifyTeamPlaceConfirmationToken(token);

  if (!leadId) return <InvalidLinkCard />;

  const [lead, confirmation] = await Promise.all([
    prisma.interestLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        contactName: true,
        teamName: true,
        area: true,
        leagueType: true,
        status: true,
      },
    }),
    getTeamPlaceConfirmationStatus(leadId),
  ]);

  if (!lead) return <InvalidLinkCard />;

  const isConfirmed = sp.confirmed === "1" || confirmation?.status === "CONFIRMED" || lead.status === "QUALIFIED";
  const isDeclined = sp.declined === "1" || confirmation?.status === "DECLINED" || lead.status === "CLOSED";
  const leadTitle = getLeadTitle(lead);

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            SIXFL team confirmation
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {isConfirmed ? "Your team place is confirmed" : isDeclined ? "Your place has been released" : "Confirm your team place"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            {isConfirmed
              ? `Thanks — ${leadTitle} is confirmed for fixture planning.`
              : isDeclined
                ? `Thanks for letting us know. We’ll release the space for another team.`
                : `Please confirm whether ${leadTitle} would like a place in the SIXFL league starting Tuesday 8 July.`}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
              Tuesday 8 July start
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
              40 minute matches
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
              £40 per team per match
            </span>
            {lead.area ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {lead.area}
              </span>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          {isConfirmed ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100/85">
              Confirmed. SIXFL will now include your team in the planning list and send the next steps.
            </div>
          ) : isDeclined ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/85">
              No problem. Your team will not be included in fixture planning unless you contact SIXFL again.
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">{leadTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  We will not create fixtures for your team until the place is confirmed.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <form action={confirmTeamPlaceAction}>
                  <input type="hidden" name="token" value={token} />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(16,185,129,0.24)] transition hover:bg-emerald-500 sm:w-auto"
                  >
                    Yes, confirm our team place
                  </button>
                </form>

                <form action={declineTeamPlaceAction}>
                  <input type="hidden" name="token" value={token} />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] sm:w-auto"
                  >
                    No, release our place
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
