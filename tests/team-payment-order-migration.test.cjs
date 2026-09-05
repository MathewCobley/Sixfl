const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const url = process.env.PAYMENT_ORDER_TEST_DATABASE_URL;
const enabled = Boolean(url);
if (enabled) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.pathname !== "/sixfl_payment_order_test") {
    throw new Error("Payment-order tests require the dedicated localhost test database, never production.");
  }
}
const schema = "payment_order_ci";
function query(sql) {
  return execFileSync("psql", [url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", `SET search_path TO ${schema}; ${sql}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function asyncQuery(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", `SET search_path TO ${schema}; ${sql}`]);
    let out = "", error = "";
    child.stdout.on("data", data => { out += data; }); child.stderr.on("data", data => { error += data; });
    child.on("error", reject); child.on("exit", code => code ? reject(new Error(error)) : resolve(out.trim()));
  });
}

test("isolated migration is idempotent and never reallocates completed payments", { skip: !enabled }, () => {
  query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE "PaymentTransaction" ("id" TEXT PRIMARY KEY, "chargeId" TEXT, "amountPence" INTEGER);
    INSERT INTO "PaymentTransaction" VALUES ('existing-receipt', 'september-fixture', 4000);`);
  const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20260905230000_team_payment_order/migration.sql"), "utf8");
  query(migration); query(migration);
  assert.equal(query('SELECT "chargeId" || \'|\' || "amountPence" FROM "PaymentTransaction" WHERE "id"=\'existing-receipt\''), "september-fixture|4000");
  assert.equal(query('SELECT COUNT(*) FROM "TeamPaymentOrderMaintenance"'), "1");
});

test("database rejects unaudited exceptions and latest reset/expiry cannot resurrect an older override", { skip: !enabled }, () => {
  assert.throws(() => query(`INSERT INTO "TeamPaymentOrderException" ("teamId","chargeId","action","reason","createdByUserId","createdByLabel","expiresAt") VALUES ('team','charge','HOLD','bad','admin','Admin',NOW()+INTERVAL '1 day')`));
  assert.throws(() => query(`INSERT INTO "TeamPaymentOrderException" ("teamId","chargeId","action","reason","createdByUserId","createdByLabel","expiresAt") VALUES ('team','charge','HOLD','Valid reason','admin','Admin',NULL)`));
  query(`INSERT INTO "TeamPaymentOrderException" ("teamId","chargeId","action","reason","createdByUserId","createdByLabel","expiresAt") VALUES ('team','charge','ALLOW_PAYMENT','One reviewed exception','admin','Admin',NOW()+INTERVAL '7 days')`);
  query(`INSERT INTO "TeamPaymentOrderException" ("teamId","chargeId","action","reason","createdByUserId","createdByLabel","expiresAt") VALUES ('team','charge','RESET','Restore normal priority','admin','Admin',NULL)`);
  const latest = `SELECT DISTINCT ON ("chargeId") "chargeId","action","expiresAt" FROM "TeamPaymentOrderException" ORDER BY "chargeId","id" DESC`;
  assert.equal(query(`SELECT COUNT(*) FROM (${latest}) latest WHERE "action"<>'RESET' AND "expiresAt">NOW()`), "0");
  query(`INSERT INTO "TeamPaymentOrderException" ("teamId","chargeId","action","reason","createdByUserId","createdByLabel","createdAt","expiresAt") VALUES ('team','charge','ALLOW_PAYMENT','Expired reviewed exception','admin','Admin','2020-01-01','2020-01-02')`);
  assert.equal(query(`SELECT COUNT(*) FROM (${latest}) latest WHERE "action"<>'RESET' AND "expiresAt">NOW()`), "0");
  assert.equal(query('SELECT COUNT(*) FROM "TeamPaymentOrderException"'), "3");
});

test("overlapping cleanup workers cannot both acquire the active lease", { skip: !enabled }, async () => {
  query(`UPDATE "TeamPaymentOrderMaintenance" SET "leaseUntil"=NULL WHERE "id"='open-checkouts'`);
  const claim = `UPDATE "TeamPaymentOrderMaintenance" SET "leaseUntil"=NOW()+INTERVAL '2 minutes' WHERE "id"='open-checkouts' AND ("leaseUntil" IS NULL OR "leaseUntil"<NOW()) RETURNING "id"`;
  const results = await Promise.all([asyncQuery(claim), asyncQuery(claim)]);
  assert.equal(results.filter(value => value === "open-checkouts").length, 1);
});

test("checkout audit is idempotent and records late completion without touching its receipt", { skip: !enabled }, () => {
  const insert = `INSERT INTO "TeamPaymentOrderCheckoutAudit" ("checkoutSessionId","event","chargeId","teamId","blockingChargeId") VALUES ('test-session','COMPLETED_OUT_OF_ORDER','september-fixture','team','august-fixture') ON CONFLICT DO NOTHING`;
  query(insert); query(insert);
  assert.equal(query('SELECT COUNT(*) FROM "TeamPaymentOrderCheckoutAudit"'), "1");
  assert.equal(query('SELECT "chargeId" FROM "PaymentTransaction" WHERE "id"=\'existing-receipt\''), "september-fixture");
});
