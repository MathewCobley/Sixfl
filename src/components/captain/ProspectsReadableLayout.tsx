// ========================================
// File: src/components/captain/ProspectsReadableLayout.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function applyReadableProspectLayout() {
  const main = document.querySelector("main");
  if (!main) return;

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
}

export default function ProspectsReadableLayout() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/prospects")) return;

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

    applyReadableProspectLayout();

    const observer = new MutationObserver(applyReadableProspectLayout);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", applyReadableProspectLayout);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyReadableProspectLayout);
      document.getElementById(styleId)?.remove();
    };
  }, [pathname]);

  return null;
}
