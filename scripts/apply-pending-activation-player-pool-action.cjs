const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/squad/page.tsx",
);

let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in captain squad page.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  'import FormListboxField from "@/components/ui/FormListboxField";',
  [
    'import PendingActivationPlayerPoolButton from "@/components/captain/PendingActivationPlayerPoolButton";',
    'import FormListboxField from "@/components/ui/FormListboxField";',
  ].join("\n"),
  "pending activation PlayerPool component import",
);

const prospectCommsBlock = [
  "                            {canOpenAdminComms ? (",
  "                              <CommunicationButton",
  "                                href={`/admin/teams/${teamid}/prospects/${prospect.id}/communications`}",
  '                                label="Prospect comms"',
  "                              />",
  "                            ) : null}",
].join("\n");

const prospectCommsWithPlayerPool = [
  prospectCommsBlock,
  "                            {canOpenAdminComms ? (",
  "                              <PendingActivationPlayerPoolButton",
  "                                teamId={teamid}",
  "                                prospectId={prospect.id}",
  '                                playerName={fullName || "this player"}',
  "                                hasEmail={hasEmail}",
  "                              />",
  "                            ) : null}",
].join("\n");

replaceRequired(
  prospectCommsBlock,
  prospectCommsWithPlayerPool,
  "pending activation card action area",
);

fs.writeFileSync(pagePath, source, "utf8");

const finalSource = fs.readFileSync(pagePath, "utf8");
if (
  !finalSource.includes("PendingActivationPlayerPoolButton") ||
  !finalSource.includes("prospectId={prospect.id}") ||
  !finalSource.includes("hasEmail={hasEmail}")
) {
  throw new Error(
    "Direct pending activation PlayerPool action was not mounted correctly.",
  );
}

console.log(
  "Pending activation cards now have a direct admin-only Move to PlayerPool action.",
);
