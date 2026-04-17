// ========================================
// File: src/app/(admin)/admin/email-templates/new/page.tsx
// ========================================

import { redirect } from "next/navigation";

export default function NewEmailTemplatePage() {
  redirect("/admin/templates/new?channel=EMAIL");
}
