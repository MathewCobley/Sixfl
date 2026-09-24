export default function AppAgreementSections({
  version,
  effectiveDate,
  intro,
  sections,
}: {
  version: string;
  effectiveDate: string;
  intro: string;
  sections: Array<{ title: string; points: string[] }>;
}) {
  return (
    <>
      <section className="rounded-[1.25rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-4">
        <p className="text-sm leading-6 text-white/65">{intro}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-white/45">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            Version {version}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            Effective {effectiveDate}
          </span>
        </div>
      </section>

      <section className="space-y-2">
        {sections.map((section, index) => (
          <details
            key={section.title}
            open={index === 0 || undefined}
            className="group overflow-hidden rounded-[1.15rem] border border-white/10 bg-white/[0.035]"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-3 px-3.5 py-3 text-sm font-black text-white [&::-webkit-details-marker]:hidden">
              <span>{section.title}</span>
              <span aria-hidden="true" className="text-lg leading-none text-white/30 transition group-open:rotate-45">+</span>
            </summary>
            <div className="space-y-2 border-t border-white/[0.06] p-3">
              {section.points.map((point) => (
                <p key={point} className="text-xs leading-5 text-white/55">{point}</p>
              ))}
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
