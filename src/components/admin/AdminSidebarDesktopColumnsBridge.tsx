// ========================================
// File: src/components/admin/AdminSidebarDesktopColumnsBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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
