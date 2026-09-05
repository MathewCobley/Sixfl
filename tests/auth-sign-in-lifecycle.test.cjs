const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

// Execute the real, prepared TypeScript with fake database/email boundaries.
// No live credentials, network, users or emails are used by these tests.
const root = path.resolve(__dirname, "..");
function harness(options = {}) {
  const queries = [], rows = new Map(), updates = [], sent = [];
  const cache = new Map();
  const state = { ...options };
  const prisma = {
    user: {
      findUnique: async () => {
        if (state.lookupError) throw new Error("Account lookup unavailable");
        return state.user ?? null;
      },
      update: async (data) => { updates.push(data); throw new Error("Forbidden request-stage user update"); },
      updateMany: async (data) => { updates.push(data); return { count: 1 }; },
    },
    teamPlayerProspect: { findFirst: async () => state.prospect ?? null },
    notificationTemplate: { findUnique: async () => {
      if (state.templateError) throw new Error("Template unavailable");
      return null;
    } },
    $executeRaw: async (parts, ...values) => {
      const query = parts.join("?");
      queries.push({ query, values });
      if (state.trackingError && query.includes('"SignInLinkActivity"')) throw new Error("Tracking unavailable");
      if (query.includes('INSERT INTO "SignInLinkActivity"')) {
        rows.set(values[0], { id: values[0], email: values[2] });
      } else if (query.includes('UPDATE "SignInLinkActivity"') && !query.includes("WITH candidate")) {
        const enrich = query.includes('"userNameSnapshot" =');
        const row = rows.get(values[values.length - (enrich ? 2 : 1)]);
        if (row && enrich) { row.team = values[4]; row.host = values[6]; }
        else if (row && query.includes('"sentAt" = NOW()')) {
          row.sent = true;
          if (query.includes('"failureReason" = NULL')) delete row.failure;
        }
        else if (row && query.includes('"failedAt" = NOW()')) row.failure ??= values[0];
      }
      return 1;
    },
  };
  const mocks = {
    "@/lib/prisma": { prisma },
    "@auth/prisma-adapter": { PrismaAdapter: () => ({}) },
    "next-auth/providers/email": { default: (config) => config },
    resend: { Resend: class {
      emails = { send: async (mail) => {
        sent.push(mail);
        if (state.sendWait) await state.sendWait;
        if (state.sendError) return { error: { message: state.sendError } };
        return { data: { id: "mock-provider-id" }, error: null };
      } };
    } },
    "@/lib/email/buildEmail": {
      appendSIXFLTextSignature: (text) => text,
      buildSIXFLEmailHtml: ({ body }) => body,
    },
    "@/lib/notifications/renderer": { renderNotificationText: (text) => text },
    "@/lib/auth/pendingCaptain": {
      getPendingCaptainContext: async () => state.pendingCaptain ?? null,
      getCaptainLoginContext: async () => state.captain ?? null,
    },
  };
  function load(relative) {
    const filename = path.join(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
      reportDiagnostics: true,
    });
    assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    const localRequire = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      return require(id);
    };
    new Function("require", "module", "exports", compiled.outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  const auth = load("src/auth.ts").authOptions;
  const tracker = load("src/lib/auth/track-sign-in-request.ts");
  const activity = load("src/lib/auth/sign-in-link-activity.ts");
  const context = load("src/lib/auth/sign-in-request-context.ts");
  return { auth, tracker, activity, context, queries, rows, updates, sent, state, load };
}

const email = "invited.player@example.com";
const prototypeUser = { id: email, email, emailVerified: null };
const emailAccount = { provider: "email", type: "email" };
const prospect = { id: "prospect-1", firstName: "Player", team: { id: "team-1", name: "Example United" } };
const existingUser = { id: "persisted-user-1", email, emailVerified: null, name: "Player", role: "USER", teamMembers: [] };
const request = (address = email) => new Request("https://sixfl.co.uk/api/auth/signin/email", {
  method: "POST", body: new URLSearchParams({ email: address, csrfToken: "test-csrf" }),
});
const failedResponse = (error) => Response.json({ url: `https://sixfl.co.uk/api/auth/error?error=${encodeURIComponent(error)}` });
async function flow(h, address = email) {
  return h.tracker.withTrackedSignInRequest(request(address), async () => {
    const allowed = await h.auth.callbacks.signIn({
      user: h.state.user ?? { ...prototypeUser, id: address, email: address },
      account: emailAccount, email: { verificationRequest: true },
    });
    if (!allowed) return failedResponse("AccessDenied");
    try {
      await h.auth.providers[0].sendVerificationRequest({
        identifier: address,
        url: `https://www.sixfl.co.uk/api/auth/callback/email?token=DO_NOT_STORE&email=${encodeURIComponent(address)}&callbackUrl=${encodeURIComponent("https://www.sixfl.co.uk/dashboard")}`,
        provider: { from: "test@example.com" },
      });
      if (h.state.tokenError) throw new Error("Token persistence failed");
      return Response.json({ url: "https://sixfl.co.uk/api/auth/verify-request?provider=email&type=email" });
    } catch { return failedResponse("EmailSignin"); }
  });
}

