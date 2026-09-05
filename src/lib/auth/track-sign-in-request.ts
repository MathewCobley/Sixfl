import {
  markSignInLinkFailed,
  startSignInLinkActivity,
} from "@/lib/auth/sign-in-link-activity";
import { signInRequestContext } from "@/lib/auth/sign-in-request-context";

const FAILURE_MESSAGES: Record<string, string> = {
  AccessDenied: "The account or invitation did not pass the access check.",
  EmailSignin: "The sign-in email or verification token could not be prepared.",
  Configuration: "The sign-in service could not complete its configuration checks.",
  CSRF: "The browser security check failed. Reload the login page and try again.",
  HTTP_ERROR: "The authentication endpoint returned an unsuccessful response.",
  AUTH_ERROR: "The authentication request failed before completion.",
};

async function responseFailure(response: Response): Promise<string | null> {
  if (!response.ok && response.status >= 400) return "HTTP_ERROR";

  let destination = response.headers.get("location");
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body: unknown = await response.clone().json();
    if (body && typeof body === "object" && "url" in body && typeof body.url === "string") {
      destination = body.url;
    }
  }
  if (!destination) return null;

  const url = new URL(destination, "https://sixfl.invalid");
  if (url.searchParams.has("csrf")) return "CSRF";
  const error = url.searchParams.get("error");
  if (!error) return null;
  // NextAuth can put a thrown exception in this parameter. Never persist that
  // raw URL, exception text, credentials, cookies, or verification token.
  return Object.hasOwn(FAILURE_MESSAGES, error) ? error : "AUTH_ERROR";
}

export async function withTrackedSignInRequest(
  request: Request,
  handle: () => Promise<Response>,
): Promise<Response> {
  let email = "";
  try {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/api/auth/signin/email") {
      return handle();
    }
    const form = await request.clone().formData();
    const value = form.get("email");
    if (typeof value === "string") email = value.trim().toLowerCase();
  } catch {
    // Leave validation and CSRF enforcement to NextAuth. Tracking must not
    // change an authentication response or consume its original request body.
    return handle();
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return handle();
  }

  // Record before NextAuth's normalizer, adapter lookup, CSRF and access checks.
  // This is a request record, not evidence that an email was sent or verified.
  const activityId = await startSignInLinkActivity({ email, magicLinkUrl: "" });
  return signInRequestContext.run({ activityId, stage: "authentication" }, async () => {
    const recordFailure = async (code: string) => {
      const stage = signInRequestContext.getStore()?.stage ?? "authentication";
      await markSignInLinkFailed({
        activityId,
        error: new Error(`[${stage}] ${FAILURE_MESSAGES[code] ?? FAILURE_MESSAGES.AUTH_ERROR}`),
      });
      // Also leave a safe fallback when the database itself cannot record it.
      console.warn("SIXFL sign-in request failed", { activityId, email, stage, code });
    };

    let response: Response;
    try {
      response = await handle();
    } catch (error) {
      await recordFailure("AUTH_ERROR");
      throw error;
    }

    try {
      const failure = await responseFailure(response);
      if (failure) await recordFailure(failure);
    } catch {
      console.warn("Could not inspect sign-in response for activity tracking", { activityId });
    }
    return response;
  });
}
