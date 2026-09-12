import { randomUUID, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveTeamFixtureFeePence } from '@/lib/payments/fixture-fee-policy';
import { allocateVeoNight, normaliseVeoPitch, type VeoFixture, type VeoHistory } from './allocator';
import { readVeoSettings, londonVeoDate, validVeoDate } from './service';
import { readVeoOffer } from './priority-requests';
import { VEO_FIXTURE_TERMS, parseVeoFixtureChoice, veoCameraKey, veoVersion, validateVeoVideo, type VeoFixtureChoice } from './fixture-policy';

export class VeoBookingError extends Error {}
type Db = Pick<typeof prisma, '$queryRaw'|'$executeRaw'|'fixture'|'paymentCharge'>;
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
  const rows = teamId ? await db.$queryRaw<{id:string}[]>`SELECT u.id FROM "User" u JOIN "TeamMember" m ON m."userId"=u.id
    WHERE u.id=${userId} AND u.role::text <> 'ADMIN' AND m."teamId"=${teamId} AND m.role::text='CAPTAIN' AND COALESCE(m."isActive",true)`
    : await db.$queryRaw<{id:string}[]>`SELECT id FROM "User" WHERE id=${userId} AND role::text='ADMIN'`;
  if (!rows.length) throw new VeoBookingError(teamId ? 'Only an active captain of this exact team can save this choice.' : 'Administrator access is required.');
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
  if (![f.homeTeamId,f.awayTeamId].includes(teamId) || f.placeholder) return null;
  const settings = await readVeoSettings(f.leagueId, db);
  const request = await rowsForTeam(db, fixtureId, teamId);
  const offer = await readVeoOffer(f.leagueId, teamId, db);
  if ((!settings.enabled || !settings.confirmAtFixture || !offer) && !request) return null;
  const pref = (await db.$queryRaw<{enabled:boolean; updatedAt:Date}[]>`SELECT enabled,"updatedAt" FROM "VeoTeamPriority" WHERE "leagueId"=${f.leagueId} AND "teamId"=${teamId}`)[0];
  const sameMatch = request && request.homeTeamId===f.homeTeamId && request.awayTeamId===f.awayTeamId && +request.kickoffAt===+f.kickoffAt;
  const reason = !settings.enabled || !settings.confirmAtFixture || !offer ? 'Veo requests are not available for this team in this league.'
    : f.legacy ? 'Veo arrangements for this match were already agreed. Your existing fee stays unchanged.'
    : f.bookingState ? 'The Veo decision for this match has been made. Your confirmed booking stays unchanged.'
    : !f.publishedAt || f.status!=='SCHEDULED' || +f.kickoffAt<=Date.now() ? 'Veo choices are closed for this fixture.' : null;
  const video = f.bookingState === 'READY' ? (await db.$queryRaw<{url:string|null}[]>`SELECT "sixflTvUrl" AS url FROM "Fixture" WHERE id=${fixtureId}`)[0]?.url : null;
  return { available: !reason, reason, preference: pref?.enabled===true,
    defaultChoice: sameMatch ? request.choice : pref?.enabled ? 'ONGOING':'NONE',
    requestStatus: sameMatch ? request.status:null, bookingState:f.bookingState,
    agreedPence:sameMatch ? request.agreedPence:null, maxMatches:settings.maxMatches, videoUrl:video,
    version:veoVersion([f,pref??null,request?.revision??0,settings.revision,settings.enabled]) };
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
export async function saveFixtureVeoChoice(input:{fixtureId:string;teamId:string;actorId:string;choice:VeoFixtureChoice;termsVersion:string;version:string}) {
  const choice=parseVeoFixtureChoice(input.choice);
  if (input.termsVersion!==VEO_FIXTURE_TERMS) throw new VeoBookingError('The Veo offer changed. Refresh before making your choice.');
  return veoTransaction(async db => {
    await actor(db,input.actorId,input.teamId);
    const initial=await match(db,input.fixtureId);
    await db.$queryRaw`SELECT id FROM "League" WHERE id=${initial.leagueId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM "Fixture" WHERE id=${input.fixtureId} FOR UPDATE`;
    const f=await match(db,input.fixtureId);
    const offer=await readFixtureVeoOffer(input.fixtureId,input.teamId,db);
    if (!offer?.available) throw new VeoBookingError(offer?.reason??'Veo is not available for this team.');
    const previous=await rowsForTeam(db,input.fixtureId,input.teamId);
    if (previous?.choice===choice && previous.status===(choice==='NONE'?'NONE':'REQUESTED') && previous.actorId===input.actorId && previous.homeTeamId===f.homeTeamId && previous.awayTeamId===f.awayTeamId && +previous.kickoffAt===+f.kickoffAt) return previous.status;
    if (offer.version!==input.version) throw new VeoBookingError('This fixture or choice changed in another window. Refresh before saving.');
    const confirmed=await db.$queryRaw<{id:string}[]>`SELECT id FROM "FixtureCaptainConfirmation" WHERE "fixtureId"=${f.id} AND "teamId"=${input.teamId} AND status::text='CONFIRMED'`;
    if (!confirmed.length) throw new VeoBookingError('Confirm your team can play before requesting Veo.');
    if (choice==='ONGOING') await db.$executeRaw`INSERT INTO "VeoTeamPriority" ("leagueId","teamId",enabled,"updatedBy") VALUES (${f.leagueId},${input.teamId},true,${input.actorId})
      ON CONFLICT ("leagueId","teamId") DO UPDATE SET enabled=true,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
    await db.$executeRaw`INSERT INTO "VeoFixtureRequest" ("fixtureId","teamId","leagueId",choice,status,"actorId","termsVersion","homeTeamId","awayTeamId","kickoffAt")
      VALUES (${f.id},${input.teamId},${f.leagueId},${choice},${choice==='NONE'?'NONE':'REQUESTED'},${input.actorId},${VEO_FIXTURE_TERMS},${f.homeTeamId},${f.awayTeamId},${f.kickoffAt})
      ON CONFLICT ("fixtureId","teamId") DO UPDATE SET choice=EXCLUDED.choice,status=EXCLUDED.status,"actorId"=EXCLUDED."actorId","termsVersion"=EXCLUDED."termsVersion",
        "homeTeamId"=EXCLUDED."homeTeamId","awayTeamId"=EXCLUDED."awayTeamId","kickoffAt"=EXCLUDED."kickoffAt","requestedAt"=NOW(),revision="VeoFixtureRequest".revision+1`;
    await audit(db,f.leagueId,input.actorId,{kind:'fixture_veo_choice',fixtureId:f.id,choice,termsVersion:VEO_FIXTURE_TERMS},input.teamId);
    return choice==='NONE'?'NONE':'REQUESTED';
  });
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
  const validRequests=new Set<string>();
  for(const r of requests.filter(r=>r.status==='REQUESTED')) {
    const membership=await db.$queryRaw<{id:string}[]>`SELECT m.id FROM "TeamMember" m JOIN "User" u ON u.id=m."userId" WHERE m."teamId"=${r.teamId} AND m."userId"=${r.actorId} AND m.role::text='CAPTAIN' AND COALESCE(m."isActive",true) AND u.role::text<>'ADMIN'`;
    const offer=await readVeoOffer(r.leagueId,r.teamId,db);
    if(membership.length && offer && (r.choice!=='ONGOING'||offer.priority))validRequests.add(`${r.fixtureId}:${r.teamId}`);
  }
  const fixtures:NightMatch[]=rows.map(f=>{
    const own=requests.filter(r=>r.fixtureId===f.id);
    const requested=(teamId:string,mode:string)=>mode==='STANDARD' && own.some(r=>r.teamId===teamId && r.status==='REQUESTED' && validRequests.has(`${r.fixtureId}:${r.teamId}`) && r.termsVersion===VEO_FIXTURE_TERMS && r.homeTeamId===f.homeTeamId && r.awayTeamId===f.awayTeamId && +r.kickoffAt===+f.kickoffAt && confirmed.has(`${f.id}:${teamId}`));
    const homePriority=requested(f.homeTeamId,f.homeMode),awayPriority=requested(f.awayTeamId,f.awayMode);
    return {id:f.id,leagueId:f.leagueId,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeName:f.homeName,awayName:f.awayName,kickoffAt:f.kickoffAt,kickoffMs:+f.kickoffAt,venueId:f.venueId,pitch:f.pitch,durationMinutes:f.duration,
      locked:!!f.legacy || ['PLANNED','READY'].includes(f.bookingState) || f.sixflTvRecorded || !f.publishedAt || f.status!=='SCHEDULED' || +f.kickoffAt<=Date.now() || !leagueIds.includes(f.leagueId),
      eligible:!f.placeholder && !f.bookingState && (homePriority||awayPriority),homePriority,awayPriority,filmed:f.sixflTvRecorded || ['PLANNED','READY'].includes(f.bookingState),bookingState:f.bookingState,requestRows:own,
      homeBase:resolveTeamFixtureFeePence(f.homeMatchFeePence,f.homeStandard,f.matchFeePence),awayBase:resolveTeamFixtureFeePence(f.awayMatchFeePence,f.awayStandard,f.matchFeePence)};
  });
  const historyRows=await db.$queryRaw<{teamId:string;count:number;last:Date}[]>`SELECT side."teamId",COUNT(*)::integer AS count,MAX(f."kickoffAt") AS last
    FROM "Fixture" f CROSS JOIN LATERAL (VALUES(f."homeTeamId"),(f."awayTeamId")) side("teamId")
    LEFT JOIN "VeoMatchBooking" b ON b."fixtureId"=f.id WHERE f."venueId"=${settings.venueId}
      AND f."kickoffAt"<(SELECT MIN("kickoffAt") FROM "Fixture" WHERE "venueId"=${settings.venueId} AND to_char("kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date})
      AND f."sixflTvRecorded" AND (b.state IS NULL OR b.state='READY') AND f.status::text='COMPLETED' GROUP BY side."teamId"`;
  const history:VeoHistory=Object.fromEntries(historyRows.map(x=>[x.teamId,{count:x.count,lastMs:+x.last}]));
  const choices=allocateVeoNight(fixtures,{...settings,maxMatches:capacity},history);
  return {settings:{...settings,maxMatches:capacity},fixtures,choices,cameraKey,fingerprint:veoVersion([settings,sharing,fixtures,confirmations,history,choices])};
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
      for (const [teamId,priority,base] of [[f.homeTeamId,f.homePriority,f.homeBase],[f.awayTeamId,f.awayPriority,f.awayBase]] as const) {
        if (!priority) continue;
        await db.$executeRaw`UPDATE "VeoFixtureRequest" SET status='ACCEPTED',"basePence"=${base},"agreedPence"=${base>0?500:0},revision=revision+1 WHERE "fixtureId"=${f.id} AND "teamId"=${teamId} AND status='REQUESTED'`;
      }
    }
    for (const f of preview.fixtures) {
      if (selected.has(f.id) || f.locked) continue;
      await db.$executeRaw`UPDATE "VeoFixtureRequest" SET status='UNAVAILABLE',revision=revision+1 WHERE "fixtureId"=${f.id} AND status='REQUESTED'`;
    }
    await audit(db,leagueId,actorId,{kind:'fixture_veo_finalised',date,cameraKey:preview.cameraKey,choices:preview.choices,fingerprint,noBaseFeesChanged:true});
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
    const requests=await db.$queryRaw<RequestRow[]>`SELECT * FROM "VeoFixtureRequest" WHERE "fixtureId"=${f.id} AND status='ACCEPTED' ORDER BY "teamId" FOR UPDATE`;
    if (input.outcome==='READY') {
      for (const r of requests) {
        if (r.chargeId || r.agreedPence!==500) continue;
        const team=await db.$queryRaw<{id:string}[]>`SELECT id FROM "Team" WHERE id=${r.teamId} AND "teamMode"::text='STANDARD'`;
        if(!team.length)throw new VeoBookingError('The team payment model changed. Review this booking before billing.');
        const charge=await db.paymentCharge.create({data:{id:`veo_${randomUUID()}`,teamId:r.teamId,leagueId:f.leagueId,fixtureId:null,
          title:`Veo Priority — ${f.homeName} vs ${f.awayName} (${londonVeoDate(f.kickoffAt)})`,description:`Optional filming for fixture ${f.id}. Usable recording: ${video}. Original match fee unchanged.`,amountPence:500,dueDate:new Date(),paymentToken:randomBytes(24).toString('hex'),status:'OPEN',latePaymentFeeStatus:'WAIVED',latePaymentFeeNote:'No late fee on optional Veo recording.'},select:{id:true}});
        await db.$executeRaw`UPDATE "VeoFixtureRequest" SET "chargeId"=${charge.id},revision=revision+1 WHERE "fixtureId"=${f.id} AND "teamId"=${r.teamId}`;
      }
    }
    await db.$executeRaw`UPDATE "VeoMatchBooking" SET state=${input.outcome},"recordingNote"=${input.note.trim().slice(0,1000)},"updatedAt"=NOW() WHERE "fixtureId"=${f.id}`;
    if (input.outcome!=='READY') {
      await db.$executeRaw`UPDATE "VeoFixtureRequest" SET status='CANCELLED',revision=revision+1 WHERE "fixtureId"=${f.id} AND status='ACCEPTED'`;
      await db.$executeRaw`UPDATE "PaymentCharge" SET status='VOID',"updatedAt"=NOW() WHERE id IN (SELECT "chargeId" FROM "VeoFixtureRequest" WHERE "fixtureId"=${f.id})`;
    }
    await db.$executeRaw`UPDATE "Fixture" SET "sixflTvRecorded"=${input.outcome==='READY'},"sixflTvUrl"=${video},"updatedAt"=NOW() WHERE id=${f.id}`;
    await audit(db,f.leagueId,input.actorId,{kind:'veo_recording_outcome',fixtureId:f.id,outcome:input.outcome,videoUrl:video,note:input.note.trim(),baseFeesUnchanged:true});
  });
}
