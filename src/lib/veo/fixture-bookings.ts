import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveTeamFixtureFeePence } from '@/lib/payments/fixture-fee-policy';
import { allocateVeoNight, normaliseVeoPitch, type VeoFixture, type VeoHistory } from './allocator';
import { readVeoSettings, validVeoDate } from './service';
import { getSixflTvPriorityScores } from '@/lib/sixfl-tv/priority-score';
import { veoCameraKey, veoVersion, validateVeoVideo, type VeoFixtureChoice } from './fixture-policy';

export class VeoBookingError extends Error {}
type Db = Pick<typeof prisma, '$queryRaw'|'$executeRaw'|'fixture'>;
type RequestRow = { fixtureId: string; teamId: string; leagueId: string; choice: VeoFixtureChoice; status: string; actorId: string; termsVersion: string; homeTeamId: string; awayTeamId: string; kickoffAt: Date; revision: number; chargeId: string|null; basePence: number|null; agreedPence: number|null };
type MatchRow = { homeName:string; awayName:string; id: string; leagueId: string; homeTeamId: string; awayTeamId: string; kickoffAt: Date; publishedAt: Date|null; venueId: string|null; pitch: string|null; status: string; legacy: boolean; bookingState: string|null; placeholder: boolean };
export type FixtureVeoOffer = { available: boolean; reason: string|null; defaultChoice: VeoFixtureChoice; preference: boolean; requestStatus: string|null; bookingState: string|null; agreedPence: number|null; version: string; maxMatches: number; videoUrl?: string|null };
export async function veoTransaction<T>(work: (db: Db) => Promise<T>): Promise<T> {
  for (let n=0;;n++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000, maxWait: 10000 }); }
    catch (e) { if (n>=3 || !(e instanceof Prisma.PrismaClientKnownRequestError) || !(e.code==='P2034' || (e.code==='P2010' && ['40001','40P01','23505'].includes(String(e.meta?.code))))) throw e; }
  }
}
async function actor(db: Db, userId: string, teamId?: string) {
  const rows = teamId ? await db.$queryRaw<{id:string}[]>`SELECT u.id FROM "User" u
    WHERE u.id=${userId} AND (u.role::text='ADMIN' OR EXISTS (
      SELECT 1 FROM "TeamMember" m WHERE m."userId"=u.id AND m."teamId"=${teamId} AND m.role::text='CAPTAIN'
    ))`
    : await db.$queryRaw<{id:string}[]>`SELECT id FROM "User" WHERE id=${userId} AND role::text='ADMIN'`;
  if (!rows.length) throw new VeoBookingError(teamId ? 'Only an administrator or captain of this exact team can save this choice.' : 'Administrator access is required.');
}
async function match(db: Db, fixtureId: string): Promise<MatchRow> {
  const rows = await db.$queryRaw<MatchRow[]>`SELECT h.name AS "homeName",a.name AS "awayName",f.id,f."leagueId",f."homeTeamId",f."awayTeamId",f."kickoffAt",f."publishedAt",f."venueId",f.pitch,f.status::text,
    (h."isFixturePlaceholder" OR a."isFixturePlaceholder" OR h.id=a.id) AS placeholder,
    EXISTS(SELECT 1 FROM "VeoFixtureSnapshot" s WHERE s."fixtureId"=f.id) AS legacy,
    (SELECT b.state FROM "VeoMatchBooking" b WHERE b."fixtureId"=f.id) AS "bookingState"
    FROM "Fixture" f JOIN "Team" h ON h.id=f."homeTeamId" JOIN "Team" a ON a.id=f."awayTeamId" WHERE f.id=${fixtureId}`;
  if (!rows[0]) throw new VeoBookingError('Fixture not found.');
  return rows[0];
}
async function audit(db: Db, leagueId: string, actorId: string, details: object, teamId: string|null=null) {
  await db.$executeRaw`INSERT INTO "VeoSettingsAudit" (id,"leagueId","teamId","actorId",details) VALUES (${randomUUID()},${leagueId},${teamId},${actorId},${JSON.stringify(details)}::jsonb)`;
}
async function rowsForTeam(db: Db, fixtureId: string, teamId: string) {
  return (await db.$queryRaw<RequestRow[]>`SELECT * FROM "VeoFixtureRequest" WHERE "fixtureId"=${fixtureId} AND "teamId"=${teamId}`)[0] ?? null;
}
export async function readFixtureVeoOffer(fixtureId: string, teamId: string, db: Db = prisma): Promise<FixtureVeoOffer|null> {
  const f = await match(db, fixtureId);
  if (![f.homeTeamId, f.awayTeamId].includes(teamId) || f.placeholder) return null;
  const settings = await readVeoSettings(f.leagueId, db);
  const request = await rowsForTeam(db, fixtureId, teamId);
  if (!settings.enabled && !request && !f.bookingState) return null;
  const sameMatch = request && request.homeTeamId === f.homeTeamId && request.awayTeamId === f.awayTeamId && +request.kickoffAt === +f.kickoffAt;
  const video = f.bookingState === 'READY'
    ? (await db.$queryRaw<{url:string|null}[]>`SELECT "sixflTvUrl" AS url FROM "Fixture" WHERE id=${fixtureId}`)[0]?.url
    : null;
  return {
    available: false,
    reason: settings.enabled
      ? 'SIXFL TV Priority is earned automatically from your team score. There is no extra fee or opt-in.'
      : 'SIXFL TV recorded-pitch priority is not enabled for this league.',
    preference: false,
    defaultChoice: 'NONE',
    requestStatus: sameMatch ? request.status : null,
    bookingState: f.bookingState,
    agreedPence: sameMatch ? request.agreedPence : null,
    maxMatches: settings.maxMatches,
    videoUrl: video,
    version: veoVersion([f, request?.revision ?? 0, settings.revision, settings.enabled, 'earned-priority-v1']),
  };
}
/** Attendance is saved independently. A camera choice can never make a confirmed
 * team appear unavailable or charge anyone. Exact team membership is rechecked. */
