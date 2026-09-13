import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTeamOperationalEmailContacts } from "@/lib/notifications/team-operational-recipients";
import { buildQueuedContentFromTemplate, queueNotificationFromTemplate } from "@/lib/notifications/service";
import { getUnresolvedEmailPlaceholderReason } from "@/lib/notifications/renderer";
import { parseLondonDateTime, toLondonDateInputValue, toLondonTimeInputValue } from "@/lib/datetime/london";
import { assertCupAdmin, assertCupOpen, cupTerms, eligibleCupTeams, isCupEntrant, loadCup, loadInvitation, type Cup, type CupDb, type Invitation } from "./invitation-data";
import { CUP_MAIL_SOURCES, CupInvitationError, cupDate, cupResponseToken, money, readCupResponseToken, summaryCounts, type CupMailKind, type CupTerms } from "./invitation-policy";

const failure = (error: unknown) => error instanceof CupInvitationError ? error.message : "SIXFL could not complete this action. Please refresh and try again.";
export { failure as cupErrorMessage };
const json = (value: unknown) => JSON.stringify(value);
const fingerprint = (value: unknown) => createHash("sha256").update(json(value)).digest("hex");
const baseUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://www.sixfl.co.uk").replace(/\/+$/, "");
export async function cupAudit(db: CupDb, cupId: string, teamId: string | null, actorId: string | null, actorName: string, event: string, details: unknown) {
  await db.$executeRaw`INSERT INTO "CupInvitationAudit" (id,"cupLeagueId","teamId","actorUserId","actorName",event,details)
    VALUES (${randomUUID()},${cupId},${teamId},${actorId},${actorName},${event},${json(details)}::jsonb)`;
}
async function cancelCupMail(db: CupDb, cupId: string, teamId: string | null, reason: string) {
  await db.$executeRaw`UPDATE "NotificationDispatch" d SET status='CANCELLED',"cancelledAt"=NOW(),"failureReason"=${reason},"updatedAt"=NOW()
    FROM "CupInvitationMessage" m JOIN "CupInvitation" i ON i.id=m."invitationId"
    WHERE d.id=m."dispatchId" AND i."cupLeagueId"=${cupId} AND (${teamId}::text IS NULL OR i."teamId"=${teamId}) AND d.status='QUEUED'`;
}
export async function saveCupInvitationSettings(input: { cupId: string; actorId: string; expectedVersion: number; fee: string; venueNote: string; scheduleNote: string; deadlineDate: string; deadlineTime: string; state: string }) {
  const pounds = input.fee.trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(pounds) || Number(pounds) > 1000) throw new CupInvitationError("Enter a match fee between £0 and £1,000.");
  const fee = Math.round(Number(pounds)*100);
  let deadline: Date;
  try { deadline = parseLondonDateTime(input.deadlineDate, input.deadlineTime); } catch { throw new CupInvitationError("Choose a valid response deadline (UK time)."); }
  if (toLondonDateInputValue(deadline) !== input.deadlineDate || toLondonTimeInputValue(deadline) !== input.deadlineTime) throw new CupInvitationError("That UK date/time does not exist. Choose a valid deadline.");
  const venue = input.venueNote.trim(), schedule = input.scheduleNote.trim();
  if (!venue || venue.length > 1000 || !schedule || schedule.length > 1500) throw new CupInvitationError("Provide locations and scheduling details (up to 1,000 / 1,500 characters).");
  if (!["DRAFT","OPEN","CLOSED"].includes(input.state)) throw new CupInvitationError("Choose Draft, Open or Closed.");
  if (input.state === "OPEN" && deadline <= new Date()) throw new CupInvitationError("The deadline must be in the future before opening invitations.");
  return prisma.$transaction(async db => {
    const actor = await assertCupAdmin(input.actorId, db), cup = await loadCup(input.cupId, db, true);
    if ((cup.settings?.revision ?? 0) !== input.expectedVersion) throw new CupInvitationError("Cup setup changed in another window. Refresh before saving.");
    const proposedTerms: CupTerms = { cupName: cup.name, cupFormat: cup.cupFormat === "GROUPS_THEN_KNOCKOUT" ? "groups then knockout" : "straight knockout", matchFeePence: fee, venueNote: venue, scheduleNote: schedule, responseDeadline: deadline.toISOString() };
    const termsHash = fingerprint(proposedTerms);
    const changed = cup.settings?.termsHash !== termsHash;
    const version = (cup.settings?.version ?? 0) + (changed ? 1 : 0);
    const revision = (cup.settings?.revision ?? 0) + 1;
    await db.$executeRaw`INSERT INTO "CupInvitationSettings" ("cupLeagueId","matchFeePence","venueNote","scheduleNote","responseDeadline",state,version,revision,"termsHash","updatedByUserId")
      VALUES (${cup.id},${fee},${venue},${schedule},${deadline},${input.state},${version},${revision},${termsHash},${actor.id})
      ON CONFLICT ("cupLeagueId") DO UPDATE SET "matchFeePence"=EXCLUDED."matchFeePence","venueNote"=EXCLUDED."venueNote","scheduleNote"=EXCLUDED."scheduleNote",
      "responseDeadline"=EXCLUDED."responseDeadline",state=EXCLUDED.state,version=EXCLUDED.version,revision=EXCLUDED.revision,"termsHash"=EXCLUDED."termsHash","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=NOW()`;
    if (changed || input.state !== "OPEN") await cancelCupMail(db, cup.id, null, "Cup invitation details changed or invitations were closed.");
    await cupAudit(db,cup.id,null,actor.id,actor.name || "Administrator","SETTINGS_SAVED",{version,revision,state:input.state,detailsChanged:changed});
    return {version,revision,detailsChanged:changed};
  });
}
export type CupReportRow = {
  id: string; teamName: string; sourceLeagueId: string | null; sourceLeagueName: string | null;
  eligible: boolean; entered: boolean; withdrawn: boolean; response: string; invitation: Invitation | null;
  contacts: Awaited<ReturnType<typeof getTeamOperationalEmailContacts>>;
  messages: Array<{ id: string; recipientEmail: string; recipientName: string; kind: string; settingsVersion: number; status: string | null; sentAt: Date | null; createdAt: Date; failureReason: string | null; dispatchId: string | null }>;
  deliveryProblem: boolean;
};
export async function getCupInvitationReport(cupId: string, actorId: string) {
  await assertCupAdmin(actorId);
  const cup = await loadCup(cupId), eligible = await eligibleCupTeams(cup);
  const rows = await prisma.$queryRaw<Array<{ id: string; teamName: string; entered: boolean; withdrawn: boolean; sourceLeagueId: string | null; sourceLeagueName: string | null }>>`
    SELECT t.id,t.name AS "teamName",COALESCE(e."isActive",false) AS entered,(e.id IS NOT NULL AND NOT e."isActive") AS withdrawn,t."leagueId" AS "sourceLeagueId",l.name AS "sourceLeagueName"
    FROM "Team" t LEFT JOIN "LeagueSeasonTeam" e ON e."teamId"=t.id AND e."leagueId"=${cupId}
    LEFT JOIN "League" l ON l.id=t."leagueId"
    WHERE e.id IS NOT NULL OR EXISTS (SELECT 1 FROM "CupInvitation" i WHERE i."cupLeagueId"=${cupId} AND i."teamId"=t.id)`;
  const all = new Map(rows.map(r => [r.id,r]));
  for (const r of eligible) all.set(r.id,{...r,entered:all.get(r.id)?.entered ?? false,withdrawn:all.get(r.id)?.withdrawn ?? false});
  const invitations = await prisma.$queryRaw<Invitation[]>`SELECT * FROM "CupInvitation" WHERE "cupLeagueId"=${cupId}`;
  const messages = await prisma.$queryRaw<Array<CupReportRow["messages"][number] & {teamId:string}>>`
    SELECT m.id,i."teamId",m."recipientEmail",m."recipientName",m.kind,m."settingsVersion",m."createdAt",m."dispatchId",d.status::text,d."sentAt",d."failureReason"
    FROM "CupInvitationMessage" m JOIN "CupInvitation" i ON i.id=m."invitationId"
    LEFT JOIN "NotificationDispatch" d ON d.id=m."dispatchId" WHERE i."cupLeagueId"=${cupId} ORDER BY m."createdAt" DESC`;
  const report: CupReportRow[] = [];
  for (const r of [...all.values()].sort((a,b)=>(a.sourceLeagueName || "").localeCompare(b.sourceLeagueName || "") || a.teamName.localeCompare(b.teamName))) {
    const invitation = invitations.find(i=>i.teamId===r.id) ?? null;
    const same = invitation && cup.settings && invitation.settingsVersion === cup.settings.version && termsEqual(invitation.terms,cupTerms(cup));
    const response = !invitation ? "NOT_INVITED" : !same ? "OUTDATED" : invitation.response;
    const contacts = await getTeamOperationalEmailContacts(r.id);
    const delivery = messages.filter(m=>m.teamId===r.id);
    report.push({...r,eligible:eligible.some(e=>e.id===r.id),response,invitation,contacts,messages:delivery,
      deliveryProblem:!contacts.length || (response === "PENDING" && !r.entered && !r.withdrawn && delivery.some(m=>m.settingsVersion===cup.settings?.version && ["FAILED","SKIPPED"].includes(m.status || "")))});
  }
  return {cup,rows:report,counts:summaryCounts(report)};
}
export function termsEqual(a: CupTerms,b: CupTerms) { return Object.keys(b).every(k=>a[k as keyof CupTerms]===b[k as keyof CupTerms]); }
async function loadTemplate(kind: CupMailKind, db: CupDb = prisma) {
  const key = kind === "INITIAL" ? "cup-interest-invitation" : "cup-interest-reminder";
  const template = await db.notificationTemplate.findUnique({where:{key}});
  if (!template?.isActive || template.channel!=="EMAIL" || template.audience!=="TEAM" || template.kind!=="TRANSACTIONAL") throw new CupInvitationError("Enable the transactional team cup email in System Templates first.");
  if (!template.body.includes("{{yesUrl}}") || !template.body.includes("{{noUrl}}")) throw new CupInvitationError("Keep both {{yesUrl}} and {{noUrl}} in the cup template.");
  return template;
}
function variables(terms: CupTerms,teamName: string,name: string,url: string) {
  return { ...terms, matchFee: money(terms.matchFeePence), teamName, firstName:name.trim().split(/\s+/)[0] || "there",
    responseDeadline:cupDate(terms.responseDeadline), yesUrl:`${url}?answer=YES`, noUrl:`${url}?answer=NO` };
}
function selectionReason(row: CupReportRow, kind: CupMailKind) {
  if (!row.eligible) return "Not currently an eligible league team.";
  if (row.withdrawn) return "This team has been withdrawn from the cup.";
  if (row.entered) return "Already a confirmed cup entrant.";
  if (kind === "INITIAL" && ["YES","NO"].includes(row.response)) return "This team has already responded.";
  if (kind === "REMINDER" && row.response !== "PENDING") return "This team is not awaiting a current response.";
  if (kind === "REMINDER" && row.invitation?.lastReminderAt && Date.now()-new Date(row.invitation.lastReminderAt).getTime()<86400000) return "A reminder was already requested in the last 24 hours.";
  if (kind === "REMINDER" && row.messages.some(m=>m.settingsVersion===row.invitation?.settingsVersion && ["QUEUED","PROCESSING"].includes(m.status || ""))) return "An existing email is still queued or sending.";
  if (!row.contacts.length) return "No team email contact. Update the captain/team contact first.";
  return null;
}
export async function previewCupInvitations(input:{cupId:string;actorId:string;teamIds:string[];kind:CupMailKind}) {
  if (!input.teamIds.length || input.teamIds.length>100 || !["INITIAL","REMINDER"].includes(input.kind)) throw new CupInvitationError("Select between 1 and 100 teams and a valid email action.");
  const report=await getCupInvitationReport(input.cupId,input.actorId);assertCupOpen(report.cup);
  const template=await loadTemplate(input.kind), terms=cupTerms(report.cup);
  const selected=[...new Set(input.teamIds)].sort().map(id=>{const row=report.rows.find(r=>r.id===id);if(!row)throw new CupInvitationError("A selected team is no longer available. Refresh the list.");return row;});
  const teams=selected.map(row=>({teamId:row.id,teamName:row.teamName,error:selectionReason(row,input.kind),contacts:row.contacts,
    previews:row.contacts.map(contact=>{
      const content=buildQueuedContentFromTemplate({template,variables:variables(terms,row.teamName,contact.name,`${baseUrl()}/cup-invitation/preview`)});
      if (getUnresolvedEmailPlaceholderReason({channel:"EMAIL",...content})) throw new CupInvitationError("The cup template has unresolved fields. Check System Templates.");
      return {email:contact.email,...content};
    })}));
  const previewKey=fingerprint({version:report.cup.settings!.version,terms,template,kind:input.kind,teams:teams.map(t=>({id:t.teamId,error:t.error,contacts:t.contacts}))});
  return {previewKey,teams,version:report.cup.settings!.version,templateFingerprint:fingerprint(template)};
}
export async function sendCupInvitations(input:{cupId:string;actorId:string;teamIds:string[];kind:CupMailKind;previewKey:string;confirmed:boolean}) {
  if(!input.confirmed)throw new CupInvitationError("Review the preview and confirm before sending.");
  const preview=await previewCupInvitations(input);
  if(preview.previewKey!==input.previewKey)throw new CupInvitationError("The cup, recipients or template changed. Preview the emails again before sending.");
  const results:Array<{teamName:string;queued:number;existing:number;skipped:number;error:string|null}>=[];
  for(const target of preview.teams) {
    if(target.error){results.push({teamName:target.teamName,queued:0,existing:0,skipped:0,error:target.error});continue;}
    try {
      const result=await prisma.$transaction(async db=>{
        const actor=await assertCupAdmin(input.actorId,db),cup=await loadCup(input.cupId,db,true);assertCupOpen(cup);
        if(cup.settings!.version!==preview.version)throw new CupInvitationError("Cup details changed. Preview again.");
        const withdrawn=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "LeagueSeasonTeam" WHERE "leagueId"=${cup.id} AND "teamId"=${target.teamId} AND "isActive"=false`;
        if(withdrawn.length)throw new CupInvitationError("This team has been withdrawn from the cup.");
        if(await isCupEntrant(cup.id,target.teamId,db))throw new CupInvitationError("Already a confirmed entrant.");
        if(!(await eligibleCupTeams(cup,db)).some(t=>t.id===target.teamId))throw new CupInvitationError("Team is no longer eligible.");
        const contacts=await getTeamOperationalEmailContacts(target.teamId,db);
        if(fingerprint(contacts)!==fingerprint(target.contacts))throw new CupInvitationError("Team contacts changed. Preview again.");
        const terms=cupTerms(cup);let invite=await loadInvitation(cup.id,target.teamId,db);
        if(input.kind === "REMINDER" && invite) {
          const waiting = await db.$queryRaw<Array<{id:string}>>`SELECT d.id FROM "CupInvitationMessage" m JOIN "NotificationDispatch" d ON d.id=m."dispatchId" WHERE m."invitationId"=${invite.id} AND m."settingsVersion"=${cup.settings!.version} AND d.status IN ('QUEUED','PROCESSING') LIMIT 1`;
          if(waiting.length)throw new CupInvitationError("An existing email is still queued or sending.");
        }
        if(input.kind==="REMINDER" && (!invite || invite.response!=="PENDING" || invite.settingsVersion!==cup.settings!.version || !termsEqual(invite.terms,terms) || (invite.lastReminderAt && Date.now()-new Date(invite.lastReminderAt).getTime()<86400000))) throw new CupInvitationError("This team no longer needs a reminder, or was recently reminded.");
        if(invite && invite.settingsVersion===cup.settings!.version && invite.response!=="PENDING") throw new CupInvitationError("Team has already responded.");
        if(invite && invite.settingsVersion===cup.settings!.version && !termsEqual(invite.terms,terms)) throw new CupInvitationError("Competition details changed. Save Cup setup before issuing revised invitations.");
        if(!invite || invite.settingsVersion!==cup.settings!.version) {
          await db.$executeRaw`INSERT INTO "CupInvitation" (id,"cupLeagueId","teamId","settingsVersion",terms)
            VALUES (${randomUUID()},${cup.id},${target.teamId},${cup.settings!.version},${json(terms)}::jsonb)
            ON CONFLICT ("cupLeagueId","teamId") DO UPDATE SET "settingsVersion"=EXCLUDED."settingsVersion",terms=EXCLUDED.terms,response='PENDING',
              "responseVersion"="CupInvitation"."responseVersion"+1,"respondedAt"=NULL,"respondedByName"=NULL,"respondedByUserId"=NULL,"lastReminderAt"=NULL,"updatedAt"=NOW()`;
          invite=await loadInvitation(cup.id,target.teamId,db);
          await cupAudit(db,cup.id,target.teamId,actor.id,actor.name || "Administrator","INVITED",{version:cup.settings!.version,terms});
        }
        const template=await loadTemplate(input.kind,db);
        if(fingerprint(template)!==preview.templateFingerprint)throw new CupInvitationError("Email template changed. Preview again.");
        const batch=input.kind==="INITIAL"?0:Math.floor(Date.now()/86400000);
        let queued=0,existing=0,skipped=0;
        for(const contact of contacts) {
          const prior=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "CupInvitationMessage" WHERE "invitationId"=${invite!.id} AND "settingsVersion"=${cup.settings!.version} AND kind=${input.kind} AND batch=${batch} AND "recipientEmail"=${contact.email}`;
          if(prior.length){existing++;continue;}
          const recipient=await db.notificationRecipient.upsert({where:{sourceType_sourceId:{sourceType:contact.sourceType,sourceId:contact.sourceId}},
            update:{email:contact.email,emailNormalized:contact.email,displayName:contact.name,lastSyncedAt:new Date()},
            create:{sourceType:contact.sourceType,sourceId:contact.sourceId,audience:"TEAM",email:contact.email,emailNormalized:contact.email,displayName:contact.name}});
          await db.notificationPreference.upsert({where:{recipientId:recipient.id},update:{},create:{recipientId:recipient.id}});
          const messageId=randomUUID(),url=`${baseUrl()}/cup-invitation/${cupResponseToken(messageId,terms.responseDeadline)}`;
          await db.$executeRaw`INSERT INTO "CupInvitationMessage" (id,"invitationId","settingsVersion",kind,batch,"recipientId","recipientEmail","recipientName") VALUES (${messageId},${invite!.id},${cup.settings!.version},${input.kind},${batch},${recipient.id},${contact.email},${contact.name})`;
          const dispatch=await queueNotificationFromTemplate({templateKey:template.key,recipientId:recipient.id,
            variables:variables(terms,target.teamName,contact.name,url),sourceType:input.kind==="INITIAL"?CUP_MAIL_SOURCES[0]:CUP_MAIL_SOURCES[1],sourceId:messageId,
            metadata:{cupLeagueId:cup.id,teamId:target.teamId,invitationId:invite!.id},createdByUserId:actor.id},db);
          await db.$executeRaw`UPDATE "CupInvitationMessage" SET "dispatchId"=${dispatch.id} WHERE id=${messageId}`;
          if(dispatch.status==="QUEUED")queued++;else skipped++;
        }
        if(input.kind==="REMINDER" && queued+skipped>0) {
          await db.$executeRaw`UPDATE "CupInvitation" SET "lastReminderAt"=NOW(),"updatedAt"=NOW() WHERE id=${invite!.id}`;
          await cupAudit(db,cup.id,target.teamId,actor.id,actor.name || "Administrator","REMINDER_REQUESTED",{version:cup.settings!.version});
        }
        return {teamName:target.teamName,queued,existing,skipped,error:null};
      },{timeout:25000,maxWait:5000});
      results.push(result);
    } catch(error) { results.push({teamName:target.teamName,queued:0,existing:0,skipped:0,error:failure(error)}); }
  }
  return results;
}
export type CupResponseAccess = {token:string} | {cupId:string;teamId:string;actorId:string};
export async function getCupResponseContext(access:CupResponseAccess,db:CupDb=prisma,lock=false) {
  let cupId:string,teamId:string,actorId:string|null=null,actorName:string;
  type ResponseMessage={settingsVersion:number;recipientEmail:string;recipientName:string;cupLeagueId:string;teamId:string};
  let message:ResponseMessage|null=null;
  if("token" in access) {
    const token=readCupResponseToken(access.token);
    const rows=await db.$queryRaw<ResponseMessage[]>`SELECT m."settingsVersion",m."recipientEmail",m."recipientName",i."cupLeagueId",i."teamId" FROM "CupInvitationMessage" m JOIN "CupInvitation" i ON i.id=m."invitationId" WHERE m.id=${token.messageId}`;
    message=rows[0] ?? null;if(!message)throw new CupInvitationError("Invitation not found.");
    cupId=message.cupLeagueId;teamId=message.teamId;actorName=message.recipientName;
    if(!(await getTeamOperationalEmailContacts(teamId,db)).some(c=>c.email===message!.recipientEmail))throw new CupInvitationError("This link no longer belongs to a current team contact. Please contact SIXFL.");
  } else {
    cupId=access.cupId;teamId=access.teamId;
    const actor=await db.user.findUnique({where:{id:access.actorId},select:{id:true,name:true}});
    const member=await db.teamMember.findFirst({where:{teamId,userId:access.actorId,role:"CAPTAIN"},select:{id:true}});
    if(!actor || !member)throw new CupInvitationError("Only a current team captain can respond.");
    actorId=actor.id;actorName=actor.name || "Team captain";
  }
  const cup=await loadCup(cupId,db,lock), invitation=await loadInvitation(cupId,teamId,db);
  if(!invitation)throw new CupInvitationError("Your team has not been invited to this cup.");
  if(message && message.settingsVersion!==invitation.settingsVersion)throw new CupInvitationError("This invitation has been replaced. Use the latest email.");
  const teams=await eligibleCupTeams(cup,db),team=teams.find(t=>t.id===teamId);
  if(!team)throw new CupInvitationError("This team is no longer eligible for the invitation. Contact SIXFL.");
  const entered=await isCupEntrant(cupId,teamId,db);
  const withdrawn=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "LeagueSeasonTeam" WHERE "leagueId"=${cupId} AND "teamId"=${teamId} AND "isActive"=false`;
  const current=!!cup.settings && invitation.settingsVersion===cup.settings.version && termsEqual(invitation.terms,cupTerms(cup));
  const open=cup.isActive && cup.settings?.state==="OPEN" && new Date(cup.settings.responseDeadline)>new Date();
  return {cup,invitation,team,actorId,actorName,entered,canRespond:current && open && !entered && !withdrawn.length,
    blocked:withdrawn.length?"Your team has been withdrawn from this cup. Please contact SIXFL.":entered?"Your entry is already confirmed. Contact SIXFL to discuss a withdrawal.":!current?"The cup details have changed. Please wait for a revised invitation.":!open?"The response deadline has passed or invitations are closed. Please contact SIXFL.":null};
}
export async function respondToCup(input:{access:CupResponseAccess;response:string;expectedVersion:number;confirmed:boolean}) {
  if(!input.confirmed || !["YES","NO"].includes(input.response))throw new CupInvitationError("Choose Yes or No and confirm your response.");
  return prisma.$transaction(async db=>{
    const context=await getCupResponseContext(input.access,db,true);
    if(!context.canRespond)throw new CupInvitationError(context.blocked!);
    const {invitation:i,cup,team,actorId,actorName}=context;
    if(i.response===input.response)return {response:i.response,existing:true};
    if(i.responseVersion!==input.expectedVersion)throw new CupInvitationError("Another captain has updated the team's response. Refresh to see it before changing it.");
    await db.$executeRaw`UPDATE "CupInvitation" SET response=${input.response},"responseVersion"="responseVersion"+1,"respondedAt"=NOW(),"respondedByName"=${actorName},"respondedByUserId"=${actorId},"updatedAt"=NOW() WHERE id=${i.id}`;
    await cupAudit(db,cup.id,team.id,actorId,actorName,"RESPONSE",{previous:i.response,response:input.response,version:i.settingsVersion,terms:i.terms});
    await cancelCupMail(db,cup.id,team.id,"Team has responded to the cup invitation.");
    return {response:input.response,existing:false};
  },{timeout:15000});
}
export async function changeCupEntry(input:{cupId:string;teamId:string;actorId:string;remove:boolean;confirmed:boolean}) {
  if(!input.confirmed)throw new CupInvitationError("Confirm that the final arrangements have been agreed, or confirm withdrawal.");
  return prisma.$transaction(async db=>{
    const actor=await assertCupAdmin(input.actorId,db),cup=await loadCup(input.cupId,db,true);
    const fixtures=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "Fixture" WHERE "leagueId"=${cup.id} AND ("homeTeamId"=${input.teamId} OR "awayTeamId"=${input.teamId}) LIMIT 1`;
    if(fixtures.length)throw new CupInvitationError("This team already has a cup fixture. Contact SIXFL to resolve the draw before changing its entry.");
    if(!input.remove && !(await eligibleCupTeams(cup,db)).some(t=>t.id===input.teamId))throw new CupInvitationError("Choose an eligible current league team.");
    if(input.remove) await db.$executeRaw`UPDATE "LeagueSeasonTeam" SET "isActive"=false,"updatedAt"=NOW() WHERE "leagueId"=${cup.id} AND "teamId"=${input.teamId}`;
    else await db.$executeRaw`INSERT INTO "LeagueSeasonTeam" (id,"leagueId","teamId","divisionId","isActive","createdAt","updatedAt") VALUES (${randomUUID()},${cup.id},${input.teamId},NULL,true,NOW(),NOW())
      ON CONFLICT ("leagueId","teamId") DO UPDATE SET "isActive"=true,"divisionId"=NULL,"updatedAt"=NOW()`;
    await cupAudit(db,cup.id,input.teamId,actor.id,actor.name || "Administrator",input.remove?"ENTRY_WITHDRAWN":"ENTRY_CONFIRMED",{arrangementsAgreed:!input.remove});
    await cancelCupMail(db,cup.id,input.teamId,"Cup entry has been confirmed or withdrawn by SIXFL.");
  });
}
