import type { ReactNode } from "react";
import { UserRole } from "@prisma/client";

import MandatoryAgreementGate from "@/components/agreements/MandatoryAgreementGate";
import { hasAcceptedCurrentAgreement } from "@/lib/agreements";
import { requireReferee } from "@/lib/admin";

export default async function RefereeLayout({ children }: { children: ReactNode }) {
  const access = await requireReferee();

  if (
    !access.isAdminPreview &&
    access.authenticatedUser.role === UserRole.REFEREE &&
    !(await hasAcceptedCurrentAgreement(access.authenticatedUser.id, "REFEREE"))
  ) {
    return (
      <MandatoryAgreementGate
        agreementType="REFEREE"
        name={access.authenticatedUser.name}
      />
    );
  }

  return <>{children}</>;
}
