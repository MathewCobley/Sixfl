import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const bundled = await build({ stdin: { resolveDir: process.cwd(), loader:'tsx', contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import EmailTemplateForm from './src/components/admin/email-templates/EmailTemplateForm';
  import SmsTemplateForm from './src/components/admin/sms-templates/SmsTemplateForm';
  const params=new URLSearchParams(location.search);
  const props={mode:params.get('mode')||'create',templateType:params.get('type')||'campaign',initialValues:{id:params.get('mode')==='edit'?'saved-1':undefined,key:'northallerton-autumn',name:'Northallerton autumn',subject:'Autumn season',body:'Keep this exact draft.',audience:'TEAM',isActive:true}};
  createRoot(document.getElementById('root')!).render(params.get('channel')==='SMS'?<SmsTemplateForm {...props}/>:<EmailTemplateForm {...props}/>);
` }, bundle:true, platform:'browser', format:'iife', jsx:'automatic', write:false });
const server=createServer((req,res)=>{
  if(req.url.startsWith('/bundle.js')){res.setHeader('content-type','text/javascript');res.end(bundled.outputFiles[0].text);}
  else if(req.url.startsWith('/admin/templates/saved-1')) res.end('<h1>Saved template opened</h1>');
  else {res.setHeader('content-type','text/html');res.end('<div id="root"></div><script src="/bundle.js"></script>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
let count=0;
async function pageFor(query='') {
  const page=await browser.newPage();
  // Preview assets never contact production in this test.
  await page.route('https://**/*',route=>route.abort());
  await page.goto(url+'/?'+query);
  await page.locator('button[type="submit"]').waitFor();
  return page;
}
const reply=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
try {
  for(const channel of ['EMAIL','SMS']) for(const type of ['campaign','system']) {
    const page=await pageFor(`channel=${channel}&type=${type}`); let calls=0;
    await page.route('**/api/admin/templates/save',async route=>{calls++;await new Promise(r=>setTimeout(r,250));await reply(route,{ok:true,message:'Template saved successfully.',redirectTo:'/admin/templates/saved-1?created=1'});});
    await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    await page.waitForURL('**/admin/templates/saved-1?created=1'); assert.equal(calls,1); await page.close(); count++;
  }
  const edit=await pageFor('mode=edit');
  await edit.route('**/api/admin/templates/save',route=>reply(route,{ok:true,message:'Changes saved successfully.'}));
  await edit.locator('button[type="submit"]').click(); await edit.getByRole('status').waitFor();
  assert.equal(await edit.locator('button[type="submit"]').isEnabled(),true); assert.equal(await edit.locator('textarea[name="body"]').inputValue(),'Keep this exact draft.'); await edit.close(); count++;
  const invalid=await pageFor();
  await invalid.route('**/api/admin/templates/save',route=>reply(route,{ok:false,error:'Please fix the highlighted fields.',errors:{key:['Duplicate key.']}},422));
  await invalid.locator('button[type="submit"]').click();await invalid.getByRole('alert').waitFor();
  assert.equal(await invalid.locator('button[type="submit"]').isEnabled(),true);assert.equal(await invalid.locator('textarea[name="body"]').inputValue(),'Keep this exact draft.'); await invalid.close();count++;
  for(const failure of ['hang','network','html','auth']) {
    const page=await pageFor(); await page.clock.install(); let saves=0,checks=0;
    await page.route('**/api/admin/templates/save',async route=>{
      const body=route.request().postData()||'';
      if(/name="operation"\r\n\r\ncheck/.test(body)){checks++;await reply(route,{ok:true,message:'Template saved successfully.',redirectTo:'/admin/templates/saved-1?created=1'});return;}
      saves++;
      if(failure==='network')return route.abort();
      if(failure==='html')return route.fulfill({status:502,contentType:'text/html',body:'Gateway failure'});
      if(failure==='auth')return reply(route,{ok:false,needsCheck:true,signInRequired:true,error:'Your sign-in has expired. Your text is still here.'},401);
      // Deliberately never finish the response; the client's timer must release pending.
    });
    await page.locator('button[type="submit"]').click();
    if(failure==='hang')await page.clock.fastForward(21_000);
    await page.getByRole('button',{name:'Check save status',exact:true}).waitFor();
    assert.equal(await page.locator('textarea[name="body"]').inputValue(),'Keep this exact draft.');
    assert.equal(await page.locator('button[type="submit"]').getAttribute('aria-busy'),'false');
    await page.getByRole('button',{name:'Check save status',exact:true}).click();
    await page.waitForURL('**/admin/templates/saved-1?created=1');assert.equal(saves,1);assert.equal(checks,1);await page.close();count++;
  }
  console.log(`Template-save browser tests passed: ${count} cases using the real editors and shared save controls.`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
