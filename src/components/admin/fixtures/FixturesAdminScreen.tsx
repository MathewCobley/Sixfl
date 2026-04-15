// ========================================
// File: src/components/admin/fixtures/FixturesAdminScreen.tsx
// ========================================

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  FixtureCaptainConfirmationStatus,
  FixtureStatus,
  SocialPostStatus,
  SocialPostType,
} from "@prisma/client";
import AdminCard from "@/components/admin/AdminCard";
import AdminComboboxField from "@/components/admin/forms/AdminComboboxField";
import { FixtureConfirmationChaseButton } from "@/components/admin/fixtures/FixtureConfirmationChaseButton";
import {
  createFixtureAction,
  deleteFixtureAction,
  deleteLeagueFixturesAction,
  generateFixtures,
  submitResultAction,
  updateFixtureAction,
} from "@/app/(admin)/admin/fixtures/actions";
import {
  approveFixtureSocialPostAction,
  generateFixtureSocialDraftAction,
  resetFixtureSocialPostAction,
} from "@/app/(admin)/admin/fixtures/social-actions";
import {
  toLondonDateInputValue,
  toLondonTimeInputValue,
} from "@/lib/datetime/london";

type LeagueOption = {
  id: string;
  name: string;
  season: string | null;
  slug: string;
};

type TeamOption = {
  id: string;
  name: string;
  leagueId: string | null;
  league: {
    id: string;
    name: string;
    season: string | null;
  } | null;
};

type VenueOption = {
  id: string;
  name: string;
};

type RefereeOption = {
  id: string;
  name: string | null;
  email: string | null;
};

type FixtureItem = {
  id: string;
  leagueId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  venueId: string | null;
  refereeId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  venueName: string | null;
  refereeName: string | null;
  kickoffLabel: string | null;
  kickoffAtIso: string | null;
  publishedAtIso: string | null;
  round: number | null;
  position: number | null;
  pitch: string | null;
  status: FixtureStatus;
  matchFeePence: number | null;
  homeScore: number | null;
  awayScore: number | null;
  resultIsDisputed: boolean;

  socialPostType: SocialPostType;
  socialPostStatus: SocialPostStatus;
  socialNeedsApproval: boolean;
  socialCaption: string | null;
  socialImageUrl: string | null;
  socialQueuedAtIso: string | null;
  socialApprovedAtIso: string | null;
  socialPublishedAtIso: string | null;

  homeConfirmationStatus:
    | FixtureCaptainConfirmationStatus
    | "OVERDUE"
    | null;
  homeConfirmationNote: string | null;
  homeConfirmedAtIso: string | null;
  homeIssueRaisedAtIso: string | null;
  homeLastChasedAtIso: string | null;

  awayConfirmationStatus:
    | FixtureCaptainConfirmationStatus
    | "OVERDUE"
    | null;
  awayConfirmationNote: string | null;
  awayConfirmedAtIso: string | null;
  awayIssueRaisedAtIso: string | null;
  awayLastChasedAtIso: string | null;
};

type FixturesAdminScreenProps = {
  leagues: LeagueOption[];
  teams: TeamOption[];
  venues: VenueOption[];
  referees: RefereeOption[];
  fixtures: FixtureItem[];
  initialLeagueId?: string;
};

