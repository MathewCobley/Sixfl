// ========================================
// File: src/app/(admin)/admin/users/page.tsx
// ========================================

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

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  const base = (name || email || "?").trim();
  const parts = base
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const query = (sp.q ?? "").trim();
  const where = query
    ? {
        OR: [
          {
            name: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            email: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
        ],
      }
    : undefined;

  const users = await prisma.user.findMany({
    where,
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
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const unnamedUsers = users.filter((user) => !user.name?.trim()).length;
  const linkedUsers = users.filter((user) => user.teamMembers.length > 0).length;

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
            Search users, fix missing names, and see which teams they are linked to.
          </p>
        </div>

        <form action="/admin/users" className="flex w-full max-w-xl gap-3">
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

      {sp.saved === "1" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          User name updated.
        </div>
      ) : null}

      {sp.error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Results</div>
          <div className="mt-3 text-3xl font-semibold text-white">{users.length}</div>
        </div>
        <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Unnamed</div>
          <div className="mt-3 text-3xl font-semibold text-white">{unnamedUsers}</div>
        </div>
        <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Linked to teams</div>
          <div className="mt-3 text-3xl font-semibold text-white">{linkedUsers}</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              User records
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Search results</h2>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {users.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">No users found.</div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                    {getInitials(user.name, user.email)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold text-white">
                        {user.name || "Unnamed user"}
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
                        {user.role}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-white/65">{user.email || "No email"}</div>

                    {user.teamMembers.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {user.teamMembers.map((membership) => (
                          <Link
                            key={membership.id}
                            href={`/admin/teams/${membership.team.id}`}
                            className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            {membership.team.name} · {membership.role}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-white/45">No linked teams.</div>
                    )}
                  </div>
                </div>

                <form action={updateAdminUserProfileAction} className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="from" value={`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`} />

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

                  <button
                    type="submit"
                    className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Save name
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
