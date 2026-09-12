const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const file='src/components/captain/VeoFixtureConfirmation.tsx';
function load(){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(k=>k==='next/navigation'?{useRouter:()=>({refresh(){}})}:require(k),m,m.exports);return m.exports;}
const offer={fixtureId:'fixture',leagueId:'league',fixtureStamp:'stamp',ongoing:false,choice:'NONE',requested:false,closed:false,status:'OPEN',extraPence:0,capacity:3,basePence:4000,termsVersion:'veo-match-choice-v1'};
function render(preview,overrides={}){return renderToStaticMarkup(React.createElement(load().default,{teamId:'team',offer:{...offer,...overrides},confirmed:false,preview}));}
test('live confirmation offers three mutually exclusive choices and no payment default',()=>{
 const html=render(false);assert.equal((html.match(/type="radio"/g)||[]).length,3);
 for(const text of ['No thanks','Yes, just this match','Yes, this and future matches','£5 extra for the whole team','Confirm our team can play','No payment is taken now'])assert.ok(html.includes(text),text);
 assert.match(html,/<input[^>]*checked=""[^>]*value="NONE"|<input[^>]*value="NONE"[^>]*checked=""/);
 fs.mkdirSync('artifacts/veo',{recursive:true});fs.writeFileSync('artifacts/veo/confirmation-live.html',html);
});
test('preview retains identical choices but has no form or live submit route',()=>{
 const html=render(true);assert.equal((html.match(/type="radio"/g)||[]).length,3);assert.ok(html.includes('Yes, just this match'));assert.match(html,/<fieldset[^>]*disabled/);assert.doesNotMatch(html,/<form|type="submit"/);assert.match(html,/<button[^>]*type="button"[^>]*disabled/);
 fs.writeFileSync('artifacts/veo/confirmation-preview.html',html);
});
test('saved preference can be skipped without cancelling future requests',()=>{
 const html=render(false,{ongoing:true,choice:'ONGOING'});assert.match(html,/saved preference/);assert.match(html,/skip this match without changing/);assert.match(html,/Turn off future Veo Priority/);
});
test('finalised booking shows frozen outcome and no new paid choice',()=>{
 const html=render(false,{closed:true,status:'ACCEPTED',extraPence:500});assert.doesNotMatch(html,/type="radio"/);assert.match(html,/separate £5 Veo add-on/);
 const free=render(false,{closed:true,status:'ACCEPTED',extraPence:0});assert.match(free,/no extra charge/);
});
test('shared sources own the feature, exact-team server permissions and publication phase',()=>{
 const source=fs.readFileSync('src/lib/veo/confirmation.ts','utf8');
 assert.match(source,/m\.role::text='CAPTAIN'/);assert.match(source,/COALESCE\(m\."isActive",true\)/);assert.match(source,/u\.role::text<>'ADMIN'/);assert.match(source,/confirmed\?\.status!=='CONFIRMED'/);
 assert.match(source,/plan\.digest!==input\.digest/);assert.match(source,/alreadyFinalised:true/);assert.doesNotMatch(source,/UPDATE "VeoFixtureSnapshot"|UPDATE "Fixture" SET "homeMatchFeePence"/);
 const route=fs.readFileSync('src/app/api/captain/veo/confirm/route.ts','utf8');assert.match(route,/access\.accessMode!=='captain'/);assert.match(route,/access\.isAdmin/);assert.match(route,/const actorId=access\.user\.id/);assert.ok(route.indexOf('confirmed=true')<route.indexOf('await saveVeoMatchChoice'));
 const page=fs.readFileSync('src/app/captain/team/[teamid]/fixtures/page.tsx','utf8');assert.equal((page.match(/<VeoFixtureConfirmation /g)||[]).length,2);
 assert.match(fs.readFileSync('src/lib/veo/service.ts','utf8'),/if \(!settings\.enabled \|\| settings\.confirmationMode\) return/);
});
