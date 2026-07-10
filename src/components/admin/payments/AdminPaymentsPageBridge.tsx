// ========================================
// File: src/components/admin/payments/AdminPaymentsPageBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const RETURN_TO_KEY = "sixfl-admin-payments-return-to";
const PAYMENT_STATUS_PARAM = "paymentStatus";

function normaliseText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
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

function injectPaymentStatusSelector() {
  const form = document.querySelector<HTMLFormElement>('form[action="/admin/payments"]');
  if (!form || !form.querySelector('select[name="view"]')) return;
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
  select.setAttribute("data-default-value", current);
  select.className = "h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none focus:border-sky-300/50";

  [
    ["", "Any status"],
    ["due", "Due / unpaid"],
    ["overdue", "Overdue / chase"],
    ["paid", "Paid"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    if (value === current) option.selected = true;
    select.appendChild(option);
  });

  label.appendChild(caption);
  label.appendChild(select);

  if (applyButton?.parentElement === form) {
    form.insertBefore(label, applyButton);
  } else {
    form.appendChild(label);
  }
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

function applyPaymentStatusFilter() {
  const status = new URLSearchParams(window.location.search).get(PAYMENT_STATUS_PARAM) ?? "";
  if (!status) return;

  const playerFeesSection = findSectionByHeading("Player match fees");
  const teamChargesSection = findSectionByHeading("Team charges");
  const recentPaymentsSection = findSectionByHeading("Recent payments");

  const playerRows = getListRows(playerFeesSection);
  const teamRows = getListRows(teamChargesSection);
  const recentPaymentRows = getListRows(recentPaymentsSection);

  let visiblePlayerRows = 0;
  let visibleTeamRows = 0;
  let visibleRecentRows = 0;

  playerRows.forEach((row) => {
    const text = normaliseText(row.textContent);
    const isPaid = text.includes("paid") && !text.includes("unpaid");
    const isOverdue = text.includes("overdue") || text.includes("chase");
    const isDue = text.includes("open") || text.includes("due") || text.includes("unpaid") || text.includes("outstanding");

    const show =
      status === "paid"
        ? isPaid
        : status === "overdue"
          ? isOverdue
          : status === "due"
            ? isDue && !isPaid
            : true;

    row.style.display = show ? "" : "none";
    if (show) visiblePlayerRows += 1;
  });

  teamRows.forEach((row) => {
    const text = normaliseText(row.textContent);
    const isPaid = text.includes("paid") && !text.includes("part paid") && !text.includes("unpaid");
    const isOverdue = text.includes("overdue") || text.includes("late") || text.includes("chase");
    const isDue = text.includes("open") || text.includes("due") || text.includes("outstanding") || text.includes("part paid");

    const show =
      status === "paid"
        ? isPaid
        : status === "overdue"
          ? isOverdue
          : status === "due"
            ? isDue && !isPaid
            : true;

    row.style.display = show ? "" : "none";
    if (show) visibleTeamRows += 1;
  });

  recentPaymentRows.forEach((row) => {
    const text = normaliseText(row.textContent);
    const show = status === "paid" ? true : status === "";
    row.style.display = show ? "" : "none";
    if (show) visibleRecentRows += 1;
  });

  hideSection(playerFeesSection, status === "paid" || visiblePlayerRows === 0);
  hideSection(teamChargesSection, status === "paid" || visibleTeamRows === 0);
  hideSection(recentPaymentsSection, status !== "paid" || visibleRecentRows === 0);
}

function restoreReturnToAfterChase(pathname: string | null, search: string, replace: (href: string) => void) {
  if (!isAdminPaymentsPath(pathname)) return;

  const params = new URLSearchParams(search);
  if (!params.get("created") && !params.get("error")) return;
  if (hasPaymentViewState(params)) return;

  const returnTo = sessionStorage.getItem(RETURN_TO_KEY);
  if (!returnTo) return;
  sessionStorage.removeItem(RETURN_TO_KEY);

  if (!returnTo.startsWith("/admin/payments")) return;
  replace(mergeNoticeIntoReturnTo(returnTo, search));
}

export default function AdminPaymentsPageBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();

  useEffect(() => {
    if (!isAdminPaymentsPath(pathname)) return;

    const listener = (event: Event) => storeReturnToBeforeChase(event as SubmitEvent);
    document.addEventListener("submit", listener, true);
    return () => document.removeEventListener("submit", listener, true);
  }, [pathname]);

  useEffect(() => {
    restoreReturnToAfterChase(pathname, search, router.replace);
  }, [pathname, router.replace, search]);

  useEffect(() => {
    if (!isAdminPaymentsPath(pathname)) return;

    injectPaymentStatusSelector();
    updateLinksToPreservePaymentStatus();
    applyPaymentStatusFilter();
  }, [pathname, search]);

  return null;
}
