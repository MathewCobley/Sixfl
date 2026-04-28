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

function getPendingProspectCard(link: HTMLAnchorElement) {
  const actionsContainer = link.parentElement;
  const card = actionsContainer?.parentElement;

  return card instanceof HTMLElement ? card : null;
}

function parsePendingProspectValues(card: HTMLElement) {
  const divs = Array.from(card.querySelectorAll<HTMLElement>("div"));
  const nameElement = divs.find((element) => {
    const className = getClassName(element);
    const text = element.textContent?.trim() ?? "";

    return (
      element.children.length === 0 &&
      className.includes("text-base") &&
      className.includes("font-semibold") &&
      text.length > 0
    );
  });
  const contactElement = divs.find((element) => {
    const className = getClassName(element);
    const text = element.textContent?.trim() ?? "";

    return (
      element.children.length === 0 &&
      className.includes("text-sm") &&
      className.includes("text-white/70") &&
      text.length > 0
    );
  });

  const name = nameElement?.textContent?.trim() ?? "";
  const [firstName = "", ...lastNameParts] = name === "Unnamed prospect" ? [] : name.split(/\s+/);
  const contactText = contactElement?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const contactParts = contactText.split("·").map((part) => part.trim());
  const email = contactParts[0] && !contactParts[0].toLowerCase().includes("no email")
    ? contactParts[0]
    : "";
  const phone = contactParts[1] ?? "";

  return {
    firstName,
    lastName: lastNameParts.join(" "),
    email,
    phone,
  };
}

function createEditField(input: {
  label: string;
  name: string;
  value: string;
  type?: string;
}) {
  const wrapper = document.createElement("label");
  wrapper.className = "block space-y-2 text-sm text-white/65";

  const labelText = document.createElement("span");
  labelText.textContent = input.label;

  const field = document.createElement("input");
  field.name = input.name;
  field.type = input.type ?? "text";
  field.value = input.value;
  field.className =
    "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none transition placeholder:text-white/25 focus:border-amber-400/60";

  wrapper.append(labelText, field);
  return wrapper;
}

function openPendingProspectEditor(input: {
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

  const values = parsePendingProspectValues(input.card);
  const editor = document.createElement("form");
  editor.dataset.pendingProspectEditor = input.prospectId;
  editor.className =
    "mt-4 w-full rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 xl:col-span-2";

  const heading = document.createElement("div");
  heading.className = "mb-4";

  const eyebrow = document.createElement("p");
  eyebrow.className = "text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70";
  eyebrow.textContent = "Edit player details";

  const description = document.createElement("p");
  description.className = "mt-1 text-sm text-amber-50/75";
  description.textContent = "Update this pending player without leaving the squad page.";

  heading.append(eyebrow, description);

  const grid = document.createElement("div");
  grid.className = "grid gap-4 sm:grid-cols-2";
  grid.append(
    createEditField({ label: "First name", name: "firstName", value: values.firstName }),
    createEditField({ label: "Last name", name: "lastName", value: values.lastName }),
    createEditField({ label: "Email", name: "email", type: "email", value: values.email }),
    createEditField({ label: "Phone", name: "phone", value: values.phone }),
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "Could not save player details.");
      }

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("saved", "details-updated");
      nextUrl.hash = "pending-activation";
      window.location.assign(nextUrl.toString());
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

function applyPendingSquadProspectEditLinks(pathname: string) {
  if (!pathname.endsWith("/squad")) return;

  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement)) return;

  const prospectLinks = Array.from(main.querySelectorAll<HTMLAnchorElement>("a"))
    .filter((link) => {
      const label = link.textContent?.trim();
      return label === "Open prospect" || link.dataset.pendingProspectEditLink;
    })
    .filter((link) =>
      Boolean(link.dataset.pendingProspectEditLink) ||
      Boolean(link.getAttribute("href")?.includes("/prospects")),
    );

  for (const link of prospectLinks) {
    const prospectId = link.parentElement
      ?.querySelector<HTMLInputElement>('input[name="prospectId"]')
      ?.value.trim();

    if (!prospectId) continue;

    link.href = "#";
    link.textContent = "Edit details";
    link.dataset.pendingProspectEditLink = prospectId;
    link.setAttribute("aria-label", "Edit player details");
    link.className =
      "inline-flex items-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15";

    if (link.dataset.pendingProspectEditBound === "true") continue;

    link.dataset.pendingProspectEditBound = "true";
    link.addEventListener("click", (event) => {
      event.preventDefault();

      const card = getPendingProspectCard(link);
      if (!card) return;

      openPendingProspectEditor({
        card,
        pathname,
        prospectId,
      });
    });
  }
}

export default function ProspectsReadableLayout() {
  const pathname = usePathname();

  useEffect(() => {
    const shouldHandleProspects = pathname.endsWith("/prospects");
    const shouldHandleSquad = pathname.endsWith("/squad");

    if (!shouldHandleProspects && !shouldHandleSquad) return;

    const styleId = "sixfl-prospects-readable-layout";

    if (shouldHandleProspects && !document.getElementById(styleId)) {
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

      if (shouldHandleProspects) {
        document.getElementById(styleId)?.remove();
      }
    };
  }, [pathname]);

  return null;
}
