// ========================================
// File: src/components/admin/night-board/NightBoardTeamIssuesPanel.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import NightBoardTeamIssueCard, {
  type NightBoardTeamIssue,
} from "@/components/admin/night-board/NightBoardTeamIssueCard";

type IssuesResponse = {
  selectedDate: string;
  emailReplyConfigured: boolean;
  issues: NightBoardTeamIssue[];
};

function getNoticeMessage(notice: string, teamName: string) {
  switch (notice) {
    case "reply_queued":
      return `Reply queued for ${teamName || "the team"}.`;
    case "reply_skipped":
      return `Reply saved, but an email could not be queued for ${teamName || "the team"}. Check the team contact email and notification settings.`;
    case "reply_too_short":
      return "Please enter a longer reply.";
    case "issue_resolved":
      return `The open fixture issue for ${teamName || "the team"} has been resolved.`;
    case "issue_not_found":
      return "That issue could not be found or is no longer open.";
    case "missing_issue":
      return "The fixture issue details were missing.";
    case "issue_error":
      return `Something went wrong while resolving the issue for ${teamName || "the team"}.`;
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
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchKey),
    [searchKey],
  );
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
        const payload = (await response.json().catch(() => null)) as
          | IssuesResponse
          | { error?: string }
          | null;
        if (!response.ok || !payload || !("issues" in payload)) {
          throw new Error(
            (payload && "error" in payload && payload.error) ||
              "Team-raised fixture issues could not be loaded.",
          );
        }
        return payload;
      })
      .then((payload) => {
        setData(payload);
        if (noticeMessage) setOpen(true);
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Team-raised fixture issues could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [pathname, searchKey, noticeMessage]);

  if (pathname !== "/admin/night-board") return null;

  const issueCount = data?.issues.length ?? 0;
  const hasIssues = issueCount > 0;
  const successNotice = notice === "reply_queued" || notice === "issue_resolved";

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
        aria-label={`Open team-raised fixture issues${
          hasIssues ? ` (${issueCount})` : ""
        }`}
      >
        <span>{loading ? "Checking team issues…" : "Team fixture issues"}</span>
        <span
          className={[
            "inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-black",
            hasIssues
              ? "border-white/25 bg-black/20 text-white"
              : "border-white/10 bg-black/20 text-white/60",
          ].join(" ")}
        >
          {loading ? "…" : issueCount}
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex justify-end bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Team-raised fixture issues"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close team issues"
            onClick={() => setOpen(false)}
          />

          <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-[#0b0f14] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-300/80">
                  Night Board
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Team-raised fixture issues
                </h2>
                <p className="mt-1 text-sm text-white/50">
                  {data?.selectedDate ?? "Selected night"} · {issueCount} open issue
                  {issueCount === 1 ? "" : "s"}
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
                    successNotice
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                      : "border-amber-400/25 bg-amber-500/10 text-amber-100",
                  ].join(" ")}
                >
                  {noticeMessage}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              {!loading && !error && !data?.emailReplyConfigured ? (
                <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Reply-by-email is not configured. Add EMAIL_REPLY_DOMAIN in
                  Railway before sending replies. Issues can still be resolved.
                </div>
              ) : null}

              {loading ? (
                <div className="py-10 text-center text-sm text-white/50">
                  Loading team issues…
                </div>
              ) : null}

              {!loading && !error && issueCount === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
                  <div className="text-lg font-semibold text-white">
                    No team-raised issues on this night
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Any captain request or problem raised against a fixture will
                    appear here.
                  </p>
                </div>
              ) : null}

              <div className="space-y-4">
                {data?.issues.map((issue) => (
                  <NightBoardTeamIssueCard
                    key={issue.id}
                    issue={issue}
                    returnTo={returnTo}
                    emailReplyConfigured={data.emailReplyConfigured}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 px-5 py-4 sm:px-6">
              <Link
                href="/admin/fixtures/issues"
                className="text-sm font-semibold text-sky-200 hover:text-sky-100"
              >
                Open all fixture issues and reply history
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
