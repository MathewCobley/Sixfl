"use client";

import { useFormStatus } from "react-dom";

import { resolveFixtureConfirmationIssueAction } from "@/app/(admin)/admin/fixtures/issue-actions";
import { replyToFixtureIssueAction } from "@/app/(admin)/admin/fixtures/issues/actions";

export type NightBoardTeamIssue = {
  id: string;
  fixtureId: string;
  teamId: string;
  note: string | null;
  issueRaisedAt: string | null;
  lastChasedAt: string | null;
  team: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    secondaryContactName: string | null;
    secondaryContactEmail: string | null;
  };
  fixture: {
    id: string;
    leagueId: string;
    kickoffAt: string;
    pitch: string | null;
    league: { name: string; season: string | null };
    homeTeam: { id: string; name: string };
    awayTeam: { id: string; name: string };
  };
  confirmedByUser: { name: string | null; email: string | null } | null;
};

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatStamp(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function ResolveIssueButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:border-sky-300/45 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Resolving issue…" : "Resolve issue"}
    </button>
  );
}

export default function NightBoardTeamIssueCard({
  issue,
  returnTo,
  emailReplyConfigured,
}: {
  issue: NightBoardTeamIssue;
  returnTo: string;
  emailReplyConfigured: boolean;
}) {
  const isHomeTeam = issue.fixture.homeTeam.id === issue.teamId;
  const opponent = isHomeTeam
    ? issue.fixture.awayTeam.name
    : issue.fixture.homeTeam.name;
  const raisedBy =
    issue.confirmedByUser?.name || issue.confirmedByUser?.email || "Captain";
  const raisedByEmail = issue.confirmedByUser?.email?.trim() || null;

  return (
    <div className="rounded-3xl border border-red-400/20 bg-red-500/[0.07] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200/75">
            Issue raised
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">
            {issue.team.name} v {opponent}
          </h3>
          <div className="mt-1 text-xs text-white/50">
            {formatKickoff(issue.fixture.kickoffAt)}
            {issue.fixture.pitch ? ` · ${issue.fixture.pitch}` : ""}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs sm:text-right">
          <div className="font-semibold uppercase tracking-[0.12em] text-white/35">
            Raised by
          </div>
          <div className="mt-1 font-semibold text-white/85">{raisedBy}</div>
          {raisedByEmail && raisedByEmail !== raisedBy ? (
            <div className="mt-0.5 text-white/40">{raisedByEmail}</div>
          ) : null}
          <div className="mt-1 text-white/40">
            {formatStamp(issue.issueRaisedAt) ?? "Time not recorded"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-red-400/20 bg-black/25 px-4 py-3 text-sm leading-6 text-red-50/90">
        {issue.note || "No issue note was supplied."}
      </div>

      <div className="mt-3 text-xs text-white/45">
        Contact: {issue.team.contactName || issue.team.name} ·{" "}
        {issue.team.contactEmail || "No email on team record"}
        {issue.lastChasedAt
          ? ` · Last replied/chased ${formatStamp(issue.lastChasedAt)}`
          : ""}
      </div>

      <form action={replyToFixtureIssueAction} className="mt-4 space-y-3">
        <input type="hidden" name="fixtureId" value={issue.fixtureId} />
        <input type="hidden" name="teamId" value={issue.teamId} />
        <input type="hidden" name="leagueId" value={issue.fixture.leagueId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <textarea
          name="reply"
          rows={4}
          required
          minLength={5}
          placeholder="Write your reply to the team…"
          className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/15"
        />
        <button
          type="submit"
          disabled={!emailReplyConfigured}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send reply to {issue.team.name}
        </button>
        {emailReplyConfigured ? (
          <p className="text-xs leading-5 text-white/45">
            If the team replies to this email, their response comes back into
            SIXFL Messages on the same email conversation.
          </p>
        ) : null}
      </form>

      <div className="mt-4 border-t border-white/10 pt-4">
        <form action={resolveFixtureConfirmationIssueAction} className="space-y-2">
          <input type="hidden" name="fixtureId" value={issue.fixtureId} />
          <input type="hidden" name="teamId" value={issue.teamId} />
          <input type="hidden" name="leagueId" value={issue.fixture.leagueId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <ResolveIssueButton />
          <p className="text-xs leading-5 text-white/45">
            Removes this request from the open issues list and returns the team
            to awaiting confirmation. Resolving it does not send an email.
          </p>
        </form>
      </div>
    </div>
  );
}
