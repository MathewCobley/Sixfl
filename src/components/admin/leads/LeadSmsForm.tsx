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

// (FULL FILE KEPT SAME — ONLY SMALL CHANGES BELOW)

// ...existing code unchanged...

      if (!result?.ok) {
        alert(result?.error || "Failed to send SMS.");
        return;
      }

      alert(
        "SMS queued successfully. Messages sent after 10pm will be delivered at 9am.",
      );
      router.refresh();

// ...existing code unchanged...

        <div className="mt-2 text-xs text-white/40">
          SMS are only sent between 9:00 and 22:00. Messages outside these hours are queued.
        </div>

// ...existing code unchanged...
