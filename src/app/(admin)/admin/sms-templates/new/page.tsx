// ========================================
// File: src/app/(admin)/admin/sms-templates/new/page.tsx
// ========================================

import { redirect } from "next/navigation";

export default function NewSmsTemplatePage() {
  redirect("/admin/templates/new?channel=SMS");
}
