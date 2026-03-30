// ========================================
// File: src/components/layout/header/types.ts
// ========================================

export type HeaderLink = {
    label: string;
    href: string;
  };
  
  export type HeaderAction = {
    label: string;
    href: string;
    tone?: "default" | "primary";
  };
  
  export type HeaderVariant = "public" | "admin";
  
  export type HeaderConfig = {
    variant: HeaderVariant;
    links: HeaderLink[];
    primaryAction?: HeaderAction | null;
    showAuthLinks?: boolean;
    showAdminLink?: boolean;
    containerClassName?: string;
  };