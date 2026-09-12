import assert from "node:assert/strict";
import { test } from "node:test";
import { followupBlock, type FollowupState, RESPONSE_CHASE_SOURCE } from "../../src/lib/player-pool/followup-policy";
const now = new Date("2026-09-12T12:00:00Z");
const base = (): FollowupState => ({ id: "p", prospectId: "s", profileToken: "secret", publicCode: "PP-TEST", status: "INVITED", profileSubmittedAt: null,
  invitedAt: new Date("2026-09-01Z"), createdAt: new Date("2026-09-01Z"), firstName: "Test", email: "p@example.invalid", phone: null,
  emailMatches: true, hasSquadRecord: false, hasIntroduction: false, emailBlocked: false, smsBlocked: false,
  latestReplyAt: null, replyThreadId: null, declinedAt: null, events: [] });
test("silence remains eligible, never a refusal", () => assert.equal(followupBlock(base(), now), null));
test("completed, changed status, opt-out, identity changes, missing email/link, replies and existing teams are excluded", () => {
  for (const change of [{ profileSubmittedAt: now }, { status: "AVAILABLE" }, { status: "NOT_LOOKING" }, { status: "PAUSED" }, { status: "JOINED" },
    { emailBlocked: true }, { emailMatches: false }, { email: null }, { profileToken: "" }, { latestReplyAt: now }, { hasSquadRecord: true }, { hasIntroduction: true }, { declinedAt: now }]) {
    assert.ok(followupBlock({ ...base(), ...change }, now), JSON.stringify(change));
  }
});
test("one response request only, even when failed, cancelled or queued", () => {
  for (const status of ["QUEUED", "PROCESSING", "SENT", "FAILED", "CANCELLED", "SKIPPED"]) {
    const s = base(); s.events = [{ id: "x", kind: RESPONSE_CHASE_SOURCE, channel: "EMAIL", status, at: now.toISOString(), sentAt: null, scheduledFor: null, by: "System" }];
    assert.match(followupBlock(s, now)!, /already recorded/);
  }
});
test("original invite and old SMS evidence enforce exact 48h boundary", () => {
  const s = base(); s.events = [{ id: "x", kind: "PLAYER_POOL_PROFILE_INVITE", channel: "EMAIL", status: "SENT", at: now.toISOString(), sentAt: new Date(now.getTime() - 48*3600000 + 1).toISOString(), scheduledFor: null, by: "System" }];
  assert.match(followupBlock(s, now)!, /48 hours/);
  s.events[0].sentAt = new Date(now.getTime() - 48*3600000).toISOString(); assert.equal(followupBlock(s, now), null);
  s.events[0].status = "QUEUED"; assert.match(followupBlock(s, now)!, /already queued/);
});
