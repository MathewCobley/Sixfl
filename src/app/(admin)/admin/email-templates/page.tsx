// ========================================
// File: src/app/(admin)/admin/email-templates/page.tsx
// ========================================

import { redirect } from "next/navigation";

export default function AdminEmailTemplatesPage() {
  redirect("/admin/templates?channel=EMAIL");
}
