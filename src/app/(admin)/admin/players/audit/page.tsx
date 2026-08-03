import Link from "next/link";
import { Prisma } from "@prisma/client";

import { ensurePlayerPoolTables } from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Record Audit | SIXFL",
};

type SearchParams = {
  q?: string;
  team?: string;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  hasLogin: boolean;
  lastSessionExpires: Date | null;
};

type MembershipRow = {
  id: string;
  userId: string;
  teamId: string;
  role: string;
  createdAt: Date;
  teamName: string;
  teamManagerNotes: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

type ProfileRow = {
  teamMemberId: string;
  sourceProspectId: string | null;
  phone: string | null;
  notes: string | null;
  updatedAt: Date | null;
};

type ProspectRow = {
  id: string;
  teamId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  teamName: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

type PlayerPoolRow = {
  id: string;
  prospectId: string;
  publicCode: string;
  emailNormalized: string;
  status: string;
  leagueId: string | null;
  invitedAt: Date | null;
  profileSubmittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  prospectName: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

type MergeRow = {
  id: string;
  keptUserId: string;
  mergedUserId: string;
  mergedByUserId: string | null;
  keptEmail: string | null;
  mergedEmail: string | null;
  summary: Prisma.JsonValue | null;
  createdAt: Date;
  keptName: string | null;
  mergedName: string | null;
  mergedByName: string | null;
  mergedByEmail: string | null;
};

type FeeRow = {
  id: string;
  teamMemberId: string | null;
  prospectId: string | null;
  amountPence: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  teamId: string;
  teamName: string;
  kickoffAt: Date;
  opponentName: string;
  currentName: string | null;
  currentEmail: string | null;
  historicalName: string | null;
  historicalEmail: string | null;
  historicalPhone: string | null;
};

type ResultRow = {
  id: string;
  teamId: string;
  teamName: string;
  kickoffAt: Date;
  opponentName: string;
  playerOfMatchName: string | null;
  scorersText: string | null;
};

type MembershipAuditRow = {
  id: bigint | number;
  operation: string;
  teamMemberId: string;
  userId: string;
  oldTeamId: string | null;
  newTeamId: string | null;
  oldRole: string | null;
  newRole: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  applicationName: string | null;
  transactionId: bigint | number;
  changedAt: Date;
  oldTeamName: string | null;
  newTeamName: string | null;
};

type TeamRecordRow = {
  id: string;
  name: string;
  managerNotes: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
  memberCount: number;
};

type Cause = {
  tone: "emerald" | "amber" | "red" | "sky";
  title: string;
  explanation: string;
  evidence: string[];
};

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function displayName(input: { name: string | null; email: string | null }) {
  return input.name?.trim() || input.email?.trim() || "Unnamed account";
}

function prospectName(prospect: ProspectRow) {
  return (
    [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim() ||
    prospect.email ||
    prospect.phone ||
    "Unnamed prospect"
  );
}

function toneClasses(tone: Cause["tone"]) {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-50";
    case "amber":
      return "border-amber-400/25 bg-amber-500/10 text-amber-50";
    case "red":
      return "border-red-400/25 bg-red-500/10 text-red-50";
    default:
      return "border-sky-400/25 bg-sky-500/10 text-sky-50";
  }
}

async function safeQuery<T>(label: string, query: Prisma.Sql): Promise<T[]> {
  try {
    return await prisma.$queryRaw<T[]>(query);
  } catch (error) {
    console.error(`Player record audit query failed: ${label}`, error);
    return [];
  }
}

function analyseCause(input: {
  query: string;
  team: string;
  users: UserRow[];
  memberships: MembershipRow[];
  prospects: ProspectRow[];
  poolProfiles: PlayerPoolRow[];
  merges: MergeRow[];
  fees: FeeRow[];
  auditRows: MembershipAuditRow[];
}): Cause {
  const targetTeam = input.team.trim().toLowerCase();
  const targetMemberships = targetTeam
    ? input.memberships.filter((membership) =>
        membership.teamName.toLowerCase().includes(targetTeam),
      )
    : input.memberships;
  const healthyTargetMemberships = targetMemberships.filter(
    (membership) =>
      !membership.teamManagerNotes?.trim().toUpperCase().startsWith("MERGED INTO "),
  );
  const strandedMembership = targetMemberships.find((membership) =>
    membership.teamManagerNotes?.trim().toUpperCase().startsWith("MERGED INTO "),
  );
  const latestAudit = input.auditRows[0] ?? null;
  const deletedAudit = input.auditRows.find((row) => row.operation === "DELETE");
  const movedProspect = input.prospects.find((prospect) => {
    const evidence = `${prospect.source ?? ""} ${prospect.notes ?? ""} ${prospect.status}`.toLowerCase();
    return /moved from active squad|marked not interested|marked duplicate|playerpool|player pool/.test(
      evidence,
    );
  });
  const merge = input.merges[0] ?? null;
  const orphanFees = input.fees.filter(
    (fee) => !fee.teamMemberId && !fee.prospectId,
  );

  if (healthyTargetMemberships.length > 0) {
    return {
      tone: "emerald",
      title: `The player still has an active ${healthyTargetMemberships[0].teamName} squad record`,
      explanation:
        "The database link still exists. The problem is therefore a page/filter/current-season display issue rather than the player having been removed.",
      evidence: healthyTargetMemberships.map(
        (membership) =>
          `${membership.teamName} · ${membership.role} · added ${formatDate(membership.createdAt)}`,
      ),
    };
  }

  if (strandedMembership) {
    return {
      tone: "red",
      title: "The player is stranded on a team record that was marked as merged",
      explanation:
        "Their TeamMember row still exists, but it is attached to an old duplicate team record instead of the current team. That makes them disappear from the current squad without deleting their account.",
      evidence: [
        `${strandedMembership.teamName} · ${strandedMembership.teamManagerNotes}`,
        `Membership ID ${strandedMembership.id}`,
      ],
    };
  }

  if (deletedAudit) {
    return {
      tone: "red",
      title: "The squad membership was deleted",
      explanation:
        "The database audit trigger recorded the removal. The evidence below shows the exact time, old team and any actor identity supplied by the application.",
      evidence: [
        `${deletedAudit.oldTeamName ?? deletedAudit.oldTeamId ?? "Unknown team"} · ${formatDate(deletedAudit.changedAt)}`,
        deletedAudit.actorEmail
          ? `Triggered by ${deletedAudit.actorEmail}`
          : "No application actor was supplied for this change.",
      ],
    };
  }

  if (movedProspect) {
    return {
      tone: "amber",
      title: "The player was moved out of the active squad into the prospect pipeline",
      explanation:
        "A surviving prospect record records the move. This is not a total deletion: the player details were retained outside the active squad.",
      evidence: [
        `${prospectName(movedProspect)} · status ${movedProspect.status}`,
        `Source: ${movedProspect.source || "Not recorded"}`,
        `Last updated ${formatDate(movedProspect.updatedAt)}`,
        movedProspect.notes || "No prospect note was recorded.",
      ],
    };
  }

  if (input.poolProfiles.length > 0 && input.memberships.length === 0) {
    const profile = input.poolProfiles[0];
    return {
      tone: "amber",
      title: "The player is in PlayerPool rather than an active squad",
      explanation:
        "The PlayerPool profile survives, but there is no current TeamMember row. This usually means the player was moved from the squad into PlayerPool or returned to the prospect pipeline.",
      evidence: [
        `PlayerPool ${profile.publicCode} · ${profile.status}`,
        `Invited ${formatDate(profile.invitedAt)}`,
        `Updated ${formatDate(profile.updatedAt)}`,
      ],
    };
  }

  if (merge) {
    return {
      tone: "sky",
      title: "A duplicate player-account merge affected this identity",
      explanation:
        "One account was deliberately disabled and its squad cards/history were transferred to the account kept by the merge. The audit below identifies both accounts and who performed it.",
      evidence: [
        `Kept: ${merge.keptName || merge.keptEmail || merge.keptUserId}`,
        `Disabled: ${merge.mergedName || merge.mergedEmail || merge.mergedUserId}`,
        `Merged ${formatDate(merge.createdAt)} by ${merge.mergedByName || merge.mergedByEmail || "unknown admin"}`,
      ],
    };
  }

  if (input.memberships.length > 0) {
    return {
      tone: "amber",
      title: "The player is attached to a different team record",
      explanation:
        "The account still has squad membership, but not for the team searched above. This can happen after a team move, a duplicate-team merge or a player being added against the wrong season/team record.",
      evidence: input.memberships.map(
        (membership) =>
          `${membership.teamName} · ${membership.role} · ${membership.leagueName ?? "No league"} ${membership.leagueSeason ?? ""}`.trim(),
      ),
    };
  }

  if (orphanFees.length > 0) {
    return {
      tone: "red",
      title: "The player’s squad/prospect link was removed or merged, leaving historical payment rows behind",
      explanation:
        "PlayerMatchFee deliberately keeps historical fees when a TeamMember is deleted by setting its link to null. That is why the old payment evidence survives even though the current squad card has disappeared. Older removals were not actor-audited, so the surviving records can prove removal/merge but may not prove who clicked it.",
      evidence: orphanFees.slice(0, 5).map(
        (fee) =>
          `${fee.teamName} vs ${fee.opponentName} · ${formatDate(fee.kickoffAt)} · ${formatMoney(fee.amountPence)} · identity ${fee.historicalName || fee.historicalEmail || fee.historicalPhone || "not recovered"}`,
      ),
    };
  }

  if (input.users.length > 0) {
    return {
      tone: "red",
      title: "The player account exists, but no active squad link survives",
      explanation:
        "No current membership, prospect move, PlayerPool record or account merge explains the loss. The most likely historical path is the old direct Remove action or a cascade from a deleted team. Before today, direct TeamMember deletions were not written to a dedicated audit table.",
      evidence: input.users.map(
        (user) => `${displayName(user)} · ${user.email || "No email"} · user ${user.id}`,
      ),
    };
  }

  if (latestAudit) {
    return {
      tone: "sky",
      title: "A membership audit record was found without a surviving account match",
      explanation:
        "The audit trail contains a TeamMember change, but the current player search no longer resolves the associated User record under this name/email.",
      evidence: [
        `${latestAudit.operation} · ${formatDate(latestAudit.changedAt)}`,
        `User ${latestAudit.userId} · membership ${latestAudit.teamMemberId}`,
      ],
    };
  }

  return {
    tone: "red",
    title: "No surviving player identity was found",
    explanation:
      "The search did not find a current user, squad card, prospect, PlayerPool profile, merge record or historical fee identity. Try the player’s email address or mobile number, which is more reliable than a name-only search.",
    evidence: [`Search used: ${input.query}`],
  };
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
          {count}
        </span>
      </div>
      <div className="divide-y divide-white/10">{children}</div>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-5 text-sm text-white/45">{children}</div>;
}

export default async function PlayerRecordAuditPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const query = clean(params.q);
  const targetTeam = clean(params.team);
  const pattern = `%${query.toLowerCase()}%`;

  let users: UserRow[] = [];
  let memberships: MembershipRow[] = [];
  let profiles: ProfileRow[] = [];
  let prospects: ProspectRow[] = [];
  let poolProfiles: PlayerPoolRow[] = [];
  let merges: MergeRow[] = [];
  let fees: FeeRow[] = [];
  let results: ResultRow[] = [];
  let auditRows: MembershipAuditRow[] = [];
  let teamRecords: TeamRecordRow[] = [];

  if (query.length >= 2) {
    const [directUsers, profileUsers] = await Promise.all([
      safeQuery<UserRow>(
        "users by identity",
        Prisma.sql`
          SELECT
            user_row."id",
            user_row."name",
            user_row."email",
            user_row."role"::text AS "role",
            EXISTS (
              SELECT 1 FROM "Account" account
              WHERE account."userId" = user_row."id"
            ) AS "hasLogin",
            (
              SELECT MAX(session."expires")
              FROM "Session" session
              WHERE session."userId" = user_row."id"
            ) AS "lastSessionExpires"
          FROM "User" user_row
          WHERE LOWER(COALESCE(user_row."name", '')) LIKE ${pattern}
             OR LOWER(COALESCE(user_row."email", '')) LIKE ${pattern}
          ORDER BY
            CASE WHEN LOWER(COALESCE(user_row."name", '')) = ${query.toLowerCase()} THEN 0 ELSE 1 END,
            COALESCE(user_row."name", user_row."email", user_row."id") ASC
          LIMIT 50
        `,
      ),
      safeQuery<UserRow>(
        "users by profile phone",
        Prisma.sql`
          SELECT DISTINCT
            user_row."id",
            user_row."name",
            user_row."email",
            user_row."role"::text AS "role",
            EXISTS (
              SELECT 1 FROM "Account" account
              WHERE account."userId" = user_row."id"
            ) AS "hasLogin",
            (
              SELECT MAX(session."expires")
              FROM "Session" session
              WHERE session."userId" = user_row."id"
            ) AS "lastSessionExpires"
          FROM "User" user_row
          INNER JOIN "TeamMember" member ON member."userId" = user_row."id"
          INNER JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = member."id"
          WHERE LOWER(COALESCE(profile."phone", '')) LIKE ${pattern}
          LIMIT 50
        `,
      ),
    ]);

    const userById = new Map<string, UserRow>();
    for (const user of [...directUsers, ...profileUsers]) userById.set(user.id, user);
    users = Array.from(userById.values());
    const userIds = users.map((user) => user.id);

    if (userIds.length > 0) {
      memberships = await safeQuery<MembershipRow>(
        "current squad memberships",
        Prisma.sql`
          SELECT
            member."id",
            member."userId",
            member."teamId",
            member."role"::text AS "role",
            member."createdAt",
            team."name" AS "teamName",
            team."managerNotes" AS "teamManagerNotes",
            league."name" AS "leagueName",
            league."season" AS "leagueSeason"
          FROM "TeamMember" member
          INNER JOIN "Team" team ON team."id" = member."teamId"
          LEFT JOIN "League" league ON league."id" = team."leagueId"
          WHERE member."userId" IN (${Prisma.join(userIds)})
          ORDER BY team."name" ASC, member."createdAt" ASC
        `,
      );

      profiles = await safeQuery<ProfileRow>(
        "team member profiles",
        memberships.length
          ? Prisma.sql`
              SELECT
                profile."teamMemberId",
                profile."sourceProspectId",
                profile."phone",
                profile."notes",
                profile."updatedAt"
              FROM "TeamMemberProfile" profile
              WHERE profile."teamMemberId" IN (${Prisma.join(
                memberships.map((membership) => membership.id),
              )})
            `
          : Prisma.sql`SELECT NULL WHERE FALSE`,
      );

      auditRows = await safeQuery<MembershipAuditRow>(
        "membership audit log",
        Prisma.sql`
          SELECT
            audit."id",
            audit."operation",
            audit."teamMemberId",
            audit."userId",
            audit."oldTeamId",
            audit."newTeamId",
            audit."oldRole",
            audit."newRole",
            audit."actorUserId",
            audit."actorEmail",
            audit."applicationName",
            audit."transactionId",
            audit."changedAt",
            old_team."name" AS "oldTeamName",
            new_team."name" AS "newTeamName"
          FROM "TeamMemberAuditLog" audit
          LEFT JOIN "Team" old_team ON old_team."id" = audit."oldTeamId"
          LEFT JOIN "Team" new_team ON new_team."id" = audit."newTeamId"
          WHERE audit."userId" IN (${Prisma.join(userIds)})
          ORDER BY audit."changedAt" DESC, audit."id" DESC
          LIMIT 200
        `,
      );
    }

    const sourceProspectIds = profiles
      .map((profile) => profile.sourceProspectId)
      .filter((value): value is string => Boolean(value));

    prospects = await safeQuery<ProspectRow>(
      "prospect history",
      Prisma.sql`
        SELECT
          prospect."id",
          prospect."teamId",
          prospect."firstName",
          prospect."lastName",
          prospect."email",
          prospect."phone",
          prospect."status",
          prospect."source",
          prospect."notes",
          prospect."createdAt",
          prospect."updatedAt",
          team."name" AS "teamName",
          league."name" AS "leagueName",
          league."season" AS "leagueSeason"
        FROM "TeamPlayerProspect" prospect
        LEFT JOIN "Team" team ON team."id" = prospect."teamId"
        LEFT JOIN "League" league ON league."id" = team."leagueId"
        WHERE LOWER(CONCAT_WS(' ', prospect."firstName", prospect."lastName")) LIKE ${pattern}
           OR LOWER(COALESCE(prospect."email", '')) LIKE ${pattern}
           OR LOWER(COALESCE(prospect."phone", '')) LIKE ${pattern}
           ${
             sourceProspectIds.length
               ? Prisma.sql`OR prospect."id" IN (${Prisma.join(sourceProspectIds)})`
               : Prisma.empty
           }
        ORDER BY prospect."updatedAt" DESC
        LIMIT 100
      `,
    );

    try {
      await ensurePlayerPoolTables();
      poolProfiles = await safeQuery<PlayerPoolRow>(
        "PlayerPool profiles",
        Prisma.sql`
          SELECT
            profile."id",
            profile."prospectId",
            profile."publicCode",
            profile."emailNormalized",
            profile."status",
            profile."leagueId",
            profile."invitedAt",
            profile."profileSubmittedAt",
            profile."createdAt",
            profile."updatedAt",
            NULLIF(BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '') AS "prospectName",
            league."name" AS "leagueName",
            league."season" AS "leagueSeason"
          FROM "PlayerPoolProfile" profile
          LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
          LEFT JOIN "League" league ON league."id" = profile."leagueId"
          WHERE LOWER(COALESCE(profile."emailNormalized", '')) LIKE ${pattern}
             OR LOWER(CONCAT_WS(' ', prospect."firstName", prospect."lastName")) LIKE ${pattern}
          ORDER BY profile."updatedAt" DESC
          LIMIT 50
        `,
      );
    } catch (error) {
      console.error("Player record audit could not initialise PlayerPool tables", error);
    }

    merges = await safeQuery<MergeRow>(
      "player account merges",
      Prisma.sql`
        SELECT
          merge_row."id",
          merge_row."keptUserId",
          merge_row."mergedUserId",
          merge_row."mergedByUserId",
          merge_row."keptEmail",
          merge_row."mergedEmail",
          merge_row."summary",
          merge_row."createdAt",
          kept_user."name" AS "keptName",
          merged_user."name" AS "mergedName",
          actor."name" AS "mergedByName",
          actor."email" AS "mergedByEmail"
        FROM "PlayerAccountMerge" merge_row
        INNER JOIN "User" kept_user ON kept_user."id" = merge_row."keptUserId"
        INNER JOIN "User" merged_user ON merged_user."id" = merge_row."mergedUserId"
        LEFT JOIN "User" actor ON actor."id" = merge_row."mergedByUserId"
        WHERE LOWER(COALESCE(merge_row."keptEmail", '')) LIKE ${pattern}
           OR LOWER(COALESCE(merge_row."mergedEmail", '')) LIKE ${pattern}
           OR LOWER(COALESCE(kept_user."name", '')) LIKE ${pattern}
           OR LOWER(COALESCE(merged_user."name", '')) LIKE ${pattern}
           ${
             userIds.length
               ? Prisma.sql`OR merge_row."keptUserId" IN (${Prisma.join(userIds)})
                    OR merge_row."mergedUserId" IN (${Prisma.join(userIds)})`
               : Prisma.empty
           }
        ORDER BY merge_row."createdAt" DESC
        LIMIT 50
      `,
    );

    fees = await safeQuery<FeeRow>(
      "historical player fees",
      Prisma.sql`
        SELECT
          fee."id",
          fee."teamMemberId",
          fee."prospectId",
          fee."amountPence",
          fee."status"::text AS "status",
          fee."createdAt",
          fee."updatedAt",
          fee."teamId",
          team."name" AS "teamName",
          fixture."kickoffAt",
          CASE
            WHEN fixture."homeTeamId" = fee."teamId" THEN away_team."name"
            ELSE home_team."name"
          END AS "opponentName",
          COALESCE(current_user."name", NULLIF(BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '')) AS "currentName",
          COALESCE(current_user."email", prospect."email") AS "currentEmail",
          historical_recipient."displayName" AS "historicalName",
          historical_recipient."email" AS "historicalEmail",
          historical_recipient."phone" AS "historicalPhone"
        FROM "PlayerMatchFee" fee
        INNER JOIN "Team" team ON team."id" = fee."teamId"
        INNER JOIN "Fixture" fixture ON fixture."id" = fee."fixtureId"
        INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
        INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
        LEFT JOIN "TeamMember" current_member ON current_member."id" = fee."teamMemberId"
        LEFT JOIN "User" current_user ON current_user."id" = current_member."userId"
        LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = fee."prospectId"
        LEFT JOIN "NotificationRecipient" historical_recipient
          ON historical_recipient."sourceType"::text = 'GENERAL'
         AND historical_recipient."sourceId" = CONCAT('player-match-fee:', fee."id")
        WHERE LOWER(COALESCE(current_user."name", '')) LIKE ${pattern}
           OR LOWER(COALESCE(current_user."email", '')) LIKE ${pattern}
           OR LOWER(CONCAT_WS(' ', prospect."firstName", prospect."lastName")) LIKE ${pattern}
           OR LOWER(COALESCE(prospect."email", '')) LIKE ${pattern}
           OR LOWER(COALESCE(historical_recipient."displayName", '')) LIKE ${pattern}
           OR LOWER(COALESCE(historical_recipient."email", '')) LIKE ${pattern}
           OR LOWER(COALESCE(historical_recipient."phone", '')) LIKE ${pattern}
        ORDER BY fixture."kickoffAt" DESC, fee."createdAt" DESC
        LIMIT 100
      `,
    );

    results = await safeQuery<ResultRow>(
      "result and Player of the Match history",
      Prisma.sql`
        SELECT
          metadata."id",
          metadata."teamId",
          team."name" AS "teamName",
          fixture."kickoffAt",
          CASE
            WHEN fixture."homeTeamId" = metadata."teamId" THEN away_team."name"
            ELSE home_team."name"
          END AS "opponentName",
          metadata."playerOfMatchName",
          metadata."scorers"::text AS "scorersText"
        FROM "MatchResultTeamMeta" metadata
        INNER JOIN "Team" team ON team."id" = metadata."teamId"
        INNER JOIN "MatchResult" result ON result."id" = metadata."matchResultId"
        INNER JOIN "Fixture" fixture ON fixture."id" = result."fixtureId"
        INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
        INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
        WHERE LOWER(COALESCE(metadata."playerOfMatchName", '')) LIKE ${pattern}
           OR LOWER(COALESCE(metadata."scorers"::text, '')) LIKE ${pattern}
        ORDER BY fixture."kickoffAt" DESC
        LIMIT 100
      `,
    );

    if (targetTeam) {
      const teamPattern = `%${targetTeam.toLowerCase()}%`;
      teamRecords = await safeQuery<TeamRecordRow>(
        "matching team records",
        Prisma.sql`
          SELECT
            team."id",
            team."name",
            team."managerNotes",
            league."name" AS "leagueName",
            league."season" AS "leagueSeason",
            (
              SELECT COUNT(*)::int
              FROM "TeamMember" member
              WHERE member."teamId" = team."id"
            ) AS "memberCount"
          FROM "Team" team
          LEFT JOIN "League" league ON league."id" = team."leagueId"
          WHERE LOWER(team."name") LIKE ${teamPattern}
          ORDER BY
            CASE WHEN team."managerNotes" ILIKE 'MERGED INTO %' THEN 1 ELSE 0 END,
            COALESCE(league."season", '') DESC,
            team."id"
        `,
      );
    }
  }

  const cause = query.length >= 2
    ? analyseCause({
        query,
        team: targetTeam,
        users,
        memberships,
        prospects,
        poolProfiles,
        merges,
        fees,
        auditRows,
      })
    : null;
  const profileByMemberId = new Map(
    profiles.map((profile) => [profile.teamMemberId, profile]),
  );

  return (
    <div className="w-full space-y-7 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-violet-400/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.17),transparent_36%),rgba(255,255,255,0.035)] p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/75">
          Admin player tools
        </p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Player record audit
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Trace a player across user accounts, current squad cards, old prospects, PlayerPool, duplicate-account merges, match fees and results. This page is read-only.
            </p>
          </div>
          <Link
            href="/admin/teams"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
          >
            Back to teams
          </Link>
        </div>

        <form method="get" className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto]">
          <label className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
              Player name, email or mobile
            </span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              required
              minLength={2}
              placeholder="Adesina Arije"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-400/50"
            />
          </label>
          <label className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
              Expected team
            </span>
            <input
              type="search"
              name="team"
              defaultValue={targetTeam}
              placeholder="Crescent United"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-400/50"
            />
          </label>
          <button
            type="submit"
            className="mt-auto inline-flex h-12 items-center justify-center rounded-2xl bg-violet-300 px-6 text-sm font-black text-black transition hover:bg-violet-200"
          >
            Run audit
          </button>
        </form>
      </section>

      {cause ? (
        <section className={`rounded-3xl border p-6 ${toneClasses(cause.tone)}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
            Most likely explanation
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{cause.title}</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/75">
            {cause.explanation}
          </p>
          <div className="mt-4 space-y-2">
            {cause.evidence.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
                {item}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center text-sm text-white/50">
          Search for a player to build the audit report.
        </section>
      )}

      {query.length >= 2 ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="User accounts" count={users.length}>
            {users.length === 0 ? <EmptyRow>No matching User account.</EmptyRow> : users.map((user) => (
              <div key={user.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{displayName(user)}</div>
                    <div className="mt-1 text-sm text-white/55">{user.email || "No email"}</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-mono text-[11px] text-white/50">
                    {user.id}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/65">{user.role}</span>
                  <span className={`rounded-full border px-3 py-1 ${user.hasLogin ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/45"}`}>
                    {user.hasLogin ? "Login account exists" : "No login account"}
                  </span>
                  {user.lastSessionExpires ? (
                    <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-sky-100">
                      Session expires {formatDate(user.lastSessionExpires)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </Section>

          <Section title="Current squad memberships" count={memberships.length}>
            {memberships.length === 0 ? <EmptyRow>No current TeamMember row.</EmptyRow> : memberships.map((membership) => {
              const profile = profileByMemberId.get(membership.id);
              return (
                <div key={membership.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/admin/teams/${membership.teamId}/squad`} className="font-semibold text-emerald-200 hover:text-emerald-100">
                        {membership.teamName}
                      </Link>
                      <div className="mt-1 text-sm text-white/55">
                        {membership.role} · {[membership.leagueName, membership.leagueSeason].filter(Boolean).join(" · ") || "No current league"}
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/50">
                      Added {formatDate(membership.createdAt)}
                    </span>
                  </div>
                  {membership.teamManagerNotes ? (
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Team note: {membership.teamManagerNotes}
                    </div>
                  ) : null}
                  {profile ? (
                    <div className="mt-3 text-xs leading-5 text-white/50">
                      Phone: {profile.phone || "—"} · Source prospect: {profile.sourceProspectId || "—"}
                      {profile.notes ? ` · ${profile.notes}` : ""}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Section>

          <Section title="Prospect history" count={prospects.length}>
            {prospects.length === 0 ? <EmptyRow>No matching prospect record.</EmptyRow> : prospects.map((prospect) => (
              <div key={prospect.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{prospectName(prospect)}</div>
                    <div className="mt-1 text-sm text-white/55">
                      {prospect.email || "No email"}{prospect.phone ? ` · ${prospect.phone}` : ""}
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
                    {prospect.status}
                  </span>
                </div>
                <div className="mt-3 text-sm text-white/60">
                  Held under: {prospect.teamName || "Unassigned"}
                  {prospect.leagueName ? ` · ${prospect.leagueName}${prospect.leagueSeason ? ` · ${prospect.leagueSeason}` : ""}` : ""}
                </div>
                <div className="mt-2 text-xs leading-5 text-white/45">
                  Source: {prospect.source || "—"} · updated {formatDate(prospect.updatedAt)}
                </div>
                {prospect.notes ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/60">
                    {prospect.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </Section>

          <Section title="PlayerPool profiles" count={poolProfiles.length}>
            {poolProfiles.length === 0 ? <EmptyRow>No matching PlayerPool profile.</EmptyRow> : poolProfiles.map((profile) => (
              <div key={profile.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{profile.prospectName || profile.emailNormalized}</div>
                    <div className="mt-1 text-sm text-white/55">{profile.emailNormalized}</div>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                    {profile.status}
                  </span>
                </div>
                <div className="mt-3 text-sm text-white/60">
                  {profile.publicCode} · {[profile.leagueName, profile.leagueSeason].filter(Boolean).join(" · ") || "No league selected"}
                </div>
                <div className="mt-2 text-xs text-white/45">
                  Invited {formatDate(profile.invitedAt)} · submitted {formatDate(profile.profileSubmittedAt)} · updated {formatDate(profile.updatedAt)}
                </div>
              </div>
            ))}
          </Section>

          <Section title="Player account merges" count={merges.length}>
            {merges.length === 0 ? <EmptyRow>No matching account merge.</EmptyRow> : merges.map((merge) => (
              <div key={merge.id} className="px-5 py-4">
                <div className="font-semibold text-white">Merge completed {formatDate(merge.createdAt)}</div>
                <div className="mt-2 text-sm text-white/65">
                  Kept: {merge.keptName || merge.keptEmail || merge.keptUserId}
                </div>
                <div className="mt-1 text-sm text-white/65">
                  Disabled: {merge.mergedName || merge.mergedEmail || merge.mergedUserId}
                </div>
                <div className="mt-2 text-xs text-white/45">
                  By {merge.mergedByName || merge.mergedByEmail || "unknown admin"}
                </div>
                <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-3 text-[11px] leading-5 text-white/55">
                  {JSON.stringify(merge.summary, null, 2)}
                </pre>
              </div>
            ))}
          </Section>

          <Section title="Squad membership audit" count={auditRows.length}>
            {auditRows.length === 0 ? (
              <EmptyRow>
                No audit row. Changes made before 4 August 2026 predate the new immutable TeamMember audit trigger.
              </EmptyRow>
            ) : auditRows.map((audit) => (
              <div key={String(audit.id)} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="font-semibold text-white">{audit.operation}</div>
                  <div className="text-xs text-white/45">{formatDate(audit.changedAt)}</div>
                </div>
                <div className="mt-2 text-sm text-white/65">
                  {audit.oldTeamName || audit.oldTeamId || "No previous team"} → {audit.newTeamName || audit.newTeamId || "No team"}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Role {audit.oldRole || "—"} → {audit.newRole || "—"} · actor {audit.actorEmail || audit.actorUserId || "not supplied"}
                </div>
              </div>
            ))}
          </Section>

          <Section title="Match-fee history" count={fees.length}>
            {fees.length === 0 ? <EmptyRow>No matching player match fee.</EmptyRow> : fees.map((fee) => {
              const orphaned = !fee.teamMemberId && !fee.prospectId;
              return (
                <div key={fee.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{fee.teamName} vs {fee.opponentName}</div>
                      <div className="mt-1 text-sm text-white/55">{formatDate(fee.kickoffAt)}</div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm font-semibold text-white/75">
                      {formatMoney(fee.amountPence)} · {fee.status}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-white/60">
                    Identity: {fee.currentName || fee.historicalName || fee.currentEmail || fee.historicalEmail || fee.historicalPhone || "Not recovered"}
                  </div>
                  {orphaned ? (
                    <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                      Orphaned fee: both the TeamMember and prospect links are now null. The original payment recipient is being used to recover the name/contact.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Section>

          <Section title="Result and Player of the Match history" count={results.length}>
            {results.length === 0 ? <EmptyRow>No matching result metadata.</EmptyRow> : results.map((result) => (
              <div key={result.id} className="px-5 py-4">
                <div className="font-semibold text-white">{result.teamName} vs {result.opponentName}</div>
                <div className="mt-1 text-sm text-white/55">{formatDate(result.kickoffAt)}</div>
                <div className="mt-3 text-sm text-white/65">
                  Player of the Match: {result.playerOfMatchName || "—"}
                </div>
                {result.scorersText ? (
                  <details className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">
                    <summary className="cursor-pointer font-semibold text-white/65">Stored scorer data</summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{result.scorersText}</pre>
                  </details>
                ) : null}
              </div>
            ))}
          </Section>

          {targetTeam ? (
            <Section title={`Team records matching “${targetTeam}”`} count={teamRecords.length}>
              {teamRecords.length === 0 ? <EmptyRow>No matching team record.</EmptyRow> : teamRecords.map((team) => (
                <div key={team.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link href={`/admin/teams/${team.id}/squad`} className="font-semibold text-emerald-200 hover:text-emerald-100">
                      {team.name}
                    </Link>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/55">
                      {team.memberCount} members
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-white/55">
                    {[team.leagueName, team.leagueSeason].filter(Boolean).join(" · ") || "No current league"}
                  </div>
                  {team.managerNotes ? (
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      {team.managerNotes}
                    </div>
                  ) : null}
                  <div className="mt-2 font-mono text-[11px] text-white/35">{team.id}</div>
                </div>
              ))}
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
