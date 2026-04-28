// ========================================
// File: src/components/captain/ProspectsReadableLayout.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getClassName(element: HTMLElement) {
  return typeof element.className === "string" ? element.className : "";
}

function findProspectCard(form: HTMLFormElement, main: HTMLElement) {
  let current = form.parentElement;

  while (current && current !== main) {
    const className = getClassName(current);

    if (
      className.includes("space-y-5") &&
      className.includes("px-6") &&
      className.includes("py-5")
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return form.parentElement instanceof HTMLElement ? form.parentElement : null;
}

function scrollToSelectedProspect() {
  if (!window.location.hash.startsWith("#prospect-")) return;

  const targetId = decodeURIComponent(window.location.hash.slice(1));
  const target = document.getElementById(targetId);

  if (target instanceof HTMLElement) {
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
    });
  }
}

function applyReadableProspectLayout() {
  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement)) return;

  const prospectsSection = Array.from(main.querySelectorAll("section")).find(
    (section) => section.textContent?.includes("Current prospects"),
  );

  if (prospectsSection instanceof HTMLElement) {
    prospectsSection.style.gridTemplateColumns = "minmax(0, 1fr)";
  }

  const detailForms = Array.from(
    main.querySelectorAll<HTMLInputElement>('form input[name="prospectId"]'),
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

    if (prospectId) {
      const card = findProspectCard(form, main);

      if (card) {
        card.id = `prospect-${prospectId}`;
        card.style.scrollMarginTop = "2rem";
      }
    }

    const actionGrid = form.parentElement;
    if (actionGrid instanceof HTMLElement) {
      actionGrid.style.display = "grid";
      actionGrid.style.gridTemplateColumns = "minmax(0, 1fr)";
      actionGrid.style.gap = "1rem";
      actionGrid.style.width = "100%";
    }

    form.style.width = "100%";
    form.style.minWidth = "0";

    const fieldRows = Array.from(form.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.querySelector("input") !== null,
    );

    for (const row of fieldRows) {
      row.style.display = "grid";
      row.style.gridTemplateColumns =
        window.innerWidth < 760 ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))";
      row.style.gap = "1rem";
      row.style.width = "100%";
    }

    const fields = form.querySelectorAll<HTMLElement>("input, textarea");
    for (const field of fields) {
      field.style.width = "100%";
      field.style.minWidth = "0";
      field.style.boxSizing = "border-box";
    }

    const labels = form.querySelectorAll<HTMLElement>("label");
    for (const label of labels) {
      label.style.display = "block";
      label.style.minWidth = "0";
    }
  }

  scrollToSelectedProspect();
}

function applyPendingSquadProspectEditLinks(pathname: string) {
  if (!pathname.endsWith("/squad")) return;

  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement)) return;

  const prospectsPath = pathname.replace(/\/squad$/, "/prospects");
  const openProspectLinks = Array.from(main.querySelectorAll<HTMLAnchorElement>("a"))
    .filter((link) => link.textContent?.trim() === "Open prospect")
    .filter((link) => link.getAttribute("href")?.includes("/prospects"));

  for (const link of openProspectLinks) {
    const prospectId = link.parentElement
      ?.querySelector<HTMLInputElement>('input[name="prospectId"]')
      ?.value.trim();

    if (!prospectId) continue;

    link.href = `${prospectsPath}#prospect-${encodeURIComponent(prospectId)}`;
    link.textContent = "Edit details";
    link.dataset.pendingProspectEditLink = prospectId;
    link.setAttribute("aria-label", "Edit player details");
    link.className =
      "inline-flex items-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15";
  }
}

export default function ProspectsReadableLayout() {
  const pathname = usePathname();

  useEffect(() => {
    const shouldHandleProspects = pathname.endsWith("/prospects");
    const shouldHandleSquad = pathname.endsWith("/squad");

    if (!shouldHandleProspects && !shouldHandleSquad) return;

    const styleId = "sixfl-prospects-readable-layout";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        main section[class*="lg:grid-cols-"] {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        main form:has(input[name="prospectId"]):has(input[name="firstName"]) {
          width: 100% !important;
          min-width: 0 !important;
        }

        main form:has(input[name="prospectId"]):has(input[name="firstName"]) input,
        main form:has(input[name="prospectId"]):has(input[name="firstName"]) textarea {
          width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }

        main form:has(input[name="prospectId"]):has(input[name="firstName"]) > div:has(input) {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 1rem !important;
          width: 100% !important;
        }

        main form:has(input[name="prospectId"]):has(input[name="firstName"]) > div:has(input) > div,
        main form:has(input[name="prospectId"]):has(input[name="firstName"]) label {
          min-width: 0 !important;
        }

        @media (max-width: 760px) {
          main form:has(input[name="prospectId"]):has(input[name="firstName"]) > div:has(input) {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `;

      document.head.appendChild(style);
    }

    const applyPageEnhancements = () => {
      if (shouldHandleProspects) {
        applyReadableProspectLayout();
      }

      if (shouldHandleSquad) {
        applyPendingSquadProspectEditLinks(pathname);
      }
    };

    applyPageEnhancements();

    const observer = new MutationObserver(applyPageEnhancements);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", applyPageEnhancements);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyPageEnhancements);
      document.getElementById(styleId)?.remove();
    };
  }, [pathname]);

  return null;
}
