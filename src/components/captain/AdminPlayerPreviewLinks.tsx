// ========================================
// File: src/components/captain/AdminPlayerPreviewLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const injectedLinkClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl px-4 py-2.5 text-center text-sm font-medium transition";
const dashboardLoginButtonClassName = `${injectedLinkClassName} border border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60`;

type LoginStatusItem = {
  membershipId: string;
  hasLoggedIn: boolean;
  hasActiveSession: boolean;
  activeSessionCount: number;
  lastLoginAt: string | null;
  latestSessionExpires: string | null;
};

type LoginStatusPayload = {
  items: LoginStatusItem[];
};

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function getPlayerCommunicationsHref(input: { teamId: string; membershipId: string }) {
  return `/admin/teams/${input.teamId}/players/${input.membershipId}/communications`;
}

function formatDateTime(value: string | null) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function getLoginStatusCopy(status?: LoginStatusItem) {
  if (!status) {
    return {
      badge: "Dashboard status unknown",
      detail: "Could not load login status.",
      className: "border-white/10 bg-white/[0.04] text-white/55",
    };
  }

  const lastLogin = formatDateTime(status.lastLoginAt);
  const activeUntil = formatDateTime(status.latestSessionExpires);

  if (lastLogin) {
    return {
      badge: status.hasActiveSession ? "Dashboard signed in" : "Dashboard used",
      detail: `${status.hasActiveSession ? "Active session" : "Last login"}: ${lastLogin}${activeUntil ? ` · session expires ${activeUntil}` : ""}`,
      className: status.hasActiveSession
        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
        : "border-sky-400/20 bg-sky-500/10 text-sky-100",
    };
  }

  if (status.hasActiveSession) {
    return {
      badge: "Dashboard session active",
      detail: activeUntil
        ? `Active session found · expires ${activeUntil}. Login time was not recorded before this feature was added.`
        : "Active session found. Login time was not recorded before this feature was added.",
      className: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    };
  }

  return {
    badge: "No dashboard login recorded",
    detail: "This linked account has not signed in since login tracking was added.",
    className: "border-amber-400/20 bg-amber-500/10 text-amber-100",
  };
}

function setDashboardLoginButtonState(
  button: HTMLButtonElement,
  state: "idle" | "sending" | "sent" | "error",
) {
  switch (state) {
    case "sending":
      button.disabled = true;
      button.textContent = "Sending login email…";
      break;
    case "sent":
      button.disabled = true;
      button.textContent = "Login email sent";
      break;
    case "error":
      button.disabled = false;
      button.textContent = "Try login email again";
      break;
    default:
      button.disabled = false;
      button.textContent = "Send login email";
  }
}

