// ========================================
// File: src/components/captain/VoidFixturePlayerFeesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/match-fees\/?$/);
  return match?.[1] ?? null;
}

function removeExistingButton() {
  document.querySelector("[data-void-fixture-player-fees]")?.remove();
}

function createButton(input: {
  teamId: string;
  fixtureId: string;
  onComplete: () => void;
}) {
  const wrapper = document.createElement("div");
  wrapper.dataset.voidFixturePlayerFees = "true";
  wrapper.className =
    "rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100";

  const title = document.createElement("div");
  title.className = "font-semibold text-white";
  title.textContent = "Void fees for conceded / cancelled game";

  const helper = document.createElement("p");
  helper.className = "mt-1 text-red-100/75";
  helper.textContent =
    "Cancels all unpaid player fees for this fixture and stops any queued payment reminders. Paid fees are left alone so they can be reviewed/refunded manually if needed.";

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "mt-3 inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:bg-red-500/25";
  button.textContent = "Void unpaid player fees";

  button.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Void all unpaid player match fees for this fixture? Paid fees will not be changed.",
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Voiding...";

    try {
      const response = await fetch(
        `/api/captain/team/${input.teamId}/match-fees/void-fixture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fixtureId: input.fixtureId,
            reason: "Game conceded / fixture not played",
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Could not void player fees.");
      }

      const data = (await response.json()) as {
        voided?: number;
        paidFeesLeft?: number;
      };

      window.alert(
        `Voided ${data.voided ?? 0} unpaid fee${data.voided === 1 ? "" : "s"}.${
          data.paidFeesLeft && data.paidFeesLeft > 0
            ? ` ${data.paidFeesLeft} paid fee${data.paidFeesLeft === 1 ? "" : "s"} still need manual review/refund if required.`
            : ""
        }`,
      );

      input.onComplete();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not void player fees.",
      );
      button.disabled = false;
      button.textContent = "Void unpaid player fees";
    }
  });

  wrapper.append(title, helper, button);
  return wrapper;
}

export default function VoidFixturePlayerFeesBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    removeExistingButton();

    const teamId = getTeamIdFromPathname(pathname);
    const fixtureId = searchParams.get("fixtureId")?.trim();

    if (!teamId || !fixtureId) return;

    const createFeesSection = Array.from(document.querySelectorAll("section")).find(
      (section) => section.textContent?.includes("Create player fees"),
    );

    if (!createFeesSection) return;

    const button = createButton({
      teamId,
      fixtureId,
      onComplete: () => router.refresh(),
    });

    createFeesSection.appendChild(button);

    return () => {
      removeExistingButton();
    };
  }, [pathname, router, searchParams]);

  return null;
}
