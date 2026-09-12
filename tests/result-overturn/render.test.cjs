const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {load}=require('./loader.cjs');
const Notice=load('src/components/fixtures/OverturnedResultNotice.tsx').default;
const Form=load('src/components/admin/OverturnResultForm.tsx').default;
const props={fixtureId:'test',requestId:'test',updatedAt:new Date().toISOString(),homeScore:4,awayScore:1,homeTeam:{id:'will',name:'Will test team'},awayTeam:{id:'nomads',name:'Nomads test team'},action:async()=>{}};
test('public awarded notice retains the original result and never renders private audit fields',()=>{
 const html=renderToStaticMarkup(React.createElement(Notice,{homeName:'Will test team',awayName:'Nomads test team',overturn:{originalHomeScore:4,originalAwayScore:1,reasonCode:'PLAYER_LIMIT',evidenceNote:'SECRET_WITNESS',decidedByUserId:'SECRET_ADMIN'}}));
 assert.match(html,/Overturned by SIXFL/);assert.match(html,/4–1/);assert.match(html,/Player-limit breach/);assert.doesNotMatch(html,/SECRET/);
 assert.equal(renderToStaticMarkup(React.createElement(Notice,{homeName:'a',awayName:'b',overturn:null})), '');
});
test('native form preserves exact source version, requires positive winner/acknowledgement and distinguishes predictor',()=>{
 const html=renderToStaticMarkup(React.createElement(Form,props));
 for(const name of ['expectedHomeScore','expectedAwayScore','expectedResultUpdatedAt','requestId','winnerTeamId','reasonCode','evidenceNote','rulesBasis','confirmed'])assert.ok(html.includes(`name="${name}"`),name);
 assert.match(html,/original on-pitch score/);assert.match(html,/No payment, refund, fine, email or SMS/);assert.doesNotMatch(html,/<select/);
 const page=fs.readFileSync('src/app/(admin)/admin/fixtures/[id]/result/page.tsx','utf8');
 assert.match(page,/!fixture.result\?\.overturn \? <AdminCard/);
 for(const file of ['src/app/(public)/leagues/[slug]/results/page.tsx','src/app/(public)/leagues/[slug]/fixtures/page.tsx','src/app/captain/team/[teamid]/results/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/<OverturnedResultNotice/,file);
});
