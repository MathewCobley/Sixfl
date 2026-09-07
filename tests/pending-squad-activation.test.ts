import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { queuePendingSquadActivationEmail, getPendingActivationEmailStatus, getSquadActivationEmailDeliveryBlock, runPendingSquadActivationEmailJob, SQUAD_ACTIVATION_EMAIL_KEY as KEY } from "../src/lib/squad/activation-emails";
import PendingActivationEmailStatus from "../src/components/admin/squad/PendingActivationEmailStatus";
import { renderToStaticMarkup } from "react-dom/server";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_ISOLATED_ACTIVATION_TEST === "1" && url.hostname === "127.0.0.1" && url.pathname === "/sixfl_activation_test", "Disposable local database only.");
globalThis.fetch = async () => { throw new Error("External HTTP is forbidden in activation tests"); };
const ago = () => new Date(Date.now() - 600_000);
before(async () => {
  execFileSync("psql", [process.env.DATABASE_URL!, "-v", "ON_ERROR_STOP=1", "-f", "prisma/migrations/20260424162000_add_team_member_profile/migration.sql"], { stdio: "pipe" });
  await prisma.notificationTemplate.create({ data: { key: KEY, name: "Test editable activation email", channel: "EMAIL", audience: "PLAYER", kind: "TRANSACTIONAL", isActive: true,
    subject: "Activate {{teamName}}", body: "Hi {{firstName}},\n\n{{squadInviteIntroLine}}\n{{teamContextLine}}\n{{squadAccessLine}}\n\n{{cta}}", ctaLabel: "Activate squad place", ctaUrlKey: "squadActivationUrl" } });
});
after(async () => { await prisma.$disconnect(); });
async function target() {
  const id = randomUUID();
  const team = await prisma.team.create({ data: { name: `Test Squad ${id}`, claimCode: id, teamMode: "MANAGED" } });
  const prospect = await prisma.teamPlayerProspect.create({ data: { teamId: team.id, firstName: "Test", lastName: "Player", email: `${id}@example.invalid`, status: "ACTIVE_SQUAD" } });
  return { team, prospect };
}
const queue = (t: Awaited<ReturnType<typeof target>>) => queuePendingSquadActivationEmail({ prospectId: t.prospect.id });
const load = (id: string) => prisma.notificationDispatch.findUniqueOrThrow({ where: { id }, include: { recipient: true, template: true } });
async function queued(t: Awaited<ReturnType<typeof target>>) {
  const result = await queue(t); assert.ok(result.queued && "dispatch" in result && result.dispatch); return load(result.dispatch.id);
}
async function member(t: Awaited<ReturnType<typeof target>>, email = t.prospect.email!) {
  const user = await prisma.user.create({ data: { name: "Test Player", email } });
  return prisma.teamMember.create({ data: { teamId: t.team.id, userId: user.id, role: "PLAYER" } });
}

