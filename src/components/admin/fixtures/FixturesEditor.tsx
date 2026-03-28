// ========================================
// File: src/components/admin/fixtures/FixturesEditor.tsx
// ========================================

"use client";

import { useState } from "react";
import { regenerateFixtures } from "@/app/admin/leagues/[id]/fixtures/actions";
import MatchModal from "./MatchModal";

export default function FixturesEditor({ leagueId, teams, matches }) {
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const [preserveManual, setPreserveManual] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  // ========================================
  // Group matches by round
  // ========================================

  const rounds = matches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, typeof matches>);

  // ========================================
  // Handlers
  // ========================================

  function closeConfirmModal() {
    setConfirming(false);
    setConfirmText("");
  }

  async function handleRegenerate() {
    await regenerateFixtures(leagueId, preserveManual);
    closeConfirmModal();
  }

  const isValid = confirmText === "REGENERATE";

  // ========================================
  // Render
  // ========================================

  return (
    <div className="space-y-10">
      {/* ========================================
          Controls
      ======================================== */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setConfirming(true)}
          className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-500 transition"
        >
          Regenerate Fixtures
        </button>
      </div>

      {/* ========================================
          Weeks
      ======================================== */}
      {Object.entries(rounds).map(([round, matches]) => (
        <div key={round} className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            Week {round}
          </h2>

          <div className="grid gap-3">
            {matches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4 hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-4 text-white">
                  <span>{match.homeTeam.name}</span>
                  <span className="text-white/40">vs</span>
                  <span>{match.awayTeam.name}</span>

                  {match.isManual && (
                    <span className="text-xs text-yellow-400">
                      Manual
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-6 text-sm text-white/60">
                  {match.pitch && <span>{match.pitch}</span>}

                  {match.kickoffAt && (
                    <span>
                      {new Date(match.kickoffAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}

                  <button
                    onClick={() => setSelectedMatch(match)}
                    className="text-white/70 hover:text-white transition"
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
      {selectedMatch && (
        <MatchModal
          match={selectedMatch}
          teams={teams}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {/* ========================================
          Regenerate Confirmation (ELITE)
      ======================================== */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B0B0B] p-6 space-y-5">

            <h2 className="text-xl font-semibold text-white">
              Regenerate Fixtures
            </h2>

            <p className="text-sm text-white/60">
              This may overwrite existing fixtures. This action cannot be undone.
            </p>

            {/* Preserve toggle */}
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={preserveManual}
                onChange={(e) => setPreserveManual(e.target.checked)}
              />
              Preserve manual edits
            </label>

            {/* Type to confirm */}
            <div className="space-y-2">
              <label className="text-xs text-white/50">
                Type <span className="text-white font-medium">REGENERATE</span> to confirm
              </label>

              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type REGENERATE"
                autoFocus
                className="w-full rounded-lg bg-black px-3 py-2 text-white border border-white/10 focus:border-white/30 outline-none transition"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={closeConfirmModal}
                className="text-white/60 hover:text-white transition"
              >
                Cancel
              </button>

              <button
                disabled={!isValid}
                onClick={handleRegenerate}
                className={`px-4 py-2 rounded-lg text-white transition ${
                  isValid
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-white/10 text-white/30 cursor-not-allowed"
                }`}
              >
                Confirm Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}