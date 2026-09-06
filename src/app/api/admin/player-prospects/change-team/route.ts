// ========================================
// File: src/app/api/admin/player-prospects/change-team/route.ts
// ========================================

import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import {
  ensureManagedSquadJoinConfirmationTemplate,
  buildProspectEmailContext,
  MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
} from "@/lib/managed-squad/prospectJoinConfirmation";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function routeError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Something went wrong.";
}

async function queueFreshSquadInvite(input: {
  prospect: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string;
    phone: string | null;
  };
  team: NonNullable<Parameters<typeof buildProspectEmailContext>[0]["team"]>;
  createdByUserId: string | null;
}) {
  await ensureManagedSquadJoinConfirmationTemplate();

  const context = await buildProspectEmailContext({
    ...input.prospect,
    teamId: input.team.id,
    team: input.team,
  });
  if (!context) throw new Error("A squad invite requires a team and player email.");
  const { displayName, joinConfirmationUrl, leagueName } = context;

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `team-prospect:${input.prospect.id}`,
    audience: NotificationAudience.PLAYER,
    displayName,
    email: input.prospect.email,
    phone: input.prospect.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: {
      teamId: input.team.id,
      teamName: input.team.name,
      prospectId: input.prospect.id,
      contactName: displayName,
      entityType: "TEAM_PLAYER_PROSPECT",
    },
  });

  const dispatch = await queueNotificationFromTemplate({
    templateKey: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
    recipientId: recipient.id,
    variables: context.variables,
    sourceType: "MANAGED_SQUAD_JOIN_CONFIRMATION",
    sourceId: input.prospect.id,
    metadata: {
      origin: "squad_invite_team_change",
      originLabel: "Fresh squad invite after team change",
      teamId: input.team.id,
      prospectId: input.prospect.id,
      contactName: displayName,
      templateKey: MANAGED_SQUAD_JOIN_CONFIRMATION_TEMPLATE_KEY,
      joinConfirmationUrl,
    },
    emailBranding: {
      teamName: input.team.name,
      teamLogoUrl: input.team.logoUrl,
      leagueName,
    },
    createdByUserId: input.createdByUserId,
  });

  await logNotificationDispatchToThread({ dispatch, recipient });
  return dispatch;
}

function revalidateTeamSurfaces(teamId: string | null) {
  if (!teamId) return;
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/teams/${teamId}/squad`);
  revalidatePath(`/admin/teams/${teamId}/prospects`);
  revalidatePath(`/admin/teams/${teamId}/communications`);
  revalidatePath(`/captain/team/${teamId}/squad`);
  revalidatePath(`/captain/team/${teamId}/prospects`);
}

export async function GET() {
  try {
    await requireAdmin();

    const teams = await prisma.team.findMany({
      orderBy: [{ league: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        teamMode: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    });

    return NextResponse.json({
      items: teams.map((team) => ({
        id: team.id,
        label: `${team.name}${team.league?.name ? ` · ${team.league.name}` : ""}${
          team.league?.season ? ` ${team.league.season}` : ""
        } · ${team.teamMode}`,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAdmin();
    const body = (await request.json().catch(() => null)) as {
      prospectId?: unknown;
      teamId?: unknown;
      sendInvite?: unknown;
    } | null;

    const prospectId = typeof body?.prospectId === "string" ? body.prospectId.trim() : "";
    const teamId = typeof body?.teamId === "string" ? body.teamId.trim() : "";
    const sendInvite = body?.sendInvite === true;

    if (!prospectId || !teamId) {
      return NextResponse.json(
        { error: "Choose the player and their new team." },
        { status: 400 },
      );
    }

    const [prospect, team] = await Promise.all([
      prisma.teamPlayerProspect.findUnique({
        where: { id: prospectId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          teamId: true,
          status: true,
        },
      }),
      prisma.team.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          name: true,
          logoUrl: true,
          league: {
            select: {
              id: true,
              area: true,
              name: true,
              season: true,
              dayOfWeek: true,
              venueName: true,
            },
          },
        },
      }),
    ]);

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    }
    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    if (prospect.status === "DECLINED" || prospect.status === "DUPLICATE") {
      return NextResponse.json(
        { error: "Closed prospect records cannot be moved to another team." },
        { status: 409 },
      );
    }
    if (prospect.status === "ACTIVE_SQUAD") {
      return NextResponse.json(
        { error: "This player is already active. Move their squad membership from the team squad page instead." },
        { status: 409 },
      );
    }
    if (prospect.teamId === team.id) {
      return NextResponse.json(
        { error: "This player is already held under that team." },
        { status: 409 },
      );
    }

    const previousTeamId = prospect.teamId;

    await prisma.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: { teamId: team.id },
    });

    let inviteQueued = false;
    let warning: string | null = null;

    if (sendInvite) {
      const email = prospect.email?.trim().toLowerCase() ?? "";

      if (!email) {
        warning = "The team was changed, but no fresh squad invite was sent because the player has no email address.";
      } else {
        try {
          await queueFreshSquadInvite({
            prospect: {
              id: prospect.id,
              firstName: prospect.firstName,
              lastName: prospect.lastName,
              email,
              phone: prospect.phone,
            },
            team,
            createdByUserId: user?.id ?? null,
          });
          inviteQueued = true;

          await prisma.teamPlayerProspect.update({
            where: { id: prospect.id },
            data: {
              lastContactedAt: new Date(),
              status: prospect.status === "NEW" ? "CONTACTED" : undefined,
            },
          });
        } catch (error) {
          warning = `The team was changed, but the fresh squad invite could not be queued: ${routeError(error)}`;
        }
      }
    }

    revalidatePath("/admin/player-prospects");
    revalidatePath(`/admin/player-prospects/${prospect.id}/communications`);
    revalidatePath("/admin/messaging");
    revalidateTeamSurfaces(previousTeamId);
    revalidateTeamSurfaces(team.id);

    return NextResponse.json({
      ok: true,
      previousTeamId,
      teamId: team.id,
      teamName: team.name,
      inviteQueued,
      warning,
    });
  } catch (error) {
    return NextResponse.json({ error: routeError(error) }, { status: 500 });
  }
}
