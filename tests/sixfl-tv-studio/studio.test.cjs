const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

function loader(mocks) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName:file, compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true} }).outputText;
    new Function('require','module','exports',code)(id=>{
      if (Object.hasOwn(mocks,id)) return mocks[id];
      const base=id.startsWith('@/')?'src/'+id.slice(2):id.startsWith('.')?path.join(path.dirname(file),id):null;
      if(base)for(const ext of['','.ts','.tsx'])if(fs.existsSync(base+ext))return load(base+ext);
      return require(id);
    },mod,mod.exports);
    return mod.exports;
  }
  return load;
}
function applySql(db,file){const sql=fs.readFileSync(file,'utf8');return Promise.all(sql.split(';').map(x=>x.trim()).filter(Boolean).map(()=>null)).then(async()=>{for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);});}

const fixtureData = (id) => ({
  id, kickoffAt:new Date('2026-09-17T19:00:00Z'), status:'COMPLETED', round:7,
  league:{id:'league-a',name:'Northallerton Wednesday',season:'Autumn 2026'},
  homeTeam:{id:'team-a',name:'Town Hall 6s',logoUrl:null,broadcastCode:'TH6'}, awayTeam:{id:'team-b',name:'Ballerz FC',logoUrl:null,broadcastCode:'BFC'},
  selections:id==='legacy-lineup'?[]:[
    {selectionStatus:'SELECTED',isCaptain:true,isGoalkeeper:false,createdAt:new Date('2026-09-17T18:00:00Z'),teamMember:{teamId:'team-a',user:{name:'Alex One'}}},
    {selectionStatus:'SELECTED',isCaptain:false,isGoalkeeper:true,createdAt:new Date('2026-09-17T18:01:00Z'),teamMember:{teamId:'team-a',user:{name:'Sam Keeper'}}},
    {selectionStatus:'BACKUP',isCaptain:false,isGoalkeeper:false,createdAt:new Date('2026-09-17T18:01:30Z'),teamMember:{teamId:'team-a',user:{name:'Backup Person'}}},
    {selectionStatus:'SELECTED',isCaptain:false,isGoalkeeper:true,createdAt:new Date('2026-09-17T18:02:00Z'),teamMember:{teamId:'team-b',user:{name:'Chris Three'}}},
    {selectionStatus:'NOT_SELECTED',isCaptain:false,isGoalkeeper:false,createdAt:new Date('2026-09-17T18:03:00Z'),teamMember:{teamId:'team-b',user:{name:'Not Playing'}}},
  ],
  playerMatchFees:id==='legacy-lineup'?[
    {teamId:'team-a',status:'PAID',createdAt:new Date('2026-09-17T17:00:00Z'),teamMember:{user:{name:'Legacy One'}},prospect:null},
    {teamId:'team-a',status:'OPEN',createdAt:new Date('2026-09-17T17:01:00Z'),teamMember:{user:{name:'Legacy Two'}},prospect:null},
    {teamId:'team-b',status:'WAIVED',createdAt:new Date('2026-09-17T17:02:00Z'),teamMember:null,prospect:{firstName:'Guest',lastName:'Player'}},
  ]:[],
  result:id==='no-result'?null:{id:'result-1',homeScore:4,awayScore:2,isDisputed:id==='disputed',overturn:null,teamMetadata:[
    {teamId:'team-a',scorers:[{name:'Alex One',goals:2,assists:0},{name:'Sam Two',goals:1,assists:1}],goalsRecorded:3},
    {teamId:'team-b',scorers:[{name:'Chris Three',goals:1,assists:0}],goalsRecorded:1},
  ]},
});

