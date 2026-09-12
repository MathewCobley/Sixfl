const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./loader.cjs');
class Redirect extends Error{constructor(location){super(location);this.location=location;}}
class NoticeError extends Error{}
const state={user:null,calls:[],paths:[]};
const action=load('src/app/(admin)/admin/fixtures/[id]/result/overturn-email-actions.ts',{
  'next/cache':{revalidatePath(p){state.paths.push(p)}},
  'next/navigation':{redirect(p){throw new Redirect(p)}},
  '@/lib/requireAdmin':{async requireAdmin(){return {user:state.user}}},
  '@/lib/fixtures/result-overturn-email':{ResultOverturnEmailError:NoticeError,async queueResultOverturnEmails(input){state.calls.push(input);if(!input.confirmed)throw new NoticeError('Confirm first');return {created:2,recipientCount:2}}},
}).emailOverturnedResultAction;
function form(confirmed=true){const f=new FormData();for(const [key,value]of Object.entries({fixtureId:'fixture',decisionId:'decision',actorUserId:'FORGED_ACTOR',subject:'FORGED_SUBJECT',body:'SECRET_EVIDENCE',rulesBasis:'SECRET_RULES',to:'wrong@example.invalid',...(confirmed?{confirmed:'yes'}:{})}))f.set(key,value);return f;}
test('anonymous users, development fallback, captains and referees cannot request overturn emails',async()=>{
 for(const user of [null,{id:'captain',role:'USER'},{id:'ref',role:'REFEREE'}]){state.user=user;state.calls=[];await assert.rejects(action(form()),/Administrator access/);assert.equal(state.calls.length,0);}
});
test('only fixture, decision, authenticated actor and explicit confirmation reach email service',async()=>{
 state.user={id:'real-admin',role:'ADMIN'};state.calls=[];state.paths=[];
 await assert.rejects(action(form()),e=>e instanceof Redirect&&e.location.endsWith('?noticeChecked=1'));
 assert.deepEqual(state.calls,[{fixtureId:'fixture',decisionId:'decision',actorUserId:'real-admin',confirmed:true}]);
 assert.ok(state.paths.includes('/admin/queue'));assert.equal(JSON.stringify(state.calls).includes('SECRET'),false);
});
test('missing confirmation is an error, not a successful send notice',async()=>{
 state.user={id:'real-admin',role:'ADMIN'};
 await assert.rejects(action(form(false)),e=>e instanceof Redirect&&e.location.includes('?noticeError='));
});
