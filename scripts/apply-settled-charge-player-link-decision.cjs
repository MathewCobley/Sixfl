const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/payments/page.tsx",
);
let source = fs.readFileSync(filePath, "utf8");

const actionMarker = `export default async function CaptainPaymentsPage({`;
const action = `async function closeSettledChargePlayerLinksAction(formData: FormData) {
  "use server";

  const teamId = String(formData.get("teamId") ?? "").trim();
  const chargeId = String(formData.get("chargeId") ?? "").trim();

  if (!teamId || !chargeId) {
    redirect(teamId ? \`/captain/team/\${teamId}/payments?links=invalid\` : "/captain");
  }

  await requireCaptain(teamId);
  const ledger = await getTeamPaymentLedger(teamId);
  const entry = ledger?.entries.find((item) => item.chargeId === chargeId) ?? null;

  if (
    !ledger ||
    !entry ||
    !entry.fixtureId ||
    entry.displayStatus !== "PAID" ||
    entry.playerOpenPence <= 0
  ) {
    redirect(\`/captain/team/\${teamId}/payments?links=invalid\`);
  }

  await prisma.playerMatchFee.updateMany({
    where: {
      teamId: { in: ledger.relatedTeamIds },
      fixtureId: entry.fixtureId,
      status: "OPEN",
    },
    data: {
      status: "CANCELLED",
      note: "Cancelled by captain because the team fixture charge was already fully covered.",
    },
  });

  revalidatePath(\`/captain/team/\${teamId}/payments\`);
  revalidatePath(\`/captain/team/\${teamId}/match-fees\`);
  redirect(\`/captain/team/\${teamId}/payments?links=closed\`);
}

`;

if (!source.includes("closeSettledChargePlayerLinksAction")) {
  if (!source.includes(actionMarker)) throw new Error("Captain payments action marker missing");
  source = source.replace(actionMarker, action + actionMarker);
}

source = source.replace(
  `searchParams?: Promise<{ subscription?: string; credit?: string; amount?: string }>;`,
  `searchParams?: Promise<{ subscription?: string; credit?: string; amount?: string; links?: string }>;`,
);

const noticeMarker = `      {creditMessage ? (`;
const notice = `      {sp.links === "closed" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          Remaining unpaid player links were closed. No further player payment can be taken for that fixture.
        </div>
      ) : sp.links === "invalid" ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          Those player links could not be changed. Refresh the page and check that the charge is fully paid.
        </div>
      ) : null}

`;
if (!source.includes("Remaining unpaid player links were closed")) {
  if (!source.includes(noticeMarker)) throw new Error("Captain payments notice marker missing");
  source = source.replace(noticeMarker, notice + noticeMarker);
}

const uiMarker = `                      <div className="flex flex-col gap-2 lg:items-end">`;
const ui = `                      {entry.displayStatus === "PAID" && entry.playerOpenPence > 0 ? (
                        <div className="max-w-xl rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-left">
                          <div className="font-semibold text-amber-100">This charge is already fully covered</div>
                          <p className="mt-2 text-sm leading-6 text-amber-50/80">
                            There are still {formatMoney(entry.playerOpenPence)} of unpaid player links open. Keeping them open could collect more than this fixture charge and any extra would become team credit.
                          </p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <form action={closeSettledChargePlayerLinksAction}>
                              <input type="hidden" name="teamId" value={team.id} />
                              <input type="hidden" name="chargeId" value={entry.chargeId} />
                              <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-200">
                                Close unpaid player links
                              </button>
                            </form>
                            <div className="inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/60">
                              Leave them open to collect team credit
                            </div>
                          </div>
                        </div>
                      ) : null}

`;
if (!source.includes("This charge is already fully covered")) {
  const index = source.indexOf(uiMarker);
  if (index < 0) throw new Error("Captain payments action UI marker missing");
  source = source.slice(0, index) + ui + source.slice(index);
}

fs.writeFileSync(filePath, source);
console.log("Applied settled-charge player-link decision workflow.");
