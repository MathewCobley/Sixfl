// ========================================
// File: src/components/admin/payments/AdminPaymentsPageBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const RETURN_TO_KEY = "sixfl-admin-payments-return-to";
const PAYMENT_STATUS_PARAM = "paymentStatus";
const SIXFL_SELECT_ATTR = "data-sixfl-payments-select";
const SIXFL_SELECT_WRAP_ATTR = "data-sixfl-payments-select-wrap";
const SIXFL_OPTION_ATTR = "data-sixfl-payments-select-option";

type RecentPaymentDetail = {
  id: string;
  typeLabel: string;
  title: string;
  line1: string;
  line2: string;
  referenceLine: string | null;
  notesLine: string | null;
  methodLabel: string;
  amountLabel: string;
  paidAtLabel: string;
};

function normaliseText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAdminPaymentsPath(pathname: string | null) {
  return pathname === "/admin/payments";
}

function hasPaymentViewState(params: URLSearchParams) {
  return ["q", "leagueId", "teamId", "view", "limit", "action", "paymentChargeId", PAYMENT_STATUS_PARAM].some((key) =>
    Boolean(params.get(key)),
  );
}

function mergeNoticeIntoReturnTo(returnTo: string, currentSearch: string) {
  const current = new URLSearchParams(currentSearch);
  const created = current.get("created");
  const error = current.get("error");

  const target = new URL(returnTo, window.location.origin);
  target.searchParams.delete("created");
  target.searchParams.delete("error");

  if (created) target.searchParams.set("created", created);
  if (error) target.searchParams.set("error", error);

  return `${target.pathname}${target.search}${target.hash}`;
}

function storeReturnToBeforeChase(event: SubmitEvent) {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form) return;

  const buttonText = normaliseText(
    Array.from(form.querySelectorAll("button")).map((button) => button.textContent).join(" "),
  );

  if (!buttonText.includes("chase player") && !buttonText.includes("team chase sms")) return;

  sessionStorage.setItem(RETURN_TO_KEY, `${window.location.pathname}${window.location.search}`);
}

function getPaymentsFilterForm() {
  const form = document.querySelector<HTMLFormElement>('form[action="/admin/payments"]');
  if (!form || !form.querySelector('select[name="view"]')) return null;
  return form;
}

function relabelPaymentViewOptions() {
  const form = getPaymentsFilterForm();
  const select = form?.querySelector<HTMLSelectElement>('select[name="view"]');
  if (!select) return;

  const labels: Record<string, string> = {
    playerFees: "Open player fees due",
    recentPayments: "Payments made",
    all: "Everything",
    teamCharges: "Team charges due",
  };

  Array.from(select.options).forEach((option) => {
    const label = labels[option.value];
    if (label) option.textContent = label;
  });
}

function inferViewForPaymentStatus(paymentStatus: string | null | undefined) {
  if (paymentStatus === "paid") return "recentPayments";
  if (paymentStatus === "due" || paymentStatus === "overdue") return "teamCharges";
  return null;
}

function shouldRouteStatusOnlySearch(params: URLSearchParams) {
  const currentView = params.get("view") ?? "";
  const inferredView = inferViewForPaymentStatus(params.get(PAYMENT_STATUS_PARAM));

  return Boolean(inferredView && (!currentView || currentView === "none"));
}

function routeStatusOnlySearch(router: ReturnType<typeof useRouter>) {
  const params = new URLSearchParams(window.location.search);
  if (!shouldRouteStatusOnlySearch(params)) return false;

  const inferredView = inferViewForPaymentStatus(params.get(PAYMENT_STATUS_PARAM));
  if (!inferredView) return false;

  params.set("view", inferredView);
  router.replace(`${window.location.pathname}?${params.toString()}`);
  return true;
}

function shouldRoutePlayerFeesToPaymentsMade(params: URLSearchParams) {
  const hasTeamFilter = Boolean(params.get("teamId"));
  const view = params.get("view");
  const paymentStatus = params.get(PAYMENT_STATUS_PARAM) ?? "";

  return hasTeamFilter && view === "playerFees" && (paymentStatus === "" || paymentStatus === "paid");
}

function routeExistingAmbiguousPlayerFeeSearch(router: ReturnType<typeof useRouter>) {
  const params = new URLSearchParams(window.location.search);
  if (!shouldRoutePlayerFeesToPaymentsMade(params)) return false;

  params.set("view", "recentPayments");
  params.set(PAYMENT_STATUS_PARAM, "paid");
  router.replace(`${window.location.pathname}?${params.toString()}`);
  return true;
}

