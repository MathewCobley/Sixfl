const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const dashboardPath = path.join(root, "src", "app", "(public)", "referee", "page.tsx");
const nightPath = path.join(root, "src", "app", "(public)", "referee", "night", "[id]", "page.tsx");

for (const target of [dashboardPath, nightPath]) {
  if (!fs.existsSync(target)) throw new Error(`Referee payment display target not found: ${target}`);
}

function replaceRequired(source, anchor, replacement, description) {
  if (source.includes(replacement)) return source;
  if (!source.includes(anchor)) throw new Error(`Could not find ${description}.`);
  return source.replace(anchor, replacement);
}

let dashboard = fs.readFileSync(dashboardPath, "utf8");

dashboard = replaceRequired(
  dashboard,
  "  getRefereeNightSummaries,\n  type RefereeNightStatus,",
  "  getRefereeNightSummaries,\n  getRefereeRemainingDueToRefereePence,\n  getRefereeRemainingDueToSixflPence,\n  type RefereeNightStatus,",
  "referee dashboard balance helper imports",
);

dashboard = replaceRequired(
  dashboard,
  `function getPayableDueToRefereePence(
  night: RefereeNightSummary,
  todayLondonDate: string,
) {
  return isNightPayable(night, todayLondonDate) ? night.dueToRefereePence : 0;
}`,
  `function getPayableDueToRefereePence(
  night: RefereeNightSummary,
  todayLondonDate: string,
) {
  if (!isNightPayable(night, todayLondonDate) || night.status === "SETTLED") return 0;
  return getRefereeRemainingDueToRefereePence(night);
}`,
  "referee dashboard payable-to-referee calculation",
);

dashboard = replaceRequired(
  dashboard,
  `function getPayableDueToSixflPence(
  night: RefereeNightSummary,
  todayLondonDate: string,
) {
  return isNightPayable(night, todayLondonDate) ? night.dueToSixflPence : 0;
}`,
  `function getPayableDueToSixflPence(
  night: RefereeNightSummary,
  todayLondonDate: string,
) {
  if (!isNightPayable(night, todayLondonDate) || night.status === "SETTLED") return 0;
  return getRefereeRemainingDueToSixflPence(night);
}`,
  "referee dashboard payable-to-SIXFL calculation",
);

dashboard = replaceRequired(
  dashboard,
  `function getLedgerBalanceLabel(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return "Not due yet";

  if (night.dueToRefereePence > 0) {
    return night.status === "SETTLED" ? "Paid to you" : "Owed to you";
  }

  if (night.dueToSixflPence > 0) {
    return night.status === "SETTLED" ? "Settled to SIXFL" : "You owe SIXFL";
  }

  return "Balanced";
}`,
  `function getLedgerBalanceLabel(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return "Not due yet";

  if (night.dueToRefereePence > 0) {
    if (night.status === "SETTLED" || getRefereeRemainingDueToRefereePence(night) === 0) return "Paid to you";
    return "Owed to you";
  }

  if (night.dueToSixflPence > 0) {
    if (night.status === "SETTLED" || getRefereeRemainingDueToSixflPence(night) === 0) return "Settled to SIXFL";
    return "You owe SIXFL";
  }

  return "Balanced";
}`,
  "referee ledger balance label",
);

dashboard = replaceRequired(
  dashboard,
  `function getLedgerBalanceAmount(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return 0;
  if (night.dueToRefereePence > 0) return night.dueToRefereePence;
  if (night.dueToSixflPence > 0) return night.dueToSixflPence;
  return 0;
}`,
  `function getLedgerBalanceAmount(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return 0;
  if (night.status === "SETTLED") {
    if (night.dueToRefereePence > 0) return night.dueToRefereePence;
    if (night.dueToSixflPence > 0) return night.dueToSixflPence;
    return 0;
  }
  if (night.dueToRefereePence > 0) return getRefereeRemainingDueToRefereePence(night);
  if (night.dueToSixflPence > 0) return getRefereeRemainingDueToSixflPence(night);
  return 0;
}`,
  "referee ledger balance amount",
);

dashboard = replaceRequired(
  dashboard,
  `function getLedgerSettlementLabel(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return "Due after the night";

  if (night.status === "SETTLED") {
    return night.settledAt ? \`Settled \${formatLedgerDate(night.settledAt)}\` : "Settled";
  }

  if (night.status === "CANCELLED") return "Cancelled";

  if (night.dueToRefereePence > 0) return "Not paid yet";
  if (night.dueToSixflPence > 0) return "Not settled yet";
  return "No balance due";
}`,
  `function getLedgerSettlementLabel(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return "Due after the night";

  if (night.status === "SETTLED") {
    return night.settledAt ? \`Settled \${formatLedgerDate(night.settledAt)}\` : "Settled";
  }

  if (night.status === "CANCELLED") return "Cancelled";

  if (night.dueToRefereePence > 0) {
    const remaining = getRefereeRemainingDueToRefereePence(night);
    if (remaining === 0) return "Paid in full · awaiting settlement";
    if (night.cashPaidToRefereePence > 0) {
      return \`Part paid · \${formatMoney(night.cashPaidToRefereePence)} paid · \${formatMoney(remaining)} remaining\`;
    }
    return "Not paid yet";
  }

  if (night.dueToSixflPence > 0) {
    const remaining = getRefereeRemainingDueToSixflPence(night);
    if (remaining === 0) return "Paid in full · awaiting settlement";
    if (night.cashReceivedFromRefereePence > 0) {
      return \`Part settled · \${formatMoney(night.cashReceivedFromRefereePence)} paid · \${formatMoney(remaining)} remaining\`;
    }
    return "Not settled yet";
  }
  return "No balance due";
}`,
  "referee ledger settlement label",
);

