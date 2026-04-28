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

function getElementClasses(element: HTMLElement | null) {
  return typeof element?.className === "string" ? element.className : "";
}

function findPendingProspectCard(start: HTMLElement) {
  let current: HTMLElement | null = start;

  while (current && current.tagName !== "MAIN") {
    const classes = getElementClasses(current);

    if (
      classes.includes("rounded-2xl") &&
      classes.includes("border-white/10") &&
      current.querySelector('input[name="prospectId"]')
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function findNameElement(card: HTMLElement) {
  return Array.from(card.querySelectorAll<HTMLElement>("div")).find((element) => {
    const classes = getElementClasses(element);
    const text = element.textContent?.trim() ?? "";

    return (
      element.children.length === 0 &&
      text.length > 0 &&
      classes.includes("text-base") &&
      classes.includes("font-semibold")
    );
  });
}

function findContactElement(card: HTMLElement) {
  return Array.from(card.querySelectorAll<HTMLElement>("div")).find((element) => {
    const classes = getElementClasses(element);
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";

    return (
      element.children.length === 0 &&
      classes.includes("text-sm") &&
      classes.includes("text-white/70") &&
      (text.includes("@") || text.includes("·") || text.toLowerCase().includes("no email"))
    );
  });
}

function getPendingProspectValues(card: HTMLElement) {
  const nameElement = findNameElement(card);
  const contactElement = findContactElement(card);
  const fullName = nameElement?.textContent?.trim() ?? "";
  const nameParts = fullName && fullName !== "Unnamed prospect" ? fullName.split(/\s+/) : [];
  const contactText = contactElement?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const contactParts = contactText.split("·").map((part) => part.trim());
  const email = contactParts[0] && !contactParts[0].toLowerCase().includes("no email")
    ? contactParts[0]
    : "";

  return {
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" "),
    email,
    phone: contactParts[1] ?? "",
  };
}

function buildField(input: {
  label: string;
  name: string;
  value: string;
  type?: string;
}) {
  const label = document.createElement("label");
  label.className = "space-y-2 text-sm text-white/65";

  const span = document.createElement("span");
  span.textContent = input.label;

  const field = document.createElement("input");
  field.name = input.name;
  field.type = input.type ?? "text";
  field.value = input.value;
  field.className =
    "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none transition focus:border-amber-400/60";

  label.append(span, field);
  return label;
}

function openInlinePendingProspectEditor(input: {
  card: HTMLElement;
  pathname: string;
  prospectId: string;
}) {
  const existingEditor = input.card.querySelector<HTMLElement>(
    `[data-pending-prospect-editor="${input.prospectId}"]`,
  );

  if (existingEditor) {
    existingEditor.scrollIntoView({ block: "nearest" });
    return;
  }

  const values = getPendingProspectValues(input.card);
  const editor = document.createElement("form");
  editor.dataset.pendingProspectEditor = input.prospectId;
  editor.className =
    "mt-4 w-full rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 xl:col-span-2";

  const heading = document.createElement("div");
  heading.className = "mb-4";

  const title = document.createElement("p");
  title.className = "text-sm font-semibold text-amber-50";
  title.textContent = "Edit this player";

  const help = document.createElement("p");
  help.className = "mt-1 text-xs text-amber-100/70";
  help.textContent = "Update the pending player details without leaving the squad page.";

  heading.append(title, help);

  const grid = document.createElement("div");
  grid.className = "grid gap-4 sm:grid-cols-2";
  grid.append(
    buildField({ label: "First name", name: "firstName", value: values.firstName }),
    buildField({ label: "Last name", name: "lastName", value: values.lastName }),
    buildField({ label: "Email", name: "email", type: "email", value: values.email }),
    buildField({ label: "Phone", name: "phone", value: values.phone }),
  );

  const message = document.createElement("p");
  message.className = "mt-3 hidden rounded-xl border px-3 py-2 text-sm";

  const actions = document.createElement("div");
  actions.className = "mt-4 flex flex-wrap gap-3";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className =
    "inline-flex items-center rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60";
  saveButton.textContent = "Save details";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className =
    "inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/5 hover:text-white";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () => editor.remove());

  actions.append(saveButton, cancelButton);
  editor.append(heading, grid, message, actions);

  editor.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(editor);
    const payload = {
      prospectId: input.prospectId,
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
    };

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    message.className = "mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70";
    message.textContent = "Saving player details...";

    try {
      const response = await fetch(`${input.pathname}/prospect-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "Could not save player details.");
      }

      window.location.assign(`${input.pathname}?saved=details-updated#pending-activation`);
    } catch (error) {
      saveButton.disabled = false;
      saveButton.textContent = "Save details";
      message.className = "mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100";
      message.textContent = error instanceof Error ? error.message : "Could not save player details.";
    }
  });

  input.card.appendChild(editor);
  editor.scrollIntoView({ block: "nearest" });
}

function applyPendingSquadEditButtons(pathname: string) {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("main a"))
    .filter((link) => {
      const label = link.textContent?.trim();
      const href = link.getAttribute("href") ?? "";

      return (label === "Open prospect" || label === "Edit details") && href.includes("/prospects");
    });

  for (const link of links) {
    link.textContent = "Edit details";
    link.className =
      "inline-flex items-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15";
  }

  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement) || main.dataset.pendingProspectEditHandler === "true") {
    return;
  }

  main.dataset.pendingProspectEditHandler = "true";
  main.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest<HTMLAnchorElement>("a");
    if (!link) return;

    const label = link.textContent?.trim();
    const href = link.getAttribute("href") ?? "";
    if (label !== "Edit details" || !href.includes("/prospects")) return;

    const card = findPendingProspectCard(link);
    const prospectId = card
      ?.querySelector<HTMLInputElement>('input[name="prospectId"]')
      ?.value.trim();

    if (!card || !prospectId) return;

    event.preventDefault();
    openInlinePendingProspectEditor({
      card,
      pathname,
      prospectId,
    });
  });
}

export default function ProspectsReadableLayout() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.endsWith("/squad")) {
      applyPendingSquadEditButtons(pathname);
      return;
    }

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
