import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { normaliseVeoPitch } from './allocator';
import { previewFixtureVeoNight, veoTransaction, VeoBookingError } from './fixture-bookings';
import { londonVeoDate, readVeoSettings } from './service';

type NightBoardVeoResult = {
  handled: boolean;
  bookingConfirmed: boolean;
  acceptedRequests: number;
  swappedPitch: boolean;
};

type ActiveBooking = {
  fixtureId: string;
  kickoffAt: Date;
  durationMinutes: number;
};

function overlaps(input: { kickoffAt: Date; durationMinutes: number }, other: ActiveBooking) {
  const start = input.kickoffAt.getTime();
  const end = start + input.durationMinutes * 60_000;
  const otherStart = other.kickoffAt.getTime();
  const otherEnd = otherStart + other.durationMinutes * 60_000;
  return start < otherEnd && otherStart < end;
}

async function ensureAcceptedVeoCharges(..._args: unknown[]) {
  // Paid Veo Priority has been retired. Existing historic charges stay as recorded,
  // but confirming or completing a new filming slot must never create another one.
  return 0;
}

/**
 * Night Board is the administrator's final filming decision. When Veo Priority is
 * enabled for the fixture league, selecting SIXFL TV must create the real booking
 * immediately. Recorded-pitch priority is earned from the SIXFL TV Priority score;
 * there is no filming supplement or captain opt-in. Existing historic Veo charges
 * remain untouched, but this flow never creates a new one.
 *
 * Leagues without confirmation-time Veo keep the older plain SIXFL TV flag flow.
 */
