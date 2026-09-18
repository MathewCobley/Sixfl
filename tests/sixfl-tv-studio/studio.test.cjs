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
  id, kickoffAt:new Date('2026-09-17T19:00:00Z'), status:'COMPLETED',
  league:{id:'league-a',name:'Northallerton Wednesday',season:'Autumn 2026'},
  homeTeam:{id:'team-a',name:'Town Hall 6s',logoUrl:null}, awayTeam:{id:'team-b',name:'Ballerz FC',logoUrl:null},
  selections:[
    {selectionStatus:'SELECTED',isCaptain:true,isGoalkeeper:false,createdAt:new Date('2026-09-17T18:00:00Z'),teamMember:{teamId:'team-a',user:{name:'Alex One'}}},
    {selectionStatus:'SELECTED',isCaptain:false,isGoalkeeper:true,createdAt:new Date('2026-09-17T18:01:00Z'),teamMember:{teamId:'team-a',user:{name:'Sam Keeper'}}},
    {selectionStatus:'SELECTED',isCaptain:false,isGoalkeeper:true,createdAt:new Date('2026-09-17T18:02:00Z'),teamMember:{teamId:'team-b',user:{name:'Chris Three'}}},
    {selectionStatus:'NOT_SELECTED',isCaptain:false,isGoalkeeper:false,createdAt:new Date('2026-09-17T18:03:00Z'),teamMember:{teamId:'team-b',user:{name:'Not Playing'}}},
  ],
  result:id==='no-result'?null:{id:'result-1',homeScore:4,awayScore:2,isDisputed:id==='disputed',overturn:null,teamMetadata:[
    {teamId:'team-a',scorers:[{name:'Alex One',goals:2,assists:0},{name:'Sam Two',goals:1,assists:1}],goalsRecorded:3},
    {teamId:'team-b',scorers:[{name:'Chris Three',goals:1,assists:0}],goalsRecorded:1},
  ]},
});

test('fixture graphics generate deterministic YouTube and video-card PNG shapes', async()=>{
  const graphics=loader({})('src/lib/sixfl-tv/graphics.ts');
  const fixture={leagueName:'Northallerton Wednesday · Autumn 2026',kickoffLabel:'Thu, 17 Sep 2026',firstTeam:{name:'Town Hall 6s',logoUrl:null,score:4},secondTeam:{name:'Ballerz FC',logoUrl:null,score:2},scorers:['Town Hall 6s: Alex One x2, Sam Two','Ballerz FC: Chris Three']};
  const thumb=await graphics.createSixflTvThumbnail({fixture,headline:'MATCH HIGHLIGHTS',strapline:'Northallerton Wednesday',showScore:true,siteUrl:'https://sixfl.co.uk'});
  const card=await graphics.createSixflTvVideoCard({fixture,mode:'FULL_TIME',label:'MATCH HIGHLIGHTS',siteUrl:'https://sixfl.co.uk'});
  const goal=await graphics.createSixflTvGoalOfMonthCard({siteUrl:'https://www.sixfl.co.uk'});
  const scoreBug=await graphics.createSixflTvScoreBug({fixture});
  const lineup=await graphics.createSixflTvLineupCard({fixture:{...fixture,firstTeamLineup:['Alex One (C)','Sam Keeper (GK)'],secondTeamLineup:['Chris Three (GK)']}});
  const tm=await sharp(thumb).metadata(), cm=await sharp(card).metadata(), gm=await sharp(goal).metadata(), sm=await sharp(scoreBug).metadata(), lm=await sharp(lineup).metadata();
  assert.equal(tm.format,'png');assert.equal(tm.width,1280);assert.equal(tm.height,720);
  assert.equal(cm.format,'png');assert.equal(cm.width,1920);assert.equal(cm.height,1080);
  assert.equal(gm.format,'png');assert.equal(gm.width,1920);assert.equal(gm.height,1080);
  assert.equal(sm.format,'png');assert.equal(sm.width,1920);assert.equal(sm.height,1080);
  assert.equal(lm.format,'png');assert.equal(lm.width,1920);assert.equal(lm.height,1080);
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
      const sql=strings.join('?');
      if(sql.includes('FROM "FixtureAiPrediction"'))return [{predictedHomeScore:3,predictedAwayScore:2,headline:'Town Hall 6s edged'}];
      return db.$queryRaw(strings,...values);
    },
    $executeRaw:db.$executeRaw.bind(db),$transaction:fn=>db.$transaction(fn),
    fixture:{findUnique:async({where})=>fixtureData(where.id),findMany:async()=>priorFixtures},
  };
  const load=loader({'@/lib/prisma':{prisma:mockDb},'@/lib/storage/railway-s3':{
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
    const jobs=await db.$queryRaw`SELECT "id","kind","metadataJson" FROM "SixflTvRenderJob" WHERE "fixtureId"='match-a' ORDER BY "kind"`;assert.equal(jobs.length,2);
    assert.ok(jobs.every(x=>Number(x.metadataJson.renderVersion)===7),'Renderer version must invalidate old finished previews after editing changes');
    const high=jobs.find(x=>x.kind==='HIGHLIGHTS');const inputs=await db.$queryRaw`SELECT i."assetId",i."role",i."position" FROM "SixflTvRenderInput" i WHERE i."jobId"=${high.id} ORDER BY i."position"`;
    assert.deepEqual(inputs.map(x=>x.assetId),['intro','clip-a','clip-b','outro'],'Ordered clips must take priority over a ready-made highlights file so transitions can be inserted');assert.deepEqual(inputs.map(x=>x.role),['INTRO','CONTENT','CONTENT','OUTRO']);
    const graphic=await studio.studioGraphicFixture('match-a');assert.deepEqual(graphic.scorers,['Town Hall 6s: Alex One x2, Sam Two','Ballerz FC: Chris Three']);
    assert.deepEqual(graphic.firstTeamLineup,['Alex One (C)','Sam Keeper (GK)']);assert.deepEqual(graphic.secondTeamLineup,['Chris Three (GK)']);
    assert.deepEqual(graphic.firstTeamForm,['W','D']);assert.deepEqual(graphic.secondTeamForm,['L']);
    assert.deepEqual(graphic.predictor,{firstTeamScore:3,secondTeamScore:2,headline:'Town Hall 6s edged'});
    const beforePreviewObjects=objects.size;
    const preview=await studio.thumbnailPreviewResponse('match-a','HIGHLIGHTS',{headline:'LIVE PREVIEW',strapline:'Week 4',showScore:'true'});
    assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/png/);assert.equal(objects.size,beforePreviewObjects,'Live preview must not save or replace thumbnail storage');
    const previewMeta=await sharp(Buffer.from(await preview.arrayBuffer())).metadata();assert.equal(previewMeta.width,1280);assert.equal(previewMeta.height,720);
    const saved=await studio.saveThumbnail('match-a','HIGHLIGHTS','admin',{headline:'NORTHALLERTON HIGHLIGHTS',strapline:'Week 4',showScore:true});assert.equal(saved.kind,'HIGHLIGHTS');assert.ok(saved.sizeBytes>1000);
    const thumbResponse=await studio.thumbnailResponse(new Request('https://sixfl.co.uk/test'),'match-a','HIGHLIGHTS');assert.equal(thumbResponse.status,200);assert.match(thumbResponse.headers.get('content-type'),/png/);
    const state=await studio.studioState('match-a');assert.equal(state.youtube.configured,true);assert.equal(state.youtube.connected,false);assert.equal(state.thumbnails.length,1);
    await db.$executeRaw`INSERT INTO "SixflTvYoutubeConnection" ("id","refreshTokenCiphertext","scope","connectedByActor") VALUES ('primary','synthetic','youtube.upload','admin')`;
    await db.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='READY',"outputSizeBytes"=24,"partCount"=1,"completedAt"=NOW() WHERE "id"=${high.id}`;
    const queued=await youtube.queueYoutubePublish('match-a','HIGHLIGHTS','admin',{});assert.equal(queued.state,'QUEUED');assert.equal(queued.privacyStatus,'private');
    await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='FAILED',"error"='synthetic' WHERE "id"=${queued.id}`;
    const retried=await youtube.queueYoutubePublish('match-a','HIGHLIGHTS','admin',{});assert.equal(retried.id,queued.id);assert.equal(retried.resumed,true);
    const stateToken=youtube.createYoutubeState('match-a');assert.equal(youtube.verifyYoutubeState(stateToken),'match-a');assert.throws(()=>youtube.verifyYoutubeState(stateToken+'x'));
    await t.test('source removal guard is represented in schema',()=>{const sql=fs.readFileSync('prisma/migrations/20260917213000_sixfl_tv_studio/migration.sql','utf8');assert.match(sql,/SixflTvRenderInput/);assert.match(sql,/ON DELETE RESTRICT/);});
  }finally{
    await db.$disconnect();await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await root.$disconnect();for(const[name,value]of Object.entries(old)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  }
});

