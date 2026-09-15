const assert = require("node:assert/strict");
const { test, before, beforeEach, after } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { PrismaClient } = require("@prisma/client");

// Refuse to run DDL anywhere except the disposable local CI database.
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.pathname, "/sixfl_kit_editor_test");
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const root = process.cwd();
let authorized = true;
const invalidated = [];
global.fetch = async () => { throw new Error("External provider traffic is forbidden in kit edit tests"); };

function loadTs(file, mocks = {}) {
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
  return mod.exports;
}
const constants = loadTs("src/lib/kits/constants.ts");
const { updateKitOrderItemAction: save } = loadTs("src/app/(admin)/admin/kits/item-actions.ts", {
  "@/lib/kits/constants": constants,
  "@/lib/prisma": { prisma: db },
  "next/cache": { revalidatePath: (value) => invalidated.push(value) },
  "@/lib/requireAdmin": { requireAdmin: async () => {
    if (!authorized) throw new Error("ADMIN_REQUIRED");
    return { user: { id: "admin-test" } };
  } },
});

before(async () => {
  await db.$executeRawUnsafe(`CREATE TYPE "TeamKitSize" AS ENUM ('S','M','L','XL','XXL')`);
  await db.$executeRawUnsafe(`CREATE TABLE "TeamKitOrder" (
    "id" text PRIMARY KEY, "teamId" text NOT NULL, "status" text NOT NULL,
    "kitDesignId" text DEFAULT 'design-original', "kitQuantity" integer DEFAULT 7,
    "adminNotes" text DEFAULT 'Supplier reference', "captainNotes" text DEFAULT 'Captain note',
    "sizesConfirmed" boolean DEFAULT true, "submittedByUserId" text DEFAULT 'captain-test',
    "submittedAt" timestamp DEFAULT '2000-01-01', "approvedAt" timestamp, "orderedAt" timestamp,
    "fulfilledAt" timestamp, "lastEditedByUserId" text, "updatedAt" timestamp DEFAULT '2000-01-01'
  )`);
  await db.$executeRawUnsafe(`CREATE TABLE "TeamKitOrderItem" (
    "id" text PRIMARY KEY, "orderId" text NOT NULL REFERENCES "TeamKitOrder"("id"),
    "position" integer NOT NULL, "backName" text, "shirtNumber" integer NOT NULL,
    "kitSize" "TeamKitSize" NOT NULL, "sockSize" text DEFAULT 'LARGE_8_PLUS',
    "createdAt" timestamp DEFAULT '2000-01-01', "updatedAt" timestamp DEFAULT '2000-01-01',
    UNIQUE ("orderId", "shirtNumber")
  )`);
  await db.$executeRawUnsafe(`CREATE TABLE "PaymentCharge" ("id" text PRIMARY KEY, "amountPence" integer, "status" text)`);
  await db.$executeRawUnsafe(`INSERT INTO "PaymentCharge" VALUES ('kit-payment', 2000, 'PAID')`);
});

beforeEach(async () => {
  authorized = true;
  invalidated.length = 0;
  await db.$executeRawUnsafe(`DELETE FROM "TeamKitOrderItem"`);
  await db.$executeRawUnsafe(`DELETE FROM "TeamKitOrder"`);
  await db.$executeRawUnsafe(`INSERT INTO "TeamKitOrder" ("id","teamId","status") VALUES ('order-a','team-a','SUBMITTED'), ('order-b','team-b','DRAFT')`);
  await db.$executeRawUnsafe(`INSERT INTO "TeamKitOrderItem" ("id","orderId","position","backName","shirtNumber","kitSize") VALUES
    ('item-a','order-a',1,'ALPHA',7,'M'), ('item-b','order-a',2,'BETA',8,'L'), ('item-c','order-b',1,'OTHER',1,'S')`);
});

after(async () => { await db.$disconnect(); });

function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    itemId: "item-a", orderId: "order-a", backName: "NEW NAME", shirtNumber: "9", kitSize: "XL",
    previousBackName: "ALPHA", previousShirtNumber: "7", previousKitSize: "M", previousStatus: "SUBMITTED",
    ...overrides,
  })) data.set(key, value);
  return data;
}
async function snapshot() {
  return {
    items: await db.$queryRawUnsafe(`SELECT * FROM "TeamKitOrderItem" ORDER BY "id"`),
    orders: await db.$queryRawUnsafe(`SELECT * FROM "TeamKitOrder" ORDER BY "id"`),
    payments: await db.$queryRawUnsafe(`SELECT * FROM "PaymentCharge" ORDER BY "id"`),
  };
}

test("row edit preserves other rows, kit allocation/design/status/notes, socks and paid charges", async () => {
  const old = await snapshot();
  assert.equal((await save(form())).ok, true);
  const next = await snapshot();
  assert.equal(next.items[0].backName, "NEW NAME");
  assert.equal(next.items[0].shirtNumber, 9);
  assert.equal(next.items[0].kitSize, "XL");
  for (const key of Object.keys(old.items[0]).filter((key) => !["backName", "shirtNumber", "kitSize", "updatedAt"].includes(key))) {
    assert.deepEqual(next.items[0][key], old.items[0][key], key);
  }
  for (const key of Object.keys(old.orders[0]).filter((key) => !["lastEditedByUserId", "updatedAt"].includes(key))) {
    assert.deepEqual(next.orders[0][key], old.orders[0][key], key);
  }
  assert.equal(next.orders[0].lastEditedByUserId, "admin-test");
  assert.deepEqual(next.items.slice(1), old.items.slice(1));
  assert.deepEqual(next.orders[1], old.orders[1]);
  assert.deepEqual(next.payments, old.payments);
  assert.ok(invalidated.includes("/admin/kits"));
  assert.ok(invalidated.includes("/captain/team/team-a/kit"));
  assert.ok(invalidated.includes("/api/admin/kits/orders.csv"));
});

