import { createHash } from "node:crypto";

export const EVENING_SOURCE = "REFEREE_EVENING_V1";
export const LEGACY_REFEREE_SOURCES = [
  "FIXTURE_NIGHT_BOARD_REFEREE_NOTICE",
  "REFEREE_ASSIGNMENT_BACKFILL",
  "REFEREE_NIGHT_BOOKED",
  "REFEREE_NIGHT_REMINDER_24H",
  "REFEREE_NIGHT_CONFIRMATION_AUTO72H",
  "REFEREE_NIGHT_CONFIRMATION_AUTO24H",
  "REFEREE_NIGHT_CONFIRMATION_MANUAL",
] as const;
export const LEGACY_REFEREE_REASON = "Replaced by the consolidated referee evening booking and single SMS reminder.";
export const HOUR = 60 * 60 * 1000;
export const ARRIVAL_LEAD = 15 * 60 * 1000;
export const URGENT_WINDOW = 4 * HOUR;

export function isLegacyRefereeNotice(sourceType?: string | null) {
  return LEGACY_REFEREE_SOURCES.some((source) => source === sourceType);
}

export type EveningFixture = {
  id: string;
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  kickoffAt: Date;
  minutesPerGame: number | null;
};
export type EveningSegment = {
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  first: string;
  last: string;
  finish: string | null;
};
export type EveningSnapshot = {
  hash: string;
  first: string | null;
  last: string | null;
  finish: string | null;
  segments: EveningSegment[];
};

function sameOptional(left: string | null, right: string | null) {
  return left === right;
}

/**
 * A referee who has already confirmed does not need to reconfirm when their
 * existing evening is only extended later at the same venue(s). The original
 * start and venue set must stay unchanged, and at least one venue's final
 * kick-off must move later. Earlier starts, venue changes, removals and other
 * work-window changes remain material and require a fresh confirmation.
 */
export function isNonDisruptiveConfirmedExtension(
  previous: EveningSnapshot,
  current: EveningSnapshot,
) {
  if (
    !previous.first ||
    !current.first ||
    previous.first !== current.first ||
    previous.segments.length !== current.segments.length
  ) {
    return false;
  }

  let extendedLater = false;

  for (let index = 0; index < previous.segments.length; index += 1) {
    const before = previous.segments[index];
    const after = current.segments[index];

    if (
      !after ||
      !sameOptional(before.venueId, after.venueId) ||
      !sameOptional(before.venueName, after.venueName) ||
      !sameOptional(before.venueAddress, after.venueAddress) ||
      before.first !== after.first
    ) {
      return false;
    }

    const beforeLast = Date.parse(before.last);
    const afterLast = Date.parse(after.last);
    if (!Number.isFinite(beforeLast) || !Number.isFinite(afterLast) || afterLast < beforeLast) {
      return false;
    }

    if (afterLast > beforeLast) {
      extendedLater = true;
    }

    if (before.finish && after.finish) {
      const beforeFinish = Date.parse(before.finish);
      const afterFinish = Date.parse(after.finish);
      if (
        !Number.isFinite(beforeFinish) ||
        !Number.isFinite(afterFinish) ||
        afterFinish < beforeFinish
      ) {
        return false;
      }
    } else if (before.finish !== after.finish) {
      // A change between known and unknown duration is not safe to infer.
      return false;
    }
  }

  return extendedLater;
}

/** Only working hours and venues are material. Team names, pitches, fees,
 * fixture IDs, league boundaries and internal match order cannot cause a resend. */
