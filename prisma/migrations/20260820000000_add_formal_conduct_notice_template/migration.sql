-- Formal conduct notice for a team whose conduct caused a referee-abandoned match.
-- Preserve any administrator-edited version if this template already exists.

INSERT INTO "NotificationTemplate" (
  "id",
  "key",
  "name",
  "description",
  "kind",
  "channel",
  "audience",
  "subject",
  "body",
  "ctaLabel",
  "ctaUrlKey",
  "isActive",
  "createdAt",
  "updatedAt"
) VALUES (
  'fixture-abandonment-formal-conduct-email',
  'fixture-abandonment-formal-conduct-email',
  'Abandoned match — formal conduct notice',
  'Formal transactional conduct notice sent to the responsible team after a referee-abandoned match caused by player, manager or team conduct.',
  'TRANSACTIONAL',
  'EMAIL',
  'TEAM',
  'Formal conduct notice — {{teamName}}',
  E'Hi {{firstName}},\n\nFollowing the abandonment of {{fixtureLabel}}, SIXFL is issuing a formal conduct notice to {{teamName}}.\n\nReason recorded: {{reasonLabel}}.\n{{refereeNoteLine}}\nFor the safety and smooth running of the league, the referee’s decisions and instructions during a match must be respected by all players, substitutes, managers and other team members.\n\nIf a player or team official is sent from the playing area, they must comply with the referee’s instruction and leave when asked. Refusing or repeatedly ignoring a referee’s instruction is not acceptable and can prevent a match from continuing safely.\n\nThe referee’s decision on the night is final. If your team disagrees with a decision or wishes to raise a concern, the instruction must still be followed at the time and the matter can be raised with SIXFL afterwards through the proper process.\n\nTeam captains and managers are responsible for making sure everyone connected with their team understands and follows these expectations.\n\nBehaviour that undermines the referee’s authority, or affects the safety and smooth running of the league, will not be tolerated. Any further conduct issues may result in further action under the SIXFL league rules.\n\nThis formal conduct notice is separate from the result and match-fee decision for the abandoned fixture.\n\nWe expect the full cooperation of everyone connected with {{teamName}} going forward.\n\nSIXFL',
  NULL,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
