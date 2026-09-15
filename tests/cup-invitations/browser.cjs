const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {build}=require('esbuild');const {chromium}=require(process.env.CUP_PLAYWRIGHT||'playwright');
(async()=>{
 const source=`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import CupTabs from './src/components/cups/CupTabs';
 import Setup from './src/components/cups/CupSetupForm';
 import Composer from './src/components/cups/CupInvitationComposer';
 import ResponseForm from './src/components/cups/CupResponseForm';
 import Entry from './src/components/cups/CupEntryForm';
 window.calls=[];
 const teams=[{id:'one',teamName:'Example County Football Club with a longer name',league:'Example Tuesday League',response:'NOT_INVITED',entered:false,eligible:true},{id:'two',teamName:'Other team',league:'Example Wednesday League',response:'PENDING',entered:false,eligible:true},{id:'three',teamName:'Already said no',league:'Example league',response:'NO',entered:false,eligible:true}];
 const templates=[{id:'cup-template',name:'County Cup invitation',key:'CUP_INVITATION'}];
 async function preview(_,form){window.calls.push('preview');const ids=JSON.parse(form.get('teamIds'));return {kind:form.get('kind'),teamIds:ids,templateId:form.get('templateId'),preview:{previewKey:'sample',templateFingerprint:'sample',version:1,templateId:form.get('templateId'),templateName:'County Cup invitation',teams:teams.filter(t=>ids.includes(t.id)).map(t=>({teamId:t.id,teamName:t.teamName,error:null,contacts:[],previews:[{email:'a-long-captain-address@example.invalid',subject:'Cup invitation',bodyText:'£40 per match',bodyHtml:'<p>£40 per match. Rawdon and Catterick — proposed. A different night may apply.</p>'}]}))}}}
 async function send(_,form){if(form.get('confirmed')!=='on')throw Error('Unconfirmed send');window.calls.push('send');return {success:'Invitation queued — not confirmation of delivery.'};}
 async function response(_,form){if(form.get('confirmed')!=='on')throw Error('Unconfirmed response');window.calls.push('respond:'+form.get('response'));return window.failResponse?{error:'Please try again; no response saved.'}:{success:'Your team response has been saved.'};}
 async function noop(){return {success:'Saved in isolated test'};}
 createRoot(document.getElementById('root')).render(<div className="flex w-full gap-5 px-3 py-4 sm:px-6 lg:px-8"><aside className="hidden w-[34rem] shrink-0 xl:block 2xl:w-[38rem]">Admin sidebar space</aside><main className="w-full min-w-0 flex-1 space-y-6 text-white"><h1 className="text-3xl">SIXFL County Cup</h1><CupTabs cupId="example"/><div id="composer"><Composer cupId="example" teams={teams} templates={templates} previewAction={preview} sendAction={send}/></div><section id="response" className="rounded-2xl border border-white/15 p-5"><h2 className="text-xl">Team response confirmation</h2><ResponseForm fields={{token:'isolated'}} action={response} response="PENDING" initialAnswer="YES" version={0}/></section><section id="setup"><Setup cupId="example" values={{version:1,fee:'40',venueNote:'Rawdon and Catterick — proposed locations, subject to confirmation.',scheduleNote:'Cup games may be on a different night. Dates to be confirmed.',deadlineDate:'2026-10-10',deadlineTime:'18:00',state:'OPEN'}} action={noop}/></section><section id="entrants" className="p-5"><Entry cupId="example" options={[{value:'one',label:'Example team'}]} action={noop}/></section></main></div>);
 `;
 const js=(await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-context',setup(api){api.onResolve({filter:/^next\/(navigation|link)$/},a=>({path:a.path,namespace:'mock'}));api.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.endsWith('link')?'import React from "react";export default p=>React.createElement("a",p,p.children)':'export const usePathname=()=>"/admin/cups/example/invitations";',loader:'js',resolveDir:process.cwd()}));}}]})).outputFiles[0].text;
 const css=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(file.endsWith('.css'))css.push(fs.readFileSync(file,'utf8'));}}walk('.next/static');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?js:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.join('\n')}body{margin:0;background:#07130f}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;fs.mkdirSync('artifacts/cup-invitations',{recursive:true});
 try{browser=await chromium.launch({headless:true});for(const width of [390,1280,1920]){const page=await browser.newPage({viewport:{width,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));try{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(`http://127.0.0.1:${server.address().port}`);
  const composer=page.locator('#composer'),response=page.locator('#response');await page.getByRole('heading',{name:'SIXFL County Cup',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls),[],'opening email and preselection must not submit');
  assert.equal(await page.getByRole('link',{name:'Invitations & responses'}).getAttribute('aria-current'),'page');
  assert.equal(await composer.getByText('Already said no',{exact:true}).count(),0);
  await composer.getByRole('button',{name:'Select / clear shown teams'}).click();await composer.getByRole('button',{name:'Preview selected emails'}).click();await composer.getByRole('heading',{name:'Review invitations for 2 teams'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls),['preview']);
  await composer.getByLabel('I have reviewed these teams, recipients and cup details and want to send the emails.').check();await composer.getByRole('button',{name:'Send reviewed emails'}).click();await composer.getByRole('status').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls),['preview','send']);
  await response.getByRole('button',{name:'Confirm team response'}).click();assert.deepEqual(await page.evaluate(()=>window.calls),['preview','send'],'required confirmation prevents submission');
  await response.getByLabel('I am responding on behalf of this team.',{exact:false}).check();await page.evaluate(()=>window.failResponse=true);await response.getByRole('button',{name:'Confirm team response'}).click();await response.getByRole('alert').waitFor();
  await page.evaluate(()=>window.failResponse=false);await response.getByLabel('Yes — our team is interested',{exact:true}).check();await response.getByLabel('I am responding on behalf of this team.',{exact:false}).check();await response.getByRole('button',{name:'Confirm team response'}).click();await response.getByRole('status').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');assert.deepEqual(errors,[]);
  for(const id of ['composer','response','setup'])await page.locator('#'+id).screenshot({path:`artifacts/cup-invitations/${id}-${width}.png`});console.log('PASS actual cup forms',width,'preview, send confirmation, response failure/retry, tabs and no overflow');
 }finally{await page.close();}}}finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});