function routeAmbiguousPlayerFeeSubmit(event: SubmitEvent) {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form || form.getAttribute("action") !== "/admin/payments") return;

  const teamSelect = form.querySelector<HTMLSelectElement>('select[name="teamId"]');
  const viewSelect = form.querySelector<HTMLSelectElement>('select[name="view"]');
  const statusSelect = form.querySelector<HTMLSelectElement>(`select[name="${PAYMENT_STATUS_PARAM}"]`);

  const hasTeamFilter = Boolean(teamSelect?.value);
  const wantsPlayerFees = viewSelect?.value === "playerFees";
  const status = statusSelect?.value ?? "";

  const inferredView = inferViewForPaymentStatus(status);
  if (viewSelect && inferredView && (!viewSelect.value || viewSelect.value === "none")) {
    viewSelect.value = inferredView;
  }

  if (hasTeamFilter && wantsPlayerFees && (status === "" || status === "paid")) {
    viewSelect.value = "recentPayments";
    if (statusSelect) statusSelect.value = "paid";
  }
}

function injectPaymentStatusSelector() {
  const form = getPaymentsFilterForm();
  if (!form) return;
  if (form.querySelector(`select[name="${PAYMENT_STATUS_PARAM}"]`)) return;

  const current = new URLSearchParams(window.location.search).get(PAYMENT_STATUS_PARAM) ?? "";
  const applyButton = Array.from(form.querySelectorAll("button")).find((button) =>
    normaliseText(button.textContent).includes("apply"),
  );

  const label = document.createElement("label");
  label.className = "space-y-1.5 text-sm font-semibold text-white";

  const caption = document.createElement("span");
  caption.textContent = "Payment status";

  const select = document.createElement("select");
  select.name = PAYMENT_STATUS_PARAM;
  select.value = current;
  select.setAttribute("data-initial-value", current);
  select.className = "h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none focus:border-sky-300/50";

  [
    ["", "Any status"],
    ["due", "Due / unpaid"],
    ["overdue", "Overdue / chase"],
    ["paid", "Paid / payments made"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    if (value === current) option.selected = true;
    select.appendChild(option);
  });

  select.value = current;

  label.appendChild(caption);
  label.appendChild(select);

  if (applyButton?.parentElement === form) {
    form.insertBefore(label, applyButton);
  } else {
    form.appendChild(label);
  }
}

function closeSixflPaymentSelects(except?: HTMLElement | null) {
  document.querySelectorAll<HTMLElement>(`[${SIXFL_SELECT_WRAP_ATTR}]`).forEach((wrapper) => {
    if (except && wrapper === except) return;
    wrapper.dataset.open = "false";
    const panel = wrapper.querySelector<HTMLElement>("[data-sixfl-payments-select-panel]");
    if (panel) panel.hidden = true;
  });
}

function getSelectedOption(select: HTMLSelectElement) {
  return Array.from(select.options).find((option) => option.value === select.value) ?? select.options[0] ?? null;
}

function refreshSixflPaymentSelect(select: HTMLSelectElement) {
  const wrapper = select.nextElementSibling instanceof HTMLElement && select.nextElementSibling.hasAttribute(SIXFL_SELECT_WRAP_ATTR)
    ? select.nextElementSibling
    : null;
  if (!wrapper) return;

  const selected = getSelectedOption(select);
  const label = wrapper.querySelector<HTMLElement>("[data-sixfl-payments-select-label]");
  if (label) {
    label.textContent = selected?.textContent?.trim() || "Select option";
    label.className = ["block truncate", select.value ? "text-white" : "text-white/45"].join(" ");
  }

  wrapper.querySelectorAll<HTMLElement>(`[${SIXFL_OPTION_ATTR}]`).forEach((optionButton) => {
    const active = optionButton.dataset.value === select.value;
    optionButton.className = [
      "relative w-full cursor-pointer select-none rounded-lg px-3 py-2.5 pr-10 text-left text-sm transition",
      active ? "font-medium text-emerald-300" : "text-white/85 hover:bg-white/8 hover:text-white",
    ].join(" ");

    const check = optionButton.querySelector<HTMLElement>("[data-sixfl-payments-select-check]");
    if (check) check.hidden = !active;
  });
}

