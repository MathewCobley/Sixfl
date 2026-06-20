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

function getCardIdFromImageHref(href: string) {
  const match = href.match(/\/api\/social\/(?:ai-image|match-card)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function getFixtureGraphicHref(cardId: string, background = "emerald") {
  return `/api/social/match-card/${encodeURIComponent(cardId)}?background=${encodeURIComponent(background)}`;
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
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">Accurate fixture graphics</p>
        <h2 class="mt-2 text-xl font-semibold tracking-tight text-white">Use SIXFL-rendered cards, not AI text images</h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-white/60">OpenAI image generation has been removed from this page. Fixture graphics now use real fixture data, exact team names, exact kick-off times and controlled SIXFL layout.</p>
      </div>
      <a href="/admin/social/results" class="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20">Open visual results generator</a>
    </div>
  `;

  hero.insertAdjacentElement("afterend", intro);
}

function addFixtureGraphicNotice(searchParams: URLSearchParams) {
  const status = searchParams.get("fixtureGraphic");
  if (!status || document.querySelector("[data-fixture-graphic-notice]")) return;

  const queueHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find((heading) =>
    heading.textContent?.includes("Weekly social queue"),
  );
  const queueHeader = queueHeading?.closest("div.border-b");
  if (!queueHeader?.parentElement) return;

  const notice = document.createElement("div");
  notice.dataset.fixtureGraphicNotice = "true";
  notice.className =
    status === "selected"
      ? "mx-6 mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100 md:mx-8"
      : "mx-6 mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100 md:mx-8";
  notice.textContent =
    status === "selected"
      ? "Accurate SIXFL fixture graphic selected. Open the image below to review it before approving or publishing."
      : "Could not select the fixture graphic for that card.";

  queueHeader.insertAdjacentElement("afterend", notice);
}

function removeOpenAiUi() {
  document.querySelectorAll<HTMLElement>("[data-ai-image-form], [data-ai-image-preview], [data-ai-image-notice]").forEach((element) => {
    element.remove();
  });

  Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    const cardId = getCardIdFromImageHref(href);

    if (!cardId) return;

    link.href = getFixtureGraphicHref(cardId);
    if (link.textContent?.trim() === "Open image") {
      link.textContent = "Open fixture graphic";
    }
  });
}

function addFixtureGraphicControls() {
  const cardInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('form input[name="cardId"]'),
  );

  const seenColumns = new Set<HTMLElement>();

  for (const input of cardInputs) {
    const details = getActionColumnFromCardIdInput(input);
    if (!details || !details.cardId || seenColumns.has(details.parent)) continue;

    seenColumns.add(details.parent);

    if (details.parent.querySelector("[data-fixture-graphic-controls]")) continue;

    const controls = document.createElement("div");
    controls.dataset.fixtureGraphicControls = "true";
    controls.className =
      "w-full rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-3 text-xs text-emerald-50/80";
    controls.innerHTML = `
      <div class="font-semibold text-emerald-50">Fixture graphic</div>
      <p class="mt-1 leading-5 text-emerald-50/60">Uses exact SIXFL fixture data. Choose this instead of AI-generated image text.</p>
      <form method="POST" action="/admin/social/fixture-graphic/use" class="mt-3 grid gap-2">
        <input type="hidden" name="cardId" value="${details.cardId}" />
        <input type="hidden" name="background" value="emerald" />
        <button type="submit" class="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-50 transition hover:border-emerald-300/35 hover:bg-emerald-500/20">
          Use accurate fixture graphic
        </button>
      </form>
      <a href="${getFixtureGraphicHref(details.cardId)}" target="_blank" rel="noreferrer" class="mt-2 inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]">
        Preview fixture graphic
      </a>
    `;

    details.parent.insertAdjacentElement("afterbegin", controls);
  }
}

function addFixtureGraphicReviewPreviews() {
  const imageLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).filter(
    (link) => link.textContent?.trim() === "Open fixture graphic" && link.href.includes("/api/social/match-card/"),
  );

  for (const link of imageLinks) {
    const actionColumn = link.parentElement;
    const queueRow = actionColumn ? getQueueRowFromActionColumn(actionColumn) : null;
    if (!queueRow || queueRow.querySelector("[data-fixture-graphic-preview]")) continue;

    const preview = document.createElement("a");
    preview.href = link.href;
    preview.target = "_blank";
    preview.rel = "noreferrer";
    preview.dataset.fixtureGraphicPreview = "true";
    preview.className =
      "block overflow-hidden rounded-2xl border border-emerald-400/20 bg-black/30 shadow-[0_16px_50px_rgba(0,0,0,0.28)]";
    preview.innerHTML = `<img src="${link.href}" alt="SIXFL fixture graphic draft" class="aspect-[4/5] w-full max-w-[320px] object-cover" />`;

    actionColumn?.insertAdjacentElement("afterbegin", preview);
  }
}

function cleanSocialPage(searchParams: URLSearchParams) {
  addResultsGeneratorIntro();
  addFixtureGraphicNotice(searchParams);
  enhanceResultsCardButtons();
  hideOldResultsQueueCards();
  removeOpenAiUi();
  addFixtureGraphicControls();
  addFixtureGraphicReviewPreviews();
}

export default function AdminSocialResultsGeneratorLinksBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/social") return;

    const params = new URLSearchParams(window.location.search);

    cleanSocialPage(params);

    const observer = new MutationObserver(() => cleanSocialPage(params));

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
