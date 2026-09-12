import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { allocateVeoNight, normaliseVeoPitch, veoFee, type VeoHistory } from './allocator';
import { resolveTeamFixtureFeePence } from '@/lib/payments/fixture-fee-policy';
import { londonVeoDate, validVeoDate } from './service';

export const VEO_MATCH_TERMS = 'veo-match-choice-v1';
export type VeoMatchChoice = 'NONE' | 'MATCH' | 'ONGOING';
export class VeoConfirmationError extends Error {}
type Db = Pick<typeof prisma, '$queryRaw' | '$executeRaw'>;
type Fixture = {
  id: string; leagueId: string; venueId: string | null; kickoffAt: Date; pitch: string | null;
  homeTeamId: string; awayTeamId: string; homeName: string; awayName: string;
  status: string; publishedAt: Date | null; durationMinutes: number; filmed: boolean;
  homeMode: string; awayMode: string; placeholder: boolean; enabled: boolean; confirmationMode: boolean;
  cameraPitch: string | null; cameraVenue: string | null; capacity: number | null;
  homeFee: number | null; awayFee: number | null; homeStandard: number | null; awayStandard: number | null; fallbackFee: number | null;
  homeConfirmed: boolean; awayConfirmed: boolean; homePref: boolean; awayPref: boolean;
  homeChoice: string | null; awayChoice: string | null; homeStamp: string | null; awayStamp: string | null;
  homeTerms: string | null; awayTerms: string | null; legacyAllocated: boolean; decisionId: string | null;
};
export type VeoFixtureOffer = {
  fixtureId: string; leagueId: string; fixtureStamp: string; ongoing: boolean; choice: VeoMatchChoice;
  requested: boolean; closed: boolean; status: 'OPEN' | 'REQUESTED' | 'ACCEPTED' | 'NOT_SELECTED' | 'CANCELLED' | 'EXISTING';
  extraPence: number; capacity: number; basePence: number; termsVersion: string;
};
function validId(value: string) { if (!value || value.length > 200) throw new VeoConfirmationError('Refresh the page and try again.'); }
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function fixtureStamp(f: Pick<Fixture, 'id'|'homeTeamId'|'awayTeamId'|'kickoffAt'|'venueId'>) {
  return hash([f.id, f.homeTeamId, f.awayTeamId, f.kickoffAt.toISOString(), f.venueId]);
}
async function transact<T>(work: (db: Db) => Promise<T>): Promise<T> {
  for (let attempt=0;;attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }); }
    catch (e) {
      const retry = e instanceof Prisma.PrismaClientKnownRequestError && (e.code==='P2034' || (e.code==='P2010' && ['40001','40P01','23505'].includes(String(e.meta?.code))));
      if (!retry || attempt>=3) throw e;
    }
  }
}
async function actor(db: Db, actorId: string, teamId?: string) {
  validId(actorId);
  const rows = teamId ? await db.$queryRaw<{id:string}[]>`SELECT u.id FROM "User" u JOIN "TeamMember" m ON m."userId"=u.id
    WHERE u.id=${actorId} AND m."teamId"=${teamId} AND m.role::text='CAPTAIN' AND COALESCE(m."isActive",true) AND u.role::text<>'ADMIN'`
    : await db.$queryRaw<{id:string}[]>`SELECT id FROM "User" WHERE id=${actorId} AND role::text='ADMIN'`;
  if (!rows.length) throw new VeoConfirmationError(teamId ? 'Only your team captain can save this choice. Previews are read-only.' : 'Administrator access is required.');
}
async function audit(db: Db, leagueId: string, actorId: string, details: object, teamId: string | null = null) {
  await db.$executeRaw`INSERT INTO "VeoSettingsAudit" (id,"leagueId","teamId","actorId",details)
    VALUES (${randomUUID()},${leagueId},${teamId},${actorId},${JSON.stringify(details)}::jsonb)`;
}
// The same query supplies captain state and the whole physical camera night.
async function fixtures(db: Db, where: Prisma.Sql): Promise<Fixture[]> {
  return db.$queryRaw<Fixture[]>(Prisma.sql`SELECT f.id,f."leagueId",f."venueId",f."kickoffAt",f.pitch,
    f."homeTeamId",f."awayTeamId",h.name AS "homeName",a.name AS "awayName",f.status::text,f."publishedAt",
    COALESCE(NULLIF(l."minutesPerGame",0),40) AS "durationMinutes",f."sixflTvRecorded" AS filmed,
    h."teamMode"::text AS "homeMode",a."teamMode"::text AS "awayMode",
    (h."isFixturePlaceholder" OR a."isFixturePlaceholder" OR h.id=a.id) AS placeholder,
    COALESCE(v.enabled,false) AS enabled,COALESCE((to_jsonb(v)->>'confirmationMode')::boolean,false) AS "confirmationMode",
    v.pitch AS "cameraPitch",v."venueId" AS "cameraVenue",v."maxMatches" AS capacity,
    f."homeMatchFeePence" AS "homeFee",f."awayMatchFeePence" AS "awayFee",f."matchFeePence" AS "fallbackFee",
    h."standardMatchFeePence" AS "homeStandard",a."standardMatchFeePence" AS "awayStandard",
    COALESCE(hc.status::text='CONFIRMED',false) AS "homeConfirmed",COALESCE(ac.status::text='CONFIRMED',false) AS "awayConfirmed",
    COALESCE(hp.enabled,false) AS "homePref",COALESCE(ap.enabled,false) AS "awayPref",
    hm.choice AS "homeChoice",am.choice AS "awayChoice",hm."fixtureStamp" AS "homeStamp",am."fixtureStamp" AS "awayStamp",
    hm."termsVersion" AS "homeTerms",am."termsVersion" AS "awayTerms",COALESCE(s.allocated,false) AS "legacyAllocated",d."fixtureId" AS "decisionId"
    FROM "Fixture" f JOIN "League" l ON l.id=f."leagueId" JOIN "Team" h ON h.id=f."homeTeamId" JOIN "Team" a ON a.id=f."awayTeamId"
    LEFT JOIN "VeoLeagueSettings" v ON v."leagueId"=l.id
    LEFT JOIN "FixtureCaptainConfirmation" hc ON hc."fixtureId"=f.id AND hc."teamId"=h.id
    LEFT JOIN "FixtureCaptainConfirmation" ac ON ac."fixtureId"=f.id AND ac."teamId"=a.id
    LEFT JOIN "VeoTeamPriority" hp ON hp."leagueId"=l.id AND hp."teamId"=h.id
    LEFT JOIN "VeoTeamPriority" ap ON ap."leagueId"=l.id AND ap."teamId"=a.id
    LEFT JOIN "VeoMatchChoice" hm ON hm."fixtureId"=f.id AND hm."teamId"=h.id
    LEFT JOIN "VeoMatchChoice" am ON am."fixtureId"=f.id AND am."teamId"=a.id
    LEFT JOIN "VeoFixtureSnapshot" s ON s."fixtureId"=f.id LEFT JOIN "VeoMatchDecision" d ON d."fixtureId"=f.id
    WHERE ${where} ORDER BY f."kickoffAt",f.id`);
}
function side(f: Fixture, teamId: string) {
  if (![f.homeTeamId,f.awayTeamId].includes(teamId)) throw new VeoConfirmationError('This fixture does not belong to your team.');
  const home=f.homeTeamId===teamId;
  const pref=home?f.homePref:f.awayPref;
  const stored=home?f.homeChoice:f.awayChoice;
  const fresh=(home?f.homeStamp:f.awayStamp)===fixtureStamp(f) && (home?f.homeTerms:f.awayTerms)===VEO_MATCH_TERMS;
  // An explicit stale choice is not consent to a changed matchup. It must be
  // reconfirmed even if the captain previously selected an ongoing preference.
  const choice: VeoMatchChoice=stored ? fresh ? stored as VeoMatchChoice : 'NONE' : pref?'ONGOING':'NONE';
  return { home, pref, choice, requested: choice==='MATCH'||(choice==='ONGOING'&&pref),
    confirmed: home?f.homeConfirmed:f.awayConfirmed,
    standard:(home?f.homeMode:f.awayMode)==='STANDARD',
    base:resolveTeamFixtureFeePence(home?f.homeFee:f.awayFee,home?f.homeStandard:f.awayStandard,f.fallbackFee) };
}
async function currentMember(db:Db, leagueId:string,teamId:string) {
  const rows=await db.$queryRaw<{id:string}[]>`SELECT t.id FROM "Team" t JOIN "League" l ON l.id=${leagueId}
    LEFT JOIN "LeagueCompetition" c ON c.id=l."competitionId"
    WHERE t.id=${teamId} AND t."teamMode"::text='STANDARD' AND NOT t."isFixturePlaceholder" AND l."isActive"
    AND (c."currentLeagueId" IS NULL OR c."currentLeagueId"=l.id)
    AND (EXISTS(SELECT 1 FROM "LeagueSeasonTeam" m WHERE m."leagueId"=l.id AND m."teamId"=t.id AND m."isActive")
      OR (t."leagueId"=l.id AND NOT EXISTS(SELECT 1 FROM "LeagueSeasonTeam" m WHERE m."leagueId"=l.id)))`;
  return rows.length===1;
}
async function cameraClosed(db:Db,f:Fixture) {
  const rows=await db.$queryRaw<{id:string}[]>`SELECT id FROM "VeoCameraNight" WHERE "venueId"=${f.cameraVenue}
    AND pitch=${normaliseVeoPitch(f.cameraPitch)} AND "matchDate"=${londonVeoDate(f.kickoffAt)}`;
  return rows.length>0;
}
export async function readVeoFixtureOffer(teamId:string,fixtureId:string,db:Db=prisma):Promise<VeoFixtureOffer|null> {
  const f=(await fixtures(db,Prisma.sql`f.id=${fixtureId}`))[0];
  if (!f || ![f.homeTeamId,f.awayTeamId].includes(teamId) || !f.enabled || !f.confirmationMode || f.placeholder
    || !f.publishedAt || f.kickoffAt<=new Date() || f.status!=='SCHEDULED' || !await currentMember(db,f.leagueId,teamId)) return null;
  const s=side(f,teamId);
  const decisions=await db.$queryRaw<{allocated:boolean;failedAt:Date|null;homeExtraPence:number;awayExtraPence:number;homeRequested:boolean;awayRequested:boolean}[]>`SELECT * FROM "VeoMatchDecision" WHERE "fixtureId"=${fixtureId}`;
  const d=decisions[0];
  const closed=Boolean(d || f.legacyAllocated || f.filmed || await cameraClosed(db,f));
  return {fixtureId,leagueId:f.leagueId,fixtureStamp:fixtureStamp(f),ongoing:s.pref,choice:s.choice,requested:s.requested,closed,
    status:d?(d.failedAt?'CANCELLED':d.allocated&&(s.home?d.homeRequested:d.awayRequested)?'ACCEPTED':'NOT_SELECTED'):f.legacyAllocated||f.filmed?'EXISTING':closed?'NOT_SELECTED':s.requested?'REQUESTED':'OPEN',
    termsVersion:VEO_MATCH_TERMS,extraPence:d?(d.failedAt?0:s.home?d.homeExtraPence:d.awayExtraPence):0,capacity:f.capacity??3,basePence:s.base};
}
async function lockFixture(db:Db,fixtureId:string) {
  validId(fixtureId);
  const [f]=await db.$queryRaw<{leagueId:string}[]>`SELECT "leagueId" FROM "Fixture" WHERE id=${fixtureId}`;
  if (!f) throw new VeoConfirmationError('Fixture not found.');
  await db.$queryRaw`SELECT id FROM "League" WHERE id=${f.leagueId} FOR UPDATE`;
  await db.$queryRaw`SELECT id FROM "Fixture" WHERE id=${fixtureId} FOR UPDATE`;
}
export async function saveVeoMatchChoice(input:{teamId:string;fixtureId:string;actorId:string;choice:VeoMatchChoice;stamp:string;terms:string}) {
  if (!['NONE','MATCH','ONGOING'].includes(input.choice)||input.terms!==VEO_MATCH_TERMS) throw new VeoConfirmationError('Please review the current Veo choices and £5 price.');
  return transact(async db=>{
    await lockFixture(db,input.fixtureId); await actor(db,input.actorId,input.teamId);
    const offer=await readVeoFixtureOffer(input.teamId,input.fixtureId,db);
    if (!offer||offer.closed) throw new VeoConfirmationError('Veo requests have closed for this match. Your attendance confirmation is unaffected.');
    if (offer.fixtureStamp!==input.stamp) throw new VeoConfirmationError('The fixture has changed. Refresh and review it before choosing Veo.');
    const [confirmed]=await db.$queryRaw<{status:string}[]>`SELECT status::text FROM "FixtureCaptainConfirmation" WHERE "fixtureId"=${input.fixtureId} AND "teamId"=${input.teamId}`;
    if (confirmed?.status!=='CONFIRMED') throw new VeoConfirmationError('Confirm that your team can play before requesting Veo.');
    if (input.choice==='ONGOING') {
      await db.$executeRaw`INSERT INTO "VeoTeamPriority" ("leagueId","teamId",enabled,"updatedBy") VALUES (${offer.leagueId},${input.teamId},true,${input.actorId})
        ON CONFLICT ("leagueId","teamId") DO UPDATE SET enabled=true,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
      await db.$executeRaw`UPDATE "VeoPriorityRequest" SET status='APPROVED',"reviewedBy"=${input.actorId},"reviewedAt"=NOW()
        WHERE "leagueId"=${offer.leagueId} AND "teamId"=${input.teamId} AND status='PENDING'`;
    }
    await db.$executeRaw`INSERT INTO "VeoMatchChoice" ("fixtureId","teamId","leagueId",choice,"fixtureStamp","termsVersion","agreedPence","updatedBy")
      VALUES (${input.fixtureId},${input.teamId},${offer.leagueId},${input.choice},${input.stamp},${VEO_MATCH_TERMS},${input.choice==='NONE'?0:500},${input.actorId})
      ON CONFLICT ("fixtureId","teamId") DO UPDATE SET choice=EXCLUDED.choice,"fixtureStamp"=EXCLUDED."fixtureStamp","termsVersion"=EXCLUDED."termsVersion",
        "agreedPence"=EXCLUDED."agreedPence","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
    await audit(db,offer.leagueId,input.actorId,{kind:'fixture_veo_choice',fixtureId:input.fixtureId,choice:input.choice,terms:VEO_MATCH_TERMS,agreedPence:input.choice==='NONE'?0:500},input.teamId);
    return input.choice;
  });
}
// The normal match confirmation is committed independently: an optional Veo
// failure must never undo attendance or leave the captain thinking it was saved.
export async function confirmCaptainFixture(input:{teamId:string;fixtureId:string;actorId:string;stamp?:string}) {
  return transact(async db=>{
    await lockFixture(db,input.fixtureId); await actor(db,input.actorId,input.teamId);
    const f=(await fixtures(db,Prisma.sql`f.id=${input.fixtureId}`))[0];
    if (!f || f.placeholder || !f.publishedAt || f.kickoffAt<=new Date() || f.status!=='SCHEDULED') throw new VeoConfirmationError('This fixture is not available for confirmation.');
    side(f,input.teamId);
    if (input.stamp&&input.stamp!==fixtureStamp(f)) throw new VeoConfirmationError('The fixture changed. Refresh and check the opponent and time before confirming.');
    await db.$executeRaw`INSERT INTO "FixtureCaptainConfirmation" (id,"fixtureId","teamId",status,"confirmedAt","confirmedByUserId","createdAt","updatedAt")
      VALUES (${randomUUID()},${f.id},${input.teamId},'CONFIRMED',NOW(),${input.actorId},NOW(),NOW())
      ON CONFLICT ("fixtureId","teamId") DO UPDATE SET status='CONFIRMED',note=NULL,"confirmedAt"=NOW(),"issueRaisedAt"=NULL,"confirmedByUserId"=EXCLUDED."confirmedByUserId","updatedAt"=NOW()`;
    return f.leagueId;
  });
}
export async function stopOngoingVeo(teamId:string,leagueId:string,actorId:string) {
  return transact(async db=>{
    await db.$queryRaw`SELECT id FROM "League" WHERE id=${leagueId} FOR UPDATE`; await actor(db,actorId,teamId);
    if (!await currentMember(db,leagueId,teamId)) throw new VeoConfirmationError('This team is not in the current league.');
    await db.$executeRaw`UPDATE "VeoTeamPriority" SET enabled=false,"updatedBy"=${actorId},"updatedAt"=NOW() WHERE "leagueId"=${leagueId} AND "teamId"=${teamId}`;
    await db.$executeRaw`UPDATE "VeoMatchChoice" c SET choice='NONE',"agreedPence"=0,"updatedBy"=${actorId},"updatedAt"=NOW()
      FROM "Fixture" f WHERE f.id=c."fixtureId" AND c."teamId"=${teamId} AND c."leagueId"=${leagueId} AND c.choice='ONGOING'
      AND f."kickoffAt">NOW() AT TIME ZONE 'UTC' AND NOT EXISTS(SELECT 1 FROM "VeoMatchDecision" d WHERE d."fixtureId"=f.id)`;
    await audit(db,leagueId,actorId,{kind:'stop_future_veo',acceptedBookingsUnchanged:true},teamId);
  });
}
export async function previewConfirmationVeoNight(leagueId:string,date:string,db:Db=prisma) {
  if (!validVeoDate(date)) throw new VeoConfirmationError('Choose a valid match date.');
  const [settings]=await db.$queryRaw<{venueId:string|null;pitch:string;maxMatches:number;enabled:boolean;confirmationMode:boolean}[]>`SELECT * FROM "VeoLeagueSettings" WHERE "leagueId"=${leagueId}`;
  if (!settings?.enabled||!settings.confirmationMode) return null;
  if (!settings.venueId||!normaliseVeoPitch(settings.pitch)) throw new VeoConfirmationError('Choose the actual venue and Veo pitch in League settings first.');
  const pitch=normaliseVeoPitch(settings.pitch),venueId=settings.venueId;
  const rows=await fixtures(db,Prisma.sql`f."venueId"=${venueId} AND to_char(f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London','YYYY-MM-DD')=${date} AND f.status::text NOT IN ('CANCELLED','POSTPONED')`);
  const scope=rows.filter(f=>f.enabled&&f.confirmationMode&&f.cameraVenue===venueId&&normaliseVeoPitch(f.cameraPitch)===pitch);
  if (scope.some(f=>f.capacity!==settings.maxMatches)) throw new VeoConfirmationError('Leagues sharing this camera pitch must have the same nightly capacity.');
  const [night]=await db.$queryRaw<{id:string}[]>`SELECT id FROM "VeoCameraNight" WHERE "venueId"=${venueId} AND pitch=${pitch} AND "matchDate"=${date}`;
  const historyRows=await db.$queryRaw<{teamId:string;count:number;last:Date}[]>`SELECT side."teamId",COUNT(*)::integer AS count,MAX(f."kickoffAt") AS last
    FROM "Fixture" f CROSS JOIN LATERAL (VALUES(f."homeTeamId"),(f."awayTeamId")) AS side("teamId")
    WHERE f."sixflTvRecorded" AND f.status::text='COMPLETED' AND f."kickoffAt"<${new Date(`${date}T00:00:00Z`)}
      AND NOT EXISTS(SELECT 1 FROM "VeoMatchDecision" d WHERE d."fixtureId"=f.id AND d."failedAt" IS NOT NULL) GROUP BY side."teamId"`;
  const history:VeoHistory=Object.fromEntries(historyRows.map(r=>[r.teamId,{count:r.count,lastMs:r.last.getTime()}]));
  const inScope=new Set(scope.map(f=>f.id));
  const eligibleMembers=new Set<string>();
  for(const f of scope) for(const teamId of [f.homeTeamId,f.awayTeamId]) if(await currentMember(db,f.leagueId,teamId)) eligibleMembers.add(`${f.leagueId}:${teamId}`);
  const candidates=rows.map(f=>{
    const h=side(f,f.homeTeamId),a=side(f,f.awayTeamId);
    const locked=!inScope.has(f.id)||f.legacyAllocated||f.filmed||Boolean(f.decisionId)||f.kickoffAt<=new Date()||!f.publishedAt;
    return {...f,kickoffMs:f.kickoffAt.getTime(),homePriority:h.standard&&h.requested&&h.confirmed&&eligibleMembers.has(`${f.leagueId}:${f.homeTeamId}`),awayPriority:a.standard&&a.requested&&a.confirmed&&eligibleMembers.has(`${f.leagueId}:${f.awayTeamId}`),
      locked,eligible:!f.placeholder&&f.status==='SCHEDULED'&&Boolean(f.publishedAt),
      filmed:f.filmed||f.legacyAllocated||(!inScope.has(f.id)&&normaliseVeoPitch(f.pitch)===pitch)};
  });
  const choices=night?[]:allocateVeoNight(candidates,{enabled:true,pitch:settings.pitch,venueId,maxMatches:settings.maxMatches},history);
  const selected=new Set(choices.map(c=>c.fixtureId));
  const finalPitches=new Map(rows.map(f=>[f.id,f.pitch]));
  for (const c of choices) { finalPitches.set(c.fixtureId,c.pitch); if(c.swapWithId) finalPitches.set(c.swapWithId,rows.find(f=>f.id===c.fixtureId)!.pitch); }
  const items=candidates.filter(f=>inScope.has(f.id)).map(f=>{
    const h=side(f,f.homeTeamId),a=side(f,f.awayTeamId);
    return {fixtureId:f.id,leagueId:f.leagueId,homeName:f.homeName,awayName:f.awayName,kickoffAt:f.kickoffAt.toISOString(),
      originalPitch:f.pitch,pitch:finalPitches.get(f.id)??null,allocated:selected.has(f.id),locked:f.locked,
      homeRequested:f.homePriority,awayRequested:f.awayPriority,
      homeExtra:veoFee(h.base,f.homePriority,selected.has(f.id)).supplementPence,awayExtra:veoFee(a.base,f.awayPriority,selected.has(f.id)).supplementPence};
  });
  return {venueId,pitch,date,capacity:settings.maxMatches,nightId:night?.id??null,items,rows,candidates,
    digest:hash({settings,rows,items,history,night:night?.id??null}),
    canFinalise:!night&&scope.length>0&&scope.every(f=>f.publishedAt&&f.kickoffAt>new Date()),
    missingConfirmations:scope.reduce((n,f)=>n+(f.homeConfirmed?0:1)+(f.awayConfirmed?0:1),0)};
}
export async function finaliseConfirmationVeoNight(input:{leagueId:string;date:string;actorId:string;digest:string}) {
  return transact(async db=>{
    await actor(db,input.actorId);
    const first=await previewConfirmationVeoNight(input.leagueId,input.date,db);
    if(!first) throw new VeoConfirmationError('Veo confirmation choices are off for this league.');
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`veo-camera:${first.venueId}:${first.pitch}:${input.date}`}))::text`;
    for(const league of [...new Set(first.rows.map(f=>f.leagueId))].sort()) await db.$queryRaw`SELECT id FROM "League" WHERE id=${league} FOR UPDATE`;
    for(const f of [...first.rows].sort((a,b)=>a.id.localeCompare(b.id))) await db.$queryRaw`SELECT id FROM "Fixture" WHERE id=${f.id} FOR UPDATE`;
    const plan=await previewConfirmationVeoNight(input.leagueId,input.date,db);
    if(!plan) throw new VeoConfirmationError('Veo is no longer enabled.');
    if(plan.nightId) return {nightId:plan.nightId,alreadyFinalised:true,chargedPence:0};
    if(!plan.canFinalise) throw new VeoConfirmationError('Publish every fixture for this camera night and finalise before the first kick-off.');
    if(plan.digest!==input.digest) throw new VeoConfirmationError('A fixture, confirmation or Veo choice changed. Review the refreshed preview before finalising.');
    const nightId=randomUUID();
    await db.$executeRaw`INSERT INTO "VeoCameraNight" (id,"venueId",pitch,"matchDate",capacity,"finalisedBy") VALUES (${nightId},${plan.venueId},${plan.pitch},${plan.date},${plan.capacity},${input.actorId})`;
    let chargedPence=0;
    for(const item of plan.items) {
      if(item.locked) continue;
      const f=plan.rows.find(f=>f.id===item.fixtureId)!; if(f.placeholder) continue;
      const h=side(f,f.homeTeamId),a=side(f,f.awayTeamId);
      await db.$executeRaw`INSERT INTO "VeoMatchDecision" ("fixtureId","nightId","leagueId","homeTeamId","awayTeamId","kickoffAt","venueId","originalPitch",pitch,allocated,"homeRequested","awayRequested","homeBasePence","awayBasePence","homeExtraPence","awayExtraPence")
        VALUES (${f.id},${nightId},${f.leagueId},${f.homeTeamId},${f.awayTeamId},${f.kickoffAt},${plan.venueId},${f.pitch},${item.pitch},${item.allocated},${item.homeRequested},${item.awayRequested},${h.base},${a.base},${item.homeExtra},${item.awayExtra})`;
      // Only pitch/TV-plan fields change. Opponents, kickoff, fees, receipts and
      // immutable publication snapshots are deliberately untouched.
      await db.$executeRaw`UPDATE "Fixture" SET pitch=${item.pitch},"sixflTvRecorded"=${item.allocated},"updatedAt"=NOW() WHERE id=${f.id} AND status::text='SCHEDULED'`;
      for(const [teamId,extra] of [[f.homeTeamId,item.homeExtra],[f.awayTeamId,item.awayExtra]] as const) {
        if(!extra) continue;
        const chargeId=`veo_${randomUUID()}`, token=randomUUID().replaceAll('-','');
        const title=`Veo Priority — ${f.homeName} vs ${f.awayName} — ${plan.date}`;
        await db.$executeRaw`INSERT INTO "PaymentCharge" (id,"teamId","leagueId",title,description,"amountPence","dueDate",status,"paymentToken","latePaymentFeeStatus","latePaymentFeeAmountPence","latePaymentFeeNote","createdAt","updatedAt")
          VALUES (${chargeId},${teamId},${f.leagueId},${title},'Optional Veo recording: separate from the original match fee. Cancelled or credited if recording fails.',${extra},${f.kickoffAt},'OPEN',${token},'WAIVED',0,'No separate late fee on the Veo add-on.',NOW(),NOW())`;
        await db.$executeRaw`INSERT INTO "VeoMatchAddon" ("chargeId","fixtureId","teamId") VALUES (${chargeId},${f.id},${teamId})`;
        chargedPence+=extra;
      }
      for(const [teamId,requested,extra] of [[f.homeTeamId,item.homeRequested,item.homeExtra],[f.awayTeamId,item.awayRequested,item.awayExtra]] as const) {
        if(item.allocated || requested || item.pitch!==item.originalPitch) {
          const kind=item.allocated?(extra?'ACCEPTED':'FREE'):requested?'NO_SLOT':'PITCH_CHANGED';
          await db.$executeRaw`INSERT INTO "VeoMatchNotice" (id,"fixtureId","teamId",kind) VALUES (${randomUUID()},${f.id},${teamId},${kind}) ON CONFLICT ("fixtureId","teamId",kind) DO NOTHING`;
        }
      }
      await audit(db,f.leagueId,input.actorId,{kind:'veo_match_finalised',nightId,...item});
    }
    return {nightId,alreadyFinalised:false,chargedPence};
  });
}
export async function failVeoRecording(input:{fixtureId:string;leagueId:string;actorId:string;reason:string}) {
  if(input.reason.trim().length<5||input.reason.length>1000) throw new VeoConfirmationError('Please give a short reason for the missing recording.');
  return transact(async db=>{
    await actor(db,input.actorId);await lockFixture(db,input.fixtureId);
    const [d]=await db.$queryRaw<{allocated:boolean;failedAt:Date|null}[]>`SELECT allocated,"failedAt" FROM "VeoMatchDecision" WHERE "fixtureId"=${input.fixtureId} AND "leagueId"=${input.leagueId} FOR UPDATE`;
    if(!d?.allocated) throw new VeoConfirmationError('This fixture has no confirmed Veo booking in the new system.');
    if(d.failedAt) return;
    await db.$executeRaw`UPDATE "VeoMatchDecision" SET "failedAt"=NOW(),"failureReason"=${input.reason.trim()} WHERE "fixtureId"=${input.fixtureId}`;
    await db.$executeRaw`UPDATE "VeoMatchAddon" SET "cancelledAt"=NOW(),"cancelReason"=${input.reason.trim()} WHERE "fixtureId"=${input.fixtureId} AND "cancelledAt" IS NULL`;
    await db.$executeRaw`UPDATE "NotificationDispatch" SET status='CANCELLED',"failureReason"='Veo recording unavailable',"updatedAt"=NOW()
      WHERE "sourceType"='FIXTURE_VEO_BOOKING' AND "sourceId"=${input.fixtureId} AND status::text IN ('QUEUED','PROCESSING')`;
    await db.$executeRaw`UPDATE "Fixture" SET "sixflTvRecorded"=false,"sixflTvUrl"=NULL,"updatedAt"=NOW() WHERE id=${input.fixtureId}`;
    await db.$executeRaw`INSERT INTO "VeoMatchNotice" (id,"fixtureId","teamId",kind)
      SELECT 'failed_'||d."fixtureId"||'_'||side."teamId",d."fixtureId",side."teamId",'FAILED'
      FROM "VeoMatchDecision" d CROSS JOIN LATERAL (VALUES(d."homeTeamId"),(d."awayTeamId")) AS side("teamId")
      WHERE d."fixtureId"=${input.fixtureId} ON CONFLICT ("fixtureId","teamId",kind) DO NOTHING`;
    await audit(db,input.leagueId,input.actorId,{kind:'veo_recording_failed',fixtureId:input.fixtureId,reason:input.reason.trim(),unpaidAddonsVoided:true,paidAddonsCredited:true});
  });
}
export async function readConfirmationVeoDecisions(leagueId:string,date:string,db:Db=prisma) {
  return db.$queryRaw<(Record<string,unknown>&{fixtureId:string;leagueId:string;homeName:string;awayName:string;allocated:boolean;failedAt:Date|null;failureReason:string|null;pitch:string|null;homeExtraPence:number;awayExtraPence:number})[]>`
    SELECT d.*,h.name AS "homeName",a.name AS "awayName",f."sixflTvUrl"
    FROM "VeoMatchDecision" d JOIN "Fixture" f ON f.id=d."fixtureId" JOIN "Team" h ON h.id=d."homeTeamId" JOIN "Team" a ON a.id=d."awayTeamId"
    JOIN "VeoCameraNight" n ON n.id=d."nightId" WHERE n."matchDate"=${date} AND (d."leagueId"=${leagueId} OR EXISTS
      (SELECT 1 FROM "VeoLeagueSettings" s WHERE s."leagueId"=${leagueId} AND s."venueId"=n."venueId" AND trim(lower(regexp_replace(s.pitch,'^(pitch[[:space:]]*)+','','i')))=n.pitch)) ORDER BY d."kickoffAt",d."fixtureId"`;
}