function enhanceSixflPaymentSelect(select: HTMLSelectElement) {
  if (select.hasAttribute(SIXFL_SELECT_ATTR)) {
    refreshSixflPaymentSelect(select);
    return;
  }

  select.setAttribute(SIXFL_SELECT_ATTR, "true");
  select.classList.add("sr-only");
  select.tabIndex = -1;

  const wrapper = document.createElement("div");
  wrapper.setAttribute(SIXFL_SELECT_WRAP_ATTR, "true");
  wrapper.dataset.open = "false";
  wrapper.className = "relative";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "relative flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-[#0d1428] px-4 text-left text-sm text-white outline-none transition hover:border-white/20 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20";

  const label = document.createElement("span");
  label.setAttribute("data-sixfl-payments-select-label", "true");
  label.className = "block truncate text-white/45";

  const icon = document.createElement("span");
  icon.className = "ml-3 shrink-0 text-white/50";
  icon.textContent = "⌄";

  button.appendChild(label);
  button.appendChild(icon);

  const panel = document.createElement("div");
  panel.setAttribute("data-sixfl-payments-select-panel", "true");
  panel.hidden = true;
  panel.className = "absolute top-full z-[999] mt-2 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl ring-1 ring-black/40 focus:outline-none";

  Array.from(select.options).forEach((option) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.setAttribute(SIXFL_OPTION_ATTR, "true");
    optionButton.dataset.value = option.value;
    optionButton.className = "relative w-full cursor-pointer select-none rounded-lg px-3 py-2.5 pr-10 text-left text-sm text-white/85 transition hover:bg-white/8 hover:text-white";

    const optionText = document.createElement("span");
    optionText.className = "block truncate";
    optionText.textContent = option.textContent ?? option.value;

    const check = document.createElement("span");
    check.setAttribute("data-sixfl-payments-select-check", "true");
    check.className = "absolute inset-y-0 right-3 flex items-center text-emerald-400";
    check.textContent = "✓";
    check.hidden = option.value !== select.value;

    optionButton.appendChild(optionText);
    optionButton.appendChild(check);

    optionButton.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      refreshSixflPaymentSelect(select);
      closeSixflPaymentSelects();
    });

    panel.appendChild(optionButton);
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    const willOpen = wrapper.dataset.open !== "true";
    closeSixflPaymentSelects(wrapper);
    wrapper.dataset.open = willOpen ? "true" : "false";
    panel.hidden = !willOpen;
  });

  select.addEventListener("change", () => refreshSixflPaymentSelect(select));

  wrapper.appendChild(button);
  wrapper.appendChild(panel);
  select.insertAdjacentElement("afterend", wrapper);
  refreshSixflPaymentSelect(select);
}

function enhancePaymentFilterDropdowns() {
  const form = getPaymentsFilterForm();
  if (!form) return;

  relabelPaymentViewOptions();

  ["leagueId", "teamId", "view", "limit", PAYMENT_STATUS_PARAM].forEach((name) => {
    const select = form.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
    if (select) enhanceSixflPaymentSelect(select);
  });
}

function updateLinksToPreservePaymentStatus() {
  const status = new URLSearchParams(window.location.search).get(PAYMENT_STATUS_PARAM);
  if (!status) return;

  document.querySelectorAll<HTMLAnchorElement>('a[href^="/admin/payments"]').forEach((anchor) => {
    const url = new URL(anchor.href, window.location.origin);
    if (url.pathname !== "/admin/payments") return;
    if (url.searchParams.has(PAYMENT_STATUS_PARAM)) return;
    if (normaliseText(anchor.textContent).includes("reset page") || normaliseText(anchor.textContent).includes("clear filters")) return;
    url.searchParams.set(PAYMENT_STATUS_PARAM, status);
    anchor.href = `${url.pathname}${url.search}${url.hash}`;
  });
}

function findSectionByHeading(headingText: string) {
  const needle = normaliseText(headingText);
  return Array.from(document.querySelectorAll("section")).find((section) =>
    Array.from(section.querySelectorAll("h2")).some((heading) => normaliseText(heading.textContent).includes(needle)),
  ) as HTMLElement | undefined;
}

