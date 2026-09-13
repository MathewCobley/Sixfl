import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";

export type RecruitmentRecord = {
  kind: "PROSPECT" | "LEAD"; id: string; name: string; email: string | null;
  phone: string | null; status: string; teamId: string | null; teamName: string | null;
  profileId: string | null; publicCode: string | null; profileStatus: string | null;
  updatedAt: Date; profileUpdatedAt: Date | null; openRequestTeamIds?: string[];
};
export type SquadIdentity = {
  membershipId: string; userId: string; name: string | null; email: string | null;
  emailVerified: Date | null; phone: string | null; sourceProspectId: string | null;
  teamId: string; teamName: string;
};
export type IdentityCandidate = {
  userId: string; name: string | null; email: string | null; phones: string[];
  teams: Array<{ id: string; name: string }>; evidence: string[];
  definite: boolean; reason: string;
};
export type RecruitmentMatch = {
  record: RecruitmentRecord; candidates: IdentityCandidate[];
  safe: boolean; reason: string; fingerprint: string;
};
export type IdentityReadDb = Pick<typeof prisma, "$queryRaw">;
const closed = new Set(["DECLINED", "DUPLICATE", "NOT_LOOKING", "NOT_INTERESTED", "CLOSED"]);
const inactivePool = new Set(["JOINED", "NOT_LOOKING", "PAUSED", "CLOSED", "DECLINED"]);
const emailKey = (value: string | null) => value?.trim().toLowerCase() || "";
// Deliberately conservative: initials/nicknames are review hints, not proof.
export const identityNameKey = (value: string | null) => (value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const fullName = (value: string) => value.split(" ").filter(Boolean).length >= 2;
const familyKey = (value: string) => fullName(value) ? `${value[0]}:${value.split(" ").at(-1)}` : "";
export function hasLiveRecruitment(record: RecruitmentRecord) {
  return (!closed.has(record.status) && record.status !== "ACTIVE_SQUAD") ||
    Boolean(record.profileStatus && !inactivePool.has(record.profileStatus)) || Boolean(record.openRequestTeamIds?.length);
}

function finalizeRecruitmentMatch(record: RecruitmentRecord, candidates: IdentityCandidate[]): RecruitmentMatch {
  const one = candidates.length === 1 ? candidates[0] : null;
  const anotherTeam = Boolean(one && ((record.teamId && !one.teams.some(t => t.id === record.teamId)) || record.openRequestTeamIds?.some(id => !one.teams.some(t => t.id === id))));
  const explicitStatus = closed.has(record.status) || Boolean(record.profileStatus && ["PAUSED", "NOT_LOOKING", "DECLINED", "CLOSED"].includes(record.profileStatus));
  const safe = Boolean(one?.definite && !anotherTeam && !explicitStatus && hasLiveRecruitment(record));
  const reason = candidates.length > 1 ? "Multiple possible accounts — review required" : anotherTeam ? "Recruitment is assigned to a different team — retained for review" : explicitStatus ? "Existing paused/declined status — do not overwrite automatically" : safe ? "Safe recruitment cleanup; account and squad stay unchanged" : one ? one.reason : "No existing squad match";
  const fingerprint = createHash("sha256").update(JSON.stringify({record, candidates})).digest("hex");
  return { record, candidates, safe, reason, fingerprint };
}

/** Pure matching, indexed by contact/link/name. Never merges accounts or changes data. */
export function matchRecruitmentRecords(records: RecruitmentRecord[], members: SquadIdentity[]): RecruitmentMatch[] {
  const indexes = Array.from({ length: 5 }, () => new Map<string, Set<string>>());
  const users = new Map<string, SquadIdentity[]>();
  for (const member of members) {
    users.set(member.userId, [...(users.get(member.userId) || []), member]);
    const name = identityNameKey(member.name);
    [member.sourceProspectId || "", emailKey(member.email), normalizePhoneNumber(member.phone) || "", fullName(name) ? name : "", familyKey(name)]
      .forEach((key, i) => { if (key) { const set = indexes[i].get(key) || new Set<string>(); set.add(member.userId); indexes[i].set(key, set); } });
  }
  return records.map((record) => {
    const name = identityNameKey(record.name), email = emailKey(record.email), phone = normalizePhoneNumber(record.phone);
    const keys = [record.kind === "PROSPECT" ? record.id : "", email, phone || "", fullName(name) ? name : "", familyKey(name)];
    const ids = new Set(keys.flatMap((key, i) => [...(indexes[i].get(key) || [])]));
    const candidates = [...ids].sort().map((id): IdentityCandidate => {
      const rows = users.get(id)!, user = rows[0], userName = identityNameKey(user.name);
      const linked = record.kind === "PROSPECT" && rows.some(m => m.sourceProspectId === record.id);
      const sameEmail = Boolean(email && email === emailKey(user.email));
      const sameName = Boolean(name && name === userName);
      const samePhone = Boolean(phone && rows.some(m => normalizePhoneNumber(m.phone) === phone));
      const definite = (linked && (!name || !userName || sameName)) ||
        (sameEmail && sameName && fullName(name) && Boolean(user.emailVerified));
      const evidence = [linked && "Original prospect → squad link", sameEmail && "Same email",
        samePhone && "Same normalised mobile", sameName && "Same name",
        !sameName && familyKey(name) === familyKey(userName) && fullName(name) && "Similar name (first initial and surname)",
        sameEmail && !user.emailVerified && "Login email not yet verified",
        (linked || sameEmail || samePhone) && !sameName && name && userName && "Names differ — identity conflict"]
        .filter(Boolean) as string[];
      return { userId: id, name: user.name, email: user.email,
        phones: [...new Set(rows.map(m => normalizePhoneNumber(m.phone)).filter(Boolean))] as string[],
        teams: [...new Map(rows.map(m => [m.teamId, { id: m.teamId, name: m.teamName }])).values()].sort((a,b) => a.id.localeCompare(b.id)),
        evidence, definite, reason: definite ? "Existing squad identity matched" : "Possible match only — verify the person" };
    });
    return finalizeRecruitmentMatch(record, candidates);
  });
}

async function readDifferentPersonExclusions(db: IdentityReadDb) {
  const registry = await db.$queryRaw<Array<{ tableName: string | null }>>(Prisma.sql`
    SELECT to_regclass('public."PlayerDataHealthExclusion"')::text AS "tableName"
  `);
  if (!registry[0]?.tableName) return [] as Array<{recordType:string;recordId:string;userId:string}>;
  return db.$queryRaw<Array<{recordType:string;recordId:string;userId:string}>>(Prisma.sql`
    SELECT "recordType", "recordId", "userId" FROM "PlayerDataHealthExclusion"
  `);
}

export async function getPlayerRecruitmentMatches(db: IdentityReadDb = prisma, profileIds?: string[]): Promise<RecruitmentMatch[]> {
  if (profileIds && !profileIds.length) return [];
  const members = await db.$queryRaw<SquadIdentity[]>(Prisma.sql`
    SELECT m.id AS "membershipId", u.id AS "userId", u.name, u.email, u."emailVerified",
      profile.phone, profile."sourceProspectId", t.id AS "teamId", t.name AS "teamName"
    FROM "TeamMember" m JOIN "User" u ON u.id = m."userId" JOIN "Team" t ON t.id = m."teamId"
    LEFT JOIN "TeamMemberProfile" profile ON profile."teamMemberId" = m.id
    WHERE COALESCE(to_jsonb(m)->>'squadStatus', 'ACTIVE') IN ('ACTIVE', 'INJURED')
    ORDER BY u.id, m.id
  `);
  const prospects = await db.$queryRaw<RecruitmentRecord[]>(Prisma.sql`
    SELECT 'PROSPECT'::text AS kind, prospect.id, TRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")) AS name,
      prospect.email, prospect.phone, prospect.status, prospect."teamId", t.name AS "teamName",
      p.id AS "profileId", p."publicCode", p.status AS "profileStatus", prospect."updatedAt", p."updatedAt" AS "profileUpdatedAt",
      ARRAY(SELECT request."teamId" FROM "PlayerPoolIntroductionRequest" request
        WHERE request."profileId"=p.id AND request.status IN ('REQUESTED','INTRODUCED') ORDER BY request."teamId") AS "openRequestTeamIds"
    FROM "TeamPlayerProspect" prospect LEFT JOIN "Team" t ON t.id = prospect."teamId"
    LEFT JOIN "PlayerPoolProfile" p ON p."prospectId" = prospect.id
    ${profileIds ? Prisma.sql`WHERE p.id IN (${Prisma.join(profileIds)})` : Prisma.empty}
    ORDER BY prospect.id
  `);
  const leads = profileIds ? [] : await db.$queryRaw<RecruitmentRecord[]>(Prisma.sql`
    SELECT 'LEAD'::text AS kind, id, "contactName" AS name, email, phone, status::text,
      NULL::text AS "teamId", NULL::text AS "teamName", NULL::text AS "profileId",
      NULL::text AS "publicCode", NULL::text AS "profileStatus", "updatedAt", NULL::timestamp AS "profileUpdatedAt"
    FROM "InterestLead" WHERE "interestType" = 'PLAYER' AND status <> 'CLOSED' ORDER BY id
  `);
  const exclusions = await readDifferentPersonExclusions(db);
  const excluded = new Set(exclusions.map(row => `${row.recordType}:${row.recordId}:${row.userId}`));
  const records = [...prospects, ...leads].filter(r => profileIds || hasLiveRecruitment(r));
  return matchRecruitmentRecords(records, members)
    .map(match => finalizeRecruitmentMatch(match.record, match.candidates.filter(candidate => !excluded.has(`${match.record.kind}:${match.record.id}:${candidate.userId}`))))
    .filter(match => match.candidates.length > 0);
}

/** Shared by email/SMS preflight and the provider gate. Any uncertain match pauses chases, never merges identities. */
export async function getPlayerPoolSquadMatches(profileIds: string[], db: IdentityReadDb = prisma) {
  const matches = await getPlayerRecruitmentMatches(db, profileIds);
  return new Map(matches.map(m => [m.record.profileId!, {
    definite: m.candidates.length === 1 && m.candidates[0].definite,
    teamNames: [...new Set(m.candidates.flatMap(c => c.teams.map(t => t.name)))].sort().join(", "),
    reason: m.reason,
  }]));
}