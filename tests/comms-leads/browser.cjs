const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require('playwright');
const out = path.resolve('artifacts/comms-leads');
fs.mkdirSync(out, { recursive: true });
const actionStub = `
import { parseLeadCampaignFilters, buildLeadFilterWhere } from '@/lib/leads/campaign-filters';
window.__commsCalls = [];
const rows = Array.from({length:25}, (_,i) => ({id:'lead-'+i,contactName:'Example captain '+String(i+1).padStart(2,'0'),email:'captain'+i+'@example.invalid',phone:'07700 900123',interestType:'TEAM',status:'CONTACTED',area:'Richmond',leagueId:'catterick-test',leagueLabel:'Catterick Monday Mens · Winter 2026'}));
export async function previewLeadCampaignAction(data) {
 const filters=parseLeadCampaignFilters(data),channel=data.get('channel');
 window.__commsCalls.push({kind:'preview',data:Object.fromEntries(data)});
 await new Promise(r=>setTimeout(r,150));
 const recipients=rows.filter(row=>(!filters.type||row.interestType===filters.type)&&(!filters.status||row.status===filters.status)&&(!filters.excludeType||row.interestType!==filters.excludeType)&&(!filters.excludeStatus||row.status!==filters.excludeStatus)&&(!filters.area||row.area===filters.area)&&(!filters.league||row.leagueId===filters.league));
 return {ok:true,filters,channel,recipients,matchingCount:recipients.length,missingContactCount:0};
}
export async function sendLeadCampaignAction(_,data) {
 window.__commsCalls.push({kind:'send',data:Object.fromEntries(data),ids:data.getAll('includedLeadIds')});
 return {ok:true,sentCount:data.getAll('includedLeadIds').length,failedCount:0};
}`;
const entry = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import Workspace from '@/components/admin/communications/CommunicationsLeadCampaigns';
const templates=[{id:'catterick',key:'catterick-team-interest-october-2026',label:'Catterick — still joining? (5 October)',channel:'EMAIL',interestType:'TEAM',subject:'Catterick starts 5 October — is your team joining us?',body:'Hi {{firstName}},\\n\\nYou registered an interest in joining SIXFL in Catterick as a team. We are putting the league together now, starting Monday 5 October.\\n\\n{{cta}}',ctaLabel:'Choose team or individual player',ctaUrlKey:'teamConfirmationUrl'}, {id:'sms',key:'lead-sms',label:'Player and team interest SMS',channel:'SMS',interestType:null,subject:'',body:'Hi {{firstName}}, please let us know whether you are joining.',ctaLabel:null,ctaUrlKey:null}];
createRoot(document.getElementById('root')).render(<Workspace areas={[{value:'Richmond',label:'Richmond'}]} leagues={[{value:'catterick-test',label:'Catterick Monday Mens · Winter 2026'}]} templates={templates} managedTeams={[]} />);`;
function cssFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(item=>item.isDirectory()?cssFiles(path.join(dir,item.name)):item.name.endsWith('.css')?[path.join(dir,item.name)]:[]);
}
(async()=>{
 await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:true,outfile:path.join(out,'app.js'),platform:'browser',jsx:'automatic',plugins:[{name:'isolated-comms',setup(build){
   build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'stub'}));
   build.onResolve({filter:/lead-campaign-actions$/},()=>({path:'actions',namespace:'stub'}));
   build.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='actions'?actionStub:"import React from 'react'; export default function Link({children,href,...props}){return React.createElement('a',{href,...props},children)}",loader:'tsx',resolveDir:process.cwd()}));
   build.onResolve({filter:/^@\//},args=>({path:path.resolve('src',args.path.slice(2))+ (path.extname(args.path)?'':fs.existsSync(path.resolve('src',args.path.slice(2)+'.tsx'))?'.tsx':'.ts')}));
 }}]});
 const css=cssFiles('.next/static').map(file=>fs.readFileSync(file,'utf8')).join('\n');
 fs.writeFileSync(path.join(out,'app.css'),css);
 const server=http.createServer((req,res)=>{
   if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');return res.end(fs.readFileSync(path.join(out,req.url.slice(1))));}
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="background:#09110e;color:white;font-family:Arial,sans-serif"><main id="root" style="max-width:1400px;margin:auto;padding:20px"></main><script src="/app.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [375,1280]){
   const page=await browser.newPage({viewport:{width,height:960}}); const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   await page.goto(origin);
   const choose=async(label,name)=>{await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('option',{name,exact:true}).click();};
   for(const label of ['Lead type','Status','Area','Preferred night','Prospective league','Exclude lead type','Exclude status']) assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),1);
   await choose('Lead type','Team'); await choose('Status','Contacted'); await choose('Prospective league','Catterick Monday Mens · Winter 2026'); await choose('Exclude status','Closed');
   await page.getByRole('button',{name:'Apply filters',exact:true}).click();
   await page.getByRole('heading',{name:'25 matching leads · 25 selected',exact:true}).waitFor();
   assert.equal(await page.getByRole('checkbox').count(),25);
   assert.equal((await page.evaluate(()=>window.__commsCalls.filter(c=>c.kind==='send'))).length,0);
   await page.getByRole('button',{name:'Clear selection',exact:true}).click();
   await page.getByRole('heading',{name:'25 matching leads · 0 selected',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Send email to 0 selected leads',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Select all matching',exact:true}).click();
   await choose('Template','Catterick — still joining? (5 October)');
   const sendButton=page.getByRole('button',{name:'Send email to 25 selected leads',exact:true});
   assert.equal(await sendButton.isDisabled(),true);
   await page.getByLabel('Bulk send confirmation',{exact:true}).fill('SEND 25 EMAILS');
   assert.equal(await sendButton.isEnabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no horizontal overflow');
   await page.screenshot({path:path.join(out,`comms-leads-${width}.png`),fullPage:true});
   await sendButton.click(); await page.getByRole('status').waitFor();
   let sent=await page.evaluate(()=>window.__commsCalls.filter(c=>c.kind==='send'));
   assert.equal(sent.length,1);assert.equal(sent[0].ids.length,25);assert.equal(sent[0].data.league,'catterick-test');assert.equal(sent[0].data.excludeStatus,'CLOSED');assert.equal(sent[0].data.templateId,'catterick');
   assert.equal(await page.getByRole('checkbox').count(),0,'success clears selection to prevent accidental replay');
   await page.getByRole('button',{name:'Apply filters',exact:true}).click();
   await choose('Lead type','Player');
   await page.waitForTimeout(250);
   assert.equal(await page.getByRole('checkbox').count(),0,'late preview cannot restore stale selection');
   await choose('Lead type','Team'); await page.getByRole('button',{name:'SMS',exact:true}).click();
   await page.getByRole('button',{name:'Apply filters',exact:true}).click();
   await page.getByRole('heading',{name:'25 matching leads · 25 selected',exact:true}).waitFor();
   await choose('Template','Player and team interest SMS');
   await page.getByRole('checkbox').first().uncheck();
   await page.getByLabel('Bulk send confirmation',{exact:true}).fill('SEND 24 TEXTS');
   await page.getByRole('button',{name:'Send SMS to 24 selected leads',exact:true}).click();
   await page.getByRole('status').waitFor();
   sent=await page.evaluate(()=>window.__commsCalls.filter(c=>c.kind==='send'));
   assert.equal(sent.length,2);assert.equal(sent[1].ids.length,24);assert.equal(sent[1].ids.includes('lead-0'),false);
   assert.equal(sent[1].data.channel,'SMS');assert.equal(sent[1].data.bulkSendConfirmation,'SEND 24 TEXTS');
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Comms lead filters, native listboxes, recipient selection, email/SMS handoff, confirmation and stale-preview protection passed at 375/1280px. No production requests.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
