// ========================================
// File: src/components/layout/HarrogateSignupStyleBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const HARROGATE_BADGE = "/leagues/harrogate-tuesday-mens-rossett-512.png";

function findExactTextElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  text: string,
) {
  return Array.from(root.querySelectorAll<T>(selector)).find(
    (element) => element.textContent?.trim() === text,
  );
}

function hideElement(
  element: HTMLElement | null | undefined,
  cleanup: Array<() => void>,
) {
  if (!element) return;
  const originalDisplay = element.style.display;
  element.style.display = "none";
  cleanup.push(() => {
    element.style.display = originalDisplay;
  });
}

export default function HarrogateSignupStyleBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    const area = searchParams.get("area")?.trim().toLowerCase();
    const night = searchParams.get("night")?.trim().toLowerCase();

    if (
      pathname !== "/register-interest" ||
      area !== "harrogate" ||
      night !== "tuesday"
    ) {
      return;
    }

    const main = document.querySelector("main");
    const form = main?.querySelector<HTMLFormElement>("form");
    const card = form?.closest<HTMLElement>("div.relative.overflow-hidden.rounded-3xl");

    if (!main || !form || !card) return;

    const cleanup: Array<() => void> = [];
    const leadType = (searchParams.get("type") || "team").trim().toLowerCase();
    const isTeamForm = leadType === "team";

    card.dataset.harrogateSignupCard = "true";
    cleanup.push(() => delete card.dataset.harrogateSignupCard);

    const watermark = document.createElement("img");
    watermark.src = HARROGATE_BADGE;
    watermark.alt = "";
    watermark.setAttribute("aria-hidden", "true");
    watermark.dataset.harrogateSignupWatermark = "true";
    card.insertBefore(watermark, card.firstChild);
    cleanup.push(() => watermark.remove());

    const heading = card.querySelector<HTMLHeadingElement>("h1");
    const intro = heading?.nextElementSibling as HTMLElement | null;

    if (heading && isTeamForm) {
      const original = heading.textContent;
      heading.textContent = "Register your Harrogate team";
      cleanup.push(() => {
        heading.textContent = original;
      });
    }

    if (intro) {
      const original = intro.textContent;
      intro.textContent =
        leadType === "player"
          ? "Join the player list for the SIXFL Men’s Harrogate West Tuesday Rossett League."
          : leadType === "referee"
            ? "Register referee interest for the SIXFL Harrogate West Tuesday League."
            : "Leave your details for the SIXFL Men’s Harrogate West Tuesday Rossett League. It takes around 30 seconds.";
      cleanup.push(() => {
        intro.textContent = original;
      });
    }

    const reassurance = Array.from(card.querySelectorAll<HTMLElement>("p")).find(
      (element) => element.textContent?.includes("No payment now"),
    );
    if (reassurance && isTeamForm) {
      const original = reassurance.textContent;
      reassurance.textContent = "No payment now • No commitment • Takes around 30 seconds";
      cleanup.push(() => {
        reassurance.textContent = original;
      });
    }

    const pillTexts =
      leadType === "referee"
        ? ["Harrogate West", "Tuesday nights", "Regular opportunities"]
        : ["Harrogate West", "Men’s league", "Tuesday nights"];
    const existingPills = Array.from(card.querySelectorAll<HTMLElement>("span")).filter(
      (element) =>
        ["Men’s leagues", "Women’s leagues", "Youth leagues"].includes(
          element.textContent?.trim() ?? "",
        ),
    );

    existingPills.forEach((pill, index) => {
      const original = pill.textContent;
      pill.textContent = pillTexts[index] ?? pillTexts[pillTexts.length - 1];
      cleanup.push(() => {
        pill.textContent = original;
      });
    });

    for (const labelText of ["Area", "League type"]) {
      const label = findExactTextElement<HTMLLabelElement>(form, "label", labelText);
      hideElement(label?.parentElement, cleanup);
    }

    const nightsTitle = findExactTextElement<HTMLElement>(
      form,
      "div,span,p,h2,h3",
      "Preferred nights",
    );
    let nightsPanel = nightsTitle?.parentElement ?? null;

    while (
      nightsPanel &&
      nightsPanel !== form &&
      nightsPanel.querySelectorAll('input[type="checkbox"]').length < 7
    ) {
      nightsPanel = nightsPanel.parentElement;
    }

    if (nightsPanel && nightsPanel !== form) {
      hideElement(nightsPanel, cleanup);
    }

    const areaSelect = form.querySelector<HTMLSelectElement>('select[name="area"]');
    const leagueTypeSelect = form.querySelector<HTMLSelectElement>(
      'select[name="leagueType"]',
    );
    const sourceInput = form.querySelector<HTMLInputElement>('input[name="source"]');

    if (areaSelect) areaSelect.value = "Harrogate";
    if (leagueTypeSelect) leagueTypeSelect.value = "MENS";
    if (sourceInput) sourceInput.value = "harrogate-west-tuesday-rossett";

    form.querySelectorAll<HTMLInputElement>('input[name="preferredNights"]').forEach(
      (input) => {
        input.checked = input.value === "TUESDAY";
      },
    );

    const notes = form.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
    if (notes) {
      const original = notes.placeholder;
      notes.placeholder =
        leadType === "player"
          ? "Anything useful to know? For example: position, playing standard, whether you are joining alone or with friends, or any questions about the Harrogate Tuesday league."
          : leadType === "referee"
            ? "Tell us anything useful. For example: refereeing experience, qualifications, or availability for Tuesday nights in Harrogate."
            : "Anything useful to know about your team?";
      cleanup.push(() => {
        notes.placeholder = original;
      });
    }

    if (isTeamForm) {
      const teamNameInput = form.querySelector<HTMLInputElement>('input[name="teamName"]');
      if (teamNameInput) {
        const wasRequired = teamNameInput.required;
        teamNameInput.required = true;
        cleanup.push(() => {
          teamNameInput.required = wasRequired;
        });
      }

      const freeKitLabel = Array.from(form.querySelectorAll<HTMLLabelElement>("label")).find(
        (label) => label.textContent?.includes("founding teams free kit offer"),
      );
      hideElement(freeKitLabel?.parentElement, cleanup);

      const notesLabel = findExactTextElement<HTMLLabelElement>(form, "label", "Notes");
      hideElement(notesLabel?.parentElement, cleanup);

      const marketingLabel = Array.from(
        form.querySelectorAll<HTMLLabelElement>("label"),
      ).find((label) => label.textContent?.includes("receive SIXFL launch updates"));
      hideElement(marketingLabel?.parentElement, cleanup);

      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitButton) {
        const original = submitButton.textContent;
        submitButton.textContent = "REGISTER YOUR TEAM";
        cleanup.push(() => {
          submitButton.textContent = original;
        });
      }

      const backLink = findExactTextElement<HTMLAnchorElement>(form, "a", "BACK TO HOME");
      hideElement(backLink, cleanup);
    }

    const typeLinks: Record<string, string> = {
      Team: "team",
      Player: "player",
      Referee: "referee",
    };

    for (const [label, type] of Object.entries(typeLinks)) {
      const link = findExactTextElement<HTMLAnchorElement>(main, "a", label);
      if (!link) continue;
      const original = link.getAttribute("href");
      link.setAttribute(
        "href",
        `/register-interest?type=${type}&area=Harrogate&night=Tuesday`,
      );
      cleanup.push(() => {
        if (original === null) link.removeAttribute("href");
        else link.setAttribute("href", original);
      });
    }

    return () => {
      cleanup.reverse().forEach((restore) => restore());
    };
  }, [pathname, query, searchParams]);

  return (
    <style jsx global>{`
      [data-harrogate-signup-card="true"] {
        isolation: isolate;
        background:
          radial-gradient(circle at 50% 42%, rgba(16, 185, 129, 0.12), transparent 45%),
          rgba(255, 255, 255, 0.05) !important;
      }

      [data-harrogate-signup-watermark="true"] {
        pointer-events: none;
        position: absolute;
        left: 50%;
        top: 50%;
        z-index: 0;
        width: min(500px, 70vw);
        height: auto;
        transform: translate(-50%, -50%);
        object-fit: contain;
        opacity: 0.28;
        filter: drop-shadow(0 24px 70px rgba(16, 185, 129, 0.22));
      }

      @media (max-width: 639px) {
        [data-harrogate-signup-watermark="true"] {
          width: 360px;
          opacity: 0.13;
        }
      }
    `}</style>
  );
}
