/** Shared form validation only. This module never changes fees, receipts or credit. */
export type CollectionFeedback = {
  status: "saved" | "error" | "unconfirmed";
  message: string;
  field?: string;
};

export function parseSquadCollectionAmount(value: string, allowZero = false): number | null {
  const raw = value.trim().replace(/^£\s*/, "");
  // Accept correctly grouped UK currency, but never turn "5,50" or "5 50"
  // into £550 by silently deleting misplaced separators from a text input.
  const cleaned = /^\d{1,3}(?:,\d{3})+(?:\.\d{0,2})?$/.test(raw)
    ? raw.replaceAll(",", "")
    : raw;
  // Empty is not zero. Reject partial pence rather than silently rounding a share.
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(cleaned)) return null;
  const pence = Math.round(Number(cleaned) * 100);
  if (!Number.isSafeInteger(pence) || pence > 2147483647 || pence < 0) return null;
  return pence === 0 && !allowZero ? null : pence;
}

export function getInitialCollectionDefaultPence(
  fees: ReadonlyArray<{ status: string; amountPence: number }>,
): number {
  // A waived/no-charge row must not give the form an invalid £0 default.
  return fees.find((fee) => fee.status === "OPEN" && fee.amountPence > 0)?.amountPence ?? 400;
}

export function validateSquadCollectionAmounts(formData: FormData): {
  code: "invalid_amount" | "invalid_player_amount";
  field: string;
} | null {
  const players = formData.getAll("player").map(String).filter((value) => /^(member|prospect):.+$/.test(value));
  for (const player of players) {
    const [kind, id] = player.split(":");
    const field = `amount_${kind}_${id}`;
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) {
      if (parseSquadCollectionAmount(String(formData.get("amount") ?? "")) === null) {
        return { code: "invalid_amount", field: "amount" };
      }
    } else if (parseSquadCollectionAmount(raw, true) === null) {
      return { code: "invalid_player_amount", field };
    }
  }
  return null;
}

export function collectionErrorMessage(code: string): string | null {
  const messages: Record<string, string> = {
    missing_fixture: "Choose a fixture first.",
    invalid_amount: "Enter a positive default amount, or enter an individual amount for every selected player.",
    invalid_player_amount: "Check the selected player amounts. Use pounds and pence, with no negative amounts or fractions of a penny.",
    no_players: "Select at least one editable player. Protected player balances are managed through Player account.",
    squad_emails_incomplete: "An active squad member is missing an email address. Add the email or mark a historic player inactive, then try again.",
    missing_player_email: "A selected player is missing an email address for their payment link. Add the email before saving.",
    fixture_not_found: "That fixture could not be found for this team.",
    fixture_not_payable: "Player links cannot be created for an unpublished, postponed or cancelled fixture.",
    no_team_fee: "SIXFL has not set a positive fee for this team on this fixture. Ask SIXFL to review it.",
    no_team_charge: "This fixture has no active team charge. Ask SIXFL to review it before creating player links.",
    charge_covered: "This fixture charge is already fully covered, so no new player links can be created.",
    allocation_exceeds_fee: "The player amounts exceed the permitted collection for this fixture. Review the amounts and existing payments before saving.",
  };
  return messages[code] ?? null;
}

export const COLLECTION_SAVE_UNCONFIRMED = "Save could not be confirmed. Your entries are still on this page. Open the saved collection in a new tab and check it before trying again; do not assume nothing was saved.";

/** Translate only this form's known result redirects, never sign-in or access redirects. */
export function collectionFeedbackFromRedirect(target: string, teamId: string, fixtureId: string): CollectionFeedback | null {
  if (!teamId || !fixtureId) return null;
  const base = "https://sixfl.invalid";
  const url = new URL(target, base);
  if (url.origin !== base || url.pathname !== `/captain/team/${teamId}/player-payments` || url.searchParams.get("fixtureId") !== fixtureId) return null;
  const error = url.searchParams.get("error");
  if (error) {
    const message = collectionErrorMessage(error);
    return message ? { status: "error", message } : null;
  }
  if (url.searchParams.get("saved") !== "collection_created") return null;
  const count = Number(url.searchParams.get("emailsQueued") ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) return null;
  return {
    status: "saved",
    message: count > 0
      ? `Player collection saved. ${count} payment link email${count === 1 ? "" : "s"} queued — not yet confirmed delivered.`
      : "Player collection saved. No new payment-link email was queued. Check the player payment status below before resending a link.",
  };
}
