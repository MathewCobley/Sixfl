// ========================================
// File: src/app/(admin)/admin/fixtures/generate/referee-backfill-actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import {
  FixtureStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formatDateTimeInLondon, toLondonDateInputValue } from "@/lib/datetime/london";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const MAX_PITCHES = 6;

type RefereeNightDbClient = Pick<typeof prisma, "$queryRaw" | "$executeRaw">;

type RefereeEmailGroup = {
  nightId: string;
  refereeId: string;
  refereeName: string | null;
  refereeEmail: string | null;
  leagueName: string;
  leagueSeason: string | null;
  venueName: string | null;
  nightDate: string;
  fixtures: Array<{
    id: string;
    kickoffAt: Date;
    pitch: string | null;
    homeTeamName: string;
    awayTeamName: string;
  }>;
};

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = String(value ?? "").trim();

  if (!parsed) {
    throw new Error(`${fieldName} is required.`);
  }

  return parsed;
}

function parseMoneyPence(value: FormDataEntryValue | null, fieldName: string) {
  const raw = String(value ?? "").trim();
  const parsed = Number(raw);

  if (!raw || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be £0 or more.`);
  }

  return Math.round(parsed * 100);
}

function getPitchNumber(value: string | null) {
  const match = value?.match(/(\d+)/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getRefereeIdsByPitch(formData: FormData) {
  return Array.from({ length: MAX_PITCHES }, (_, index) => {
    const value = String(formData.get(`refereeIdByPitch${index + 1}`) ?? "").trim();
    return value || null;
  });
}

function getFirstName(name: string | null, email: string | null) {
  const fromName = name?.trim().split(/\s+/).filter(Boolean)[0];
  const fromEmail = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim().split(/\s+/)[0];

  return fromName || fromEmail || "there";
}

function getBaseUrl() {
  return (process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk").replace(/\/+$/, "");
}

function formatNightDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return formatDateTimeInLondon(date, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatKickoffLabel(value: Date) {
  return formatDateTimeInLondon(value, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function upsertRefereeRecipient(input: {
  refereeId: string;
  name: string | null;
  email: string | null;
}) {
  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: "REFEREE",
        sourceId: input.refereeId,
      },
    },
    update: {
      audience: NotificationAudience.REFEREE,
      displayName: input.name?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      emailNormalized: input.email?.trim().toLowerCase() || null,
      transactionalEmailOptIn: true,
    },
    create: {
      sourceType: "REFEREE",
      sourceId: input.refereeId,
      audience: NotificationAudience.REFEREE,
      displayName: input.name?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      emailNormalized: input.email?.trim().toLowerCase() || null,
      transactionalEmailOptIn: true,
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: {
      emailEnabled: true,
    },
    create: {
      recipientId: recipient.id,
      emailEnabled: true,
      smsEnabled: true,
      urgentSmsEnabled: true,
      marketingEmailEnabled: false,
      marketingSmsEnabled: false,
    },
  });

  return recipient;
}

async function findOrCreateRefereeNight(input: {
  tx: RefereeNightDbClient;
  refereeId: string;
  leagueId: string;
  venueId: string | null;
  nightDate: string;
  feePence: number;
  createdByUserId: string | null;
}) {
  const existing = await input.tx.$queryRaw<Array<{ id: string; feePence: number }>>(Prisma.sql`
    SELECT id, "feePence"
    FROM "RefereeNight"
    WHERE "refereeId" = ${input.refereeId}
      AND "leagueId" = ${input.leagueId}
      AND "venueId" IS NOT DISTINCT FROM ${input.venueId}
      AND "nightDate" = CAST(${input.nightDate} AS date)
      AND "status" <> 'CANCELLED'
    ORDER BY "createdAt" ASC
    LIMIT 1
  `);

  if (existing[0]) {
    if (!existing[0].feePence && input.feePence > 0) {
      await input.tx.$executeRaw(Prisma.sql`
        UPDATE "RefereeNight"
        SET "feePence" = ${input.feePence}, "updatedAt" = NOW()
        WHERE id = ${existing[0].id}
      `);
    }

    return existing[0].id;
  }

  const id = randomUUID();

  await input.tx.$executeRaw(Prisma.sql`
    INSERT INTO "RefereeNight" (
      id,
      "refereeId",
      "leagueId",
      "venueId",
      "nightDate",
      "feePence",
      "status",
      "createdByUserId",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.refereeId},
      ${input.leagueId},
      ${input.venueId},
      CAST(${input.nightDate} AS date),
      ${input.feePence},
      'DRAFT',
      ${input.createdByUserId},
      NOW(),
      NOW()
    )
  `);

  return id;
}

function buildRefereeEmailBody(group: RefereeEmailGroup) {
  const nightUrl = `${getBaseUrl()}/referee/night/${group.nightId}`;
  const fixtureLines = group.fixtures.map((fixture) => {
    const pitch = fixture.pitch ? ` · ${fixture.pitch}` : "";
    return `- ${formatKickoffLabel(fixture.kickoffAt)}${pitch}: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`;
  });

  return [
    `Hi ${getFirstName(group.refereeName, group.refereeEmail)},`,
    "",
    `You have been assigned to referee ${group.fixtures.length} fixture${group.fixtures.length === 1 ? "" : "s"} for ${group.leagueName}${group.leagueSeason ? ` — ${group.leagueSeason}` : ""} on ${formatNightDateLabel(group.nightDate)}.`,
    group.venueName ? `Venue: ${group.venueName}` : "Venue: TBC",
    "",
    "Fixtures:",
    ...fixtureLines,
    "",
    "Open your referee night page to view fixtures, enter scores and complete the end-of-night cashup:",
    "{{cta}}",
    "",
    "This was sent as a referee assignment only. Team fixture emails have not been resent.",
  ].join("\n");
}

export async function backfillRefereeAssignmentsAction(formData: FormData) {
  const { user } = await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const refereeFeePence = parseMoneyPence(formData.get("refereeFeePounds"), "Referee night fee");
  const sendRefereeEmails = String(formData.get("sendRefereeEmails") || "") === "on";
  const refereeIdsByPitch = getRefereeIdsByPitch(formData);

  const selectedRefereeIds = refereeIdsByPitch.filter(
    (refereeId): refereeId is string => Boolean(refereeId),
  );

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, season: true, slug: true },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  const selectedReferees = selectedRefereeIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: selectedRefereeIds },
          role: { in: [UserRole.REFEREE, UserRole.ADMIN] },
        },
        select: { id: true },
      })
    : [];
  const validSelectedRefereeIds = new Set(selectedReferees.map((referee) => referee.id));
  const invalidRefereeIds = selectedRefereeIds.filter(
    (refereeId) => !validSelectedRefereeIds.has(refereeId),
  );

  if (invalidRefereeIds.length > 0) {
    throw new Error("One or more selected pitch referees could not be found.");
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      leagueId,
      status: FixtureStatus.SCHEDULED,
      kickoffAt: { gte: new Date() },
    },
    orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],
    select: {
      id: true,
      kickoffAt: true,
      pitch: true,
      venueId: true,
      refereeId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      venue: { select: { name: true } },
    },
  });

  const desiredFixtureRefs = fixtures
    .map((fixture) => {
      const pitchNumber = getPitchNumber(fixture.pitch);
      const pitchRefereeId = pitchNumber ? refereeIdsByPitch[pitchNumber - 1] ?? null : null;
      const refereeId = fixture.refereeId || pitchRefereeId;
      return refereeId ? { fixture, refereeId } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (desiredFixtureRefs.length === 0) {
    redirect("/admin/fixtures/generate?refBackfilled=0&refEmails=0");
  }

  const allRefereeIds = Array.from(new Set(desiredFixtureRefs.map((entry) => entry.refereeId)));
  const referees = await prisma.user.findMany({
    where: {
      id: { in: allRefereeIds },
      role: { in: [UserRole.REFEREE, UserRole.ADMIN] },
    },
    select: { id: true, name: true, email: true },
  });
  const refereeById = new Map(referees.map((referee) => [referee.id, referee]));
  const emailGroupsByNightId = new Map<string, RefereeEmailGroup>();

  let linkedFixtureCount = 0;
  let assignedFixtureCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const entry of desiredFixtureRefs) {
      const referee = refereeById.get(entry.refereeId);
      if (!referee) continue;

      if (!entry.fixture.refereeId) {
        await tx.fixture.update({
          where: { id: entry.fixture.id },
          data: { refereeId: entry.refereeId },
        });
        assignedFixtureCount += 1;
      }

      const nightDate = toLondonDateInputValue(entry.fixture.kickoffAt);
      const nightId = await findOrCreateRefereeNight({
        tx,
        refereeId: entry.refereeId,
        leagueId,
        venueId: entry.fixture.venueId,
        nightDate,
        feePence: refereeFeePence,
        createdByUserId: user?.id ?? null,
      });

      const linkId = randomUUID();
      const inserted = await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RefereeNightFixture" (id, "refereeNightId", "fixtureId", "createdAt")
        VALUES (${linkId}, ${nightId}, ${entry.fixture.id}, NOW())
        ON CONFLICT DO NOTHING
      `);

      if (inserted > 0) {
        linkedFixtureCount += 1;

        const existingGroup = emailGroupsByNightId.get(nightId);
        const fixtureSummary = {
          id: entry.fixture.id,
          kickoffAt: entry.fixture.kickoffAt,
          pitch: entry.fixture.pitch,
          homeTeamName: entry.fixture.homeTeam.name,
          awayTeamName: entry.fixture.awayTeam.name,
        };

        if (existingGroup) {
          existingGroup.fixtures.push(fixtureSummary);
        } else {
          emailGroupsByNightId.set(nightId, {
            nightId,
            refereeId: referee.id,
            refereeName: referee.name,
            refereeEmail: referee.email,
            leagueName: league.name,
            leagueSeason: league.season,
            venueName: entry.fixture.venue?.name ?? null,
            nightDate,
            fixtures: [fixtureSummary],
          });
        }
      }
    }
  });

  let sentEmailCount = 0;

  if (sendRefereeEmails) {
    for (const group of emailGroupsByNightId.values()) {
      if (!group.refereeEmail) continue;

      const recipient = await upsertRefereeRecipient({
        refereeId: group.refereeId,
        name: group.refereeName,
        email: group.refereeEmail,
      });

      const dispatch = await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.REFEREE,
        subject: `SIXFL referee assignment: ${group.leagueName}${group.leagueSeason ? ` — ${group.leagueSeason}` : ""} · ${formatNightDateLabel(group.nightDate)}`,
        body: buildRefereeEmailBody(group),
        isTransactional: true,
        sourceType: "REFEREE_ASSIGNMENT_BACKFILL",
        sourceId: group.nightId,
        emailCta: {
          label: "Open referee night",
          url: `${getBaseUrl()}/referee/night/${group.nightId}`,
        },
        metadata: {
          kind: "referee_assignment_backfill",
          refereeNightId: group.nightId,
          refereeId: group.refereeId,
          fixtureIds: group.fixtures.map((fixture) => fixture.id),
        },
      });

      if (dispatch.status === NotificationDispatchStatus.QUEUED) {
        sentEmailCount += 1;
      }
    }
  }

  revalidatePath("/admin/fixtures/generate");
  revalidatePath("/admin/referee-nights");
  revalidatePath("/admin/night-board");

  redirect(
    `/admin/fixtures/generate?refBackfilled=${linkedFixtureCount}&refAssigned=${assignedFixtureCount}&refEmails=${sentEmailCount}`,
  );
}