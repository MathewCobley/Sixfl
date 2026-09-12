import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {prisma} from '../../src/lib/prisma';
import {prepareVeoPublication,londonVeoDate} from '../../src/lib/veo/service';
import {readVeoFixtureOffer,confirmCaptainFixture,saveVeoMatchChoice,stopOngoingVeo,previewConfirmationVeoNight,finaliseConfirmationVeoNight,failVeoRecording,VEO_MATCH_TERMS} from '../../src/lib/veo/confirmation';
const url=new URL(process.env.DATABASE_URL!);assert.equal(process.env.VEO_TEST_DATABASE,'1');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/sixfl_veo_test');
const id=()=>`vc-${randomUUID()}`;let passed=0;const pass=(s:string)=>console.log(`PASS ${++passed}: ${s}`);
async function main(){
 const admin=await prisma.user.create({data:{id:id(),email:`${id()}@example.test`,role:'ADMIN'}});
 const venue=await prisma.venue.create({data:{id:id(),name:'Veo confirmation test venue'}});
 const start=new Date(Date.now()+9*86400000);start.setUTCHours(17,0,0,0);const date=londonVeoDate(start);
 const leagues=[];for(let n=0;n<2;n++){const l=await prisma.league.create({data:{id:id(),name:`Veo confirmation league ${n}`,slug:id()}});leagues.push(l);await prisma.$executeRaw`INSERT INTO "VeoLeagueSettings" ("leagueId",enabled,"venueId",pitch,"maxMatches") VALUES (${l.id},true,${venue.id},'1',3)`;}
 const teams=[];const captains=[];const fs=[];
 for(let n=0;n<12;n++){const t=await prisma.team.create({data:{id:id(),name:`VC team ${n}`,claimCode:id(),leagueId:leagues[n<6?0:1].id,standardMatchFeePence:4000}});teams.push(t);const u=await prisma.user.create({data:{id:id(),name:`VC captain ${n}`,email:`${id()}@example.test`}});captains.push(u);await prisma.teamMember.create({data:{teamId:t.id,userId:u.id,role:'CAPTAIN'}});}
 // Two leagues occupy opposite pitches in each of three simultaneous slots.
 for(let l=0;l<2;l++)for(let slot=0;slot<3;slot++){const n=l*6+slot*2;const f=await prisma.fixture.create({data:{id:id(),leagueId:leagues[l].id,venueId:venue.id,homeTeamId:teams[n].id,awayTeamId:teams[n+1].id,kickoffAt:new Date(start.getTime()+slot*40*60000),pitch:String(l+1),homeMatchFeePence:4000,awayMatchFeePence:4000,matchFeePence:4000}});fs.push(f);}
 for(const l of leagues){await prisma.$transaction(tx=>prepareVeoPublication(tx,{leagueId:l.id}));await prisma.fixture.updateMany({where:{leagueId:l.id},data:{publishedAt:new Date()}});}
 assert.equal((await prisma.$queryRaw<{n:number}[]>`SELECT COUNT(*)::integer n FROM "VeoMatchDecision"`)[0].n,0);
 for(const f of fs){const actual=await prisma.fixture.findUniqueOrThrow({where:{id:f.id}});assert.equal(actual.homeMatchFeePence,4000);assert.equal(actual.pitch,f.pitch);}
 pass('new-mode publication preserves base fees and pitches; no decisions or add-ons');
 const f=fs[0],t=teams[0],u=captains[0];let offer=(await readVeoFixtureOffer(t.id,f.id))!;assert.equal(offer.choice,'NONE');assert.equal(offer.closed,false);
 await assert.rejects(confirmCaptainFixture({teamId:t.id,fixtureId:f.id,actorId:admin.id}));
 await assert.rejects(confirmCaptainFixture({teamId:t.id,fixtureId:f.id,actorId:captains[2].id}));
 await assert.rejects(saveVeoMatchChoice({teamId:t.id,fixtureId:f.id,actorId:u.id,choice:'MATCH',stamp:offer.fixtureStamp,terms:VEO_MATCH_TERMS}),/Confirm that your team/);
 await confirmCaptainFixture({teamId:t.id,fixtureId:f.id,actorId:u.id,stamp:offer.fixtureStamp});
 await saveVeoMatchChoice({teamId:t.id,fixtureId:f.id,actorId:u.id,choice:'ONGOING',stamp:offer.fixtureStamp,terms:VEO_MATCH_TERMS});
 assert.equal((await readVeoFixtureOffer(t.id,f.id))!.ongoing,true);
 await saveVeoMatchChoice({teamId:t.id,fixtureId:f.id,actorId:u.id,choice:'NONE',stamp:offer.fixtureStamp,terms:VEO_MATCH_TERMS});
 assert.equal((await readVeoFixtureOffer(t.id,f.id))!.ongoing,true);assert.equal((await readVeoFixtureOffer(t.id,f.id))!.requested,false);
 await saveVeoMatchChoice({teamId:t.id,fixtureId:f.id,actorId:u.id,choice:'MATCH',stamp:offer.fixtureStamp,terms:VEO_MATCH_TERMS});
 pass('exact active captain only; ongoing preference, one-match request and skip are distinct');
 // Request both teams on one match and one team on the other two matches.
 for(const index of [6,7,8,10]){const fi=fs[3+Math.floor((index-6)/2)];const of=(await readVeoFixtureOffer(teams[index].id,fi.id))!;await confirmCaptainFixture({teamId:teams[index].id,fixtureId:fi.id,actorId:captains[index].id,stamp:of.fixtureStamp});await saveVeoMatchChoice({teamId:teams[index].id,fixtureId:fi.id,actorId:captains[index].id,choice:index===6?'ONGOING':'MATCH',stamp:of.fixtureStamp,terms:VEO_MATCH_TERMS});}
 let plan=(await previewConfirmationVeoNight(leagues[0].id,date))!;
 assert.equal(plan.items.length,6);assert.equal(plan.items.filter(i=>i.allocated).length,3);assert.equal(plan.items.find(i=>i.fixtureId===fs[3].id)!.allocated,true);
 await assert.rejects(finaliseConfirmationVeoNight({leagueId:leagues[0].id,date,actorId:admin.id,digest:'stale'}),/changed/);
 // Preserve an already-paid normal match charge exactly.
 const base=await prisma.paymentCharge.create({data:{teamId:teams[6].id,fixtureId:fs[3].id,title:'Normal match fee',amountPence:4000,status:'PAID'}});
 await prisma.paymentTransaction.create({data:{teamId:teams[6].id,chargeId:base.id,amountPence:4000,method:'CASH',paidAt:new Date()}});
 plan=(await previewConfirmationVeoNight(leagues[0].id,date))!;
 const results=await Promise.all([finaliseConfirmationVeoNight({leagueId:leagues[0].id,date,actorId:admin.id,digest:plan.digest}),finaliseConfirmationVeoNight({leagueId:leagues[0].id,date,actorId:admin.id,digest:plan.digest})]);
 assert.equal(results.filter(r=>!r.alreadyFinalised).length,1);
 const decisions=await prisma.$queryRaw<{fixtureId:string;allocated:boolean;homeExtraPence:number;awayExtraPence:number}[]>`SELECT * FROM "VeoMatchDecision" WHERE "nightId"=${results[0].nightId}`;
 assert.equal(decisions.length,6);assert.equal(decisions.filter(d=>d.allocated).length,3);
 const addons=await prisma.$queryRaw<{chargeId:string;fixtureId:string;teamId:string}[]>`SELECT a.* FROM "VeoMatchAddon" a JOIN "VeoMatchDecision" d ON d."fixtureId"=a."fixtureId" WHERE d."nightId"=${results[0].nightId}`;
 assert.equal(addons.length,4);assert.equal((await prisma.paymentCharge.findUniqueOrThrow({where:{id:base.id}})).amountPence,4000);
 for(const orig of fs){const after=await prisma.fixture.findUniqueOrThrow({where:{id:orig.id}});assert.equal(after.kickoffAt.getTime(),orig.kickoffAt.getTime());assert.equal(after.homeTeamId,orig.homeTeamId);assert.equal(after.homeMatchFeePence,4000);assert.equal(after.awayMatchFeePence,4000);}
 pass('two leagues share only three slots; concurrent finalise charges accepted teams once and leaves paid match fees untouched');
 await stopOngoingVeo(teams[6].id,leagues[1].id,captains[6].id);
 assert.equal((await readVeoFixtureOffer(teams[6].id,fs[3].id))!.status,'ACCEPTED');
 await assert.rejects(saveVeoMatchChoice({teamId:t.id,fixtureId:f.id,actorId:u.id,choice:'MATCH',stamp:offer.fixtureStamp,terms:VEO_MATCH_TERMS}),/closed/);
 pass('turning off future preference cannot cancel an accepted booking; late changes are blocked');
 const paid=addons.find(a=>a.teamId===teams[6].id)!,unpaid=addons.find(a=>a.teamId===teams[7].id)!;
 await prisma.paymentTransaction.create({data:{teamId:paid.teamId,chargeId:paid.chargeId,amountPence:500,method:'CASH',paidAt:new Date()}});
 await failVeoRecording({fixtureId:fs[3].id,leagueId:leagues[1].id,actorId:admin.id,reason:'Camera battery failed'});
 await failVeoRecording({fixtureId:fs[3].id,leagueId:leagues[1].id,actorId:admin.id,reason:'Same failure retry'});
 const credits=await prisma.$queryRaw<{amountPence:number}[]>`SELECT "amountPence" FROM "TeamCreditLedgerEntry" WHERE id=${'tcred_veo_refund_'+paid.chargeId}`;assert.equal(credits.length,1);assert.equal(credits[0].amountPence,500);
 assert.equal((await prisma.paymentCharge.findUniqueOrThrow({where:{id:unpaid.chargeId}})).status,'VOID');
 // A late confirmed Stripe receipt must not resurrect a cancelled £5 bill.
 await prisma.paymentTransaction.create({data:{teamId:unpaid.teamId,chargeId:unpaid.chargeId,amountPence:200,method:'STRIPE',stripeCheckoutSessionId:id(),paidAt:new Date()}});
 await prisma.paymentCharge.update({where:{id:unpaid.chargeId},data:{status:'PART_PAID'}});
 assert.equal((await prisma.paymentCharge.findUniqueOrThrow({where:{id:unpaid.chargeId}})).status,'VOID');
 assert.equal((await prisma.$queryRaw<{amountPence:number}[]>`SELECT "amountPence" FROM "TeamCreditLedgerEntry" WHERE id=${'tcred_veo_refund_'+unpaid.chargeId}`)[0].amountPence,200);
 assert.equal((await prisma.paymentCharge.findUniqueOrThrow({where:{id:base.id}})).status,'PAID');
 pass('failed filming voids only add-ons, credits real receipts once, and handles late partial receipts without reopening charges');
 const cancelled=fs[4];await prisma.fixture.update({where:{id:cancelled.id},data:{status:'CANCELLED'}});
 const cancellation=addons.find(a=>a.fixtureId===cancelled.id)!;assert.equal((await prisma.paymentCharge.findUniqueOrThrow({where:{id:cancellation.chargeId}})).status,'VOID');
 pass('fixture cancellation automatically reverses its Veo add-on');
 mkdirSync('artifacts/veo',{recursive:true});writeFileSync('artifacts/veo/confirmation-seed.json',JSON.stringify({leagueId:leagues[0].id,date,nightId:results[0].nightId,teamId:t.id,fixtureId:f.id}));
 console.log(`${passed} confirmation database groups passed. No providers called.`);
}
main().finally(()=>prisma.$disconnect());
