// ========================================
// File: scripts/backfill-lead-preferred-nights.ts
// ========================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const leads = await prisma.interestLead.findMany({
    where: {
      preferredNight: {
        not: null,
      },
    },
    select: {
      id: true,
      preferredNight: true,
    },
  });

  for (const lead of leads) {
    if (!lead.preferredNight) continue;

    await prisma.interestLeadPreferredNight.upsert({
      where: {
        leadId_night: {
          leadId: lead.id,
          night: lead.preferredNight,
        },
      },
      update: {},
      create: {
        leadId: lead.id,
        night: lead.preferredNight,
      },
    });
  }

  console.log(`Backfilled ${leads.length} lead night preferences.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });