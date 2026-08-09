"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  markAllCaptainMessagesRead,
  markCaptainMessageRead,
} from "@/lib/messaging/captain-inbox";
import { requireCaptain } from "@/lib/requireCaptain";

const VALID_FILTERS = new Set([
  "all",
  "unread",
  "sixfl",
  "players",
  "fixtures",
  "payments",
  "kits",
]);

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getFilter(value: string) {
  return VALID_FILTERS.has(value) ? value : "all";
}

function getPage(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

function canMarkCaptainMessagesRead(
  access: Awaited<ReturnType<typeof requireCaptain>>,
) {
  return Boolean(
    access.isCaptain &&
      !access.isAdmin &&
      access.accessMode === "captain" &&
      access.user?.role !== "ADMIN",
  );
}

function buildMessagesHref(input: {
  teamId: string;
  filter?: string;
  page?: number;
  message?: string;
  read?: string;
}) {
  const search = new URLSearchParams();
  const filter = getFilter(input.filter ?? "all");

  if (filter !== "all") search.set("filter", filter);
  if ((input.page ?? 1) > 1) search.set("page", String(input.page));
  if (input.message) search.set("message", input.message);
  if (input.read) search.set("read", input.read);

  const query = search.toString();
  return `/captain/team/${input.teamId}/messages${query ? `?${query}` : ""}`;
}

function revalidateCaptainMessages(teamId: string) {
  revalidatePath(`/captain/team/${teamId}/messages`);
  revalidatePath(`/captain/team/${teamId}`, "layout");
}

export async function openCaptainMessageAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const messageId = getString(formData, "messageId");
  const itemKey = getString(formData, "itemKey");
  const filter = getFilter(getString(formData, "filter"));
  const page = getPage(getString(formData, "page"));

  if (!teamId || !messageId || !itemKey) {
    redirect(
      buildMessagesHref({
        teamId,
        filter,
        page,
      }),
    );
  }

  const access = await requireCaptain(teamId);
  let read = "";

  if (canMarkCaptainMessagesRead(access)) {
    const changed = await markCaptainMessageRead({ teamId, messageId });
    if (changed) read = "1";
  }

  revalidateCaptainMessages(teamId);
  redirect(
    `${buildMessagesHref({
      teamId,
      filter,
      page,
      message: itemKey,
      read,
    })}#message-detail`,
  );
}

export async function markAllCaptainMessagesReadAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const filter = getFilter(getString(formData, "filter"));

  if (!teamId) {
    redirect("/dashboard");
  }

  const access = await requireCaptain(teamId);
  let changed = 0;

  if (canMarkCaptainMessagesRead(access)) {
    changed = await markAllCaptainMessagesRead(teamId);
  }

  revalidateCaptainMessages(teamId);
  redirect(
    buildMessagesHref({
      teamId,
      filter: filter === "unread" ? "all" : filter,
      read: changed > 0 ? `all-${changed}` : "all-0",
    }),
  );
}
