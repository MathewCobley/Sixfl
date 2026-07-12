"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function removeDuplicateLatestKickoffField() {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label")).filter(
    (label) => label.textContent?.trim() === "Latest kickoff time",
  );

  if (labels.length < 2) return;

  // Keep the first working control and remove any duplicate blocks that follow it.
  labels.slice(1).forEach((label) => {
    label.closest("div.space-y-2")?.remove();
  });
}

export default function RemoveDuplicateLatestKickoffBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.match(/^\/admin\/teams\/[^/]+\/?$/)) return;

    removeDuplicateLatestKickoffField();
    const timer = window.setTimeout(removeDuplicateLatestKickoffField, 400);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
