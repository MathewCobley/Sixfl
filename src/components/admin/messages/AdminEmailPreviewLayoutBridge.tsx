// ========================================
// File: src/components/admin/messages/AdminEmailPreviewLayoutBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getClassName(element: Element) {
  return element.getAttribute("class") ?? "";
}

function looksLikeEmailPreviewFrame(element: HTMLElement) {
  const className = getClassName(element);

  return (
    className.includes("rounded-2xl") &&
    className.includes("overflow-hidden") &&
    className.includes("bg-white") &&
    Boolean(element.firstElementChild) &&
    element.textContent?.includes("SIXFL")
  );
}

function widenEmailPreview(frame: HTMLElement) {
  if (frame.dataset.emailPreviewFixed === "1") return;

  frame.dataset.emailPreviewFixed = "1";
  frame.style.width = "100%";
  frame.style.maxWidth = "100%";
  frame.style.overflowX = "auto";
  frame.style.background = "#f3f4f6";
  frame.style.padding = "16px";

  const htmlPreview = frame.firstElementChild as HTMLElement | null;
  if (htmlPreview) {
    htmlPreview.style.minWidth = "620px";
    htmlPreview.style.maxWidth = "720px";
    htmlPreview.style.margin = "0 auto";
  }

  let current = frame.parentElement;
  let depth = 0;

  while (current && depth < 5) {
    const className = getClassName(current);

    if (className.includes("max-w-[85%]")) {
      current.style.width = "100%";
      current.style.maxWidth = "100%";
      current.style.boxSizing = "border-box";
      break;
    }

    current = current.parentElement;
    depth += 1;
  }
}

function fixEmailPreviews() {
  const frames = Array.from(document.querySelectorAll<HTMLElement>("div")).filter(
    looksLikeEmailPreviewFrame,
  );

  frames.forEach(widenEmailPreview);
}

export default function AdminEmailPreviewLayoutBridge() {
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
