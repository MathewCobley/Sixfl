"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";

type CompetitionOption = {
  id: string;
  name: string;
  slug: string;
  currentLeagueId: string | null;
  currentSeason: string | null;
};

type TeamCompetition = {
  id: string;
  name: string;
  leagueId: string | null;
  divisionId: string | null;
  competitionId: string | null;
  competitionName: string | null;
  currentLeagueId: string | null;
  currentSeason: string | null;
  currentSeasonIsActive: boolean;
};

type Payload = {
  team?: TeamCompetition;
  competitions?: CompetitionOption[];
  error?: string;
};

export default function TeamParentCompetitionPicker({
  teamId,
}: {
  teamId: string;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [savedId, setSavedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError("");

    fetch(`/api/admin/teams/${encodeURIComponent(teamId)}/competition`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as Payload | null;
        if (!response.ok || !data?.team) {
          throw new Error(data?.error || "Parent competition could not be loaded.");
        }

        if (controller.signal.aborted) return;

        const currentId = data.team.competitionId ?? "";
        setPayload(data);
        setSelectedId(currentId);
        setSavedId(currentId);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Parent competition could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [teamId]);

  const options = useMemo(
    () => [
      { value: "", label: "No parent competition" },
      ...(payload?.competitions ?? []).map((competition) => ({
        value: competition.id,
        label: competition.name,
      })),
    ],
    [payload?.competitions],
  );

  async function saveCompetition() {
    if (saving || selectedId === savedId) return;

    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch(
        `/api/admin/teams/${encodeURIComponent(teamId)}/competition`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            competitionId: selectedId || null,
          }),
        },
      );

      const data = (await response.json().catch(() => null)) as Payload | null;

      if (!response.ok || !data?.team) {
        throw new Error(data?.error || "Parent competition could not be saved.");
      }

      setPayload((current) => ({
        ...current,
        team: data.team,
      }));
      setSelectedId(data.team.competitionId ?? "");
      setSavedId(data.team.competitionId ?? "");
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Parent competition could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  const currentCompetitionName =
    payload?.team?.competitionName || "No parent competition";

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <FormListboxField
          name="parentCompetitionId"
          label="Parent competition"
          value={selectedId}
          options={options}
          placeholder={loading ? "Loading parent competitions…" : "Choose parent competition"}
          disabled={loading || saving}
          onValueChange={(value) => {
            setSelectedId(value);
            setSaved(false);
          }}
        />

        <button
          type="button"
          disabled={loading || saving || selectedId === savedId}
          onClick={() => void saveCompetition()}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save parent competition"}
        </button>
      </div>

      <div className="rounded-xl border border-sky-400/15 bg-sky-500/[0.05] px-3 py-2.5 text-xs leading-5 text-white/60">
        <span className="font-semibold text-sky-100">Current:</span>{" "}
        {currentCompetitionName}
        {payload?.team?.currentSeason ? (
          <>
            {" "}· current season {payload.team.currentSeason}
            {payload.team.currentSeasonIsActive ? " · entered in that season" : " · not entered in that season"}
          </>
        ) : null}
      </div>

      <p className="text-xs leading-5 text-white/50">
        Parent competition is the team&apos;s long-term league affiliation. Choosing
        one here does not add the team to a season table or division. Season
        participation is managed from the league season&apos;s “Teams in this
        season” panel.
      </p>

      {saved ? (
        <p className="text-xs font-medium text-emerald-200">
          Parent competition saved.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
