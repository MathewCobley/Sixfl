"use client";

import { useEffect } from "react";

export default function AdminRefereeControlsLabelBridge() {
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/admin/referee-nights"]').forEach((link) => {
        const spans = Array.from(link.querySelectorAll<HTMLElement>("span"));
        const name = spans.find((span) => span.textContent?.trim() === "Ref nights");
        if (name) name.textContent = "Referee Controls";

        const description = spans.find((span) => span.textContent?.trim() === "Night fees");
        if (description) description.textContent = "Nights / fees";
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
