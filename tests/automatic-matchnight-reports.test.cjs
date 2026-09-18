const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

function loadAuto() {
  const file = path.join(root, "src/lib/matchweek-reports/auto-publish.ts");
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;

  new Function("require", "module", "exports", code)((id) => {
    if (id === "node:crypto") return require(id);
    if (id === "@/lib/datetime/london") {
      const parts = (value) => Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
      );
      return {
        getLondonMinutesSinceMidnight(value) {
          const p = parts(value);
          return p.hour * 60 + p.minute;
        },
        toLondonDateInputValue(value) {
          const p = parts(value);
          return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
        },
        parseLondonDateTime() {
          throw new Error("Not used by the timing contract");
        },
      };
    }
    if (id === "@/lib/prisma") return { prisma: {} };
    if (id === "@/lib/league-news/manage") return { publishNewsAutomatically: async () => ({ automaticPublished: true }) };
    if (id === "./facts") return { getReportSource: async () => null, sourceHash: () => "" };
    if (id === "./openai") return { reportConfigured: () => false, reportModel: () => "", writeOpenAiReport: async () => ({}) };
    if (id === "./store") return { claimGeneration: async () => ({}), failGeneration: async () => {}, finishGeneration: async () => {}, readStoredReport: async () => ({ draft: null }) };
    throw new Error("Unexpected dependency " + id);
  }, module, module.exports);

  return module.exports;
}

test("automatic report window opens at 18:00 London for the previous match date", () => {
  const auto = loadAuto();

  const before = auto.automaticReportWindow(new Date("2026-09-18T16:59:00.000Z"));
  assert.equal(before.due, false);
  assert.equal(before.matchDate, "2026-09-17");

  const atSix = auto.automaticReportWindow(new Date("2026-09-18T17:00:00.000Z"));
  assert.equal(atSix.due, true);
  assert.equal(atSix.matchDate, "2026-09-17");

  const winter = auto.automaticReportWindow(new Date("2026-12-02T18:00:00.000Z"));
  assert.equal(winter.due, true);
  assert.equal(winter.matchDate, "2026-12-01");
});

test("automatic publication uses current facts and refuses incomplete matchnights", () => {
  const auto = fs.readFileSync(
    path.join(root, "src/lib/matchweek-reports/auto-publish.ts"),
    "utf8",
  );
  const manage = fs.readFileSync(
    path.join(root, "src/lib/league-news/manage.ts"),
    "utf8",
  );
  const cron = fs.readFileSync(
    path.join(root, "src/app/api/cron/notifications/route.ts"),
    "utf8",
  );

  assert.match(auto, /source\.pendingFixtures > 0 \|\| source\.omittedFixtures > 0/);
  assert.match(auto, /stored\.draft\.sourceHash === hash/);
  assert.match(auto, /writeOpenAiReport\(source, input\.model\)/);
  assert.match(auto, /publishNewsAutomatically/);
  assert.match(auto, /publicationStatus === "UNPUBLISHED"/);
  assert.match(manage, /existing\?\.status === 'UNPUBLISHED'/);
  assert.match(manage, /buildNewsSnapshot/);
  assert.match(cron, /automatic-matchnight-reports/);
  assert.match(cron, /runAutomaticMatchnightReports/);
});
