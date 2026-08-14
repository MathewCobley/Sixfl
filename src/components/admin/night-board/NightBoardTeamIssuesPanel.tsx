// ========================================
// File: src/components/admin/night-board/NightBoardTeamIssuesPanel.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { replyToFixtureIssueAction } from "@/app/(admin)/admin/fixtures/issues/actions";

type TeamIssue = {
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

type IssuesResponse = {
  selectedDate: string;
  emailReplyConfigured: boolean;
  issues: TeamIssue[];
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

function getNoticeMessage(notice: string, teamName: string) {
  switch (notice) {
    case "reply_queued":
      return `Reply queued for ${teamName || "the team"}.`;
    case "reply_skipped":
      return `Reply saved, but an email could not be queued for ${teamName || "the team"}. Check the team contact email and notification settings.`;
    case "reply_too_short":
      return "Please enter a longer reply.";
    case "issue_not_found":
      return "That issue could not be found or is no longer open.";
    case "missing_issue":
      return "The fixture issue details were missing.";
    case "reply_error":
      return `Something went wrong while replying to ${teamName || "the team"}.`;
    default:
      return "";
  }
}

export default function NightBoardTeamIssuesPanel() {
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();
  const searchKey = rawSearchParams.toString();
  const parsedSearchParams = useMemo(() => new URLSearchParams(searchKey), [searchKey]);
  const [data, setData] = useState<IssuesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const returnTo = useMemo(() => {
    const clean = new URLSearchParams(searchKey);
    clean.delete("issueReply");
    clean.delete("issueTeam");
    const query = clean.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }, [pathname, searchKey]);

  const notice = parsedSearchParams.get("issueReply") ?? "";
  const noticeTeam = parsedSearchParams.get("issueTeam") ?? "";
  const noticeMessage = getNoticeMessage(notice, noticeTeam);

  useEffect(() => {
    if (pathname !== "/admin/night-board") return;

    const controller = new AbortController();
    const current = new URLSearchParams(searchKey);
    const query = new URLSearchParams();
    const date = current.get("date");
    const leagueId = current.get("leagueId");
    const venueId = current.get("venueId");
    if (date) query.set("date", date);
    if (leagueId) query.set("leagueId", leagueId);
    if (venueId) query.set("venueId", venueId);

    setLoading(true);
    setError("");

    void fetch(`/api/admin/night-board/team-issues?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as IssuesResponse | { error?: string } | null;
        if (!response.ok || !payload || !("issues" in payload)) {
          throw new Error((payload && "error" in payload && payload.error) || "Team-raised fixture issues could not be loaded.");
        }
        return payload;
      })
      .then((payload) => {
        setData(payload);
        if (noticeMessage) setOpen(true);
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "Team-raised fixture issues could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [pathname, searchKey, noticeMessage]);

  if (pathname !== "/admin/night-board") return null;

  const issueCount = data?.issues.length ?? 0;
  const hasIssues = issueCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "fixed bottom-5 right-5 z-[80] inline-flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur transition sm:bottom-6 sm:right-6",
          hasIssues
            ? "border-red-400/40 bg-red-500/90 text-white hover:bg-red-400"
            : "border-white/15 bg-[#111827]/95 text-white/85 hover:bg-[#182235]",
        ].join(" ")}
        aria-label={`Open team-raised fixture issues${hasIssues ? ` (${issueCount})` : ""}`}
      >
        <span>{loading ? "Checking team issues…" : "Team fixture issues"}</span>
        <span
          className={[
            "inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-black",
            hasIssues ? "border-white/25 bg-black/20 text-white" : "border-white/10 bg-black/20 text-white/60",
          ].join(" ")}
        >
          {loading ? "…" : issueCount}
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Team-raised fixture issues">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close team issues" onClick={() => setOpen(false)} />

          <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-[#0b0f14] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-300/80">Night Board</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Team-raised fixture issues</h2>
                <p className="mt-1 text-sm text-white/50">
                  {data?.selectedDate ?? "Selected night"} · {issueCount} open issue{issueCount === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xl text-white/70 hover:bg-white/[0.08]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {noticeMessage ? (
                <div
                  className={[
                    "mb-4 rounded-2xl border px-4 py-3 text-sm",
                    notice === "reply_queued"
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                      : "border-amber-400/25 bg-amber-500/10 text-amber-100",
                  ].join(" ")}
                >
                  {noticeMessage}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
              ) : null}

              {!loading && !error && !data?.emailReplyConfigured ? (
                <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Reply-by-email is not configured. Add EMAIL_REPLY_DOMAIN in Railway before sending replies.
                </div>
              ) : null}

              {loading ? <div className="py-10 text-center text-sm text-white/50">Loading team issues…</div> : null}

              {!loading && !error && issueCount === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
                  <div className="text-lg font-semibold text-white">No team-raised issues on this night</div>
                  <p className="mt-2 text-sm leading-6 text-white/50">Any captain request or problem raised against a fixture will appear here.</p>
                </div>
              ) : null}

              <div className="space-y-4">
                {data?.issues.map((issue) => {
                  const isHomeTeam = issue.fixture.homeTeam.id === issue.teamId;
                  const opponent = isHomeTeam ? issue.fixture.awayTeam.name : issue.fixture.homeTeam.name;
                  const raisedBy = issue.confirmedByUser?.name || issue.confirmedByUser?.email || "Captain";
                  const raisedByEmail = issue.confirmedByUser?.email?.trim() || null;

                  return (
                    <div key={issue.id} className="rounded-3xl border border-red-400/20 bg-red-500/[0.07] p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200/75">Issue raised</div>
                          <h3 className="mt-2 text-lg font-semibold text-white">{issue.team.name} v {opponent}</h3>
                          <div className="mt-1 text-xs text-white/50">
                            {formatKickoff(issue.fixture.kickoffAt)}{issue.fixture.pitch ? ` · ${issue.fixture.pitch}` : ""}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs sm:text-right">
                          <div className="font-semibold uppercase tracking-[0.12em] text-white/35">Raised by</div>
                          <div className="mt-1 font-semibold text-white/85">{raisedBy}</div>
                          {raisedByEmail && raisedByEmail !== raisedBy ? (
                            <div className="mt-0.5 text-white/40">{raisedByEmail}</div>
                          ) : null}
                          <div className="mt-1 text-white/40">{formatStamp(issue.issueRaisedAt) ?? "Time not recorded"}</div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-red-400/20 bg-black/25 px-4 py-3 text-sm leading-6 text-red-50/90">
                        {issue.note || "No issue note was supplied."}
                      </div>

                      <div className="mt-3 text-xs text-white/45">
                        Contact: {issue.team.contactName || issue.team.name} · {issue.team.contactEmail || "No email on team record"}
                        {issue.lastChasedAt ? ` · Last replied/chased ${formatStamp(issue.lastChasedAt)}` : ""}
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
                          disabled={!data.emailReplyConfigured}
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Send reply to {issue.team.name}
                        </button>
                        {data.emailReplyConfigured ? (
                          <p className="text-xs leading-5 text-white/45">
                            If the team replies to this email, their response comes back into SIXFL Messages on the same email conversation.
                          </p>
                        ) : null}
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-white/10 px-5 py-4 sm:px-6">
              <Link href="/admin/fixtures/issues" className="text-sm font-semibold text-sky-200 hover:text-sky-100">
                Open all fixture issues and reply history
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
