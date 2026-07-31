// ========================================
// File: src/app/(admin)/admin/kits/page.tsx
// ========================================

import Link from "next/link";

import KitDesignUploader from "@/components/admin/kits/KitDesignUploader";
import {
  TEAM_KIT_QUANTITY,
  getTeamKitSizeLabel,
  getTeamKitSockSizeLabel,
  getTeamKitStatusLabel,
  type TeamKitOrderStatus,
  type TeamKitSize,
  type TeamKitSockSize,
} from "@/lib/kits/constants";
import {
  listAdminTeamKitOrders,
  listKitDesigns,
  type AdminTeamKitOrder,
} from "@/lib/kits/db";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  updateKitDesignAction,
  updateKitOrderNotesAction,
  updateKitOrderStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Kits | SIXFL Admin",
};

type SearchParams = {
  notice?: string | string[];
  error?: string | string[];
  code?: string | string[];
  team?: string | string[];
  q?: string | string[];
  page?: string | string[];
};

const DESIGN_PAGE_SIZE = 36;

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] ?? "" : input ?? "";
}

function formatDate(value: Date | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function noticeMessage(sp: SearchParams) {
  const code = value(sp.code) || "Kit";
  const team = value(sp.team) || "Team";

  switch (value(sp.notice)) {
    case "design_saved":
      return `${code} was updated.`;
    case "order_status_saved":
      return `${team}'s kit order status was updated.`;
    case "order_notes_saved":
      return `${team}'s admin notes were saved.`;
    default:
      return null;
  }
}

function errorMessage(sp: SearchParams) {
  switch (value(sp.error)) {
    case "duplicate_code":
      return "That kit code is already being used by another design.";
    case "invalid_design":
      return "The kit design details were incomplete or invalid.";
    case "invalid_order":
      return "The kit order could not be found.";
    case "save_failed":
      return "The change could not be saved. Please try again.";
    default:
      return null;
  }
}

function statusClasses(status: TeamKitOrderStatus) {
  switch (status) {
    case "DRAFT":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "SUBMITTED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "APPROVED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "ORDERED":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "FULFILLED":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "CANCELLED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
  }
}

function countValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const item of values) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Array.from(counts.entries());
}

function leagueLabel(order: AdminTeamKitOrder) {
  if (!order.leagueName) return "No league assigned";
  return order.leagueSeason
    ? `${order.leagueName} · ${order.leagueSeason}`
    : order.leagueName;
}

function paginationHref(input: { q: string; page: number }) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return `/admin/kits${query ? `?${query}` : ""}`;
}

function StatusButton({
  order,
  status,
  label,
}: {
  order: AdminTeamKitOrder;
  status: TeamKitOrderStatus;
  label: string;
}) {
  return (
    <form action={updateKitOrderStatusAction}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="teamName" value={order.teamName} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/70 transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100"
      >
        {label}
      </button>
    </form>
  );
}

