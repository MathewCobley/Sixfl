// ========================================
// File: src/components/admin/night-board/NightBoardMatchFeeSyncBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type TeamKickoffRule = {
  id: string;
  name: string;
  latestKickoffTime: string | null;
};

type FixtureKickoffRule = {
  id: string;
  homeTeam: TeamKickoffRule;
  awayTeam: TeamKickoffRule;
};

type KickoffRulesResponse = {
  fixtures?: FixtureKickoffRule[];
  error?: string;
};

type ActiveKickoffWarning = {
  fixtureId: string;
  inlineMessage: string;
  summaryMessage: string;
};

function isNightBoardForm(form: HTMLFormElement) {
  return Boolean(
    form.querySelector<HTMLInputElement>('input[name="fixtureId"]') &&
      form.querySelector<HTMLInputElement>('input[name="kickoffTime"]') &&
      form.querySelector<HTMLSelectElement>('select[name="status"]'),
  );
}

function getNightBoardForms() {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form")).filter(isNightBoardForm);
}

function getReturnTo(formData: FormData) {
  const explicit = String(formData.get("returnTo") ?? "").trim();
  if (explicit.startsWith("/admin/night-board")) return explicit;
  return `${window.location.pathname}${window.location.search}`;
}

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;

  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function displayTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function buildKickoffWarning(form: HTMLFormElement, rule: FixtureKickoffRule): ActiveKickoffWarning | null {
  const fixtureId = form.querySelector<HTMLInputElement>('input[name="fixtureId"]')?.value.trim() ?? "";
  const kickoffInput = form.querySelector<HTMLInputElement>('input[name="kickoffTime"]');
  const status = form.querySelector<HTMLSelectElement>('select[name="status"]')?.value ?? "SCHEDULED";

  if (!fixtureId || !kickoffInput || !["SCHEDULED", "COMPLETED"].includes(status)) return null;

  const kickoffMinutes = timeToMinutes(kickoffInput.value);
  if (kickoffMinutes === null) return null;

  const breachedTeams = [rule.homeTeam, rule.awayTeam].filter((team) => {
    const latestMinutes = timeToMinutes(team.latestKickoffTime);
    return latestMinutes !== null && kickoffMinutes > latestMinutes;
  });

  if (breachedTeams.length === 0) return null;

  const scheduledTime = displayTime(kickoffInput.value);
  const limits = breachedTeams
    .map((team) => `${team.name} ${displayTime(team.latestKickoffTime ?? "")}`)
    .join(" · ");

  const statedLimitSentence =
    breachedTeams.length === 1
      ? `${breachedTeams[0].name}’s stated latest kick-off is ${displayTime(breachedTeams[0].latestKickoffTime ?? "")}.`
      : `The stated latest kick-off times are ${breachedTeams
          .map((team) => `${team.name} ${displayTime(team.latestKickoffTime ?? "")}`)
          .join(" and ")}.`;

  return {
    fixtureId,
    inlineMessage: `⚠ Latest preferred kick-off exceeded: ${limits}. This fixture is scheduled for ${scheduledTime}.`,
    summaryMessage: `Potential issue – late kick-off: ${rule.homeTeam.name} v ${rule.awayTeam.name} is scheduled for ${scheduledTime}. ${statedLimitSentence}`,
  };
}

function renderInlineWarning(form: HTMLFormElement, warning: ActiveKickoffWarning | null) {
  const kickoffInput = form.querySelector<HTMLInputElement>('input[name="kickoffTime"]');
  const label = kickoffInput?.closest("label");
  if (!label) return;

  const existing = label.querySelector<HTMLElement>("[data-latest-ko-warning]");

  if (!warning) {
    existing?.remove();
    return;
  }

  const notice = existing ?? document.createElement("div");
  notice.setAttribute("data-latest-ko-warning", "true");
  notice.className =
    "mt-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-2 text-[11px] font-medium normal-case tracking-normal text-amber-100";
  notice.textContent = warning.inlineMessage;

  if (!existing) label.appendChild(notice);
}

function findWarningsPanel() {
  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find(
    (candidate) => candidate.textContent?.trim() === "Warnings" || candidate.textContent?.trim() === "Warnings and potential issues",
  );
  if (!heading || !(heading.parentElement instanceof HTMLElement)) return null;

  const card = heading.parentElement;
  const list = Array.from(card.children).find(
    (child) =>
      child instanceof HTMLElement &&
      child.classList.contains("mt-4") &&
      child.classList.contains("space-y-3"),
  );

  if (!(list instanceof HTMLElement)) return null;
  return { heading, card, list };
}

