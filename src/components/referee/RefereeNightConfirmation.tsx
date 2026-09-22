import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureRefereeNightConfirmationColumns } from "@/lib/referee-night-confirmations";
import { formatNightDate } from "@/lib/referee-nights";
import { respondToRefereeNightAction } from "@/app/(public)/referee/confirmation-actions";

type UpcomingConfirmation = {
  id: string;
  nightDate: Date | string;
  confirmationStatus: string | null;
  leagueName: string;
  venueName: string | null;
};

export default async function RefereeNightConfirmation({
  refereeId,
}: {
  refereeId: string;
}) {
  await ensureRefereeNightConfirmationColumns();

  const rows = await prisma.$queryRaw<UpcomingConfirmation[]>(Prisma.sql`
    SELECT
      rn.id,
      rn."nightDate",
      rn."confirmationStatus",
      l.name AS "leagueName",
      v.name AS "venueName"
    FROM "RefereeNight" rn
    JOIN "League" l ON l.id = rn."leagueId"
    LEFT JOIN "Venue" v ON v.id = rn."venueId"
    WHERE rn."refereeId" = ${refereeId}
      AND rn.status <> 'CANCELLED'
      AND rn."nightDate" >= CURRENT_DATE
    ORDER BY rn."nightDate" ASC
    LIMIT 1
  `);

  const night = rows[0];
  if (!night) return null;
  const status = String(night.confirmationStatus ?? "PENDING").toUpperCase();
  const confirmed = status === "CONFIRMED";
  const declined = status === "DECLINED";
  return (
    <section
      aria-label="Night confirmation"
      className="mt-4 border-t border-white/10 pt-3"
    >
      <p
        className={`text-xs font-bold ${confirmed ? "text-emerald-200" : declined ? "text-red-200" : "text-amber-200"}`}
      >
        {confirmed
          ? "Night confirmed"
          : declined
            ? "You have declined this night"
            : "Can you referee this night?"}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-white/55">
        {formatNightDate(night.nightDate)} · {night.leagueName}
        {night.venueName ? ` · ${night.venueName}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {!confirmed && (
          <form action={respondToRefereeNightAction} className="flex-1">
            <input type="hidden" name="refereeNightId" value={night.id} />
            <input type="hidden" name="answer" value="yes" />
            <button className="min-h-11 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-100">
              Yes, I can referee
            </button>
          </form>
        )}
        {!declined && (
          <form action={respondToRefereeNightAction} className="flex-1">
            <input type="hidden" name="refereeNightId" value={night.id} />
            <input type="hidden" name="answer" value="no" />
            <button className="min-h-11 w-full rounded-xl border border-red-300/20 bg-red-500/10 px-3 text-xs font-semibold text-red-100">
              {confirmed ? "I can no longer referee" : "I can’t referee"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
