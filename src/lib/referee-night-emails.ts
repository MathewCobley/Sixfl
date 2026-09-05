// Compatibility exports for older callers: scheduling is evening-led, never
// an immediate per-night/fixture dispatch. New templates are seeded by migration.
export { scheduleRefereeEveningForNight as queueRefereeNightBookedEmail } from "@/lib/referees/evening-notifications";
