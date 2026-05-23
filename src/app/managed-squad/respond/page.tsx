// ========================================
// File: src/app/managed-squad/respond/page.tsx
// ========================================

import Link from "next/link";
import { findManagedSquadInviteByToken } from "@/lib/managed-squads/invitations";
import { submitManagedSquadResponseAction } from "./actions";

type Props = {
  searchParams?: Promise<{
    token?: string;
    answer?: string;
    submitted?: string;
    error?: string;
  }>;
};

function getMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getAnswer(value?: string): "yes" | "no" {
  return value?.toLowerCase() === "no" ? "no" : "yes";
}

export default async function ManagedSquadRespondPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const token = sp.token?.trim() || "";
  const answer = getAnswer(sp.answer);
  const submitted = sp.submitted === "1";
  const invite = token ? await findManagedSquadInviteByToken(token) : null;

  const teamName = invite
    ? getMetadataString(invite.metadata, "teamName") ?? "SIXFL managed team"
    : "SIXFL managed team";
  const contactName = invite?.recipient.displayName?.trim() || "there";
  const firstName = contactName.split(/\s+/)[0] || "there";
  const existingResponse = invite
    ? getMetadataString(invite.metadata, "response")
    : null;

  if (submitted) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-8">
          <div className="text-sm text-emerald-300">Response saved</div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Thanks, we’ve got that.
          </h1>
          <p className="mt-4 text-sm leading-6 text-white/65">
            {sp.answer === "no"
              ? "No problem — we’ve marked that this Tuesday managed team is not for you at the moment."
              : "Thanks for confirming you’re interested. SIXFL will use this to build the managed squad and will follow up with the next steps."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Back to SIXFL
          </Link>
        </div>
      </main>
    );
  }

  if (!token || sp.error || !invite) {
    return (
      <main className="min-h-screen bg-black px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-400/20 bg-red-500/10 p-6 md:p-8">
          <div className="text-sm text-red-200">Invite unavailable</div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            We couldn’t find this managed squad invite.
          </h1>
          <p className="mt-4 text-sm leading-6 text-red-50/80">
            The link may be incomplete or out of date. Please reply to the email
            you received and we’ll check it manually.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-8">
          <div className="text-sm text-emerald-300">SIXFL managed squad</div>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            {answer === "no" ? "No problem — thanks for letting us know" : "Can you play Tuesday nights?"}
          </h1>
          <p className="mt-4 text-sm leading-6 text-white/65">
            Hi {firstName}, this is for <span className="font-semibold text-white">{teamName}</span>.
            {answer === "yes"
              ? " Please confirm a few quick details so we know whether to include you in the managed squad."
              : " Submit below and we’ll mark you as not interested for this managed team."}
          </p>

          {existingResponse ? (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              We already have a response recorded for this invite. Submitting
              again will update the response.
            </div>
          ) : null}

          <form action={submitManagedSquadResponseAction} className="mt-6 space-y-5">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="answer" value={answer} />

            {answer === "yes" ? (
              <>
                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/80">
                  <input
                    type="checkbox"
                    name="canDoSomeTuesdays"
                    defaultChecked
                    className="mt-1"
                  />
                  <span>
                    I can commit to being available on at least some Tuesday
                    nights and will be reliable when selected.
                  </span>
                </label>

                <div className="space-y-2">
                  <label
                    htmlFor="preferredPosition"
                    className="text-sm font-medium text-white/70"
                  >
                    Preferred position
                  </label>
                  <input
                    id="preferredPosition"
                    name="preferredPosition"
                    type="text"
                    placeholder="For example: defender, midfield, striker, goalkeeper"
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-white/70">
                    Mobile number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={invite.recipient.phone ?? ""}
                    placeholder="Best number for team updates"
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium text-white/70">
                Anything else we should know?
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={4}
                placeholder="Availability, experience, transport, or any questions."
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
              />
            </div>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 sm:w-auto"
            >
              {answer === "no" ? "Submit response" : "Confirm I’m interested"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
