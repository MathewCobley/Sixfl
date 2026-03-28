// ========================================
// File: src/components/admin/fixtures/MatchModal.tsx
// ========================================

"use client";

import { updateMatchAction } from "@/app/admin/leagues/[id]/fixtures/actions";

export default function MatchModal({ match, teams, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
      <form
        action={updateMatchAction}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0B0B0B] p-6 space-y-5"
      >
        <input type="hidden" name="matchId" value={match.id} />

        <h2 className="text-xl text-white font-semibold">
          Edit Fixture
        </h2>

        {/* Teams */}
        <div className="grid grid-cols-2 gap-3">
          <select
            name="homeTeamId"
            defaultValue={match.homeTeamId}
            className="bg-black text-white rounded-lg p-2"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            name="awayTeamId"
            defaultValue={match.awayTeamId}
            className="bg-black text-white rounded-lg p-2"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <input
          type="datetime-local"
          name="kickoffAt"
          className="w-full bg-black text-white rounded-lg p-2"
        />

        <input
          name="pitch"
          placeholder="Pitch 1"
          defaultValue={match.pitch || ""}
          className="w-full bg-black text-white rounded-lg p-2"
        />

        <input
          type="number"
          name="round"
          defaultValue={match.round}
          className="w-full bg-black text-white rounded-lg p-2"
        />

        <div className="flex justify-between">
          <button type="button" onClick={onClose}>
            Cancel
          </button>

          <button className="bg-white text-black px-4 py-2 rounded-lg">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}