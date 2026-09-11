/** Use only the server-authenticated requireCaptain result. Never derive this
 * permission from query strings, form fields or a client-supplied admin flag.
 * Captain-only preview deliberately remains a customer view for administrators. */
export function mayViewPaymentAdjustments(access: {
  isAdmin?: boolean;
  user?: { role?: string } | null;
  accessMode?: string;
} | null | undefined) {
  return access?.isAdmin === true && access.user?.role === "ADMIN"
    && access.accessMode !== "captain-preview";
}

export type PaymentAudience = "admin" | "captain" | "player";
