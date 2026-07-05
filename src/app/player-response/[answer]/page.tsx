// ========================================
// File: src/app/player-response/[answer]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPlayerInterestTokenHash,
  verifyPlayerInterestResponseToken,
} from "@/lib/player-interest/response-token";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ answer: string }>;
  searchParams?: Promise<{ token?: string }>;
};

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function getAnswer(value: string) {
  const parsed = value.trim().toLowerCase();
  if (parsed === "yes") return "YES" as const;
  if (parsed === "no") return "NO" as const;
  return null;
}

function responseNote(input: {
  answer: "YES" | "NO";
  date: Date;
  existingNotes?: string | null;
  teamName?: string | null;
}) {
  const stamp = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(input.date);

  const teamSuffix = input.teamName ? ` for ${input.teamName}` : " generally";
  const line =
    input.answer === "YES"
      ? `Player confirmed they still want to play${teamSuffix} on ${stamp}.`
      : `Player replied NO${teamSuffix} — remove from active player pool / follow up before selecting on ${stamp}.`;

  const existing = input.existingNotes?.trim();
  if (!existing) return line;
  if (existing.includes(line)) return existing;

  return `${existing}\n${line}`;
}

async function saveTeamMemberResponse(input: {
  teamId: string;
  recipientId: string;
  answer: "YES" | "NO";
  token: string;
}) {
  const member = await prisma.teamMember.findFirst({
    where: {
      id: input.recipientId,
      teamId: input.teamId,
    },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      team: { select: { name: true } },
    },
  });

  if (!member) return null;

  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO "PlayerInterestResponse" (
      "id",
      "teamId",
      "teamMemberId",
      "prospectId",
      "response",
      "tokenHash",
      "respondedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      ${input.teamId},
      ${member.id},
      NULL,
      ${input.answer},
      ${getPlayerInterestTokenHash(input.token)},
      ${now},
      ${now},
      ${now}
    )
    ON CONFLICT ("tokenHash") DO UPDATE SET
      "response" = EXCLUDED."response",
      "respondedAt" = EXCLUDED."respondedAt",
      "updatedAt" = EXCLUDED."updatedAt"
  `;

  return {
    name: member.user.name || member.user.email || "Player",
    teamName: member.team.name,
    isGeneral: false,
  };
}

async function saveProspectResponse(input: {
  teamId: string | null;
  recipientId: string;
  answer: "YES" | "NO";
  token: string;
}) {
  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: input.recipientId,
      ...(input.teamId ? { OR: [{ teamId: input.teamId }, { teamId: null }] } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      notes: true,
      teamId: true,
      team: { select: { name: true } },
    },
  });

  if (!prospect) return null;

  const team = input.teamId
    ? await prisma.team.findUnique({
        where: { id: input.teamId },
        select: { id: true, name: true },
      })
    : null;

  if (input.teamId && !team) return null;

  const now = new Date();

  await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      status: input.answer === "YES" ? "QUALIFIED" : "CLOSED",
      notes: responseNote({
        answer: input.answer,
        date: now,
        existingNotes: prospect.notes,
        teamName: team?.name ?? null,
      }),
      lastContactedAt: now,
    },
  });

  await prisma.$executeRaw`
    INSERT INTO "PlayerInterestResponse" (
      "id",
      "teamId",
      "teamMemberId",
      "prospectId",
      "response",
      "tokenHash",
      "respondedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      ${team?.id ?? null},
      NULL,
      ${prospect.id},
      ${input.answer},
      ${getPlayerInterestTokenHash(input.token)},
      ${now},
      ${now},
      ${now}
    )
    ON CONFLICT ("tokenHash") DO UPDATE SET
      "response" = EXCLUDED."response",
      "respondedAt" = EXCLUDED."respondedAt",
      "updatedAt" = EXCLUDED."updatedAt"
  `;

  return {
    name: [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || prospect.firstName,
    teamName: team?.name ?? "the SIXFL player pool",
    isGeneral: !team,
  };
}

export default async function PlayerInterestResponsePage({ params, searchParams }: PageProps) {
  const { answer: rawAnswer } = await params;
  const sp = (await searchParams) ?? {};
  const answer = getAnswer(rawAnswer);
  const token = sp.token?.trim();

  if (!answer || !token) notFound();

  const payload = verifyPlayerInterestResponseToken(token);
  if (!payload) notFound();

  const saved =
    payload.recipientType === "teamMember"
      ? await saveTeamMemberResponse({
          teamId: payload.teamId!,
          recipientId: payload.recipientId,
          answer,
          token,
        })
      : await saveProspectResponse({
          teamId: payload.teamId,
          recipientId: payload.recipientId,
          answer,
          token,
        });

  if (!saved) notFound();

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-emerald-400/20 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          SIXFL player response
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          {answer === "YES" ? "Thanks — you’re still on the list" : "Thanks — we’ll update your record"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-white/70">
          {answer === "YES"
            ? `Thanks ${saved.name}. We’ve recorded that you still want to play ${saved.isGeneral ? "with SIXFL" : `for ${saved.teamName}`}.`
            : `Thanks ${saved.name}. We’ve recorded that you no longer want to be kept on ${saved.isGeneral ? "the SIXFL player list" : `the active playing list for ${saved.teamName}`}.`}
        </p>
        <p className="mt-3 text-sm leading-6 text-white/55">
          If this was a mistake, reply to the original email or contact SIXFL.
        </p>
        <Link
          href={getSiteUrl()}
          className="mt-6 inline-flex rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
        >
          Back to SIXFL
        </Link>
      </div>
    </main>
  );
}
