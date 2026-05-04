// ========================================
// File: src/components/captain/ManagedProspectMoveLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type MoveData = {
  targetTeams: Array<{
    id: string;
    name: string;
    league: { name: string; season: string | null } | null;
  }>;
};

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/prospects(?:\/)?$/);
  return match?.[1] ?? null;
}

function getTeamLabel(team: MoveData["targetTeams"][number]) {
  return team.league?.name
    ? `${team.name} · ${team.league.name}${team.league.season ? ` ${team.league.season}` : ""}`
    : team.name;
}

function removeMoveModal() {
  document.querySelector("[data-managed-prospect-move-modal]")?.remove();
}

function findProspectCard(start: HTMLElement) {
  let current: HTMLElement | null = start;

  while (current && current.tagName !== "MAIN") {
    const className = typeof current.className === "string" ? current.className : "";

    if (
      className.includes("space-y-5") &&
      className.includes("px-6") &&
      className.includes("py-5") &&
      current.querySelector('input[name="prospectId"]')
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function getProspectName(card: HTMLElement) {
  const firstName = card
    .querySelector<HTMLInputElement>('input[name="firstName"]')
    ?.value.trim();
  const lastName = card
    .querySelector<HTMLInputElement>('input[name="lastName"]')
    ?.value.trim();
  const fromInputs = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (fromInputs) return fromInputs;

  const heading = Array.from(card.querySelectorAll<HTMLElement>("div")).find((element) => {
    const className = typeof element.className === "string" ? element.className : "";
    return className.includes("text-base") && className.includes("font-semibold") && element.textContent?.trim();
  });

  return heading?.textContent?.trim() || "this prospect";
}

function showMoveModal(input: {
  teamId: string;
  prospectId: string;
  prospectName: string;
}) {
  removeMoveModal();

  const overlay = document.createElement("div");
  overlay.dataset.managedProspectMoveModal = "true";
  overlay.className =
    "fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm";

  const modal = document.createElement("div");
  modal.className =
    "w-full max-w-2xl rounded-3xl border border-sky-400/20 bg-[#07130f] p-6 text-white shadow-2xl";

  const heading = document.createElement("div");
  heading.innerHTML = `
    <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">Move prospect</p>
    <h2 class="mt-2 text-2xl font-semibold tracking-tight text-white">Move ${input.prospectName}</h2>
    <p class="mt-2 text-sm leading-6 text-sky-100/70">Choose the managed team to move this prospect into. They will remain a prospect in the destination team.</p>
  `;

  const status = document.createElement("div");
  status.className = "mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65";
  status.textContent = "Loading managed teams…";

  const list = document.createElement("div");
  list.className = "mt-4 grid gap-2";

  const footer = document.createElement("div");
  footer.className = "mt-5 flex justify-end";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Cancel";
  close.className =
    "inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10";
  close.addEventListener("click", removeMoveModal);
  footer.appendChild(close);

  modal.append(heading, status, list, footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) removeMoveModal();
  });

  fetch(`/api/captain/team/${input.teamId}/move-managed-player?type=prospect`, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load managed teams.");
      return (await response.json()) as MoveData;
    })
    .then((data) => {
      list.innerHTML = "";

      if (data.targetTeams.length === 0) {
        status.textContent = "No other managed teams are available.";
        return;
      }

      status.textContent = "Select a destination team.";

      for (const team of data.targetTeams) {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm text-white transition hover:border-sky-400/30 hover:bg-sky-500/10";
        button.innerHTML = `
          <span>
            <span class="block font-semibold text-white">${getTeamLabel(team)}</span>
            <span class="mt-1 block text-xs text-white/45">Move into this managed team’s prospects</span>
          </span>
          <span class="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100">Move</span>
        `;

        button.addEventListener("click", async () => {
          button.setAttribute("disabled", "true");
          status.className =
            "mt-4 rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100";
          status.textContent = "Moving prospect…";

          try {
            const response = await fetch(
              `/api/captain/team/${input.teamId}/move-managed-player`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "prospect",
                  itemId: input.prospectId,
                  targetTeamId: team.id,
                }),
              },
            );

            const payload = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;

            if (!response.ok) {
              throw new Error(payload?.error ?? "Prospect could not be moved.");
            }

            status.className =
              "mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100";
            status.textContent = "Prospect moved. Refreshing…";
            window.location.reload();
          } catch (error) {
            button.removeAttribute("disabled");
            status.className =
              "mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100";
            status.textContent = error instanceof Error ? error.message : "Prospect could not be moved.";
          }
        });

        list.appendChild(button);
      }
    })
    .catch((error) => {
      status.className =
        "mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100";
      status.textContent = error instanceof Error ? error.message : "Could not load managed teams.";
    });
}

function addManagedProspectMoveLinks(pathname: string) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;

  const detailForms = Array.from(
    document.querySelectorAll<HTMLInputElement>('main form input[name="prospectId"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => form instanceof HTMLFormElement)
    .filter(
      (form) =>
        Boolean(form.querySelector('input[name="firstName"]')) &&
        Boolean(form.querySelector('input[name="lastName"]')) &&
        Boolean(form.querySelector('input[name="email"]')) &&
        Boolean(form.querySelector('input[name="phone"]')),
    );

  for (const form of detailForms) {
    const prospectId = form
      .querySelector<HTMLInputElement>('input[name="prospectId"]')
      ?.value.trim();

    if (!prospectId) continue;

    const card = findProspectCard(form);
    if (!card) continue;

    if (card.querySelector(`button[data-managed-prospect-move-link="${prospectId}"]`)) {
      continue;
    }

    const prospectName = getProspectName(card);
    const moveButton = document.createElement("button");
    moveButton.type = "button";
    moveButton.textContent = "Move prospect";
    moveButton.dataset.managedProspectMoveLink = prospectId;
    moveButton.className =
      "mt-3 inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15";
    moveButton.addEventListener("click", () => {
      showMoveModal({ teamId, prospectId, prospectName });
    });

    const signupLink = Array.from(card.querySelectorAll<HTMLAnchorElement>("a")).find(
      (link) => link.textContent?.trim() === "Open signup link",
    );
    const promoteForm = Array.from(card.querySelectorAll<HTMLFormElement>("form")).find(
      (candidate) =>
        Boolean(candidate.querySelector('input[name="prospectId"]')) &&
        !candidate.querySelector('input[name="firstName"]') &&
        candidate.textContent?.includes("Promote to squad"),
    );

    if (signupLink?.parentElement) {
      signupLink.parentElement.insertBefore(moveButton, signupLink.nextSibling);
    } else if (promoteForm?.parentElement) {
      promoteForm.parentElement.insertBefore(moveButton, promoteForm.nextSibling);
    } else {
      card.appendChild(moveButton);
    }
  }
}

export default function ManagedProspectMoveLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/prospects")) return;

    addManagedProspectMoveLinks(pathname);

    const observer = new MutationObserver(() => addManagedProspectMoveLinks(pathname));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
