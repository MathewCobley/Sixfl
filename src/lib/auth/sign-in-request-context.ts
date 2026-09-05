import { AsyncLocalStorage } from "node:async_hooks";

export type SignInRequestStage =
  | "authentication"
  | "account checks"
  | "email preparation"
  | "email delivery"
  | "verification token";

export type SignInRequestContext = {
  activityId: string | null;
  stage: SignInRequestStage;
};

// Server-owned, request-local state: never correlate by a client-supplied ID
// or by the latest request for an email (concurrent requests must stay separate).
export const signInRequestContext = new AsyncLocalStorage<SignInRequestContext>();

export function setSignInRequestStage(stage: SignInRequestStage) {
  const context = signInRequestContext.getStore();
  if (context) context.stage = stage;
}
