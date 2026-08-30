// ========================================
// File: src/app/(admin)/admin/users/page.tsx
// ========================================

import { Prisma } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { updateAdminUserProfileAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Admin Users | SIXFL",
};

type SearchParams = {
  q?: string;
  saved?: string;
  error?: string;
};

function normaliseEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

function initials(name: string | null, email: string | null) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function hasAssignedProspectTeam<T extends { team: unknown | null }>(
  prospect: T,
): prospect is T & { team: NonNullable<T["team"]> } {
  return Boolean(prospect.team);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const query = (sp.q ?? "").trim();

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      teamMembers: {
        select: {
          id: true,
          role: true,
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  const whatsappRows = users.length
    ? await prisma.$queryRaw<Array<{ id: string; usesWhatsapp: boolean }>>`
        SELECT id, "usesWhatsapp"
        FROM "User"
        WHERE id IN (${Prisma.join(users.map((user) => user.id))})
      `
    : [];

  const whatsappByUserId = new Map(
    whatsappRows.map((row) => [row.id, Boolean(row.usesWhatsapp)]),
  );

  const emails = users
    .map((user) => normaliseEmail(user.email))
    .filter((email): email is string => Boolean(email));

  const matchingProspects = emails.length
    ? await prisma.teamPlayerProspect.findMany({
        where: { email: { in: emails, mode: "insensitive" } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          status: true,
          team: { select: { id: true, name: true } },
        },
      })
    : [];

  const prospectsByEmail = new Map<string, Array<(typeof matchingProspects)[number] & { team: NonNullable<(typeof matchingProspects)[number]["team"]> }>>();
  for (const prospect of matchingProspects.filter(hasAssignedProspectTeam)) {
    const email = normaliseEmail(prospect.email);
    if (!email) continue;
    prospectsByEmail.set(email, [...(prospectsByEmail.get(email) ?? []), prospect]);
  }

  const savedMessage = sp.saved
    ? sp.saved === "1"
      ? "User details updated."
      : decodeURIComponent(sp.saved)
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Identity management
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Users
          </h1>
          <p className="max-w-3xl text-sm text-white/60 sm:text-base">
            Search users, fix missing names, mark WhatsApp contacts, open player comms, and link user accounts to matching squad prospects.
          </p>
        </div>

        <div className="flex w-full max-w-4xl flex-col gap-3 sm:flex-row">
          <Link
            href="/admin/users/identity-audit"
            className="inline-flex items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
          >
            Identity audit / Shared email repair
          </Link>

          <Link
            href="/admin/users/link-prospect"
            className="inline-flex items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Link user to prospect
          </Link>

          <form action="/admin/users" className="flex flex-1 gap-3">
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search by name or email"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {savedMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </div>
      ) : null}

      {sp.error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            User records
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Search results</h2>
        </div>

        <div className="divide-y divide-white/10">
          {users.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">No users found.</div>
          ) : null}

          {users.map((user) => {
            const email = normaliseEmail(user.email);
            const prospects = email ? prospectsByEmail.get(email) ?? [] : [];
            const isLinked = user.teamMembers.length > 0;
            const usesWhatsapp = whatsappByUserId.get(user.id) ?? false;
            const repairHref = email
              ? `/admin/users/link-prospect?email=${encodeURIComponent(email)}`
              : "/admin/users/link-prospect";

            return (
              <div key={user.id} className="grid gap-5 px-6 py-5 xl:grid-cols-[1fr_360px]">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                    {initials(user.name, user.email)}
                  </div>

                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-base font-semibold text-white">
                          {user.name || "Unnamed user"}
                        </div>
                        {usesWhatsapp ? (
                          <span
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10"
                            title="Uses WhatsApp"
                          >
                            <img
                              src="/WhatsApp-Logo.png"
                              alt="WhatsApp"
                              className="h-4 w-4 object-contain"
                            />
                          </span>
                        ) : null}
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
                        {user.role}
                      </span>
                      {!isLinked && prospects.length > 0 ? (
                        <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                          Matching prospect not linked
                        </span>
                      ) : null}
                    </div>

                    <div className="text-sm text-white/65">{user.email || "No email"}</div>

                    {isLinked ? (
                      <div className="space-y-2">
                        {user.teamMembers.map((membership) => (
                          <div key={membership.id} className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/teams/${membership.team.id}`}
                              className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                            >
                              {membership.team.name} · {membership.role}
                            </Link>
                            <Link
                              href={`/admin/teams/${membership.team.id}/players/${membership.id}/communications`}
                              className="inline-flex items-center rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/15"
                            >
                              Open comms
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-white/45">No linked teams.</div>
                    )}

                    {prospects.length > 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
                            Matching prospects
                          </div>
                          <Link
                            href={repairHref}
                            className="inline-flex items-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            Link user to prospect
                          </Link>
                        </div>

                        <div className="mt-3 space-y-2">
                          {prospects.map((prospect) => (
                            <div
                              key={prospect.id}
                              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.06]"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <Link
                                  href={`/admin/teams/${prospect.team.id}/prospects`}
                                  className="min-w-0 text-xs text-white/65 transition hover:text-white"
                                >
                                  {[prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || prospect.email || "Unnamed prospect"} · {prospect.team.name} · {prospect.status}
                                  {prospect.phone ? ` · ${prospect.phone}` : ""}
                                </Link>
                                <Link
                                  href={`/admin/teams/${prospect.team.id}/prospects/${prospect.id}/communications`}
                                  className="inline-flex w-full items-center justify-center rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/15 sm:w-auto"
                                >
                                  Open prospect comms
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <form action={updateAdminUserProfileAction} className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <input type="hidden" name="userId" value={user.id} />
                  <input
                    type="hidden"
                    name="from"
                    value={`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`}
                  />

                  <div className="space-y-2">
                    <label className="text-sm text-white/60">Display name</label>
                    <input
                      name="name"
                      type="text"
                      defaultValue={user.name ?? ""}
                      placeholder="Enter full name"
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-white/60">Email</label>
                    <input
                      value={user.email ?? ""}
                      disabled
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white/50 outline-none"
                    />
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06]">
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10">
                        <img
                          src="/WhatsApp-Logo.png"
                          alt=""
                          className="h-5 w-5 object-contain"
                        />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-white">Show WhatsApp logo</span>
                        <span className="block text-xs text-white/45">Adds the WhatsApp icon beside this user&apos;s name.</span>
                      </span>
                    </span>
                    <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-white/10 bg-black/30 p-0.5">
                      <input
                        type="checkbox"
                        name="usesWhatsapp"
                        defaultChecked={usesWhatsapp}
                        className="peer sr-only"
                      />
                      <span className="h-5 w-5 rounded-full bg-white/45 transition peer-checked:translate-x-5 peer-checked:bg-emerald-300" />
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Save user
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
