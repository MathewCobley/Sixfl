import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import RefereeAppShell from "@/components/referee/RefereeAppShell";
import RefereeAvailabilityCalendar from "@/components/referee/RefereeAvailabilityCalendar";
import { requireReferee } from "@/lib/admin";
import { toLondonDateInputValue } from "@/lib/datetime/london";
import {
  getAdjacentMonthKey,
  getRefereeAvailabilityMonth,
  normaliseMonthKey,
} from "@/lib/referee-availability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

export default async function RefereeAvailabilityPage({ searchParams }: PageProps) {
  const { user, authenticatedUser, isAdminPreview } = await requireReferee();

  if (authenticatedUser.role === UserRole.ADMIN && !isAdminPreview) {
    redirect("/admin/referees?error=select_referee_preview");
  }

  const sp = (await searchParams) ?? {};
  const monthKey = normaliseMonthKey(sp.month);
  const previousMonth = getAdjacentMonthKey(monthKey, -1);
  const nextMonth = getAdjacentMonthKey(monthKey, 1);
  const data = await getRefereeAvailabilityMonth({ refereeId: user.id, monthKey });

  const calendarSlots = data.slots.map((slot) => ({
    id: slot.id,
    leagueId: slot.leagueId,
    leagueName: slot.leagueName,
    leagueSeason: slot.leagueSeason,
    venueName: slot.venueName,
    date: slot.date,
    status: slot.status,
    note: slot.note,
  }));

  return (
    <RefereeAppShell active="availability" title="Availability">
      <RefereeAvailabilityCalendar
        monthKey={monthKey}
        monthLabel={data.monthLabel}
        previousMonth={previousMonth}
        nextMonth={nextMonth}
        todayDate={toLondonDateInputValue(new Date())}
        initialSlots={calendarSlots}
      />
    </RefereeAppShell>
  );
}
