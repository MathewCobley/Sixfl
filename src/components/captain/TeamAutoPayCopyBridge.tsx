// ========================================
// File: src/components/captain/TeamAutoPayCopyBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function replaceExactText(from: string, to: string) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    if (node.textContent?.trim() === from) {
      textNodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    textNode.textContent = to;
  }
}

function replaceContainingText(from: string, to: string) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    if (node.textContent?.includes(from)) {
      textNodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    textNode.textContent = to;
  }
}

function ensureAutoPayMessage(state: string | null) {
  document.querySelectorAll("[data-team-autopay-message]").forEach((node) => node.remove());

  if (!state) return;

  const message = document.createElement("div");
  message.dataset.teamAutopayMessage = "true";
  message.className = "rounded-2xl border px-5 py-4 text-sm";

  if (state === "success") {
    message.className += " border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    message.textContent = "Saved card setup complete. SIXFL will only use it for one-off matchday team fees on the actual fixture day.";
  } else if (state === "cancelled") {
    message.className += " border-amber-400/20 bg-amber-500/10 text-amber-100";
    message.textContent = "Saved card setup was cancelled. No automatic matchday card payment has been enabled.";
  } else if (state === "missing_team") {
    message.className += " border-red-400/20 bg-red-500/10 text-red-100";
    message.textContent = "Saved card setup could not start because this team could not be found.";
  } else {
    return;
  }

  const main = document.querySelector("main") ?? document.body;
  const firstChild = main.firstElementChild;
  if (firstChild) {
    firstChild.insertAdjacentElement("afterbegin", message);
  } else {
    main.appendChild(message);
  }
}

function updatePaymentCopy(state: string | null) {
  replaceExactText("Automatic payments", "Saved card payments");
  replaceExactText("Recurring team payments", "Saved card matchday payments");
  replaceExactText("Set up automatic payments", "Set up saved card");
  replaceExactText("Replace automatic payment", "Replace saved card");
  replaceExactText("Manage in Stripe", "Manage saved card");
  replaceContainingText(
    "Set up a recurring Stripe payment for your team.",
    "Save a team card securely with Stripe. SIXFL will only create a one-off payment on the actual matchday for a scheduled fixture.",
  );
  replaceContainingText(
    "Successful renewal payments will be recorded automatically in the SIXFL payment history.",
    "No subscription will be created. If a fixture is postponed or cancelled, the saved card will not be charged for that fixture.",
  );
  ensureAutoPayMessage(state);
}

