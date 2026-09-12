const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(path,mocks){const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
new Function('require','module','exports',js)(key=>{if(Object.hasOwn(mocks,key))return mocks[key];if(['react','react/jsx-runtime'].includes(key))return require(key);throw Error(`Unexpected dependency ${key}`);},mod,mod.exports);return mod.exports;}
const choice=load('src/lib/veo/fixture-choice.ts',{});
const actions={'confirmFixtureWithVeoAction':async()=>({ok:true,message:'Saved'}),'stopFutureVeoPriorityAction':async()=>({ok:true,message:'Saved'})};
const forms=load('src/components/captain/FixtureVeoConfirmationForm.tsx',{'next/navigation':{useRouter:()=>({refresh(){}})},'@/app/captain/team/[teamid]/veo-priority/fixture-actions':actions,'@/lib/veo/fixture-choice':choice});
const offer={available:true,reason:null,defaultChoice:'NONE',preference:false,requestStatus:null,bookingState:null,agreedPence:null,version:'version1',maxMatches:3};
const props={teamId:'team',fixtureId:'fixture',leagueId:'league',confirmed:false,offer,preview:false};
function render(input){return renderToStaticMarkup(React.createElement(forms.default,input));}
function save(name,html){fs.mkdirSync('artifacts/veo',{recursive:true});fs.writeFileSync(`artifacts/veo/${name}.html`,html);}
test('confirmation offers NONE/MATCH/ONGOING, defaults off, explains whole-team price and does not promise filming',()=>{
const html=render(props);for(const text of ['Just this match','this and future matches','No thanks','£5 extra for the whole team','Confirm our team can play','usable recording','YouTube','billed separately'])assert.ok(html.toLowerCase().includes(text.toLowerCase()),text);
assert.equal((html.match(/type="radio"/g)||[]).length,3);assert.match(html,/<input[^>]+checked=""[^>]+value="NONE"/);assert.doesNotMatch(html,/value="(?:MATCH|ONGOING)"[^>]*checked/);save('confirmation-live',html);
});
test('saved preference defaults ongoing; skip and stop are separate; accepted booking shows no new purchase choice',()=>{
const html=render({...props,offer:{...offer,defaultChoice:'ONGOING',preference:true}});assert.ok(html.includes('Skip Veo Priority for this match'));assert.ok(html.includes('Turn off future Veo Priority'));assert.match(html,/<input[^>]+checked=""[^>]+value="ONGOING"/);
const accepted=render({...props,confirmed:true,offer:{...offer,available:false,bookingState:'PLANNED',requestStatus:'ACCEPTED',agreedPence:500}});assert.ok(accepted.includes('Veo confirmed for this match'));assert.doesNotMatch(accepted,/type="radio"/);save('confirmation-ongoing',html);
});
test('preview retains exactly the same choices but has no form, hidden action data or working submit',()=>{
const html=render({...props,preview:true});assert.ok(html.includes('Yes, just this match'));assert.ok(html.includes('This and future matches')||html.includes('this and future matches'));assert.match(html,/<fieldset[^>]+disabled/);assert.match(html,/<button[^>]+type="button"[^>]+disabled/);assert.doesNotMatch(html,/<form|type="hidden"|\$ACTION_/);save('confirmation-preview',html);
});
test('new server action blocks previews, binds the real captain and reports attendance success even if optional Veo fails',async()=>{
let access={accessMode:'captain-preview',isAdmin:false,isCaptain:true,user:{id:'admin'}};let attend=0,writes=[];
class VeoBookingError extends Error{}
const action=load('src/app/captain/team/[teamid]/veo-priority/fixture-actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/requireCaptain':{requireCaptain:async()=>access},'@/lib/veo/fixture-bookings':{VeoBookingError,confirmCaptainAttendance:async()=>attend++,saveFixtureVeoChoice:async x=>{writes.push(x);throw new VeoBookingError('No camera space');},stopFutureVeoPriority:async()=>{}},'@/lib/veo/fixture-policy':choice}).confirmFixtureWithVeoAction;
const f=new FormData();f.set('confirmAttendance','yes');f.set('veoChoice','MATCH');f.set('veoTerms',choice.VEO_FIXTURE_TERMS);f.set('veoVersion','v');f.set('actorId','forged');
assert.equal((await action('team','fixture',{},f)).ok,false);assert.equal(attend,0);
access={accessMode:'captain',isAdmin:false,isCaptain:true,user:{id:'captain'}};const res=await action('team','fixture',{},f);assert.equal(res.attendanceConfirmed,true);assert.equal(res.ok,false);assert.ok(res.message.includes('IS confirmed'));assert.equal(writes[0].actorId,'captain');
});
test('every fixture confirmation form uses the shared owned component; nudge routes Veo users into it; emails and SMS point to this fixture route',()=>{
const page=fs.readFileSync('src/app/captain/team/[teamid]/fixtures/page.tsx','utf8');assert.equal((page.match(/<CaptainFixtureConfirmation /g)||[]).length,2);assert.doesNotMatch(page,/<form action=\{confirmFixtureAction\}/);
const nudge=fs.readFileSync('src/app/captain/team/[teamid]/fixtures/nudge-actions.ts','utf8');assert.ok(nudge.includes('settings.enabled && settings.confirmAtFixture'));
for(const p of ['src/lib/fixtures/confirmation-emails.ts','src/lib/fixtures/confirmation-reminders.ts'])assert.ok(fs.readFileSync(p,'utf8').includes('/fixtures?fixtureId='));
for(const p of ['src/lib/veo/fixture-bookings.ts','src/components/captain/FixtureVeoConfirmationForm.tsx'])assert.doesNotMatch(fs.readFileSync(p,'utf8'),/MutationObserver|document\.querySelector|queueDirectNotification|sendEmail|stripe\./);
});
