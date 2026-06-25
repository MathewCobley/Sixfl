// ========================================
// File: src/components/captain/CaptainAdminFeeRouteNotice.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NoticeContent = {
  eyebrow: string;
  title: string;
  body: string;
  items: string[];
};

function getNoticeContent(pathname: string): NoticeContent | null {
  if (/\/payments\/?$/.test(pathname)) {
    return {
      eyebrow: "Payment deadline reminder",
      title: "Avoid the £10 late payment admin fee",
      body: "Team fees need to be kept up to date. SIXFL does not want to add admin fees, but late payment can create extra chasing and admin work.",
      items: [
        "A £10 late payment admin fee may be added if a team fee is more than 7 days overdue.",
        "Warnings or reminders may be sent before this is added where practical.",
        "Use the payment ledger or squad payments to make sure the team fee is covered on time.",
      ],
    };
  }

  if (/\/availability\/?$/.test(pathname) || /\/fixtures\/?$/.test(pathname)) {
    return {
      eyebrow: "Availability deadline reminder",
      title: "Avoid the £10 late confirmation admin fee",
      body: "Availability should be confirmed at least 72 hours before kick-off so fixtures can be planned properly.",
      items: [
        "A £10 late confirmation admin fee may be added if avoidable late confirmation creates extra chasing, fixture admin or rearranging work.",
        "Warnings or reminders may be sent before this is added where practical.",
        "Confirm availability on time, or raise an issue early if there is a genuine problem.",
      ],
    };
  }

  return null;
}

export default function CaptainAdminFeeRouteNotice({ teamId }: { teamId: string }) {
  const pathname = usePathname();
  const content = getNoticeContent(pathname);

  if (!content) return null;

  return (
    <section className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            {content.eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">{content.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/75">{content.body}</p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-white/68">
            {content.items.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-200" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <Link
          href={`/captain/team/${teamId}/help#admin-fees`}
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-amber-300/25 bg-black/20 px-5 py-3 text-sm font-semibold text-amber-50 transition hover:bg-black/30"
        >
          Read admin fee guide
        </Link>
      </div>
    </section>
  );
}
