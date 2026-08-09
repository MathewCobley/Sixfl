const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/match-fees/actions.ts",
);

if (!fs.existsSync(filePath)) {
  throw new Error("Matchday fee actions file is missing.");
}

let source = fs.readFileSync(filePath, "utf8");

const oldActorBlock = [
  '  const access = teamId ? await requireCaptain(teamId) : null;',
  '  redirectIfNotAdmin({ isAdmin: Boolean(access?.isAdmin), teamId, fixtureId });',
  '',
  '  if (!teamId || !fixtureId || !feeId) {',
].join("\n");

const newActorBlock = [
  '  const access = teamId ? await requireCaptain(teamId) : null;',
  '  redirectIfNotAdmin({ isAdmin: Boolean(access?.isAdmin), teamId, fixtureId });',
  '  const adminWaiverActor =',
  '    access?.user?.name?.trim() || access?.user?.email?.trim() || "SIXFL admin";',
  '',
  '  if (!teamId || !fixtureId || !feeId) {',
].join("\n");

const updateActionStart = source.indexOf(
  'export async function updateCaptainPlayerMatchFeeStatusAction(formData: FormData) {',
);
const reminderActionStart = source.indexOf(
  'export async function sendCaptainPlayerMatchFeeReminderAction(formData: FormData) {',
  updateActionStart,
);

if (updateActionStart < 0 || reminderActionStart < 0) {
  throw new Error("Could not locate the player fee status action.");
}

let actionSource = source.slice(updateActionStart, reminderActionStart);

if (!actionSource.includes('const adminWaiverActor =')) {
  if (!actionSource.includes(oldActorBlock)) {
    throw new Error("Could not add admin waiver actor attribution.");
  }
  actionSource = actionSource.replace(oldActorBlock, newActorBlock);
}

const oldNoteBlock = [
  '      note:',
  '        status === "CANCELLED"',
  '          ? appendNote({',
  '              existingNote: existingFee.note,',
  '              note: getAdminCancelledNote(wasPaid),',
  '            })',
  '          : undefined,',
].join("\n");

const newNoteBlock = [
  '      note:',
  '        status === "CANCELLED"',
  '          ? appendNote({',
  '              existingNote: existingFee.note,',
  '              note: getAdminCancelledNote(wasPaid),',
  '            })',
  '          : status === "WAIVED"',
  '            ? appendNote({',
  '                existingNote: existingFee.note,',
  '                note: `Fee waived manually by SIXFL admin: ${adminWaiverActor}.`,',
  '              })',
  '            : undefined,',
].join("\n");

if (!actionSource.includes('Fee waived manually by SIXFL admin:')) {
  if (!actionSource.includes(oldNoteBlock)) {
    throw new Error("Could not add explicit waiver audit note.");
  }
  actionSource = actionSource.replace(oldNoteBlock, newNoteBlock);
}

const oldCancelBlock = [
  '  if (status === "CANCELLED") {',
  '    await cancelQueuedPlayerMatchFeeNotificationDispatches([feeId]);',
  '  }',
].join("\n");
const newCancelBlock = [
  '  if (status === "WAIVED" || status === "CANCELLED") {',
  '    await cancelQueuedPlayerMatchFeeNotificationDispatches(',
  '      [feeId],',
  '      status === "WAIVED"',
  '        ? "Player match fee was explicitly waived by SIXFL admin."',
  '        : "Player match fee was cancelled by SIXFL admin.",',
  '    );',
  '  }',
].join("\n");

if (!actionSource.includes('Player match fee was explicitly waived by SIXFL admin.')) {
  if (!actionSource.includes(oldCancelBlock)) {
    throw new Error("Could not update waiver notification cancellation.");
  }
  actionSource = actionSource.replace(oldCancelBlock, newCancelBlock);
}

source =
  source.slice(0, updateActionStart) +
  actionSource +
  source.slice(reminderActionStart);

fs.writeFileSync(filePath, source, "utf8");

if (
  !source.includes('Fee waived manually by SIXFL admin:') ||
  !source.includes('Player match fee was explicitly waived by SIXFL admin.')
) {
  throw new Error("Explicit player fee waiver audit was not applied correctly.");
}

console.log(
  "Future manual player-fee waivers now record the admin identity and stop queued payment reminders.",
);
