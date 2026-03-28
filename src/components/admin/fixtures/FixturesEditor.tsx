// ========================================
// File: src/components/admin/fixtures/FixturesEditor.tsx
// ========================================

"use client";

import { useMemo, useState } from "react";
import { regenerateFixtures } from "@/app/admin/leagues/[id]/fixtures/actions";
import MatchModal from "./MatchModal";

type TeamItem = {
  id: string;
  name: string;
};

type MatchItem = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: {
    id: string;
    name: string;
  };
  awayTeam: {
    id: string;
    name: string;
  };
  round: number | null;
  position: number | null;
  pitch: string | null;
  kickoffAt: string | Date;
};

type FixturesEditorProps = {
  leagueId: string;
  teams: TeamItem[];
  matches: MatchItem[];
};

export default function FixturesEditor({
  leagueId,
  teams,
  matches,
}: FixturesEditorProps) {
  const [selectedMatch, setSelectedMatch] = useState<MatchItem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [preserveManual, setPreserveManual] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  const rounds = useMemo(() => {
    return matches.reduce<Record<number, MatchItem[]>>((acc, match) => {
      const roundNumber = match.round ?? 0;

      if (!acc[roundNumber]) {
        acc[roundNumber] = [];
      }

      acc[roundNumber].push(match);
      return acc;
    }, {});
  }, [matches]);

  function closeConfirmModal() {
    setConfirming(false);
    setConfirmText("");
  }

  async function handleRegenerate() {
    await regenerateFixtures(leagueId, preserveManual);
    closeConfirmModal();
  }

  const isValid = confirmText === "REGENERATE";

  return (
    <div className="space-y-10">
      {/* ========================================
          Controls
      ======================================== */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setConfirming(true)}
          className="rounded-xl bg-red-600 px-4 py-2 text-white transition hover:bg-red-500"
        >
          Regenerate Fixtures
        </button>
      </div>

      {/* ========================================
          Weeks
      ======================================== */}
      {Object.entries(rounds).map(([round, roundMatches]) => (
        <div key={round} className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            Week {round === "0" ? "Unassigned" : round}
          </h2>

          <div className="grid gap-3">
            {roundMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4 transition hover:bg-white/10"
              >
                <div className="flex items-center gap-4 text-white">
                  <span>{match.homeTeam.name}</span>
                  <span className="text-white/40">vs</span>
                  <span>{match.awayTeam.name}</span>
                </div>

                <div className="flex items-center gap-6 text-sm text-white/60">
                  {match.pitch ? <span>{match.pitch}</span> : null}

                  {match.kickoffAt ? (
                    <span>
                      {new Date(match.kickoffAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : null}

                  <button
                    onClick={() => setSelectedMatch(match)}
                    className="transition hover:text-white"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ========================================
          Match Modal
      ======================================== */}
      {selectedMatch ? (
        <MatchModal
          match={selectedMatch}
          teams={teams}
          onClose={() => setSelectedMatch(null)}
        />
      ) : null}

      {/* ========================================
          Regenerate Confirmation
      ======================================== */}
      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#0B0B0B] p-6">
            <h2 className="text-xl font-semibold text-white">
              Regenerate Fixtures
            </h2>

            <p className="text-sm text-white/60">
              This may overwrite existing fixtures. This action cannot be undone.
            </p>

            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={preserveManual}
                onChange={(e) => setPreserveManual(e.target.checked)}
              />
              Preserve manual edits
            </label>

            <div className="space-y-2">
              <label className="text-xs text-white/50">
                Type <span className="font-medium text-white">REGENERATE</span>{" "}
                to confirm
              </label>

              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type REGENERATE"
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white outline-none transition focus:border-white/30"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={closeConfirmModal}
                className="text-white/60 transition hover:text-white"
              >
                Cancel
              </button>

              <button
                disabled={!isValid}
                onClick={handleRegenerate}
                className={`rounded-lg px-4 py-2 text-white transition ${
                  isValid
                    ? "bg-red-600 hover:bg-red-500"
                    : "cursor-not-allowed bg-white/10 text-white/30"
                }`}
              >
                Confirm Regenerate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}