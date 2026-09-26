const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium, webkit } = require('playwright');
const out = path.resolve('artifacts/phone-app-chrome');
fs.mkdirSync(out, { recursive: true });
const layout = fs.readFileSync('src/app/captain/team/[teamid]/layout.tsx', 'utf8');
const captainStyles = layout.match(/const captainMobileStyles = String.raw`([\s\S]*?)`;/)?.[1];
assert.ok(captainStyles, 'exercise the actual layout spacing rules');
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import CaptainHeader from './src/components/captain/CaptainAppHeader';
import CaptainNav from './src/components/captain/CaptainPwaBottomNav';
import CaptainMode from './src/components/captain/CaptainPwaModeOnly';
import PlayerHeader from './src/components/player/PlayerPwaPortalHeader';
import PlayerNav from './src/components/player/PlayerTeamNav';
import RefHome from './src/components/referee/RefereeAppHome';
import RefShell from './src/components/referee/RefereeAppShell';
import RefMode from './src/components/referee/RefereePortalViewMode';
const params=new URLSearchParams(location.search), role=params.get('role')||'captain';
const content=<><p data-first-content>First content — must not be covered by the header.</p>{Array.from({length:60},(_,i)=><p key={i} style={{padding:'12px'}}>Scrolling item {i+1}</p>)}<button data-last-action>Last action</button></>;
const chrome= role==='captain' ? <div className="captain-team-shell">
<style>{${JSON.stringify(captainStyles)}}</style><CaptainMode mode="app"><CaptainHeader teamId="phone-test" teamName="Test Rovers" teamLogoUrl={null}/></CaptainMode>
<div className="captain-team-container"><main className="captain-team-main">{content}</main></div><CaptainMode mode="app"><CaptainNav teamId="phone-test" squadHref="/captain/team/phone-test/squad"/></CaptainMode></div>
:role==='player'?<div className="player-team-layout"><PlayerHeader teamId="phone-test" teamName="Test Rovers" teamLogoUrl={null} playerName="Alex Example"/><PlayerNav teamId="phone-test"/>{content}</div>
:role==='referee-home'?<RefMode mode="app"><RefHome name="Taylor Example" nextNight={null} openCount={0} submittedCount={0} dueToYou="£0.00" dueToSixfl="£0.00" confirmation={null} desktopTabs={null} preview={null}>{content}</RefHome></RefMode>:null;
async function start(){const tree=role==='referee-page'?await RefShell({active:'nights',title:'Nights',children:content}):chrome;
const root=createRoot(document.getElementById('root'));
root.render(<div data-page-owner style={params.has('stress')?{transform:'translateZ(0)',overflow:'hidden',position:'relative'}:{}}>{tree}</div>);
window.unmountApp=()=>root.unmount();}
start();`;

(async()=>{
 const built=await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'phone-chrome.tsx',loader:'tsx'},bundle:true,write:false,outdir:out,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-io',setup(build){
  build.onResolve({filter:/^(next\/(link|image|navigation)|@\/lib\/(admin|prisma))$/},args=>({path:args.path,namespace:'test'}));
  build.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='next/navigation'?`export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);`
   :args.path==='@/lib/admin'?`export async function requireReferee(){return {user:{name:'Taylor Example'},authenticatedUser:{id:'synthetic'},isAdminPreview:true}}`
   :args.path==='@/lib/prisma'?`export const prisma=new Proxy({},{get(){throw Error('Database forbidden in browser test')}});`
   :`import React from 'react';export default function Component({href,src,children,priority,...props}){return React.createElement(${args.path==='next/link'?"'a'":"'img'"},{...props,href,src},children);}`,loader:'js',resolveDir:process.cwd()}));
 }}]});
 const js=built.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const moduleCss=built.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
 const cssFiles=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(f.endsWith('.css'))cssFiles.push(f);}}
 walk('.next/static');assert.ok(cssFiles.length);
 const css=cssFiles.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\n'+moduleCss;
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js);}
  if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end('{"unreadCount":0}');}
  if(url.pathname==='/logo2.png'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="48"><text x="2" y="35" font-family="Arial" font-size="32" fill="white">SIXFL</text></svg>');}
  res.setHeader('Content-Type','text/html');
  if(url.pathname==='/admin/pwa')return res.end('<!doctype html><html><body><iframe width="390" height="844" src="/player/team/phone-test?role=player&stress=1"></iframe></body></html>');
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body style="background:#07130f;color:white;margin:0"><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const checks=[];
 try{for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{for(const role of ['captain','player','referee-home','referee-page']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await context.addInitScript(({ios})=>{
    if(ios)Object.defineProperty(navigator,'standalone',{get:()=>true,configurable:true});
    else{const original=window.matchMedia.bind(window);window.matchMedia=query=>{const result=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});return result;};}
   },{ios:engine===webkit});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const pathname=role==='captain'?'/captain/team/phone-test':role==='player'?'/player/team/phone-test':role==='referee-home'?'/referee':'/referee/nights';
   await page.goto(origin+pathname+'?role='+role+'&stress=1');
   await page.locator('[data-app-chrome-edge="top"] > header').waitFor({state:'visible'});
   await page.locator('[data-app-chrome-edge="bottom"] > nav').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('[data-app-header-space]')?.getBoundingClientRect().height>30);
   const bounds=()=>page.evaluate(()=>{
    const top=document.querySelector('[data-app-chrome-edge="top"]'),bottom=document.querySelector('[data-app-chrome-edge="bottom"]');
    const t=top.getBoundingClientRect(),b=bottom.getBoundingClientRect(),v=window.visualViewport;
    return {top:t.top,topBottom:t.bottom,bottom:b.bottom,bottomTop:b.top,visibleTop:v?.offsetTop||0,visibleBottom:(v?.offsetTop||0)+(v?.height||innerHeight),space:document.querySelector('[data-app-header-space]').getBoundingClientRect().height,first:document.querySelector('[data-first-content]').getBoundingClientRect().top,scroll:scrollY,topParent:top.parentElement.tagName,bottomParent:bottom.parentElement.tagName};
   });
   const initial=await bounds();assert.equal(initial.topParent,'BODY');assert.equal(initial.bottomParent,'BODY');assert.ok(initial.first>=initial.topBottom-1,role+' content covered');
   for(const size of [{width:390,height:844},{width:844,height:390},{width:390,height:530}]){
    await page.setViewportSize(size);await page.evaluate(()=>window.scrollTo(0,900));await page.waitForTimeout(150);
    const after=await bounds();assert.ok(after.scroll>200,role+' real document scroll');assert.ok(Math.abs(after.top-after.visibleTop)<2,role+' header left viewport');assert.ok(Math.abs(after.bottom-after.visibleBottom)<2,role+' footer left viewport');assert.ok(Math.abs(after.space-(after.topBottom-after.top))<2,role+' spacer stale');
   }
   await page.setViewportSize({width:390,height:844});
   // Simulate larger safe-area/font wrapping height without a hard-coded spacer.
   await page.locator('[data-app-chrome-edge="top"] > header').evaluate(el=>{el.style.paddingTop='52px';el.style.paddingBottom='20px';});
   await page.waitForTimeout(100);const resized=await bounds();assert.ok(resized.space>90,role+' header height not observed');
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);
   const last=await page.locator('[data-last-action]').boundingBox(),now=await bounds();assert.ok(last.y+last.height<=now.bottomTop+2,role+' bottom action obscured');
   await page.screenshot({path:path.join(out,`${engine.name()}-${role}-scrolled.png`)});
   const links=await page.locator('[data-app-chrome-edge="bottom"] a').evaluateAll(els=>els.map(a=>a.getAttribute('href')));
   assert.equal(links.length,role==='captain'?6:5);assert.ok(links.every(href=>href.startsWith(role.startsWith('referee')?'/referee':`/${role}/team/phone-test`)));
   await page.evaluate(()=>window.unmountApp());assert.equal(await page.locator('[data-app-chrome-edge]').count(),0,'portal cleaned after route unmount');assert.deepEqual(errors,[]);
   checks.push(`${engine.name()}: ${role} pinned across document scroll, portrait/landscape/short viewport, measured header, reachable final action and cleanup`);
   await context.close();
  }
  // Browser/web mode must not acquire invisible blocking bars or new app menus.
  const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();
  await page.goto(origin+'/player/team/phone-test?role=player');await page.getByRole('navigation',{name:'Player team sections'}).waitFor();await page.waitForTimeout(100);
  assert.equal(await page.getByRole('navigation',{name:'Player app navigation'}).isVisible(),false);assert.equal(await page.locator('[data-app-header-space]').evaluate(el=>el.getBoundingClientRect().height),0);
  await page.goto(origin+'/admin/pwa');const frame=page.frames().find(f=>f.url().includes('/player/team/'));assert.ok(frame);
  await frame.locator('[data-app-chrome-edge="top"] > header').waitFor({state:'visible'});await frame.evaluate(()=>window.scrollTo(0,700));await page.waitForTimeout(100);
  assert.ok(Math.abs(await frame.locator('[data-app-chrome-edge="top"]').evaluate(el=>el.getBoundingClientRect().top))<2,'PC iframe top remains pinned');
  checks.push(`${engine.name()}: ordinary web chrome unchanged and PC iframe retained`);await context.close();
  }finally{await browser.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
 fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify(checks,null,2));console.log(checks.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1;});
