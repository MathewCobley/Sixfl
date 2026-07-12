"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function removeUnusedSettingsLink() {
  document
    .querySelectorAll<HTMLAnchorElement>('a[href="/admin/settings"]')
    .forEach((link) => link.remove());
}

export default function RemoveUnusedSettingsNavBridge() {
  const pathname = usePathname();

  useEffect(() => {
    removeUnusedSettingsLink();

    const observer = new MutationObserver(removeUnusedSettingsLink);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
