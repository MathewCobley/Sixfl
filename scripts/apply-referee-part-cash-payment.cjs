const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(root, "src", "app", "(admin)", "admin", "referee-nights", "[id]", "page.tsx");
const actionsPath = path.join(root, "src", "app", "(admin)", "admin", "referee-nights", "actions.ts");

for (const target of [pagePath, actionsPath]) {
  if (!fs.existsSync(target)) throw new Error(`Referee cash-payment target not found: ${target}`);
}

function replaceRequired(source, anchor, replacement, description) {
  if (source.includes(replacement)) return source;
  if (!source.includes(anchor)) throw new Error(`Could not find ${description}.`);
  return source.replace(anchor, replacement);
}

let page = fs.readFileSync(pagePath, "utf8");

page = replaceRequired(
  page,
  "  getRefereeNightById,\n  getRefereeNightFixtures,",
  "  getRefereeNightById,\n  getRefereeNightFixtures,\n  getRefereeRemainingDueToRefereePence,\n  getRefereeRemainingDueToSixflPence,",
  "referee balance helper imports",
);

page = replaceRequired(
  page,
  "  updateRefereeNightAction,\n  updateRefereeNightFixturesAction,",
  "  updateRefereeNightAction,\n  updateRefereeNightCashDistributionAction,\n  updateRefereeNightFixturesAction,",
  "cash distribution action import",
);

page = replaceRequired(
  page,
  "  const assignedElsewhereCount = assignableFixtures.filter(\n    (fixture) => fixture.assignedRefereeNightId && fixture.assignedRefereeNightId !== night.id,\n  ).length;",
  "  const assignedElsewhereCount = assignableFixtures.filter(\n    (fixture) => fixture.assignedRefereeNightId && fixture.assignedRefereeNightId !== night.id,\n  ).length;\n  const remainingDueToRefereePence = getRefereeRemainingDueToRefereePence(night);\n  const remainingDueToSixflPence = getRefereeRemainingDueToSixflPence(night);\n  const canSettle = remainingDueToRefereePence === 0 && remainingDueToSixflPence === 0;",
  "remaining referee balance calculation",
);

const oldSettlementRows = `              <div className="flex justify-between gap-4"><span className="text-white/55">Collected from teams</span><span className="font-semibold text-white">{formatMoney(night.cashCollectedPence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Referee night fee</span><span className="font-semibold text-white">{formatMoney(night.feePence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Ref keeps from cash</span><span className="font-semibold text-white">{formatMoney(night.retainedByRefereePence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Ref owes SIXFL</span><span className="font-semibold text-emerald-200">{formatMoney(night.dueToSixflPence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">SIXFL owes ref</span><span className="font-semibold text-amber-200">{formatMoney(night.dueToRefereePence)}</span></div>`;

const newSettlementRows = `              <div className="flex justify-between gap-4"><span className="text-white/55">Collected from teams</span><span className="font-semibold text-white">{formatMoney(night.cashCollectedPence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Referee night fee</span><span className="font-semibold text-white">{formatMoney(night.feePence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Ref keeps from cash</span><span className="font-semibold text-white">{formatMoney(night.retainedByRefereePence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">SIXFL owes ref before payments</span><span className="font-semibold text-amber-200">{formatMoney(night.dueToRefereePence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Cash paid to referee</span><span className="font-semibold text-white">{formatMoney(night.cashPaidToRefereePence)}</span></div>
              <div className="flex justify-between gap-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2"><span className="font-semibold text-amber-100">Still owed to referee</span><span className="font-bold text-amber-100">{formatMoney(remainingDueToRefereePence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Ref owes SIXFL before payments</span><span className="font-semibold text-emerald-200">{formatMoney(night.dueToSixflPence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Cash received from referee</span><span className="font-semibold text-white">{formatMoney(night.cashReceivedFromRefereePence)}</span></div>
              <div className="flex justify-between gap-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2"><span className="font-semibold text-emerald-100">Still owed to SIXFL</span><span className="font-bold text-emerald-100">{formatMoney(remainingDueToSixflPence)}</span></div>

              {getSearchParam(sp.cash) === "distributed" ? (
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                  Cash movement saved.
                </div>
              ) : null}

              <form action={updateRefereeNightCashDistributionAction} className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <input type="hidden" name="refereeNightId" value={night.id} />
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Cash paid to referee (£)</label>
                  <input
                    name="cashPaidToRefereePounds"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={(night.cashPaidToRefereePence / 100).toFixed(2)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                  />
                  <p className="mt-1 text-xs text-white/45">Enter the total cash you have paid this referee for this night so far.</p>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Cash received from referee (£)</label>
                  <input
                    name="cashReceivedFromRefereePounds"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={(night.cashReceivedFromRefereePence / 100).toFixed(2)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Cash note</label>
                  <textarea
                    name="cashDistributionNotes"
                    rows={2}
                    defaultValue={night.cashDistributionNotes ?? ""}
                    placeholder="e.g. Paid £35 cash after the matches"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
                  />
                </div>
                <button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300">
                  Save cash payment
                </button>
              </form>`;

