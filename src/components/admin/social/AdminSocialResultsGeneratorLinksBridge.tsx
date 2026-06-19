// ========================================
// File: src/components/admin/social/AdminSocialResultsGeneratorLinksBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getFormValue(form: HTMLFormElement, name: string) {
  return form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value.trim() || "";
}

function buildResultsGeneratorHref(form: HTMLFormElement) {
  const leagueId = getFormValue(form, "leagueId");
  const fixtureDate = getFormValue(form, "fixtureDate");

  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", leagueId);
  if (fixtureDate) params.set("fixtureDate", fixtureDate);

  return `/admin/social/results${params.toString() ? `?${params.toString()}` : ""}`;
}

function getActionColumnFromCardIdInput(input: HTMLInputElement) {
  const form = input.closest("form");
  const parent = form?.parentElement;

  if (!form || !parent) return null;

  const className = typeof parent.className === "string" ? parent.className : "";
  if (!className.includes("flex")) return null;

  return { form, parent, cardId: input.value.trim() };
}

function getQueueRowFromActionColumn(actionColumn: HTMLElement) {
  let current: HTMLElement | null = actionColumn;

  while (current && current.parentElement && current.parentElement.tagName !== "MAIN") {
    const className = typeof current.className === "string" ? current.className : "";

    if (className.includes("grid") && className.includes("px-6") && className.includes("py-6")) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function enhanceResultsCardButtons() {
  const resultForms = Array.from(
    document.querySelectorAll<HTMLFormElement>('form input[name="postType"][value="RESULT"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => form instanceof HTMLFormElement);

  for (const form of resultForms) {
    const parent = form.parentElement;
    if (!parent) continue;

    if (!parent.querySelector("[data-visual-results-card-link]")) {
      const link = document.createElement("a");
      link.href = buildResultsGeneratorHref(form);
      link.textContent = "Open visual results card";
      link.dataset.visualResultsCardLink = "true";
      link.className =
        "inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-500/20";

      form.insertAdjacentElement("afterend", link);
    }

    form.style.display = "none";
    form.setAttribute("aria-hidden", "true");
  }
}

function hideOldResultsQueueCards() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("div, h2, h3")).filter((element) =>
    element.textContent?.trim().startsWith("Results card •"),
  );

  for (const heading of headings) {
    let row: HTMLElement | null = heading;

    while (row && row.parentElement && row.parentElement.tagName !== "MAIN") {
      const className = typeof row.className === "string" ? row.className : "";

      if (
        className.includes("grid") &&
        className.includes("px-6") &&
        className.includes("py-6")
      ) {
        row.style.display = "none";
        row.setAttribute("aria-hidden", "true");
        break;
      }

      row = row.parentElement;
    }
  }
}

function addResultsGeneratorIntro() {
  if (document.querySelector("[data-visual-results-generator-intro]")) return;

  const socialHeading = Array.from(document.querySelectorAll<HTMLElement>("h1")).find((heading) =>
    heading.textContent?.includes("Publish one match card per league night"),
  );

  const hero = socialHeading?.closest("div.rounded-3xl");
  if (!hero?.parentElement) return;

  const intro = document.createElement("div");
  intro.dataset.visualResultsGeneratorIntro = "true";
  intro.className =
    "rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.08] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]";
  intro.innerHTML = `
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">Visual results cards</p>
        <h2 class="mt-2 text-xl font-semibold tracking-tight text-white">Use the Canva-style results generator</h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-white/60">Use this for the new image-based match results card. The old results queue is hidden while we finish the visual card flow.</p>
      </div>
      <a href="/admin/social/results" class="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20">Open visual results generator</a>
    </div>
  `;

  hero.insertAdjacentElement("afterend", intro);
}

function addAiImageNotice(searchParams: URLSearchParams) {
  const aiImageStatus = searchParams.get("aiImage");
  if (!aiImageStatus || document.querySelector("[data-ai-image-notice]")) return;

  const queueHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find((heading) =>
    heading.textContent?.includes("Weekly social queue"),
  );
  const queueHeader = queueHeading?.closest("div.border-b");
  if (!queueHeader?.parentElement) return;

  const notice = document.createElement("div");
  notice.dataset.aiImageNotice = "true";
  notice.className =
    aiImageStatus === "generated"
      ? "mx-6 mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100 md:mx-8"
      : "mx-6 mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100 md:mx-8";
  notice.textContent =
    aiImageStatus === "generated"
      ? "AI image draft generated. Open the image from the queue below and review it before approving or publishing."
      : aiImageStatus === "missing-card"
        ? "Could not generate an AI image because the social card was not found."
        : "AI image generation failed. Check the card error message in the queue.";

  queueHeader.insertAdjacentElement("afterend", notice);
}

function addAiImageReviewPreviews() {
  const imageLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).filter(
    (link) => link.textContent?.trim() === "Open image" && link.href.includes("/api/social/ai-image/"),
  );

  for (const link of imageLinks) {
    const actionColumn = link.parentElement;
    const queueRow = actionColumn ? getQueueRowFromActionColumn(actionColumn) : null;
    if (!queueRow || queueRow.querySelector("[data-ai-image-preview]")) continue;

    const preview = document.createElement("a");
    preview.href = link.href;
    preview.target = "_blank";
    preview.rel = "noreferrer";
    preview.dataset.aiImagePreview = "true";
    preview.className =
      "block overflow-hidden rounded-2xl border border-emerald-400/20 bg-black/30 shadow-[0_16px_50px_rgba(0,0,0,0.28)]";
    preview.innerHTML = `<img src="${link.href}" alt="AI generated social image draft" class="aspect-square w-full max-w-[320px] object-cover" />`;

    actionColumn?.insertAdjacentElement("afterbegin", preview);
  }
}

function addAiImageButtons() {
  const cardInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('form input[name="cardId"]'),
  );

  const seenColumns = new Set<HTMLElement>();

  for (const input of cardInputs) {
    const details = getActionColumnFromCardIdInput(input);
    if (!details || !details.cardId || seenColumns.has(details.parent)) continue;

    seenColumns.add(details.parent);

    if (details.parent.querySelector("[data-ai-image-form]")) continue;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/admin/social/ai-image/generate";
    form.dataset.aiImageForm = "true";
    form.innerHTML = `
      <input type="hidden" name="cardId" value="${details.cardId}" />
      <button type="submit" data-ai-image-button="true" class="inline-flex h-10 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 text-xs font-semibold text-violet-100 transition hover:border-violet-300/35 hover:bg-violet-500/15">
        Generate AI image
      </button>
      <p data-ai-image-status="true" class="hidden max-w-[16rem] text-xs leading-5 text-violet-100/75">Generating can take 20-60 seconds. Please leave this tab open.</p>
    `;

    details.parent.insertAdjacentElement("afterbegin", form);
  }
}

