// ========================================
// File: src/components/admin/night-board/NightBoardOperations.tsx
// ========================================

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import NightBoardSixflTvToggle from "@/components/admin/night-board/NightBoardSixflTvToggle";
import FormListboxField, {
  type FormListboxOption,
} from "@/components/ui/FormListboxField";

export type NightBoardFixtureStatus =
  | "SCHEDULED"
  | "POSTPONED"
  | "CANCELLED"
  | "COMPLETED";

type NightBoardTeamRule = {
  id: string;
  name: string;
  latestKickoffTime: string | null;
};

export type NightBoardFixtureOperation = {
  id: string;
  kickoffTime: string;
  status: NightBoardFixtureStatus;
  homeTeam: NightBoardTeamRule;
  awayTeam: NightBoardTeamRule;
};

type NightBoardFixtureDraft = NightBoardFixtureOperation;

type LatestKickoffWarning = {
  fixtureId: string;
  inlineMessage: string;
  summaryMessage: string;
};

type PotentialIssue = {
  key: string;
  message: string;
};

type NightBoardOperationsContextValue = {
  updateFixtureDraft: (
    fixtureId: string,
    patch: Partial<Pick<NightBoardFixtureDraft, "kickoffTime" | "status">>,
  ) => void;
  latestKickoffWarningsByFixtureId: Map<string, LatestKickoffWarning>;
  potentialIssues: PotentialIssue[];
};

type BaseWarning = {
  level: "amber" | "red";
  message: string;
};

type FixtureEditorProps = {
  fixture: {
    id: string;
    kickoffTime: string;
    pitch: string;
    refereeId: string;
    venueId: string;
    status: NightBoardFixtureStatus;
  };
  returnTo: string;
  refereeOptions: FormListboxOption[];
  venueOptions: FormListboxOption[];
  statusOptions: FormListboxOption[];
  locked?: boolean;
};

const NightBoardOperationsContext =
  createContext<NightBoardOperationsContextValue | null>(null);

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function displayTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function isOperationalStatus(status: NightBoardFixtureStatus) {
  return status === "SCHEDULED" || status === "COMPLETED";
}

function buildLatestKickoffWarning(
  fixture: NightBoardFixtureDraft,
): LatestKickoffWarning | null {
  if (!isOperationalStatus(fixture.status)) return null;
  const kickoffMinutes = timeToMinutes(fixture.kickoffTime);
  if (kickoffMinutes === null) return null;

  const breachedTeams = [fixture.homeTeam, fixture.awayTeam].filter((team) => {
    const latestMinutes = timeToMinutes(team.latestKickoffTime);
    return latestMinutes !== null && kickoffMinutes > latestMinutes;
  });
  if (breachedTeams.length === 0) return null;

  const scheduledTime = displayTime(fixture.kickoffTime);
  const limits = breachedTeams
    .map((team) => `${team.name} ${displayTime(team.latestKickoffTime ?? "")}`)
    .join(" · ");
  const statedLimitSentence =
    breachedTeams.length === 1
      ? `${breachedTeams[0].name}’s stated latest kick-off is ${displayTime(
          breachedTeams[0].latestKickoffTime ?? "",
        )}.`
      : `The stated latest kick-off times are ${breachedTeams
          .map(
            (team) =>
              `${team.name} ${displayTime(team.latestKickoffTime ?? "")}`,
          )
          .join(" and ")}.`;

  return {
    fixtureId: fixture.id,
    inlineMessage: `Latest preferred kick-off exceeded: ${limits}. This fixture is scheduled for ${scheduledTime}.`,
    summaryMessage: `Potential issue – late kick-off: ${fixture.homeTeam.name} v ${fixture.awayTeam.name} is scheduled for ${scheduledTime}. ${statedLimitSentence}`,
  };
}

