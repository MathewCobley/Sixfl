"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import {
  COLLECTION_SAVE_UNCONFIRMED,
  collectionFeedbackFromRedirect,
  type CollectionFeedback,
} from "@/lib/payments/squad-collection-form";
import { createCaptainSquadPaymentCollectionAction } from "./actions";

/** Presentation adapter, not a second writer. All auth, limits and money rules
 * stay in the existing canonical action, including production preparation. */
export async function saveCaptainSquadPaymentCollectionWithFeedback(data: FormData): Promise<CollectionFeedback> {
  const teamId = String(data.get("teamId") ?? "").trim();
  const fixtureId = String(data.get("fixtureId") ?? "").trim();
  try {
    await createCaptainSquadPaymentCollectionAction(data);
  } catch (error) {
    if (isRedirectError(error)) {
      const target = getURLFromRedirectError(error);
      const feedback = target ? collectionFeedbackFromRedirect(target, teamId, fixtureId) : null;
      if (feedback) return feedback;
      // Do not turn sign-in, permission or unrelated framework redirects into success.
      throw error;
    }
    // Some rows may have been written before a setup/queue/database failure.
    // Never label this "not saved" or automatically repeat a financial request.
    console.error("[squad-collection-save] acknowledgement unavailable", { teamId, fixtureId });
  }
  return { status: "unconfirmed", message: COLLECTION_SAVE_UNCONFIRMED };
}
