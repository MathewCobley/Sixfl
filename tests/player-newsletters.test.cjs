const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
const article = { id:'news1', leagueSlug:'harrogate', publishedAt:'2026-09-23', updatedAt:'2026-09-23', matchweekNumber:12, article:{ leagueName:'Harrogate', matchDate:'2026-09-22', title:'A great matchnight', introduction:'The latest stories', closing:'See you next week', cover:null, matches:[
  {fixtureId:'other-fixture',teamAId:'other-a',teamBId:'other-b',teamA:'Other A',teamB:'Other B',badgeA:null,badgeB:null,scoreA:4,scoreB:4,paragraph:'Around the league story',scorers:[],playersOfMatch:[]},
  {fixtureId:'f',teamAId:'team',teamBId:'other',teamA:'Our team',teamB:'Opponents',badgeA:null,badgeB:null,scoreA:2,scoreB:1,paragraph:'A close finish',scorers:[{team:'Our team',name:'Alex',goals:2}],playersOfMatch:[{team:'Our team',name:'Sam'}]},
] } };
function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports',code)(id=>{
    if (id in mocks) return mocks[id];
    if(id==='react/jsx-runtime') return require(id);
    if(id==='next/link') return ({children,...props})=>h('a',props,children);
    throw Error(`Unmocked ${id}`);
  },mod,mod.exports);
  return mod.exports.default;
}
const presentationMocks={
  '@/components/news/NewsArticle':{newsDate:date=>date},
  '@/components/news/NewsImage':({alt})=>h('span',null,alt),
};
const Reader=load('src/components/player/PlayerNewsArticle.tsx',presentationMocks);
async function render({signedIn=true,member=true,admin=false,search={},news=article,items=[article]}={}) {
  const calls=[];
  const Page=load('src/app/player/team/[teamid]/news/page.tsx',{
    ...presentationMocks,
    '@prisma/client':{UserRole:{ADMIN:'ADMIN'}},
    'next-auth':{getServerSession:async()=>signedIn?{user:{email:'player@example.test'}}:null},
    'next/navigation':{notFound:()=>{throw Error('NOT_FOUND')},redirect:url=>{throw Error(`REDIRECT:${url}`)}},
    '@/auth':{authOptions:{}},
    '@/lib/prisma':{prisma:{user:{findUnique:async()=>({role:admin?'ADMIN':'USER',teamMembers:member?[{id:'member'}]:[]})},team:{findUnique:async()=>({name:'Our team'})},teamMember:{findFirst:async args=>args.where.teamId==='team'&&args.where.id==='preview'?{id:'preview'}:null}}},
    '@/lib/league-news/read':{listPublishedNews:async input=>{calls.push(input);return {items,hasMore:true}},getPublishedNews:async()=>news},
    '@/components/player/PlayerNewsArticle':Reader,
  });
  const html=renderToStaticMarkup(await Page({params:Promise.resolve({teamid:'team'}),searchParams:Promise.resolve(search)}));
  return {html,calls};
}
test('newsletter feed requires a signed-in team member or administrator',async()=>{
  await assert.rejects(render({signedIn:false}),/REDIRECT/);
  await assert.rejects(render({member:false}),/NOT_FOUND/);
  assert.match((await render({member:false,admin:true})).html,/A great matchnight/);
});
test('feed scopes published source to team, paginates in app and keeps validated preview',async()=>{
  const {html,calls}=await render({admin:true,search:{page:'2',previewMembershipId:'preview'}});
  assert.deepEqual(calls,[{teamId:'team',page:2,limit:8}]);
  assert.match(html,/\/player\/team\/team\/news\?league=harrogate&amp;date=2026-09-22&amp;previewMembershipId=preview/);
  assert.match(html,/page=3&amp;previewMembershipId=preview/);
  assert.match(html,/page=1&amp;previewMembershipId=preview/);
  assert.doesNotMatch((await render({search:{previewMembershipId:'preview'}})).html,/previewMembershipId/);
  assert.equal((await render({search:{page:'NaN'}})).calls[0].page,1);
});
test('reader rejects unpublished, incomplete and unrelated articles',async()=>{
  const search={league:'harrogate',date:'2026-09-22'};
  await assert.rejects(render({search,news:null}),/NOT_FOUND/);
  await assert.rejects(render({search:{league:'harrogate'}}),/NOT_FOUND/);
  await assert.rejects(render({search,news:{...article,article:{...article.article,matches:[]}}}),/NOT_FOUND/);
});
test('reader puts the player team match first, then the rest of the league, without website exits',async()=>{
  const {html}=await render({search:{league:'harrogate',date:'2026-09-22'}});
  for(const text of ['Matchweek 12 report','A great matchnight','A close finish','Alex','Sam','See you next week','Your match','Around the league','2–1']) assert.ok(html.includes(text),text);
  assert.ok(html.indexOf('A close finish') < html.indexOf('Around the league story'), 'team match must be shown before unrelated matches');
  const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(links,['/player/team/team/news']);
  assert.match((await render({items:[]})).html,/once published/);
});

test('feed is explicitly matchweek reports and leads with the player team score',async()=>{
  const {html}=await render();
  for(const text of ['Matchweek reports','Your match first','Your match','Our team','Opponents','2–1','From the full matchweek report','Read matchweek report →']) assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/Newsletters|Read newsletter/);
  assert.ok(html.indexOf('Your match') < html.indexOf('A great matchnight'));
});
