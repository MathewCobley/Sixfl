// ========================================
// File: src/components/admin/fixtures/MatchCard.tsx
// ========================================

"use client";

import { useState } from "react";

export default function MatchCard({ match, onEdit }) {
  const [time, setTime] = useState(match.kickoffAt);
  const [pitch, setPitch] = useState(match.pitch);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-4 flex justify-between items-center">
      <div className="text-white font-medium">
        {match.homeTeam.name} vs {match.awayTeam.name}

        {match.isManual && (
          <span className="ml-2 text-xs text-yellow-400">
            Manual
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="time"
          value={
            time
              ? new Date(time).toISOString().slice(11, 16)
              : ""
          }
          onChange={(e) => setTime(e.target.value)}
          className="bg-black text-white rounded px-2 py-1"
        />

        <input
          value={pitch || ""}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="Pitch"
          className="bg-black text-white rounded px-2 py-1 w-20"
        />

        <button
          onClick={onEdit}
          className="text-white/60 hover:text-white"
        >
          Edit
        </button>
      </div>
    </div>
  );
}