import RefereeAppShell from "@/components/referee/RefereeAppShell";
import AppAgreementSections from "@/components/shared/AppAgreementSections";
import { requireReferee } from "@/lib/admin";
import {
  REFEREE_AGREEMENT_EFFECTIVE_DATE,
  REFEREE_AGREEMENT_VERSION,
  refereeAgreementSections,
} from "@/lib/referee-agreement";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RefereeAgreementPage() {
  await requireReferee();

  return (
    <RefereeAppShell active="rules" title="Referee agreement">
      <AppAgreementSections
        version={REFEREE_AGREEMENT_VERSION}
        effectiveDate={REFEREE_AGREEMENT_EFFECTIVE_DATE}
        intro="The active terms for providing referee services to SIXFL. Keep this available in the app whenever you need to check what applies."
        sections={refereeAgreementSections}
      />
    </RefereeAppShell>
  );
}
