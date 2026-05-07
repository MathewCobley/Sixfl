// ========================================
// File: src/app/admin/venues/actions.ts
// ========================================

"use server";

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

export async function createVenueAction(
  _prevState: VenueFormState,
  formData: FormData
): Promise<VenueFormState> {
  await requireAdmin();

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

  const errors: Record<string, string[]> = {};

  if (!name) {
    errors.name = ["Venue name is required."];
  }

  if (Object.keys(errors).length > 0) {
    return {
      error: "Please fix the venue form errors.",
      errors,
    };
  }

  await prisma.venue.create({
    data: {
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
    },
  });

  revalidatePath("/admin/venues");
  revalidatePath("/admin/fixtures");
  revalidatePath("/venues");

  return {
    success: true,
    message: "Venue created successfully.",
  };
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

  revalidatePath("/admin/venues");
  revalidatePath("/admin/fixtures");
  revalidatePath("/venues");

  redirect("/admin/venues?deleted=1");
}
