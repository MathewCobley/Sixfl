// ========================================
// File: src/lib/managed-squads/invitations.ts
// ========================================

import { randomBytes } from "crypto";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildSIXFLFooterHtml, SIXFL_EMAIL_SIGNATURE_TEXT } from "@/lib/email/footer";
import { getEmailReplyDomain } from "@/lib/resend/client";
import { normalizePhoneNumber } from "@/lib/notifications/phone";

export const MANAGED_SQUAD_INVITE_SOURCE_TYPE = "MANAGED_SQUAD_INVITE";
export const MANAGED_SQUAD_TARGET_NIGHT = "TUESDAY";

type CandidateKind = "LEAD" | "PROSPECT";
type ResponseAnswer = "yes" | "no";

type Candidate = {
  kind: CandidateKind;
  id: string;
  name: string;
  firstName: string;
  email: string;
  phone: string | null;
  status: string | null;
  sourceLabel: string;
};

type ManagedSquadMetadata = {
  managedSquadToken: string;
  candidateKey: string;
  sourceKind: CandidateKind;
  sourceId: string;
  teamId: string;
  teamName: string;
  targetNight: typeof MANAGED_SQUAD_TARGET_NIGHT;
  response?: ResponseAnswer;
  canDoSomeTuesdays?: boolean | null;
  preferredPosition?: string | null;
  phone?: string | null;
  notes?: string | null;
  respondedAt?: string | null;
};

function getSiteUrl() {
  const fallback = "https://www.sixfl.co.uk";
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    fallback;

  return raw.replace(/\/+$/, "");
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Player";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

  return { firstName, lastName };
}

function getFirstName(name: string) {
  return splitName(name).firstName || "there";
}