test("pending state queues one editable-template email without linking an account or changing promotion time", async () => {
  const t = await target(); const d = await queued(t);
  assert.equal(d.template?.key, KEY); assert.equal(d.status, "QUEUED"); assert.equal(d.channel, "EMAIL");
  assert.match(d.bodyText, /Test/); assert.doesNotMatch(d.bodyText, /\{\{/); assert.match(JSON.stringify(d.variables), /squad\/activate/);
  assert.equal(await prisma.teamMember.count({ where: { teamId: t.team.id } }), 0);
  assert.equal(await prisma.user.count({ where: { email: t.prospect.email } }), 0);
  assert.equal((await prisma.teamPlayerProspect.findUniqueOrThrow({ where: { id: t.prospect.id } })).updatedAt.getTime(), t.prospect.updatedAt.getTime());
  assert.ok(await prisma.messageEntry.findFirst({ where: { notificationDispatchId: d.id } }));
});
test("PostgreSQL locking deduplicates overlapping cron workers and a manual first send", async () => {
  const t = await target(); const results = await Promise.all([queue(t), queue(t), queuePendingSquadActivationEmail({ prospectId: t.prospect.id, teamId: t.team.id, mode: "initial" })]);
  assert.equal(results.filter(r => r.queued).length, 1);
  assert.equal(await prisma.notificationDispatch.count({ where: { sourceId: t.prospect.id } }), 1);
});
test("sent, failed, skipped, cancelled and processing attempts never automatically resend", async () => {
  for (const status of ["SENT", "FAILED", "SKIPPED", "CANCELLED", "PROCESSING"] as const) {
    const t = await target(); const d = await queued(t);
    await prisma.notificationDispatch.update({ where: { id: d.id }, data: { status, createdAt: ago(), sentAt: status === "SENT" ? ago() : null } });
    assert.equal((await queue(t)).queued, false);
    assert.equal(await prisma.notificationDispatch.count({ where: { sourceId: t.prospect.id } }), 1);
  }
});
test("explicit manual resend remains possible, but queued and rapid repeated sends are held", async () => {
  const t = await target(); const d = await queued(t);
  const resend = () => queuePendingSquadActivationEmail({ prospectId: t.prospect.id, teamId: t.team.id, mode: "resend" });
  assert.equal((await resend()).queued, false);
  await prisma.notificationDispatch.update({ where: { id: d.id }, data: { status: "SENT", sentAt: new Date() } });
  assert.equal((await resend()).queued, false);
  await prisma.notificationDispatch.update({ where: { id: d.id }, data: { createdAt: ago(), sentAt: ago() } });
  const r = await resend(); assert.ok(r.queued && "dispatch" in r && r.dispatch);
  assert.equal(await getSquadActivationEmailDeliveryBlock(await load(r.dispatch.id)), null);
  assert.equal((await resend()).queued, false);
});
test("invalid email and non-managed or non-pending prospects are held with visible reasons", async () => {
  for (const email of [null, " ", "bad-address"]) {
    const t = await target(); await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { email } });
    assert.equal((await queue(t)).queued, false); assert.match(await getPendingActivationEmailStatus(t.prospect.id), /valid player email/);
  }
  const t = await target(); await prisma.team.update({ where: { id: t.team.id }, data: { teamMode: "STANDARD" } }); assert.equal((await queue(t)).queued, false);
  for (const status of ["NEW", "CONTACTED", "DECLINED", "BACKUP"]) {
    const t = await target(); await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { status } }); assert.equal((await queue(t)).queued, false);
  }
});
test("existing squad membership and exact source-prospect links stop activation", async () => {
  const t = await target(); await member(t); assert.equal((await queue(t)).queued, false);
  const p = await target(); const m = await member(p, `${randomUUID()}@example.invalid`);
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "TeamMemberProfile" (id,"teamMemberId","sourceProspectId") VALUES (${randomUUID()},${m.id},${p.prospect.id})`);
  assert.equal((await queue(p)).queued, false);
});
test("differently named users or prospects sharing an email are not sent an activation", async () => {
  const t = await target(); await prisma.user.create({ data: { name: "Another Person", email: t.prospect.email } });
  assert.equal((await queue(t)).queued, false); assert.match(await getPendingActivationEmailStatus(t.prospect.id), /identity/);
  const p = await target(); await prisma.teamPlayerProspect.create({ data: { firstName: "Another", lastName: "Person", email: p.prospect.email } });
  assert.equal((await queue(p)).queued, false); assert.match(await getPendingActivationEmailStatus(p.prospect.id), /shared/);
});
test("existing suppression and preferences are never reset by automation or manual sends", async () => {
  for (const field of ["isSuppressed", "transactionalEmailOptIn", "emailEnabled"]) {
    const t = await target(); const recipient = await prisma.notificationRecipient.create({ data: { sourceType: "GENERAL", sourceId: `team-prospect:${t.prospect.id}`, audience: "PLAYER", email: t.prospect.email,
      isSuppressed: field === "isSuppressed", transactionalEmailOptIn: field !== "transactionalEmailOptIn", preferences: { create: { emailEnabled: field !== "emailEnabled" } } } });
    const before = await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: recipient.id }, include: { preferences: true } });
    assert.equal((await queue(t)).queued, false);
    assert.equal((await queuePendingSquadActivationEmail({ prospectId: t.prospect.id, teamId: t.team.id, mode: "initial" })).queued, false);
    assert.deepEqual(await prisma.notificationRecipient.findUniqueOrThrow({ where: { id: recipient.id }, include: { preferences: true } }), before);
  }
});
test("disabled templates and administrator edits are preserved", async () => {
  const t = await target(); const template = await prisma.notificationTemplate.findUniqueOrThrow({ where: { key: KEY } });
  await prisma.notificationTemplate.update({ where: { key: KEY }, data: { isActive: false } });
  assert.equal((await queue(t)).queued, false); assert.match(await getPendingActivationEmailStatus(t.prospect.id), /disabled/);
  await prisma.notificationTemplate.update({ where: { key: KEY }, data: { isActive: true, subject: "My edited activation for {{teamName}}" } });
  const d = await queued(t); assert.match(d.subject!, /^My edited activation/);
  await prisma.notificationTemplate.update({ where: { key: KEY }, data: { subject: template.subject } });
});
test("delivery rechecks linking, removal, deletion, move, changed email and suppression", async () => {
  for (const change of ["linked", "removed", "deleted", "moved", "email", "suppressed"]) {
    const t = await target(); const d = await queued(t);
    assert.equal(await getSquadActivationEmailDeliveryBlock(d), null);
    if (change === "linked") await member(t);
    else if (change === "removed") await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { status: "CONTACTED", teamId: null } });
    else if (change === "deleted") await prisma.teamPlayerProspect.delete({ where: { id: t.prospect.id } });
    else if (change === "moved") { const other = await target(); await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { teamId: other.team.id } }); }
    else if (change === "email") await prisma.teamPlayerProspect.update({ where: { id: t.prospect.id }, data: { email: `${randomUUID()}@example.invalid` } });
    else await prisma.notificationRecipient.update({ where: { id: d.recipientId }, data: { isSuppressed: true } });
    assert.ok(await getSquadActivationEmailDeliveryBlock(d), change);
  }
});
test("same-source duplicate and provider-accepted evidence block automatic delivery", async () => {
  const t = await target(); const d = await queued(t);
  await prisma.notificationDispatch.create({ data: { templateId: d.templateId, recipientId: d.recipientId, channel: "EMAIL", audience: "PLAYER", sourceType: d.sourceType, sourceId: d.sourceId, bodyText: "Earlier accepted mail", status: "FAILED", providerMessageId: "test-accepted", createdAt: ago() } });
  assert.match((await getSquadActivationEmailDeliveryBlock(d))!, /duplicate/);
});
test("existing pending records are swept automatically; repeating the sweep does not resend", async () => {
  const t = await target(); await runPendingSquadActivationEmailJob();
  assert.equal(await prisma.notificationDispatch.count({ where: { sourceId: t.prospect.id } }), 1);
  await runPendingSquadActivationEmailJob(); assert.equal(await prisma.notificationDispatch.count({ where: { sourceId: t.prospect.id } }), 1);
});
test("UI is read-only, explains next run, and shared hook is before provider delivery", async () => {
  const t = await target(); const html = renderToStaticMarkup(await PendingActivationEmailStatus({ prospectId: t.prospect.id }));
  assert.match(html, /automatically on the next notification run/);
  assert.equal(await prisma.notificationDispatch.count({ where: { sourceId: t.prospect.id } }), 0);
  const processor = readFileSync("src/lib/notifications/processor.ts", "utf8");
  assert.ok(processor.indexOf("await getSquadActivationEmailDeliveryBlock(dispatch)") < processor.indexOf("const sendResult = await sendEmailWithResend"));
  const cron = readFileSync("src/app/api/cron/notifications/route.ts", "utf8"); assert.match(cron, /runPendingSquadActivationEmailJob/);
  const manual = readFileSync("src/app/captain/team/[teamid]/squad/send-activation/route.ts", "utf8");
  assert.match(manual, /queuePendingSquadActivationEmail/); assert.doesNotMatch(manual, /queueNotificationFromTemplate|transactionalEmailOptIn: true/);
  for (const name of ["page", "layout"]) assert.match(readFileSync(`src/app/captain/team/[teamid]/squad/${name}.tsx`,"utf8"), /PendingActivationEmailStatus/);
});
