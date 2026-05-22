// ========================================
// File: src/components/admin/leads/AdminLeadEditButtonBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getLeadIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/admin\/leads\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

function addEditLeadButton(pathname: string) {
  const leadId = getLeadIdFromPathname(pathname);
  if (!leadId) return;

  const existingButton = document.querySelector<HTMLAnchorElement>(
    `a[data-admin-edit-lead-link="${leadId}"]`,
  );

  if (existingButton) return;

  const backToLeadsLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
    (link) => link.getAttribute("href") === "/admin/leads" && link.textContent?.trim() === "Back to leads",
  );

  if (!backToLeadsLink || !backToLeadsLink.parentElement) return;

  const parent = backToLeadsLink.parentElement;
  const actionWrapper = document.createElement("div");
  actionWrapper.className = "flex flex-wrap justify-end gap-3";

  const editLink = document.createElement("a");
  editLink.href = `/admin/leads/${leadId}/edit`;
  editLink.textContent = "Edit lead";
  editLink.dataset.adminEditLeadLink = leadId;
  editLink.className =
    "inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25";

  parent.insertBefore(actionWrapper, backToLeadsLink);
  actionWrapper.appendChild(editLink);
  actionWrapper.appendChild(backToLeadsLink);
}

export default function AdminLeadEditButtonBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => addEditLeadButton(pathname));

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
