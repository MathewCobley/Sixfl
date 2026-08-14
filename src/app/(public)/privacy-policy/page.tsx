// ========================================
// File: src/app/(public)/privacy-policy/page.tsx
// ========================================

import Link from "next/link";

const documentDetails = [
  { label: "Document", value: "Privacy Policy" },
  { label: "Version", value: "1.0" },
  { label: "Status", value: "Active" },
  { label: "Last updated", value: "14 August 2026" },
  { label: "Next review", value: "14 August 2027" },
  { label: "Owner", value: "SIXFL" },
  {
    label: "Applies to",
    value: "Website visitors, enquiries, leads, players, captains and referees",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
              SIXFL PRIVACY
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
              Privacy Policy
            </h1>

            <p className="mt-4 text-white/70 md:text-lg">
              This policy explains how SIXFL collects, uses, stores and shares
              personal information when you use our website, enquire about a
              league, submit a social-media lead form, register, play, referee or
              otherwise deal with us.
            </p>

            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Your privacy matters
              </p>
              <p className="mt-3 text-sm leading-6 text-white/75">
                We only use personal information for clear operational,
                contractual, safety, legal and marketing purposes, and we aim to
                collect no more than we reasonably need.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-xl font-bold text-white">Document control</h2>
            <dl className="mt-5 divide-y divide-white/10">
              {documentDetails.map((detail) => (
                <div
                  key={detail.label}
                  className="grid grid-cols-[120px_1fr] gap-4 py-3 text-sm"
                >
                  <dt className="font-semibold text-white/55">{detail.label}</dt>
                  <dd className="font-semibold text-white/90">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <PolicySection title="1. Who we are">
          <p>
            SIXFL operates organised 6-a-side football leagues in the United
            Kingdom. For the personal information covered by this policy, SIXFL
            is the organisation responsible for deciding how and why that
            information is used.
          </p>
          <p>
            You can contact us at <strong>hello@sixfl.co.uk</strong>, by phone on
            <strong> 01904 215102</strong>, or through our contact page. Our
            operating location is North Yorkshire, United Kingdom.
          </p>
        </PolicySection>

        <PolicySection title="2. Personal information we may collect">
          <p>Depending on how you interact with SIXFL, we may collect:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              identity and contact details, including your name, email address
              and phone number;
            </li>
            <li>
              team, player and league information, such as team name, squad
              membership, preferred league or area, availability and captain
              details;
            </li>
            <li>
              enquiry and registration information submitted through our
              website, contact forms, social-media lead forms or direct
              communications;
            </li>
            <li>
              football participation information, including fixtures, results,
              player statistics, disciplinary information and match-related
              records where relevant;
            </li>
            <li>
              payment and transaction information, including payment status,
              amounts, references and records needed to administer fees and
              refunds;
            </li>
            <li>
              communications with SIXFL, including emails, messages, SMS and
              notes made while dealing with an enquiry or operational issue;
            </li>
            <li>
              technical and usage information about how our website is used,
              such as device, browser, pages viewed and performance information
              where collected by our website and analytics providers.
            </li>
          </ul>
          <p>
            Payment providers may collect card or bank details directly. SIXFL
            generally receives payment status and transaction references rather
            than full payment-card details.
          </p>
        </PolicySection>

        <PolicySection title="3. How we collect information">
          <p>We may receive personal information:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>directly from you;</li>
            <li>
              from a team captain or organiser where they provide details needed
              to register or manage a squad;
            </li>
            <li>
              from social-media platforms when you submit a lead or enquiry form
              connected with a SIXFL advert;
            </li>
            <li>
              from payment, communications, hosting, analytics and other service
              providers used to operate SIXFL;
            </li>
            <li>
              from referees, league officials or other participants where
              information is reasonably needed to manage a fixture, incident,
              dispute or safeguarding concern.
            </li>
          </ul>
        </PolicySection>

        <PolicySection title="4. Why we use your information and our lawful bases">
          <p>We use personal information for the following purposes:</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th className="border-b border-white/10 px-3 py-3 font-bold text-white">
                    Purpose
                  </th>
                  <th className="border-b border-white/10 px-3 py-3 font-bold text-white">
                    Typical lawful basis
                  </th>
                </tr>
              </thead>
              <tbody className="text-white/75">
                <tr>
                  <td className="border-b border-white/10 px-3 py-3">
                    Responding to enquiries, discussing league places and taking
                    registrations
                  </td>
                  <td className="border-b border-white/10 px-3 py-3">
                    Taking steps at your request before a contract, contract,
                    and/or legitimate interests
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-white/10 px-3 py-3">
                    Creating and administering accounts, teams, squads, fixtures,
                    results, payments and league communications
                  </td>
                  <td className="border-b border-white/10 px-3 py-3">
                    Contract and legitimate interests in running SIXFL fairly and
                    efficiently
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-white/10 px-3 py-3">
                    Managing disputes, discipline, safety, fraud prevention and
                    legal or regulatory requirements
                  </td>
                  <td className="border-b border-white/10 px-3 py-3">
                    Legitimate interests and, where applicable, legal obligation
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-white/10 px-3 py-3">
                    Website security, service reliability, analytics and
                    performance improvement
                  </td>
                  <td className="border-b border-white/10 px-3 py-3">
                    Legitimate interests and, where the law requires it, consent
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-3">
                    Sending marketing about SIXFL leagues, opportunities or
                    related services
                  </td>
                  <td className="px-3 py-3">
                    Consent where required by electronic-marketing law, or
                    legitimate interests where marketing is otherwise permitted
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Where we rely on legitimate interests, those interests include
            operating and growing SIXFL, responding to people who have shown an
            interest in our leagues, keeping accurate operational records,
            protecting the service and communicating effectively with teams and
            participants. We consider these interests against the rights and
            expectations of the people involved.
          </p>
        </PolicySection>

        <PolicySection title="5. Meta and other social-media lead forms">
          <p>
            If you submit a lead form through a SIXFL advert on Facebook,
            Instagram or another social-media service, the platform may pre-fill
            or collect information such as your name, email address, phone number
            and answers to the questions shown in the form.
          </p>
          <p>
            The platform processes information under its own privacy terms. When
            your submitted lead details are made available to SIXFL, we use them
            to respond to your enquiry, discuss relevant league or playing
            opportunities and keep a record of that enquiry.
          </p>
          <p>
            Submitting an enquiry does not automatically sign you up to unrelated
            ongoing electronic marketing. Where separate consent is required for
            marketing by email, text or similar methods, we will seek it in the
            appropriate way.
          </p>
        </PolicySection>

        <PolicySection title="6. Special category and sensitive information">
          <p>
            Please do not provide health information or other particularly
            sensitive personal information unless it is genuinely needed for a
            safety, safeguarding, accessibility or other specific matter. Where
            SIXFL needs to process special category information, we will only do
            so where an additional lawful condition under data-protection law
            applies.
          </p>
        </PolicySection>

        <PolicySection title="7. Who we may share information with">
          <p>
            We do not sell personal information. We may share relevant
            information, only where reasonably necessary, with:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              payment processors, banking and accounting providers used to
              collect and reconcile fees;
            </li>
            <li>
              email, SMS and communications providers used to send operational
              messages;
            </li>
            <li>
              website hosting, database, security, analytics and technical
              service providers;
            </li>
            <li>
              team captains, referees, venues and league officials where needed
              to organise or safely administer participation;
            </li>
            <li>
              professional advisers, insurers, regulators, law-enforcement bodies
              or courts where disclosure is necessary or legally required.
            </li>
          </ul>
          <p>
            Service providers acting on our behalf are expected to use personal
            information only for the services they provide to SIXFL and to keep
            it appropriately protected.
          </p>
        </PolicySection>

        <PolicySection title="8. International transfers">
          <p>
            Some technology, communications, analytics, payment or social-media
            providers may process information outside the United Kingdom. Where
            data-protection law requires safeguards for an international
            transfer, we use providers and transfer arrangements intended to meet
            those requirements, such as applicable adequacy arrangements or
            approved contractual safeguards.
          </p>
        </PolicySection>

        <PolicySection title="9. How long we keep information">
          <p>
            We keep personal information only for as long as it is reasonably
            needed for the purpose it was collected, including legal,
            contractual, accounting, safety and dispute-resolution needs.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              General enquiries and leads that do not become active SIXFL
              participants are normally reviewed for deletion within 12 months of
              the last meaningful contact, unless there is a lawful reason to
              keep them longer.
            </li>
            <li>
              Account, participation, contractual and transaction records may be
              retained for the duration of the relationship and, where needed,
              for up to 6 years afterwards to deal with accounting, contractual
              or legal matters.
            </li>
            <li>
              Incident, disciplinary and safeguarding records are kept for a
              period appropriate to the nature and seriousness of the matter and
              any applicable legal or safety requirements.
            </li>
            <li>
              If you opt out of marketing, we may keep a minimal suppression
              record so that we can respect that choice in future.
            </li>
          </ul>
        </PolicySection>

        <PolicySection title="10. Marketing and your right to object">
          <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5 text-white/85">
            <p className="font-bold text-amber-100">
              You have the right to object at any time to the use of your personal
              information for direct marketing.
            </p>
            <p className="mt-2">
              You can ask us to stop by using any unsubscribe or opt-out method
              provided in the message, or by contacting hello@sixfl.co.uk.
            </p>
          </div>
          <p>
            If we rely on consent for a particular use of your information, you
            can withdraw that consent at any time. Withdrawal does not affect the
            lawfulness of processing that took place before consent was
            withdrawn.
          </p>
        </PolicySection>

        <PolicySection title="11. Your data-protection rights">
          <p>
            Depending on the circumstances and lawful basis, you may have rights
            to:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>ask for access to personal information we hold about you;</li>
            <li>ask us to correct inaccurate or incomplete information;</li>
            <li>ask us to erase information in certain circumstances;</li>
            <li>ask us to restrict how information is used;</li>
            <li>object to certain uses, including direct marketing;</li>
            <li>
              receive certain information in a portable format where the right
              applies;
            </li>
            <li>withdraw consent where processing is based on consent.</li>
          </ul>
          <p>
            To exercise a right, contact <strong>hello@sixfl.co.uk</strong>. We
            may need to verify your identity before acting on a request.
          </p>
        </PolicySection>

        <PolicySection title="12. Complaints">
          <p>
            If you have a concern about how SIXFL has used your personal
            information, please contact us first so we can try to resolve it. You
            also have the right to complain to the UK Information
            Commissioner&apos;s Office (ICO), the UK supervisory authority for
            data protection.
          </p>
          <a
            href="https://ico.org.uk/make-a-complaint/data-protection-complaints/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-bold text-white/80 transition hover:border-emerald-400/40 hover:text-white"
          >
            Information Commissioner&apos;s Office complaints guidance
          </a>
        </PolicySection>

        <PolicySection title="13. Security">
          <p>
            We use reasonable technical and organisational measures intended to
            protect personal information against unauthorised access, loss,
            misuse, alteration or disclosure. No online system can be guaranteed
            to be completely secure, so we also limit access to information to
            those who need it for their role.
          </p>
        </PolicySection>

        <PolicySection title="14. Automated decision-making">
          <p>
            SIXFL does not use solely automated decisions about individuals that
            produce legal or similarly significant effects. We may use automated
            tools for routine administration, analytics or football-related
            predictions, but operational decisions remain subject to human
            oversight where appropriate.
          </p>
        </PolicySection>

        <PolicySection title="15. Changes to this policy">
          <p>
            We may update this policy when our services, systems or legal
            obligations change. The current version and last-updated date will be
            published on this page.
          </p>
        </PolicySection>
      </div>

      <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-8">
        <h2 className="text-2xl font-black text-white">Privacy question?</h2>
        <p className="mt-3 text-white/70">
          Contact SIXFL if you want to ask how your information is being used or
          exercise a data-protection right.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <a
            href="mailto:hello@sixfl.co.uk"
            className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-extrabold text-black transition hover:bg-emerald-400"
          >
            Email SIXFL
          </a>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            Contact page
          </Link>
        </div>
      </section>
    </div>
  );
}

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="mt-3 space-y-4 leading-7 text-white/75">{children}</div>
    </section>
  );
}
