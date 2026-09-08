-- Replace the old factory first-fixture reminder, not a second automatic stage.
-- Existing dispatches/queue markers are deliberately NOT reset or rewritten.
-- An edited or disabled template remains under administrator control.
INSERT INTO "NotificationTemplate" ("id", "key", "name", "description", "kind", "channel", "audience", "subject", "body", "ctaLabel", "ctaUrlKey", "isActive", "createdAt", "updatedAt")
VALUES ('captain-first-fixture-reminder', 'captain-first-fixture-reminder', 'Captain first fixture reminder',
  'Ready for your first match: one briefing within 48 hours of the first published kick-off, including late/same-day fixtures.',
  'TRANSACTIONAL', 'EMAIL', 'TEAM', 'Ready for your first SIXFL match?', $briefing$Hi {{captainName}},

We're looking forward to welcoming {{teamName}} to your first SIXFL match. Please share this with everyone in your matchday squad.

YOUR FIRST MATCH
{{fixtureName}}
Date: {{matchDate}}
Kick-off: {{kickoffTime}} (UK time)
Venue: {{venueName}}
{{venueAddress}}
Pitch: {{pitch}}
Please aim to arrive by {{arrivalTime}} — 15 minutes before kick-off.

BE READY ON TIME
Allow time to park, find the pitch and get ready. Please have your team ready to start at the scheduled kick-off, as a late start affects the teams playing afterwards. Check your fixture page before travelling for any updates.

SHIN PADS AND FOOTWEAR
Shin pads are mandatory for every player. The referee may stop anyone without the required safety equipment from playing until it is corrected. Bring footwear suitable for the pitch and follow the venue's footwear requirements; contact SIXFL beforehand if you are unsure.

YOUR MATCHDAY SQUAD
A maximum of nine players may take part in one fixture: six on the pitch and up to three rolling substitutes. All participating players, including approved guests, count towards the limit. There is no maximum registered squad size, but any exception to the nine-player fixture limit needs prior SIXFL approval.

REGISTRATION, CONFIRMATION AND PAYMENT
Make sure your players have completed registration with their own valid email addresses and check their eligibility before selecting them. Confirm the fixture in your captain area if you have not already done so, and check the match fee and payment arrangements shown there. Contact SIXFL early about any issue rather than waiting until kick-off.

RESPECT AND SUPPORT
Follow the referee's instructions and treat opponents, officials and venue staff respectfully. Reply to this email with any questions, or tell us as early as possible if your team has a problem attending.

{{cta}}

League rules: {{rulesUrl}}
Match rules: {{matchRulesUrl}}

Thanks,
SIXFL$briefing$, 'Open your fixture', 'fixtureUrl', true, NOW(), NOW())
ON CONFLICT ("key") DO UPDATE SET
  "subject" = EXCLUDED."subject", "body" = EXCLUDED."body",
  "description" = EXCLUDED."description", "ctaLabel" = EXCLUDED."ctaLabel",
  "ctaUrlKey" = EXCLUDED."ctaUrlKey", "updatedAt" = NOW()
WHERE "NotificationTemplate"."subject" = 'Your first SIXFL fixture is coming up'
  AND "NotificationTemplate"."ctaLabel" = 'Open captain area'
  AND "NotificationTemplate"."ctaUrlKey" = 'captainDashboardUrl'
  AND replace(replace("NotificationTemplate"."body", E'\\n', E'\n'), E'\r\n', E'\n') = $original$Hi {{captainName}},

Your first SIXFL fixture is coming up. Please confirm availability, check your squad details and make sure payment arrangements are sorted before matchday.

You can use the captain checklist and guide in your dashboard if you need a reminder.

Thanks,
SIXFL$original$;
