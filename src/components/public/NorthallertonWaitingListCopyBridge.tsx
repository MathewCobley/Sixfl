// ========================================
// File: src/components/public/NorthallertonWaitingListCopyBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function isNorthallertonTeamSignup(pathname: string, searchParams: URLSearchParams) {
  if (pathname !== "/register-interest") return false;

  const type = (searchParams.get("type") || "team").toLowerCase();
  const area = (searchParams.get("area") || "").toLowerCase();
  const night = (searchParams.get("night") || "").toLowerCase();

  return type === "team" && area === "northallerton" && (!night || night === "wednesday");
}

function updateRegisterInterestCopy() {
  const heading = Array.from(document.querySelectorAll("h1")).find((item) =>
    item.textContent?.trim() === "Register your team",
  );

  if (!heading) return;

  heading.textContent = "Join the Northallerton team waiting list";

  const intro = heading.nextElementSibling;
  if (intro) {
    intro.textContent =
      "The Northallerton Wednesday league is currently full for team places. You can still register your team for the waiting list or to be considered for an additional league night.";
  }

  const submitButton = Array.from(document.querySelectorAll("button[type='submit']")).find((button) =>
    button.textContent?.includes("REGISTER TEAM"),
  );
  if (submitButton) submitButton.textContent = "JOIN TEAM WAITING LIST";

  const form = document.querySelector("form");
  if (!form || form.querySelector("[data-sixfl-waiting-list-notice='true']")) return;

  const notice = document.createElement("div");
  notice.dataset.sixflWaitingListNotice = "true";
  notice.className = "rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100";
  notice.textContent =
    "Team places for the current Northallerton Wednesday league are full. Player registrations are still open, and team enquiries will be kept for the waiting list / possible second night.";
  form.prepend(notice);
}

function updateHomeCopy() {
  const heading = Array.from(document.querySelectorAll("h2")).find((item) =>
    item.textContent?.trim() === "Northallerton Wednesday 6-a-side",
  );

  if (!heading) return;

  const card = heading.closest("article");
  if (!card) return;

  const status = Array.from(card.querySelectorAll("div")).find((item) =>
    item.textContent?.trim() === "Registrations open",
  );
  if (status) status.textContent = "Team places full";

  const body = heading.nextElementSibling;
  if (body) {
    body.textContent =
      "Northallerton Wednesday team places are currently full. Teams can still join the waiting list or be considered for an extra league night. Individual players can still register.";
  }

  const primaryLink = card.querySelector("a[href*='type=team']");
  if (primaryLink) primaryLink.textContent = "Join waiting list";
}

export default function NorthallertonWaitingListCopyBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (pathname === "/") {
      updateHomeCopy();
      return;
    }

    if (isNorthallertonTeamSignup(pathname, params)) {
      updateRegisterInterestCopy();
    }
  }, [pathname, searchParams]);

  return null;
}
