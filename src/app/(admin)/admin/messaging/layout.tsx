// ========================================
// File: src/app/(admin)/admin/messaging/layout.tsx
// ========================================

import Link from "next/link";
import { NotificationDispatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMessagingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  const queuedSmsCount = await prisma.messageEntry.count({
    where: {
      channel: "SMS",
      direction: "OUTBOUND",
      notificationDispatchId: {
        not: null,
      },
      dispatch: {
        status: NotificationDispatchStatus.QUEUED,
      },
    },
  });

  return (
    <div className="space-y-4">
      {queuedSmsCount > 0 ? (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-amber-50 sm:mx-6 lg:mx-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Queued SMS
              </div>
              <div className="mt-1 text-sm text-amber-100/85">
                {queuedSmsCount} SMS message{queuedSmsCount === 1 ? " is" : "s are"} queued and can still be cancelled before sending.
              </div>
            </div>

            <Link
              href="/admin/messaging/queued-sms"
              className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/15"
            >
              Review queued SMS
            </Link>
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
}
