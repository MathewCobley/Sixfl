// ========================================
// File: src/components/admin/fixtures/FixturesAdminScreenWithIssueReplies.tsx
// ========================================

"use client";

import type { ComponentProps } from "react";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";

import { replyFixtureConfirmationIssueSmsAction } from "@/app/(admin)/admin/fixtures/confirmation-actions";
import { resolveFixtureConfirmationIssueAction } from "@/app/(admin)/admin/fixtures/issue-actions";
import OriginalFixturesAdminScreen from "./FixturesAdminScreen";

type FixturesAdminScreenProps = ComponentProps<typeof OriginalFixturesAdminScreen>;
type FixtureItem = FixturesAdminScreenProps["fixtures"][number];

type IssueReplyItem = {
  key: string;
  fixtureId: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  note: string;
  kickoffLabel: string | null;
};

const DEFAULT_REPLY_TEXT =
  "Thanks for letting us know. I have noted this and will check whether we can adjust the kick-off time. I’ll confirm back shortly.";

function buildIssueItems(fixtures: FixtureItem[]): IssueReplyItem[] {
  return fixtures.flatMap((fixture) => {
    const items: IssueReplyItem[] = [];

    if (
      fixture.homeTeamId &&
      fixture.homeConfirmationStatus === "ISSUE_RAISED" &&
      fixture.homeConfirmationNote?.trim()
    ) {
      items.push({
        key: `${fixture.id}-${fixture.homeTeamId}`,
        fixtureId: fixture.id,
        teamId: fixture.homeTeamId,
        teamName: fixture.homeTeamName,
        opponentName: fixture.awayTeamName,
        note: fixture.homeConfirmationNote.trim(),
        kickoffLabel: fixture.kickoffLabel,
      });
    }

    if (
      fixture.awayTeamId &&
      fixture.awayConfirmationStatus === "ISSUE_RAISED" &&
      fixture.awayConfirmationNote?.trim()
    ) {
      items.push({
        key: `${fixture.id}-${fixture.awayTeamId}`,
        fixtureId: fixture.id,
        teamId: fixture.awayTeamId,
        teamName: fixture.awayTeamName,
        opponentName: fixture.homeTeamName,
        note: fixture.awayConfirmationNote.trim(),
        kickoffLabel: fixture.kickoffLabel,
      });
    }

    return items;
  });
}

function getReplyNotice(searchParams: ReturnType<typeof useSearchParams>) {
  const status = searchParams.get("replySms");
  const teamName = searchParams.get("replyTeamName") || "that team";

  switch (status) {
    case "sent":
      return {
        tone: "success" as const,
        message: `Reply SMS sent to ${teamName}.`,
      };
    case "queued":
      return {
        tone: "success" as const,
        message: `Reply SMS queued for ${teamName}.`,
      };
    case "skipped":
      return {
        tone: "info" as const,
        message: `Reply SMS could not be queued for ${teamName}. Check that the team has a usable mobile number and SMS is enabled.`,
      };
    case "unavailable":
      return {
        tone: "info" as const,
        message: "Reply SMS is only available for issue-raised fixture confirmations.",
      };
    case "empty":
      return {
        tone: "error" as const,
        message: "Type a reply before sending the SMS.",
      };
    case "error":
      return {
        tone: "error" as const,
        message: "Something went wrong while trying to send the reply SMS.",
      };
    default:
      return null;
  }
}

function ScheduleWarningPanel() {
  const searchParams = useSearchParams();
  const scheduleError = searchParams.get("scheduleError");

  if (!scheduleError) {
    return null;
  }

  return (
    <section
      id="fixture-scheduling-warning"
      className="rounded-3xl border border-red-400/25 bg-red-500/[0.08] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)]"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200/80">
        Fixture blocked
      </div>
      <h2 className="mt-2 text-xl font-semibold text-white">
        This fixture breaks a team kick-off rule
      </h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-red-100/90">
        {scheduleError}
      </p>
      <p className="mt-3 text-xs leading-5 text-white/45">
        Change the kick-off time, or update the team’s kick-off rules from the
        team page if the restriction no longer applies.
      </p>
    </section>
  );
}

function ReplySubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/35 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Sending..." : "Send reply SMS"}
    </button>
  );
}

function ResolveIssueButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 text-xs font-semibold text-amber-100 transition hover:border-amber-400/35 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Updating..." : "Mark handled"}
    </button>
  );
}

function FixtureIssueReplyPanel({
  fixtures,
  initialLeagueId,
}: {
  fixtures: FixtureItem[];
  initialLeagueId?: string;
}) {
  const searchParams = useSearchParams();
  const notice = getReplyNotice(searchParams);
  const issueItems = useMemo(() => buildIssueItems(fixtures), [fixtures]);

  if (issueItems.length === 0 && !notice) {
    return null;
  }

  return (
    <section
      id="fixture-issue-replies"
      className="overflow-hidden rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <div className="border-b border-amber-400/15 px-6 py-5 md:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
              Fixture issue replies
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Reply to teams that have raised an issue
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Use this when a captain has raised a fixture issue, such as asking
              for a later kick-off. Replies are sent by SMS and saved into the
              admin messaging timeline.
            </p>
          </div>
          {issueItems.length > 0 ? (
            <span className="inline-flex w-fit rounded-2xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100">
              {issueItems.length} issue{issueItems.length === 1 ? "" : "s"} open
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 px-6 py-5 md:px-8">
        {notice ? (
          <div
            className={[
              "rounded-2xl border px-4 py-3 text-sm",
              notice.tone === "success"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : notice.tone === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-100"
                  : "border-white/10 bg-white/[0.05] text-white/75",
            ].join(" ")}
          >
            {notice.message}
          </div>
        ) : null}

        {issueItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-white/55">
            No open fixture issues need a reply.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {issueItems.map((item) => (
              <article
                key={item.key}
                className="rounded-3xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {item.teamName}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      vs {item.opponentName}
                      {item.kickoffLabel ? ` • ${item.kickoffLabel}` : ""}
                    </div>
                  </div>
                  <span className="w-fit rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                    Issue raised
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-500/5 px-3 py-3 text-sm leading-6 text-amber-100/90">
                  {item.note}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={resolveFixtureConfirmationIssueAction}>
                    <input type="hidden" name="fixtureId" value={item.fixtureId} />
                    <input type="hidden" name="teamId" value={item.teamId} />
                    <input type="hidden" name="leagueId" value={initialLeagueId ?? ""} />
                    <ResolveIssueButton />
                  </form>
                </div>

                <details className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.04] p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-100 marker:text-emerald-300">
                    Reply SMS
                  </summary>

                  <form
                    action={replyFixtureConfirmationIssueSmsAction}
                    className="mt-4 space-y-3"
                  >
                    <input type="hidden" name="fixtureId" value={item.fixtureId} />
                    <input type="hidden" name="teamId" value={item.teamId} />
                    <input type="hidden" name="returnTo" value="fixture-issue-replies" />
                    <input type="hidden" name="leagueId" value={initialLeagueId ?? ""} />

                    <textarea
                      name="body"
                      rows={4}
                      defaultValue={DEFAULT_REPLY_TEXT}
                      className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/40 focus:bg-black/45 focus:ring-2 focus:ring-emerald-400/10"
                    />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-white/45">
                        Sends to the team's saved SMS contact and logs in admin messaging.
                      </p>
                      <ReplySubmitButton />
                    </div>
                  </form>
                </details>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function FixturesAdminScreenWithIssueReplies(
  props: FixturesAdminScreenProps,
) {
  return (
    <div className="space-y-8">
      <ScheduleWarningPanel />
      <FixtureIssueReplyPanel
        fixtures={props.fixtures}
        initialLeagueId={props.initialLeagueId}
      />
      <OriginalFixturesAdminScreen {...props} />
    </div>
  );
}