function cleanSocialPage(searchParams: URLSearchParams) {
  addResultsGeneratorIntro();
  addAiImageNotice(searchParams);
  enhanceResultsCardButtons();
  hideOldResultsQueueCards();
  addAiImageButtons();
  addAiImageReviewPreviews();
}

function handleAiImageSubmit(event: SubmitEvent) {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) return;
  if (!form.dataset.aiImageForm) return;

  event.preventDefault();

  const button = form.querySelector<HTMLButtonElement>("[data-ai-image-button]");
  const status = form.querySelector<HTMLElement>("[data-ai-image-status]");

  if (button?.disabled) return;

  if (button) {
    button.disabled = true;
    button.textContent = "Generating image...";
    button.className =
      "inline-flex h-10 items-center justify-center rounded-xl border border-violet-300/30 bg-violet-500/20 px-3 text-xs font-semibold text-violet-50 opacity-80";
  }

  if (status) {
    status.classList.remove("hidden");
    status.textContent = "Generating can take 20-60 seconds. Please leave this tab open.";
  }

  fetch(form.action, {
    method: "POST",
    body: new FormData(form),
    credentials: "same-origin",
  })
    .then((response) => {
      window.location.href = response.url || "/admin/social?aiImage=generated";
    })
    .catch(() => {
      if (button) {
        button.disabled = false;
        button.textContent = "Try AI image again";
        button.className =
          "inline-flex h-10 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 transition hover:border-rose-300/35 hover:bg-rose-500/15";
      }

      if (status) {
        status.classList.remove("hidden");
        status.textContent = "The request did not start or the connection dropped. Try again, then check Railway logs if it still fails.";
      }
    });
}

export default function AdminSocialResultsGeneratorLinksBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/social") return;

    const params = new URLSearchParams(window.location.search);

    cleanSocialPage(params);
    document.addEventListener("submit", handleAiImageSubmit, true);

    const observer = new MutationObserver(() => cleanSocialPage(params));

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      document.removeEventListener("submit", handleAiImageSubmit, true);
    };
  }, [pathname]);

  return null;
}
