import type { ReactNode } from "react";
import { Prisma } from "@prisma/client";

import { requireReferee } from "@/lib/admin";
import { ensureRefereeNightConfirmationColumns } from "@/lib/referee-night-confirmations";
import { formatNightDate } from "@/lib/referee-nights";
import { prisma } from "@/lib/prisma";

import { respondToRefereeNightAction } from "./confirmation-actions";

type UpcomingConfirmation = {
  id: string;
  nightDate: Date | string;
  confirmationStatus: string | null;
  leagueName: string;
  venueName: string | null;
};

export default async function RefereeLayout({ children }: { children: ReactNode }) {
  const { user } = await requireReferee();
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
    WHERE rn."refereeId" = ${user.id}
      AND rn.status <> 'CANCELLED'
      AND rn."nightDate" >= CURRENT_DATE
    ORDER BY rn."nightDate" ASC
    LIMIT 1
  `);

  const night = rows[0] ?? null;
  const confirmationStatus = String(night?.confirmationStatus ?? "PENDING").toUpperCase();
  const isConfirmed = confirmationStatus === "CONFIRMED";
  const isDeclined = confirmationStatus === "DECLINED";

  return (
    <>
      {night ? (
        <section className="mx-auto mb-5 max-w-[1180px] px-4 sm:px-6 lg:px-8">
          <div
            className={[
              "rounded-3xl border p-5 shadow-[0_16px_50px_rgba(0,0,0,0.22)] sm:p-6",
              isConfirmed
                ? "border-emerald-400/35 bg-emerald-500/12"
                : isDeclined
                  ? "border-red-400/30 bg-red-500/10"
                  : "border-amber-300/40 bg-amber-400/12",
            ].join(" ")}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">
                  Referee night confirmation
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  {isConfirmed
                    ? "✓ Night confirmed"
                    : isDeclined
                      ? "You have said you cannot referee this night"
                      : "Please confirm your next referee night"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  <span className="font-semibold text-white">{formatNightDate(night.nightDate)}</span>
                  {` · ${night.leagueName}`}
                  {night.venueName ? ` · ${night.venueName}` : ""}
                </p>
                <p className="mt-2 text-sm text-white/60">
                  {isConfirmed
                    ? "SIXFL has your confirmation. If your availability changes, tell us here straight away."
                    : isDeclined
                      ? "SIXFL will arrange cover. If your availability has changed, you can confirm again below."
                      : "Please respond now so SIXFL knows whether cover is needed."}
                </p>
              </div>

              <div className="flex min-w-fit flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                {!isConfirmed ? (
                  <form action={respondToRefereeNightAction}>
                    <input type="hidden" name="refereeNightId" value={night.id} />
                    <input type="hidden" name="answer" value="yes" />
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-black transition hover:bg-emerald-300"
                    >
                      ✓ Yes, I can referee
                    </button>
                  </form>
                ) : null}

                {!isDeclined ? (
                  <form action={respondToRefereeNightAction}>
                    <input type="hidden" name="refereeNightId" value={night.id} />
                    <input type="hidden" name="answer" value="no" />
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-red-300/35 bg-red-500/15 px-5 py-3.5 text-sm font-bold text-red-50 transition hover:bg-red-500/25"
                    >
                      ✕ I can’t referee this night
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {children}
    </>
  );
}
