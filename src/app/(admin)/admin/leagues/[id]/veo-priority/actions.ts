'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { normaliseVeoPitch } from '@/lib/veo/allocator';
import { readVeoSettings, readVeoTeams, VeoAllocationError, validVeoDate } from '@/lib/veo/service';
import { approvePendingVeoRequests } from '@/lib/veo/priority-requests';

function back(leagueId: string, form: FormData, error?: string) {
  const query = new URLSearchParams(error ? { error } : { saved: '1' });
  const date = String(form.get('date') ?? '');
  if (validVeoDate(date)) query.set('date', date);
  revalidatePath(`/admin/leagues/${leagueId}`, 'layout');
  revalidatePath('/captain/team/[teamid]', 'page');
  redirect(`/admin/leagues/${leagueId}/veo-priority?${query}`);
}
function message(error: unknown) {
  if (error instanceof VeoAllocationError) return error.message;
  console.error('Unable to save Veo settings', error);
  return 'The change could not be saved. Refresh and try again.';
}
export async function saveVeoSettings(leagueId: string, form: FormData) {
  const { user } = await requireAdmin();
  let error: string | undefined;
  try {
    const enabled = form.get('enabled') === 'on';
    const pitch = String(form.get('pitch') ?? '').trim();
    const venueId = String(form.get('venueId') ?? '').trim() || null;
    const maxMatches = Number(form.get('maxMatches'));
    const revision = Number(form.get('revision'));
    if (pitch.length > 40 || (enabled && !normaliseVeoPitch(pitch))) throw new VeoAllocationError('Enter the Veo pitch label used in your fixtures.');
    if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 12) throw new VeoAllocationError('Choose between 1 and 12 matches per night.');
    await prisma.$transaction(async tx => {
      const leagues = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "League" WHERE id = ${leagueId} FOR UPDATE`;
      if (!leagues.length) throw new VeoAllocationError('League not found.');
      const previous = await readVeoSettings(leagueId, tx);
      if (previous.revision !== revision) throw new VeoAllocationError('These settings changed in another window. Refresh before saving.');
      if (enabled) {
        const pitches = await tx.$queryRaw<{ pitch: string | null }[]>`
          SELECT DISTINCT pitch FROM "Fixture" WHERE "leagueId" = ${leagueId}
          AND "venueId" IS NOT DISTINCT FROM ${venueId} AND status::text = 'SCHEDULED'
          AND "kickoffAt" > NOW() AT TIME ZONE 'UTC'
        `;
        if (!pitches.some(p => normaliseVeoPitch(p.pitch) === normaliseVeoPitch(pitch))) {
          throw new VeoAllocationError('No upcoming fixture uses that pitch at the selected venue. Check the fixture pitch labels first.');
        }
      }
      await tx.$executeRaw`
        INSERT INTO "VeoLeagueSettings" ("leagueId", enabled, pitch, "venueId", "maxMatches", "updatedBy")
        VALUES (${leagueId}, ${enabled}, ${pitch}, ${venueId}, ${maxMatches}, ${user?.id ?? null})
        ON CONFLICT ("leagueId") DO UPDATE SET enabled = EXCLUDED.enabled, pitch = EXCLUDED.pitch,
          "venueId" = EXCLUDED."venueId", "maxMatches" = EXCLUDED."maxMatches", "updatedBy" = EXCLUDED."updatedBy",
          "updatedAt" = NOW(), revision = "VeoLeagueSettings".revision + 1
      `;
      const details = JSON.stringify({ kind: 'league_settings', before: previous, after: { enabled, pitch, venueId, maxMatches }, supplementPence: 500 });
      await tx.$executeRaw`INSERT INTO "VeoSettingsAudit" (id, "leagueId", "actorId", details) VALUES (${randomUUID()}, ${leagueId}, ${user?.id ?? null}, ${details}::jsonb)`;
    });
  } catch (e) { error = message(e); }
  back(leagueId, form, error);
}
export async function setVeoTeamPriority(leagueId: string, form: FormData) {
  const { user } = await requireAdmin();
  let error: string | undefined;
  try {
    const teamId = String(form.get('teamId') ?? '');
    const enabled = form.get('enabled') === '1';
    if (enabled && form.get('agreed') !== 'on') throw new VeoAllocationError('Confirm the captain has agreed to the £5 supplement before switching Priority on.');
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "League" WHERE id = ${leagueId} FOR UPDATE`;
      const team = (await readVeoTeams(leagueId, tx)).find(t => t.id === teamId);
      if (!team || team.teamMode !== 'STANDARD') throw new VeoAllocationError('Choose a standard team in this league. Managed teams and placeholders cannot opt in.');
      if (team.priority !== (form.get('previous') === '1')) throw new VeoAllocationError('This team setting changed. Refresh before saving.');
      await tx.$executeRaw`
        INSERT INTO "VeoTeamPriority" ("leagueId", "teamId", enabled, "updatedBy")
        VALUES (${leagueId}, ${teamId}, ${enabled}, ${user?.id ?? null})
        ON CONFLICT ("leagueId", "teamId") DO UPDATE SET enabled = EXCLUDED.enabled, "updatedAt" = NOW(), "updatedBy" = EXCLUDED."updatedBy"
      `;
      if (enabled && user?.id) await approvePendingVeoRequests(tx, leagueId, teamId, user.id);
      const details = JSON.stringify({ kind: 'team_priority', before: team.priority, enabled, captainAgreementConfirmed: enabled, supplementPence: 500 });
      await tx.$executeRaw`INSERT INTO "VeoSettingsAudit" (id, "leagueId", "teamId", "actorId", details) VALUES (${randomUUID()}, ${leagueId}, ${teamId}, ${user?.id ?? null}, ${details}::jsonb)`;
    });
  } catch (e) { error = message(e); }
  revalidatePath('/captain/team/[teamid]/fixtures', 'layout');
  back(leagueId, form, error);
}
export async function saveVeoVideo(leagueId: string, form: FormData) {
  const { user } = await requireAdmin();
  let error: string | undefined;
  try {
    const fixtureId = String(form.get('fixtureId') ?? '');
    const raw = String(form.get('videoUrl') ?? '').trim();
    if (raw) {
      let url: URL;
      try { url = new URL(raw); } catch { throw new VeoAllocationError('Enter a full HTTPS YouTube or SIXFL TV link.'); }
      if (raw.length > 2000 || url.protocol !== 'https:' || url.username || url.password || url.port
        || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'sixfl.co.uk', 'www.sixfl.co.uk'].includes(url.hostname)) {
        throw new VeoAllocationError('Use an HTTPS YouTube or SIXFL TV link.');
      }
    }
    await prisma.$transaction(async tx => {
      // Media-only edit: completed fixtures keep their result, schedule and financial locks.
      const updated = await tx.$executeRaw`
        UPDATE "Fixture" f SET "sixflTvUrl" = ${raw || null}, "updatedAt" = NOW()
        FROM "VeoFixtureSnapshot" s WHERE s."fixtureId" = f.id AND f.id = ${fixtureId}
          AND s."leagueId" = ${leagueId} AND f."leagueId" = ${leagueId} AND s.allocated
      `;
      if (updated !== 1) throw new VeoAllocationError('No Veo allocation exists for this fixture in this league.');
      const details = JSON.stringify({ kind: 'video_link', fixtureId, url: raw || null });
      await tx.$executeRaw`INSERT INTO "VeoSettingsAudit" (id, "leagueId", "actorId", details) VALUES (${randomUUID()}, ${leagueId}, ${user?.id ?? null}, ${details}::jsonb)`;
    });
    revalidatePath('/captain/team/[teamid]/fixtures', 'layout');
    revalidatePath('/leagues/[slug]/fixtures', 'page');
    revalidatePath('/player/team/[teamid]', 'page');
  } catch (e) { error = message(e); }
  back(leagueId, form, error);
}