page = replaceRequired(page, oldSettlementRows, newSettlementRows, "settlement cash summary");

page = replaceRequired(
  page,
  `                <form action={settleRefereeNightAction}>
                  <input type="hidden" name="refereeNightId" value={night.id} />
                  <button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15">
                    Mark settled
                  </button>
                </form>`,
  `                <form action={settleRefereeNightAction}>
                  <input type="hidden" name="refereeNightId" value={night.id} />
                  <button
                    type="submit"
                    disabled={!canSettle}
                    title={canSettle ? "Mark this referee night settled" : "Clear the remaining cash balance first"}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {canSettle ? "Mark settled" : "Balance outstanding"}
                  </button>
                </form>`,
  "settlement button guard",
);

page = replaceRequired(
  page,
  `              <div className="flex flex-wrap gap-2 pt-4">`,
  `              {!canSettle ? (
                <p className="pt-2 text-xs leading-5 text-amber-200">Record the remaining cash movement before marking this night settled.</p>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-4">`,
  "outstanding balance help text",
);

fs.writeFileSync(pagePath, page, "utf8");

let actions = fs.readFileSync(actionsPath, "utf8");
actions = replaceRequired(
  actions,
  "  findFixturesForNight,\n  parseMoneyToPence,",
  "  findFixturesForNight,\n  getRefereeNightById,\n  getRefereeRemainingDueToRefereePence,\n  getRefereeRemainingDueToSixflPence,\n  parseMoneyToPence,",
  "referee settlement guard imports",
);

actions = replaceRequired(
  actions,
  `  const refereeNightId = readRequired(input.formData, "refereeNightId", "Referee night");

  const approvedAtSql = input.status === "APPROVED" ? Prisma.sql\`, "approvedAt" = NOW(), "approvedByUserId" = \${user?.id ?? null}\` : Prisma.empty;`,
  `  const refereeNightId = readRequired(input.formData, "refereeNightId", "Referee night");

  if (input.status === "SETTLED") {
    const night = await getRefereeNightById(refereeNightId);
    if (!night) throw new Error("Referee night not found.");

    const remainingDueToRefereePence = getRefereeRemainingDueToRefereePence(night);
    const remainingDueToSixflPence = getRefereeRemainingDueToSixflPence(night);
    if (remainingDueToRefereePence > 0 || remainingDueToSixflPence > 0) {
      throw new Error("This referee night still has an outstanding cash balance and cannot be marked settled yet.");
    }
  }

  const approvedAtSql = input.status === "APPROVED" ? Prisma.sql\`, "approvedAt" = NOW(), "approvedByUserId" = \${user?.id ?? null}\` : Prisma.empty;`,
  "server-side settlement balance guard",
);

fs.writeFileSync(actionsPath, actions, "utf8");

for (const [file, markers] of [
  [pagePath, ["Save cash payment", "Still owed to referee", "Balance outstanding", "updateRefereeNightCashDistributionAction"]],
  [actionsPath, ["outstanding cash balance", "getRefereeRemainingDueToRefereePence"]],
]) {
  const source = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Referee part-cash marker missing from ${file}: ${marker}`);
  }
}

console.log("Referee part-cash payments are editable and settlement is blocked until balances are cleared.");
