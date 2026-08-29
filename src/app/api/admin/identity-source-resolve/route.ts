import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RecipientRow = {
  id: string;
  sourceId: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
};

type FeeRow = {
  id: string;
  status: string;
  amountPence: number;
  teamId: string;
  teamName: string;
  kickoffAt: Date;
  userName: string | null;
  userEmail: string | null;
  prospectId: string | null;
  prospectName: string | null;
  prospectEmail: string | null;
};

type ProspectRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  teamId: string | null;
  teamName: string | null;
};

type SelectionRow = {
  fixtureId: string;
  teamMemberId: string;
  selectionStatus: string;
  kickoffAt: Date;
  teamId: string;
  teamName: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
};

type ResolvedSource = {
  kind: "player-match-fee" | "team-prospect" | "fixture-selection" | "historic-reference";
  title: string;
  detail: string;
  effect: string;
  href: string | null;
  recordId: string;
};

function normaliseEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}

function normalisePhoneDigits(value: string) {
  return normalizePhoneNumber(value)?.replace(/^\+/, "") ?? null;
}

function normaliseName(value: string) {
  const name = value.trim().replace(/\s+/g, " ").toLowerCase();
  return name.length >= 2 ? name : null;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(value);
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get("q") ?? "").trim();
  if (!rawQuery) {
    return NextResponse.json({ ok: false, error: "Enter an identity to resolve." }, { status: 400 });
  }

  const email = normaliseEmail(rawQuery);
  const phoneDigits = email ? null : normalisePhoneDigits(rawQuery);
  const name = email || phoneDigits ? null : normaliseName(rawQuery);

  let recipients: RecipientRow[] = [];
  if (email) {
    recipients = await prisma.$queryRaw<RecipientRow[]>(Prisma.sql`
      SELECT "id", "sourceId", "displayName",
        COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), '')) AS "email",
        COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')) AS "phone"
      FROM "NotificationRecipient"
      WHERE LOWER(COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), ''))) = ${email}
      ORDER BY "updatedAt" DESC
      LIMIT 50
    `);
  } else if (phoneDigits) {
    recipients = await prisma.$queryRaw<RecipientRow[]>(Prisma.sql`
      SELECT "id", "sourceId", "displayName",
        COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), '')) AS "email",
        COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')) AS "phone"
      FROM "NotificationRecipient"
      WHERE REGEXP_REPLACE(COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')), '[^0-9]', '', 'g') = ${phoneDigits}
      ORDER BY "updatedAt" DESC
      LIMIT 50
    `);
  } else if (name) {
    recipients = await prisma.$queryRaw<RecipientRow[]>(Prisma.sql`
      SELECT "id", "sourceId", "displayName",
        COALESCE(NULLIF(BTRIM("emailNormalized"), ''), NULLIF(BTRIM("email"), '')) AS "email",
        COALESCE(NULLIF(BTRIM("phoneNormalized"), ''), NULLIF(BTRIM("phone"), '')) AS "phone"
      FROM "NotificationRecipient"
      WHERE LOWER(REGEXP_REPLACE(BTRIM(COALESCE("displayName", '')), '[[:space:]]+', ' ', 'g')) = ${name}
      ORDER BY "updatedAt" DESC
      LIMIT 50
    `);
  }

  const sourceIds = Array.from(new Set(recipients.map((row) => row.sourceId).filter((value): value is string => Boolean(value))));
  const feeIds: string[] = [];
  const prospectIds: string[] = [];
  const selectionPairs: Array<{ fixtureId: string; teamMemberId: string; sourceId: string }> = [];

  for (const sourceId of sourceIds) {
    if (sourceId.startsWith("player-match-fee:")) {
      const id = sourceId.slice("player-match-fee:".length);
      if (id) feeIds.push(id);
      continue;
    }
    if (sourceId.startsWith("team-prospect:")) {
      const id = sourceId.slice("team-prospect:".length);
      if (id) prospectIds.push(id);
      continue;
    }
    if (sourceId.startsWith("fixture-selection:")) {
      const [, fixtureId, teamMemberId] = sourceId.split(":");
      if (fixtureId && teamMemberId) selectionPairs.push({ fixtureId, teamMemberId, sourceId });
    }
  }

  const [fees, prospects, selections] = await Promise.all([
    feeIds.length
      ? prisma.$queryRaw<FeeRow[]>(Prisma.sql`
          SELECT
            fee."id",
            fee."status"::text AS "status",
            fee."amountPence",
            team."id" AS "teamId",
            team."name" AS "teamName",
            fixture."kickoffAt",
            player_user."name" AS "userName",
            player_user."email" AS "userEmail",
            prospect."id" AS "prospectId",
            NULLIF(BTRIM(CONCAT_WS(' ', prospect."firstName", prospect."lastName")), '') AS "prospectName",
            prospect."email" AS "prospectEmail"
          FROM "PlayerMatchFee" fee
          JOIN "Team" team ON team."id" = fee."teamId"
          JOIN "Fixture" fixture ON fixture."id" = fee."fixtureId"
          LEFT JOIN "TeamMember" member ON member."id" = fee."teamMemberId"
          LEFT JOIN "User" player_user ON player_user."id" = member."userId"
          LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = fee."prospectId"
          WHERE fee."id" IN (${Prisma.join(feeIds)})
          ORDER BY fixture."kickoffAt" DESC
        `)
      : Promise.resolve([] as FeeRow[]),
    prospectIds.length
      ? prisma.$queryRaw<ProspectRow[]>(Prisma.sql`
          SELECT
            prospect."id", prospect."firstName", prospect."lastName", prospect."email", prospect."phone", prospect."status",
            team."id" AS "teamId", team."name" AS "teamName"
          FROM "TeamPlayerProspect" prospect
          LEFT JOIN "Team" team ON team."id" = prospect."teamId"
          WHERE prospect."id" IN (${Prisma.join(prospectIds)})
        `)
      : Promise.resolve([] as ProspectRow[]),
    selectionPairs.length
      ? prisma.$queryRaw<SelectionRow[]>(Prisma.sql`
          SELECT
            selection."fixtureId", selection."teamMemberId", selection."selectionStatus",
            fixture."kickoffAt",
            team."id" AS "teamId", team."name" AS "teamName",
            player_user."id" AS "userId", player_user."name" AS "userName", player_user."email" AS "userEmail"
          FROM "FixtureSelection" selection
          JOIN "Fixture" fixture ON fixture."id" = selection."fixtureId"
          JOIN "TeamMember" member ON member."id" = selection."teamMemberId"
          JOIN "Team" team ON team."id" = member."teamId"
          JOIN "User" player_user ON player_user."id" = member."userId"
          WHERE selection."fixtureId" IN (${Prisma.join(Array.from(new Set(selectionPairs.map((pair) => pair.fixtureId))))})
            AND selection."teamMemberId" IN (${Prisma.join(Array.from(new Set(selectionPairs.map((pair) => pair.teamMemberId))))})
        `)
      : Promise.resolve([] as SelectionRow[]),
  ]);

  const resolved: ResolvedSource[] = [];
  const resolvedIds = new Set<string>();

  for (const fee of fees) {
    resolvedIds.add(`player-match-fee:${fee.id}`);
    const playerName = fee.userName || fee.prospectName || "Player identity no longer attached";
    const playerEmail = fee.userEmail || fee.prospectEmail;
    resolved.push({
      kind: "player-match-fee",
      title: `${playerName} · ${fee.teamName}`,
      detail: `${fee.status} · £${(fee.amountPence / 100).toFixed(2)} · fixture ${formatDate(fee.kickoffAt)}${playerEmail ? ` · ${playerEmail}` : ""}`,
      effect: "This notification came from a real player match-fee record. It is strong evidence that this identity previously existed as a squad player or team prospect.",
      href: `/admin/teams/${fee.teamId}`,
      recordId: fee.id,
    });
  }

  for (const prospect of prospects) {
    resolvedIds.add(`team-prospect:${prospect.id}`);
    const playerName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ");
    resolved.push({
      kind: "team-prospect",
      title: `${playerName}${prospect.teamName ? ` · ${prospect.teamName}` : ""}`,
      detail: `${prospect.status}${prospect.email ? ` · ${prospect.email}` : ""}${prospect.phone ? ` · ${prospect.phone}` : ""}`,
      effect: "This source points directly to a TeamPlayerProspect record. If it is still active, this is the record to reuse or resolve rather than creating another player.",
      href: prospect.teamId ? `/admin/teams/${prospect.teamId}/prospects` : "/admin/player-pool",
      recordId: prospect.id,
    });
  }

  for (const pair of selectionPairs) {
    const selection = selections.find((row) => row.fixtureId === pair.fixtureId && row.teamMemberId === pair.teamMemberId);
    if (!selection) continue;
    resolvedIds.add(pair.sourceId);
    resolved.push({
      kind: "fixture-selection",
      title: `${selection.userName || "Unnamed squad player"} · ${selection.teamName}`,
      detail: `${selection.selectionStatus} · fixture ${formatDate(selection.kickoffAt)}${selection.userEmail ? ` · ${selection.userEmail}` : ""}`,
      effect: "This source comes from a real fixture-selection row, which means this TeamMember existed on a squad and was available for matchday selection.",
      href: `/admin/teams/${selection.teamId}/players`,
      recordId: selection.teamMemberId,
    });
  }

  for (const sourceId of sourceIds) {
    if (resolvedIds.has(sourceId)) continue;
    if (!sourceId.startsWith("player-match-fee:") && !sourceId.startsWith("team-prospect:") && !sourceId.startsWith("fixture-selection:")) continue;
    resolved.push({
      kind: "historic-reference",
      title: "Historic player source reference",
      detail: sourceId,
      effect: "The notification still points at this player-related source, but the underlying record no longer resolves. That usually means the original player/prospect record was moved, merged or deleted after communications were created.",
      href: null,
      recordId: sourceId,
    });
  }

  return NextResponse.json({
    ok: true,
    notificationCount: recipients.length,
    sourceCount: sourceIds.length,
    resolvedCount: resolved.length,
    resolved,
  });
}
