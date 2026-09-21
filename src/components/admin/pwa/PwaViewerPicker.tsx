"use client";

import { useEffect, useMemo, useState } from "react";

export type PwaViewerData = {
  captainTeams: Array<{
    id: string;
    name: string;
    leagueLabel: string;
    logoUrl: string | null;
  }>;
  playerTeams: Array<{
    id: string;
    name: string;
    leagueLabel: string;
    logoUrl: string | null;
    players: Array<{
      membershipId: string;
      name: string;
      role: string;
    }>;
  }>;
  referees: Array<{
    id: string;
    name: string;
    email: string | null;
  }>;
};

type PortalType = "captain" | "player" | "referee";

const VIEWER_SELECTION_STORAGE_KEY = "sixfl-admin-pwa-viewer-selection-v1";

type StoredViewerSelection = {
  portal?: PortalType;
  captainTeamId?: string;
  playerTeamId?: string;
  playerMembershipId?: string;
  refereeId?: string;
};

function isPortalType(value: unknown): value is PortalType {
  return value === "captain" || value === "player" || value === "referee";
}

type PickerOption = {
  value: string;
  label: string;
  helper?: string;
};

function PickerField({
  label,
  value,
  options,
  onChange,
  emptyText = "No options available",
}: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <div className="relative">
      <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/35">
        {label}
      </div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-2 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:border-emerald-400/25 hover:bg-white/[0.04]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">
            {selected?.label ?? emptyText}
          </span>
          {selected?.helper ? (
            <span className="mt-0.5 block truncate text-xs text-white/40">
              {selected.helper}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="shrink-0 text-white/35">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#07100d] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.65)]">
          {options.length === 0 ? (
            <div className="px-3 py-3 text-sm text-white/45">{emptyText}</div>
          ) : (
            options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition",
                    active
                      ? "bg-emerald-500/12 text-emerald-100"
                      : "text-white/75 hover:bg-white/[0.05] hover:text-white",
                  ].join(" ")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {option.label}
                    </span>
                    {option.helper ? (
                      <span className="mt-0.5 block truncate text-xs opacity-55">
                        {option.helper}
                      </span>
                    ) : null}
                  </span>
                  {active ? (
                    <span className="shrink-0 text-emerald-300">✓</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function portalButtonClasses(active: boolean) {
  return [
    "flex min-h-14 flex-1 items-center justify-center rounded-2xl border px-4 py-3 text-sm font-black uppercase tracking-[0.08em] transition",
    active
      ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-100 shadow-[0_10px_30px_rgba(16,185,129,0.08)]"
      : "border-white/10 bg-black/20 text-white/50 hover:bg-white/[0.05] hover:text-white",
  ].join(" ");
}

export default function PwaViewerPicker({
  data,
  onPreview,
}: {
  data: PwaViewerData;
  onPreview: (path: string) => void;
}) {
  const [portal, setPortal] = useState<PortalType>("captain");
  const [captainTeamId, setCaptainTeamId] = useState(
    data.captainTeams[0]?.id ?? "",
  );
  const [playerTeamId, setPlayerTeamId] = useState(
    data.playerTeams[0]?.id ?? "",
  );
  const [playerMembershipId, setPlayerMembershipId] = useState(
    data.playerTeams[0]?.players[0]?.membershipId ?? "",
  );
  const [refereeId, setRefereeId] = useState(data.referees[0]?.id ?? "");
  const [selectionHydrated, setSelectionHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIEWER_SELECTION_STORAGE_KEY);
      if (!raw) return;

      const stored = JSON.parse(raw) as StoredViewerSelection;
      if (isPortalType(stored.portal)) {
        setPortal(stored.portal);
      }

      if (
        stored.captainTeamId &&
        data.captainTeams.some((team) => team.id === stored.captainTeamId)
      ) {
        setCaptainTeamId(stored.captainTeamId);
      }

      const storedPlayerTeam = stored.playerTeamId
        ? data.playerTeams.find((team) => team.id === stored.playerTeamId)
        : null;
      if (storedPlayerTeam) {
        setPlayerTeamId(storedPlayerTeam.id);
        const storedMembership = stored.playerMembershipId
          ? storedPlayerTeam.players.find(
              (player) => player.membershipId === stored.playerMembershipId,
            )
          : null;
        setPlayerMembershipId(
          storedMembership?.membershipId ??
            storedPlayerTeam.players[0]?.membershipId ??
            "",
        );
      }

      if (
        stored.refereeId &&
        data.referees.some((referee) => referee.id === stored.refereeId)
      ) {
        setRefereeId(stored.refereeId);
      }
    } catch {
      // Ignore stale/corrupt local admin-preview state and use current defaults.
    } finally {
      setSelectionHydrated(true);
    }
  }, [data]);

  useEffect(() => {
    if (!selectionHydrated) return;

    const stored: StoredViewerSelection = {
      portal,
      captainTeamId,
      playerTeamId,
      playerMembershipId,
      refereeId,
    };

    try {
      window.localStorage.setItem(
        VIEWER_SELECTION_STORAGE_KEY,
        JSON.stringify(stored),
      );
    } catch {
      // Viewer persistence is a convenience only; previewing must still work.
    }
  }, [
    selectionHydrated,
    portal,
    captainTeamId,
    playerTeamId,
    playerMembershipId,
    refereeId,
  ]);

  const captainOptions = useMemo<PickerOption[]>(
    () =>
      data.captainTeams.map((team) => ({
        value: team.id,
        label: team.name,
        helper: team.leagueLabel,
      })),
    [data.captainTeams],
  );

  const playerTeam = useMemo(
    () => data.playerTeams.find((team) => team.id === playerTeamId) ?? null,
    [data.playerTeams, playerTeamId],
  );

  const playerTeamOptions = useMemo<PickerOption[]>(
    () =>
      data.playerTeams.map((team) => ({
        value: team.id,
        label: team.name,
        helper: `${team.players.length} linked player${team.players.length === 1 ? "" : "s"} · ${team.leagueLabel}`,
      })),
    [data.playerTeams],
  );

  const playerOptions = useMemo<PickerOption[]>(
    () =>
      (playerTeam?.players ?? []).map((player) => ({
        value: player.membershipId,
        label: player.name,
        helper: player.role.replaceAll("_", " ").toLowerCase(),
      })),
    [playerTeam],
  );

  const refereeOptions = useMemo<PickerOption[]>(
    () =>
      data.referees.map((referee) => ({
        value: referee.id,
        label: referee.name,
        helper: referee.email ?? "No email saved",
      })),
    [data.referees],
  );

  function changePlayerTeam(nextTeamId: string) {
    setPlayerTeamId(nextTeamId);
    const nextTeam = data.playerTeams.find((team) => team.id === nextTeamId);
    setPlayerMembershipId(nextTeam?.players[0]?.membershipId ?? "");
  }

  const selectedCaptain = data.captainTeams.find(
    (team) => team.id === captainTeamId,
  );
  const selectedPlayer = playerTeam?.players.find(
    (player) => player.membershipId === playerMembershipId,
  );
  const selectedReferee = data.referees.find(
    (referee) => referee.id === refereeId,
  );

  const previewDisabled =
    (portal === "captain" && !captainTeamId) ||
    (portal === "player" && (!playerTeamId || !playerMembershipId)) ||
    (portal === "referee" && !refereeId);

  function openSelectedPortal() {
    if (portal === "captain" && captainTeamId) {
      onPreview(`/admin/teams/${captainTeamId}/captain-preview`);
      return;
    }

    if (portal === "player" && playerTeamId && playerMembershipId) {
      onPreview(
        `/player/team/${playerTeamId}?previewMembershipId=${encodeURIComponent(playerMembershipId)}&pwaPreview=1`,
      );
      return;
    }

    if (portal === "referee" && refereeId) {
      onPreview(`/admin/referees/${refereeId}/referee-preview`);
    }
  }

  const summary =
    portal === "captain"
      ? selectedCaptain
        ? `Captain Portal · ${selectedCaptain.name}`
        : "No Captain Portal available"
      : portal === "player"
        ? selectedPlayer && playerTeam
          ? `Player Portal · ${selectedPlayer.name} · ${playerTeam.name}`
          : "Choose a player"
        : selectedReferee
          ? `Referee Portal · ${selectedReferee.name}`
          : "No Referee Portal available";

  return (
    <section className="rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),rgba(255,255,255,0.035)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:p-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/75">
          Viewer picker
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
          Who do you want to view the app as?
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Choose an exact Captain, Player or Referee view. The selected portal opens directly inside the phone preview using the existing SIXFL admin preview system.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setPortal("captain")}
          className={portalButtonClasses(portal === "captain")}
        >
          Captain Portal
        </button>
        <button
          type="button"
          onClick={() => setPortal("player")}
          className={portalButtonClasses(portal === "player")}
        >
          Player Portal
        </button>
        <button
          type="button"
          onClick={() => setPortal("referee")}
          className={portalButtonClasses(portal === "referee")}
        >
          Referee Portal
        </button>
      </div>

      <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
        {portal === "captain" ? (
          <PickerField
            label="Team"
            value={captainTeamId}
            options={captainOptions}
            onChange={setCaptainTeamId}
            emptyText="No standard teams available for Captain Preview"
          />
        ) : null}

        {portal === "player" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <PickerField
              label="Team"
              value={playerTeamId}
              options={playerTeamOptions}
              onChange={changePlayerTeam}
              emptyText="No teams with linked players"
            />
            <PickerField
              label="Player"
              value={playerMembershipId}
              options={playerOptions}
              onChange={setPlayerMembershipId}
              emptyText="No linked players on this team"
            />
          </div>
        ) : null}

        {portal === "referee" ? (
          <PickerField
            label="Referee"
            value={refereeId}
            options={refereeOptions}
            onChange={setRefereeId}
            emptyText="No referee users available"
          />
        ) : null}

        <div className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
              Selected viewer
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-white/75">
              {summary}
            </div>
          </div>

          <button
            type="button"
            disabled={previewDisabled}
            onClick={openSelectedPortal}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            View in phone preview
          </button>
        </div>
      </div>
    </section>
  );
}