async function sendDashboardLoginEmail(input: {
  teamId: string;
  membershipId: string;
  button: HTMLButtonElement;
}) {
  setDashboardLoginButtonState(input.button, "sending");

  try {
    const response = await fetch(`/api/captain/team/${input.teamId}/send-player-login-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId: input.membershipId }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Login email could not be sent.");
    }

    input.button.title = payload?.message ?? "Dashboard sign-in email sent.";
    setDashboardLoginButtonState(input.button, "sent");
  } catch (error) {
    setDashboardLoginButtonState(input.button, "error");
    window.alert(error instanceof Error ? error.message : "Login email could not be sent.");
  }
}

function normaliseActionLayout(actionsContainer: HTMLElement) {
  actionsContainer.className =
    "grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[22rem] xl:max-w-[22rem] xl:shrink-0";
  actionsContainer.style.display = "grid";
  actionsContainer.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  actionsContainer.style.gap = "0.5rem";
  actionsContainer.style.width = "min(22rem, 100%)";
  actionsContainer.style.maxWidth = "22rem";
  actionsContainer.style.alignItems = "stretch";

  for (const form of Array.from(actionsContainer.querySelectorAll("form"))) {
    const hasRoleSelect = Boolean(form.querySelector('[name="role"]'));

    if (hasRoleSelect) {
      form.className = "grid w-full min-w-0 grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto]";
      form.style.gridColumn = "1 / -1";
      form.style.display = "grid";
      form.style.gridTemplateColumns = "minmax(0, 1fr) auto";
      form.style.gap = "0.5rem";

      const selectWrapper = form.querySelector("div");
      if (selectWrapper instanceof HTMLElement) {
        selectWrapper.className = "min-w-0";
      }
    } else {
      form.className = "w-full";
      form.style.gridColumn = "auto";
    }
  }

  for (const control of Array.from(
    actionsContainer.querySelectorAll<HTMLElement>("a, button"),
  )) {
    control.classList.add("w-full", "justify-center", "text-center");
    control.classList.remove("sm:w-auto", "shrink-0");
    control.style.width = "100%";
    control.style.minHeight = "2.75rem";
  }
}

function normaliseExistingCommsLink(input: {
  actionsContainer: HTMLElement;
  teamId: string;
  membershipId: string;
}) {
  const { actionsContainer, teamId, membershipId } = input;
  const playerCommsHref = getPlayerCommunicationsHref({ teamId, membershipId });

  const commsLinks = Array.from(actionsContainer.querySelectorAll<HTMLAnchorElement>("a"))
    .filter((link) => {
      const href = link.getAttribute("href") ?? "";
      return (
        href === `/admin/teams/${teamId}/communications` ||
        /^\/admin\/teams\/[^/]+\/prospects\/[^/]+\/communications$/.test(href)
      );
    });

  for (const link of commsLinks) {
    const className = `${injectedLinkClassName} border border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15`;

    if (link.href !== playerCommsHref) link.href = playerCommsHref;
    if (link.textContent !== "Player comms") link.textContent = "Player comms";
    if (link.dataset.adminPlayerCommsLink !== membershipId) {
      link.dataset.adminPlayerCommsLink = membershipId;
    }
    if (link.className !== className) link.className = className;
  }
}

function findMemberDetailsContainer(actionsContainer: HTMLElement) {
  const row = actionsContainer.parentElement;
  if (!(row instanceof HTMLElement)) return null;

  return row.querySelector<HTMLElement>("div.flex.min-w-0.items-start.gap-4 > div.min-w-0");
}

function addLoginStatusBlock(input: {
  actionsContainer: HTMLElement;
  membershipId: string;
  status?: LoginStatusItem;
}) {
  const detailsContainer = findMemberDetailsContainer(input.actionsContainer);
  if (!detailsContainer) return;

  const copy = getLoginStatusCopy(input.status);
  const existing = detailsContainer.querySelector<HTMLElement>(
    `[data-admin-login-status="${input.membershipId}"]`,
  );
  const className = `mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${copy.className}`;
  const html = `<div class="font-semibold text-white/90">${copy.badge}</div><div class="mt-0.5 text-white/65">${copy.detail}</div>`;
  const block = existing ?? document.createElement("div");

  if (block.dataset.adminLoginStatus !== input.membershipId) {
    block.dataset.adminLoginStatus = input.membershipId;
  }

  if (block.className !== className) {
    block.className = className;
  }

  if (block.innerHTML !== html) {
    block.innerHTML = html;
  }

  if (!existing) {
    detailsContainer.appendChild(block);
  }
}

function addDashboardLoginEmailButton(input: {
  actionsContainer: HTMLElement;
  teamId: string;
  membershipId: string;
}) {
  const existingButton = input.actionsContainer.querySelector<HTMLButtonElement>(
    `button[data-dashboard-login-email="${input.membershipId}"]`,
  );

  if (existingButton) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dashboardLoginEmail = input.membershipId;
  button.className = dashboardLoginButtonClassName;
  button.textContent = "Send login email";
  button.addEventListener("click", () => {
    void sendDashboardLoginEmail({
      teamId: input.teamId,
      membershipId: input.membershipId,
      button,
    });
  });

  input.actionsContainer.appendChild(button);
}

function addPreviewLinks(pathname: string, statusByMembershipId = new Map<string, LoginStatusItem>()) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;

  const roleForms = Array.from(
    document.querySelectorAll<HTMLFormElement>('main form input[name="membershipId"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => form instanceof HTMLFormElement)
    .filter((form) => Boolean(form.querySelector('input[name="teamid"]')));

  for (const form of roleForms) {
    const membershipId = form
      .querySelector<HTMLInputElement>('input[name="membershipId"]')
      ?.value.trim();

    if (!membershipId) continue;

    const actionsContainer = form.parentElement;
    if (!(actionsContainer instanceof HTMLElement)) continue;

    normaliseExistingCommsLink({ actionsContainer, teamId, membershipId });
    addLoginStatusBlock({
      actionsContainer,
      membershipId,
      status: statusByMembershipId.get(membershipId),
    });
    addDashboardLoginEmailButton({ actionsContainer, teamId, membershipId });

    const existingLink = actionsContainer.querySelector(
      `a[data-admin-player-preview-link="${membershipId}"]`,
    );

    if (!existingLink) {
      const previewLink = document.createElement("a");
      previewLink.href = `/admin/teams/${teamId}/players/${membershipId}/preview`;
      previewLink.textContent = "Player preview";
      previewLink.dataset.adminPlayerPreviewLink = membershipId;
      previewLink.className = `${injectedLinkClassName} border border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/15`;

      actionsContainer.insertBefore(previewLink, form.nextSibling);
    }

    normaliseActionLayout(actionsContainer);
  }
}

export default function AdminPlayerPreviewLinks() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamIdFromPathname(pathname);
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let statusByMembershipId = new Map<string, LoginStatusItem>();

    const runSafely = () => {
      observer?.disconnect();
      addPreviewLinks(pathname, statusByMembershipId);
      observer?.observe(document.body, { childList: true, subtree: true });
    };

    runSafely();

    if (teamId) {
      fetch(`/api/admin/team/${teamId}/squad-login-status`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load login status.");
          return (await response.json()) as LoginStatusPayload;
        })
        .then((payload) => {
          if (cancelled) return;
          statusByMembershipId = new Map(
            payload.items.map((item) => [item.membershipId, item]),
          );
          runSafely();
        })
        .catch(() => {
          if (!cancelled) runSafely();
        });
    }

    observer = new MutationObserver(runSafely);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}
