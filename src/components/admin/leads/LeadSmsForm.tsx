// ========================================
// File: src/components/admin/leads/LeadSmsForm.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import { sendLeadSmsAction } from "@/app/(admin)/admin/leads/[id]/actions";
import {
  buildBaseEmailTemplateContext,
  mergeEmailTemplateContext,
  resolveTemplateText,
} from "@/lib/email/template-context";

// ... (UNCHANGED CODE ABOVE OMITTED FOR BREVITY IN TOOL)

      if (!result?.ok) {
        alert(result?.error || "Failed to send SMS.");
        return;
      }

      alert("SMS queued successfully. Messages sent after 10pm will be delivered at 9am.");
      router.refresh();

// ... rest unchanged
