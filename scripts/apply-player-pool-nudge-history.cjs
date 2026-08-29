const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(
  root,
  "src/app/(admin)/admin/player-pool/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in PlayerPool page.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import DeletePlayerPoolProfileButton from "@/components/admin/player-pool/DeletePlayerPoolProfileButton";',
  [
    'import DeletePlayerPoolProfileButton from "@/components/admin/player-pool/DeletePlayerPoolProfileButton";',
    'import BulkPlayerPoolProfileReminderButton from "@/components/admin/player-pool/BulkPlayerPoolProfileReminderButton";',
    'import PlayerPoolNudgeButton from "@/components/admin/player-pool/PlayerPoolNudgeButton";',
  ].join("\n"),
  "native profile reminder controls import",
);

replaceOnce(
  'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
  [
    'import { formatDateTimeInLondon } from "@/lib/datetime/london";',
    'import { ensurePlayerPoolProfileReminderTemplate } from "@/lib/player-pool/profile-reminders";',
  ].join("\n"),
  "profile reminder template import",
);

replaceOnce(
  [
    "  await requireAdmin();",
    "  await ensurePlayerPoolTables();",
    "",
    "  const params = (await searchParams) ?? {};",
  ].join("\n"),
  [
    "  await requireAdmin();",
    "  await ensurePlayerPoolTables();",
    "  await ensurePlayerPoolProfileReminderTemplate();",
    "",
    "  const params = (await searchParams) ?? {};",
  ].join("\n"),
  "profile reminder template initialisation",
);

replaceOnce(
  [
    "  invitedAt: Date | null;",
    "  profileSubmittedAt: Date | null;",
    "  firstName: string;",
  ].join("\n"),
  [
    "  invitedAt: Date | null;",
    "  profileSubmittedAt: Date | null;",
    "  nudgeCount: number;",
    "  lastNudgeAt: Date | null;",
    "  lastNudgeStatus: string | null;",
    "  lastNudgeBy: string | null;",
    "  firstName: string;",
  ].join("\n"),
  "nudge history profile fields",
);

replaceOnce(
  [
    '        profile."invitedAt",',
    '        profile."profileSubmittedAt",',
    '        prospect."firstName",',
  ].join("\n"),
  [
    '        profile."invitedAt",',
    '        profile."profileSubmittedAt",',
    '        COALESCE(nudge_history."nudgeCount", 0)::int AS "nudgeCount",',
    '        nudge_history."lastNudgeAt",',
    '        nudge_history."lastNudgeStatus",',
    '        nudge_history."lastNudgeBy",',
    '        prospect."firstName",',
  ].join("\n"),
  "nudge history select columns",
);

replaceOnce(
  [
    '      JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"',
    '      LEFT JOIN "League" league ON league."id" = profile."leagueId"',
    '      ORDER BY COALESCE(profile."profileSubmittedAt", profile."invitedAt", profile."createdAt") DESC',
  ].join("\n"),
  [
    '      JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"',
    '      LEFT JOIN "League" league ON league."id" = profile."leagueId"',
    '      LEFT JOIN LATERAL (',
    '        SELECT',
    '          (COUNT(*) OVER())::int AS "nudgeCount",',
    '          COALESCE(dispatch."sentAt", dispatch."failedAt", dispatch."processedAt", dispatch."createdAt") AS "lastNudgeAt",',
    '          dispatch."status"::text AS "lastNudgeStatus",',
    '          COALESCE(creator."name", creator."email", \'SIXFL admin\') AS "lastNudgeBy"',
    '        FROM "NotificationDispatch" dispatch',
    '        LEFT JOIN "User" creator ON creator."id" = dispatch."createdByUserId"',
    "        WHERE dispatch.\"sourceType\" = 'PLAYER_POOL_PROFILE_NUDGE'",
    '          AND dispatch."sourceId" = profile."id"',
    "          AND dispatch.\"channel\" = 'EMAIL'",
    '        ORDER BY COALESCE(dispatch."sentAt", dispatch."failedAt", dispatch."processedAt", dispatch."createdAt") DESC',
    '        LIMIT 1',
    '      ) nudge_history ON TRUE',
    '      ORDER BY COALESCE(profile."profileSubmittedAt", profile."invitedAt", profile."createdAt") DESC',
  ].join("\n"),
  "nudge dispatch history join",
);

replaceOnce(
  [
    "          </nav>",
    "        </div>",
    "",
    '        <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">',
  ].join("\n"),
  [
    "          </nav>",
    "        </div>",
    "",
    '        {selectedView === "awaiting" ? (',
    "          <BulkPlayerPoolProfileReminderButton awaitingCount={counts.awaiting} />",
    "        ) : null}",
    "",
    '        <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">',
  ].join("\n"),
  "bulk awaiting-profile reminder panel",
);

replaceOnce(
  [
    '                <div className="mt-4 flex justify-end border-t border-white/10 pt-4">',
    '                  <DeletePlayerPoolProfileButton',
    '                    profileId={profile.id}',
    '                    playerName={playerName}',
    '                    action={deletePlayerPoolProfileAction}',
    '                  />',
    '                </div>',
  ].join("\n"),
  [
    '                <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-end sm:justify-between">',
    '                  <PlayerPoolNudgeButton',
    '                    profileId={profile.id}',
    '                    playerName={playerName}',
    '                    canNudge={profile.status === "INVITED" && !profile.profileSubmittedAt}',
    '                    initialNudgeCount={profile.nudgeCount}',
    '                    initialLastNudgeAt={profile.lastNudgeAt?.toISOString() ?? null}',
    '                    initialLastNudgeStatus={profile.lastNudgeStatus}',
    '                    initialLastNudgeBy={profile.lastNudgeBy}',
    '                  />',
    '                  <DeletePlayerPoolProfileButton',
    '                    profileId={profile.id}',
    '                    playerName={playerName}',
    '                    action={deletePlayerPoolProfileAction}',
    '                  />',
    '                </div>',
  ].join("\n"),
  "native nudge history and action row",
);

fs.writeFileSync(pagePath, source, "utf8");

const bridgePath = path.join(
  root,
  "src/components/admin/player-pool/PlayerPoolNudgeBridge.tsx",
);
if (fs.existsSync(bridgePath)) {
  fs.writeFileSync(
    bridgePath,
    [
      '"use client";',
      "",
      "// Retained temporarily because the admin layout still imports this component.",
      "// The PlayerPool page now renders individual and bulk reminder controls natively.",
      "export default function PlayerPoolNudgeBridge() {",
      "  return null;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
}

if (
  !source.includes("PlayerPoolNudgeButton") ||
  !source.includes("BulkPlayerPoolProfileReminderButton") ||
  !source.includes("ensurePlayerPoolProfileReminderTemplate") ||
  !source.includes("awaitingCount={counts.awaiting}") ||
  !source.includes('dispatch."sourceType" = \'PLAYER_POOL_PROFILE_NUDGE\'') ||
  !source.includes("initialNudgeCount={profile.nudgeCount}")
) {
  throw new Error("PlayerPool profile reminder controls were not applied correctly.");
}

console.log(
  "PlayerPool reminders now include a bulk awaiting-profile email, an editable system template, and persistent per-player time, delivery status and sender history.",
);