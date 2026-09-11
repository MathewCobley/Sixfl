const {test}=require('node:test');
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), ts=require('typescript');
const {randomUUID,createHash}=require('node:crypto');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {PrismaClient}=require('@prisma/client');
const root=path.resolve(__dirname,'..');
const hash=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
function loader(mocks={}) {
 const cache=new Map();
 function load(file){
  file=path.resolve(root,file); if(!fs.existsSync(file)) file+=fs.existsSync(file+'.ts')?'.ts':'.tsx';
  if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports','process','fetch',code)(id=>{
   if(Object.hasOwn(mocks,id))return mocks[id];
   if(id==='next/link')return {__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
   if(id==='next/navigation')return {notFound(){throw Error('NOT_FOUND')},useRouter:()=>({push(){}})};
   if(id.startsWith('@/'))return load('src/'+id.slice(2));
   if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id));
   if(id.startsWith('node:')||id.startsWith('react')||['@prisma/client','next/server','next/dist/client/components/redirect-error'].includes(id))return require(id);
   throw Error('Unexpected I/O dependency '+id);
  },m,m.exports,{env:{NODE_ENV:'production'}},()=>{throw Error('External requests forbidden')});
  return m.exports;
 }
 return load;
}
function example(){
 const matches=Array.from({length:6},(_,i)=>({fixtureId:`f-${i}`,teamA:`Example ${i+1} FC`,teamB:i>3?'Example Stand-ins':`Example ${i+1} United`,scoreA:i%3+1,scoreB:2,scorers:[],playersOfMatch:[]}));
 const source={leagueId:'league-a',leagueName:'Example Tuesday League',area:'Example',matchDate:'2026-09-08',matches,pendingFixtures:0,omittedFixtures:0,warnings:[],skippedFixtures:[{privateReason:'PRIVATE_OMISSION'}],privateNote:'PRIVATE_NOTE',contactEmail:'SECRET@example.test'};
 const content={title:'Stand-ins sign off a six-match night in style',introduction:'Six matches brought a busy evening of SIXFL football, with Example Stand-ins taking part in the final two games.',matches:matches.map((m,i)=>({fixtureId:m.fixtureId,paragraph:`${m.teamA} finished ${m.scoreA}–${m.scoreB} against ${m.teamB}. Both sides contributed to the recorded score in this example round-up.`})),closing:'The full results and league table are available on the league page.'};
 const identities=matches.map((m,i)=>({id:m.fixtureId,homeTeam:{id:`a-${i}`,name:m.teamA,logoUrl:null},awayTeam:{id:i>3?'stand-in':`b-${i}`,name:m.teamB,logoUrl:null}}));
 return {source,content,identities};
}
const pure=loader()('src/lib/league-news/snapshot.ts');
test('public snapshot is an explicit allowlist, correctly links both replacement fixtures and escapes editorial text',()=>{
 const {source,content,identities}=example();
 const a=pure.buildNewsSnapshot(source,content,identities,{coverUrl:'',coverAlt:'',coverCaption:''});
 assert.equal(a.matches.length,6);assert.equal(a.matches.filter(m=>m.teamBId==='stand-in').length,2);
 assert.doesNotMatch(JSON.stringify(a),/PRIVATE_|SECRET|skippedFixtures|sourceHash|model|actorId|contactEmail/);
 const safe=pure.readNewsSnapshot({...a,actorId:'PRIVATE_ACTOR',privateSource:source});assert.deepEqual(safe,a);
 assert.throws(()=>pure.buildNewsSnapshot(source,content,identities.slice(1),{coverUrl:''}),/teams changed/);
 const news={id:'article',leagueSlug:'example',publishedAt:'2026-09-09T12:00:00Z',updatedAt:'2026-09-09T12:00:00Z',article:{...a,title:'<script>not executable</script>'}};
 const Article=loader()('src/components/news/NewsArticle.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Article,{news,shareUrl:'https://www.sixfl.co.uk/leagues/example/news/2026-09-08'}));
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>not executable/);assert.match(html,/id="match-f-5"/);assert.match(html,/Jump to match/);
 const dir=path.join(root,'.tmp/league-news');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'sample.json'),JSON.stringify({...news,article:a}));
});
test('photo settings reject private paths, traversal, unsafe URLs and missing alternative text',()=>{
 for(const u of ['javascript:alert(1)','data:image/png,abc','http://example.com/a.jpg','https://127.0.0.1/a.jpg','https://user:secret@example.com/a.jpg','/admin/secret','/images/../api/private','//example.com/a.jpg','/api/private']) assert.equal(pure.newsImageUrl(u),null,u);
 assert.equal(pure.newsImageUrl('/api/team-badges/badge-a'),'/api/team-badges/badge-a');
 assert.throws(()=>pure.validateNewsSettings({coverUrl:'https://images.example.com/photo.jpg'}),/describe/);
 assert.equal(pure.validateNewsSettings({coverUrl:'https://images.example.com/photo.jpg',coverAlt:'A match photograph',adminNote:'PRIVATE'}).adminNote,undefined);
});
test('all publication administrative entry points authorise before storage or source reads',async()=>{
 let reads=0;
 const manage=loader({'@/lib/requireAdmin':{requireAdmin:async()=>{throw Error('DENIED')}},'@/lib/prisma':{prisma:{}},'@/lib/matchweek-reports/facts':{getReportSource:async()=>{reads++},sourceHash:hash},'next/cache':{revalidatePath(){}}})('src/lib/league-news/manage.ts');
 for(const [method,args]of [['getNewsPublicationState',['example','2026-09-08']],['previewNews',['example','2026-09-08',1,0]],['manageNewsPublication',['example',{}]]]) await assert.rejects(manage[method](...args),/DENIED/);
 assert.equal(reads,0);
});
test('new publication actions inherit the real API administrator, origin and request-header guard',async()=>{
 let writes=0,authorised=true;
 const {NextRequest}=require('next/server');
 const ReportError=loader()('src/lib/matchweek-reports/types.ts').ReportError;
 const route=loader({'@/lib/requireAdmin':{requireAdmin:async()=>{if(!authorised)throw new ReportError('DENIED',401)}},'@/lib/matchweek-reports/types':{ReportError},'@/lib/matchweek-reports/service':{},'@/lib/league-news/manage':{manageNewsPublication:async()=>{writes++;return {}},getNewsPublicationState:async()=>{if(!authorised)throw new ReportError('DENIED',401);return {}}}})('src/app/api/admin/matchweek-reports/[slug]/route.ts');
 const ctx={params:Promise.resolve({slug:'example'})};
 for(const action of ['publish','unpublish','news-settings']){
  const req=(origin,extra={})=>new NextRequest('http://0.0.0.0:8080/api/admin/matchweek-reports/example',{method:'POST',headers:{origin,'x-forwarded-host':'sixfl.example','content-type':'application/json','x-sixfl-report':'1',...extra},body:JSON.stringify({action})});
  assert.equal((await route.POST(req('https://evil.example'),ctx)).status,403);
  assert.equal((await route.POST(req('https://sixfl.example',{'x-sixfl-report':''}),ctx)).status,403);
  assert.equal((await route.POST(req('https://sixfl.example'),ctx)).status,200);
  authorised=false;assert.equal((await route.POST(req('https://sixfl.example'),ctx)).status,401);authorised=true;
 }
 assert.equal(writes,3);
 authorised=false;assert.equal((await route.GET(new NextRequest('https://sixfl.example/api/admin/matchweek-reports/example?date=2026-09-08&publication=1'),ctx)).status,401);
});
test('public article and metadata use only the published reader; missing/unpublished paths return not found',async()=>{
 const Page=loader({'@/lib/league-news/read':{getPublishedNews:async()=>null}})('src/app/(public)/leagues/[slug]/news/[date]/page.tsx');
 const props={params:Promise.resolve({slug:'example',date:'2026-09-08'})};
 await assert.rejects(Page.default(props),/NOT_FOUND/);await assert.rejects(Page.generateMetadata(props),/NOT_FOUND/);
});
test('anonymous discovery API is GET-only, bounded and delegates only to published news',async()=>{
 const {NextRequest}=require('next/server');const calls=[];let fail=false;
 const route=loader({'@/lib/prisma':{prisma:{league:{findFirst:async q=>q.where.slug==='example'?{id:'league-a'}:null}}},'@/lib/league-news/read':{listPublishedNews:async q=>{calls.push(q);if(fail)throw Error('PRIVATE_DATABASE_ERROR');return {items:[],hasMore:false}}}})('src/app/api/public/league-news/[scope]/[id]/route.ts');
 const get=(scope,id,limit='999')=>route.GET(new NextRequest('https://sixfl.example/api/public/league-news/'+scope+'/'+id+'?limit='+limit),{params:Promise.resolve({scope,id})});
 const league=await get('league','example');assert.equal(league.status,200);assert.deepEqual(await league.json(),{items:[]});assert.match(league.headers.get('cache-control'),/no-store/);assert.deepEqual(calls[0],{leagueId:'league-a',limit:2});
 assert.equal((await get('team','stand-in','1')).status,200);assert.deepEqual(calls[1],{teamId:'stand-in',limit:1});
 assert.equal((await get('private','example')).status,404);assert.equal((await get('league','unknown')).status,404);assert.equal(calls.length,2);assert.equal(route.POST,undefined);
 fail=true;const bad=await get('team','stand-in');assert.equal(bad.status,503);assert.doesNotMatch(JSON.stringify(await bad.json()),/PRIVATE_DATABASE_ERROR/);
});
test('shared news, publishing and discovery survive full source preparation without a public draft route',()=>{
 for(const file of ['src/app/(public)/leagues/[slug]/template.tsx','src/app/(public)/teams/[id]/template.tsx','src/app/captain/team/[teamid]/template.tsx','src/app/player/team/[teamid]/template.tsx']) assert.equal((fs.readFileSync(path.join(root,file),'utf8').match(/<LatestNews\b/g)||[]).length,1,file);
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');
 assert.match(read('src/components/leagues/LeagueQuickLinks.tsx'),/label: "League News"/);
 assert.match(read('src/components/news/LatestNews.tsx'),/api\/public\/league-news/);
 assert.doesNotMatch(read('src/components/news/LatestNews.tsx'),/querySelector|MutationObserver/);
 assert.match(read('src/components/admin/matchweek-reports/ReportEditor.tsx'),/<NewsPublishingControls/);
 assert.match(read('src/app/(admin)/admin/matchweek-reports/[slug]/preview/page.tsx'),/await requireAdmin\(\)/);
 assert.match(read('src/app/(public)/leagues/[slug]/weekly-report/page.tsx'),/await requireAdmin\(\)/);
 assert.doesNotMatch(read('src/lib/league-news/read.ts'),/MatchweekReportDraft|MatchweekReportRevision|getReportSource|SELECT \*/);
 for(const file of ['src/components/news/NewsArticle.tsx','src/components/news/NewsCard.tsx'])assert.doesNotMatch(read(file),/dangerouslySetInnerHTML|querySelector|MutationObserver/);
 assert.doesNotMatch(read('src/lib/league-news/manage.ts'),/writeOpenAiReport|queueNotification|sendEmail/);
});
const testDb=process.env.NEWS_TEST_DATABASE_URL;
test('real PostgreSQL publication lifecycle: private drafts, preview, controlled updates, team discovery, concurrent writes, unpublish and replay', {skip:!testDb},async()=>{
 const u=new URL(testDb);assert.ok(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/sixfl_news_test');
 const db=new PrismaClient({datasourceUrl:testDb}),{source,content,identities}=example(),invalidations=[];
 let current=source;
 const mock={'@/lib/prisma':{prisma:db},'@/lib/requireAdmin':{requireAdmin:async()=>({user:{id:'test-admin'}})},'@/lib/matchweek-reports/facts':{getReportSource:async()=>current,sourceHash:hash},'next/cache':{revalidatePath:p=>invalidations.push(p)}};
 const load=loader(mock),manage=load('src/lib/league-news/manage.ts'),pub=load('src/lib/league-news/read.ts');
 const slug='example',date=source.matchDate,draftId=randomUUID();
 const command=(action,revision,draftVersion=1,extra={})=>({action,requestId:randomUUID(),matchDate:date,revision,draftVersion,sourceHash:hash(current),...extra});
 try{
  await db.$executeRaw`INSERT INTO "League" ("id","name","slug") VALUES ('league-a','Example Tuesday League','example')`;
  for(const t of new Map(identities.flatMap(f=>[f.homeTeam,f.awayTeam]).map(t=>[t.id,t])).values()) await db.$executeRaw`INSERT INTO "Team" ("id","name") VALUES (${t.id},${t.name})`;
  for(const f of identities)await db.$executeRaw`INSERT INTO "Fixture" ("id","leagueId","homeTeamId","awayTeamId") VALUES (${f.id},'league-a',${f.homeTeam.id},${f.awayTeam.id})`;
  await db.$executeRaw`INSERT INTO "MatchweekReportDraft" ("id","leagueId","matchDate","version","content","source","sourceHash") VALUES (${draftId},'league-a',${date},1,${JSON.stringify(content)}::jsonb,${JSON.stringify(source)}::jsonb,${hash(source)})`;
  assert.equal((await pub.listPublishedNews()).items.length,0);assert.equal(await pub.getPublishedNews(slug,date),null);
  const preview=await manage.previewNews(slug,date,1,0);assert.equal(preview.article.matches.length,6);assert.equal((await pub.listPublishedNews()).items.length,0);
  const first=command('publish',0);const s1=await manage.manageNewsPublication(slug,first);assert.equal(s1.status,'PUBLISHED');assert.equal(s1.revision,1);
  const live=await pub.getPublishedNews(slug,date);assert.equal(live.article.title,content.title);assert.doesNotMatch(JSON.stringify(live),/PRIVATE_|SECRET|draftId|sourceVersion|settings/);
  assert.equal((await pub.listPublishedNews({teamId:'stand-in'})).items.length,1);assert.equal((await pub.listPublishedNews({teamId:'dropped'})).items.length,0);assert.equal((await pub.getNewsSitemap()).length,1);
  await manage.manageNewsPublication(slug,first);assert.equal((await manage.getNewsPublicationState(slug,date)).revision,1);
  const settings={coverUrl:'https://images.example.com/match.jpg',coverAlt:'Football on the pitch',coverCaption:'Photo: SIXFL'};
  await manage.manageNewsPublication(slug,command('news-settings',1,1,{settings}));
  assert.equal((await pub.getPublishedNews(slug,date)).article.cover,null);assert.equal((await pub.getPublishedNews(slug,date)).updatedAt,live.updatedAt);
  assert.equal((await manage.previewNews(slug,date,1,2)).article.cover.coverUrl,settings.coverUrl);
  const edited={...content,title:'An edited headline, still private'};
  await db.$executeRaw`UPDATE "MatchweekReportDraft" SET "content"=${JSON.stringify(edited)}::jsonb,"version"=2 WHERE "id"=${draftId}`;
  assert.equal((await pub.getPublishedNews(slug,date)).article.title,content.title);
  await assert.rejects(manage.manageNewsPublication(slug,command('publish',2,1)),/newer draft/);
  current={...source,matches:source.matches.slice(0,4)};
  await assert.rejects(manage.manageNewsPublication(slug,command('publish',2,2)),/out of date/);current=source;
  const concurrent=await Promise.allSettled([manage.manageNewsPublication(slug,command('publish',2,2)),manage.manageNewsPublication(slug,command('publish',2,2))]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.filter(r=>r.status==='rejected').length,1);
  const updated=await pub.getPublishedNews(slug,date);assert.equal(updated.article.title,edited.title);assert.equal(updated.article.cover.coverUrl,settings.coverUrl);
  const undo=command('unpublish',3,2);await manage.manageNewsPublication(slug,undo);
  assert.equal(await pub.getPublishedNews(slug,date),null);assert.equal((await pub.listPublishedNews()).items.length,0);assert.deepEqual(await pub.getNewsSitemap(),[]);
  await manage.manageNewsPublication(slug,first);assert.equal(await pub.getPublishedNews(slug,date),null,'replaying old publish never undoes unpublish');
  assert.equal((await manage.getNewsPublicationState(slug,date)).revision,4);
  const kept=(await db.$queryRaw`SELECT "version","content" FROM "MatchweekReportDraft" WHERE "id"=${draftId}`)[0];assert.equal(kept.version,2);assert.equal(kept.content.title,edited.title);
  assert.ok(invalidations.includes('/sitemap.xml'));assert.ok(invalidations.includes('/teams/stand-in'));
  await assert.rejects(manage.manageNewsPublication(slug,{...first,action:'unpublish'}),/already used/);
 }finally{await db.$disconnect();}
});
