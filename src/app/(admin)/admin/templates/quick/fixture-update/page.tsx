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
  "Apologies — the previous fixture email was sent before the fixture list had been added properly.",
  "",
  "The correct fixtures for this week are:",
  "",
  "",
  "Please check your kick-off time and make sure your team is aware.",
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
        "Correction email for this week’s fixtures. Paste the fixture lines into the clear space under ‘The correct fixtures for this week are’ before sending.",
      audience: "TEAM",
      interestType: "TEAM",
      subject: "SIXFL – Corrected fixtures for this week",
      body: TEMPLATE_BODY,
      ctaLabel: null,
      ctaUrlKey: null,
      isActive: true,
    },
    create: {
      key: "fixture-update",
      name: "Fixture update",
      description:
        "Correction email for this week’s fixtures. Paste the fixture lines into the clear space under ‘The correct fixtures for this week are’ before sending.",
      audience: "TEAM",
      interestType: "TEAM",
      subject: "SIXFL – Corrected fixtures for this week",
      body: TEMPLATE_BODY,
      ctaLabel: null,
      ctaUrlKey: null,
      isActive: true,
    },
    select: { id: true },
  });

  redirect(`/admin/templates/${template.id}`);
}
