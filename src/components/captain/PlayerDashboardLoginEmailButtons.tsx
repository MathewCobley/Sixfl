// ========================================
// File: src/components/captain/PlayerDashboardLoginEmailButtons.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const buttonBaseClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-center text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const AUTO_LOGIN_STORAGE_PREFIX = "sixfl:auto-player-login-email:";

type PendingLoginEmail = {
  teamId: string;
  email: string;
  createdAt: number;
};

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/(?:squad|captain-squad)(?:\/)?$/);
  return match?.[1] ?? null;
}

function getMembershipIdFromEditHref(href: string, teamId: string) {
  const squadMatch = href.match(new RegExp(`^/captain/team/${teamId}/squad/([^/]+)/edit$`));
  if (squadMatch?.[1]) return squadMatch[1];

  const captainSquadMatch = href.match(new RegExp(`^/captain/team/${teamId}/captain-squad/([^/]+)/edit$`));
  return captainSquadMatch?.[1] ?? null;
}

function getAutoLoginStorageKey(teamId: string) {
  return `${AUTO_LOGIN_STORAGE_PREFIX}${teamId}`;
}

function normaliseEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function savePendingLoginEmail(teamId: string, email: string) {
  window.sessionStorage.setItem(
    getAutoLoginStorageKey(teamId),
    JSON.stringify({ teamId, email: normaliseEmail(email), createdAt: Date.now() } satisfies PendingLoginEmail),
  );
}

function readPendingLoginEmail(teamId: string) {
  const rawValue = window.sessionStorage.getItem(getAutoLoginStorageKey(teamId));
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PendingLoginEmail>;
    if (parsed.teamId !== teamId || !parsed.email || !parsed.createdAt) return null;
    if (Date.now() - parsed.createdAt > 5 * 60 * 1000) return null;

    return {
      teamId: parsed.teamId,
      email: normaliseEmail(parsed.email),
      createdAt: parsed.createdAt,
    } satisfies PendingLoginEmail;
  } catch {
    return null;
  }
}

function clearPendingLoginEmail(teamId: string) {
  window.sessionStorage.removeItem(getAutoLoginStorageKey(teamId));
}

function containerAlreadyHasLoginControl(actionsContainer: HTMLElement, membershipId: string) {
  const existingBridgeButton = actionsContainer.querySelector<HTMLButtonElement>(
    `button[data-dashboard-login-email="${membershipId}"]`,
  );

  if (existingBridgeButton) return true;

  const text = actionsContainer.textContent ?? "";
  return text.includes("Send login email") || text.includes("Login email sent") || text.includes("No email saved");
}