dashboard = replaceRequired(
  dashboard,
  `  const outstandingDueToSixfl = payableActiveNights.reduce(
    (sum, night) => sum + night.dueToSixflPence,
    0,
  );
  const outstandingDueToReferee = payableActiveNights.reduce(
    (sum, night) => sum + night.dueToRefereePence,
    0,
  );`,
  `  const outstandingDueToSixfl = payableActiveNights.reduce(
    (sum, night) => sum + getPayableDueToSixflPence(night, todayLondonDate),
    0,
  );
  const outstandingDueToReferee = payableActiveNights.reduce(
    (sum, night) => sum + getPayableDueToRefereePence(night, todayLondonDate),
    0,
  );`,
  "referee dashboard outstanding totals",
);

fs.writeFileSync(dashboardPath, dashboard, "utf8");

let nightPage = fs.readFileSync(nightPath, "utf8");

nightPage = replaceRequired(
  nightPage,
  "  getRefereeNightById,\n  getRefereeNightFixtures,",
  "  getRefereeNightById,\n  getRefereeNightFixtures,\n  getRefereeRemainingDueToRefereePence,\n  getRefereeRemainingDueToSixflPence,",
  "referee night balance helper imports",
);

nightPage = replaceRequired(
  nightPage,
  `  const locked = isNightLocked(night.status);
  const lockedMessage = getLockedMessage(night.status);`,
  `  const locked = isNightLocked(night.status);
  const lockedMessage = getLockedMessage(night.status);
  const remainingDueToRefereePence = night.status === "SETTLED" ? 0 : getRefereeRemainingDueToRefereePence(night);
  const remainingDueToSixflPence = night.status === "SETTLED" ? 0 : getRefereeRemainingDueToSixflPence(night);`,
  "referee night remaining balances",
);

nightPage = replaceRequired(
  nightPage,
  `<div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">Owe SIXFL</div><div className="mt-1 text-base font-semibold text-emerald-200 sm:text-lg">{formatMoney(night.dueToSixflPence)}</div></div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:col-span-1 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">SIXFL owes you</div><div className="mt-1 text-base font-semibold text-amber-200 sm:text-lg">{formatMoney(night.dueToRefereePence)}</div></div>`,
  `<div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">Owe SIXFL</div><div className="mt-1 text-base font-semibold text-emerald-200 sm:text-lg">{formatMoney(remainingDueToSixflPence)}</div></div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:col-span-1 sm:px-4"><div className="text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">SIXFL owes you</div><div className="mt-1 text-base font-semibold text-amber-200 sm:text-lg">{formatMoney(remainingDueToRefereePence)}</div></div>`,
  "referee night outstanding balance cards",
);

nightPage = replaceRequired(
  nightPage,
  `          </div>
        </section>

        {fixtures.length === 0 ? (`,
  `          </div>

          {night.cashPaidToRefereePence > 0 || night.cashReceivedFromRefereePence > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-50/80">
              {night.cashPaidToRefereePence > 0 ? (
                <div><span className="font-semibold text-white">Payment recorded:</span> SIXFL has paid you {formatMoney(night.cashPaidToRefereePence)}. {formatMoney(remainingDueToRefereePence)} remains outstanding.</div>
              ) : null}
              {night.cashReceivedFromRefereePence > 0 ? (
                <div><span className="font-semibold text-white">Cash returned:</span> SIXFL has recorded {formatMoney(night.cashReceivedFromRefereePence)} received from you. {formatMoney(remainingDueToSixflPence)} remains outstanding.</div>
              ) : null}
            </div>
          ) : null}
        </section>

        {fixtures.length === 0 ? (`,
  "referee night payment movement summary",
);

fs.writeFileSync(nightPath, nightPage, "utf8");

for (const [file, markers] of [
  [dashboardPath, ["getRefereeRemainingDueToRefereePence", "Part paid ·", "getPayableDueToRefereePence(night, todayLondonDate)"]],
  [nightPath, ["Payment recorded:", "remainingDueToRefereePence", "SIXFL has paid you"]],
]) {
  const source = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Referee payment display marker missing from ${file}: ${marker}`);
  }
}

console.log("Referee dashboard now shows partial cash payments and remaining balances.");
