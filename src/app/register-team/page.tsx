"use client";

import { useState } from "react";

export default function RegisterTeamPage() {
  const [step, setStep] = useState(1);

  const [team, setTeam] = useState({
    teamName: "",
    leagueType: "",
    city: "",
    captainName: "",
    email: "",
  });

  function updateField(field: string, value: string) {
    setTeam({ ...team, [field]: value });
  }

  function next() {
    setStep(step + 1);
  }

  function back() {
    setStep(step - 1);
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">

      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">

        <h1 className="text-3xl font-extrabold tracking-tight mb-6">
          Register Your Team
        </h1>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-white/60 text-sm">
              Step 1 of 3 — Team basics
            </p>

            <input
              placeholder="Team name"
              value={team.teamName}
              onChange={(e) => updateField("teamName", e.target.value)}
              className="w-full h-12 rounded-xl bg-black/50 border border-white/10 px-4"
            />

            <button
              onClick={next}
              className="w-full h-12 rounded-xl bg-emerald-500 text-black font-bold hover:bg-emerald-400"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-white/60 text-sm">
              Step 2 of 3 — League type
            </p>

            <select
              value={team.leagueType}
              onChange={(e) => updateField("leagueType", e.target.value)}
              className="w-full h-12 rounded-xl bg-black/50 border border-white/10 px-4"
            >
              <option value="">Select league</option>
              <option value="mens">Men’s</option>
              <option value="womens">Women’s</option>
              <option value="youth">Youth</option>
            </select>

            <input
              placeholder="City"
              value={team.city}
              onChange={(e) => updateField("city", e.target.value)}
              className="w-full h-12 rounded-xl bg-black/50 border border-white/10 px-4"
            />

            <div className="flex gap-3">
              <button
                onClick={back}
                className="flex-1 h-12 rounded-xl border border-white/10"
              >
                Back
              </button>

              <button
                onClick={next}
                className="flex-1 h-12 rounded-xl bg-emerald-500 text-black font-bold"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-white/60 text-sm">
              Step 3 of 3 — Captain details
            </p>

            <input
              placeholder="Captain name"
              value={team.captainName}
              onChange={(e) => updateField("captainName", e.target.value)}
              className="w-full h-12 rounded-xl bg-black/50 border border-white/10 px-4"
            />

            <input
              placeholder="Email address"
              value={team.email}
              onChange={(e) => updateField("email", e.target.value)}
              className="w-full h-12 rounded-xl bg-black/50 border border-white/10 px-4"
            />

            <button
              className="w-full h-12 rounded-xl bg-emerald-500 text-black font-bold hover:bg-emerald-400"
            >
              Submit Team
            </button>
          </div>
        )}
      </div>

    </main>
  );
}