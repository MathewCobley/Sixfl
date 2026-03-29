// src/app/referee/actions.ts

"use server";

import { FixtureStatus, UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReferee } from "@/lib/admin";

function parseRequiredString(
  value: FormDataEntryValue | null,
  fieldName: string
) {
  const str = String(value ?? "").trim();

  if (!str) {
    throw new Error(`${fieldName} is required.`);
  }

  return str;
}

function parseScore(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();

  if (str === "") {
    throw new Error(`${fieldName} is required.`);
  }

  const num = Number(str);

  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`${fieldName} must be a whole number 0 or greater.`);
  }

  return num;
}

export async function submitRefereeResultAction(formData: FormData) {
  const { user } = await requireReferee();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const homeScore = parseScore(formData.get("homeScore"), "Home score");
  const awayScore = parseScore(formData.get("awayScore"), "Away score");

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      refereeId: true,
      status: true,
      result: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!fixture) {
    throw new Error("Fixture not found.");
  }

  const canEdit =
    fixture.refereeId === user.id || user.role === UserRole.ADMIN;

  if (!canEdit) {
    throw new Error("You are not allowed to enter a result for this fixture.");
  }

  await prisma.$transaction(async (tx) => {
    if (fixture.result) {
      await tx.matchResult.update({
        where: { fixtureId },
        data: {
          homeScore,
          awayScore,
          enteredByUserId: user.id,
          enteredAt: new Date(),
          isDisputed: false,
          disputeNote: null,
        },
      });
    } else {
      await tx.matchResult.create({
        data: {
          fixtureId,
          homeScore,
          awayScore,
          enteredByUserId: user.id,
          enteredAt: new Date(),
        },
      });
    }

    await tx.fixture.update({
      where: { id: fixtureId },
      data: {
        status: FixtureStatus.COMPLETED,
      },
    });
  });

  revalidatePath("/referee");
  revalidatePath(`/referee/fixture/${fixtureId}`);
  revalidatePath("/admin/fixtures");

  redirect("/referee");
}