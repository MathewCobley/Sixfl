// ========================================
// File: src/components/admin/fixtures/FixtureCardResultLinksBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type ResultLabel = {
  fixtureId: string;
  status: string;
  hasResult: boolean;
  homeScore: number | null;
  awayScore: number | null;
  isDisputed: boolean;
};

type PublishStatus = {
  id: string;
  published: boolean;
  publishedAt: string | null;
};

function getFixtureIdFromEditHref(href: string | null) {
  if (!href) return null;
  const match = href.match(/\/admin\/fixtures\/([^/?#]+)\/edit/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getReturnTo() {
  return `${window.location.pathname}${window.location.search}`;
}

function getEditLinks() {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/admin/fixtures/"][href*="/edit"]'),
  );
}

function getFixtureIds() {
  return Array.from(
    new Set(
      getEditLinks()
        .map((link) => getFixtureIdFromEditHref(link.getAttribute("href")))
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

function renderResultBadge(result: ResultLabel) {
  if (!result.hasResult || result.homeScore === null || result.awayScore === null) {
    return "";
  }

  return result.isDisputed
    ? `Result ${result.homeScore}-${result.awayScore} · disputed`
    : `Result ${result.homeScore}-${result.awayScore}`;
}

function resultBadgeClass(result: ResultLabel) {
  return result.isDisputed
    ? "inline-flex h-10 items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 text-xs font-semibold text-red-100"
    : "inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-100";
}

function publishButtonClass() {
  return "inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50";
}

async function publishFixture(fixtureId: string) {
  const response = await fetch("/api/admin/fixtures/publish-one", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureId }),
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    published?: boolean;
    alreadyPublished?: boolean;
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "This fixture could not be published.");
  }

  return payload;
}

function setCardDraftBadgesPublished(container: HTMLElement | null) {
  if (!container) return;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>("span, div"));

  for (const element of candidates) {
    if ((element.textContent ?? "").trim().toLowerCase() !== "draft") continue;
    element.textContent = "Published";
    element.className = "inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-100";
  }
}

function addPublishButton(input: {
  fixtureId: string;
  actionRow: HTMLElement;
  editLink: HTMLAnchorElement;
  status: PublishStatus | undefined;
}) {
  if (input.status?.published) {
    input.actionRow.querySelector(`[data-publish-fixture-for="${input.fixtureId}"]`)?.remove();
    return;
  }

  if (input.actionRow.querySelector(`[data-publish-fixture-for="${input.fixtureId}"]`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.publishFixtureFor = input.fixtureId;
  button.className = publishButtonClass();
  button.textContent = "Publish match";
  button.title = "Publish this individual fixture and queue the related team/payment notifications.";

  button.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Publish this individual match? This will make it live, create/update team payment charges, and queue the related team emails/reminders.",
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Publishing...";

    try {
      const result = await publishFixture(input.fixtureId);
      button.textContent = result.alreadyPublished ? "Already published" : "Published";
      button.className = "inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-100";
      setCardDraftBadgesPublished(input.actionRow.closest("article") ?? input.actionRow.closest("tr") ?? input.actionRow.parentElement);
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Publish match";
      window.alert(error instanceof Error ? error.message : "This fixture could not be published.");
    }
  });

  input.actionRow.insertBefore(button, input.editLink);
}

function enhanceFixtureCards(
  labelsById: Map<string, ResultLabel>,
  publishStatusById: Map<string, PublishStatus>,
) {
  for (const editLink of getEditLinks()) {
    const fixtureId = getFixtureIdFromEditHref(editLink.getAttribute("href"));
    const actionRow = editLink.closest("div");

    if (!fixtureId || !actionRow) continue;

    addPublishButton({
      fixtureId,
      actionRow,
      editLink,
      status: publishStatusById.get(fixtureId),
    });

    let resultLink = actionRow.querySelector<HTMLAnchorElement>(`[data-enter-result-for="${fixtureId}"]`);

    if (!resultLink) {
      resultLink = document.createElement("a");
      resultLink.dataset.enterResultFor = fixtureId;
      resultLink.href = `/admin/fixtures/${encodeURIComponent(fixtureId)}/result?returnTo=${encodeURIComponent(getReturnTo())}`;
      resultLink.textContent = "Enter result";
      resultLink.className = "inline-flex h-10 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 text-xs font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/15";
      editLink.insertAdjacentElement("afterend", resultLink);
    }

    const result = labelsById.get(fixtureId);
    const badgeText = result ? renderResultBadge(result) : "";
    let badge = actionRow.querySelector<HTMLSpanElement>(`[data-result-badge-for="${fixtureId}"]`);

    if (!badgeText) {
      badge?.remove();
      continue;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.dataset.resultBadgeFor = fixtureId;
      actionRow.insertBefore(badge, editLink);
    }

    badge.textContent = badgeText;
    badge.className = resultBadgeClass(result!);
  }
}

async function loadResultLabels() {
  const ids = getFixtureIds();
  if (ids.length === 0) return new Map<string, ResultLabel>();

  const response = await fetch(`/api/admin/fixtures/result-labels?ids=${encodeURIComponent(ids.join(","))}`, {
    cache: "no-store",
  });

  if (!response.ok) return new Map<string, ResultLabel>();

  const payload = (await response.json().catch(() => null)) as { results?: ResultLabel[] } | null;
  return new Map((payload?.results ?? []).map((result) => [result.fixtureId, result]));
}

async function loadPublishStatuses() {
  const ids = getFixtureIds();
  if (ids.length === 0) return new Map<string, PublishStatus>();

  const response = await fetch(`/api/admin/fixtures/publish-one?ids=${encodeURIComponent(ids.join(","))}`, {
    cache: "no-store",
  });

  if (!response.ok) return new Map<string, PublishStatus>();

  const payload = (await response.json().catch(() => null)) as { fixtures?: PublishStatus[] } | null;
  return new Map((payload?.fixtures ?? []).map((fixture) => [fixture.id, fixture]));
}

export default function FixtureCardResultLinksBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/fixtures") return;

    let cancelled = false;

    const run = async () => {
      const [labels, publishStatuses] = await Promise.all([
        loadResultLabels(),
        loadPublishStatuses(),
      ]);
      if (!cancelled) enhanceFixtureCards(labels, publishStatuses);
    };

    const frame = window.requestAnimationFrame(() => {
      void run();
    });
    const timer = window.setTimeout(() => {
      void run();
    }, 800);
    const observer = new MutationObserver(() => {
      void run();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