export default async function AdminKitsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const q = value(sp.q).trim().toLowerCase();
  const requestedPage = Number(value(sp.page) || 1);

  const [allDesigns, orders] = await Promise.all([
    listKitDesigns({ includeInactive: true }),
    listAdminTeamKitOrders(),
  ]);

  const filteredDesigns = q
    ? allDesigns.filter((design) =>
        [
          design.code,
          design.name,
          design.primaryColour,
          design.secondaryColour,
          design.style,
        ]
          .filter(Boolean)
          .some((item) => item?.toLowerCase().includes(q)),
      )
    : allDesigns;
  const pageCount = Math.max(1, Math.ceil(filteredDesigns.length / DESIGN_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, requestedPage || 1), pageCount);
  const designs = filteredDesigns.slice(
    (currentPage - 1) * DESIGN_PAGE_SIZE,
    currentPage * DESIGN_PAGE_SIZE,
  );

  const openOrders = orders.filter((order) =>
    ["SUBMITTED", "APPROVED", "ORDERED"].includes(order.status),
  ).length;
  const submittedOrders = orders.filter((order) => order.status === "SUBMITTED").length;
  const completedOrders = orders.filter((order) => order.status === "FULFILLED").length;
  const notice = noticeMessage(sp);
  const error = errorMessage(sp);

  return (
    <div className="mx-auto max-w-[1500px] space-y-8 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              Team kit management
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Kit catalogue and orders
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
              Upload the supplier designs, manage which kits captains can choose and process each team&apos;s personalised order of {TEAM_KIT_QUANTITY} kits.
            </p>
          </div>

          <Link
            href="/api/admin/kits/orders.csv"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
          >
            Download orders CSV
          </Link>
        </div>
      </section>

      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Active designs
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {allDesigns.filter((design) => design.isActive).length}
          </div>
        </div>
        <div className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.05] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/45">
            Awaiting review
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">{submittedOrders}</div>
        </div>
        <div className="rounded-3xl border border-violet-400/15 bg-violet-500/[0.05] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100/45">
            In progress
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">{openOrders}</div>
        </div>
        <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.05] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/45">
            Completed
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">{completedOrders}</div>
        </div>
      </div>

      <KitDesignUploader />

      <section className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Kit catalogue</h2>
            <p className="mt-2 text-sm text-white/50">
              {filteredDesigns.length} design{filteredDesigns.length === 1 ? "" : "s"}. Inactive designs are hidden from new captain orders.
            </p>
          </div>

          <form method="get" action="/admin/kits" className="flex w-full gap-2 lg:max-w-md">
            <input
              name="q"
              defaultValue={value(sp.q)}
              placeholder="Search code, colour or style"
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40"
            />
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75"
            >
              Search
            </button>
          </form>
        </div>

        {designs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-sm text-white/50">
            No designs match this search. Upload images above or clear the search.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {designs.map((design) => (
              <form
                key={design.id}
                action={updateKitDesignAction}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"
              >
                <input type="hidden" name="id" value={design.id} />
                <div className="aspect-square bg-white p-2">
                  <img
                    src={`/api/kits/${design.id}/image?size=thumb&v=${design.updatedAt.getTime()}`}
                    alt={design.name ?? `Kit ${design.code}`}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>

                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-white">{design.code}</div>
                    <span
                      className={[
                        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        design.isActive
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/[0.04] text-white/45",
                      ].join(" ")}
                    >
                      {design.isActive ? "Live" : "Hidden"}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs text-white/45">Code</span>
                      <input
                        name="code"
                        defaultValue={design.code}
                        required
                        maxLength={40}
                        className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm uppercase text-white outline-none focus:border-emerald-400/40"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs text-white/45">Order</span>
                      <input
                        name="sortOrder"
                        type="number"
                        defaultValue={design.sortOrder}
                        className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                      />
                    </label>
                  </div>

                  <label className="space-y-1.5">
                    <span className="text-xs text-white/45">Display name</span>
                    <input
                      name="name"
                      defaultValue={design.name ?? ""}
                      placeholder="e.g. Navy gradient"
                      className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs text-white/45">Primary colour</span>
                      <input
                        name="primaryColour"
                        defaultValue={design.primaryColour ?? ""}
                        placeholder="Blue or #0057B8"
                        className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs text-white/45">Secondary colour</span>
                      <input
                        name="secondaryColour"
                        defaultValue={design.secondaryColour ?? ""}
                        placeholder="White"
                        className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                      />
                    </label>
                  </div>

                  <label className="space-y-1.5">
                    <span className="text-xs text-white/45">Style</span>
                    <input
                      name="style"
                      defaultValue={design.style ?? ""}
                      placeholder="Plain, striped, gradient…"
                      className="h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-400/40"
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/70">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={design.isActive}
                      className="h-4 w-4 rounded border-white/20 bg-black text-emerald-400"
                    />
                    Available to captains
                  </label>

                  <button
                    type="submit"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300"
                  >
                    Save design
                  </button>
                </div>
              </form>
            ))}
          </div>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
            <Link
              href={paginationHref({ q: value(sp.q), page: Math.max(1, currentPage - 1) })}
              aria-disabled={currentPage <= 1}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/65 aria-disabled:pointer-events-none aria-disabled:opacity-35"
            >
              Previous
            </Link>
            <span className="text-sm text-white/45">
              Page {currentPage} of {pageCount}
            </span>
            <Link
              href={paginationHref({ q: value(sp.q), page: Math.min(pageCount, currentPage + 1) })}
              aria-disabled={currentPage >= pageCount}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/65 aria-disabled:pointer-events-none aria-disabled:opacity-35"
            >
              Next
            </Link>
          </div>
        ) : null}
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Team orders</h2>
          <p className="mt-2 text-sm text-white/50">
            Drafts appear as soon as a captain saves. Submitted orders are shown first for review.
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-sm text-white/50">
            No team has started a kit order yet.
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => {
              const kitSizes = countValues(order.items.map((item) => item.kitSize));
              const sockSizes = countValues(order.items.map((item) => item.sockSize));

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"
                >
                  <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="space-y-5 p-5 sm:p-6">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          {order.design ? (
                            <img
                              src={`/api/kits/${order.design.id}/image?size=thumb&v=${order.design.updatedAt.getTime()}`}
                              alt={order.design.name ?? order.design.code}
                              className="h-24 w-24 shrink-0 rounded-2xl border border-white/10 bg-white object-contain p-1"
                            />
                          ) : (
                            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-white/10 text-xs text-white/30">
                              No kit
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-2xl font-semibold tracking-tight text-white">
                                {order.teamName}
                              </h3>
                              <span
                                className={[
                                  "rounded-full border px-3 py-1 text-xs font-semibold",
                                  statusClasses(order.status),
                                ].join(" ")}
                              >
                                {getTeamKitStatusLabel(order.status)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-white/45">{leagueLabel(order)}</p>
                            <p className="mt-2 text-sm text-white/60">
                              Design: <span className="font-semibold text-white">{order.design?.code ?? "Not chosen"}</span>
                              {order.design?.name ? ` · ${order.design.name}` : ""}
                            </p>
                            <p className="mt-1 text-xs text-white/35">
                              Submitted: {formatDate(order.submittedAt)} · Last changed: {formatDate(order.updatedAt)}
                            </p>
                          </div>
                        </div>

                        <Link
                          href={`/captain/team/${order.teamId}/kit`}
                          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08]"
                        >
                          Open captain view
                        </Link>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {kitSizes.map(([size, count]) => (
                          <span
                            key={`kit-${size}`}
                            className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/65"
                          >
                            {getTeamKitSizeLabel(size as TeamKitSize)} × {count}
                          </span>
                        ))}
                        {sockSizes.map(([size, count]) => (
                          <span
                            key={`sock-${size}`}
                            className="rounded-full border border-sky-400/15 bg-sky-500/[0.06] px-3 py-1 text-xs text-sky-100/75"
                          >
                            {getTeamKitSockSizeLabel(size as TeamKitSockSize)} × {count}
                          </span>
                        ))}
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-white/10">
                        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                          <thead className="bg-black/25 text-white/40">
                            <tr>
                              <th className="px-3 py-3 font-semibold">#</th>
                              <th className="px-3 py-3 font-semibold">Back name</th>
                              <th className="px-3 py-3 font-semibold">Number</th>
                              <th className="px-3 py-3 font-semibold">Kit</th>
                              <th className="px-3 py-3 font-semibold">Socks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10">
                            {order.items.map((item) => (
                              <tr key={item.id} className="text-white/65">
                                <td className="px-3 py-3 text-white/35">{item.position}</td>
                                <td className="px-3 py-3 font-semibold text-white">
                                  {item.backName || "Number only"}
                                </td>
                                <td className="px-3 py-3">{item.shirtNumber}</td>
                                <td className="px-3 py-3">{getTeamKitSizeLabel(item.kitSize)}</td>
                                <td className="px-3 py-3">{getTeamKitSockSizeLabel(item.sockSize)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {order.captainNotes ? (
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/60">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                            Captain notes
                          </div>
                          {order.captainNotes}
                        </div>
                      ) : null}
                    </div>

                    <aside className="border-t border-white/10 bg-black/20 p-5 sm:p-6 xl:border-l xl:border-t-0">
                      <div>
                        <div className="text-sm font-semibold text-white">Order workflow</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusButton order={order} status="DRAFT" label="Reopen draft" />
                          <StatusButton order={order} status="SUBMITTED" label="Mark submitted" />
                          <StatusButton order={order} status="APPROVED" label="Approve" />
                          <StatusButton order={order} status="ORDERED" label="Mark ordered" />
                          <StatusButton order={order} status="FULFILLED" label="Complete" />
                          <StatusButton order={order} status="CANCELLED" label="Cancel" />
                        </div>
                      </div>

                      <form action={updateKitOrderNotesAction} className="mt-6 space-y-3">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="teamName" value={order.teamName} />
                        <label className="block text-sm font-semibold text-white">Admin notes</label>
                        <textarea
                          name="adminNotes"
                          rows={7}
                          defaultValue={order.adminNotes ?? ""}
                          placeholder="Supplier reference, changes, delivery notes…"
                          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40"
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300"
                        >
                          Save admin notes
                        </button>
                      </form>
                    </aside>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