test("first-time invited player can request a link without updating a prototype ID", async () => {
  const h = harness({ prospect });
  await flow(h);
  assert.equal(h.sent.length, 1);
  assert.equal(h.updates.length, 0);
  assert.equal(h.rows.size, 1);
  const row = [...h.rows.values()][0];
  assert.equal(row.sent, true);
  assert.equal(row.team, "Example United");
  assert.equal(row.failure, undefined);
  assert.equal(JSON.stringify(h.queries).includes("DO_NOT_STORE"), false);
});

test("existing unverified user's request does not verify their email", async () => {
  const h = harness({ user: existingUser });
  await flow(h);
  assert.equal(h.updates.length, 0);
  assert.equal(h.sent.length, 1);
});

test("pending captain without a User row retains sign-in eligibility", async () => {
  const h = harness({ pendingCaptain: { teamId: "team-1", teamName: "Example United", claimCode: "private-claim" } });
  await flow(h);
  assert.equal(h.sent.length, 1);
  assert.equal(h.updates.length, 0);
});

test("access rejection is recorded before email preparation, without sending", async () => {
  const h = harness();
  const result = await flow(h);
  assert.equal(result.status, 200); // NextAuth errors may be JSON URLs with HTTP 200.
  assert.match([...h.rows.values()][0].failure, /account checks.*access check/);
  assert.equal(h.sent.length, 0);
});

test("successful sign-in event verifies only the persisted account and records use", async () => {
  const h = harness({ user: existingUser });
  await h.auth.events.signIn({ user: existingUser, account: emailAccount });
  assert.equal(h.updates.length, 1);
  assert.deepEqual(h.updates[0].where, { id: existingUser.id, emailVerified: null });
  assert.ok(h.updates[0].data.emailVerified instanceof Date);
  assert.ok(h.queries.some(({ query }) => query.includes('"usedAt" = NOW()')));
});

test("non-email sign-in never verifies an email address", async () => {
  const h = harness();
  await h.auth.events.signIn({ user: existingUser, account: { provider: "other" } });
  assert.equal(h.updates.length, 0);
});

test("callback-stage authorization never writes verification even after token click", async () => {
  const h = harness({ prospect });
  assert.equal(await h.auth.callbacks.signIn({ user: prototypeUser, account: emailAccount }), true);
  assert.equal(h.updates.length, 0);
});

test("adapter/authorization exception leaves a safe failure record and still throws", async () => {
  const h = harness({ lookupError: true });
  await assert.rejects(flow(h), /Account lookup unavailable/);
  assert.equal(h.rows.size, 1);
  assert.match([...h.rows.values()][0].failure, /account checks/);
});

test("early NextAuth adapter failure is recorded before any provider callback", async () => {
  const h = harness();
  const exception = new Error("postgres://user:secret@database/private");
  await assert.rejects(h.tracker.withTrackedSignInRequest(request(), async () => { throw exception; }), error => error === exception);
  assert.match([...h.rows.values()][0].failure, /authentication/);
  assert.equal(JSON.stringify(h.queries).includes("postgres://"), false);
});

test("email-template failures are visible even before provider send tracking starts", async () => {
  const h = harness({ prospect, templateError: true });
  await flow(h);
  assert.equal(h.rows.size, 1);
  assert.equal(h.sent.length, 0);
  assert.match([...h.rows.values()][0].failure, /email preparation/);
});

test("provider rejection preserves its safe reason, not a later generic error", async () => {
  const h = harness({ prospect, sendError: "Rate limit exceeded" });
  await flow(h);
  assert.equal(h.rows.size, 1);
  assert.match([...h.rows.values()][0].failure, /email delivery.*Rate limit exceeded/);
  assert.equal([...h.rows.values()][0].sent, undefined);
});

test("sent email with a subsequent token failure is distinguishable from success", async () => {
  const h = harness({ prospect, tokenError: true });
  await flow(h);
  const row = [...h.rows.values()][0];
  assert.equal(row.sent, true);
  assert.match(row.failure, /verification token/);
});

