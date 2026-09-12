import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { prisma } from "../../src/lib/prisma";
const dbUrl = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(process.env.SIXFL_PLAYERPOOL_RESPONSE_TEST === "1" && dbUrl.hostname === "127.0.0.1" && dbUrl.pathname === "/sixfl_playerpool_response_test", "Disposable database only");
const root = "http://localhost:3109";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3109"], { env: { ...process.env, NEXTAUTH_URL: root, NEXT_PUBLIC_SITE_URL: root }, stdio: "ignore" });
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
async function main() {
  for (let n = 0; n < 60; n++) { try { await fetch(root + "/login"); break; } catch { await pause(500); } }
  for (const method of ["GET", "POST"]) {
    const response = await fetch(root + "/api/admin/player-pool/response-chases", { method, redirect: "manual", headers: { "Content-Type": "application/json", Origin: root }, ...(method === "POST" ? { body: '{"confirm":true,"profileIds":[]}' } : {}) });
    assert.ok([301,302,303,307,308,401,403].includes(response.status), `Unauthenticated ${method} must be denied, got ${response.status}`);
  }
  assert.equal((await fetch(root + "/player-pool/profile/nonexistent-test-token/respond")).status, 404);
  const id = randomUUID(), token = randomUUID(), email = `${id}@example.invalid`;
  const prospect = await prisma.teamPlayerProspect.create({ data: { firstName: "HTTP test", email } });
  await prisma.$executeRaw`INSERT INTO "PlayerPoolProfile" (id,"prospectId","profileToken","publicCode","emailNormalized",status,"createdAt","updatedAt") VALUES (${id},${prospect.id},${token},${'PP-'+id},${email},'INVITED',NOW(),NOW())`;
  const route = root + `/player-pool/profile/${token}/respond`;
  let html = "";
  for (let n = 0; n < 2; n++) { const response = await fetch(route); assert.equal(response.status, 200); html = await response.text(); }
  assert.match(html, /Yes — complete my player profile/);
  assert.match(html, /No — I am no longer looking/);
  assert.match(html, /noindex/);
  const current = () => prisma.$queryRaw<Array<{ status: string }>>`SELECT status FROM "PlayerPoolProfile" WHERE id = ${id}`;
  assert.equal((await current())[0].status, "INVITED", "Opening/scanning links must not decline");
  const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0];
  assert.ok(form, "Native response form must be server rendered");
  const data = new FormData();
  for (const tag of form.match(/<input\b[^>]*>/g) || []) {
    const name = tag.match(/\bname="([^"]*)"/)?.[1], value = tag.match(/\bvalue="([^"]*)"/)?.[1] || "";
    if (name) data.append(decode(name), decode(value));
  }
  assert.ok([...data.keys()].some(key => key.startsWith("$ACTION_")), "Use the genuine server action form, not a bypass");
  const response = await fetch(route, { method: "POST", body: data, headers: { Origin: root }, redirect: "follow" });
  assert.equal(response.status, 200);
  assert.equal((await current())[0].status, "NOT_LOOKING", "Only the deliberate action closes the profile");
  assert.match(await response.text(), /Thanks for letting us know/);
  console.log("PlayerPool HTTP checks passed: admin GET/POST denial, invalid token, read-only link opening and genuine native form POST closure.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { server.kill("SIGTERM"); await prisma.$disconnect(); });
