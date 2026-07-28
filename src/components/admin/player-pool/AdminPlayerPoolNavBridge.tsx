// ========================================
// File: src/components/admin/player-pool/AdminPlayerPoolNavBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const INACTIVE_LINK_CLASSES =
  "group flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 transition border-white/8 bg-black/18 text-white/65 hover:border-white/18 hover:bg-white/[0.045] hover:text-white";

const ACTIVE_LINK_CLASSES =
  "group flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 transition border-emerald-400/30 bg-emerald-400/12 text-white shadow-[0_0_18px_rgba(16,185,129,0.12)]";

const INACTIVE_ICON_CLASSES =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition border-white/10 bg-black/25 text-white/45 group-hover:text-white/75";

const ACTIVE_ICON_CLASSES =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition border-emerald-400/25 bg-emerald-400/10 text-emerald-200";

const PLAYER_POOL_HREF = "/admin/player-pool";

export default function AdminPlayerPoolNavBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname?.startsWith("/admin")) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    function openPlayerPool(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      router.push(PLAYER_POOL_HREF);
    }

    function ensureLinks() {
      const leadLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href="/admin/leads"]'),
      );

      if (leadLinks.length === 0) return false;

      for (const leadLink of leadLinks) {
        const parent = leadLink.parentElement;
        if (!parent) continue;

        let link = parent.querySelector<HTMLAnchorElement>(
          'a[data-sixfl-admin-player-pool="true"]',
        );
        const isActive =
          pathname === PLAYER_POOL_HREF ||
          pathname.startsWith(`${PLAYER_POOL_HREF}/`);

        if (!link) {
          link = leadLink.cloneNode(true) as HTMLAnchorElement;
          link.href = PLAYER_POOL_HREF;
          link.dataset.sixflAdminPlayerPool = "true";
          leadLink.insertAdjacentElement("afterend", link);
        }

        link.className = isActive ? ACTIVE_LINK_CLASSES : INACTIVE_LINK_CLASSES;
        link.onclick = openPlayerPool;

        const icon = link.firstElementChild;
        if (icon instanceof HTMLElement) {
          icon.className = isActive ? ACTIVE_ICON_CLASSES : INACTIVE_ICON_CLASSES;
        }

        const textWrapper = link.children.item(1);
        const titleRow = textWrapper?.children.item(0);
        const title = titleRow?.children.item(0);
        const description = textWrapper?.children.item(1);

        if (title) title.textContent = "PlayerPool";
        if (description) description.textContent = "Available players";
      }

      return true;
    }

    function run() {
      if (cancelled) return;

      attempts += 1;
      const ready = ensureLinks();

      if (!ready && attempts < 8) {
        retryTimer = setTimeout(run, 75);
      }
    }

    const frame = window.requestAnimationFrame(run);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (retryTimer) clearTimeout(retryTimer);

      document
        .querySelectorAll('a[data-sixfl-admin-player-pool="true"]')
        .forEach((item) => item.remove());
    };
  }, [pathname, router]);

  return null;
}
