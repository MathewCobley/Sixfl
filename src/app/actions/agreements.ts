"use server";

import { TeamRole, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import {
  getCurrentAgreement,
  type AgreementType,
} from "@/lib/agreements";
import { prisma } from "@/lib/prisma";

function agreementType(value: FormDataEntryValue | null): AgreementType {
  if (value === "PLAYER" || value === "CAPTAIN" || value === "REFEREE") {
    return value;
  }
  throw new Error("Unknown agreement type.");
}

export async function acceptCurrentAgreementAction(formData: FormData) {
  const type = agreementType(formData.get("agreementType"));
  const current = getCurrentAgreement(type);
  const submittedVersion = String(formData.get("version") ?? "");

  if (submittedVersion !== current.version) {
    throw new Error("This agreement has changed. Reload the page and review the current version.");
  }
  if (formData.get("agree") !== "yes") {
    throw new Error("You must confirm that you agree before continuing.");
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) throw new Error("Sign in again before accepting the agreement.");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (!user) throw new Error("Your SIXFL account could not be found.");
  if (user.role === UserRole.ADMIN) {
    throw new Error("Admin preview sessions cannot accept agreements on another user's behalf.");
  }

  if (type === "REFEREE" && user.role !== UserRole.REFEREE) {
    throw new Error("Only referee accounts can accept the Referee Agreement.");
  }

  if (type === "CAPTAIN") {
    const captainMembership = await prisma.teamMember.findFirst({
      where: { userId: user.id, role: TeamRole.CAPTAIN },
      select: { id: true },
    });
    if (!captainMembership) {
      throw new Error("Only registered captains can accept the Captain Agreement.");
    }
  }

  if (type === "PLAYER") {
    const playerMembership = await prisma.teamMember.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!playerMembership) {
      throw new Error("Only registered SIXFL players can accept the Player Agreement.");
    }
  }

  await prisma.agreementAcceptance.upsert({
    where: {
      userId_agreementType_version: {
        userId: user.id,
        agreementType: type,
        version: current.version,
      },
    },
    create: {
      userId: user.id,
      agreementType: type,
      version: current.version,
    },
    update: {},
  });

  revalidatePath("/", "layout");
}