test('fixture graphics generate deterministic YouTube and video-card PNG shapes', async()=>{
  const brand=await sharp({create:{width:320,height:120,channels:4,background:{r:16,g:185,b:129,alpha:1}}}).png().toBuffer();
  const fontRegular=fs.readFileSync('public/fonts/Inter-Regular.ttf');
  const fontBold=fs.readFileSync('public/fonts/Inter-Bold.ttf');
  const originalFetch=global.fetch;
  let fontFetches=0;
  global.fetch=async input=>{
    const url=String(input instanceof Request?input.url:input);
    if(url.endsWith('/Sixfl-tv.png')||url.endsWith('/logos/sixfl-ai-predictor.png'))return new Response(new Uint8Array(brand),{status:200,headers:{'content-type':'image/png'}});
    if(url.endsWith('/fonts/Inter-Regular.ttf')){fontFetches++;return new Response(new Uint8Array(fontRegular),{status:200,headers:{'content-type':'font/ttf'}});}
    if(url.endsWith('/fonts/Inter-Bold.ttf')){fontFetches++;return new Response(new Uint8Array(fontBold),{status:200,headers:{'content-type':'font/ttf'}});}
    throw new Error('Unexpected graphics fetch '+url);
  };
  try{
    const graphics=loader({})('src/lib/sixfl-tv/graphics.ts');
    const fixture={leagueName:'Northallerton Wednesday · Autumn 2026',kickoffLabel:'Thu, 17 Sep 2026',kickoffIso:'2026-09-17T18:30:00.000Z',matchweekNumber:7,firstTeam:{name:'Town Hall 6s',logoUrl:null,broadcastCode:'TH6',score:4},secondTeam:{name:'Ballerz FC',logoUrl:null,broadcastCode:'BFC',score:2},scorers:['Town Hall 6s: Alex One x2, Sam Two','Ballerz FC: Chris Three']};
    const realFrame=await sharp({create:{width:1280,height:720,channels:3,background:{r:34,g:72,b:46}}}).jpeg().toBuffer();
    const thumb=await graphics.createSixflTvThumbnail({kind:'HIGHLIGHTS',fixture,headline:'MATCH HIGHLIGHTS',strapline:'Northallerton Wednesday',showScore:true,siteUrl:'https://sixfl.co.uk',backgroundImage:realFrame});
    const fallbackThumb=await graphics.createSixflTvThumbnail({kind:'HIGHLIGHTS',fixture,headline:'MATCH HIGHLIGHTS',strapline:'Northallerton Wednesday',showScore:true,siteUrl:'https://sixfl.co.uk'});
    const fullThumb=await graphics.createSixflTvThumbnail({kind:'FULL_MATCH',fixture,headline:'FULL MATCH',strapline:'Northallerton Wednesday',showScore:true,siteUrl:'https://sixfl.co.uk',backgroundImage:realFrame});
    assert.equal(fontFetches,0,'Web thumbnail previews must not depend on embedded font fetches that can rasterise as blank text on Vercel');
    const card=await graphics.createSixflTvVideoCard({fixture,mode:'FULL_TIME',label:'MATCH HIGHLIGHTS',siteUrl:'https://sixfl.co.uk'});
    const goal=await graphics.createSixflTvGoalOfMonthCard({siteUrl:'https://www.sixfl.co.uk',fixture});
    const scoreBug=await graphics.createSixflTvScoreBug({fixture,kind:'HIGHLIGHTS',siteUrl:'https://sixfl.co.uk'});
    const fullScoreBug=await graphics.createSixflTvScoreBug({fixture,kind:'FULL_MATCH',siteUrl:'https://sixfl.co.uk'});
    const fixtureWithTable={...fixture,leagueTable:{title:'Northallerton Wednesday · Autumn 2026',rows:[
      {position:1,teamId:'team-a',teamName:'Town Hall 6s',played:4,goalDifference:7,points:10},
      {position:2,teamId:'team-b',teamName:'Ballerz FC',played:4,goalDifference:3,points:8},
      {position:3,teamId:'team-c',teamName:'Third FC',played:4,goalDifference:1,points:7},
      {position:4,teamId:'team-d',teamName:'Fourth FC',played:4,goalDifference:0,points:5},
    ]}};
    const lineup=await graphics.createSixflTvLineupCard({fixture:{...fixture,firstTeamLineup:['Alex One (C)','Sam Keeper (GK)'],secondTeamLineup:['Chris Three (GK)'],predictor:{firstTeamScore:3,secondTeamScore:2}},siteUrl:'https://sixfl.co.uk'});
    const tableTop=await graphics.createSixflTvLeagueTableCard({fixture:fixtureWithTable,page:'TOP',siteUrl:'https://sixfl.co.uk'});
    const tableBottom=await graphics.createSixflTvLeagueTableCard({fixture:fixtureWithTable,page:'BOTTOM',siteUrl:'https://sixfl.co.uk'});
    const tm=await sharp(thumb).metadata(), ftm=await sharp(fullThumb).metadata(), cm=await sharp(card).metadata(), gm=await sharp(goal).metadata(), sm=await sharp(scoreBug).metadata(), fsm=await sharp(fullScoreBug).metadata(), lm=await sharp(lineup).metadata(), ttm=await sharp(tableTop).metadata(), tbm=await sharp(tableBottom).metadata();
    assert.equal(tm.format,'png');assert.equal(tm.width,1280);assert.equal(tm.height,720);
    assert.equal(ftm.format,'png');assert.equal(ftm.width,1280);assert.equal(ftm.height,720);
    assert.notDeepEqual(thumb,fallbackThumb,'A stored match action frame must materially change the thumbnail background');
    assert.notDeepEqual(thumb,fullThumb,'Highlights and full-match thumbnails need visibly distinct templates');
    assert.equal(cm.format,'png');assert.equal(cm.width,1920);assert.equal(cm.height,1080);
    assert.equal(gm.format,'png');assert.equal(gm.width,1920);assert.equal(gm.height,1080);
    assert.equal(sm.format,'png');assert.equal(sm.width,1920);assert.equal(sm.height,1080);
    assert.equal(fsm.format,'png');assert.equal(fsm.width,1920);assert.equal(fsm.height,1080);
    assert.equal(lm.format,'png');assert.equal(lm.width,1920);assert.equal(lm.height,1080);
    assert.equal(ttm.format,'png');assert.equal(ttm.width,1920);assert.equal(ttm.height,1080);
    assert.equal(tbm.format,'png');assert.equal(tbm.width,1920);assert.equal(tbm.height,1080);
  }finally{global.fetch=originalFetch;}
});

