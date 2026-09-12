const { test } = require('node:test'); const assert=require('node:assert/strict'); const {load}=require('./loader.cjs');
class Redirect extends Error { constructor(location){super(location);this.location=location;} }
const state={user:null,calls:[],paths:[]};
const action=load('src/app/(admin)/admin/fixtures/[id]/result/overturn-actions.ts',{
  'next/cache':{revalidatePath(p){state.paths.push(p)}},'next/navigation':{redirect(p){throw new Redirect(p)}},
  '@/lib/requireAdmin':{async requireAdmin(){return {user:state.user}}},
  '@/lib/fixtures/result-overturn':{ResultOverturnError:class extends Error {},async recordResultOverturn(input){state.calls.push(input);return {fixtureId:input.fixtureId,leagueSlug:'test',homeTeamId:'will',awayTeamId:'nomads'}}},
}).overturnResultAction;
const form=()=>{const f=new FormData();for(const [k,v] of Object.entries({fixtureId:'fixture',actorUserId:'forged',winnerTeamId:'nomads',confirmed:'yes'}))f.set(k,v);return f};
test('anonymous, development fallback and non-admin captains cannot mutate a result',async()=>{
  for(const user of [null,{id:'captain',role:'USER'},{id:'ref',role:'REFEREE'}]){state.user=user;state.calls=[];await assert.rejects(action(form()),/Administrator access/);assert.equal(state.calls.length,0)}
});
test('actor comes from authentication; successful action refreshes both teams and the official table',async()=>{
  state.user={id:'real-admin',role:'ADMIN'};state.calls=[];state.paths=[];
  await assert.rejects(action(form()),e=>e instanceof Redirect && e.location.endsWith('?overturned=1'));
  assert.equal(state.calls.length,1);assert.equal(state.calls[0].actorUserId,'real-admin');
  assert.ok(state.paths.includes('/leagues/test'));assert.ok(state.paths.includes('/captain/team/nomads/results'));assert.ok(state.paths.includes('/admin/ai-predictor'));
});
