import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const rows = [
  {id:'a',name:'Alpha FC',logoUrl:'/test.png',leagueKey:'north',leagueName:'Northallerton',season:'Summer',isCurrent:true},
  {id:'b',name:'Beta FC',logoUrl:'/test.png',leagueKey:'north',leagueName:'Northallerton',season:'Summer',isCurrent:true},
  {id:'c',name:'Gamma FC',logoUrl:'/test.png',leagueKey:'harrogate',leagueName:'Harrogate',season:'Summer',isCurrent:true},
  {id:'d',name:'Missing Badge',logoUrl:null,leagueKey:'north',leagueName:'Northallerton',season:'Summer',isCurrent:true},
  {id:'e',name:'Older Team',logoUrl:'/test.png',leagueKey:'north',leagueName:'Northallerton',season:'Spring',isCurrent:false},
];
const bundled = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import Selector from './src/components/admin/teams/TeamLogoExportSelector';
createRoot(document.getElementById('root')!).render(<Selector teams={${JSON.stringify(rows)}}/>);`},bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false});
const server=createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundled.outputFiles[0].text);}
  else if(req.url==='/test.png'){res.setHeader('content-type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=','base64'));}
  else {res.setHeader('content-type','text/html');res.end('<div id="root"></div><script src="/bundle.js"></script>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
async function pageFor(){const p=await browser.newPage({acceptDownloads:true});await p.route('https://**/*',r=>r.abort());await p.goto(url);return p;}
try {
  const page=await pageFor();
  const button=page.getByRole('button',{name:/Download selected logos/});
  assert.equal(await button.isDisabled(),true);
  assert.equal(await page.getByRole('checkbox',{name:'Select Missing Badge (Summer)',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('checkbox',{name:'Select Older Team (Spring)',exact:true}).count(),0);
  await page.getByRole('checkbox',{name:'Select Alpha FC (Summer)',exact:true}).check();
  await page.getByLabel('League',{exact:true}).selectOption('harrogate');
  await page.getByRole('button',{name:'Select all shown',exact:true}).click();
  assert.match(await page.locator('[aria-live="polite"]').textContent(),/2 selected.*1 selected outside/);
  let requests=[];
  await page.route('**/api/admin/teams/logo-export',route=>{requests.push(route.request().postDataJSON());return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Test export error; selection kept.'})});});
  await button.click();await page.getByRole('alert').waitFor();assert.equal(await button.isEnabled(),true);
  assert.match(await button.textContent(),/\(2\)/);
  await page.unroute('**/api/admin/teams/logo-export');
  await page.route('**/api/admin/teams/logo-export',async route=>{
    requests.push(route.request().postDataJSON());
    await new Promise(resolve=>setTimeout(resolve,100));
    return route.fulfill({status:200,contentType:'application/zip',headers:{'content-disposition':'attachment; filename="SIXFL-Team-Logos.zip"','x-sixfl-logos-exported':'1','x-sixfl-logos-missing':'1'},body:Buffer.from('PK test archive')});
  });
  const downloadPromise=page.waitForEvent('download');
  await button.evaluate(b=>{b.click();b.click();});
  const download=await downloadPromise;assert.equal(download.suggestedFilename(),'SIXFL-Team-Logos.zip');
  assert.equal(requests.length,2);assert.deepEqual(requests[1].teamIds.sort(),['a','c']);
  assert.match(await page.getByRole('status').textContent(),/1 selected logos could not be included/);
  await page.getByLabel('League',{exact:true}).selectOption('');
  await page.getByRole('checkbox',{name:'Current teams only',exact:true}).uncheck();
  assert.equal(await page.getByRole('checkbox',{name:'Select Older Team (Spring)',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();assert.match(await button.textContent(),/\(0\)/);
  await page.close();
  const stalled=await pageFor();await stalled.clock.install();
  await stalled.getByRole('checkbox',{name:'Select Alpha FC (Summer)',exact:true}).check();
  await stalled.route('**/api/admin/teams/logo-export',()=>{});
  await stalled.getByRole('button',{name:/Download selected logos/}).click();
  await stalled.clock.fastForward(81_000);await stalled.getByRole('alert').waitFor();
  assert.match(await stalled.getByRole('alert').textContent(),/took too long/);
  assert.equal(await stalled.getByRole('button',{name:/Download selected logos/}).isEnabled(),true);
  assert.equal(await stalled.getByRole('checkbox',{name:'Select Alpha FC (Summer)',exact:true}).isChecked(),true);
  await stalled.close();
  console.log('Logo export browser checks passed: exact selection, league/current filters, cross-filter retention, missing badges, clear selection, single request, ZIP download, partial report, failure and timeout recovery.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