test('studio queues saved sources in editing order and requires confirmed result', async t=>{
  const url=new URL(process.env.TEST_FOOTAGE_DATABASE_URL||'http://missing.invalid');
  assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost'].includes(url.hostname));
  const schema='studio_'+randomUUID().replaceAll('-','');const root=new PrismaClient({datasources:{db:{url:url.toString()}}});await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);url.searchParams.set('schema',schema);const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
  const objects=new Map();
  const priorFixtures=[
    {homeTeamId:'team-a',awayTeamId:'prior-1',kickoffAt:new Date('2026-08-20T19:00:00Z'),result:{homeScore:4,awayScore:1}},
    {homeTeamId:'prior-2',awayTeamId:'team-a',kickoffAt:new Date('2026-08-27T19:00:00Z'),result:{homeScore:2,awayScore:2}},
    {homeTeamId:'team-b',awayTeamId:'prior-3',kickoffAt:new Date('2026-09-03T19:00:00Z'),result:{homeScore:1,awayScore:3}},
  ];
  const mockDb={
    $queryRaw:async(strings,...values)=>{
      const sql=Array.isArray(strings)?strings.join('?'):Array.isArray(strings?.strings)?strings.strings.join('?'):String(strings);
      if(sql.includes('FROM "FixtureAiPrediction"'))return [{predictedHomeScore:3,predictedAwayScore:2,headline:'Town Hall 6s edged'}];
      return Array.isArray(strings)?db.$queryRaw(strings,...values):db.$queryRaw(strings);
    },
    $executeRaw:db.$executeRaw.bind(db),$transaction:fn=>db.$transaction(fn),
    fixture:{findUnique:async({where})=>fixtureData(where.id),findMany:async()=>priorFixtures},
  };
  const load=loader({
    '@/lib/prisma':{prisma:mockDb},
    '@/lib/standings':{getLeagueStandings:async()=>({
      league:{id:'league-a',name:'Northallerton Wednesday',season:'Autumn 2026',slug:'northallerton'},
      hasDivisions:false,divisions:[],membershipConflicts:[],
      rows:[
        {teamId:'team-a',teamName:'Town Hall 6s',played:4,won:3,drawn:1,lost:0,goalsFor:10,goalsAgainst:3,goalDifference:7,points:10,recentForm:['W','D']},
        {teamId:'team-b',teamName:'Ballerz FC',played:4,won:2,drawn:2,lost:0,goalsFor:8,goalsAgainst:5,goalDifference:3,points:8,recentForm:['D','W']},
        {teamId:'team-c',teamName:'Third FC',played:4,won:2,drawn:1,lost:1,goalsFor:7,goalsAgainst:6,goalDifference:1,points:7,recentForm:['L','W']},
        {teamId:'team-d',teamName:'Fourth FC',played:4,won:1,drawn:2,lost:1,goalsFor:5,goalsAgainst:5,goalDifference:0,points:5,recentForm:['D','D']},
      ],
    })},
    '@/lib/storage/railway-s3':{
    uploadRailwayObject:async({key,body})=>objects.set(key,Buffer.from(body)),deleteRailwayObject:async key=>objects.delete(key),fetchRailwayObject:async({key})=>objects.has(key)?new Response(new Uint8Array(objects.get(key)),{status:200,headers:{'content-type':'image/png'}}):new Response(null,{status:404}),
  }});
  const studio=load('src/lib/sixfl-tv/studio.ts'),youtube=load('src/lib/sixfl-tv/youtube.ts');
  const envNames=['AWS_ENDPOINT_URL','AWS_S3_BUCKET_NAME','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','NEXT_PUBLIC_SITE_URL','NEXTAUTH_SECRET','SIXFL_TV_TOKEN_KEY','YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET'];
  const old=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{AWS_ENDPOINT_URL:'test',AWS_S3_BUCKET_NAME:'test',AWS_ACCESS_KEY_ID:'test',AWS_SECRET_ACCESS_KEY:'test',NEXT_PUBLIC_SITE_URL:'https://sixfl.co.uk',NEXTAUTH_SECRET:'test-auth-secret',SIXFL_TV_TOKEN_KEY:'test-token-key',YOUTUBE_CLIENT_ID:'test-client',YOUTUBE_CLIENT_SECRET:'test-secret'});
  try{
    await db.$executeRawUnsafe('CREATE TABLE "Fixture" ("id" TEXT PRIMARY KEY)');for(const id of['match-a','no-result','disputed'])await db.$executeRaw`INSERT INTO "Fixture" ("id") VALUES (${id})`;
    await applySql(db,'prisma/migrations/20260917170000_sixfl_tv_footage_uploads/migration.sql');await applySql(db,'prisma/migrations/20260917213000_sixfl_tv_studio/migration.sql');
    const add=async(id,fixtureId,kind,position)=>db.$executeRaw`INSERT INTO "SixflTvFootageAsset" ("id","fixtureId","kind","filename","sizeBytes","lastModified","partCount","position","createdByActor","state","completedAt") VALUES (${id},${fixtureId},${kind},${id+'.mp4'},24,1,1,${position},'admin','READY',NOW())`;
    await add('intro',null,'INTRO',0);await add('clip-a','match-a','CLIP',0);await add('clip-b','match-a','CLIP',1);await add('ready-highlights','match-a','HIGHLIGHTS',0);await add('full','match-a','FULL_MATCH',0);await add('outro',null,'OUTRO',0);
    await assert.rejects(studio.requestRenders('no-result','admin'),/final result/);await assert.rejects(studio.requestRenders('disputed','admin'),/disputed/);
    const first=await studio.requestRenders('match-a','admin');assert.equal(first.renders.length,2);
    const second=await studio.requestRenders('match-a','admin');assert.deepEqual(second.renders.map(x=>x.id).sort(),first.renders.map(x=>x.id).sort());
    const firstFull=first.renders.find(x=>x.kind==='FULL_MATCH');
    const stopped=await studio.cancelRenders('match-a','admin','FULL_MATCH');assert.equal(stopped.stopped.length,1);assert.equal(stopped.stopped[0].id,firstFull.id);assert.equal(stopped.stopped[0].state,'FAILED');assert.match(stopped.stopped[0].error,/Stopped by SIXFL admin/);
    const restarted=await studio.requestRenders('match-a','admin');const restartedFull=restarted.renders.find(x=>x.kind==='FULL_MATCH');assert.notEqual(restartedFull.id,firstFull.id,'A stopped render must release its active slot for a fresh job');
    const jobs=await db.$queryRaw`SELECT "id","kind","state","error","metadataJson" FROM "SixflTvRenderJob" WHERE "fixtureId"='match-a' ORDER BY "kind","createdAt"`;assert.equal(jobs.length,3);
    assert.equal(jobs.find(x=>x.id===firstFull.id).state,'FAILED');assert.match(jobs.find(x=>x.id===firstFull.id).error,/Stopped by SIXFL admin/);
    assert.ok(jobs.every(x=>Number(x.metadataJson.renderVersion)===15),'Renderer version must invalidate old finished previews after editing changes');
    const high=jobs.find(x=>x.kind==='HIGHLIGHTS');const inputs=await db.$queryRaw`SELECT i."assetId",i."role",i."position" FROM "SixflTvRenderInput" i WHERE i."jobId"=${high.id} ORDER BY i."position"`;
    assert.deepEqual(inputs.map(x=>x.assetId),['intro','clip-a','clip-b','outro'],'Ordered clips must take priority over a ready-made highlights file so transitions can be inserted');assert.deepEqual(inputs.map(x=>x.role),['INTRO','CONTENT','CONTENT','OUTRO']);
    const graphic=await studio.studioGraphicFixture('match-a');assert.deepEqual(graphic.scorers,['Town Hall 6s: Alex One x2, Sam Two','Ballerz FC: Chris Three']);
    assert.deepEqual(graphic.firstTeamLineup,['Alex One (C)','Sam Keeper (GK)']);assert.deepEqual(graphic.secondTeamLineup,['Chris Three (GK)']);
    assert.ok(!graphic.firstTeamLineup.includes('Backup Person'),'Backups are not part of the matchday lineup card');
    const legacyGraphic=await studio.studioGraphicFixture('legacy-lineup');
    assert.deepEqual(legacyGraphic.firstTeamLineup,['Legacy One','Legacy Two']);assert.deepEqual(legacyGraphic.secondTeamLineup,['Guest Player']);
    assert.deepEqual(graphic.firstTeamForm,['W','D']);assert.deepEqual(graphic.secondTeamForm,['L']);
    assert.deepEqual(graphic.predictor,{firstTeamScore:3,secondTeamScore:2,headline:'Town Hall 6s edged'});
    assert.equal(graphic.firstTeam.broadcastCode,'TH6');assert.equal(graphic.secondTeam.broadcastCode,'BFC');assert.equal(graphic.matchweekNumber,7);
    assert.equal(graphic.leagueTable.rows[0].teamName,'Town Hall 6s');assert.equal(graphic.leagueTable.rows[1].position,2);
    assert.ok(priorFixtures.every(f=>f.kickoffAt < fixtureData('match-a').kickoffAt),'Recent form fixtures are all before the current match');
    const actionFrame=await sharp({create:{width:1280,height:720,channels:3,background:{r:18,g:92,b:58}}}).jpeg().toBuffer();
    objects.set('sixfl-tv-thumbnail-background/v1/match-a/match-action.jpg',actionFrame);
    const beforePreviewObjects=objects.size;
    const preview=await studio.thumbnailPreviewResponse('match-a','HIGHLIGHTS',{headline:'LIVE PREVIEW',strapline:'Week 4',showScore:'true'});
    assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/png/);assert.equal(objects.size,beforePreviewObjects,'Live preview must not save or replace thumbnail storage');
    const previewMeta=await sharp(Buffer.from(await preview.arrayBuffer())).metadata();assert.equal(previewMeta.width,1280);assert.equal(previewMeta.height,720);
    const saved=await studio.saveThumbnail('match-a','HIGHLIGHTS','admin',{headline:'NORTHALLERTON HIGHLIGHTS',strapline:'Week 4',showScore:true});assert.equal(saved.kind,'HIGHLIGHTS');assert.ok(saved.sizeBytes>1000);
    const thumbResponse=await studio.thumbnailResponse(new Request('https://sixfl.co.uk/test'),'match-a','HIGHLIGHTS');assert.equal(thumbResponse.status,200);assert.match(thumbResponse.headers.get('content-type'),/png/);
    const state=await studio.studioState('match-a');assert.equal(state.youtube.configured,true);assert.equal(state.youtube.connected,false);assert.equal(state.thumbnails.length,1);
    assert.match(state.youtubeDefaults.HIGHLIGHTS.title,/Town Hall 6s 4–2 Ballerz FC/);assert.match(state.youtubeDefaults.HIGHLIGHTS.title,/17 Sep 2026/);
    assert.match(state.youtubeDefaults.HIGHLIGHTS.description,/Goal of the Month: https:\/\/sixfl\.co\.uk\/goal-of-the-month/);
    await db.$executeRaw`INSERT INTO "SixflTvYoutubeConnection" ("id","refreshTokenCiphertext","scope","connectedByActor") VALUES ('primary','synthetic','youtube.upload','admin')`;
    await db.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='READY',"outputSizeBytes"=24,"partCount"=1,"completedAt"=NOW() WHERE "id"=${high.id}`;
    const queued=await youtube.queueYoutubePublish('match-a','HIGHLIGHTS','admin',{});assert.equal(queued.state,'QUEUED');assert.equal(queued.privacyStatus,'public');
    const publishRow=(await db.$queryRaw`SELECT "title","description","privacyStatus" FROM "SixflTvYoutubePublish" WHERE "id"=${queued.id}`)[0];
    assert.equal(publishRow.privacyStatus,'public');
    assert.match(publishRow.title,/Town Hall 6s 4–2 Ballerz FC/);assert.match(publishRow.title,/Match Highlights/);assert.match(publishRow.title,/17 Sep 2026/);
    assert.match(publishRow.description,/League: Northallerton Wednesday · Autumn 2026/);assert.match(publishRow.description,/Match date: Thursday, 17 September 2026/);assert.match(publishRow.description,/https:\/\/sixfl\.co\.uk\/goal-of-the-month/);
    await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='FAILED',"error"='synthetic' WHERE "id"=${queued.id}`;
    const retried=await youtube.queueYoutubePublish('match-a','HIGHLIGHTS','admin',{});assert.equal(retried.id,queued.id);assert.equal(retried.resumed,true);
    const stateToken=youtube.createYoutubeState('match-a');assert.equal(youtube.verifyYoutubeState(stateToken),'match-a');assert.throws(()=>youtube.verifyYoutubeState(stateToken+'x'));
    await t.test('source removal guard is represented in schema',()=>{const sql=fs.readFileSync('prisma/migrations/20260917213000_sixfl_tv_studio/migration.sql','utf8');assert.match(sql,/SixflTvRenderInput/);assert.match(sql,/ON DELETE RESTRICT/);});
  }finally{
    await db.$disconnect();await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await root.$disconnect();for(const[name,value]of Object.entries(old)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  }
});

