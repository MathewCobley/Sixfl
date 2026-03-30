// ========================================
// File: src/app/admin/messaging/page.tsx
// ========================================

import type { InterestType, LeadStatus, PreferredNight } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminMessagingConsole from "@/components/admin/messaging/AdminMessagingConsole";
import { sendAdminLeadCampaignAction } from "./actions";

function normaliseInterestType(value?: string) {
  if (value === "TEAM" || value === "PLAYER" || value === "REFEREE") {
    return value as InterestType;
  }

  return undefined;
}

function normaliseLeadStatus(value?: string) {
  if (
    value === "NEW" ||
    value === "CONTACTED" ||
    value === "QUALIFIED" ||
    value === "CLOSED"
  ) {
    return value as LeadStatus;
  }

  return undefined;
}

function normalisePreferredNight(value?: string) {
  if (
    value === "MONDAY" ||
    value === "TUESDAY" ||
    value === "WEDNESDAY" ||
    value === "THURSDAY" ||
    value === "FRIDAY" ||
    value === "SATURDAY" ||
    value === "SUNDAY" ||
    value === "ANY"
  ) {
    return value as PreferredNight;
  }

  return undefined;
}

export default async function AdminMessagingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    type?: string;
    status?: string;
    area?: string;
    night?: string;
  }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};

  const selectedType = normaliseInterestType(sp.type);
  const selectedStatus = normaliseLeadStatus(sp.status);
  const selectedArea = sp.area?.trim() || "";
  const selectedNight = normalisePreferredNight(sp.night);

  const where = {
    ...(selectedType ? { interestType: selectedType } : {}),
    ...(selectedStatus ? { status: selectedStatus } : {}),
    ...(selectedArea ? { area: selectedArea } : {}),
    ...(selectedNight
      ? {
          preferredNights: {
            some: {
              night: selectedNight,
            },
          },
        }
      : {}),
    email: {
      not: "",
    },
  };

  const [templates, recipients, recentEmails, areas] = await Promise.all([
    prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: "LEAD",
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        subject: true,
        body: true,
        interestType: true,
        ctaLabel: true,
        ctaUrlKey: true,
      },
    }),
    prisma.interestLead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 150,
      select: {
        id: true,
        contactName: true,
        email: true,
        area: true,
        interestType: true,
        status: true,
        teamName: true,
        league: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    }),
    prisma.interestLeadEmail.findMany({
      orderBy: [{ sentAt: "desc" }],
      take: 20,
      select: {
        id: true,
        subject: true,
        sentTo: true,
        sentAt: true,
        interestLead: {
          select: {
            id: true,
            contactName: true,
            interestType: true,
          },
        },
      },
    }),
    prisma.interestLead.findMany({
      where: {
        area: {
          not: null,
        },
      },
      distinct: ["area"],
      orderBy: [{ area: "asc" }],
      select: {
        area: true,
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <AdminMessagingConsole
        templates={templates}
        recipients={recipients}
        recentEmails={recentEmails.map((email) => ({
          ...email,
          sentAt: email.sentAt.toISOString(),
        }))}
        areaOptions={areas
          .map((item) => item.area?.trim() || "")
          .filter(Boolean)}
        selectedType={selectedType}
        selectedStatus={selectedStatus}
        selectedArea={selectedArea}
        selectedNight={selectedNight}
        action={sendAdminLeadCampaignAction}
      />
    </div>
  );
}
