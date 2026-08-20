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

function ensureImport(importLine, anchor, label) {
  if (source.includes(importLine)) return;
  if (!source.includes(anchor)) {
    throw new Error(`Could not find ${label} import anchor.`);
  }
  source = source.replace(anchor, `${anchor}\n${importLine}`);
}

const abandonmentActionImport =
  'import { recordNightFixtureAbandonmentAction } from "@/app/(public)/referee/abandonment-actions";';
ensureImport(
  'import { resendNightFixtureAbandonmentEmailsAction } from "@/app/(public)/referee/abandonment-email-actions";',
  abandonmentActionImport,
  "abandoned-match email recovery",
);
ensureImport(
  'import { sendNightFixtureFormalConductNoticeAction } from "@/app/(public)/referee/abandonment-conduct-actions";',
  'import { resendNightFixtureAbandonmentEmailsAction } from "@/app/(public)/referee/abandonment-email-actions";',
  "formal conduct notice",
);

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

const conductRecovery = `${recovery}
        {canDecideResult &&
        responsibleName &&
        ["REFUSED_TO_LEAVE", "TEAM_CONDUCT", "VIOLENT_OR_THREATENING_CONDUCT", "SERIOUS_MISCONDUCT"].includes(abandonment.reason) ? (
          <form
            action={sendNightFixtureFormalConductNoticeAction}
            className="mt-4 rounded-xl border border-red-300/25 bg-red-500/10 p-3"
          >
            <input type="hidden" name="refereeNightId" value={refereeNightId} />
            <input type="hidden" name="fixtureId" value={fixtureId} />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-100/80">
              Formal conduct notice · {responsibleName}
            </p>
            <p className="mt-2 text-xs leading-5 text-red-50/70">
              This is a separate conduct email covering referee authority, player and manager behaviour, and the safety and smooth running of the league. It is logged permanently in the team&apos;s conversation timeline. Use this button for an existing abandonment if the conduct notice has not already been sent.
            </p>
            <button
              type="submit"
              className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-red-300/35 bg-red-400/15 px-4 text-xs font-bold text-red-50 transition hover:bg-red-400/25"
            >
              Send formal conduct notice now
            </button>
          </form>
        ) : null}`;

if (!source.includes("Send formal conduct notice now")) {
  if (!source.includes(recovery)) {
    throw new Error("Could not find the abandonment email recovery block.");
  }
  source = source.replace(recovery, conductRecovery);
}

fs.writeFileSync(formPath, source, "utf8");

const pagePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "referee",
  "night",
  "[id]",
  "page.tsx",
);
let page = fs.readFileSync(pagePath, "utf8");
const savedAnchor = [
  '    case "abandoned":',
  '      return "Match marked as abandoned. Fee changes have been applied and both teams have been notified where applicable.";',
].join("\n");
const savedConduct = [
  savedAnchor,
  '    case "formal-conduct-sent":',
  '      return "Formal conduct notice sent and logged in the responsible team’s conversation timeline.";',
  '    case "formal-conduct-queued":',
  '      return "Formal conduct notice queued. Check the responsible team’s conversation timeline for the final delivery status.";',
  '    case "formal-conduct-failed":',
  '      return "Formal conduct notice was not sent. Check the responsible team’s saved email address and Email audit before trying again.";',
].join("\n");

if (!page.includes('case "formal-conduct-sent":')) {
  if (!page.includes(savedAnchor)) {
    throw new Error("Could not find the abandonment saved-message block.");
  }
  page = page.replace(savedAnchor, savedConduct);
}

fs.writeFileSync(pagePath, page, "utf8");
console.log("Added admin recovery controls for abandoned-match emails and formal conduct notices.");