function setButtonState(button: HTMLButtonElement, state: "idle" | "sending" | "sent" | "error") {
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

async function sendLoginEmail(input: {
  teamId: string;
  membershipId: string;
  button: HTMLButtonElement;
}) {
  setButtonState(input.button, "sending");

  try {
    const response = await fetch(`/api/captain/team/${input.teamId}/send-player-login-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ membershipId: input.membershipId }),
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Login email could not be sent.");
    }

    setButtonState(input.button, "sent");
    input.button.title = payload?.message ?? "Dashboard sign-in email sent.";
  } catch (error) {
    setButtonState(input.button, "error");
    window.alert(error instanceof Error ? error.message : "Login email could not be sent.");
  }
}

function addButtonToActionsContainer(input: {
  actionsContainer: HTMLElement;
  teamId: string;
  membershipId: string;
}) {
  if (containerAlreadyHasLoginControl(input.actionsContainer, input.membershipId)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dashboardLoginEmail = input.membershipId;
  button.className = buttonBaseClassName;
  button.textContent = "Send login email";
  button.addEventListener("click", () => {
    void sendLoginEmail({
      teamId: input.teamId,
      membershipId: input.membershipId,
      button,
    });
  });

  input.actionsContainer.appendChild(button);
}

function addButtonsToAdminSquadPage(teamId: string) {
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

    addButtonToActionsContainer({ actionsContainer, teamId, membershipId });
  }
}

function addButtonsToCaptainSquadPage(teamId: string) {
  const editLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      `a[href^="/captain/team/${teamId}/squad/"][href$="/edit"], a[href^="/captain/team/${teamId}/captain-squad/"][href$="/edit"]`,
    ),
  );

  for (const editLink of editLinks) {
    const href = editLink.getAttribute("href") ?? "";
    const membershipId = getMembershipIdFromEditHref(href, teamId);
    const actionsContainer = editLink.parentElement;

    if (!membershipId || !(actionsContainer instanceof HTMLElement)) continue;

    addButtonToActionsContainer({ actionsContainer, teamId, membershipId });
  }
}

function findAddPlayerForm(teamId: string) {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((form) => {
    const teamInput = form.querySelector<HTMLInputElement>('input[name="teamid"]');
    return (
      teamInput?.value === teamId &&
      Boolean(form.querySelector<HTMLInputElement>('input[name="displayName"]')) &&
      Boolean(form.querySelector<HTMLInputElement>('input[name="email"]'))
    );
  }) ?? null;
}

function addAutoLoginCheckboxToAddForm(teamId: string) {
  const form = findAddPlayerForm(teamId);
  if (!form || form.querySelector('[data-auto-login-email-control="1"]')) return;

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submitButton) return;

  const label = document.createElement("label");
  label.dataset.autoLoginEmailControl = "1";
  label.className =
    "flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] px-4 py-3 transition hover:border-emerald-400/35 hover:bg-emerald-500/[0.12]";

  label.innerHTML = `
    <span class="text-sm leading-5 text-white/75">
      <span class="block font-semibold text-white">Send player login email automatically</span>
      <span class="mt-1 block text-xs text-white/50">If an email address is entered, the player will be sent their dashboard login link after they are added.</span>
    </span>
    <input type="checkbox" name="sendLoginEmailNow" checked class="mt-1 h-4 w-4 shrink-0 accent-emerald-400" />
  `;

  submitButton.insertAdjacentElement("beforebegin", label);

  form.addEventListener("submit", () => {
    const email = normaliseEmail(form.querySelector<HTMLInputElement>('input[name="email"]')?.value);
    const shouldSend = form.querySelector<HTMLInputElement>('input[name="sendLoginEmailNow"]')?.checked === true;

    if (email && shouldSend) {
      savePendingLoginEmail(teamId, email);
    } else {
      clearPendingLoginEmail(teamId);
    }
  });
}

function findMemberActionsForEmail(teamId: string, email: string) {
  const editLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      `a[href^="/captain/team/${teamId}/squad/"][href$="/edit"], a[href^="/captain/team/${teamId}/captain-squad/"][href$="/edit"]`,
    ),
  );

  for (const editLink of editLinks) {
    const actionsContainer = editLink.parentElement;
    if (!(actionsContainer instanceof HTMLElement)) continue;

    const memberRow = actionsContainer.closest("div.flex.flex-col.gap-4.px-6.py-5");
    const text = normaliseEmail(memberRow?.textContent ?? "");

    if (text.includes(email)) {
      return actionsContainer;
    }
  }

  return null;
}

function triggerLoginEmailForAddedPlayer(teamId: string) {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("saved") !== "player-added") return;

  const pending = readPendingLoginEmail(teamId);
  if (!pending) return;

  const actionsContainer = findMemberActionsForEmail(teamId, pending.email);
  if (!actionsContainer) return;

  clearPendingLoginEmail(teamId);

  const loginForm = Array.from(actionsContainer.querySelectorAll<HTMLFormElement>("form")).find((form) =>
    Boolean(form.querySelector<HTMLInputElement>('input[name="membershipId"]')),
  );

  if (loginForm) {
    loginForm.requestSubmit();
    return;
  }

  const loginButton = actionsContainer.querySelector<HTMLButtonElement>('button[data-dashboard-login-email]');
  loginButton?.click();
}

function addDashboardLoginButtons(pathname: string) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;

  addButtonsToAdminSquadPage(teamId);
  addButtonsToCaptainSquadPage(teamId);
  addAutoLoginCheckboxToAddForm(teamId);
  triggerLoginEmailForAddedPlayer(teamId);
}

export default function PlayerDashboardLoginEmailButtons() {
  const pathname = usePathname();

  useEffect(() => {
    let observer: MutationObserver | null = null;

    const run = () => {
      observer?.disconnect();
      addDashboardLoginButtons(pathname);
      observer?.observe(document.body, { childList: true, subtree: true });
    };

    run();

    observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}