function buildRepeatedTeamWarnings(
  drafts: NightBoardFixtureDraft[],
): PotentialIssue[] {
  const appearancesByTeam = new Map<
    string,
    {
      teamName: string;
      fixtures: Array<{
        fixtureId: string;
        kickoffTime: string;
        homeTeamName: string;
        awayTeamName: string;
      }>;
    }
  >();

  for (const fixture of drafts) {
    if (!isOperationalStatus(fixture.status)) continue;
    if (timeToMinutes(fixture.kickoffTime) === null) continue;

    for (const team of [fixture.homeTeam, fixture.awayTeam]) {
      const existing = appearancesByTeam.get(team.id) ?? {
        teamName: team.name,
        fixtures: [],
      };
      existing.fixtures.push({
        fixtureId: fixture.id,
        kickoffTime: displayTime(fixture.kickoffTime),
        homeTeamName: fixture.homeTeam.name,
        awayTeamName: fixture.awayTeam.name,
      });
      appearancesByTeam.set(team.id, existing);
    }
  }

  const warnings: PotentialIssue[] = [];
  for (const [teamId, appearance] of appearancesByTeam) {
    const uniqueFixtures = Array.from(
      new Map(
        appearance.fixtures.map((fixture) => [fixture.fixtureId, fixture]),
      ).values(),
    );
    if (uniqueFixtures.length < 2) continue;

    uniqueFixtures.sort(
      (left, right) =>
        (timeToMinutes(left.kickoffTime) ?? Number.MAX_SAFE_INTEGER) -
        (timeToMinutes(right.kickoffTime) ?? Number.MAX_SAFE_INTEGER),
    );
    const fixtureList = uniqueFixtures
      .map(
        (fixture) =>
          `${fixture.kickoffTime} ${fixture.homeTeamName} v ${fixture.awayTeamName}`,
      )
      .join("; ");

    warnings.push({
      key: `duplicate-team:${teamId}`,
      message: `Potential issue – team scheduled more than once: ${appearance.teamName} appears in ${uniqueFixtures.length} fixtures on this night: ${fixtureList}.`,
    });
  }

  return warnings.sort((left, right) => left.message.localeCompare(right.message));
}

export function NightBoardOperationsProvider({
  fixtures,
  children,
}: {
  fixtures: NightBoardFixtureOperation[];
  children: ReactNode;
}) {
  const [draftsByFixtureId, setDraftsByFixtureId] = useState<
    Record<string, NightBoardFixtureDraft>
  >(() => Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture])));

  const updateFixtureDraft = useCallback(
    (
      fixtureId: string,
      patch: Partial<Pick<NightBoardFixtureDraft, "kickoffTime" | "status">>,
    ) => {
      setDraftsByFixtureId((current) => {
        const existing = current[fixtureId];
        if (!existing) return current;
        return {
          ...current,
          [fixtureId]: { ...existing, ...patch },
        };
      });
    },
    [],
  );

  const { latestKickoffWarningsByFixtureId, potentialIssues } = useMemo(() => {
    const drafts = Object.values(draftsByFixtureId);
    const latestWarnings = drafts
      .map(buildLatestKickoffWarning)
      .filter((warning): warning is LatestKickoffWarning => Boolean(warning));
    return {
      latestKickoffWarningsByFixtureId: new Map(
        latestWarnings.map((warning) => [warning.fixtureId, warning]),
      ),
      potentialIssues: [
        ...latestWarnings.map((warning) => ({
          key: `latest-ko:${warning.fixtureId}`,
          message: warning.summaryMessage,
        })),
        ...buildRepeatedTeamWarnings(drafts),
      ],
    };
  }, [draftsByFixtureId]);

  const value = useMemo<NightBoardOperationsContextValue>(
    () => ({
      updateFixtureDraft,
      latestKickoffWarningsByFixtureId,
      potentialIssues,
    }),
    [updateFixtureDraft, latestKickoffWarningsByFixtureId, potentialIssues],
  );

  return (
    <NightBoardOperationsContext.Provider value={value}>
      {children}
    </NightBoardOperationsContext.Provider>
  );
}

function useNightBoardOperations() {
  const value = useContext(NightBoardOperationsContext);
  if (!value) {
    throw new Error(
      "Night Board operation controls must be inside NightBoardOperationsProvider.",
    );
  }
  return value;
}

