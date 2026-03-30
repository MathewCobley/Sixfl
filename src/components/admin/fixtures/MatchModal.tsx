// ========================================
// File: src/components/admin/fixtures/MatchModal.tsx
// ========================================

"use client";

import { updateMatchAction } from "@/app/(admin)/admin/leagues/[id]/fixtures/actions";

type TeamItem = {
  id: string;
  name: string;
};

type MatchItem = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  round: number | null;
  pitch: string | null;
  kickoffAt: string | Date | null;
};

type MatchModalProps = {
  match: MatchItem;
  teams: TeamItem[];
  onClose: () => void;
};

function toDateTimeLocalValue(value: string | Date | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (input: number) => String(input).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function MatchModal({
  match,
  teams,
  onClose,
}: MatchModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
      <form
        action={updateMatchAction}
        className="w-full max-w-xl space-y-5 rounded-2xl border border-white/10 bg-[#0B0B0B] p-6"
      >
        <input type="hidden" name="matchId" value={match.id} />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit match</h2>
            <p className="mt-1 text-sm text-white/55">
              Update teams, round, kickoff and pitch.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-sm text-white/55 transition hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Home team
            </label>
            <select
              name="homeTeamId"
              defaultValue={match.homeTeamId}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-white/25"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Away team
            </label>
            <select
              name="awayTeamId"
              defaultValue={match.awayTeamId}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-white/25"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Round
            </label>
            <input
              type="number"
              name="round"
              defaultValue={match.round ?? ""}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-white/25"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Pitch
            </label>
            <input
              type="text"
              name="pitch"
              defaultValue={match.pitch ?? ""}
              placeholder="Pitch 1"
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Kickoff
            </label>
            <input
              type="datetime-local"
              name="kickoffAt"
              defaultValue={toDateTimeLocalValue(match.kickoffAt)}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-white/25"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}