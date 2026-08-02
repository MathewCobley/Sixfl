"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type CreationDetail = {
  method: string;
  createdBy: string;
  detail: string | null;
  sourceRecordHref: string | null;
  inferred: boolean;
};

type CreationDetailsResponse = {
  details?: Record<string, CreationDetail>;
};

function getTeamIdFromPathname(pathname: string) {
  return pathname.match(/^\/captain\/team\/([^/]+)\/squad\/?$/)?.[1] ?? null;
}

function findAddedLine(row: HTMLElement) {
  return Array.from(row.querySelectorAll<HTMLElement>("div")).find((element) => {
    const text = element.textContent?.trim() ?? "";
    return element.children.length === 0 && text.startsWith("Added ");
  }) ?? null;
}

function createLabelValue(label: string, value: string) {
  const line = document.createElement("div");

  const labelElement = document.createElement("span");
  labelElement.className = "text-white/45";
  labelElement.textContent = `${label}: `;

  const valueElement = document.createElement("span");
  valueElement.textContent = value;

  line.append(labelElement, valueElement);
  return line;
}

function addCreationPanel(input: {
  membershipId: string;
  detail: CreationDetail;
  row: HTMLElement;
}) {
  if (
    input.row.querySelector(
      `[data-managed-squad-creation-details="${CSS.escape(input.membershipId)}"]`,
    )
  ) {
    return;
  }

  const addedLine = findAddedLine(input.row);
  if (!addedLine) return;

  const panel = document.createElement("div");
  panel.dataset.managedSquadCreationDetails = input.membershipId;
  panel.className =
    "mt-3 rounded-xl border border-sky-400/25 bg-sky-500/[0.08] px-3 py-2.5 text-xs leading-5 text-sky-50/85";

  const heading = document.createElement("div");
  heading.className = "font-semibold text-sky-100";
  heading.textContent = "How this player was added";
  panel.appendChild(heading);

  const method = createLabelValue("Method", input.detail.method);
  method.classList.add("mt-1");
  panel.appendChild(method);
  panel.appendChild(createLabelValue("Created by", input.detail.createdBy));

  if (input.detail.detail) {
    const extra = document.createElement("div");
    extra.className = "mt-1 text-white/55";
    extra.textContent = input.detail.detail;
    panel.appendChild(extra);
  }

  if (input.detail.sourceRecordHref) {
    const sourceLink = document.createElement("a");
    sourceLink.href = input.detail.sourceRecordHref;
    sourceLink.className =
      "mt-1 inline-flex font-semibold text-sky-200 underline decoration-sky-400/40 underline-offset-4 hover:text-sky-100";
    sourceLink.textContent = "Open source record";
    panel.appendChild(sourceLink);
  }

  addedLine.insertAdjacentElement("afterend", panel);
}

function applyCreationDetails(details: Record<string, CreationDetail>) {
  const roleForms = Array.from(
    document.querySelectorAll<HTMLFormElement>('main form input[name="membershipId"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => form instanceof HTMLFormElement)
    .filter(
      (form) =>
        Boolean(form.querySelector('input[name="teamid"]')) &&
        Boolean(form.querySelector('[name="role"]')),
    );

  for (const form of roleForms) {
    const membershipId = form
      .querySelector<HTMLInputElement>('input[name="membershipId"]')
      ?.value.trim();
    if (!membershipId) continue;

    const detail = details[membershipId];
    if (!detail) continue;

    const actionsContainer = form.parentElement;
    if (!(actionsContainer instanceof HTMLElement)) continue;

    const row =
      actionsContainer.closest<HTMLElement>("div[class*='px-6'][class*='py-5']") ??
      actionsContainer.closest<HTMLElement>("div[class*='flex']");
    if (!row) continue;

    addCreationPanel({ membershipId, detail, row });
  }
}

export default function ManagedSquadCreationDetailsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamIdFromPathname(pathname);
    if (!teamId) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    fetch(
      `/api/captain/team/${encodeURIComponent(teamId)}/squad-creation-details`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | CreationDetailsResponse
          | null;
        if (!response.ok) return {};
        return payload?.details ?? {};
      })
      .then((details) => {
        if (cancelled) return;

        const apply = () => applyCreationDetails(details);
        apply();

        observer = new MutationObserver(apply);
        observer.observe(document.body, { childList: true, subtree: true });
      })
      .catch(() => {
        // The squad page remains usable if provenance details cannot be loaded.
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}