export function NightBoardFixtureEditor({
  fixture,
  returnTo,
  refereeOptions,
  venueOptions,
  statusOptions,
  locked = false,
}: FixtureEditorProps) {
  const { updateFixtureDraft, latestKickoffWarningsByFixtureId } =
    useNightBoardOperations();
  const [kickoffTime, setKickoffTime] = useState(fixture.kickoffTime);
  const [pitch, setPitch] = useState(fixture.pitch);
  const [refereeId, setRefereeId] = useState(fixture.refereeId);
  const [venueId, setVenueId] = useState(fixture.venueId);
  const [status, setStatus] = useState<NightBoardFixtureStatus>(fixture.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const kickoffWarning = latestKickoffWarningsByFixtureId.get(fixture.id) ?? null;

  function updateKickoffTime(nextValue: string) {
    setKickoffTime(nextValue);
    updateFixtureDraft(fixture.id, { kickoffTime: nextValue });
  }

  function updateStatus(nextValue: string) {
    const nextStatus = nextValue as NightBoardFixtureStatus;
    setStatus(nextStatus);
    updateFixtureDraft(fixture.id, { status: nextStatus });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || locked) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/night-board/update-match", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const payload = (await response.json().catch(() => null)) as {
        returnTo?: string;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "The match could not be saved.");
      }
      window.location.assign(payload?.returnTo || returnTo);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The match could not be saved.",
      );
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"
    >
      <input type="hidden" name="fixtureId" value={fixture.id} />
      <input type="hidden" name="returnTo" value={returnTo} />

      {locked ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-medium leading-5 text-amber-100">
          Completed fixture locked. Its time, pitch, referee, venue and status cannot be changed.
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          KO time
          <input
            name="kickoffTime"
            type="time"
            value={kickoffTime}
            disabled={locked}
            onChange={(event) => updateKickoffTime(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none focus:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {kickoffWarning ? (
            <span className="block rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-2 text-[11px] font-medium normal-case tracking-normal text-amber-100">
              {kickoffWarning.inlineMessage}
            </span>
          ) : null}
        </label>

        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          Pitch
          <input
            name="pitch"
            value={pitch}
            disabled={locked}
            onChange={(event) => setPitch(event.target.value)}
            placeholder="Pitch"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Referee
          </div>
          <FormListboxField
            name="refereeId"
            value={refereeId}
            options={refereeOptions}
            placeholder="No referee"
            disabled={locked}
            onValueChange={setRefereeId}
          />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Venue
          </div>
          <FormListboxField
            name="venueId"
            value={venueId}
            options={venueOptions}
            placeholder="No venue"
            disabled={locked}
            onValueChange={setVenueId}
          />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Status
          </div>
          <FormListboxField
            name="status"
            value={status}
            options={statusOptions}
            placeholder="Select status"
            disabled={locked}
            onValueChange={updateStatus}
          />
        </div>
      </div>

      <NightBoardSixflTvToggle fixtureId={fixture.id} />

      {error ? (
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={saving || locked}
        className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {locked ? "Fixture locked" : saving ? "Saving…" : "Save match"}
      </button>
    </form>
  );
}

export function NightBoardPotentialIssuesPanel({
  baseWarnings,
}: {
  baseWarnings: BaseWarning[];
}) {
  const { potentialIssues } = useNightBoardOperations();
  const [refereeConfirmationWarnings, setRefereeConfirmationWarnings] = useState<
    BaseWarning[]
  >([]);

  useEffect(() => {
    const controller = new AbortController();
    const query = window.location.search;

    void fetch(
      `/api/admin/night-board/referee-confirmation-warnings${query}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json().catch(() => null)) as {
          warnings?: BaseWarning[];
        } | null;
      })
      .then((payload) => {
        if (!payload) return;
        setRefereeConfirmationWarnings(payload.warnings ?? []);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Referee confirmation warning check failed", error);
        }
      });

    return () => controller.abort();
  }, []);

  const hasWarnings =
    refereeConfirmationWarnings.length > 0 ||
    baseWarnings.length > 0 ||
    potentialIssues.length > 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-xl font-semibold text-white">
        Warnings and potential issues
      </h2>
      <div className="mt-4 space-y-3">
        {!hasWarnings ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            No obvious pitch, referee, referee-confirmation, venue, clash, repeated-team or latest kick-off preference warnings.
          </div>
        ) : null}
        {refereeConfirmationWarnings.map((warning, index) => (
          <div
            key={`ref-confirm-${warning.message}-${index}`}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              warning.level === "red"
                ? "border-red-400/35 bg-red-500/15 text-red-100"
                : "border-amber-400/30 bg-amber-500/12 text-amber-100"
            }`}
          >
            {warning.message}
          </div>
        ))}
        {baseWarnings.map((warning, index) => (
          <div
            key={`${warning.message}-${index}`}
            className={`rounded-2xl border px-4 py-3 text-sm ${
              warning.level === "red"
                ? "border-red-400/25 bg-red-500/10 text-red-100"
                : "border-amber-400/25 bg-amber-500/10 text-amber-100"
            }`}
          >
            {warning.message}
          </div>
        ))}
        {potentialIssues.map((warning) => (
          <div
            key={warning.key}
            className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            {warning.message}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-white/45">
        Referee confirmations, latest kick-off preferences and teams appearing more than once are shown as potential issues. A pending referee becomes a red warning within 24 hours of the first kick-off. These warnings do not stop a match being saved.
      </p>
    </section>
  );
}
