// src/lib/email/resolveTemplate.ts
type EmailTemplateContext = {
    firstName?: string | null;
    name?: string | null;
    area?: string | null;
    signupUrl?: string | null;
    [key: string]: string | null | undefined;
  };
  
  export function resolveTemplateText(
    text: string,
    context: EmailTemplateContext
  ) {
    return text.replace(/{{\s*([\w]+)\s*}}/g, (_, key: string) => {
      const value = context[key];
      return typeof value === "string" ? value : "";
    });
  }