// ========================================
// File: src/app/(admin)/admin/templates/quick/fixture-update/page.tsx
// ========================================

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEMPLATE_BODY = [
  "Hi everyone,",
  "",
  "Just a quick message to let you know that some fixtures have changed for this week.",
  "",
  "Please check the updated fixtures below and make sure your team is aware of your kick-off time.",
  "",
  "This week’s fixtures:",
  "",
  "{{fixtures}}",
  "",
  "Please arrive in good time before your match so we can keep everything running to schedule.",
  "",
  "Thanks,",
  "SIXFL",
].join("\n");

export default async function FixtureUpdateTemplateSetupPage() {
  await requireAdmin();

  const template = await prisma.emailTemplate.upsert({
    where: { key: "fixture-update" },
    update: {
      name: "Fixture update",
      description:
        "League email for sending this week’s updated fixtures. Paste any number of fixture lines into the {{fixtures}} placeholder.",
      audience: "TEAM",
      interestType: "TEAM",
      subject: "SIXFL – Updated fixtures for this week",
      body: TEMPLATE_BODY,
      ctaLabel: null,
      ctaUrlKey: null,
      isActive: true,
    },
    create: {
      key: "fixture-update",
      name: "Fixture update",
      description:
        "League email for sending this week’s updated fixtures. Paste any number of fixture lines into the {{fixtures}} placeholder.",
      audience: "TEAM",
      interestType: "TEAM",
      subject: "SIXFL – Updated fixtures for this week",
      body: TEMPLATE_BODY,
      ctaLabel: null,
      ctaUrlKey: null,
      isActive: true,
    },
    select: { id: true },
  });

  redirect(`/admin/templates/${template.id}`);
}
