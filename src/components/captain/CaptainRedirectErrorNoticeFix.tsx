// ========================================
// File: src/components/captain/CaptainRedirectErrorNoticeFix.tsx
// ========================================

"use client";

import { useEffect } from "react";

export default function CaptainRedirectErrorNoticeFix() {
  useEffect(() => {
    if (!window.location.pathname.includes("/captain/team/")) return;
    if (!window.location.pathname.endsWith("/results")) return;

    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (error !== "NEXT_REDIRECT") return;

    params.delete("error");
    params.set("saved", "1");

    const nextSearch = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`,
    );

    const notices = Array.from(document.querySelectorAll<HTMLElement>("section, div"));
    const notice = notices.find((element) => element.textContent?.trim() === "NEXT_REDIRECT");

    if (!notice) return;

    notice.textContent = "Match details saved successfully.";
    notice.className = notice.className
      .replaceAll("border-red-400/20", "border-emerald-400/20")
      .replaceAll("bg-red-500/10", "bg-emerald-500/10")
      .replaceAll("text-red-100", "text-emerald-100");
  }, []);

  return null;
}
