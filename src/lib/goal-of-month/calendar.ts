import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";

export const MONTHLY_NOMINATION_LIMIT = 3;
export const MONTHLY_FINALIST_LIMIT = 6;

export function monthKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid goal award date.");
  return toLondonDateInputValue(date).slice(0, 7);
}

export function validMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(key: string, by: number): string {
  if (!validMonthKey(key) || !Number.isInteger(by)) throw new Error("Invalid award month.");
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + by, 1, 12)).toISOString().slice(0, 7);
}

export function monthlyPeriod(key: string) {
  if (!validMonthKey(key)) throw new Error("Choose a valid award month.");
  const next = shiftMonth(key, 1);
  return {
    key,
    label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" })
      .format(parseLondonDateTime(`${key}-01`, "12:00")),
    startsAt: parseLondonDateTime(`${key}-01`, "00:00"),
    endsAt: parseLondonDateTime(`${next}-01`, "00:00"),
    // Exclusive bounds: nominations through the 5th; votes through the 12th.
    nominationsCloseAt: parseLondonDateTime(`${next}-06`, "00:00"),
    votingOpensAt: parseLondonDateTime(`${next}-06`, "00:00"),
    votingClosesAt: parseLondonDateTime(`${next}-13`, "00:00"),
  };
}

export function nominationOpen(key: string, now: Date): boolean {
  const period = monthlyPeriod(key);
  return now >= period.startsAt && now < period.nominationsCloseAt;
}

export function monthlyCycle(now = new Date()) {
  const current = monthKey(now);
  const previous = shiftMonth(current, -1);
  const votingPeriod = monthlyPeriod(previous);
  return {
    current,
    nominationMonths: nominationOpen(previous, now) ? [previous, current] : [current],
    votingMonth: previous,
    votingOpen: now >= votingPeriod.votingOpensAt && now < votingPeriod.votingClosesAt,
    latestClosedMonth: now >= votingPeriod.votingClosesAt ? previous : shiftMonth(current, -2),
  };
}