test("number-only and lowercase back names work", async () => {
  assert.equal((await save(form({ backName: "  " }))).ok, true);
  assert.equal((await snapshot()).items[0].backName, null);
  assert.equal((await save(form({ backName: "o'neil", previousBackName: "", previousShirtNumber: "9", previousKitSize: "XL" }))).ok, true);
  assert.equal((await snapshot()).items[0].backName, "O'NEIL");
});

for (const invalid of [{ shirtNumber: "" }, { shirtNumber: "0" }, { shirtNumber: "100" }, { shirtNumber: "1.5" }, { shirtNumber: "1e1" }, { kitSize: "BAD" }, { backName: "A".repeat(19) }, { backName: "<script>" }]) {
  test(`invalid details do not change records: ${JSON.stringify(invalid)}`, async () => {
    const old = await snapshot();
    assert.equal((await save(form(invalid))).ok, false);
    assert.deepEqual(await snapshot(), old);
    assert.equal(invalidated.length, 0);
  });
}

test("wrong order, removed item and stale original details cannot overwrite records", async () => {
  const old = await snapshot();
  for (const invalid of [{ orderId: "missing" }, { itemId: "item-c" }, { itemId: "missing" }, { previousBackName: "STALE" }, { previousShirtNumber: "2" }, { previousKitSize: "S" }, { previousStatus: "DRAFT" }]) {
    assert.equal((await save(form(invalid))).ok, false);
  }
  assert.deepEqual(await snapshot(), old);
});

test("duplicates are rejected in the same order, not across other teams", async () => {
  const old = await snapshot();
  assert.equal((await save(form({ shirtNumber: "8" }))).ok, false);
  assert.deepEqual(await snapshot(), old);
  assert.equal((await save(form({ shirtNumber: "1" }))).ok, true);
});

test("parent locking serializes simultaneous requests for the same new number", async () => {
  const responses = await Promise.all([
    save(form({ shirtNumber: "22" })),
    save(form({ itemId: "item-b", previousBackName: "BETA", previousShirtNumber: "8", previousKitSize: "L", shirtNumber: "22" })),
  ]);
  assert.equal(responses.filter((response) => response.ok).length, 1);
  assert.equal((await snapshot()).items.filter((item) => item.shirtNumber === 22).length, 1);
});

for (const status of ["ORDERED", "FULFILLED"]) {
  test(`${status} needs supplier confirmation and retains its status`, async () => {
    await db.$executeRawUnsafe(`UPDATE "TeamKitOrder" SET "status" = $1 WHERE "id" = 'order-a'`, status);
    const old = await snapshot();
    assert.equal((await save(form({ previousStatus: status }))).ok, false);
    assert.deepEqual(await snapshot(), old);
    assert.equal((await save(form({ previousStatus: status, supplierConfirmed: "yes" }))).ok, true);
    assert.equal((await snapshot()).orders[0].status, status);
  });
}

test("cancelled order and non-admin requests cannot change records", async () => {
  await db.$executeRawUnsafe(`UPDATE "TeamKitOrder" SET "status" = 'CANCELLED' WHERE "id" = 'order-a'`);
  const old = await snapshot();
  assert.equal((await save(form({ previousStatus: "CANCELLED", supplierConfirmed: "yes" }))).ok, false);
  authorized = false;
  await assert.rejects(save(form()), /ADMIN_REQUIRED/);
  assert.deepEqual(await snapshot(), old);
});

test("failed metadata update rolls back the kit item as well", async () => {
  const old = await snapshot();
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_metadata() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_metadata BEFORE UPDATE ON "TeamKitOrder" FOR EACH ROW EXECUTE FUNCTION reject_metadata()`);
  try {
    assert.equal((await save(form())).ok, false);
    assert.deepEqual(await snapshot(), old);
    assert.equal(invalidated.length, 0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_metadata ON "TeamKitOrder"`);
    await db.$executeRawUnsafe(`DROP FUNCTION reject_metadata()`);
  }
});

test("prepared page preserves the catalogue, workflow controls, payment visibility and native row editor", () => {
  const page = fs.readFileSync("src/app/(admin)/admin/kits/page.tsx", "utf8");
  const editor = fs.readFileSync("src/components/admin/kits/KitOrderItemEditor.tsx", "utf8");
  assert.equal((page.match(/<KitOrderItemEditor\b/g) || []).length, 1);
  for (const token of ["KitDesignUploader", "updateKitOrderStatusAction", "updateKitOrderNotesAction", "getTeamKitSizeLabel(item.kitSize)", "listAdminKitPaymentActivity", "sizesConfirmed", 'name="secondaryColour"', "kit-design-"]) assert.ok(page.includes(token), token);
  assert.doesNotMatch(page, /name="style"|>Style<|design\.style|colour or style/);
  assert.doesNotMatch(editor, /<select\b|sockSize|querySelector|MutationObserver/);
  assert.match(editor, /FormListboxField/);
  assert.match(editor, /role="alert"/);
  assert.match(editor, /Save kit details/);
});