test('studio source keeps publishing explicit, private and isolated from customer notifications',()=>{
  const ui=fs.readFileSync('src/components/admin/sixfl-tv/StudioControls.tsx','utf8');const worker=fs.readFileSync('scripts/sixfl-tv-worker.ts','utf8');const api=fs.readFileSync('src/app/api/admin/sixfl-tv/studio/[fixtureId]/route.ts','utf8');const thumbRoute=fs.readFileSync('src/app/api/admin/sixfl-tv/studio/[fixtureId]/thumbnail/[kind]/route.ts','utf8');const youtube=fs.readFileSync('src/lib/sixfl-tv/youtube.ts','utf8');
  assert.match(ui,/Approve & upload privately to YouTube/);assert.match(ui,/Live preview/);assert.match(ui,/preview: "1"/);assert.match(thumbRoute,/thumbnailPreviewResponse/);assert.doesNotMatch(ui,/<select\b|MutationObserver|document\.querySelector/);
  assert.match(api,/confirmed !== true/);assert.match(worker,/privacyStatus: "private"/);assert.match(worker,/notifySubscribers/);assert.match(worker,/thumbnails\/set/);assert.match(worker,/buildSixflTvVideoValue/);
  assert.match(worker,/swipeVideo/);assert.match(worker,/LINEUP_SECONDS/);assert.match(worker,/RESULT_SECONDS/);assert.match(worker,/GOAL_OF_MONTH_END_SECONDS/);assert.match(worker,/goalOfMonthEndCard=1/);assert.match(worker,/createSixflTvScoreBug/);assert.match(worker,/createSixflTvLineupCard/);assert.match(worker,/footageOverlay=\$\{job\.kind/);
  for(const text of[worker,api,youtube])assert.doesNotMatch(text,/queueSixflTvFixtureUploadedEmailsOnce|queueNotification|sendEmail\(/);
  assert.match(youtube,/aes-256-gcm/);assert.match(youtube,/youtube\.upload/);assert.match(youtube,/access_type/);assert.match(youtube,/offline/);
  const docker=fs.readFileSync('Dockerfile.sixfl-tv-worker','utf8');assert.match(docker,/ffmpeg/);assert.match(docker,/sixfl-tv-worker\.ts/);
});