function getToken() {
  return randomBytes(24).toString("base64url");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextInvite(input: {
  firstName: string;
  teamName: string;
  yesUrl: string;
  noUrl: string;
}) {
  return `Hi ${input.firstName},

We're putting together a new managed SIXFL team for Tuesday nights.

This is for players who want regular 6-a-side football but don't currently have a full team of their own.

You don't need to be available every week, but we do need players who can commit to at least some Tuesdays and be reliable when selected.

Please let us know:

Yes, I'm interested: ${input.yesUrl}
No, not for me: ${input.noUrl}

Thanks,

${SIXFL_EMAIL_SIGNATURE_TEXT}`.trim();
}

function buildManagedSquadInviteHtml(input: {
  firstName: string;
  teamName: string;
  yesUrl: string;
  noUrl: string;
}) {
  const safeFirstName = escapeHtml(input.firstName);
  const safeTeamName = escapeHtml(input.teamName);
  const safeYesUrl = escapeHtml(input.yesUrl);
  const safeNoUrl = escapeHtml(input.noUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>SIXFL</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    <center role="article" aria-roledescription="email" lang="en" style="width:100%;background:#f3f4f6;">
      <div style="background:#f3f4f6;padding:28px 12px;width:100%;box-sizing:border-box;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td style="padding:34px 32px 20px 32px;">
              <img src="https://www.sixfl.co.uk/sixfl-email.png" alt="SIXFL" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 30px 32px;">
              <div style="margin:0 0 24px 0;padding:16px 18px;border:1px solid #d1fae5;border-radius:16px;background:#ecfdf5;">
                <div style="margin:0 0 6px 0;color:#065f46;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Managed squad invite</div>
                <div style="color:#111827;font-size:16px;font-weight:700;line-height:1.4;">${safeTeamName}</div>
                <div style="margin-top:4px;color:#4b5563;font-size:13px;line-height:1.5;">Tuesday night 6-a-side football</div>
              </div>

              <p style="margin:0 0 18px 0;color:#111827;font-size:16px;line-height:1.65;">Hi ${safeFirstName},</p>

              <p style="margin:0 0 18px 0;color:#111827;font-size:16px;line-height:1.65;">We're putting together a new managed SIXFL team for Tuesday nights.</p>

              <p style="margin:0 0 18px 0;color:#111827;font-size:16px;line-height:1.65;">This is for players who want regular 6-a-side football but don't currently have a full team of their own.</p>

              <p style="margin:0 0 22px 0;color:#111827;font-size:16px;line-height:1.65;">You don't need to be available every week, but we do need players who can commit to at least some Tuesdays and be reliable when selected.</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px 0;border-collapse:separate;">
                <tr>
                  <td bgcolor="#1E5A43" style="border-radius:12px;background:#1E5A43;text-align:center;">
                    <a href="${safeYesUrl}" target="_blank" style="display:inline-block;background:#1E5A43;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700;font-size:15px;line-height:1.1;">Yes, I'm interested</a>
                  </td>
                  <td width="10" style="width:10px;">&nbsp;</td>
                  <td bgcolor="#f3f4f6" style="border-radius:12px;background:#f3f4f6;text-align:center;border:1px solid #d1d5db;">
                    <a href="${safeNoUrl}" target="_blank" style="display:inline-block;background:#f3f4f6;color:#374151;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:700;font-size:15px;line-height:1.1;">No, not for me</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 18px 0;color:#4b5563;font-size:14px;line-height:1.6;">If you click yes, we'll ask a few quick details about Tuesday availability and preferred position.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px 32px;">
              ${buildSIXFLFooterHtml()}
            </td>
          </tr>
        </table>
      </div>
    </center>
  </body>
</html>`;
}

function metadataRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }

  return value as Record<string, Prisma.JsonValue>;
}

function appendManagedNote(existing: string | null | undefined, note: string) {
  const cleanedExisting = existing?.trim();
  const cleanedNote = note.trim();

  if (!cleanedExisting) return cleanedNote;
  if (!cleanedNote) return cleanedExisting;

  return `${cleanedExisting}\n\n${cleanedNote}`;
}

export async function getManagedSquadInviteCandidates(teamId: string) {
  const [team, prospects, leads] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
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
    }),
    prisma.teamPlayerProspect.findMany({
      where: {
        teamId,
        email: {
          not: null,
        },
        NOT: {
          status: {
            in: ["DECLINED", "ACTIVE_SQUAD"],
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
      },
    }),
    prisma.interestLead.findMany({
      where: {
        interestType: "PLAYER",
        status: {
          not: "CLOSED",
        },
        email: {
          not: null,
        },
        OR: [
          {
            preferredNights: {
              some: {
                night: "TUESDAY",
              },
            },
          },
          {
            preferredNights: {
              some: {
                night: "ANY",
              },
            },
          },
          {
            preferredNights: {
              none: {},
            },
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        contactName: true,
        email: true,
        phone: true,
        status: true,
      },
    }),
  ]);

  if (!team) {
    throw new Error("Managed team not found.");
  }

  const seenEmails = new Set<string>();
  const candidates: Candidate[] = [];

  for (const prospect of prospects) {
    const email = normalizeEmail(prospect.email);
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);

    const name = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();

    candidates.push({
      kind: "PROSPECT",
      id: prospect.id,
      name: name || prospect.firstName || "Player",
      firstName: prospect.firstName || getFirstName(name),
      email,
      phone: prospect.phone,
      status: prospect.status,
      sourceLabel: "Managed squad prospect",
    });
  }

  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);

    candidates.push({
      kind: "LEAD",
      id: lead.id,
      name: lead.contactName,
      firstName: getFirstName(lead.contactName),
      email,
      phone: lead.phone,
      status: lead.status,
      sourceLabel: "Player interest lead",
    });
  }

  return { team, candidates };
}

async function ensureManagedSquadRecipient(candidate: Candidate) {
  const sourceType = candidate.kind === "LEAD" ? "LEAD" : "GENERAL";
  const sourceId = candidate.kind === "LEAD" ? candidate.id : `team-prospect:${candidate.id}`;
  const phoneNormalized = normalizePhoneNumber(candidate.phone);

  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType,
        sourceId,
      },
    },
    update: {
      audience: NotificationAudience.PLAYER,
      displayName: candidate.name,
      email: candidate.email,
      emailNormalized: candidate.email,
      phone: candidate.phone,
      phoneNormalized,
      transactionalEmailOptIn: true,
      marketingEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
      metadata: {
        managedSquadSourceKind: candidate.kind,
        managedSquadSourceId: candidate.id,
        sourceLabel: candidate.sourceLabel,
      },
      lastSyncedAt: new Date(),
    },
    create: {
      sourceType,
      sourceId,
      audience: NotificationAudience.PLAYER,
      displayName: candidate.name,
      email: candidate.email,
      emailNormalized: candidate.email,
      phone: candidate.phone,
      phoneNormalized,
      transactionalEmailOptIn: true,
      marketingEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingSmsOptIn: true,
      metadata: {
        managedSquadSourceKind: candidate.kind,
        managedSquadSourceId: candidate.id,
        sourceLabel: candidate.sourceLabel,
      },
      lastSyncedAt: new Date(),
      preferences: {
        create: {
          emailEnabled: true,
          marketingEmailEnabled: true,
          smsEnabled: true,
          marketingSmsEnabled: true,
        },
      },
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: {
      emailEnabled: true,
      marketingEmailEnabled: true,
      smsEnabled: true,
      marketingSmsEnabled: true,
      urgentSmsEnabled: true,
    },
    create: {
      recipientId: recipient.id,
      emailEnabled: true,
      marketingEmailEnabled: true,
      smsEnabled: true,
      marketingSmsEnabled: true,
      urgentSmsEnabled: true,
    },
  });

  return recipient;
}

async function alreadyInvitedRecently(candidateKey: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const existing = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
      createdAt: {
        gte: sevenDaysAgo,
      },
      metadata: {
        path: ["candidateKey"],
        equals: candidateKey,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(existing);
}

export async function queueTuesdayManagedSquadInvites(input: {
  teamId: string;
  createdByUserId?: string | null;
}) {
  getEmailReplyDomain();

  const { team, candidates } = await getManagedSquadInviteCandidates(input.teamId);
  const siteUrl = getSiteUrl();

  let queued = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const token = getToken();
    const candidateKey = `${candidate.kind}:${candidate.id}:${team.id}:${MANAGED_SQUAD_TARGET_NIGHT}`;

    if (await alreadyInvitedRecently(candidateKey)) {
      skipped += 1;
      continue;
    }

    const recipient = await ensureManagedSquadRecipient(candidate);
    const yesUrl = `${siteUrl}/managed-squad/respond?token=${encodeURIComponent(token)}&answer=yes`;
    const noUrl = `${siteUrl}/managed-squad/respond?token=${encodeURIComponent(token)}&answer=no`;

    const metadata: ManagedSquadMetadata = {
      managedSquadToken: token,
      candidateKey,
      sourceKind: candidate.kind,
      sourceId: candidate.id,
      teamId: team.id,
      teamName: team.name,
      targetNight: MANAGED_SQUAD_TARGET_NIGHT,
    };

    await prisma.notificationDispatch.create({
      data: {
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.PLAYER,
        status: NotificationDispatchStatus.QUEUED,
        isTransactional: true,
        subject: "Can you play Tuesday nights? New SIXFL team opportunity",
        bodyText: plainTextInvite({
          firstName: candidate.firstName,
          teamName: team.name,
          yesUrl,
          noUrl,
        }),
        bodyHtml: buildManagedSquadInviteHtml({
          firstName: candidate.firstName,
          teamName: team.name,
          yesUrl,
          noUrl,
        }),
        sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
        sourceId: team.id,
        metadata: metadata as unknown as Prisma.InputJsonValue,
        variables: {
          firstName: candidate.firstName,
          teamName: team.name,
          targetNight: MANAGED_SQUAD_TARGET_NIGHT,
        },
        createdByUserId: input.createdByUserId?.trim() || null,
      },
    });

    queued += 1;
  }

  return {
    queued,
    skipped,
    totalCandidates: candidates.length,
    teamName: team.name,
  };
}

export async function findManagedSquadInviteByToken(token: string) {
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  return prisma.notificationDispatch.findFirst({
    where: {
      sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
      metadata: {
        path: ["managedSquadToken"],
        equals: cleanToken,
      },
    },
    include: {
      recipient: true,
    },
  });
}

export async function recordManagedSquadInviteResponse(input: {
  token: string;
  answer: ResponseAnswer;
  canDoSomeTuesdays?: boolean | null;
  preferredPosition?: string | null;
  phone?: string | null;
  notes?: string | null;
}) {
  const dispatch = await findManagedSquadInviteByToken(input.token);

  if (!dispatch) {
    throw new Error("This managed squad invite could not be found.");
  }

  const metadata = metadataRecord(dispatch.metadata);
  const sourceKind = safeString(metadata.sourceKind) as CandidateKind;
  const sourceId = safeString(metadata.sourceId);
  const teamId = safeString(metadata.teamId);
  const teamName = safeString(metadata.teamName) || "Managed squad";
  const now = new Date();

  const responseMetadata: ManagedSquadMetadata = {
    ...(metadata as unknown as ManagedSquadMetadata),
    response: input.answer,
    canDoSomeTuesdays: input.answer === "yes" ? Boolean(input.canDoSomeTuesdays) : null,
    preferredPosition: input.preferredPosition?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    respondedAt: now.toISOString(),
  };

  await prisma.notificationDispatch.update({
    where: { id: dispatch.id },
    data: {
      metadata: responseMetadata as unknown as Prisma.InputJsonValue,
    },
  });

  if (sourceKind === "PROSPECT" && sourceId) {
    const note = `Managed squad Tuesday response (${now.toLocaleDateString("en-GB")}): ${
      input.answer === "yes" ? "Interested" : "Not interested"
    }${input.canDoSomeTuesdays ? "; can do at least some Tuesdays" : ""}${
      input.preferredPosition ? `; position: ${input.preferredPosition.trim()}` : ""
    }${input.notes ? `; notes: ${input.notes.trim()}` : ""}`;

    const existing = await prisma.teamPlayerProspect.findUnique({
      where: { id: sourceId },
      select: { notes: true },
    });

    await prisma.teamPlayerProspect.update({
      where: { id: sourceId },
      data: {
        status: input.answer === "yes" ? "TRIAL" : "DECLINED",
        phone: input.phone?.trim() || undefined,
        preferredPositions: input.preferredPosition?.trim() || undefined,
        availabilitySummary:
          input.answer === "yes"
            ? "Confirmed they can commit to at least some Tuesdays."
            : "Declined Tuesday managed squad invite.",
        notes: appendManagedNote(existing?.notes, note),
        lastContactedAt: now,
      },
    });
  }

  if (sourceKind === "LEAD" && sourceId) {
    const lead = await prisma.interestLead.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        contactName: true,
        email: true,
        phone: true,
        message: true,
      },
    });

    if (lead) {
      await prisma.interestLead.update({
        where: { id: lead.id },
        data: {
          status: input.answer === "yes" ? "QUALIFIED" : "CLOSED",
          contactedAt: now,
          closedAt: input.answer === "no" ? now : undefined,
          message: appendManagedNote(
            lead.message,
            `Managed squad Tuesday response (${now.toLocaleDateString("en-GB")}): ${
              input.answer === "yes" ? "Interested" : "Not interested"
            }${input.canDoSomeTuesdays ? "; can do at least some Tuesdays" : ""}${
              input.preferredPosition ? `; position: ${input.preferredPosition.trim()}` : ""
            }${input.notes ? `; notes: ${input.notes.trim()}` : ""}`,
          ),
        },
      });

      if (input.answer === "yes" && teamId) {
        const email = normalizeEmail(lead.email);
        const existingProspect = email
          ? await prisma.teamPlayerProspect.findFirst({
              where: {
                teamId,
                email,
              },
              select: {
                id: true,
                notes: true,
              },
            })
          : null;

        const { firstName, lastName } = splitName(lead.contactName);
        const prospectNote = `Created/updated from player interest lead after managed squad invite response for ${teamName}.`;

        if (existingProspect) {
          await prisma.teamPlayerProspect.update({
            where: { id: existingProspect.id },
            data: {
              status: "TRIAL",
              phone: input.phone?.trim() || lead.phone || undefined,
              preferredPositions: input.preferredPosition?.trim() || undefined,
              availabilitySummary: "Confirmed they can commit to at least some Tuesdays.",
              notes: appendManagedNote(existingProspect.notes, prospectNote),
              lastContactedAt: now,
            },
          });
        } else {
          await prisma.teamPlayerProspect.create({
            data: {
              teamId,
              firstName,
              lastName,
              email,
              phone: input.phone?.trim() || lead.phone || null,
              preferredPositions: input.preferredPosition?.trim() || null,
              availabilityLevel: "TUESDAY_SOME_WEEKS",
              preferredNights: ["TUESDAY"],
              availabilitySummary: "Confirmed they can commit to at least some Tuesdays.",
              source: "Managed squad invite response",
              status: "TRIAL",
              lastContactedAt: now,
              notes: prospectNote,
            },
          });
        }
      }
    }
  }

  return {
    answer: input.answer,
    teamName,
  };
}

export async function getManagedSquadFlowDashboard() {
  const managedTeams = await prisma.team.findMany({
    where: {
      teamMode: "MANAGED",
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      isRecruiting: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
      _count: {
        select: {
          prospects: true,
        },
      },
    },
  });

  const rows = [];

  for (const team of managedTeams) {
    const [{ candidates }, sent, interested, notInterested] = await Promise.all([
      getManagedSquadInviteCandidates(team.id),
      prisma.notificationDispatch.count({
        where: {
          sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
          sourceId: team.id,
        },
      }),
      prisma.notificationDispatch.count({
        where: {
          sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
          sourceId: team.id,
          metadata: {
            path: ["response"],
            equals: "yes",
          },
        },
      }),
      prisma.notificationDispatch.count({
        where: {
          sourceType: MANAGED_SQUAD_INVITE_SOURCE_TYPE,
          sourceId: team.id,
          metadata: {
            path: ["response"],
            equals: "no",
          },
        },
      }),
    ]);

    rows.push({
      ...team,
      candidateCount: candidates.length,
      invitesSent: sent,
      interested,
      notInterested,
    });
  }

  return rows;
}