export async function confirmCaptainAttendance(fixtureId:string,teamId:string,userId:string) {
  return veoTransaction(async db => {
    await actor(db,userId,teamId);
    await db.$queryRaw`SELECT id FROM "Fixture" WHERE id=${fixtureId} FOR UPDATE`;
    const f=await match(db,fixtureId);
    if (![f.homeTeamId,f.awayTeamId].includes(teamId) || !f.publishedAt || f.placeholder || f.status!=='SCHEDULED' || +f.kickoffAt<=Date.now()) throw new VeoBookingError('This fixture is not available for confirmation by this team.');
    await db.$executeRaw`INSERT INTO "FixtureCaptainConfirmation" (id,"fixtureId","teamId",status,"confirmedAt","confirmedByUserId","createdAt","updatedAt")
      VALUES (${randomUUID()},${fixtureId},${teamId},'CONFIRMED',NOW(),${userId},NOW(),NOW())
      ON CONFLICT ("fixtureId","teamId") DO UPDATE SET status='CONFIRMED',"confirmedAt"=COALESCE("FixtureCaptainConfirmation"."confirmedAt",NOW()),note=NULL,"issueRaisedAt"=NULL,"confirmedByUserId"=${userId},"updatedAt"=NOW()`;
  });
}
export async function saveFixtureVeoChoice(_input:{fixtureId:string;teamId:string;actorId:string;choice:VeoFixtureChoice;termsVersion:string;version:string}) {
  throw new VeoBookingError('SIXFL TV Priority is now earned automatically from your team score. There is no paid Veo Priority request to save.');
}
export async function stopFutureVeoPriority(teamId:string,leagueId:string,userId:string) {
  return veoTransaction(async db=>{
    await actor(db,userId,teamId);
    await db.$queryRaw`SELECT id FROM "League" WHERE id=${leagueId} FOR UPDATE`;
    await db.$executeRaw`UPDATE "VeoTeamPriority" SET enabled=false,"updatedBy"=${userId},"updatedAt"=NOW() WHERE "leagueId"=${leagueId} AND "teamId"=${teamId}`;
    await db.$executeRaw`UPDATE "VeoFixtureRequest" SET status='NONE',choice='NONE',revision=revision+1
      WHERE "leagueId"=${leagueId} AND "teamId"=${teamId} AND choice='ONGOING' AND status='REQUESTED' AND "kickoffAt">NOW() AT TIME ZONE 'UTC'`;
    await audit(db,leagueId,userId,{kind:'stop_future_priority',acceptedBookingsUnchanged:true},teamId);
  });
}

