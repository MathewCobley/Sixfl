-- ========================================
-- Migration: squad size and shin pads team email template
-- ========================================

INSERT INTO "EmailTemplate" (
  "id",
  "key",
  "name",
  "description",
  "audience",
  "interestType",
  "subject",
  "body",
  "ctaLabel",
  "ctaUrlKey",
  "isActive",
  "createdAt",
  "updatedAt"
) VALUES (
  'team-squad-size-shin-pads-reminder',
  'team-squad-size-shin-pads-reminder',
  'Squad size & shin pads reminder',
  'Team reminder that match-night squads are limited to 9 players and that shin pads are compulsory safety equipment.',
  'TEAM',
  'TEAM',
  'Important Reminder – Squad Sizes & Shin Pads',
  $body$Hi all,

Just a quick but important reminder about match-night squad sizes and player safety equipment.

Maximum squad of 9 players

Teams may field a maximum of 9 players in total on a match night.

We have had a few teams arriving with much larger squads recently. Up to now, we have allowed this to go ahead and spoken to the teams involved afterwards, but this cannot continue.

From now on, the nine-player maximum will be enforced. If a team arrives with more than 9 players, the additional players will not be permitted to take part that evening.

The limit is there to keep matches fair and ensure that all teams are playing under the same conditions.

Shin pads are compulsory

We also need to remind everyone that shin pads are required safety equipment and must be worn by every player taking part.

Unfortunately, some teams have now been warned on three separate occasions about players turning up without shin pads.

We have tried to be reasonable and give teams the opportunity to correct this, but we now need to enforce the requirement consistently. Any player who arrives without shin pads will be asked not to play until they have the required safety equipment.

Please make sure everyone in your squad knows both of these requirements before your next fixture:

- Maximum 9 players per team on a match night
- Every player must wear shin pads

We don't want to stop anybody from playing, so please help us by making sure your team arrives prepared.

Thanks for your cooperation and for helping us keep SIXFL fair and safe for everyone.

SIXFL$body$,
  NULL,
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "audience" = EXCLUDED."audience",
  "interestType" = EXCLUDED."interestType",
  "subject" = EXCLUDED."subject",
  "body" = EXCLUDED."body",
  "ctaLabel" = EXCLUDED."ctaLabel",
  "ctaUrlKey" = EXCLUDED."ctaUrlKey",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;
