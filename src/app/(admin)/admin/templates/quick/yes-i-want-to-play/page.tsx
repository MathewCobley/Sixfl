// ========================================
// File: src/app/(admin)/admin/templates/quick/yes-i-want-to-play/page.tsx
// ========================================

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function YesIWantToPlayTemplateSetupPage() {
  await requireAdmin();

  const template = await prisma.emailTemplate.upsert({
    where: { key: "yes-i-want-to-play" },
    update: {
      name: "Yes, I want to play",
      description:
        "Simple player follow-up email for prospects who need to complete the sign-up/details form.",
      audience: "PLAYER",
      interestType: "PLAYER",
      subject: "Want to play in SIXFL?",
      body: [
        "Hi {{firstName}},",
        "",
        "We’ve got playing opportunities available in SIXFL.",
        "",
        "If you still want to play, click the button below and complete your details.",
        "",
        "{{cta}}",
        "",
        "Once we have your details, we can add you to the right squad or invite you to a team.",
        "",
        "Thanks,",
        "",
        "SIXFL",
      ].join("\n"),
      ctaLabel: "Yes, I want to play",
      ctaUrlKey: "signupUrl",
      isActive: true,
    },
    create: {
      key: "yes-i-want-to-play",
      name: "Yes, I want to play",
      description:
        "Simple player follow-up email for prospects who need to complete the sign-up/details form.",
      audience: "PLAYER",
      interestType: "PLAYER",
      subject: "Want to play in SIXFL?",
      body: [
        "Hi {{firstName}},",
        "",
        "We’ve got playing opportunities available in SIXFL.",
        "",
        "If you still want to play, click the button below and complete your details.",
        "",
        "{{cta}}",
        "",
        "Once we have your details, we can add you to the right squad or invite you to a team.",
        "",
        "Thanks,",
        "",
        "SIXFL",
      ].join("\n"),
      ctaLabel: "Yes, I want to play",
      ctaUrlKey: "signupUrl",
      isActive: true,
    },
    select: { id: true },
  });

  redirect(`/admin/templates/${template.id}`);
}
