// src/lib/email/getEmailTemplateContext.ts
export function getEmailTemplateContext(input: {
    firstName?: string | null;
    fullName?: string | null;
    area?: string | null;
    signupUrl?: string | null;
  }) {
    const trimmedName = input.firstName?.trim() || "";
    const safeFirstName = trimmedName.split(/\s+/)[0] || "there";
  
    return {
      firstName: safeFirstName,
      name: input.fullName?.trim() || safeFirstName,
      area: input.area?.trim() || "your area",
      signupUrl: input.signupUrl?.trim() || "",
    };
  }