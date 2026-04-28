// ========================================
// File: src/components/admin/fixtures/FixtureChangeNotificationSubmitBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function isFixtureUpdateForm(form: HTMLFormElement) {
  if (!form.querySelector('input[name="fixtureId"]')) return false;
  if (!form.querySelector('[name="leagueId"]')) return false;
  if (!form.querySelector('[name="homeTeamId"]')) return false;
  if (!form.querySelector('[name="awayTeamId"]')) return false;
  if (!form.querySelector('[name="kickoffDate"]')) return false;
  if (!form.querySelector('[name="kickoffTime"]')) return false;

  // Result forms also carry a fixture id but should not trigger fixture-change notices.
  if (form.querySelector('[name="homeScore"]')) return false;
  if (form.querySelector('[name="awayScore"]')) return false;

  return true;
}

export default function FixtureChangeNotificationSubmitBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/admin/fixtures")) return;

    async function handleSubmit(event: SubmitEvent) {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) return;
      if (!isFixtureUpdateForm(form)) return;
      if (form.dataset.fixtureChangeNoticeChecked === "true") return;

      event.preventDefault();

      const submitter = event.submitter instanceof HTMLElement ? event.submitter : undefined;
      const formData = new FormData(form);

      try {
        await fetch("/api/admin/fixtures/change-notice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fixtureId: getString(formData, "fixtureId"),
            leagueId: getString(formData, "leagueId"),
            homeTeamId: getString(formData, "homeTeamId"),
            awayTeamId: getString(formData, "awayTeamId"),
            venueId: getString(formData, "venueId"),
            refereeId: getString(formData, "refereeId"),
            kickoffDate: getString(formData, "kickoffDate"),
            kickoffTime: getString(formData, "kickoffTime"),
            status: getString(formData, "status"),
            pitch: getString(formData, "pitch"),
          }),
          keepalive: true,
        });
      } catch (error) {
        // The fixture update itself should still continue if the notification pre-check fails.
        console.error("Failed to queue fixture change notice", error);
      }

      form.dataset.fixtureChangeNoticeChecked = "true";

      if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
        form.requestSubmit(submitter);
      } else {
        form.requestSubmit();
      }
    }

    document.addEventListener("submit", handleSubmit, true);

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, [pathname]);

  return null;
}
