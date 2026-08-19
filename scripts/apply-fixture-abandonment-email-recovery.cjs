const fs = require("node:fs");
const path = require("node:path");

const formPath = path.join(
  process.cwd(),
  "src",
  "components",
  "referee",
  "AbandonedMatchForm.tsx",
);
let source = fs.readFileSync(formPath, "utf8");

const importBefore =
  'import { recordNightFixtureAbandonmentAction } from "@/app/(public)/referee/abandonment-actions";';
const importAfter = `${importBefore}\nimport { resendNightFixtureAbandonmentEmailsAction } from "@/app/(public)/referee/abandonment-email-actions";`;
if (!source.includes(importAfter)) {
  if (!source.includes(importBefore)) {
    throw new Error("Could not find the abandoned-match action import.");
  }
  source = source.replace(importBefore, importAfter);
}

const marker = `        <p className="mt-3 text-xs leading-5 text-white/45">
          {officialResult
            ? \`Official SIXFL result: \${homeTeam.name} \${officialResult.homeScore}-\${officialResult.awayScore} \${awayTeam.name}.\`
            : "No official result has been awarded yet. The result and league outcome remain for SIXFL to decide."}
        </p>`;

const recovery = `${marker}
        {canDecideResult ? (
          <form
            action={resendNightFixtureAbandonmentEmailsAction}
            className="mt-4 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3"
          >
            <input type="hidden" name="refereeNightId" value={refereeNightId} />
            <input type="hidden" name="fixtureId" value={fixtureId} />
            <p className="text-xs leading-5 text-amber-50/70">
              If the original abandonment emails did not appear in the teams&apos; conversation timelines, use this to send the saved decision again. This does not change the abandonment, fees or official result.
            </p>
            <button
              type="submit"
              className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/15 px-4 text-xs font-bold text-amber-50 transition hover:bg-amber-400/25"
            >
              Send abandonment emails again
            </button>
          </form>
        ) : null}`;

if (!source.includes(recovery)) {
  if (!source.includes(marker)) {
    throw new Error("Could not find the recorded abandonment result block.");
  }
  source = source.replace(marker, recovery);
}

fs.writeFileSync(formPath, source, "utf8");
console.log("Added an admin recovery control for abandoned-match emails.");
