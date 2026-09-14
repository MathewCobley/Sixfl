const { randomBytes, randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function londonDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function backfillOne(candidate) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT
        r."fixtureId",
        r."teamId",
        r."leagueId",
        r."chargeId",
        r."agreedPence",
        r.status::text AS "requestStatus",
        b.state::text AS "bookingState",
        b."decidedBy",
        f."kickoffAt",
        h.name AS "homeName",
        a.name AS "awayName",
        t."teamMode"::text AS "teamMode"
      FROM "VeoFixtureRequest" r
      JOIN "VeoMatchBooking" b ON b."fixtureId" = r."fixtureId"
      JOIN "Fixture" f ON f.id = r."fixtureId"
      JOIN "Team" h ON h.id = f."homeTeamId"
      JOIN "Team" a ON a.id = f."awayTeamId"
      JOIN "Team" t ON t.id = r."teamId"
      WHERE r."fixtureId" = ${candidate.fixtureId}
        AND r."teamId" = ${candidate.teamId}
      FOR UPDATE OF r
    `;

    const row = rows[0];
    if (!row) return { outcome: 'gone' };
    if (row.chargeId) return { outcome: 'already-linked', chargeId: row.chargeId };
    if (row.requestStatus !== 'ACCEPTED' || row.agreedPence !== 500) {
      return { outcome: 'no-longer-eligible' };
    }
    if (!['PLANNED', 'READY'].includes(row.bookingState)) {
      return { outcome: 'booking-closed' };
    }
    if (row.teamMode !== 'STANDARD') {
      console.warn(
        `[veo-backfill] skipped ${row.fixtureId}/${row.teamId}: team mode is ${row.teamMode}`,
      );
      return { outcome: 'non-standard-team' };
    }

    const title = `Veo Priority — ${row.homeName} vs ${row.awayName} (${londonDate(row.kickoffAt)})`;
    const fixtureMarker = `fixture ${row.fixtureId}`;

    let charge = await tx.paymentCharge.findFirst({
      where: {
        teamId: row.teamId,
        leagueId: row.leagueId,
        amountPence: 500,
        status: { not: 'VOID' },
        description: { contains: fixtureMarker },
      },
      select: { id: true },
    });

    let created = false;
    if (!charge) {
      charge = await tx.paymentCharge.create({
        data: {
          id: `veo_${randomUUID()}`,
          teamId: row.teamId,
          leagueId: row.leagueId,
          fixtureId: null,
          title,
          description: `Optional filming confirmed for fixture ${row.fixtureId}. The £5 Veo Priority charge is added when the filming slot is confirmed so the team balance is correct before the match. If the recording fails, this charge is voided and any payment received is returned to team credit.`,
          amountPence: 500,
          dueDate: row.kickoffAt,
          paymentToken: randomBytes(24).toString('hex'),
          status: 'OPEN',
          latePaymentFeeStatus: 'WAIVED',
          latePaymentFeeNote: 'No late fee on optional Veo recording.',
        },
        select: { id: true },
      });
      created = true;
    }

    const linked = await tx.$executeRaw`
      UPDATE "VeoFixtureRequest"
      SET "chargeId" = ${charge.id}, revision = revision + 1
      WHERE "fixtureId" = ${row.fixtureId}
        AND "teamId" = ${row.teamId}
        AND status = 'ACCEPTED'
        AND "agreedPence" = 500
        AND "chargeId" IS NULL
    `;

    if (linked > 0 && row.decidedBy) {
      const details = JSON.stringify({
        kind: 'veo_charge_backfill',
        fixtureId: row.fixtureId,
        teamId: row.teamId,
        chargeId: charge.id,
        amountPence: 500,
        created,
        reason: 'Confirmed before pre-match Veo charging was enabled',
      });
      await tx.$executeRaw`
        INSERT INTO "VeoSettingsAudit" (id, "leagueId", "teamId", "actorId", details)
        VALUES (${randomUUID()}, ${row.leagueId}, ${row.teamId}, ${row.decidedBy}, ${details}::jsonb)
      `;
    }

    return { outcome: linked > 0 ? (created ? 'created' : 'linked-existing') : 'race-lost', chargeId: charge.id };
  });
}

async function main() {
  const candidates = await prisma.$queryRaw`
    SELECT r."fixtureId", r."teamId"
    FROM "VeoFixtureRequest" r
    JOIN "VeoMatchBooking" b ON b."fixtureId" = r."fixtureId"
    WHERE r.status::text = 'ACCEPTED'
      AND r."agreedPence" = 500
      AND r."chargeId" IS NULL
      AND b.state::text IN ('PLANNED', 'READY')
    ORDER BY r."fixtureId", r."teamId"
  `;

  if (!candidates.length) {
    console.log('[veo-backfill] no confirmed Veo charges need backfilling');
    return;
  }

  let created = 0;
  let linkedExisting = 0;
  for (const candidate of candidates) {
    const result = await backfillOne(candidate);
    if (result.outcome === 'created') created += 1;
    if (result.outcome === 'linked-existing') linkedExisting += 1;
  }

  console.log(
    `[veo-backfill] checked ${candidates.length} accepted confirmed request(s); created ${created} £5 charge(s); linked ${linkedExisting} existing charge(s)`,
  );
}

main()
  .catch((error) => {
    console.error('[veo-backfill] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
