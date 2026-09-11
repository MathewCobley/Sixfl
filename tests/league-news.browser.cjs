const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {build}=require('esbuild'),{chromium}=require(process.env.NEWS_PLAYWRIGHT_MODULE||'playwright');
let browser,server,origin;
before(async()=>{
 const news=JSON.parse(fs.readFileSync('.tmp/league-news/sample.json','utf8'));
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Article from './src/components/news/NewsArticle';import Controls from './src/components/admin/matchweek-reports/NewsPublishingControls';import LatestNews from './src/components/news/LatestNews';
 const root=createRoot(document.getElementById('root'));window.sample=${JSON.stringify(news)};window.posts=[];window.live=null;window.discoveryCalls=[];window.routeParams={};window.routePath='/';
 window.publication={status:'DRAFT',revision:0,sourceVersion:null,publishedAt:null,settings:{coverUrl:'',coverAlt:'',coverCaption:''},url:'/leagues/example/news/2026-09-08'};
 window.fetch=async(url,opts={})=>{if(url.startsWith('/api/public/league-news/')){window.discoveryCalls.push(url);return new Response(JSON.stringify({items:window.live?[window.live]:[]}));}if(opts.method==='POST'){const body=JSON.parse(opts.body);window.posts.push(body);if(window.holdPost)await new Promise(r=>window.release=r);if(body.revision!==window.publication.revision)return new Response(JSON.stringify({error:'Stale publication'}),{status:409});window.publication.revision++;if(body.action==='publish'){window.publication.status='PUBLISHED';window.publication.sourceVersion=body.draftVersion;window.live=structuredClone(window.sample);window.live.article.cover=window.publication.settings.coverUrl?window.publication.settings:null;}else if(body.action==='unpublish'){window.publication.status='UNPUBLISHED';window.live=null;}else window.publication.settings=body.settings;}return new Response(JSON.stringify({ok:true,publication:window.publication}));};
 let key=0;window.showControls=(extra={})=>root.render(<Controls key={++key} slug='example' date='2026-09-08' draftVersion={2} sourceHash='hash' blocked={false} stale={false} {...extra}/>);
 window.showDiscovery=(scope,suffix='')=>{window.routeParams={slug:'example',id:'stand-in',teamid:'stand-in'};window.routePath=(scope==='league'?'/leagues/example':scope==='team'?'/teams/stand-in':'/'+scope+'/team/stand-in')+suffix;root.render(<LatestNews key={++key} scope={scope}/>);};
 window.showArticle=()=>root.render(<Article news={window.sample} shareUrl='https://www.sixfl.co.uk/leagues/example/news/2026-09-08' highlightTeamId='stand-in'/>);window.showControls();`;
 const bundle=(await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'links',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'router'}));b.onLoad({filter:/.*/,namespace:'router'},()=>({contents:'export const useParams=()=>window.routeParams;export const usePathname=()=>window.routePath;'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'import React from "react";export default function Link({children,...p}){return React.createElement("a",p,children)}'}));}}]})).outputFiles[0].text;
 const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]);
 const css=files('.next/static').filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(p,'utf8')).join('\n');assert.ok(css.length);
 server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(bundle);}else if(req.url==='/app.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="background:black;color:white"><main id="root" style="max-width:1152px;margin:auto;padding:12px"></main><script src="/app.js"></script></body></html>');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch();
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
for(const width of [1440,390])test(`publication controls and shared article at ${width}px`,async()=>{
 const context=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 try{
  await page.goto(origin);await page.getByText('Not published',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.posts.length),0);
  const preview=page.getByRole('link',{name:/Preview website version/});assert.match(await preview.getAttribute('href'),/version=2&revision=0/);assert.equal(await preview.getAttribute('target'),'_blank');
  await page.evaluate(()=>window.holdPost=true);await page.getByRole('button',{name:'Publish to League News',exact:true}).click();await page.getByRole('button',{name:'Working…',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Working…',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>window.posts.length),1);
  await page.evaluate(()=>{window.holdPost=false;window.release()});await page.getByText('Live · draft version 2',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.live.article.title),'Stand-ins sign off a six-match night in style');
  await page.getByText('Optional feature photograph',{exact:true}).click();await page.getByLabel('Photo URL',{exact:true}).fill('https://images.example.com/photo.jpg');await page.getByLabel('Image description (required with a photo)',{exact:true}).fill('An example match photograph');
  assert.equal(await page.getByRole('button',{name:'Update published article',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Save photo settings',exact:true}).click();await page.getByText(/Photo settings saved privately/).waitFor();assert.equal(await page.evaluate(()=>window.live.article.cover),null);
  await page.getByRole('button',{name:'Update published article',exact:true}).click();await page.getByText(/Published to League News. The approved article/).waitFor();assert.equal(await page.evaluate(()=>window.live.article.cover.coverAlt),'An example match photograph');
  await page.getByRole('button',{name:'Unpublish',exact:true}).click();await page.getByText('Unpublished · draft retained',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.live),null);
  await page.evaluate(()=>window.showControls({stale:true}));await page.getByText(/The draft is out of date/).waitFor();assert.equal(await page.getByRole('button',{name:'Publish to League News',exact:true}).isDisabled(),true);
  const posts=await page.evaluate(()=>window.posts);assert.deepEqual(posts.map(p=>p.action),['publish','news-settings','publish','unpublish']);assert.ok(posts.every(p=>p.requestId&&p.draftVersion===2));
  await page.evaluate(()=>window.showArticle());await page.getByRole('heading',{level:1}).waitFor();assert.equal(await page.getByRole('navigation',{name:'Jump to match'}).getByRole('link').count(),6);assert.equal(await page.getByText('Featuring your team',{exact:true}).count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Copy link',exact:true}).click();await page.getByText('Article link copied.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://www.sixfl.co.uk/leagues/example/news/2026-09-08');
  await page.screenshot({path:`.tmp/league-news/article-${width}.png`,fullPage:true});
  // Root discovery slots on each route render only published articles. Nested
  // fixture/payment pages are not discovered with DOM selectors or decorated.
  for(const scope of ['league','team','captain','player']){
   await page.evaluate(s=>{window.live=null;window.showDiscovery(s);},scope);
   const teaser=page.getByRole('region',{name:'Latest League News'});await teaser.getByText(/once published by SIXFL/).waitFor();assert.equal(await teaser.getByRole('article').count(),0);
   assert.equal(await teaser.getByRole('link',{name:'All news →',exact:true}).getAttribute('href'),scope==='league'?'/leagues/example/news':'/teams/stand-in/news');
   await page.evaluate(s=>{window.live=structuredClone(window.sample);window.showDiscovery(s);},scope);
   await teaser.getByRole('heading',{name:'Stand-ins sign off a six-match night in style'}).waitFor();
   assert.equal(await teaser.getByRole('link',{name:/Example [56] FC.*Example Stand-ins/}).count(),scope==='league'?0:2);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const requests=await page.evaluate(()=>window.discoveryCalls.length);
   await page.evaluate(s=>window.showDiscovery(s,'/payments'),scope);await teaser.waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>window.discoveryCalls.length),requests,'nested pages must not query a teaser');
  }
  assert.equal(await page.evaluate(()=>window.posts.length),4);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
