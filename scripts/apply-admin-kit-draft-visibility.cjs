const fs = require("node:fs");

const file = "src/app/(admin)/admin/kits/page.tsx";
let source = fs.readFileSync(file, "utf8");

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  const index = source.indexOf(from);
  if (index === -1) {
    throw new Error(`[admin-kit-draft-visibility] Missing anchor: ${label}`);
  }
  source = source.slice(0, index) + to + source.slice(index + from.length);
}

if (!source.includes("listTeamsWithKitPaymentActivity")) {
  replaceOnce(
    'import { requireAdmin } from "@/lib/requireAdmin";',
    'import { listTeamsWithKitPaymentActivity } from "@/lib/kits/extra-kit-quantity";\nimport { requireAdmin } from "@/lib/requireAdmin";',
    "kit payment activity import",
  );
}

if (!source.includes("const kitPaymentActivity = await listTeamsWithKitPaymentActivity()")) {
  replaceOnce(
    '  const [allDesigns, orders] = await Promise.all([\n    listKitDesigns({ includeInactive: true }),\n    listAdminTeamKitOrders(),\n  ]);',
    '  const [allDesigns, orders] = await Promise.all([\n    listKitDesigns({ includeInactive: true }),\n    listAdminTeamKitOrders(),\n  ]);\n  const kitPaymentActivity = await listTeamsWithKitPaymentActivity();',
    "kit payment activity query",
  );
}

const comingSoonLogic = `  const draftOrders = orders.filter((order) => order.status === "DRAFT");
  const teamsAlreadySubmitted = new Set(
    orders
      .filter((order) => ["SUBMITTED", "APPROVED", "ORDERED", "FULFILLED"].includes(order.status))
      .map((order) => order.teamId),
  );
  const draftByTeamId = new Map(draftOrders.map((order) => [order.teamId, order]));
  const paymentByTeamId = new Map(kitPaymentActivity.map((payment) => [payment.teamId, payment]));
  const comingSoonKitTeams = [
    ...draftOrders.map((order) => ({
      teamId: order.teamId,
      teamName: order.teamName,
      leagueName: order.leagueName,
      leagueSeason: order.leagueSeason,
      order,
      payment: paymentByTeamId.get(order.teamId) ?? null,
      activityAt: order.updatedAt,
    })),
    ...kitPaymentActivity
      .filter(
        (payment) =>
          !draftByTeamId.has(payment.teamId) &&
          !teamsAlreadySubmitted.has(payment.teamId),
      )
      .map((payment) => ({
        teamId: payment.teamId,
        teamName: payment.teamName,
        leagueName: payment.leagueName,
        leagueSeason: payment.leagueSeason,
        order: null,
        payment,
        activityAt: payment.latestPaymentActivityAt,
      })),
  ].sort((left, right) => right.activityAt.getTime() - left.activityAt.getTime());
  const openOrders = orders.filter((order) =>
    ["SUBMITTED", "APPROVED", "ORDERED"].includes(order.status),
  ).length;`;

if (!source.includes("const comingSoonKitTeams = [")) {
  const oldDraftLogic = `  const draftOrders = orders.filter((order) => order.status === "DRAFT");
  const openOrders = orders.filter((order) =>
    ["SUBMITTED", "APPROVED", "ORDERED"].includes(order.status),
  ).length;`;
  const cleanLogic = `  const openOrders = orders.filter((order) =>
    ["SUBMITTED", "APPROVED", "ORDERED"].includes(order.status),
  ).length;`;

  if (source.includes(oldDraftLogic)) {
    source = source.replace(oldDraftLogic, comingSoonLogic);
  } else {
    replaceOnce(cleanLogic, comingSoonLogic, "coming soon team collection");
  }
}

// Remove the older draft-only panel if this script is run again against an already
// patched development checkout. A clean production build will not normally need this.
if (source.includes("These teams have saved a kit order draft but have not submitted it yet")) {
  const panelStart = source.indexOf(
    '      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-5 sm:p-6">',
  );
  const uploaderStart = source.indexOf("      <KitDesignUploader />", panelStart);
  if (panelStart >= 0 && uploaderStart > panelStart) {
    source = source.slice(0, panelStart) + source.slice(uploaderStart);
  }
}

if (!source.includes("Kit payments count as started even before a draft is saved")) {
  replaceOnce(
    '      <KitDesignUploader />',
    `      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/65">
              Coming soon
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Started, not submitted
            </h2>
            <p className="mt-2 text-sm text-white/55">
              Teams appear here as soon as they save a draft or start kit payments. Kit payments count as started even before a draft is saved.
            </p>
          </div>
          <div className="text-3xl font-semibold text-amber-100">{comingSoonKitTeams.length}</div>
        </div>

        {comingSoonKitTeams.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-sm text-white/45">
            No teams have a draft or active kit payment activity yet.
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {comingSoonKitTeams.map((item) => {
              const paid = item.payment?.paidExtraKitQuantity ?? 0;
              const pending = item.payment?.pendingExtraKitQuantity ?? 0;
              const league = item.leagueName
                ? item.leagueSeason
                  ? \`${'${item.leagueName}'} · ${'${item.leagueSeason}'}\`
                  : item.leagueName
                : "No league assigned";

              return (
                <div key={item.teamId} className="rounded-2xl border border-amber-400/15 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{item.teamName}</div>
                      <div className="mt-1 truncate text-xs text-white/45">{league}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {item.order ? (
                        <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                          Draft saved
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100">
                          Payment started
                        </span>
                      )}
                    </div>
                  </div>

                  {item.order ? (
                    <div className="mt-3 text-sm text-white/65">
                      Kit: <span className="font-semibold text-white">{item.order.design?.code ?? "Not chosen"}</span>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {paid > 0 ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                        {paid} kit{paid === 1 ? "" : "s"} paid
                      </span>
                    ) : null}
                    {pending > 0 ? (
                      <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                        {pending} awaiting payment
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 text-xs text-white/40">
                    {item.order
                      ? \`${'${item.order.items.length}'} of ${'${item.order.kitQuantity}'} kit rows saved · Last changed ${'${formatDate(item.activityAt)}'}\`
                      : \`Payment activity · Last changed ${'${formatDate(item.activityAt)}'}\`}
                  </div>
                  <Link
                    href={\`/captain/team/${'${item.teamId}'}/kit\`}
                    className="mt-4 inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08]"
                  >
                    Open kit page
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <KitDesignUploader />`,
    "payment-aware coming soon panel",
  );
}

fs.writeFileSync(file, source, "utf8");
console.log("Admin kit draft and payment visibility is applied.");