const STATUS_OPTIONS: Array<{
  value: FixtureStatus;
  label: string;
  tone: string;
}> = [
  {
    value: "SCHEDULED",
    label: "Scheduled",
    tone:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 data-[active=true]:border-emerald-400 data-[active=true]:bg-emerald-500/20",
  },
  {
    value: "COMPLETED",
    label: "Completed",
    tone:
      "border-sky-500/30 bg-sky-500/10 text-sky-300 data-[active=true]:border-sky-400 data-[active=true]:bg-sky-500/20",
  },
  {
    value: "POSTPONED",
    label: "Postponed",
    tone:
      "border-amber-500/30 bg-amber-500/10 text-amber-300 data-[active=true]:border-amber-400 data-[active=true]:bg-amber-500/20",
  },
  {
    value: "CANCELLED",
    label: "Cancelled",
    tone:
      "border-rose-500/30 bg-rose-500/10 text-rose-300 data-[active=true]:border-rose-400 data-[active=true]:bg-rose-500/20",
  },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getLeagueLabel(league: LeagueOption) {
  return league.season ? `${league.name} • ${league.season}` : league.name;
}

function getRefereeLabel(referee: RefereeOption) {
  if (referee.name && referee.email) {
    return `${referee.name} • ${referee.email}`;
  }

  return referee.name || referee.email || "Unnamed referee";
}

function formatFixtureStatus(status: FixtureStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatMoneyInputValue(amountPence: number | null) {
  if (amountPence === null || Number.isNaN(amountPence)) {
    return "";
  }

  return (amountPence / 100).toFixed(2);
}

function formatTimestamp(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusTone(status: FixtureStatus) {
  switch (status) {
    case "SCHEDULED":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "COMPLETED":
      return "border-sky-500/20 bg-sky-500/10 text-sky-300";
    case "POSTPONED":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "CANCELLED":
      return "border-rose-500/20 bg-rose-500/10 text-rose-300";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function getPublishTone(publishedAtIso: string | null) {
  return publishedAtIso
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
    : "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

function formatPublishState(publishedAtIso: string | null) {
  return publishedAtIso ? "Published" : "Draft";
}

function getConfirmationTone(
  status: FixtureCaptainConfirmationStatus | "OVERDUE" | null,
) {
  switch (status) {
    case "CONFIRMED":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "ISSUE_RAISED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "OVERDUE":
      return "border-red-400/20 bg-red-500/10 text-red-200";
    case "PENDING":
      return "border-white/10 bg-white/5 text-white/75";
    default:
      return "border-white/10 bg-white/5 text-white/45";
  }
}

function formatConfirmationState(
  status: FixtureCaptainConfirmationStatus | "OVERDUE" | null,
) {
  switch (status) {
    case "CONFIRMED":
      return "Confirmed";
    case "ISSUE_RAISED":
      return "Issue raised";
    case "OVERDUE":
      return "Overdue";
    case "PENDING":
      return "Awaiting confirmation";
    default:
      return "—";
  }
}
function getSocialStatusTone(status: SocialPostStatus) {
  switch (status) {
    case "PUBLISHED":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "APPROVED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    case "DRAFTED":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "QUEUED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "FAILED":
      return "border-rose-400/20 bg-rose-500/10 text-rose-200";
    case "NONE":
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function formatSocialStatus(status: SocialPostStatus) {
  switch (status) {
    case "NONE":
      return "Not drafted";
    case "QUEUED":
      return "Queued";
    case "DRAFTED":
      return "Draft ready";
    case "APPROVED":
      return "Approved";
    case "PUBLISHED":
      return "Published";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

function formatSocialType(type: SocialPostType) {
  switch (type) {
    case "RESULT":
      return "Result";
    case "FIXTURE":
      return "Fixture";
    case "UPDATE":
      return "Update";
    case "NONE":
    default:
      return "Not set";
  }
}

function getSocialReadiness(fixture: FixtureItem) {
  if (fixture.resultIsDisputed) {
    return {
      canDraft: false,
      reason: "Blocked because the result is disputed.",
    };
  }

  if (fixture.status === "COMPLETED") {
    if (fixture.homeScore === null || fixture.awayScore === null) {
      return {
        canDraft: false,
        reason: "Completed fixtures need a score before creating a result draft.",
      };
    }

    return {
      canDraft: true,
      reason: "Ready for a result post draft.",
    };
  }

  if (fixture.status === "SCHEDULED") {
    return {
      canDraft: true,
      reason: "Ready for a fixture post draft.",
    };
  }

  if (fixture.status === "POSTPONED" || fixture.status === "CANCELLED") {
    return {
      canDraft: true,
      reason: "Ready for an update post draft.",
    };
  }

  return {
    canDraft: false,
    reason: "This fixture is not ready for a social draft.",
  };
}

function getConfirmationHelper(input: {
  status: FixtureCaptainConfirmationStatus | "OVERDUE" | null;
  confirmedAtIso: string | null;
  issueRaisedAtIso: string | null;
  lastChasedAtIso: string | null;
}) {
  if (input.status === "CONFIRMED") {
    return input.confirmedAtIso
      ? `Confirmed ${formatTimestamp(input.confirmedAtIso)}`
      : "Confirmed";
  }

  if (input.status === "ISSUE_RAISED") {
    return input.issueRaisedAtIso
      ? `Raised ${formatTimestamp(input.issueRaisedAtIso)}`
      : "Issue logged";
  }

  if (input.lastChasedAtIso) {
    return `Chased ${formatTimestamp(input.lastChasedAtIso)}`;
  }

  if (input.status === "OVERDUE") {
    return "Needs chasing";
  }

  if (input.status === "PENDING") {
    return "Awaiting captain action";
  }

  return null;
}

function SegmentedStatusField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: FixtureStatus;
  onChange: (value: FixtureStatus) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
        Status
      </label>

      <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
        {STATUS_OPTIONS.map((option) => {
          const active = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              data-active={active}
              onClick={() => onChange(option.value)}
              className={cx(
                "group relative min-h-[56px] overflow-hidden rounded-2xl border px-4 py-3 text-left transition",
                "hover:border-white/20 hover:bg-white/[0.07]",
                "focus:outline-none focus:ring-2 focus:ring-emerald-400/40",
                active ? "shadow-[0_0_0_1px_rgba(255,255,255,0.06)]" : "",
                option.tone,
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <div className="flex items-center gap-3">
                <span
                  className={cx(
                    "h-2.5 w-2.5 shrink-0 rounded-full transition",
                    active ? "bg-current opacity-100" : "bg-white/25 opacity-70",
                  )}
                />
                <span className="truncate text-sm font-medium">
                  {option.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
        {eyebrow}
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
          {description}
        </p>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function ConfirmationCell({
  fixtureId,
  teamId,
  teamName,
  status,
  note,
  confirmedAtIso,
  issueRaisedAtIso,
  lastChasedAtIso,
}: {
  fixtureId: string;
  teamId: string | null;
  teamName: string;
  status: FixtureCaptainConfirmationStatus | "OVERDUE" | null;
  note: string | null;
  confirmedAtIso: string | null;
  issueRaisedAtIso: string | null;
  lastChasedAtIso: string | null;
}) {
  const helper = getConfirmationHelper({
    status,
    confirmedAtIso,
    issueRaisedAtIso,
    lastChasedAtIso,
  });

  const canChase =
    Boolean(teamId) && status !== "CONFIRMED" && status !== "ISSUE_RAISED";

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-white">{teamName}</div>

      <span
        className={cx(
          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
          getConfirmationTone(status),
        )}
      >
        {formatConfirmationState(status)}
      </span>

      {helper ? <div className="text-xs text-white/45">{helper}</div> : null}

      {note ? (
        <div className="rounded-xl border border-amber-400/15 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-100/85">
          {note}
        </div>
      ) : null}

      {canChase && teamId ? (
        <FixtureConfirmationChaseButton
          fixtureId={fixtureId}
          teamId={teamId}
        />
      ) : null}
    </div>
  );
}
function SocialCell({ fixture }: { fixture: FixtureItem }) {
  const readiness = getSocialReadiness(fixture);
  const hasDraft = fixture.socialPostStatus !== "NONE";
  const canApprove =
    fixture.socialNeedsApproval &&
    (fixture.socialPostStatus === "DRAFTED" || fixture.socialPostStatus === "QUEUED");

  return (
    <div className="min-w-[320px] space-y-3">
      <div className="flex flex-wrap gap-2">
        <span
          className={cx(
            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
            getSocialStatusTone(fixture.socialPostStatus),
          )}
        >
          {formatSocialStatus(fixture.socialPostStatus)}
        </span>

        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
          {formatSocialType(fixture.socialPostType)}
        </span>

        <span
          className={cx(
            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
            fixture.socialNeedsApproval
              ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
              : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
          )}
        >
          {fixture.socialNeedsApproval ? "Needs approval" : "Auto publish"}
        </span>
      </div>

      <div className="text-xs leading-5 text-white/55">{readiness.reason}</div>

      {fixture.socialCaption ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/75">
          {fixture.socialCaption}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs text-white/45">
        {fixture.socialQueuedAtIso ? (
          <span>Queued {formatTimestamp(fixture.socialQueuedAtIso)}</span>
        ) : null}
        {fixture.socialApprovedAtIso ? (
          <span>Approved {formatTimestamp(fixture.socialApprovedAtIso)}</span>
        ) : null}
        {fixture.socialPublishedAtIso ? (
          <span>Published {formatTimestamp(fixture.socialPublishedAtIso)}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={generateFixtureSocialDraftAction}>
          <input type="hidden" name="fixtureId" value={fixture.id} />
          <button
            type="submit"
            disabled={!readiness.canDraft}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {hasDraft ? "Regenerate draft" : "Generate draft"}
          </button>
        </form>

        {canApprove ? (
          <form action={approveFixtureSocialPostAction}>
            <input type="hidden" name="fixtureId" value={fixture.id} />
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 text-xs font-semibold text-sky-200 transition hover:border-sky-300/30 hover:bg-sky-400/15"
            >
              Approve
            </button>
          </form>
        ) : null}

        {hasDraft ? (
          <form action={resetFixtureSocialPostAction}>
            <input type="hidden" name="fixtureId" value={fixture.id} />
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              Reset
            </button>
          </form>
        ) : null}

        {fixture.socialImageUrl ? (
          <Link
            href={fixture.socialImageUrl}
            target="_blank"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            Open image
          </Link>
        ) : null}
      </div>
    </div>
  );
}
export default function FixturesAdminScreen({
  leagues,
  teams,
  venues,
  referees,
  fixtures,
  initialLeagueId,
}: FixturesAdminScreenProps) {
  const resolvedInitialLeagueId = useMemo(() => {
    const preferred = initialLeagueId?.trim();
    if (preferred && leagues.some((league) => league.id === preferred)) {
      return preferred;
    }

    return leagues[0]?.id ?? "";
  }, [initialLeagueId, leagues]);

  const [selectedLeagueId, setSelectedLeagueId] = useState(resolvedInitialLeagueId);
  const [createStatus, setCreateStatus] =
    useState<FixtureStatus>("SCHEDULED");
  const [generateStatus, setGenerateStatus] =
    useState<FixtureStatus>("SCHEDULED");

  const [editingFixtureId, setEditingFixtureId] = useState("");
  const [editLeagueId, setEditLeagueId] = useState("");
  const [editHomeTeamId, setEditHomeTeamId] = useState("");
  const [editAwayTeamId, setEditAwayTeamId] = useState("");
  const [editVenueId, setEditVenueId] = useState("");
  const [editRefereeId, setEditRefereeId] = useState("");
  const [editKickoffDate, setEditKickoffDate] = useState("");
  const [editKickoffTime, setEditKickoffTime] = useState("");
  const [editRound, setEditRound] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editPitch, setEditPitch] = useState("");
  const [editMatchFee, setEditMatchFee] = useState("");
  const [editStatus, setEditStatus] = useState<FixtureStatus>("SCHEDULED");

  useEffect(() => {
    setSelectedLeagueId(resolvedInitialLeagueId);
  }, [resolvedInitialLeagueId]);

  const leagueOptions = useMemo(
    () =>
      leagues.map((league) => ({
        id: league.id,
        value: league.id,
        label: getLeagueLabel(league),
      })),
    [leagues],
  );

  const selectedLeague = useMemo(() => {
    return leagues.find((league) => league.id === selectedLeagueId) ?? null;
  }, [leagues, selectedLeagueId]);

  const createLeagueTeams = useMemo(() => {
    return teams
      .filter((team) => team.leagueId === selectedLeagueId)
      .map((team) => ({
        id: team.id,
        value: team.id,
        label: team.name,
      }));
  }, [teams, selectedLeagueId]);

  const editLeagueTeams = useMemo(() => {
    return teams
      .filter((team) => team.leagueId === editLeagueId)
      .map((team) => ({
        id: team.id,
        value: team.id,
        label: team.name,
      }));
  }, [teams, editLeagueId]);

  const filteredFixtures = useMemo(() => {
    if (!selectedLeagueId) return fixtures;
    return fixtures.filter((fixture) => fixture.leagueId === selectedLeagueId);
  }, [fixtures, selectedLeagueId]);

  const fixtureSummary = useMemo(() => {
    const completed = filteredFixtures.filter(
      (fixture) => fixture.status === "COMPLETED",
    ).length;
    const scheduled = filteredFixtures.filter(
      (fixture) => fixture.status === "SCHEDULED",
    ).length;
    const published = filteredFixtures.filter(
      (fixture) => fixture.publishedAtIso,
    ).length;
    const drafts = filteredFixtures.length - published;
    const socialDrafted = filteredFixtures.filter(
      (fixture) => fixture.socialPostStatus === "DRAFTED",
    ).length;
    const socialPublished = filteredFixtures.filter(
      (fixture) => fixture.socialPostStatus === "PUBLISHED",
    ).length;

    const rounds = new Set(
      filteredFixtures
        .map((fixture) => fixture.round)
        .filter((round): round is number => typeof round === "number"),
    );

    const confirmedSides = filteredFixtures.reduce((sum, fixture) => {
      return (
        sum +
        (fixture.homeConfirmationStatus === "CONFIRMED" ? 1 : 0) +
        (fixture.awayConfirmationStatus === "CONFIRMED" ? 1 : 0)
      );
    }, 0);

    const issueRaisedSides = filteredFixtures.reduce((sum, fixture) => {
      return (
        sum +
        (fixture.homeConfirmationStatus === "ISSUE_RAISED" ? 1 : 0) +
        (fixture.awayConfirmationStatus === "ISSUE_RAISED" ? 1 : 0)
      );
    }, 0);

    const overdueSides = filteredFixtures.reduce((sum, fixture) => {
      return (
        sum +
        (fixture.homeConfirmationStatus === "OVERDUE" ? 1 : 0) +
        (fixture.awayConfirmationStatus === "OVERDUE" ? 1 : 0)
      );
    }, 0);

    return {
      total: filteredFixtures.length,
      completed,
      scheduled,
      published,
      drafts,
      socialDrafted,
      socialPublished,
      rounds: rounds.size,
      confirmedSides,
      issueRaisedSides,
      overdueSides,
    };
  }, [filteredFixtures]);

  const venueOptions = [
    {
      id: "no-venue",
      value: "",
      label: "No venue",
    },
    ...venues.map((venue) => ({
      id: venue.id,
      value: venue.id,
      label: venue.name,
    })),
  ];

  const refereeOptions = [
    {
      id: "unassigned",
      value: "",
      label: "Unassigned",
    },
    ...referees.map((referee) => ({
      id: referee.id,
      value: referee.id,
      label: getRefereeLabel(referee),
    })),
  ];

  function startEditingFixture(fixture: FixtureItem) {
    setEditingFixtureId(fixture.id);
    setSelectedLeagueId(fixture.leagueId ?? resolvedInitialLeagueId);
    setEditLeagueId(fixture.leagueId ?? "");
    setEditHomeTeamId(fixture.homeTeamId ?? "");
    setEditAwayTeamId(fixture.awayTeamId ?? "");
    setEditVenueId(fixture.venueId ?? "");
    setEditRefereeId(fixture.refereeId ?? "");
    setEditKickoffDate(toLondonDateInputValue(fixture.kickoffAtIso));
    setEditKickoffTime(toLondonTimeInputValue(fixture.kickoffAtIso));
    setEditRound(fixture.round?.toString() ?? "");
    setEditPosition(fixture.position?.toString() ?? "");
    setEditPitch(fixture.pitch ?? "");
    setEditMatchFee(formatMoneyInputValue(fixture.matchFeePence));
    setEditStatus(fixture.status);
  }

  function cancelEditingFixture() {
    setEditingFixtureId("");
    setEditLeagueId("");
    setEditHomeTeamId("");
    setEditAwayTeamId("");
    setEditVenueId("");
    setEditRefereeId("");
    setEditKickoffDate("");
    setEditKickoffTime("");
    setEditRound("");
    setEditPosition("");
    setEditPitch("");
    setEditMatchFee("");
    setEditStatus("SCHEDULED");
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Fixtures console
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Manage league fixtures properly
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
                Create one-off matches, generate full schedules, manage weeks,
                and now review captain confirmation status from the same control surface.
              </p>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-8">
            <MetricPill label="Leagues" value={leagues.length} />
            <MetricPill label="Teams" value={teams.length} />
            <MetricPill label="Fixtures" value={fixtureSummary.total} />
            <MetricPill label="Draft" value={fixtureSummary.drafts} />
            <MetricPill label="Published" value={fixtureSummary.published} />
            <MetricPill label="Social drafts" value={fixtureSummary.socialDrafted} />
            <MetricPill label="Social live" value={fixtureSummary.socialPublished} />
            <MetricPill label="Weeks" value={fixtureSummary.rounds} />
          </div>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <AdminCard className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="border-b border-white/10 px-6 py-6 md:px-8">
            <SectionHeading
              eyebrow="Manual match"
              title="Create fixture"
              description="Add a specific match with full control over teams, venue, referee, week, pitch, status and the per-team match fee."
            />
          </div>

          <form
            action={createFixtureAction}
            className="space-y-8 px-6 py-6 md:px-8"
          >
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="xl:col-span-2">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  League
                </label>
                <select
                  name="leagueId"
                  value={selectedLeagueId}
                  onChange={(event) => setSelectedLeagueId(event.target.value)}
                  className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                >
                  {leagueOptions.map((option) => (
                    <option key={option.id} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <AdminComboboxField
                key={`create-home-${selectedLeagueId}`}
                name="homeTeamId"
                label="Team 1"
                placeholder="Search team 1"
                options={createLeagueTeams}
              />

              <AdminComboboxField
                key={`create-away-${selectedLeagueId}`}
                name="awayTeamId"
                label="Team 2"
                placeholder="Search team 2"
                options={createLeagueTeams}
              />

              <AdminComboboxField
                name="venueId"
                label="Venue"
                placeholder="Select venue"
                options={venueOptions}
              />

              <AdminComboboxField
                name="refereeId"
                label="Referee"
                placeholder="Select referee"
                options={refereeOptions}
              />

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  Kickoff date
                </label>
                <input
                  type="date"
                  name="kickoffDate"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  Kickoff time
                </label>
                <input
                  type="time"
                  name="kickoffTime"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  Week
                </label>
                <input
                  type="number"
                  name="round"
                  placeholder="e.g. 3"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  Position
                </label>
                <input
                  type="number"
                  name="position"
                  placeholder="e.g. 1"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  Pitch
                </label>
                <input
                  type="text"
                  name="pitch"
                  placeholder="e.g. Pitch 1"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  Match fee per team (£)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="matchFeePounds"
                  placeholder="e.g. 30.00"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                />
                <p className="mt-2 text-xs text-white/40">
                  When set, SIXFL will create one charge per team and email payment links immediately.
                </p>
              </div>
            </div>

            <SegmentedStatusField
              name="status"
              value={createStatus}
              onChange={setCreateStatus}
            />

            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
              <input type="hidden" name="status" value={createStatus} />
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
              >
                Create fixture
              </button>
              <p className="text-sm text-white/45">
                Best for manual rearrangements, cup matches, and one-off edits.
              </p>
            </div>
          </form>
        </AdminCard>

        <AdminCard className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="border-b border-white/10 px-6 py-6 md:px-8">
            <SectionHeading
              eyebrow="Automated schedule"
              title="Generate fixtures"
              description="Build out a full league schedule with spacing, week controls, pitch count and optional reset handling."
            />
          </div>

          <form
            action={generateFixtures}
            className="space-y-8 px-6 py-6 md:px-8"
          >
            <div className="grid gap-6">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  League
                </label>
                <select
                  name="leagueId"
                  value={selectedLeagueId}
                  onChange={(event) => setSelectedLeagueId(event.target.value)}
                  className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                >
                  {leagueOptions.map((option) => (
                    <option key={option.id} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Start date
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Start time
                  </label>
                  <input
                    type="time"
                    name="startTime"
                    defaultValue="20:00"
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Week gap days
                  </label>
                  <input
                    type="number"
                    name="weekGapDays"
                    defaultValue={7}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Slot minutes
                  </label>
                  <input
                    type="number"
                    name="slotMinutes"
                    defaultValue={40}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Pitches
                  </label>
                  <input
                    type="number"
                    name="pitches"
                    defaultValue={1}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Max games per night
                  </label>
                  <input
                    type="number"
                    name="maxGamesPerNight"
                    defaultValue={3}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Start week
                  </label>
                  <input
                    type="number"
                    name="startRound"
                    defaultValue={1}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>
              </div>

              <AdminComboboxField
                name="venueId"
                label="Venue"
                placeholder="Select venue"
                options={venueOptions}
              />

              <SegmentedStatusField
                name="generatedStatus"
                value={generateStatus}
                onChange={setGenerateStatus}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <label className="flex min-h-[120px] cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/20 hover:bg-white/[0.06]">
                  <input
                    type="checkbox"
                    name="doubleRoundRobin"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-black/50 text-emerald-400 focus:ring-emerald-400/30"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      Double round robin
                    </div>
                    <div className="mt-1 text-sm leading-6 text-white/50">
                      Every team plays each opponent twice.
                    </div>
                  </div>
                </label>

                <label className="flex min-h-[120px] cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/20 hover:bg-white/[0.06]">
                  <input
                    type="checkbox"
                    name="clearExisting"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-black/50 text-emerald-400 focus:ring-emerald-400/30"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      Clear existing fixtures first
                    </div>
                    <div className="mt-1 text-sm leading-6 text-white/50">
                      Use when regenerating a league schedule from scratch.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
              <input type="hidden" name="status" value={generateStatus} />
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Generate fixtures
              </button>
              <p className="text-sm text-white/45">
                {selectedLeague
                  ? `Generating for ${getLeagueLabel(selectedLeague)}.`
                  : "Choose a league to generate a schedule."}
              </p>
            </div>
          </form>

          <div className="border-t border-white/10 px-6 py-6 md:px-8">
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-300/80">
                Bulk delete
              </div>
              <p className="text-sm leading-6 text-white/60">
                Delete all fixtures for the currently selected league. Use this
                when you want to wipe a schedule and regenerate it cleanly.
              </p>
              <form
                action={deleteLeagueFixturesAction}
                onSubmit={(event) => {
                  const label = selectedLeague
                    ? getLeagueLabel(selectedLeague)
                    : "this league";

                  const confirmed = window.confirm(
                    `Delete all fixtures for ${label}? This cannot be undone.`,
                  );

                  if (!confirmed) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="leagueId" value={selectedLeagueId} />
                <button
                  type="submit"
                  disabled={!selectedLeagueId}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 px-6 text-sm font-semibold text-rose-200 transition hover:border-rose-400/30 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete all fixtures for selected league
                </button>
              </form>
            </div>
          </div>
        </AdminCard>
      </div>

      <AdminCard className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                League schedule
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Fixtures
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-white/60">
                Review generated matches, edit details, submit results, prep social drafts, and see exactly which teams have confirmed their fixtures.
              </p>
            </div>

            <div className="w-full max-w-md">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                Viewing league
              </label>
              <select
                value={selectedLeagueId}
                onChange={(event) => setSelectedLeagueId(event.target.value)}
                className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
              >
                {leagueOptions.map((option) => (
                  <option key={option.id} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-10">
            <MetricPill label="Total" value={fixtureSummary.total} />
            <MetricPill label="Draft" value={fixtureSummary.drafts} />
            <MetricPill label="Published" value={fixtureSummary.published} />
            <MetricPill label="Scheduled" value={fixtureSummary.scheduled} />
            <MetricPill label="Completed" value={fixtureSummary.completed} />
            <MetricPill label="Social drafts" value={fixtureSummary.socialDrafted} />
            <MetricPill label="Social live" value={fixtureSummary.socialPublished} />
            <MetricPill label="Confirmed" value={fixtureSummary.confirmedSides} />
            <MetricPill label="Issues" value={fixtureSummary.issueRaisedSides} />
            <MetricPill label="Overdue" value={fixtureSummary.overdueSides} />
          </div>
        </div>

        {editingFixtureId ? (
          <div className="border-b border-white/10 px-6 py-6 md:px-8">
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                  Edit fixture
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-white">
                  Update selected match
                </h3>
                <p className="max-w-2xl text-sm leading-6 text-white/60">
                Review generated matches, edit details, submit results, prep social drafts, and see exactly which teams have confirmed their fixtures.
              </p>
              </div>

              <button
                type="button"
                onClick={cancelEditingFixture}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                Cancel edit
              </button>
            </div>

            <form action={updateFixtureAction} className="space-y-8">
              <input type="hidden" name="fixtureId" value={editingFixtureId} />
              <input type="hidden" name="status" value={editStatus} />

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="xl:col-span-2">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    League
                  </label>
                  <select
                    name="leagueId"
                    value={editLeagueId}
                    onChange={(event) => setEditLeagueId(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  >
                    {leagueOptions.map((option) => (
                      <option key={option.id} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <AdminComboboxField
                  name="homeTeamId"
                  label="Team 1"
                  placeholder="Search team 1"
                  options={editLeagueTeams}
                  defaultValue={editHomeTeamId}
                />

                <AdminComboboxField
                  name="awayTeamId"
                  label="Team 2"
                  placeholder="Search team 2"
                  options={editLeagueTeams}
                  defaultValue={editAwayTeamId}
                />

                <AdminComboboxField
                  name="venueId"
                  label="Venue"
                  placeholder="Select venue"
                  options={venueOptions}
                  defaultValue={editVenueId}
                />

                <AdminComboboxField
                  name="refereeId"
                  label="Referee"
                  placeholder="Select referee"
                  options={refereeOptions}
                  defaultValue={editRefereeId}
                />

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Kickoff date
                  </label>
                  <input
                    type="date"
                    name="kickoffDate"
                    value={editKickoffDate}
                    onChange={(event) => setEditKickoffDate(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Kickoff time
                  </label>
                  <input
                    type="time"
                    name="kickoffTime"
                    value={editKickoffTime}
                    onChange={(event) => setEditKickoffTime(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Week
                  </label>
                  <input
                    type="number"
                    name="round"
                    value={editRound}
                    onChange={(event) => setEditRound(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Position
                  </label>
                  <input
                    type="number"
                    name="position"
                    value={editPosition}
                    onChange={(event) => setEditPosition(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Pitch
                  </label>
                  <input
                    type="text"
                    name="pitch"
                    value={editPitch}
                    onChange={(event) => setEditPitch(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Match fee per team (£)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="matchFeePounds"
                    value={editMatchFee}
                    onChange={(event) => setEditMatchFee(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>
              </div>

              <SegmentedStatusField
                name="editStatus"
                value={editStatus}
                onChange={setEditStatus}
              />

              <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
                >
                  Save fixture changes
                </button>

                <button
                  type="button"
                  onClick={cancelEditingFixture}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-6 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {filteredFixtures.length === 0 ? (
          <div className="px-6 py-10 md:px-8">
            <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/60">
                ⚽
              </div>
              <h3 className="text-lg font-semibold text-white">
                No fixtures yet
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">
                Create a one-off match or generate a full schedule to populate
                this league.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.025] text-left">
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Match
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Kickoff
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Venue
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Week
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Status
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Confirmations
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Result
                  </th>
                  <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Social
                  </th>
                  <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredFixtures.map((fixture) => (
                  <tr
                    key={fixture.id}
                    className="border-b border-white/5 align-top transition hover:bg-white/[0.025]"
                  >
                    <td className="px-6 py-5">
                      <div className="font-medium text-white">
                        {fixture.homeTeamName} vs {fixture.awayTeamName}
                      </div>
                      <div className="mt-1 text-sm text-white/45">
                        {fixture.pitch ? fixture.pitch : "Pitch not set"}
                        {fixture.position !== null
                          ? ` • Game ${fixture.position}`
                          : ""}
                      </div>
                      {fixture.matchFeePence !== null && fixture.matchFeePence > 0 ? (
                        <div className="mt-2 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                          Match fee {formatMoney(fixture.matchFeePence)} per team
                        </div>
                      ) : null}
                    </td>

                    <td className="px-6 py-5 text-sm text-white/70">
                      {fixture.kickoffLabel ?? "Not scheduled"}
                    </td>

                    <td className="px-6 py-5 text-sm text-white/70">
                      <div>{fixture.venueName ?? "No venue"}</div>
                      <div className="mt-1 text-white/40">
                        {fixture.refereeName ?? "No referee"}
                      </div>
                    </td>

                    <td className="px-6 py-5 text-sm text-white/70">
                      {fixture.round ?? "—"}
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-2">
                        <span
                          className={cx(
                            "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                            getStatusTone(fixture.status),
                          )}
                        >
                          {formatFixtureStatus(fixture.status)}
                        </span>
                        <span
                          className={cx(
                            "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                            getPublishTone(fixture.publishedAtIso),
                          )}
                        >
                          {formatPublishState(fixture.publishedAtIso)}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="grid gap-3 xl:min-w-[320px]">
                        <ConfirmationCell
                          fixtureId={fixture.id}
                          teamId={fixture.homeTeamId}
                          teamName={fixture.homeTeamName}
                          status={fixture.homeConfirmationStatus}
                          note={fixture.homeConfirmationNote}
                          confirmedAtIso={fixture.homeConfirmedAtIso}
                          issueRaisedAtIso={fixture.homeIssueRaisedAtIso}
                          lastChasedAtIso={fixture.homeLastChasedAtIso}
                        />

                        <ConfirmationCell
                          fixtureId={fixture.id}
                          teamId={fixture.awayTeamId}
                          teamName={fixture.awayTeamName}
                          status={fixture.awayConfirmationStatus}
                          note={fixture.awayConfirmationNote}
                          confirmedAtIso={fixture.awayConfirmedAtIso}
                          issueRaisedAtIso={fixture.awayIssueRaisedAtIso}
                          lastChasedAtIso={fixture.awayLastChasedAtIso}
                        />
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="space-y-3">
                        <form
                          action={submitResultAction}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="fixtureId" value={fixture.id} />
                          <input
                            type="number"
                            name="homeScore"
                            min={0}
                            defaultValue={fixture.homeScore ?? undefined}
                            className="h-10 w-16 rounded-xl border border-white/10 bg-black/40 px-3 text-center text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                          />
                          <span className="text-white/35">-</span>
                          <input
                            type="number"
                            name="awayScore"
                            min={0}
                            defaultValue={fixture.awayScore ?? undefined}
                            className="h-10 w-16 rounded-xl border border-white/10 bg-black/40 px-3 text-center text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                          />
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                          >
                            Save
                          </button>
                        </form>

                        {fixture.resultIsDisputed ? (
                          <span className="inline-flex rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200">
                            Result disputed
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <SocialCell fixture={fixture} />
                    </td>

                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditingFixture(fixture)}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                        >
                          Edit
                        </button>

                        <form action={deleteFixtureAction}>
                          <input type="hidden" name="id" value={fixture.id} />
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 text-xs font-semibold text-rose-200 transition hover:border-rose-400/30 hover:bg-rose-500/15"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <div className="flex justify-end">
        <Link
          href="/admin"
          className="text-sm font-medium text-white/50 transition hover:text-white/80"
        >
          Back to admin overview
        </Link>
      </div>
    </div>
  );
}