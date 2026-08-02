"use server";

import { redirect } from "next/navigation";

import {
  completeKitPlayerAssignment,
  KitAssignmentValidationError,
} from "@/lib/kits/player-assignments";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function pathFor(token: string, query: string) {
  return `/kit-details/${encodeURIComponent(token)}?${query}`;
}

export async function completeKitDetailsAction(formData: FormData) {
  const token = value(formData, "token");
  if (!token) redirect("/");

  const shirtNumber = Number(value(formData, "shirtNumber"));

  try {
    await completeKitPlayerAssignment({
      token,
      backName: value(formData, "backName"),
      shirtNumber,
      kitSize: value(formData, "kitSize"),
    });
  } catch (error) {
    if (error instanceof KitAssignmentValidationError) {
      redirect(pathFor(token, `error=${encodeURIComponent(error.code)}`));
    }

    console.error("Player kit details could not be saved", error);
    redirect(pathFor(token, "error=save_failed"));
  }

  redirect(pathFor(token, "completed=1"));
}
