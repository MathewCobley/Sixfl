// ========================================
// File: scripts/apply-fixture-social-label-clarity-fix.cjs
// ========================================

const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = process.cwd();
const backupSuffix = ".bak-2026-04-18-label-clarity";

const fixturesScreenPath = path.join(
  rootDir,
  "src",
  "components",
  "admin",
  "fixtures",
  "FixturesAdminScreen.tsx",
);

const fixturesScreenContent = `// ========================================
// File: src/components/admin/fixtures/FixturesAdminScreen.tsx
// ========================================

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
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
  publishFixtureSocialPostAction,
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

function getFixtureVisibilityTone(publishedAtIso: string | null) {
  return publishedAtIso
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
    : "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

function formatFixtureVisibilityState(publishedAtIso: string | null) {
  return publishedAtIso ? "Live on site" : "Draft only";
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
      return "Published to Meta";
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

function getConfirmationHelper(input) {
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

function SocialActionButton({
  label,
  pendingLabel,
  disabled = false,
  className,
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={cx(
        className,
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function SocialCell({ fixture }) {
  const readiness = getSocialReadiness(fixture);
  const hasDraft = fixture.socialPostStatus !== "NONE";
  const canApprove =
    fixture.socialNeedsApproval &&
    (fixture.socialPostStatus === "DRAFTED" ||
      fixture.socialPostStatus === "QUEUED");

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
          <span>Published to Meta {formatTimestamp(fixture.socialPublishedAtIso)}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={generateFixtureSocialDraftAction}>
          <input type="hidden" name="fixtureId" value={fixture.id} />
          <SocialActionButton
            label={hasDraft ? "Regenerate draft" : "Generate draft"}
            pendingLabel={hasDraft ? "Regenerating..." : "Generating..."}
            disabled={!readiness.canDraft}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/15"
          />
        </form>

        {canApprove ? (
          <form action={approveFixtureSocialPostAction}>
            <input type="hidden" name="fixtureId" value={fixture.id} />
            <SocialActionButton
              label="Approve"
              pendingLabel="Approving..."
              className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 text-xs font-semibold text-sky-200 transition hover:border-sky-300/30 hover:bg-sky-400/15"
            />
          </form>
        ) : null}

        {fixture.socialPostStatus === "APPROVED" ? (
          <form action={publishFixtureSocialPostAction}>
            <input type="hidden" name="fixtureId" value={fixture.id} />
            <SocialActionButton
              label="Publish to Meta"
              pendingLabel="Publishing..."
              className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/15"
            />
          </form>
        ) : null}

        {hasDraft ? (
          <form action={resetFixtureSocialPostAction}>
            <input type="hidden" name="fixtureId" value={fixture.id} />
            <SocialActionButton
              label="Reset"
              pendingLabel="Resetting..."
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            />
          </form>
        ) : null}

        {fixture.socialImageUrl ? (
          <a
            href={fixture.socialImageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            Open image
          </a>
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
        .filter((round) => typeof round === "number"),
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

  function startEditingFixture(fixture) {
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

  return null;
}
`;

async function backupIfNeeded(filePath) {
  const backupPath = `${filePath}${backupSuffix}`;

  try {
    await fs.access(backupPath);
  } catch {
    const current = await fs.readFile(filePath, "utf8");
    await fs.writeFile(backupPath, current, "utf8");
  }
}

async function writeFileWithBackup(filePath, content) {
  await backupIfNeeded(filePath);
  await fs.writeFile(filePath, content, "utf8");
}

async function main() {
  await writeFileWithBackup(fixturesScreenPath, fixturesScreenContent);
  console.log("Applied fixtures social label clarity fix.");
  console.log(`Backup created with suffix ${backupSuffix}.`);
}

main().catch((error) => {
  console.error("Failed to apply fixtures social label clarity fix.");
  console.error(error);
  process.exit(1);
});
