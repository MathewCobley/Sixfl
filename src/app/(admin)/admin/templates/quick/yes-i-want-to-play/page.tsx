// ========================================
// File: src/app/(admin)/admin/templates/quick/yes-i-want-to-play/page.tsx
// ========================================

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEMPLATE_BODY = [
  "Hi {{firstName}},",
  "",
  "We’re checking who still wants to play in a SIXFL team.",
  "",
  "Could you please reply to this email with YES if you still want to play?",
  "",
  "If you no longer want to play, just reply NO and we’ll update our records.",
  "",
  "Thanks,",
  "",
  "SIXFL",
].join("\n");

export default async function YesIWantToPlayTemplateSetupPage() {
  await requireAdmin();

  const template = await prisma.emailTemplate.upsert({
    where: { key: "yes-i-want-to-play" },
    update: {
      name: "Yes, I want to play",
      description:
        "Simple squad-player email asking for a clear YES/NO reply so SIXFL knows who still wants to play.",
      audience: "PLAYER",
      interestType: "PLAYER",
      subject: "Do you still want to play in a SIXFL team?",
      body: TEMPLATE_BODY,
      ctaLabel: null,
      ctaUrlKey: null,
      isActive: true,
    },
    create: {
      key: "yes-i-want-to-play",
      name: "Yes, I want to play",
      description:
        "Simple squad-player email asking for a clear YES/NO reply so SIXFL knows who still wants to play.",
      audience: "PLAYER",
      interestType: "PLAYER",
      subject: "Do you still want to play in a SIXFL team?",
      body: TEMPLATE_BODY,
      ctaLabel: null,
      ctaUrlKey: null,
      isActive: true,
    },
    select: { id: true },
  });

  redirect(`/admin/templates/${template.id}`);
}