test('studio source keeps publishing explicit, public and isolated from customer notifications',()=>{
  const ui=fs.readFileSync('src/components/admin/sixfl-tv/StudioControls.tsx','utf8');const worker=fs.readFileSync('scripts/sixfl-tv-worker.ts','utf8');const graphics=fs.readFileSync('src/lib/sixfl-tv/graphics.ts','utf8');const api=fs.readFileSync('src/app/api/admin/sixfl-tv/studio/[fixtureId]/route.ts','utf8');const thumbRoute=fs.readFileSync('src/app/api/admin/sixfl-tv/studio/[fixtureId]/thumbnail/[kind]/route.ts','utf8');const youtube=fs.readFileSync('src/lib/sixfl-tv/youtube.ts','utf8');
  assert.match(ui,/Approve & publish publicly to YouTube/);assert.match(ui,/publish\?\.title \|\| defaults\.title/);assert.match(ui,/publish\?\.description \|\| defaults\.description/);assert.match(ui,/Live preview/);assert.match(ui,/renderRevision/);assert.match(ui,/preview: "1"/);assert.match(ui,/Stop rendering/);assert.match(ui,/cancel-render/);assert.match(thumbRoute,/thumbnailPreviewResponse/);assert.doesNotMatch(ui,/<select\b|MutationObserver|document\.querySelector/);
  assert.match(api,/confirmed !== true/);assert.match(api,/cancel-render/);assert.match(worker,/privacyStatus: "private" \| "unlisted" \| "public"/);assert.match(worker,/privacyStatus: job\.privacyStatus/);assert.match(worker,/assignYoutubeSubscriberNotification/);assert.match(worker,/notificationDay/);assert.match(worker,/notifySubscribers", notifySubscribers \? "true" : "false"/);assert.match(worker,/thumbnails\/set/);assert.match(worker,/buildSixflTvVideoValue/);assert.match(worker,/RENDER_HEARTBEAT_MS = 5000/);
  assert.match(worker,/swipeVideo/);assert.match(worker,/SWIPE_FRAMES = 24/);assert.match(worker,/LINEUP_SECONDS/);assert.doesNotMatch(worker,/PREDICTOR_SECONDS/);assert.doesNotMatch(worker,/RESULT_SECONDS/);assert.match(worker,/GOAL_OF_MONTH_END_SECONDS/);assert.match(worker,/LEAGUE_TABLE_SECONDS/);assert.match(worker,/resultCard=0/);assert.match(worker,/goalOfMonthAfterFootage=1/);assert.match(worker,/createSixflTvScoreBug/);assert.match(worker,/createSixflTvLineupCard/);assert.match(worker,/createSixflTvLeagueTableCard/);assert.doesNotMatch(worker,/createSixflTvPredictorCard/);assert.match(worker,/predictorOnLineup=\$\{metadata\.fixture\.predictor/);assert.match(worker,/showTopHalf/);assert.match(worker,/showBottomHalf/);assert.match(worker,/if \(lineupBytes\) \{[\s\S]{0,90}segments\.push\(swipe\)/,'Static SIXFL TV pages must transition instead of hard-cutting');assert.match(worker,/if \(swipe\) segments\.push\(swipe\);[\s\S]{0,220}Adding Goal of the Month card/,'The final clip must transition directly into Goal of the Month');assert.ok(worker.indexOf('await cardVideo(goalOfMonthPng') < worker.indexOf('Adding relevant top-half league table'),'Goal of the Month must precede relevant league tables');assert.doesNotMatch(worker,/outro\.length && swipe/,'The final branded page must not add an extra swipe into the outro');assert.match(worker,/FT\+match-highlights/);assert.match(worker,/FT\+full-match/);assert.match(worker,/sourcePosterCandidate/);assert.match(worker,/sixflTvThumbnailBackgroundKey/);assert.match(worker,/Choosing thumbnail action frame/);
  assert.match(graphics,/brandingAsset\(siteUrl, "\/Sixfl-tv\.png"\)/);assert.match(graphics,/brandingAsset\(siteUrl, "\/logos\/sixfl-ai-predictor\.png"\)/);assert.match(graphics,/sixflFont\(siteUrl, "\/fonts\/Inter-Regular\.ttf"\)/);assert.match(graphics,/sixflFont\(siteUrl, "\/fonts\/Inter-Bold\.ttf"\)/);assert.doesNotMatch(graphics,/node:fs|readFile\(|process\.cwd\(\)/);assert.doesNotMatch(graphics,/>SIXFL TV<\/text>/);assert.doesNotMatch(graphics,/>SIXFL PREDICTOR/);assert.match(graphics,/RECENT FORM/);assert.match(graphics,/PRE-MATCH PREDICTION/);assert.match(graphics,/backgroundImage\?: Uint8Array \| null/);assert.match(graphics,/MATCHWEEK /);assert.doesNotMatch(graphics,/MATCHWEEK NO\./);assert.match(graphics,/matchweekNumber/);assert.match(graphics,/scorebarX = isHighlights \? 34 : 1280 - 34 - 450/);assert.match(graphics,/fallbackBg/);assert.match(graphics,/bottomShade/);assert.match(graphics,/scoreShadow/);assert.match(graphics,/scorerLinesForTeam/);assert.match(graphics,/font-size="23" font-weight="900" fill="#34d399">•<\/text>/);assert.match(graphics,/broadcastCodeForTeam/);assert.doesNotMatch(graphics,/GOALSCORERS/);assert.match(graphics,/monthUpper/);assert.match(graphics,/Nominate until 5/);assert.match(graphics,/winner announced from 13/);assert.match(graphics,/width="690" height="94"/);assert.match(graphics,/LEAGUE TABLE/);assert.match(graphics,/TOP HALF/);assert.match(graphics,/BOTTOM HALF/);assert.match(graphics,/row\.movement === "UP"/);assert.match(graphics,/y="344"/);assert.match(graphics,/teamNameY = predictor \? 470 : 330/);assert.doesNotMatch(graphics,/typeSubtitle/);assert.match(graphics,/list\(first, 250\)/);assert.match(graphics,/list\(second, 1210\)/);
  for(const text of[worker,api,youtube])assert.doesNotMatch(text,/queueSixflTvFixtureUploadedEmailsOnce|queueNotification|sendEmail\(/);
  assert.match(youtube,/aes-256-gcm/);assert.match(youtube,/youtube\.upload/);assert.match(youtube,/access_type/);assert.match(youtube,/offline/);
  const notificationMigration=fs.readFileSync('prisma/migrations/20260918190000_sixfl_tv_daily_subscriber_notification/migration.sql','utf8');
  assert.match(notificationMigration,/notifySubscribers/);assert.match(notificationMigration,/notificationDay/);assert.match(notificationMigration,/UNIQUE INDEX/);
  assert.match(ui,/first SIXFL TV video published each UK calendar day notifies subscribers/);
  const docker=fs.readFileSync('Dockerfile.sixfl-tv-worker','utf8');assert.match(docker,/ffmpeg/);assert.match(docker,/sixfl-tv-worker\.ts/);
});
