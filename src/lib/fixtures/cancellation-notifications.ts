import {
  NotificationAudience,
  NotificationChannel,
} from "@prisma/client";

import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";

const CANCELLATION_SOURCE_TYPE = "FIXTURE_CANCELLATION";

export type CancelledFixtureNotification = {
  fixtureId: string;
  kickoffAt: Date;
  pitch: string | null;
  venueName: string | null;
  leagueName: string;
  leagueSeason: string | null;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function fixtureLabel(fixture: CancelledFixtureNotification) {
  return `${fixture.homeTeam.name} v ${fixture.awayTeam.name}`;
}

function pitchLabel(pitch: string | null) {
  const value = pitch?.trim();
  if (!value) return null;

  const cleaned = value.replace(/^(?:pitch\s+)+/i, "");
  return cleaned ? `Pitch ${cleaned}` : "Pitch";
}

function locationLabel(fixture: CancelledFixtureNotification) {
  return [fixture.venueName, pitchLabel(fixture.pitch)]
    .filter(Boolean)
    .join(" · ");
}

async function queueTeamCancellationEmail(
  fixture: CancelledFixtureNotification,
  team: CancelledFixtureNotification["homeTeam"],
) {
  const { recipient, snapshot } = await upsertTeamNotificationRecipient(team.id);
  const contactName = snapshot.primaryContact.name ?? snapshot.teamName;
  const location = locationLabel(fixture);
  const competition = fixture.leagueSeason
    ? `${fixture.leagueName} — ${fixture.leagueSeason}`
    : fixture.leagueName;

  const body = [
    `Hi ${contactName},`,
    "",
    "FIXTURE CANCELLED",
    "",
    `The following SIXFL fixture has been cancelled and removed from the schedule:`,
    "",
    `Fixture: ${fixtureLabel(fixture)}`,
    `Kick-off: ${formatDateTime(fixture.kickoffAt)}`,
    location ? `Venue: ${location}` : null,
    `Competition: ${competition}`,
    "",
    "Please disregard any earlier confirmation, reminder or payment messages for this fixture.",
    "",
    "No action is required. SIXFL will contact you separately if a replacement fixture is arranged.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: `Fixture cancelled: ${fixtureLabel(fixture)}`,
    body,
    isTransactional: true,
    sourceType: CANCELLATION_SOURCE_TYPE,
    sourceId: `${fixture.fixtureId}:${team.id}`,
    metadata: {
      fixtureId: fixture.fixtureId,
      teamId: team.id,
      teamName: team.name,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      kickoffAt: fixture.kickoffAt.toISOString(),
      venueName: fixture.venueName,
      pitch: fixture.pitch,
      cancellationReason: "Fixture deleted by an administrator",
    },
  });
}

export async function queueFixtureCancellationEmails(
  fixture: CancelledFixtureNotification,
) {
  return Promise.allSettled([
    queueTeamCancellationEmail(fixture, fixture.homeTeam),
    queueTeamCancellationEmail(fixture, fixture.awayTeam),
  ]);
}