export async function confirmNightBoardVeoFixture(input: {
  fixtureId: string;
  actorId: string;
}): Promise<NightBoardVeoResult> {
  return veoTransaction(async (db) => {
    const admins = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE id = ${input.actorId} AND role::text = 'ADMIN'
    `;
    if (!admins.length) throw new VeoBookingError('Administrator access is required to confirm filming.');

    const initialRows = await db.$queryRaw<Array<{
      id: string;
      leagueId: string;
      kickoffAt: Date;
      publishedAt: Date | null;
      venueId: string | null;
      pitch: string | null;
      status: string;
      placeholder: boolean;
      legacy: boolean;
      bookingState: string | null;
      homeName: string;
      awayName: string;
    }>>`
      SELECT f.id, f."leagueId", f."kickoffAt", f."publishedAt", f."venueId", f.pitch, f.status::text,
        (h."isFixturePlaceholder" OR a."isFixturePlaceholder" OR h.id = a.id) AS placeholder,
        EXISTS (SELECT 1 FROM "VeoFixtureSnapshot" s WHERE s."fixtureId" = f.id) AS legacy,
        (SELECT b.state FROM "VeoMatchBooking" b WHERE b."fixtureId" = f.id) AS "bookingState",
        h.name AS "homeName", a.name AS "awayName"
      FROM "Fixture" f
      JOIN "Team" h ON h.id = f."homeTeamId"
      JOIN "Team" a ON a.id = f."awayTeamId"
      WHERE f.id = ${input.fixtureId}
    `;
    const initial = initialRows[0];
    if (!initial) throw new VeoBookingError('Fixture not found.');

    const settings = await readVeoSettings(initial.leagueId, db);
    if (!settings.enabled || !settings.confirmAtFixture) {
      return { handled: false, bookingConfirmed: false, acceptedRequests: 0, swappedPitch: false };
    }
    if (!settings.venueId || initial.venueId !== settings.venueId) {
      throw new VeoBookingError('This fixture is not at the configured Veo venue. Check the fixture venue before selecting SIXFL TV.');
    }
    if (initial.legacy) {
      return { handled: false, bookingConfirmed: false, acceptedRequests: 0, swappedPitch: false };
    }
    if (initial.placeholder || !initial.publishedAt || initial.status !== 'SCHEDULED' || initial.kickoffAt.getTime() <= Date.now()) {
      throw new VeoBookingError('Only a published, upcoming scheduled fixture can be confirmed for Veo from the Night Board.');
    }
    if (initial.bookingState) {
      if (initial.bookingState === 'PLANNED' || initial.bookingState === 'READY') {
        await ensureAcceptedVeoCharges(db, initial);
        return { handled: true, bookingConfirmed: true, acceptedRequests: 0, swappedPitch: false };
      }
      throw new VeoBookingError('This Veo booking has already been closed and cannot be re-opened from the Night Board.');
    }

    await db.$queryRaw`
      SELECT id FROM "League"
      WHERE id = ${initial.leagueId}
         OR id IN (
           SELECT "leagueId" FROM "VeoLeagueSettings"
           WHERE "venueId" IS NOT DISTINCT FROM ${settings.venueId}
         )
      ORDER BY id FOR UPDATE
    `;

    const date = londonVeoDate(initial.kickoffAt);
    await db.$queryRaw`
      SELECT id FROM "Fixture"
      WHERE "venueId" = ${settings.venueId}
        AND to_char("kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') = ${date}
      ORDER BY id FOR UPDATE
    `;

    const preview = await previewFixtureVeoNight(initial.leagueId, date, db);
    if (!preview.cameraKey) throw new VeoBookingError('Veo is not available for this league.');
    const target = preview.fixtures.find((fixture) => fixture.id === input.fixtureId);
    if (!target) throw new VeoBookingError('This fixture is not available in the Veo camera schedule.');
    if (target.bookingState === 'PLANNED' || target.bookingState === 'READY') {
      await ensureAcceptedVeoCharges(db, target);
      return { handled: true, bookingConfirmed: true, acceptedRequests: 0, swappedPitch: false };
    }

    const activeBookings = await db.$queryRaw<ActiveBooking[]>`
      SELECT b."fixtureId", b."kickoffAt", COALESCE(NULLIF(l."minutesPerGame", 0), 40)::integer AS "durationMinutes"
      FROM "VeoMatchBooking" b
      JOIN "League" l ON l.id = b."leagueId"
      WHERE b."cameraKey" = ${preview.cameraKey}
        AND b.state IN ('PLANNED', 'READY')
      ORDER BY b."kickoffAt", b."fixtureId"
    `;
    if (activeBookings.length >= preview.settings.maxMatches) {
      throw new VeoBookingError(`The shared camera evening already has its maximum ${preview.settings.maxMatches} confirmed match${preview.settings.maxMatches === 1 ? '' : 'es'}.`);
    }
    if (activeBookings.some((booking) => overlaps(target, booking))) {
      throw new VeoBookingError('The Veo camera is already confirmed for another overlapping match at this time.');
    }

    const cameraPitch = normaliseVeoPitch(preview.settings.pitch);
    let anchor = target;
    if (normaliseVeoPitch(target.pitch) !== cameraPitch) {
      if (!target.pitch?.trim()) throw new VeoBookingError('Set this fixture\'s current pitch before confirming it for Veo.');
      const candidate = preview.fixtures.find((fixture) =>
        fixture.id !== target.id &&
        fixture.kickoffMs === target.kickoffMs &&
        fixture.durationMinutes === target.durationMinutes &&
        normaliseVeoPitch(fixture.pitch) === cameraPitch &&
        !fixture.locked,
      );
      if (!candidate) {
        throw new VeoBookingError(`No movable fixture is on ${preview.settings.pitch} at this kick-off. Put this match on the Veo pitch first, then select SIXFL TV.`);
      }
      anchor = candidate;
      await db.$executeRaw`
        UPDATE "Fixture" SET pitch = ${target.pitch}, "updatedAt" = NOW() WHERE id = ${anchor.id}
      `;
    }

    await db.$executeRaw`
      UPDATE "Fixture"
      SET pitch = ${anchor.pitch}, "sixflTvRecorded" = true, "updatedAt" = NOW()
      WHERE id = ${target.id}
    `;
    await db.$executeRaw`
      INSERT INTO "VeoMatchBooking" (
        "fixtureId", "leagueId", "cameraKey", "homeTeamId", "awayTeamId",
        "kickoffAt", "venueId", pitch, "decidedBy"
      ) VALUES (
        ${target.id}, ${target.leagueId}, ${preview.cameraKey}, ${target.homeTeamId}, ${target.awayTeamId},
        ${target.kickoffAt}, ${target.venueId}, ${anchor.pitch}, ${input.actorId}
      )
    `;

    const acceptedRequests = 0;
    await db.$executeRaw`
      UPDATE "VeoFixtureRequest"
      SET status = 'UNAVAILABLE', "agreedPence" = 0, revision = revision + 1
      WHERE "fixtureId" = ${target.id} AND status = 'REQUESTED'
    `;

    const chargesCreated = await ensureAcceptedVeoCharges(db, target);
    const details = JSON.stringify({
      kind: 'night_board_veo_confirmed',
      fixtureId: target.id,
      date,
      cameraKey: preview.cameraKey,
      acceptedRequests,
      chargesCreated,
      priorityModel: 'SIXFL_TV_SCORE',
      noPriorityFees: true,
      swappedPitch: anchor.id !== target.id,
      noBaseFeesChanged: true,
    });
    await db.$executeRaw`
      INSERT INTO "VeoSettingsAudit" (id, "leagueId", "actorId", details)
      VALUES (${randomUUID()}, ${target.leagueId}, ${input.actorId}, ${details}::jsonb)
    `;

    return {
      handled: true,
      bookingConfirmed: true,
      acceptedRequests,
      swappedPitch: anchor.id !== target.id,
    };
  });
}
