// ========================================
// File: src/components/admin/fixtures/MatchCard.tsx
// ========================================

"use client";

import { useState } from "react";

type MatchCardMatch = {
  id: string;
  kickoffAt: string | Date | null;
  pitch: string | null;
  homeTeam: {
    id: string;
    name: string;
  };
  awayTeam: {
    id: string;
    name: string;
  };
};

type MatchCardProps = {
  match: MatchCardMatch;
  onEdit: () => void;
};

export default function MatchCard({ match, onEdit }: MatchCardProps) {
  const [time, setTime] = useState<string>(() => {
    if (!match.kickoffAt) return "";
    return new Date(match.kickoffAt).toISOString().slice(11, 16);
  });

  const [pitch, setPitch] = useState(match.pitch ?? "");

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-4">
      <div className="font-medium text-white">
        {match.homeTeam.name} vs {match.awayTeam.name}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded bg-black px-2 py-1 text-white"
        />

        <input
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="Pitch"
          className="w-20 rounded bg-black px-2 py-1 text-white"
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