export function eveningSnapshot(fixtures: EveningFixture[]): EveningSnapshot {
  const groups = new Map<string, EveningFixture[]>();
  for (const fixture of fixtures) {
    const key = fixture.venueId ?? `unknown:${fixture.venueName ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(fixture);
    groups.set(key, group);
  }
  const segments = [...groups.values()].map((group): EveningSegment => {
    const ordered = [...group].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
    const durationKnown = ordered.every((f) => f.minutesPerGame != null && f.minutesPerGame > 0 && f.minutesPerGame <= 180);
    return {
      venueId: ordered[0].venueId,
      venueName: ordered[0].venueName,
      venueAddress: ordered[0].venueAddress,
      first: ordered[0].kickoffAt.toISOString(),
      last: ordered[ordered.length - 1].kickoffAt.toISOString(),
      finish: durationKnown
        ? new Date(Math.max(...ordered.map((f) => f.kickoffAt.getTime() + f.minutesPerGame! * 60_000))).toISOString()
        : null,
    };
  }).sort((a, b) => a.first.localeCompare(b.first) || (a.venueId ?? "").localeCompare(b.venueId ?? ""));
  return {
    hash: createHash("sha256").update(JSON.stringify(segments)).digest("hex"),
    first: segments[0]?.first ?? null,
    last: segments.length ? segments.map((s) => s.last).sort().at(-1)! : null,
    finish: segments.length && segments.every((s) => s.finish)
      ? segments.map((s) => s.finish!).sort().at(-1)! : null,
    segments,
  };
}

export type EveningMessageKind = "booking" | "update" | "cancelled" | "reminder";
export type EveningHistory = {
  id: string;
  kind: EveningMessageKind;
  channel: "EMAIL" | "SMS";
  status: string;
  hash: string;
  createdAt: Date;
  sentAt: Date | null;
  snapshot: EveningSnapshot;
};
export type EveningPlan = { kind: EveningMessageKind; channel: "EMAIL" | "SMS"; urgent: boolean };

export function lastCommunicated(history: EveningHistory[]) {
  return [...history].reverse().find((d) => d.status === "SENT" || d.status === "PROCESSING");
}

export function eveningIsOver(snapshot: EveningSnapshot, now: Date) {
  // Unknown duration is not guessed in customer copy; the conservative internal
  // expiry merely prevents sending stale messages on a subsequent morning.
  const end = snapshot.finish ?? (snapshot.last ? new Date(Date.parse(snapshot.last) + 3 * HOUR).toISOString() : null);
  return !end || now.getTime() >= Date.parse(end);
}

/** Normal flow: one settled booking email, then one SMS. Updates are exceptions
 * only for a different work window; urgent updates use SMS instead of another email. */
export function planEveningNotice(input: {
  now: Date;
  changedAt: Date;
  snapshot: EveningSnapshot;
  history: EveningHistory[]; // ascending createdAt
  declined: boolean;
}): EveningPlan | null {
  const { now, changedAt, snapshot, history } = input;
  const previous = lastCommunicated(history);
  const workWindow = snapshot.first ? snapshot : previous?.snapshot;
  if (!workWindow || eveningIsOver(workWindow, now)) return null;
  const first = Date.parse(workWindow.first!);
  const urgent = first - now.getTime() <= URGENT_WINDOW;
  if (!urgent && now.getTime() < changedAt.getTime() + HOUR) return null;

  const occupied = history.filter((d) => d.status !== "CANCELLED");
  const current = occupied.filter((d) => d.hash === snapshot.hash);
  if (!snapshot.first) {
    if (!previous?.snapshot.first || current.some((d) => d.kind === "cancelled")) return null;
    return { kind: "cancelled", channel: urgent ? "SMS" : "EMAIL", urgent };
  }
  if (input.declined) return null;
  if (!previous) {
    // Failed/skipped messages remain visible for admin repair, not a new retry
    // every five minutes. A later SMS can still be a useful fallback.
    if (!current.some((d) => d.kind === "booking")) return { kind: "booking", channel: "EMAIL", urgent };
  } else if (previous.hash !== snapshot.hash) {
    if (!current.some((d) => history.indexOf(d) > history.indexOf(previous) && (d.kind === "update" || d.kind === "booking"))) {
      return { kind: "update", channel: urgent ? "SMS" : "EMAIL", urgent };
    }
  }

  if (input.declined || now.getTime() >= first) return null;
  if (occupied.some((d) => d.channel === "SMS")) return null;
  const email = [...current].reverse().find((d) => d.channel === "EMAIL");
  if (!email || email.status === "QUEUED" || email.status === "PROCESSING") return null;
  // Late bookings retain a gap, except where waiting would miss the arrival time.
  const gapDeadline = Math.min((email.sentAt ?? email.createdAt).getTime() + HOUR, first - 30 * 60_000);
  if (now.getTime() < Math.max(first - 24 * HOUR, gapDeadline)) return null;
  return { kind: "reminder", channel: "SMS", urgent };
}
