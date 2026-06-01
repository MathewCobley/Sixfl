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
  "We recently emailed you to check whether you still wanted to play in a team in the SIXFL league, but we haven’t received a response from you yet.",
  "",
  "Our teams are filling up quickly, and we’re now checking whether you would still like to be added to a squad.",
  "",
  "We’ve already successfully started two teams made up of individual players, and we’re now looking to start a third.",
  "",
  "Please click one of the options below so we can keep the squad list up to date and make sure we only contact players who are still interested.",
  "",
  "YES, I still want to play: {{yesResponseUrl}}",
  "NO, remove me from the squad list: {{noResponseUrl}}",
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
        "Squad-player email with secure YES and NO response links so SIXFL knows who still wants to play.",
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
        "Squad-player email with secure YES and NO response links so SIXFL knows who still wants to play.",
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
