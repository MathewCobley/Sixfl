import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium, webkit } from 'playwright';
const out='/tmp/sixfl-footage-browser', artifacts='artifacts/sixfl-tv-footage';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(artifacts,{recursive:true});
await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Uploader from './src/components/admin/sixfl-tv/FootageUploader';import Provider from './src/components/admin/sixfl-tv/FootageUploadProvider';function Pages(){const[page,setPage]=useState('match-a');return <><nav><button onClick={()=>setPage('other')}>Other admin page</button><button onClick={()=>setPage('match-a')}>Match A</button><button onClick={()=>setPage('match-b')}>Match B</button></nav>{page==='other'?<h1>Other admin workspace</h1>:<Uploader key={page} fixtureId={page} fixtureLabel={page==='match-a'?'A v B':'C v D'} initial={window.__INITIAL__}/>}</>;}createRoot(document.getElementById('root')).render(<Provider><Pages/></Provider>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'app.js'),platform:'browser',format:'iife',jsx:'automatic'});
const css=await postcss([tailwind()]).process('@import "tailwindcss";',{from:path.resolve('footage-browser.css')});fs.writeFileSync(path.join(out,'app.css'),css.css);
const partBytes=8*1024*1024;
let assets=[],parts=new Map(),calls=[],failed=false;
const state=(fixtureId='match-a')=>({assets:assets.filter(a=>a.state!=='DELETED'&&a.fixtureId===fixtureId),configured:true,partBytes,uploadedBytes:0,reservedBytes:assets.reduce((s,a)=>s+a.sizeBytes,0),limitBytes:100*1024**3});
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const send=(value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(url.pathname.startsWith('/api/')){
    const fixtureId=url.pathname.split('/').at(-1);
    assert.ok(['match-a','match-b'].includes(fixtureId));
    assert.equal(url.pathname,`/api/admin/sixfl-tv/footage/${fixtureId}`);
    if(req.method==='GET'){
      if(url.searchParams.has('assetId')){const id=url.searchParams.get('assetId');return send({asset:assets.find(a=>a.id===id),parts:parts.get(id)||[]});}
      return send(state(fixtureId));
    }
    const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);
    if(req.method==='PUT'){
      const id=url.searchParams.get('assetId'),partNumber=Number(url.searchParams.get('part')),asset=assets.find(a=>a.id===id);
      assert.equal(asset.fixtureId,fixtureId,'Navigation must not change an active upload target');
      calls.push({method:'PUT',id,partNumber,length:raw.length});
      if(asset.filename==='resume.mp4'&&partNumber===1&&!failed){failed=true;return send({error:'Synthetic interruption — resume the same file.'},503);}
      if(asset.filename==='background.mp4')await new Promise(resolve=>setTimeout(resolve,1200));
      const row={partNumber,sha256:createHash('sha256').update(raw).digest('hex'),sizeBytes:raw.length};
      parts.set(id,[...(parts.get(id)||[]).filter(p=>p.partNumber!==partNumber),row]);return send({stored:true});
    }
    const data=JSON.parse(raw);calls.push(data);
    if(data.action==='begin'){
      const existing=assets.find(a=>a.state!=='DELETED'&&a.fixtureId===fixtureId&&a.filename===data.filename&&a.kind===data.kind);
      if(existing)return send({asset:existing,reused:true});
      const asset={...data,fixtureId,id:'source-'+(assets.length+1),position:assets.length,partCount:Math.ceil(data.sizeBytes/partBytes),state:'UPLOADING',shared:false};delete asset.action;assets.push(asset);return send({asset,reused:false},201);
    }
    if(data.action==='finish'){assets.find(a=>a.id===data.assetId).state='READY';return send({ok:true});}
    if(data.action==='reorder'){data.ids.forEach((id,i)=>assets.find(a=>a.id===id).position=i);assets.sort((a,b)=>a.position-b.position);return send({ok:true});}
    if(data.action==='remove'){assets.find(a=>a.id===data.assetId).state='DELETED';return send({removed:true});}
    return send({error:'Unexpected action'},400);
  }
  const file={'/app.js':'app.js','/app.css':'app.css'}[url.pathname];
  res.setHeader('Content-Type',file?(file.endsWith('.js')?'text/javascript':'text/css'):'text/html');
  res.end(file?fs.readFileSync(path.join(out,file)):`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#07140f;color:white;font-family:Arial}main{max-width:1150px;margin:20px auto;padding:16px;min-width:0}nav{display:flex;gap:12px;margin-bottom:16px}nav button{min-height:44px}</style></head><body><main id="root"></main><script>window.__INITIAL__=${JSON.stringify(state()).replaceAll('<','\\u003c')}</script><script src="/app.js"></script></body></html>`);
});
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
const file=(name,size=24)=>{const buffer=Buffer.alloc(size);buffer.write('ftyp',4);return{name,mimeType:'video/mp4',buffer};};
try{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch({headless:true});
    try{for(const width of [390,1360]){
      assets=[];parts=new Map();calls=[];failed=false;
      const page=await browser.newPage({viewport:{width,height:950}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('dialog',dialog=>dialog.accept()); // Deliberate reload tests acknowledge the upload warning.
      await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
      try{
        await page.goto(base);
        assert.equal(await page.getByLabel('Choose highlight clips',{exact:true}).getAttribute('multiple'),'');
        assert.equal(await page.getByLabel('Choose full match',{exact:true}).getAttribute('multiple'),null);
        await page.getByLabel('Choose highlight clips',{exact:true}).setInputFiles([file('goal-a.mp4'),file('goal-b.mp4')]);
        await page.getByLabel('Choose full match',{exact:true}).setInputFiles(file('full.mp4'));
        await page.getByText('Selected: 3 files',{exact:false}).waitFor();
        assert.equal(calls.length,0,'Choosing clips AND full match must preserve both without starting storage traffic');
        await page.getByRole('button',{name:'Upload selected files',exact:true}).click();
        await page.getByRole('status').filter({hasText:'Footage saved privately'}).waitFor();
        assert.equal(assets.filter(a=>a.kind==='CLIP'&&a.state==='READY').length,2);
        assert.equal(assets.filter(a=>a.kind==='FULL_MATCH'&&a.state==='READY').length,1);
        assert.equal(calls.filter(c=>c.action==='begin').length,3);
        await page.getByRole('button',{name:'Move goal-b.mp4 up',exact:true}).click();
        await page.getByRole('status').filter({hasText:'Clip order saved'}).waitFor();
        assert.equal(assets.filter(a=>a.kind==='CLIP')[0].filename,'goal-b.mp4');
        assert.equal(await page.getByRole('button',{name:'Pause after current part',exact:true}).count(),0,'Reordering is not an upload');
        // Interrupt the second part; reload and reselect exactly the same source.
        const resume=file('resume.mp4',partBytes+73);
        await page.getByLabel('Choose highlight clips',{exact:true}).setInputFiles(resume);
        await page.getByRole('button',{name:'Upload selected files',exact:true}).click();
        await page.getByRole('alert').filter({hasText:'Synthetic interruption'}).waitFor();
        await page.reload();
        await page.getByLabel('Resume resume.mp4',{exact:true}).setInputFiles(resume);
        await page.getByRole('button',{name:'Upload selected files',exact:true}).click();
        await page.getByRole('status').filter({hasText:'Footage saved privately'}).waitFor();
        const resumed=assets.find(a=>a.filename==='resume.mp4');assert.equal(resumed.state,'READY');
        assert.equal(calls.filter(c=>c.method==='PUT'&&c.id===resumed.id&&c.partNumber===0).length,1,'Saved first part is verified locally, not uploaded again');
        assert.equal(calls.filter(c=>c.method==='PUT'&&c.id===resumed.id&&c.partNumber===1).length,2);
        await page.getByRole('button',{name:'Remove',exact:true}).first().click();
        assert.equal(calls.filter(c=>c.action==='remove').length,0);
        await page.getByRole('button',{name:'Keep file',exact:true}).click();
        assert.equal(calls.filter(c=>c.action==='remove').length,0);
        // The match page is genuinely unmounted while an in-flight transfer continues.
        await page.getByLabel('Choose highlight clips',{exact:true}).setInputFiles(file('background.mp4',partBytes+100));
        await page.getByRole('button',{name:'Upload selected files',exact:true}).click();
        await page.getByLabel('Current file upload progress',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Other admin page',exact:true}).click();
        assert.equal(await page.getByLabel('Choose highlight clips',{exact:true}).count(),0);
        await page.getByRole('complementary',{name:'Background footage uploads'}).waitFor();
        await page.getByRole('button',{name:'Match B',exact:true}).click();
        await page.getByLabel('Choose full match',{exact:true}).setInputFiles(file('another-match.mp4'));
        await page.getByRole('button',{name:'Upload selected files',exact:true}).click();
        await page.getByRole('button',{name:'Other admin page',exact:true}).click();
        await page.getByRole('button',{name:/Uploads.*complete/}).waitFor();
        const bg=assets.find(a=>a.filename==='background.mp4'),other=assets.find(a=>a.filename==='another-match.mp4');
        assert.equal(bg.state,'READY');assert.equal(bg.fixtureId,'match-a');assert.equal(other.state,'READY');assert.equal(other.fixtureId,'match-b');
        assert.deepEqual(calls.filter(c=>c.method==='PUT'&&c.id===bg.id).map(c=>c.partNumber),[0,1]);
        await page.getByRole('button',{name:'Match A',exact:true}).click();
        await page.getByRole('button',{name:'Move background.mp4 up',exact:true}).waitFor();
        assert.equal(await page.getByLabel('Resume background.mp4',{exact:true}).count(),0);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal overflow');
        assert.deepEqual(errors,[]);
        await page.screenshot({path:`${artifacts}/${engine.name()}-${width}.png`,fullPage:true});
        console.log(`${engine.name()} ${width}px: combined selection, explicit start, order, interrupted/reloaded resume, background page unmount, second fixture queue, no duplicate part and no unconfirmed deletion`);
      }catch(error){await page.screenshot({path:`${artifacts}/${engine.name()}-${width}-failure.png`,fullPage:true});throw error;}finally{await page.close();}
    }}finally{await browser.close();}
  }
}finally{server.close();}
