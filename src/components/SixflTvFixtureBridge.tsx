"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type AdminTvFixture = {
  id: string;
  sixflTvRecorded: boolean;
  sixflTvUrl: string | null;
};

type CaptainTvFixture = {
  id: string;
  fullLabel: string;
  captainLabels: string[];
  sixflTvUrl?: string | null;
};

function normalise(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function loadAdminFixtures() {
  const response = await fetch("/api/admin/fixtures/sixfl-tv", { cache: "no-store" });
  if (!response.ok) return new Map<string, AdminTvFixture>();

  const payload = (await response.json().catch(() => null)) as {
    fixtures?: AdminTvFixture[];
    fixtureIds?: string[];
  } | null;

  const fixtures = new Map<string, AdminTvFixture>();

  for (const fixture of payload?.fixtures ?? []) {
    fixtures.set(fixture.id, fixture);
  }

  for (const fixtureId of payload?.fixtureIds ?? []) {
    if (!fixtures.has(fixtureId)) {
      fixtures.set(fixtureId, {
        id: fixtureId,
        sixflTvRecorded: true,
        sixflTvUrl: null,
      });
    }
  }

  return fixtures;
}

async function saveAdminFixture(input: {
  fixtureId: string;
  sixflTvRecorded?: boolean;
  sixflTvUrl?: string;
}) {
  const response = await fetch("/api/admin/fixtures/sixfl-tv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return response.ok;
}

function injectNightBoardControls(fixtures: Map<string, AdminTvFixture>) {
  const forms = Array.from(
    document.querySelectorAll<HTMLFormElement>('form input[name="fixtureId"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => Boolean(form));

  for (const form of forms) {
    if (form.querySelector("[data-sixfl-tv-control]")) continue;
    const fixtureId = form.querySelector<HTMLInputElement>('input[name="fixtureId"]')?.value ?? "";
    if (!fixtureId) continue;

    const savedFixture = fixtures.get(fixtureId) ?? null;

    const wrapper = document.createElement("div");
    wrapper.dataset.sixflTvControl = "true";
    wrapper.className = "space-y-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-3 text-xs text-fuchsia-100";

    const topRow = document.createElement("label");
    topRow.className = "flex items-center justify-between gap-3 font-semibold";

    const text = document.createElement("span");
    text.textContent = "SIXFL TV / Veo link";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(savedFixture?.sixflTvRecorded);
    checkbox.className = "h-4 w-4 accent-fuchsia-500";

    const status = document.createElement("div");
    status.className = "text-[10px] font-normal text-fuchsia-100/60";
    status.textContent = savedFixture?.sixflTvUrl
      ? "Link saved and shown"
      : checkbox.checked
        ? "Shown, but no link saved"
        : "Not shown";

    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.placeholder = "Paste Veo share link…";
    urlInput.value = savedFixture?.sixflTvUrl ?? "";
    urlInput.className = "h-9 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-white outline-none placeholder:text-white/35 focus:border-fuchsia-300/60";

    const actions = document.createElement("div");
    actions.className = "flex flex-wrap gap-2";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "rounded-lg border border-fuchsia-300/30 bg-fuchsia-400/15 px-3 py-1.5 text-[11px] font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/20";
    saveButton.textContent = "Save TV link";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/15";
    removeButton.textContent = "Remove TV link";

    const openLink = document.createElement("a");
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.className = "rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white/75 transition hover:bg-black/30";
    openLink.textContent = "Open link";

    function refreshOpenLink() {
      const url = urlInput.value.trim();
      if (url) {
        openLink.href = url;
        openLink.style.display = "inline-flex";
      } else {
        openLink.removeAttribute("href");
        openLink.style.display = "none";
      }
    }

    function setDisabled(disabled: boolean) {
      saveButton.disabled = disabled;
      removeButton.disabled = disabled;
      checkbox.disabled = disabled;
      urlInput.disabled = disabled;
    }

    async function save() {
      setDisabled(true);
      status.textContent = "Saving…";

      const url = urlInput.value.trim();
      const ok = await saveAdminFixture({
        fixtureId,
        sixflTvRecorded: checkbox.checked || Boolean(url),
        sixflTvUrl: url,
      });

      setDisabled(false);

      if (!ok) {
        status.textContent = "Could not save — check the URL";
        return;
      }

      if (url && !checkbox.checked) checkbox.checked = true;
      status.textContent = url
        ? "Link saved and shown"
        : checkbox.checked
          ? "Shown, but no link saved"
          : "Not shown";
      refreshOpenLink();
    }

    async function remove() {
      const hasAnythingToRemove = checkbox.checked || Boolean(urlInput.value.trim());
      if (!hasAnythingToRemove) return;

      setDisabled(true);
      status.textContent = "Removing…";

      const ok = await saveAdminFixture({
        fixtureId,
        sixflTvRecorded: false,
        sixflTvUrl: "",
      });

      setDisabled(false);

      if (!ok) {
        status.textContent = "Could not remove TV link";
        return;
      }

      checkbox.checked = false;
      urlInput.value = "";
      status.textContent = "Removed from SIXFL TV";
      refreshOpenLink();
    }

    checkbox.addEventListener("change", () => {
      void save();
    });
    saveButton.addEventListener("click", () => {
      void save();
    });
    removeButton.addEventListener("click", () => {
      void remove();
    });
    urlInput.addEventListener("change", () => {
      refreshOpenLink();
    });

    topRow.appendChild(text);
    topRow.appendChild(checkbox);
    actions.appendChild(saveButton);
    actions.appendChild(removeButton);
    actions.appendChild(openLink);
    wrapper.appendChild(topRow);
    wrapper.appendChild(status);
    wrapper.appendChild(urlInput);
    wrapper.appendChild(actions);
    refreshOpenLink();

    form.querySelector('button[type="submit"]')?.insertAdjacentElement("beforebegin", wrapper);
  }
}

async function loadCaptainFixtures(teamId: string) {
  const response = await fetch(`/api/captain/team/${teamId}/sixfl-tv-fixtures`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => null)) as {
    fixtures?: CaptainTvFixture[];
  } | null;
  return payload?.fixtures ?? [];
}

function createTvBadge(fixture: CaptainTvFixture) {
  const url = fixture.sixflTvUrl?.trim();
  const element = url ? document.createElement("a") : document.createElement("span");

  element.dataset.sixflTvFixture = fixture.id;
  element.className =
    "inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/12 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20";
  element.textContent = url ? "SIXFL TV ▶" : "SIXFL TV";
  element.title = url ? "Watch this fixture on SIXFL TV" : "This fixture is being recorded for SIXFL TV";

  if (url && element instanceof HTMLAnchorElement) {
    element.href = url;
    element.target = "_blank";
    element.rel = "noopener noreferrer";
  }

  return element;
}

function textMatchesFixture(text: string, fixture: CaptainTvFixture) {
  const candidate = normalise(text);
  return (
    candidate === normalise(fixture.fullLabel) ||
    candidate.includes(normalise(fixture.fullLabel)) ||
    fixture.captainLabels.some((label) => {
      const normalisedLabel = normalise(label);
      return candidate === normalisedLabel || candidate.includes(normalisedLabel);
    })
  );
}

function appendBadge(container: HTMLElement, fixture: CaptainTvFixture) {
  if (container.querySelector(`[data-sixfl-tv-fixture="${fixture.id}"]`)) return true;
  container.classList.add("flex", "flex-wrap", "items-center", "gap-2");
  container.appendChild(createTvBadge(fixture));
  return true;
}

function injectCaptainBadges(fixtures: CaptainTvFixture[]) {
  if (fixtures.length === 0) return;

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "h1, h2, h3, div.text-base.font-semibold.text-white, div.font-semibold.text-white",
    ),
  );

  for (const element of candidates) {
    const fixture = fixtures.find((item) => textMatchesFixture(element.textContent ?? "", item));
    if (!fixture) continue;

    const parent = element.parentElement ?? element;
    appendBadge(parent, fixture);
  }

  const statusRows = Array.from(document.querySelectorAll<HTMLElement>("span, div, p"))
    .filter((element) => normalise(element.textContent).toLowerCase() === "fixture confirmed");

  for (const row of statusRows) {
    const card = row.closest<HTMLElement>("section, article, div.rounded-3xl") ?? row.parentElement;
    if (!card) continue;

    const fixture = fixtures.find((item) => textMatchesFixture(card.textContent ?? "", item));
    if (!fixture) continue;

    appendBadge(row.parentElement ?? row, fixture);
  }
}

export default function SixflTvFixtureBridge() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    if (pathname === "/admin/night-board") {
      void loadAdminFixtures().then((fixtures) => {
        if (cancelled) return;
        const run = () => injectNightBoardControls(fixtures);
        run();
        observer = new MutationObserver(run);
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }

    const captainMatch = pathname.match(/^\/captain\/team\/([^/]+)(?:\/|$)/);
    const teamId = captainMatch?.[1];
    if (teamId) {
      void loadCaptainFixtures(teamId).then((fixtures) => {
        if (cancelled) return;
        const run = () => injectCaptainBadges(fixtures);
        run();
        observer = new MutationObserver(run);
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}
