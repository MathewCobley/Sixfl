const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(
  root,
  "src/lib/players/add-player-without-duplicates.ts",
);

let source = fs.readFileSync(servicePath, "utf8");

const typeAnchor = `type SameTeamNameRow = {
  membershipId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
};`;

const managerType = `${typeAnchor}

type ManagerControlledTeamNameRow = {
  membershipId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  teamId: string;
  teamName: string;
};`;

if (!source.includes("type ManagerControlledTeamNameRow")) {
  if (!source.includes(typeAnchor)) {
    throw new Error("Cross-team duplicate guard type anchor was not found.");
  }
  source = source.replace(typeAnchor, managerType);
}

const sameTeamBlockEnd = `    if (sameTeamNameRows[0]) {
      return block(tx, input, {
        ok: false,
        code: "ALREADY_IN_TEAM",
        message:
          "A player with this name is already in the squad. Open and update the existing player instead of creating another record.",
        matchedType: "TEAM_MEMBER_NAME",
        matchedRecordId: sameTeamNameRows[0].membershipId,
        matchedTeamId: input.teamId,
      });
    }

    const emailUser = email`;

const crossTeamLookup = `    if (sameTeamNameRows[0]) {
      return block(tx, input, {
        ok: false,
        code: "ALREADY_IN_TEAM",
        message:
          "A player with this name is already in the squad. Open and update the existing player instead of creating another record.",
        matchedType: "TEAM_MEMBER_NAME",
        matchedRecordId: sameTeamNameRows[0].membershipId,
        matchedTeamId: input.teamId,
      });
    }

    const managerControlledTeamNameRows = input.attemptedByUserId
      ? ((await tx.$queryRawUnsafe(
          \`
            WITH controlled_teams AS (
              SELECT DISTINCT team."id"
              FROM "Team" team
              LEFT JOIN "TeamMember" access_member
                ON access_member."teamId" = team."id"
               AND access_member."userId" = $1
              WHERE team."captainUserId" = $1
                 OR access_member."role" IN ('CAPTAIN', 'MANAGER', 'VICE_CAPTAIN')
            )
            SELECT
              player_member."id" AS "membershipId",
              player_user."id" AS "userId",
              player_user."name" AS "userName",
              player_user."email" AS "userEmail",
              player_team."id" AS "teamId",
              player_team."name" AS "teamName"
            FROM controlled_teams controlled
            INNER JOIN "TeamMember" player_member
              ON player_member."teamId" = controlled."id"
            INNER JOIN "User" player_user
              ON player_user."id" = player_member."userId"
            INNER JOIN "Team" player_team
              ON player_team."id" = player_member."teamId"
            WHERE player_member."teamId" <> $2
              AND LOWER(
                REGEXP_REPLACE(
                  BTRIM(COALESCE(player_user."name", '')),
                  '[[:space:]]+',
                  ' ',
                  'g'
                )
              ) = $3
            ORDER BY player_member."createdAt" ASC
            LIMIT 1
          \`,
          input.attemptedByUserId,
          input.teamId,
          normalisedPlayerName,
        )) as ManagerControlledTeamNameRow[])
      : [];
    const managerControlledTeamNameMatch =
      managerControlledTeamNameRows[0] ?? null;

    const emailUser = email`;

if (!source.includes("managerControlledTeamNameRows")) {
  if (!source.includes(sameTeamBlockEnd)) {
    throw new Error("Cross-team duplicate guard lookup anchor was not found.");
  }
  source = source.replace(sameTeamBlockEnd, crossTeamLookup);
}

const existingUserAnchor = `    const existingUserId = emailUser?.id ?? phoneUser?.userId ?? null;

    if (existingUserId) {`;

const crossTeamDecision = `    const existingUserId = emailUser?.id ?? phoneUser?.userId ?? null;

    if (managerControlledTeamNameMatch) {
      if (!existingUserId) {
        return block(tx, input, {
          ok: false,
          code: "AMBIGUOUS_IDENTITY",
          message:
            \`A player called \${displayName} already exists in \${managerControlledTeamNameMatch.teamName}, another team you control. Open that player and add the existing account to this team instead of creating a new person.\`,
          matchedType: "MANAGER_OTHER_TEAM_NAME",
          matchedRecordId: managerControlledTeamNameMatch.membershipId,
          matchedTeamId: managerControlledTeamNameMatch.teamId,
        });
      }

      if (existingUserId !== managerControlledTeamNameMatch.userId) {
        return block(tx, input, {
          ok: false,
          code: "AMBIGUOUS_IDENTITY",
          message:
            \`A player called \${displayName} already exists in \${managerControlledTeamNameMatch.teamName}, but the contact details entered match a different account. SIXFL must resolve the records before another membership can be added.\`,
          matchedType: "MANAGER_OTHER_TEAM_IDENTITY_CONFLICT",
          matchedRecordId: managerControlledTeamNameMatch.membershipId,
          matchedTeamId: managerControlledTeamNameMatch.teamId,
        });
      }
    }

    if (existingUserId) {`;

if (!source.includes("MANAGER_OTHER_TEAM_NAME")) {
  if (!source.includes(existingUserAnchor)) {
    throw new Error("Cross-team duplicate guard decision anchor was not found.");
  }
  source = source.replace(existingUserAnchor, crossTeamDecision);
}

fs.writeFileSync(servicePath, source, "utf8");

if (
  !source.includes("managerControlledTeamNameRows") ||
  !source.includes("MANAGER_OTHER_TEAM_IDENTITY_CONFLICT")
) {
  throw new Error("Manager cross-team player duplicate guard was not applied.");
}

console.log(
  "Managers cannot create a second person record for a player already present in another team they control.",
);
