// ========================================
// File: src/components/admin/player-pool/AdminPlayerPoolNavBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AdminPlayerPoolNavBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin")) return;

    function ensureLinks() {
      const leadLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href="/admin/leads"]'),
      );

      for (const leadLink of leadLinks) {
        const parent = leadLink.parentElement;
        if (!parent) continue;
        if (parent.querySelector('a[data-sixfl-admin-player-pool="true"]')) continue;

        const link = document.createElement("a");
        link.href = "/admin/player-pool";
        link.textContent = "PlayerPool";
        link.dataset.sixflAdminPlayerPool = "true";
        link.className = leadLink.className;
        leadLink.insertAdjacentElement("afterend", link);
      }
    }

    ensureLinks();
    const observer = new MutationObserver(ensureLinks);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document
        .querySelectorAll('a[data-sixfl-admin-player-pool="true"]')
        .forEach((item) => item.remove());
    };
  }, [pathname]);

  return null;
}
