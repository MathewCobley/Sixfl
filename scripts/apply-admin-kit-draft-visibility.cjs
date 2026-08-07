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

replaceOnce(
  '  const openOrders = orders.filter((order) =>\n    ["SUBMITTED", "APPROVED", "ORDERED"].includes(order.status),\n  ).length;',
  '  const draftOrders = orders.filter((order) => order.status === "DRAFT");\n  const openOrders = orders.filter((order) =>\n    ["SUBMITTED", "APPROVED", "ORDERED"].includes(order.status),\n  ).length;',
  "draft order collection",
);

replaceOnce(
  '      </div>\n\n      <KitDesignUploader />',
  `      </div>\n\n      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-5 sm:p-6">\n        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">\n          <div>\n            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/65">\n              Coming soon\n            </div>\n            <h2 className="mt-2 text-xl font-semibold text-white">\n              Started, not submitted\n            </h2>\n            <p className="mt-2 text-sm text-white/55">\n              These teams have saved a kit order draft but have not submitted it yet, so you can see what may be arriving for review soon.\n            </p>\n          </div>\n          <div className="text-3xl font-semibold text-amber-100">{draftOrders.length}</div>\n        </div>\n\n        {draftOrders.length === 0 ? (\n          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-sm text-white/45">\n            No teams currently have a saved draft kit order.\n          </div>\n        ) : (\n          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">\n            {draftOrders.map((order) => (\n              <div key={order.id} className="rounded-2xl border border-amber-400/15 bg-black/20 p-4">\n                <div className="flex items-start justify-between gap-3">\n                  <div className="min-w-0">\n                    <div className="truncate font-semibold text-white">{order.teamName}</div>\n                    <div className="mt-1 truncate text-xs text-white/45">{leagueLabel(order)}</div>\n                  </div>\n                  <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">\n                    Draft\n                  </span>\n                </div>\n                <div className="mt-3 text-sm text-white/65">\n                  Kit: <span className="font-semibold text-white">{order.design?.code ?? "Not chosen"}</span>\n                </div>\n                <div className="mt-1 text-xs text-white/40">\n                  {order.items.length} of {order.kitQuantity} kit rows saved · Last changed {formatDate(order.updatedAt)}\n                </div>\n                <Link\n                  href={\`/captain/team/\${order.teamId}/kit\`}\n                  className="mt-4 inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08]"\n                >\n                  View draft\n                </Link>\n              </div>\n            ))}\n          </div>\n        )}\n      </section>\n\n      <KitDesignUploader />`,
  "draft visibility panel",
);

fs.writeFileSync(file, source, "utf8");
console.log("Admin kit draft visibility is applied.");