function renderBottomWarnings(warnings: ActiveKickoffWarning[]) {
  const panel = findWarningsPanel();
  if (!panel) return;

  panel.heading.textContent = "Warnings and potential issues";
  panel.list.querySelectorAll("[data-latest-ko-summary]").forEach((element) => element.remove());

  const emptyNotice = Array.from(panel.list.children).find(
    (child) => child instanceof HTMLElement && child.textContent?.trim().startsWith("No obvious pitch"),
  );

  if (emptyNotice instanceof HTMLElement) {
    emptyNotice.textContent = "No obvious pitch, referee, venue, clash or latest kick-off preference warnings.";
    emptyNotice.hidden = warnings.length > 0;
  }

  for (const warning of warnings) {
    const notice = document.createElement("div");
    notice.setAttribute("data-latest-ko-summary", warning.fixtureId);
    notice.className = "rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100";
    notice.textContent = warning.summaryMessage;
    panel.list.appendChild(notice);
  }

  let footer = panel.card.querySelector<HTMLElement>("[data-latest-ko-footer]");
  if (!footer) {
    footer = document.createElement("p");
    footer.setAttribute("data-latest-ko-footer", "true");
    footer.className = "mt-4 text-xs leading-5 text-white/45";
    panel.card.appendChild(footer);
  }

  footer.textContent =
    "Latest kick-off times are team preferences. A breach is shown as a potential issue, but it does not stop the match being saved.";
}

async function installKickoffWarnings(signal: AbortSignal) {
  const forms = getNightBoardForms();
  const fixtureIds = forms
    .map((form) => form.querySelector<HTMLInputElement>('input[name="fixtureId"]')?.value.trim() ?? "")
    .filter(Boolean);

  if (fixtureIds.length === 0) {
    renderBottomWarnings([]);
    return () => undefined;
  }

  const response = await fetch("/api/admin/night-board/kickoff-warnings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureIds }),
    signal,
  });

  const payload = (await response.json().catch(() => null)) as KickoffRulesResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Latest kick-off preferences could not be checked.");
  }

  const rulesByFixtureId = new Map((payload?.fixtures ?? []).map((fixture) => [fixture.id, fixture]));

  function renderAll() {
    const warnings: ActiveKickoffWarning[] = [];

    for (const form of forms) {
      const fixtureId = form.querySelector<HTMLInputElement>('input[name="fixtureId"]')?.value.trim() ?? "";
      const rule = rulesByFixtureId.get(fixtureId);
      const warning = rule ? buildKickoffWarning(form, rule) : null;
      renderInlineWarning(form, warning);
      if (warning) warnings.push(warning);
    }

    renderBottomWarnings(warnings);
  }

  const listeners = forms.flatMap((form) => {
    const kickoffInput = form.querySelector<HTMLInputElement>('input[name="kickoffTime"]');
    const statusSelect = form.querySelector<HTMLSelectElement>('select[name="status"]');
    const attached: Array<{ element: HTMLElement; event: string }> = [];

    if (kickoffInput) {
      kickoffInput.addEventListener("input", renderAll);
      attached.push({ element: kickoffInput, event: "input" });
    }

    if (statusSelect) {
      statusSelect.addEventListener("change", renderAll);
      attached.push({ element: statusSelect, event: "change" });
    }

    return attached;
  });

  renderAll();

  return () => {
    for (const listener of listeners) {
      listener.element.removeEventListener(listener.event, renderAll);
    }
  };
}

export default function NightBoardMatchFeeSyncBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/admin/night-board") return;

    const controller = new AbortController();
    let removeKickoffListeners: () => void = () => undefined;
    let disposed = false;

    function onSubmit(event: SubmitEvent) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !isNightBoardForm(form)) return;

      event.preventDefault();

      const formData = new FormData(form);
      const returnTo = getReturnTo(formData);
      const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])'));

      buttons.forEach((button) => {
        button.disabled = true;
        button.dataset.originalText = button.textContent ?? "";
        button.textContent = "Saving…";
      });

      void fetch("/api/admin/night-board/update-match", {
        method: "POST",
        body: formData,
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { returnTo?: string; error?: string } | null;

          if (!response.ok) {
            throw new Error(payload?.error || "The match could not be saved.");
          }

          window.location.assign(payload?.returnTo || returnTo);
        })
        .catch((error) => {
          console.error("Night Board save failed", error);
          buttons.forEach((button) => {
            button.disabled = false;
            button.textContent = button.dataset.originalText || "Save match";
          });
          alert(error instanceof Error ? error.message : "The match could not be saved.");
        });
    }

    document.addEventListener("submit", onSubmit, true);

    void installKickoffWarnings(controller.signal)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        removeKickoffListeners = cleanup;
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Night Board latest kick-off warning check failed", error);
      });

    return () => {
      disposed = true;
      controller.abort();
      removeKickoffListeners();
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [pathname, searchKey]);

  return null;
}
