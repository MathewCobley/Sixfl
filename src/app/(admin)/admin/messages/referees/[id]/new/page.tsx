import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendCentralRefereeEmailAction } from "../actions";
import NewEmailForm from "./NewEmailForm";

type Props = { params: Promise<{ id: string }> };

export default async function NewRefereeEmailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  // Composing does not read/create a thread, queue a welcome, or change a contact.
  const referee = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!referee || referee.role !== UserRole.REFEREE) notFound();
  const email = referee.email?.trim() || null;
  const displayName = referee.name?.trim() || email || "Referee";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/admin/messages/referees/${referee.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-300 hover:text-emerald-200">
        ← Back to referee communications
      </Link>
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 sm:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Referee communications</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">New email</h1>
        <p className="mt-3 text-sm leading-6 text-white/65">Write to {displayName} with a new subject. You do not need an existing conversation or a welcome email.</p>
        <div className="mt-6">
          <NewEmailForm refereeId={referee.id} email={email} action={sendCentralRefereeEmailAction} />
        </div>
      </section>
      <Link href={`/admin/referees/${referee.id}`} className="inline-flex min-h-11 items-center text-sm text-white/60 hover:text-white">Edit referee contact details</Link>
    </div>
  );
}
