// ========================================
// File: src/app/(admin)/admin/sms-templates/page.tsx
// ========================================

import { redirect } from "next/navigation";

export default function AdminSmsTemplatesPage() {
  redirect("/admin/templates?channel=SMS");
}