function parseMoneyPence(value: string) {
  const match = value.match(/£([\d,]+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const pounds = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(pounds) ? Math.round(pounds * 100) : 0;
}

function findLeafLine(card: HTMLElement, prefix: string) {
  return Array.from(card.querySelectorAll<HTMLElement>("div")).find(
    (element) =>
      element.children.length === 0 &&
      (element.textContent?.trim() ?? "").startsWith(prefix),
  ) ?? null;
}

function setBadge(
  badge: HTMLElement | null,
  label: string,
  tone: "amber" | "red" | "emerald",
) {
  if (!badge) return;

  const toneClass =
    tone === "red"
      ? "border-red-400/30 bg-red-500/10 text-red-100"
      : tone === "amber"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
        : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";

  badge.className = `rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneClass}`;
  badge.textContent = label;
}

function setSummaryTone(section: HTMLElement | null, tone: "amber" | "red") {
  if (!section) return;

  section.classList.remove(
    "border-emerald-400/20",
    "bg-emerald-500/10",
    "text-emerald-100/70",
    "border-white/10",
    "bg-white/[0.04]",
    "text-white/45",
  );

  if (tone === "red") {
    section.classList.add("border-red-400/25", "bg-red-500/10", "text-red-100/70");
  } else {
    section.classList.add("border-amber-400/25", "bg-amber-500/10", "text-amber-100/70");
  }
}

function updateSelectedSummary(input: {
  cancelled: boolean;
  awaitingLabel: string | null;
}) {
  const prompt = Array.from(document.querySelectorAll<HTMLElement>("p")).find(
    (element) => element.textContent?.trim() === "What is happening with this fixture?",
  );
  const section = prompt?.closest<HTMLElement>("section") ?? null;
  const heading = section?.querySelector<HTMLElement>("h3") ?? null;
  const description = section
    ? Array.from(section.querySelectorAll<HTMLParagraphElement>("p")).find(
        (paragraph) => paragraph !== prompt && paragraph.className.includes("leading-6"),
      ) ?? null
    : null;

  if (!heading || !description) return;

  if (input.cancelled) {
    heading.textContent = "This fixture was cancelled — no fee is due.";
    description.textContent =
      "The game was cancelled, so the team charge has been cancelled and no player collection is required.";
    setSummaryTone(section, "red");
    return;
  }

  if (input.awaitingLabel) {
    heading.textContent = `Fixture fee covered — ${input.awaitingLabel} still to collect from a player.`;
    description.textContent =
      `The SIXFL fixture fee is already covered, but a player payment request for ${input.awaitingLabel} is still open. When it is paid, the excess will be added to the team credit pot.`;
    setSummaryTone(section, "amber");
  }
}

function updateCancelledMetricCards() {
  const labels = Array.from(document.querySelectorAll<HTMLElement>("p"));
  const fixtureFeeLabel = labels.find((element) => element.textContent?.trim() === "Fixture fee");
  const fixtureFeeCard = fixtureFeeLabel?.closest<HTMLElement>("div.rounded-3xl") ?? null;
  const teamBalanceLabel = labels.find(
    (element) => element.textContent?.trim() === "Team balance remaining",
  );
  const teamBalanceCard = teamBalanceLabel?.closest<HTMLElement>("div.rounded-3xl") ?? null;

  if (fixtureFeeLabel && fixtureFeeCard) {
    fixtureFeeLabel.textContent = "Fee due";
    const value = fixtureFeeCard.querySelector<HTMLElement>("p.text-3xl");
    const helper = Array.from(fixtureFeeCard.querySelectorAll<HTMLParagraphElement>("p")).at(-1);
    if (value) value.textContent = "£0.00";
    if (helper) helper.textContent = "Fixture cancelled — no fee due.";
  }

  if (teamBalanceCard) {
    const helper = Array.from(teamBalanceCard.querySelectorAll<HTMLParagraphElement>("p")).at(-1);
    if (helper) helper.textContent = "No balance due — fixture cancelled.";
  }
}

function updateSquadPaymentClarity(searchParams: URLSearchParams) {
  const chooseFixtureHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
    (element) => element.textContent?.trim() === "Choose fixture",
  );
  const panel = chooseFixtureHeading?.closest<HTMLElement>("div.rounded-3xl") ?? null;
  const cards = Array.from(panel?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
  const selectedFixtureId = searchParams.get("fixtureId");

  for (const card of cards) {
    const title = card.querySelector<HTMLElement>("div.text-sm.font-semibold");
    const titleText = title?.textContent?.trim() ?? "";
    const badge = Array.from(card.querySelectorAll<HTMLElement>("span")).find((element) =>
      [
        "Fee covered",
        "Collection active",
        "Collection not set up",
        "Cancelled — no fee due",
      ].includes(element.textContent?.trim() ?? ""),
    ) ?? null;
    const awaitingLine = findLeafLine(card, "Awaiting from players:");
    const awaitingText = awaitingLine?.textContent?.trim() ?? "";
    const awaitingPence = parseMoneyPence(awaitingText);
    const awaitingLabel = awaitingText.match(/£[\d,]+(?:\.\d{1,2})?/)?.[0] ?? null;
    const href = card.getAttribute("href") ?? "";
    const isSelected = selectedFixtureId
      ? href.includes(`fixtureId=${encodeURIComponent(selectedFixtureId)}`)
      : card.classList.contains("border-emerald-400/30");
    const isCancelled =
      titleText.toLowerCase().startsWith("cancelled game") ||
      titleText.toLowerCase().includes("fixture cancelled");

    if (isCancelled) {
      setBadge(badge, "Cancelled — no fee due", "red");
      card.classList.remove("border-emerald-400/30", "bg-emerald-500/10");
      card.classList.add("border-red-400/30", "bg-red-500/10");

      const fixtureFeeLine = findLeafLine(card, "Fixture fee:");
      const collectionLine = findLeafLine(card, "Player collection:");
      const balanceLine = findLeafLine(card, "Team balance remaining:");
      if (fixtureFeeLine) fixtureFeeLine.textContent = "Fixture cancelled — no fee due";
      if (collectionLine) collectionLine.textContent = "No player collection required";
      if (balanceLine) balanceLine.textContent = "Team balance: £0.00 — charge cancelled";

      if (isSelected) {
        updateSelectedSummary({ cancelled: true, awaitingLabel: null });
        updateCancelledMetricCards();
      }
      continue;
    }

    if (awaitingPence > 0 && awaitingLabel) {
      setBadge(badge, `${awaitingLabel} still to collect`, "amber");
      if (isSelected) {
        updateSelectedSummary({ cancelled: false, awaitingLabel });
      }
    }
  }
}

export default function TeamAutoPayCopyBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const isTeamPaymentsPage = /^\/captain\/team\/[^/]+\/payments\/?$/.test(pathname);
    const isSquadPaymentsPage = /^\/captain\/team\/[^/]+\/player-payments\/?$/.test(pathname);

    if (!isTeamPaymentsPage && !isSquadPaymentsPage) return;

    const apply = () => {
      if (isTeamPaymentsPage) {
        updatePaymentCopy(params.get("autopay"));
      }
      if (isSquadPaymentsPage) {
        updateSquadPaymentClarity(params);
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname, searchParams]);

  return null;
}
