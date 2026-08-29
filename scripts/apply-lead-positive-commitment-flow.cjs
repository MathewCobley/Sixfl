const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const filePath = 'src/app/(public)/team-confirmation/[token]/page.tsx';
const fullPath = path.join(root, filePath);
let source = fs.readFileSync(fullPath, 'utf8');

function replaceOnce(before, after) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Expected lead confirmation source not found: ${before.slice(0, 80)}`);
  source = source.replace(before, after);
}

replaceOnce(
`  await confirmTeamPlaceFromLead(leadId);\n  revalidatePath("/admin/leads");`,
`  const teamNameInput = String(formData.get("teamName") ?? "").trim().replace(/\\s+/g, " ");\n  const playerCount = String(formData.get("playerCount") ?? "").trim();\n  const allowedPlayerCounts = new Set(["6", "7", "8", "9+", "building"]);\n  const teamName = teamNameInput.length >= 2 && teamNameInput.length <= 80 ? teamNameInput : null;\n  const playerCountLabel = allowedPlayerCounts.has(playerCount)\n    ? ({ "6": "6 players", "7": "7 players", "8": "8 players", "9+": "9+ players", building: "still putting the squad together" })[playerCount]\n    : null;\n\n  await confirmTeamPlaceFromLead(leadId);\n\n  if (teamName || playerCountLabel) {\n    const note = [\n      "Team commitment confirmed via starter email.",\n      teamName ? \`Team name: \${teamName}.\` : "Team name: not decided yet.",\n      playerCountLabel ? \`Approximate squad: \${playerCountLabel}.\` : null,\n    ].filter(Boolean).join(" ");\n\n    await prisma.$executeRaw(Prisma.sql\`\n      UPDATE "InterestLead"\n      SET\n        "teamName" = COALESCE(\${teamName}, "teamName"),\n        "message" = CASE\n          WHEN NULLIF(TRIM(COALESCE("message", '')), '') IS NULL THEN \${note}\n          ELSE "message" || E'\\n\\n' || \${note}\n        END,\n        "updatedAt" = NOW()\n      WHERE "id" = \${leadId}\n    \`);\n  }\n\n  revalidatePath("/admin/leads");`
);

replaceOnce(
`                By reserving a place, you’re simply letting us know you’d like us to hold a place for your team while we finalise the league. There’s no payment due and you’re not committing to take part at this stage.`,
`                By confirming, you’re telling SIXFL that you intend to enter a team in this league. There’s no payment due now and no long-term contract tying you in.`
);

replaceOnce(
`              <div className="flex flex-col gap-3 sm:flex-row">\n                <form action={confirmTeamPlaceAction}>\n                  <input type="hidden" name="token" value={token} />\n                  <button\n                    type="submit"\n                    className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(16,185,129,0.24)] transition hover:bg-emerald-500 sm:w-auto"\n                  >\n                    Yes, reserve our team place\n                  </button>\n                </form>`,
`              <form action={confirmTeamPlaceAction} className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5">\n                <input type="hidden" name="token" value={token} />\n\n                <div className="grid gap-4 sm:grid-cols-2">\n                  <label className="block">\n                    <span className="text-sm font-semibold text-white/80">Team name</span>\n                    <span className="mt-1 block text-xs text-white/45">If you haven’t decided yet, leave this blank.</span>\n                    <input\n                      name="teamName"\n                      type="text"\n                      minLength={2}\n                      maxLength={80}\n                      defaultValue={savedTeamName}\n                      placeholder="e.g. Richmond Rovers"\n                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"\n                    />\n                  </label>\n\n                  <label className="block">\n                    <span className="text-sm font-semibold text-white/80">Roughly how many players do you have?</span>\n                    <span className="mt-1 block text-xs text-white/45">This just helps us see how close your squad is.</span>\n                    <select\n                      name="playerCount"\n                      defaultValue=""\n                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"\n                    >\n                      <option value="">Prefer not to say yet</option>\n                      <option value="6">6 players</option>\n                      <option value="7">7 players</option>\n                      <option value="8">8 players</option>\n                      <option value="9+">9 or more</option>\n                      <option value="building">Still putting the squad together</option>\n                    </select>\n                  </label>\n                </div>\n\n                <button\n                  type="submit"\n                  className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(16,185,129,0.24)] transition hover:bg-emerald-500 sm:w-auto"\n                >\n                  Yes — I want to enter a team\n                </button>\n              </form>\n\n              <div className="flex flex-col gap-3 sm:flex-row">`
);

fs.writeFileSync(fullPath, source, 'utf8');
console.log('Applied positive commitment flow for existing team leads.');
