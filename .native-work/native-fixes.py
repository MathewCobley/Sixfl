# One-time developer edits, excluded from the product commit.
from pathlib import Path
p = Path('package.json')
s = p.read_text()
command = 'node scripts/apply-player-pool-comms-link.cjs && '
assert s.count(command) == 2
p.write_text(s.replace(command, ''))
Path('scripts/apply-player-pool-comms-link.cjs').unlink()
p = Path('tests/player-pool-response-check.test.ts')
s = p.read_text().replace('assert.equal(existsSync("scripts/apply-player-pool-nudge-history.cjs"), false);', 'assert.equal(existsSync("scripts/apply-player-pool-nudge-history.cjs"), false);\n  assert.equal(existsSync("scripts/apply-player-pool-comms-link.cjs"), false);\n  assert.doesNotMatch(readFileSync("package.json", "utf8"), /apply-player-pool-comms-link/);')
s = s.replace('assert.ok(rows[0].bodyText.includes(`/player-pool/profile/${t.id}`));', 'assert.ok(rows[0].bodyText.includes(`/player-pool/profile/${t.id}`));\n  assert.ok(rows[0].bodyHtml?.includes(`/player-pool/profile/${t.id}`), "The HTML button retains the same secure target");\n  assert.doesNotMatch(rows[0].bodyText + rows[0].bodyHtml, /\\{\\{[^}]+\\}\\}/, "No unresolved placeholders");')
p.write_text(s)
# Template renderer consumes {{cta}} in plain text; an explicit fallback link
# makes the secure form accessible in both multipart representations.
p = Path('prisma/migrations/20260912183000_player_pool_response_check/migration.sql')
s=p.read_text()
assert s.count('{{cta}}\\n\\n') == 1
p.write_text(s.replace('{{cta}}\\n\\n', '{{cta}}\\n\\nOr open your secure profile: {{profileUrl}}\\n\\n'))
# The new response-check template is the source of truth. Remove unused embedded
# rich-copy defaults; do not keep dead customer copy merely to satisfy old tests.
p = Path('src/lib/player-pool/profile-reminders.ts')
s=p.read_text()
types=s[s.index('export type PlayerPoolProfileReminderTarget'):s.index('let templateEnsurePromise')]
queue=s[s.index('export async function queuePlayerPoolProfileReminder'):]
p.write_text('''import { prisma } from "@/lib/prisma";

export const PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY = "player-pool-response-check-email";
// Keep the existing source identity so historical email and SMS stages remain linked.
export const PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE = "PLAYER_POOL_PROFILE_NUDGE";

'''+types+'''// Seeded by the idempotent migration and editable in System Templates.
// Reading the admin page must not overwrite administrator edits or send messages.
export async function ensurePlayerPoolProfileReminderTemplate() {
  return prisma.notificationTemplate.findUnique({ where: { key: PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY } });
}

'''+queue)
# The requested short response-check replaces the older long explainer. Preserve
# existing route, history, secure CTA and native-control contracts while testing
# the message that is actually sent, not unreachable strings in application code.
p = Path('scripts/check-player-pool-profile-reminders.mjs')
s=p.read_text()
start=s.index('expect(\n  reminderService,')
end=s.index('expect(\n  individualRoute,',start)
s=s[:start]+'''const responseService = read("src/lib/player-pool/response-check.ts");
const responseTemplates = read("prisma/migrations/20260912183000_player_pool_response_check/migration.sql");
expect(reminderService, '"player-pool-response-check-email"', "Response checks use the editable template.");
expect(reminderService, "queuePlayerPoolResponseCheck(input)", "Every reminder uses the shared guarded queue.");
expect(reminderService, "PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE", "Historical reminders retain their auditable source identity.");
expect(responseService, "queueNotificationFromTemplate", "Customer reminders use System Templates.");
expect(responseService, "getPlayerPoolContactHistory", "The send gate checks real contact history.");
expect(responseTemplates, "Complete my PlayerPool profile", "Keep a clear profile-completion button.");
expect(responseTemplates, "profileUrl", "The button resolves the player's secure profile URL.");
expect(responseTemplates, "{{profileUrl}}", "Plain-text email retains the secure fallback link.");
expect(responseTemplates, "reply **NO**", "The response check explicitly welcomes a no.");
expect(responseTemplates, "positions, experience and availability", "Explain the profile details needed for team matching.");
expect(responseTemplates, "we cannot introduce you to a team", "Explain why a completed response is necessary.");
expect(responseTemplates, "contact details are not made public", "Preserve contact privacy.");
expect(responseTemplates, "does not charge you anything and does not commit you", "Preserve no-charge and no-commitment guidance.");
expect(responseTemplates, "ON CONFLICT (key) DO NOTHING", "Template seeding must preserve administrator edits.");
reject(reminderService, "PLAYER_POOL_PROFILE_REMINDER_BODY", "Do not embed final customer messages in application code.");

'''+s[end:]
s=s.replace('use the full shared PlayerPool email', 'use the shared guarded PlayerPool email')
s=s.replace('Opening PlayerPool admin must make the editable reminder template available.', 'PlayerPool admin must reference the existing editable reminder template.')
s=s.replace('rich email, awaiting-only bulk send', 'editable yes/no email, guarded awaiting-only bulk send')
p.write_text(s)
