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
test('confirmation offers NONE/MATCH/ONGOING, defaults off and explains the conditional whole-team price',()=>{
const html=render(props);for(const text of ['Just this match','this and future matches','No thanks','£5 extra for the whole team','Confirm you can play · Save Veo choice','usable recording','YouTube','added separately'])assert.ok(html.toLowerCase().includes(text.toLowerCase()),text);
assert.equal((html.match(/type="radio"/g)||[]).length,3);assert.match(html,/<input[^>]+checked=""[^>]+value="NONE"/);assert.doesNotMatch(html,/value="(?:MATCH|ONGOING)"[^>]*checked/);save('confirmation-live',html);
});
test('saved preference still defaults this fixture to skip; explicit fixture choices can be restored',()=>{
const html=render({...props,offer:{...offer,defaultChoice:'ONGOING',preference:true,requestStatus:null}});assert.ok(html.includes('Skip Veo Priority for this match'));assert.ok(html.includes('Turn off future Veo Priority'));assert.match(html,/<input[^>]+checked=""[^>]+value="NONE"/);assert.doesNotMatch(html,/value="ONGOING"[^>]*checked/);
const explicit=render({...props,offer:{...offer,defaultChoice:'ONGOING',preference:true,requestStatus:'REQUESTED'}});assert.match(explicit,/<input[^>]+checked=""[^>]+value="ONGOING"/);
const confirmedEditable=render({...props,confirmed:true,offer:{...offer,available:true,defaultChoice:'MATCH',requestStatus:'REQUESTED'}});assert.ok(confirmedEditable.includes('✓ Confirmed you can play · Update Veo choice'));assert.ok(confirmedEditable.includes('✓ Your team is confirmed to play'));
const accepted=render({...props,confirmed:true,offer:{...offer,available:false,bookingState:'PLANNED',requestStatus:'ACCEPTED',agreedPence:500}});assert.ok(accepted.includes('Veo confirmed for this match'));assert.ok(accepted.includes('£5 Veo charge has been added separately to Team payments'));assert.doesNotMatch(accepted,/type="radio"/);save('confirmation-ongoing',html);
});
test('positive Veo choices require an explicit second confirmation while skip does not',()=>{
const source=fs.readFileSync('src/components/captain/FixtureVeoConfirmationForm.tsx','utf8');
const actionSource=fs.readFileSync('src/app/captain/team/[teamid]/veo-priority/fixture-actions.ts','utf8');
assert.match(source,/choice === 'NONE'/);assert.match(source,/veoPositiveConfirmed/);assert.match(source,/Confirm your Veo Priority selection/);assert.match(source,/Yes, confirm Veo Priority/);assert.match(source,/£5 will be charged for each filming slot SIXFL accepts/);
assert.match(actionSource,/choice !== 'NONE' && form\.get\('veoPositiveConfirmed'\) !== 'yes'/);
assert.doesNotMatch(source,/MutationObserver|document\.querySelector|document\.querySelectorAll/);
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
access={accessMode:'captain',isAdmin:false,isCaptain:true,user:{id:'captain'}};const unconfirmed=await action('team','fixture',{},f);assert.equal(unconfirmed.ok,false);assert.equal(attend,0);assert.ok(unconfirmed.message.includes('confirm the £5 Veo Priority selection'));
f.set('veoPositiveConfirmed','yes');const res=await action('team','fixture',{},f);assert.equal(res.attendanceConfirmed,true);assert.equal(res.ok,false);assert.ok(res.message.includes('IS confirmed'));assert.equal(writes[0].actorId,'captain');
});
test('every fixture confirmation form uses the shared owned component; nudge routes Veo users into it; emails and SMS point to this fixture route',()=>{
const page=fs.readFileSync('src/app/captain/team/[teamid]/fixtures/page.tsx','utf8');assert.equal((page.match(/<CaptainFixtureConfirmation /g)||[]).length,2);assert.doesNotMatch(page,/<form action=\{confirmFixtureAction\}/);
const nudge=fs.readFileSync('src/app/captain/team/[teamid]/fixtures/nudge-actions.ts','utf8');assert.ok(nudge.includes('settings.enabled && settings.confirmAtFixture'));
for(const p of ['src/lib/fixtures/confirmation-emails.ts','src/lib/fixtures/confirmation-reminders.ts'])assert.ok(fs.readFileSync(p,'utf8').includes('/fixtures?fixtureId='));
for(const p of ['src/lib/veo/fixture-bookings.ts','src/components/captain/FixtureVeoConfirmationForm.tsx'])assert.doesNotMatch(fs.readFileSync(p,'utf8'),/MutationObserver|document\.querySelector|queueDirectNotification|sendEmail|stripe\./);
});

