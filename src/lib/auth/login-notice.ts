export type LoginNotice = { message: string; showRegistration: boolean };

export function loginErrorNotice(error: string | null | undefined): LoginNotice {
  if (error === "Verification") {
    return {
      message: "This sign-in link has expired or has already been used. Please request a new link below.",
      showRegistration: false,
    };
  }
  if (error === "AccessDenied") {
    return {
      message: "We couldn’t confirm your sign-in access. Please contact your team captain or SIXFL rather than registering again.",
      showRegistration: false,
    };
  }
  return {
    message: "We couldn’t complete your sign-in request. Please try again shortly. If it still fails, contact SIXFL; you do not need to register again.",
    showRegistration: false,
  };
}
