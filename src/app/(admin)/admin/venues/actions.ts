// ========================================
// File: src/app/admin/venues/actions.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type VenueFormState = {
  success?: boolean;
  error?: string;
  message?: string;
  errors?: Record<string, string[]>;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseMoneyPence(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) return null;

  return Math.round(parsed * 100);
}

function buildVenuePayload(formData: FormData) {
  const name = getString(formData, "name");
  const address = getString(formData, "address");
  const postcode = getString(formData, "postcode");
  const notes = getString(formData, "notes");
  const imageUrl = getString(formData, "imageUrl");
  const websiteUrl = getString(formData, "websiteUrl");
  const googleMapsUrl = getString(formData, "googleMapsUrl");
  const parkingNotes = getString(formData, "parkingNotes");
  const pitchNotes = getString(formData, "pitchNotes");
  const facilities = getString(formData, "facilities");

  return {
    name,
    address: address || null,
    postcode: postcode || null,
    notes: notes || null,
    imageUrl: imageUrl || null,
    websiteUrl: websiteUrl || null,
    googleMapsUrl: googleMapsUrl || null,
    parkingNotes: parkingNotes || null,
    pitchNotes: pitchNotes || null,
    facilities: facilities || null,
  };
}

async function setVenueOperationalCosts(input: {
  venueId: string;
  defaultPitchCostPerHourPence: number | null;
}) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Venue"
    SET
      "defaultPitchCostPerHourPence" = ${input.defaultPitchCostPerHourPence},
      "updatedAt" = NOW()
    WHERE id = ${input.venueId}
  `);
}

function revalidateVenuePages() {
  revalidatePath("/admin/venues");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/night-board");
  revalidatePath("/venues");
}

export async function createVenueAction(
  _prevState: VenueFormState,
  formData: FormData
): Promise<VenueFormState> {
  await requireAdmin();

  const data = buildVenuePayload(formData);
  const defaultPitchCostPerHourPence = parseMoneyPence(
    formData.get("defaultPitchCostPerHour"),
  );
  const errors: Record<string, string[]> = {};

  if (!data.name) {
    errors.name = ["Venue name is required."];
  }

  if (defaultPitchCostPerHourPence === null) {
    errors.defaultPitchCostPerHour = ["Pitch cost must be a valid amount."];
  }

  if (Object.keys(errors).length > 0) {
    return {
      error: "Please fix the venue form errors.",
      errors,
    };
  }

  const venue = await prisma.venue.create({
    data,
    select: { id: true },
  });

  await setVenueOperationalCosts({
    venueId: venue.id,
    defaultPitchCostPerHourPence: defaultPitchCostPerHourPence ?? null,
  });

  revalidateVenuePages();

  return {
    success: true,
    message: "Venue created successfully.",
  };
}

export async function updateVenueAction(formData: FormData) {
  await requireAdmin();

  const id = getString(formData, "id");
  const data = buildVenuePayload(formData);
  const defaultPitchCostPerHourPence = parseMoneyPence(
    formData.get("defaultPitchCostPerHour"),
  );

  if (!id) {
    redirect("/admin/venues?error=missing-id");
  }

  if (!data.name) {
    redirect("/admin/venues?error=missing-name");
  }

  if (defaultPitchCostPerHourPence === null) {
    redirect("/admin/venues?error=invalid-cost");
  }

  await prisma.venue.update({
    where: { id },
    data,
  });

  await setVenueOperationalCosts({
    venueId: id,
    defaultPitchCostPerHourPence: defaultPitchCostPerHourPence ?? null,
  });

  revalidateVenuePages();

  redirect("/admin/venues?updated=1");
}

export async function deleteVenueAction(formData: FormData) {
  await requireAdmin();

  const id = getString(formData, "id");

  if (!id) {
    redirect("/admin/venues?error=missing-id");
  }

  const linkedFixturesCount = await prisma.fixture.count({
    where: {
      venueId: id,
    },
  });

  if (linkedFixturesCount > 0) {
    redirect("/admin/venues?error=in-use");
  }

  await prisma.venue.delete({
    where: { id },
  });

  revalidateVenuePages();

  redirect("/admin/venues?deleted=1");
}
