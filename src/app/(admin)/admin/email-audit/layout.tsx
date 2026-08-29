import type { ReactNode } from "react";

import EmailRecordLookup from "@/components/admin/email-audit/EmailRecordLookup";

export default function EmailAuditLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <EmailRecordLookup />
      {children}
    </>
  );
}
