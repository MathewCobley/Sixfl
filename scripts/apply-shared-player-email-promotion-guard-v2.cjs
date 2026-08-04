const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(absolute(relativePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

function addIdentityImport(source, label) {
  return replaceRequired(
    source,
    'import { prisma } from "@/lib/prisma";',
    [
      'import { normalisePlayerIdentityName } from "@/lib/players/player-identity-safety";',
      'import { prisma } from "@/lib/prisma";',
    ].join("\n"),
    `${label} identity import`,
  );
}

function patchPromotionFunction(input) {
  let source = addIdentityImport(read(input.file), input.label);
  const functionIndex = source.indexOf(input.functionMarker);
  if (functionIndex < 0) {
    throw new Error(`Expected ${input.label} function was not found.`);
  }

  const beforeAccess = input.accessBefore;
  const afterAccess = input.accessAfter;
  const accessIndex = source.indexOf(beforeAccess, functionIndex);
  if (accessIndex >= 0) {
    source =
      source.slice(0, accessIndex) +
      afterAccess +
      source.slice(accessIndex + beforeAccess.length);
  } else if (!source.includes(afterAccess)) {
    throw new Error(`Expected ${input.label} access check was not found.`);
  }

  const queryBefore = `  const user = normalizedEmail
    ? await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
        },
      })
    : null;

  const existingMembership = user`;

  const queryAfter = `  const user = normalizedEmail
    ? await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          name: true,
          _count: {
            select: {
              teamMembers: true,
              accounts: true,
              sessions: true,
            },
          },
        },
      })
    : null;

  const prospectName = [prospect.firstName, prospect.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const prospectNameKey = normalisePlayerIdentityName(prospectName);
  const existingNameKey = normalisePlayerIdentityName(user?.name);
  const existingAccountIsUsed = Boolean(
    user &&
      (user._count.teamMembers > 0 ||
        user._count.accounts > 0 ||
        user._count.sessions > 0),
  );
  const sharedEmailConflict = Boolean(
    user &&
      ((!existingNameKey && existingAccountIsUsed) ||
        (existingNameKey && existingNameKey !== prospectNameKey)),
  );

  if (sharedEmailConflict && user && normalizedEmail) {
    const existingDisplayName = user.name?.trim() || "another existing player";
    const message =
      \`That email address is already the login for \${existingDisplayName}. It cannot be used to identify \${prospectName || "this player"}. Add a unique login email; neither player has been linked, renamed or merged.\`;

    await prisma.$executeRawUnsafe(
      \`
        INSERT INTO "PlayerDuplicateAttempt" (
          "id",
          "teamId",
          "attemptedByUserId",
          "attemptedByEmail",
          "displayName",
          "email",
          "phone",
          "matchType",
          "matchedRecordId",
          "matchedTeamId",
          "reason",
          "createdAt"
        ) VALUES (
          md5(random()::text || clock_timestamp()::text || $1 || $2),
          $1,
          $3,
          $4,
          $5,
          $6,
          NULL,
          'SHARED_EMAIL_DIFFERENT_PLAYER:PROMOTION',
          $7,
          NULL,
          $8,
          NOW()
        )
      \`,
      ${input.teamVariable},
      prospect.id,
      access.user?.id ?? null,
      access.user?.email ?? access.session?.user?.email ?? null,
      prospectName || normalizedEmail,
      normalizedEmail,
      user.id,
      message,
    ).catch(() => undefined);

    redirect(${input.redirectExpression});
  }

  const existingMembership = user`;

  const queryIndex = source.indexOf(queryBefore, functionIndex);
  if (queryIndex >= 0) {
    source =
      source.slice(0, queryIndex) +
      queryAfter +
      source.slice(queryIndex + queryBefore.length);
  } else if (!source.includes("SHARED_EMAIL_DIFFERENT_PLAYER:PROMOTION")) {
    throw new Error(`Expected ${input.label} user lookup was not found.`);
  }

  write(input.file, source);
}

patchPromotionFunction({
  file: "src/app/(admin)/admin/teams/[id]/prospects/actions.ts",
  label: "admin prospect promotion",
  functionMarker: "export async function convertAdminProspectToMemberAction",
  accessBefore: "  await requireAdmin();",
  accessAfter: "  const access = await requireAdmin();",
  teamVariable: "teamId",
  redirectExpression:
    'buildRedirect(teamId, `?error=${encodeURIComponent(message)}`)',
});

patchPromotionFunction({
  file: "src/app/captain/team/[teamid]/prospects/actions.ts",
  label: "captain prospect promotion",
  functionMarker: "export async function convertProspectToMemberAction",
  accessBefore: "  await requireCaptain(teamid);",
  accessAfter: "  const access = await requireCaptain(teamid);",
  teamVariable: "teamid",
  redirectExpression:
    'buildProspectsRedirect(teamid, `?error=${encodeURIComponent(message)}`)',
});

for (const file of [
  "src/app/(admin)/admin/teams/[id]/prospects/actions.ts",
  "src/app/captain/team/[teamid]/prospects/actions.ts",
]) {
  const source = read(file);
  if (
    !source.includes("SHARED_EMAIL_DIFFERENT_PLAYER:PROMOTION") ||
    !source.includes("normalisePlayerIdentityName")
  ) {
    throw new Error(`${file} is missing the shared-email promotion guard.`);
  }
}

console.log(
  "Prospect promotion now blocks differently named players from sharing one login account and records every conflict.",
);