type NightMatch = VeoFixture & {leagueId:string;homeName:string;awayName:string;kickoffAt:Date;homeBase:number;awayBase:number;bookingState:string|null;requestRows:RequestRow[]};
export async function previewFixtureVeoNight(leagueId:string,date:string,db:Db=prisma) {
  if (!validVeoDate(date)) throw new VeoBookingError('Choose a valid match date.');
  const settings=await readVeoSettings(leagueId,db);
  if (!settings.enabled || !settings.confirmAtFixture) return {settings,fixtures:[] as NightMatch[],choices:[] as ReturnType<typeof allocateVeoNight>,fingerprint:'',cameraKey:''};
  if (!settings.venueId) throw new VeoBookingError('Choose a named Veo venue before accepting requests. Shared camera capacity cannot be checked against an unspecified venue.');
  const cameraKey=veoCameraKey(settings.venueId,settings.pitch,date);
  const configs=await db.$queryRaw<{leagueId:string;pitch:string;maxMatches:number;revision:number;confirmAtFixture:boolean}[]>`SELECT "leagueId",pitch,"maxMatches",revision,"confirmAtFixture" FROM "VeoLeagueSettings" WHERE enabled AND "venueId"=${settings.venueId} ORDER BY "leagueId"`;
  const sharing=configs.filter(x=>normaliseVeoPitch(x.pitch)===normaliseVeoPitch(settings.pitch));
  const leagueIds=sharing.filter(x=>x.confirmAtFixture).map(x=>x.leagueId);
  const capacity=Math.min(settings.maxMatches,...sharing.map(x=>x.maxMatches));
  const rows=await db.$queryRaw<any[]>`SELECT f.*, h.name AS "homeName",a.name AS "awayName",h."standardMatchFeePence" AS "homeStandard",a."standardMatchFeePence" AS "awayStandard",
    (h."isFixturePlaceholder" OR a."isFixturePlaceholder" OR h.id=a.id) AS placeholder,
    COALESCE(NULLIF(l."minutesPerGame",0),40) AS duration,
    EXISTS(SELECT 1 FROM "VeoFixtureSnapshot" s WHERE s."fixtureId"=f.id) AS legacy,
    b.state AS "bookingState",h."teamMode"::text AS "homeMode",a."teamMode"::text AS "awayMode"
    FROM "Fixture" f JOIN "League" l ON l.id=f."leagueId" JOIN "Team" h ON h.id=f."homeTeamId" JOIN "Team" a ON a.id=f."awayTeamId"
    LEFT JOIN "VeoMatchBooking" b ON b."fixtureId"=f.id
    WHERE f."venueId"=${settings.venueId} AND to_char(f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date}
      AND f.status::text NOT IN ('CANCELLED','POSTPONED') ORDER BY f."kickoffAt",f.id`;
  const requests=await db.$queryRaw<RequestRow[]>`SELECT r.* FROM "VeoFixtureRequest" r JOIN "Fixture" f ON f.id=r."fixtureId"
    WHERE f."venueId"=${settings.venueId} AND to_char(f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date} ORDER BY r."fixtureId",r."teamId"`;
  const confirmations=await db.$queryRaw<{fixtureId:string;teamId:string}[]>`SELECT c."fixtureId",c."teamId" FROM "FixtureCaptainConfirmation" c JOIN "Fixture" f ON f.id=c."fixtureId"
    WHERE f."venueId"=${settings.venueId} AND to_char(f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date} AND c.status::text='CONFIRMED' ORDER BY c."fixtureId",c."teamId"`;
  const confirmed=new Set(confirmations.map(x=>`${x.fixtureId}:${x.teamId}`));
  const teamIds=[...new Set(rows.flatMap(f=>[f.homeTeamId as string,f.awayTeamId as string]))];
  const priorityScores=await getSixflTvPriorityScores(teamIds,db);
  const fixtures:NightMatch[]=rows.map(f=>{
    const own=requests.filter(r=>r.fixtureId===f.id);
    const homeScore=priorityScores.get(f.homeTeamId);
    const awayScore=priorityScores.get(f.awayTeamId);
    const homePriority=Boolean(homeScore?.qualifies && confirmed.has(`${f.id}:${f.homeTeamId}`));
    const awayPriority=Boolean(awayScore?.qualifies && confirmed.has(`${f.id}:${f.awayTeamId}`));
    return {id:f.id,leagueId:f.leagueId,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeName:f.homeName,awayName:f.awayName,kickoffAt:f.kickoffAt,kickoffMs:+f.kickoffAt,venueId:f.venueId,pitch:f.pitch,durationMinutes:f.duration,
      locked:!!f.legacy || ['PLANNED','READY'].includes(f.bookingState) || f.sixflTvRecorded || !f.publishedAt || f.status!=='SCHEDULED' || +f.kickoffAt<=Date.now() || !leagueIds.includes(f.leagueId),
      eligible:!f.placeholder && !f.bookingState && (homePriority||awayPriority),
      homePriority,awayPriority,homePriorityScore:homeScore?.score??0,awayPriorityScore:awayScore?.score??0,
      filmed:f.sixflTvRecorded || ['PLANNED','READY'].includes(f.bookingState),bookingState:f.bookingState,requestRows:own,
      homeBase:resolveTeamFixtureFeePence(f.homeMatchFeePence,f.homeStandard,f.matchFeePence),awayBase:resolveTeamFixtureFeePence(f.awayMatchFeePence,f.awayStandard,f.matchFeePence)};
  });
  const historyRows=await db.$queryRaw<{teamId:string;count:number;last:Date}[]>`SELECT side."teamId",COUNT(*)::integer AS count,MAX(f."kickoffAt") AS last
    FROM "Fixture" f CROSS JOIN LATERAL (VALUES(f."homeTeamId"),(f."awayTeamId")) side("teamId")
    LEFT JOIN "VeoMatchBooking" b ON b."fixtureId"=f.id WHERE f."venueId"=${settings.venueId}
      AND f."kickoffAt"<(SELECT MIN("kickoffAt") FROM "Fixture" WHERE "venueId"=${settings.venueId} AND to_char("kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date})
      AND f."sixflTvRecorded" AND (b.state IS NULL OR b.state='READY') AND f.status::text='COMPLETED' GROUP BY side."teamId"`;
  const history:VeoHistory=Object.fromEntries(historyRows.map(x=>[x.teamId,{count:x.count,lastMs:+x.last}]));
  const choices=allocateVeoNight(fixtures,{...settings,maxMatches:capacity},history);
  const scoreFingerprint=[...priorityScores.values()].map(score=>({teamId:score.teamId,score:score.score,qualifies:score.qualifies,matchesCount:score.matchesCount}));
  return {settings:{...settings,maxMatches:capacity},fixtures,choices,cameraKey,fingerprint:veoVersion([settings,sharing,fixtures,confirmations,scoreFingerprint,history,choices])};
}
export async function finaliseFixtureVeoNight(leagueId:string,date:string,actorId:string,fingerprint:string) {
  return veoTransaction(async db=>{
    await actor(db,actorId);
    // All Veo publication/settings/choice writers lock leagues first. Sorted global
    // league locks additionally serialize the two divisions/leagues sharing a camera.
    const initialSettings=await readVeoSettings(leagueId,db);
    await db.$queryRaw`SELECT id FROM "League" WHERE id=${leagueId} OR id IN (SELECT "leagueId" FROM "VeoLeagueSettings" WHERE "venueId" IS NOT DISTINCT FROM ${initialSettings.venueId}) ORDER BY id FOR UPDATE`;
    const preview=await previewFixtureVeoNight(leagueId,date,db);
    if (!preview.cameraKey) throw new VeoBookingError('Veo is off for this league.');
    if (preview.fingerprint!==fingerprint) throw new VeoBookingError('The requests or fixtures changed. Review the refreshed preview before accepting.');
    await db.$queryRaw`SELECT id FROM "Fixture" WHERE "venueId"=${preview.settings.venueId} AND to_char("kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date} ORDER BY id FOR UPDATE`;
    const byId=new Map(preview.fixtures.map(f=>[f.id,f]));
    const selected=new Set(preview.choices.map(c=>c.fixtureId));
    for (const c of preview.choices) {
      const f=byId.get(c.fixtureId)!;
      if (c.swapWithId) await db.$executeRaw`UPDATE "Fixture" SET pitch=${f.pitch},"updatedAt"=NOW() WHERE id=${c.swapWithId}`;
      await db.$executeRaw`UPDATE "Fixture" SET pitch=${c.pitch},"sixflTvRecorded"=true,"updatedAt"=NOW() WHERE id=${f.id}`;
      await db.$executeRaw`INSERT INTO "VeoMatchBooking" ("fixtureId","leagueId","cameraKey","homeTeamId","awayTeamId","kickoffAt","venueId",pitch,"decidedBy")
        VALUES (${f.id},${f.leagueId},${preview.cameraKey},${f.homeTeamId},${f.awayTeamId},${f.kickoffAt},${f.venueId},${c.pitch},${actorId})`;
      await db.$executeRaw`UPDATE "VeoFixtureRequest" SET status='UNAVAILABLE',"agreedPence"=0,revision=revision+1 WHERE "fixtureId"=${f.id} AND status='REQUESTED'`;
    }
    for (const f of preview.fixtures) {
      if (selected.has(f.id) || f.locked) continue;
      await db.$executeRaw`UPDATE "VeoFixtureRequest" SET status='UNAVAILABLE',revision=revision+1 WHERE "fixtureId"=${f.id} AND status='REQUESTED'`;
    }
    await audit(db,leagueId,actorId,{kind:'fixture_veo_finalised',date,cameraKey:preview.cameraKey,choices:preview.choices,fingerprint,priorityModel:'SIXFL_TV_SCORE',noPriorityFees:true,noBaseFeesChanged:true});
    return preview.choices.length;
  });
}
/** A separate optional charge is created only after usable footage is confirmed.
 * Never edit the settled base fee, player shares, legacy snapshots or mandates. */
