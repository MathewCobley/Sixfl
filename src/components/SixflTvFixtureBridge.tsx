"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type CaptainTvFixture = {
  id: string;
  fullLabel: string;
  captainLabels: string[];
};

function normalise(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function loadAdminFlags() {
  const response = await fetch("/api/admin/fixtures/sixfl-tv", { cache: "no-store" });
  if (!response.ok) return new Set<string>();
  const payload = (await response.json().catch(() => null)) as { fixtureIds?: string[] } | null;
  return new Set(payload?.fixtureIds ?? []);
}

async function saveAdminFlag(fixtureId: string, sixflTvRecorded: boolean) {
  const response = await fetch("/api/admin/fixtures/sixfl-tv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureId, sixflTvRecorded }),
  });
  return response.ok;
}

function injectNightBoardCheckboxes(recordedIds: Set<string>) {
  const forms = Array.from(
    document.querySelectorAll<HTMLFormElement>('form input[name="fixtureId"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => Boolean(form));

  for (const form of forms) {
    if (form.querySelector("[data-sixfl-tv-control]")) continue;
    const fixtureId = form.querySelector<HTMLInputElement>('input[name="fixtureId"]')?.value;
    if (!fixtureId) continue;

    const label = document.createElement("label");
    label.dataset.sixflTvControl = "true";
    label.className =
      "flex items-center justify-between gap-3 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-2 text-xs font-semibold text-fuchsia-100";

    const text = document.createElement("span");
    text.textContent = "SIXFL TV recorded";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = recordedIds.has(fixtureId);
    input.className = "h-4 w-4 accent-fuchsia-500";

    const status = document.createElement("span");
    status.className = "text-[10px] font-normal text-fuchsia-100/60";
    status.textContent = input.checked ? "Shown to captains" : "Not shown";

    const left = document.createElement("span");
    left.className = "flex flex-col";
    left.appendChild(text);
    left.appendChild(status);

    input.addEventListener("change", async () => {
      input.disabled = true;
      status.textContent = "Saving…";
      const ok = await saveAdminFlag(fixtureId, input.checked);
      input.disabled = false;
      if (!ok) {
        input.checked = !input.checked;
        status.textContent = "Could not save";
        return;
      }
      status.textContent = input.checked ? "Shown to captains" : "Not shown";
    });

    label.appendChild(left);
    label.appendChild(input);
    form.querySelector('button[type="submit"]')?.insertAdjacentElement("beforebegin", label);
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

function createTvBadge(fixtureId: string) {
  const badge = document.createElement("span");
  badge.dataset.sixflTvFixture = fixtureId;
  badge.className =
    "inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/12 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-100";
  badge.textContent = "SIXFL TV";
  badge.title = "This fixture is being recorded for SIXFL TV";
  return badge;
}

function injectCaptainBadges(fixtures: CaptainTvFixture[]) {
  if (fixtures.length === 0) return;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("h2, div.text-base.font-semibold.text-white, div.font-semibold.text-white"),
  );

  for (const element of candidates) {
    const text = normalise(element.textContent);
    const fixture = fixtures.find(
      (item) =>
        text === normalise(item.fullLabel) ||
        item.captainLabels.some((label) => text === normalise(label)),
    );
    if (!fixture) continue;

    const parent = element.parentElement ?? element;
    if (parent.querySelector(`[data-sixfl-tv-fixture="${fixture.id}"]`)) continue;
    parent.classList.add("flex", "flex-wrap", "items-center", "gap-2");
    parent.appendChild(createTvBadge(fixture.id));
  }
}

export default function SixflTvFixtureBridge() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    if (pathname === "/admin/night-board") {
      void loadAdminFlags().then((ids) => {
        if (cancelled) return;
        const run = () => injectNightBoardCheckboxes(ids);
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
