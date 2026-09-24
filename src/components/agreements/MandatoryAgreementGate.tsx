import Image from "next/image";

import { acceptCurrentAgreementAction } from "@/app/actions/agreements";
import AppAgreementSections from "@/components/shared/AppAgreementSections";
import {
  getCurrentAgreement,
  type AgreementType,
} from "@/lib/agreements";

export default function MandatoryAgreementGate({
  agreementType,
  name,
}: {
  agreementType: AgreementType;
  name?: string | null;
}) {
  const agreement = getCurrentAgreement(agreementType);
  const firstName = name?.trim().split(/\s+/)[0] || null;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 pb-10 pt-[max(env(safe-area-inset-top),1rem)] text-white">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
          <Image src="/logo2.png" alt="SIXFL" width={180} height={48} className="h-7 w-auto" priority />
          <span className="text-xs font-semibold text-white/40">Agreement required</span>
        </div>

        <section className="py-5">
          <p className="text-xs font-bold text-emerald-300">
            {firstName ? "Hi, " + firstName : "Before you continue"}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{agreement.title}</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Please review and accept the current version. You will only be asked again if the agreement is materially updated.
          </p>
        </section>

        <div className="space-y-3">
          <AppAgreementSections
            version={agreement.version}
            effectiveDate={agreement.effectiveDate}
            intro={agreement.intro}
            sections={agreement.sections}
          />

          <form action={acceptCurrentAgreementAction} className="rounded-[1.25rem] border border-emerald-400/25 bg-emerald-500/[0.08] p-4">
            <input type="hidden" name="agreementType" value={agreement.type} />
            <input type="hidden" name="version" value={agreement.version} />

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="agree"
                value="yes"
                required
                className="mt-1 h-5 w-5 shrink-0 accent-emerald-400"
              />
              <span>
                <span className="block text-sm font-bold text-white">{agreement.checkboxLabel}</span>
                <span className="mt-1 block text-xs leading-5 text-white/45">
                  SIXFL records your account, agreement version and acceptance date/time for the audit trail.
                </span>
              </span>
            </label>

            <button
              type="submit"
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-black text-[#04120d] active:bg-emerald-300"
            >
              Accept and continue
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