export async function setVeoRecordingOutcome(input:{leagueId:string;fixtureId:string;actorId:string;outcome:'READY'|'FAILED'|'CANCELLED';videoUrl?:string;note:string}) {
  const video=input.outcome==='READY'?validateVeoVideo(input.videoUrl??''):null;
  if (!['READY','FAILED','CANCELLED'].includes(input.outcome)) throw new VeoBookingError('Choose a recording outcome.');
  if (input.note.trim().length<5) throw new VeoBookingError('Add a short recording or cancellation note.');
  return veoTransaction(async db=>{
    await actor(db,input.actorId);
    await db.$queryRaw`SELECT id FROM "League" WHERE id=${input.leagueId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM "Fixture" WHERE id=${input.fixtureId} FOR UPDATE`;
    const f=await match(db,input.fixtureId);
    if (f.leagueId!==input.leagueId || !f.bookingState) throw new VeoBookingError('Booking not found in this league.');
    if (f.bookingState===input.outcome) return;
    if (['FAILED','CANCELLED'].includes(f.bookingState)) throw new VeoBookingError('This booking is already closed. It cannot be billed again.');
    if (input.outcome==='READY' && (f.status!=='COMPLETED' || +f.kickoffAt>Date.now())) throw new VeoBookingError('Confirm usable footage only after the fixture has been completed.');
    // New SIXFL TV Priority bookings never create a filming charge. Historic linked
    // charges remain untouched here; failed/cancelled historic bookings are still
    // handled by the existing cleanup below.
    await db.$executeRaw`UPDATE "VeoMatchBooking" SET state=${input.outcome},"recordingNote"=${input.note.trim().slice(0,1000)},"updatedAt"=NOW() WHERE "fixtureId"=${f.id}`;
    if (input.outcome!=='READY') {
      await db.$executeRaw`UPDATE "VeoFixtureRequest" SET status='CANCELLED',revision=revision+1 WHERE "fixtureId"=${f.id} AND status='ACCEPTED'`;
      await db.$executeRaw`UPDATE "PaymentCharge" SET status='VOID',"updatedAt"=NOW() WHERE id IN (SELECT "chargeId" FROM "VeoFixtureRequest" WHERE "fixtureId"=${f.id})`;
    }
    await db.$executeRaw`UPDATE "Fixture" SET "sixflTvRecorded"=${input.outcome==='READY'},"sixflTvUrl"=${video},"updatedAt"=NOW() WHERE id=${f.id}`;
    await audit(db,f.leagueId,input.actorId,{kind:'veo_recording_outcome',fixtureId:f.id,outcome:input.outcome,videoUrl:video,note:input.note.trim(),baseFeesUnchanged:true});
  });
}