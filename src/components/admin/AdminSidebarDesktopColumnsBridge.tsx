// ========================================
// File: src/components/admin/AdminSidebarDesktopColumnsBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const inactiveNavClass =
  "group flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 transition border-white/8 bg-black/18 text-white/65 hover:border-white/18 hover:bg-white/[0.045] hover:text-white";
const activeNavClass =
  "group flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 transition border-emerald-400/30 bg-emerald-400/12 text-white shadow-[0_0_18px_rgba(16,185,129,0.12)]";

function findQueueItemCard(idElement: HTMLElement) {
  let current = idElement.parentElement;

  while (current) {
    const text = current.textContent ?? "";
    const hasDispatchStatus =
      text.includes("QUEUED") ||
      text.includes("SENT") ||
      text.includes("FAILED") ||
      text.includes("CANCELLED") ||
      text.includes("SKIPPED") ||
      text.includes("PROCESSING");

    if (
      hasDispatchStatus &&
      current.className.includes("rounded-2xl") &&
      current.className.includes("border")
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function injectKitsNavigation(pathname: string) {
  const nav = document.querySelector<HTMLElement>("aside.sticky nav, aside.fixed nav");
  if (!nav) return false;

  let kitsLink = nav.querySelector<HTMLAnchorElement>("a[data-admin-kits-nav='true']");

  if (!kitsLink) {
    const teamsLink = nav.querySelector<HTMLAnchorElement>('a[href="/admin/teams"]');
    if (!teamsLink) return false;

    kitsLink = teamsLink.cloneNode(true) as HTMLAnchorElement;
    kitsLink.dataset.adminKitsNav = "true";
    kitsLink.href = "/admin/kits";

    const spans = Array.from(kitsLink.querySelectorAll("span"));
    const name = spans.find((span) => span.textContent?.trim() === "Teams");
    const description = spans.find((span) => span.textContent?.trim() === "Squads");
    if (name) name.textContent = "Kits";
    if (description) description.textContent = "Orders";

    const icon = kitsLink.querySelector("svg");
    if (icon) {
      icon.outerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" class="h-3 w-3">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5 4.5 6.75l2.25 4.5 2.25-1.125V19.5h6v-9.375l2.25 1.125 2.25-4.5-3.75-2.25A5.25 5.25 0 0 1 12 6a5.25 5.25 0 0 1-3.75-1.5Z" />
        </svg>
      `;
    }

    teamsLink.insertAdjacentElement("afterend", kitsLink);
  }

  kitsLink.className = pathname.startsWith("/admin/kits")
    ? activeNavClass
    : inactiveNavClass;

  return true;
}

function injectQueueDetailsLinks() {
  const idElements = Array.from(document.querySelectorAll<HTMLElement>("div")).filter(
    (element) => /^ID:\s*c[a-z0-9]+$/i.test(element.textContent?.trim() ?? ""),
  );

  for (const idElement of idElements) {
    const dispatchId = idElement.textContent?.trim().replace(/^ID:\s*/i, "") ?? "";
    if (!dispatchId) continue;

    const card = findQueueItemCard(idElement);
    if (!card || card.dataset.queueDetailsLinkInjected === "true") continue;

    card.dataset.queueDetailsLinkInjected = "true";

    const wrapper = document.createElement("div");
    wrapper.className = "mt-4 flex flex-wrap justify-end gap-2";

    const link = document.createElement("a");
    link.href = `/admin/queue/${encodeURIComponent(dispatchId)}`;
    link.className =
      "inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20";
    link.textContent = "View details";

    wrapper.appendChild(link);
    card.appendChild(wrapper);
  }
}

export default function AdminSidebarDesktopColumnsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("aside.sticky nav, aside.fixed nav");

    if (nav) {
      nav.classList.add("xl:grid-cols-2");
    }
  }, []);

  useEffect(() => {
    if (injectKitsNavigation(pathname)) return;

    const observer = new MutationObserver(() => {
      if (injectKitsNavigation(pathname)) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/admin/queue")) return;

    injectQueueDetailsLinks();

    const observer = new MutationObserver(() => {
      injectQueueDetailsLinks();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
