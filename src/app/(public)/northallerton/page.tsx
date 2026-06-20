// ========================================
// File: src/app/(public)/northallerton/page.tsx
// ========================================

import { redirect } from "next/navigation";

export const dynamic = "force-static";

export default function NorthallertonSignupShortcutPage() {
  redirect("/register-interest?area=Northallerton&night=Wednesday");
}