test('Veo confirmation integration retains the existing awarded-result display on the same page', () => {
  const path = 'src/app/captain/team/[teamid]/fixtures/page.tsx';
  const source = fs.readFileSync(path, 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, 'The integrated fixture page must parse');
  const imports = new Set();
  const rendered = [];
  function visit(node) {
    if (ts.isImportDeclaration(node)) imports.add(node.moduleSpecifier.text);
    if (ts.isJsxSelfClosingElement(node)) rendered.push(node.tagName.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of ['@/components/captain/CaptainFixtureConfirmation', '@/components/fixtures/OverturnedResultNotice', '@/lib/fixtures/result-score']) {
    assert.ok(imports.has(name), `Keep existing/new shared dependency: ${name}`);
  }
  assert.equal(rendered.filter(name => name === 'CaptainFixtureConfirmation').length, 2, 'Normal and late confirmation retain the shared choices');
  assert.equal(rendered.filter(name => name === 'OverturnedResultNotice').length, 1, 'Retain the original/awarded result notice');
  assert.match(source, /overturn:\s*\{\s*select:\s*RESULT_OVERTURN_SUMMARY_SELECT/);
  assert.match(source, /fixture\.result!\.overturn\s*\?\s*"Awarded result"/);
});

function textOnly(html) { return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
function noChoice(html) {
  return textOnly((html.match(/<label\b[^>]*>[\s\S]*?<\/label>/g) || []).find(label => label.includes('value="NONE"')) || '');
}
for (const preview of [false, true]) {
  for (const preference of [false, true]) {
    test(`Veo wording: ${preview ? 'preview' : 'captain'}, preference ${preference}, distinguishes opt-out from no filming`, () => {
      const html = render({...props, preview, offer:{...offer, preference, defaultChoice:preference ? 'ONGOING' : 'NONE',requestStatus:null}});
      const text = textOnly(html);
      const no = noChoice(html);
      assert.ok(no.includes(preference ? 'Skip Veo Priority for this match' : 'No thanks — no Veo Priority'));
      assert.ok(no.includes('Your match may still be recorded, but a place on the camera pitch is not guaranteed.'));
      assert.ok(no.includes(preference ? 'No extra charge for this match.' : 'There is no extra charge.'));
      assert.equal(no.includes('Your saved preference stays on for future fixtures.'), preference);
      assert.match(html,/<input[^>]+checked=""[^>]+value="NONE"/);
      for (const expected of [
        'Once SIXFL confirms your booking, your match is guaranteed a place on that pitch.',
        'submitting a request alone does not reserve a space',
        'One-match requests and saved preferences receive the same priority.',
        '£5 charge is added separately to Team payments when the filming slot is confirmed',
        'If filming fails or no usable recording is produced, the charge is voided',
        'returned to team credit.',
        'Your normal match fee remains unchanged.',
        'Teams choosing No thanks may still be filmed without being charged.',
        'Veo Priority is optional. You do not need to select it to confirm your team’s attendance.',
      ]) assert.ok(text.includes(expected), expected);
      assert.doesNotMatch(text, /Would you like this match filmed|Your usual match fee\. This does not change your saved preference/);
      const fieldset = html.match(/<fieldset\b[\s\S]*?<\/fieldset>/)?.[0];
      const other = render({...props, preview:!preview, offer:{...offer, preference, defaultChoice:preference ? 'ONGOING' : 'NONE',requestStatus:null}}).match(/<fieldset\b[\s\S]*?<\/fieldset>/)?.[0];
      assert.equal(textOnly(fieldset), textOnly(other), 'Preview must show the same captain-facing explanation');
    });
  }
}

test('capture the complete native/prepared Veo wording and owner inventory', () => {
  const path = require('node:path');
  const matches = [];
  const stale = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (/\.(?:tsx?|[cm]?js)$/.test(item.name)) {
        fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (/FixtureVeoConfirmationForm|CaptainFixtureConfirmation|Veo Priority|Would you like this match filmed|Your usual match fee\. This does not change your saved preference/.test(line)) matches.push(`${file}:${i+1}:${line.trim()}`);
          if (/Would you like this match filmed\?|Your usual match fee\. This does not change your saved preference\./.test(line)) stale.push(`${file}:${i+1}`);
        });
      }
    }
  }
  walk('src'); walk('scripts');
  fs.mkdirSync('artifacts/veo', {recursive:true});
  fs.writeFileSync('artifacts/veo/confirmation-wording-inventory.txt', matches.join('\n')+'\n');
  assert.ok(matches.length > 0);
  assert.deepEqual(stale, [], 'Do not retain the old ambiguous confirmation wording in source or preparation scripts');
});