function getListRows(section: HTMLElement | undefined) {
  if (!section) return [];

  const containers = Array.from(section.querySelectorAll(".space-y-3, .space-y-4")) as HTMLElement[];
  const container = containers.at(-1) ?? section;

  return Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function hideSection(section: HTMLElement | undefined, shouldHide: boolean) {
  if (!section) return;
  section.style.display = shouldHide ? "none" : "";
}

function renderRecentPaymentDetail(detail: RecentPaymentDetail) {
  const reference = detail.referenceLine
    ? `<div class="mt-1 text-xs text-white/45">${escapeHtml(detail.referenceLine)}</div>`
    : "";
  const notes = detail.notesLine
    ? `<div class="mt-1 text-xs leading-5 text-white/40">${escapeHtml(detail.notesLine)}</div>`
    : "";

  return `
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full border border-sky-300/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-100">${escapeHtml(detail.typeLabel)}</span>
          <div class="font-semibold text-white">${escapeHtml(detail.title)}</div>
        </div>
        <div class="mt-2 text-sm text-white/70">${escapeHtml(detail.line1)}</div>
        <div class="mt-1 text-sm text-white/50">${escapeHtml(detail.line2)}</div>
        ${reference}
        ${notes}
      </div>
      <div class="shrink-0 text-sm text-white/60 sm:text-right">
        <div class="font-semibold text-white">${escapeHtml(detail.amountLabel)}</div>
        <div>${escapeHtml(detail.paidAtLabel)}</div>
        <div class="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">${escapeHtml(detail.methodLabel)}</div>
      </div>
    </div>
  `;
}

async function enhanceRecentPaymentRows(isCancelled: () => boolean) {
  const recentPaymentsSection = findSectionByHeading("Recent payments");
  const rows = getListRows(recentPaymentsSection).filter((row) => !normaliseText(row.textContent).includes("no recent payments match"));
  if (!recentPaymentsSection || rows.length === 0) return;

  const response = await fetch(`/api/admin/payments/recent-details${window.location.search}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok || isCancelled()) return;

  const payload = (await response.json().catch(() => null)) as { details?: RecentPaymentDetail[] } | null;
  const details = payload?.details ?? [];
  if (details.length === 0 || isCancelled()) return;

  rows.forEach((row, index) => {
    const detail = details[index];
    if (!detail) return;
    row.dataset.sixflPaymentExplained = "true";
    row.className = "rounded-2xl border border-white/10 bg-[#0d1428] p-4";
    row.innerHTML = renderRecentPaymentDetail(detail);
  });
}

function applyPaymentStatusFilter() {
  const status = new URLSearchParams(window.location.search).get(PAYMENT_STATUS_PARAM) ?? "";
  if (!status) return;

  const playerFeesSection = findSectionByHeading("Player match fees");
  const teamChargesSection = findSectionByHeading("Team charges");
  const recentPaymentsSection = findSectionByHeading("Recent payments");

  hideSection(recentPaymentsSection, status === "due" || status === "overdue");
  hideSection(playerFeesSection, status === "paid");

  for (const row of getListRows(playerFeesSection)) {
    const text = normaliseText(row.textContent);
    const wasChased = text.includes("last request/chase:") && !text.includes("not sent yet");

    if (status === "overdue") {
      row.style.display = wasChased ? "" : "none";
    } else if (status === "due") {
      row.style.display = "";
    } else {
      row.style.display = status === "paid" ? "none" : "";
    }
  }

  for (const row of getListRows(teamChargesSection)) {
    const text = normaliseText(row.textContent);
    const isPaid = text.includes("paid") && !text.includes("awaiting payment") && !text.includes("outstanding £");
    const isOverdue = text.includes("needs admin chase");
    const isDue = text.includes("awaiting payment") && !isOverdue;

    if (status === "paid") {
      row.style.display = isPaid ? "" : "none";
    } else if (status === "overdue") {
      row.style.display = isOverdue ? "" : "none";
    } else if (status === "due") {
      row.style.display = isDue ? "" : "none";
    } else {
      row.style.display = "";
    }
  }
}

export default function AdminPaymentsPageBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (!isAdminPaymentsPath(pathname)) return;

    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const hasNotice = Boolean(params.get("created") || params.get("error"));
    const storedReturnTo = sessionStorage.getItem(RETURN_TO_KEY);

    if (hasNotice && storedReturnTo && !hasPaymentViewState(params)) {
      sessionStorage.removeItem(RETURN_TO_KEY);
      router.replace(mergeNoticeIntoReturnTo(storedReturnTo, window.location.search));
      return;
    }

    if (routeStatusOnlySearch(router)) {
      return;
    }

    if (routeExistingAmbiguousPlayerFeeSearch(router)) {
      return;
    }

    const onSubmit = (event: SubmitEvent) => {
      storeReturnToBeforeChase(event);
      routeAmbiguousPlayerFeeSubmit(event);
    };
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(`[${SIXFL_SELECT_WRAP_ATTR}]`)) closeSixflPaymentSelects();
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onDocumentClick);
    relabelPaymentViewOptions();
    injectPaymentStatusSelector();
    enhancePaymentFilterDropdowns();
    applyPaymentStatusFilter();
    updateLinksToPreservePaymentStatus();
    void enhanceRecentPaymentRows(() => cancelled);

    return () => {
      cancelled = true;
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onDocumentClick);
    };
  }, [pathname, router, searchParams]);

  return null;
}
