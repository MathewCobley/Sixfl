// ========================================
// File: src/components/admin/messages/QueuedSmsReasonHints.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function classNameOf(element: Element) {
  return element.getAttribute("class") ?? "";
}

function isMessageEmailFrame(element: HTMLElement) {
  const className = classNameOf(element);

  return (
    className.includes("rounded-2xl") &&
    className.includes("overflow-hidden") &&
    className.includes("bg-white") &&
    Boolean(element.firstElementChild) &&
    Boolean(element.textContent?.includes("SIXFL"))
  );
}

function widenMessageEmailFrame(frame: HTMLElement) {
  if (frame.dataset.messageEmailPreviewFixed === "1") return;

  frame.dataset.messageEmailPreviewFixed = "1";
  frame.style.width = "100%";
  frame.style.maxWidth = "100%";
  frame.style.overflowX = "auto";
  frame.style.background = "#f3f4f6";
  frame.style.padding = "16px";

  const preview = frame.firstElementChild as HTMLElement | null;
  if (preview) {
    preview.style.minWidth = "620px";
    preview.style.maxWidth = "720px";
    preview.style.margin = "0 auto";
  }

  let parent = frame.parentElement;
  let depth = 0;

  while (parent && depth < 5) {
    if (classNameOf(parent).includes("max-w-[85%]")) {
      parent.style.width = "100%";
      parent.style.maxWidth = "100%";
      parent.style.boxSizing = "border-box";
      return;
    }

    parent = parent.parentElement;
    depth += 1;
  }
}

function fixEmailPreviews() {
  Array.from(document.querySelectorAll<HTMLElement>("div"))
    .filter(isMessageEmailFrame)
    .forEach(widenMessageEmailFrame);
}

export default function QueuedSmsReasonHints() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/admin/")) return;

    const frame = window.requestAnimationFrame(fixEmailPreviews);
    const observer = new MutationObserver(fixEmailPreviews);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
