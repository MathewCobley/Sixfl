// Explicit one-off operational entry point. Not mounted in HTTP, startup or cron.
// No provider credentials needed: only the shared application outbox is written.
import { prisma } from "../src/lib/prisma";
import { getPlayerPoolFollowupStates } from "../src/lib/player-pool/followup-history";
import { followupBlock, RESPONSE_CHASE_SOURCE } from "../src/lib/player-pool/followup-policy";
import { runPlayerPoolResponseChases } from "../src/lib/player-pool/response-chases";
async function main() {
  const mode = process.env.PLAYERPOOL_RESPONSE_MODE || "dry-run";
  if (!["dry-run", "enqueue", "status"].includes(mode)) throw new Error("Invalid mode");
  const ids: unknown = JSON.parse(process.env.PLAYERPOOL_RESPONSE_IDS || "[]");
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || id.length > 100) || ids.length > 500) throw new Error("Invalid reviewed target IDs");
  const states = await getPlayerPoolFollowupStates(ids.length ? ids as string[] : undefined);
  if (states.length > 500) throw new Error("Review smaller batches of at most 500");
  if (mode === "enqueue") {
    if (process.env.PLAYERPOOL_RESPONSE_AUTHORISATION !== "owner-request-2026-09-12" || !ids.length) throw new Error("Explicit owner-request authorisation and reviewed IDs required");
    console.log("PLAYERPOOL_RESPONSE_QUEUE " + JSON.stringify(await runPlayerPoolResponseChases(ids as string[])));
  } else if (mode === "status") {
    console.log("PLAYERPOOL_RESPONSE_STATUS " + JSON.stringify(states.map(s => ({ publicCode: s.publicCode,
      status: s.status, replyAt: s.latestReplyAt, decisions: s.declinedAt,
      requests: s.events.filter(e => e.kind === RESPONSE_CHASE_SOURCE).map(e => ({ id: e.id, status: e.status, sentAt: e.sentAt })) }))));
  } else {
    console.log("PLAYERPOOL_RESPONSE_AUDIT " + JSON.stringify(states.map(s => ({ profileId: s.id, publicCode: s.publicCode,
      reason: followupBlock(s), replyAt: s.latestReplyAt,
      events: s.events.map(e => ({ kind: e.kind, channel: e.channel, status: e.status, sentAt: e.sentAt })) }))));
  }
}
main().catch(() => { console.error("PlayerPool operational job failed; no credentials or profile links logged. Review application evidence before retrying."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
