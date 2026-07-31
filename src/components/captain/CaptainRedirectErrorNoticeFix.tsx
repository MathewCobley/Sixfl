// ========================================
// File: src/components/captain/CaptainRedirectErrorNoticeFix.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const kitNavBaseClass =
  "rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100";

function getTeamId(pathname: string) {
  return pathname.match(/\/captain\/team\/([^/]+)(?:\/|$)/)?.[1] ?? null;
}

function injectKitNavigation(pathname: string) {
  const teamId = getTeamId(pathname);
  if (!teamId) return false;

  const nav = document.querySelector<HTMLElement>(".captain-team-nav");
  if (!nav) return false;

  let link = nav.querySelector<HTMLAnchorElement>("a[data-team-kit-nav='true']");

  if (!link) {
    link = document.createElement("a");
    link.dataset.teamKitNav = "true";
    link.textContent = "Team kit";
    nav.appendChild(link);
  }

  link.href = `/captain/team/${encodeURIComponent(teamId)}/kit`;
  link.className = [
    kitNavBaseClass,
    pathname === `/captain/team/${teamId}/kit` ||
    pathname.startsWith(`/captain/team/${teamId}/kit/`)
      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
      : "",
  ].join(" ");

  return true;
}

export default function CaptainRedirectErrorNoticeFix() {
  const pathname = usePathname();

  useEffect(() => {
    if (injectKitNavigation(pathname)) return;

    const observer = new MutationObserver(() => {
      if (injectKitNavigation(pathname)) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

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