test("CSRF rejection is recorded without weakening enforcement or changing response", async () => {
  const h = harness();
  const response = Response.json({ url: "https://sixfl.co.uk/api/auth/signin?csrf=true" }, { headers: { "x-test": "preserved" } });
  const result = await h.tracker.withTrackedSignInRequest(request(), async () => response);
  assert.equal(result, response);
  assert.equal(result.headers.get("x-test"), "preserved");
  assert.match([...h.rows.values()][0].failure, /browser security check/);
  assert.ok((await result.json()).url.endsWith("csrf=true"));
});

test("unknown error URL cannot persist credentials or raw exception content", async () => {
  const h = harness();
  await h.tracker.withTrackedSignInRequest(request(), async () => failedResponse("secret=PRIVATE_TOKEN database failure"));
  assert.match([...h.rows.values()][0].failure, /authentication/);
  assert.equal(JSON.stringify(h.queries).includes("PRIVATE_TOKEN"), false);
});

test("concurrent requests for the same email have separate records and request contexts", async () => {
  const h = harness({ prospect });
  await Promise.all([flow(h), flow(h)]);
  assert.equal(h.rows.size, 2);
  assert.equal(h.sent.length, 2);
  assert.ok([...h.rows.values()].every(row => row.sent && row.team === "Example United"));
  assert.equal(h.context.signInRequestContext.getStore(), undefined);
});

test("logging outage cannot block the email request or create a false verification", async () => {
  const h = harness({ prospect, trackingError: true });
  const response = await flow(h);
  assert.equal(h.sent.length, 1);
  assert.equal(h.updates.length, 0);
  assert.ok((await response.json()).url.includes("verify-request"));
});

test("non-sign-in POST routes and sign-out are passed through without a sign-in row", async () => {
  const h = harness();
  const response = new Response("unchanged");
  assert.equal(await h.tracker.withTrackedSignInRequest(new Request("https://sixfl.co.uk/api/auth/signout", { method: "POST" }), async () => response), response);
  assert.equal(h.rows.size, 0);
});

test("tracking preserves the original request body for NextAuth's CSRF validation", async () => {
  const h = harness();
  const req = request("  Player@Example.com ");
  await h.tracker.withTrackedSignInRequest(req, async () => {
    const form = await req.formData();
    assert.equal(form.get("csrfToken"), "test-csrf");
    assert.equal(form.get("email"), "  Player@Example.com ");
    return new Response("ok");
  });
  assert.equal([...h.rows.values()][0].email, "player@example.com");
});

test("technical warnings never recommend registration or expose raw errors", () => {
  const h = harness();
  const { loginErrorNotice } = h.load("src/lib/auth/login-notice.ts");
  for (const error of ["AccessDenied", "EmailSignin", "CSRF", "Verification", "secret=PRIVATE", null]) {
    const notice = loginErrorNotice(error);
    assert.equal(notice.showRegistration, false);
    assert.equal(notice.message.includes("PRIVATE"), false);
  }
  assert.match(loginErrorNotice("Verification").message, /expired or has already been used/);
  const page = fs.readFileSync(path.join(root, "src/app/(public)/login/page.tsx"), "utf8");
  assert.ok(page.includes("notice.showRegistration &&"));
  assert.ok(page.includes("finally"));
  assert.ok(page.includes('data.canLogin === false'));
  const route = fs.readFileSync(path.join(root, "src/app/api/auth/[...nextauth]/route.ts"), "utf8");
  assert.ok(route.includes("withTrackedSignInRequest(request, () => handler(request, context))"));
});

// NextAuth v4 uses Promise.all for delivery and token persistence, not a
// sequential send-then-token flow. A late provider success must not erase an
// earlier failure returned to the browser.
test("parallel token failure survives a later email-provider success", async () => {
  let release;
  const sendWait = new Promise(resolve => { release = resolve; });
  const h = harness({ prospect, sendWait });
  let sender;
  await h.tracker.withTrackedSignInRequest(request(), async () => {
    await h.auth.callbacks.signIn({ user: prototypeUser, account: emailAccount, email: { verificationRequest: true } });
    sender = h.auth.providers[0].sendVerificationRequest({
      identifier: email,
      url: "https://sixfl.co.uk/api/auth/callback/email?token=DO_NOT_STORE",
      provider: { from: "test@example.com" },
    });
    try {
      await Promise.all([sender, new Promise((_, reject) => setImmediate(() => reject(new Error("Token persistence failed"))))]);
      return new Response("unexpected success");
    } catch { return failedResponse("EmailSignin"); }
  });
  const row = [...h.rows.values()][0];
  assert.ok(row.failure);
  const originalFailure = row.failure;
  assert.equal(row.sent, undefined);
  release();
  await sender;
  assert.equal(row.sent, true);
  assert.equal(row.failure, originalFailure);
});
