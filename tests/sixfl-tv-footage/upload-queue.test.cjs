const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const sha = bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id === '@/lib/sixfl-tv/footage-policy' ? load('src/lib/sixfl-tv/footage-policy.ts') : require(id), mod, mod.exports);
  return mod.exports;
}
const { FootageUploadQueue } = load('src/components/admin/sixfl-tv/footage-upload-queue.ts');
const PART = 8 * 1024 * 1024;
const file = (name = 'clip.mp4', size = 24, fill = 1) => new File([Buffer.alloc(size, fill)], name, { lastModified: 123, type: 'video/mp4' });
const waitFor = async predicate => { for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Condition timed out'); };
function storage() {
  const assets = new Map(), parts = new Map(), calls = [];
  let gate = null, failure = null;
  const transport = {
    async json(url, signal, body) {
      signal.throwIfAborted(); const parsed = new URL(url, 'https://example.invalid'), fixtureId = parsed.pathname.split('/').at(-1);
      calls.push({ type: 'json', fixtureId, ...body });
      if (!body) return { parts: parts.get(parsed.searchParams.get('assetId')) || [] };
      if (body.action === 'begin') {
        let asset = [...assets.values()].find(a => a.fixtureId === fixtureId && a.filename === body.filename);
        if(!asset){asset={ id:'asset-'+assets.size,fixtureId,filename:body.filename,sizeBytes:body.sizeBytes,partCount:Math.ceil(body.sizeBytes/PART),state:'UPLOADING' };assets.set(asset.id,asset);}
        return { asset };
      }
      if (body.action === 'finish') { assets.get(body.assetId).state='READY'; return { ok: true }; }
      throw Error('Unexpected action');
    },
    async put(url, bytes, signal, progress) {
      signal.throwIfAborted(); const parsed=new URL(url,'https://example.invalid'), id=parsed.searchParams.get('assetId'), number=Number(parsed.searchParams.get('part'));
      calls.push({type:'put',id,number});progress(bytes.byteLength);
      if (failure && failure(number)) throw Error('Synthetic network interruption');
      if (gate) await gate(signal);
      signal.throwIfAborted();
      parts.set(id,[...(parts.get(id)||[]).filter(p=>p.partNumber!==number),{partNumber:number,sha256:sha(bytes)}]);
    },
    async digest(bytes) { return sha(bytes); },
  };
  return { assets,parts,calls,transport,hold:fn=>gate=fn,fail:fn=>failure=fn };
}
test('unmounting a page subscriber does not stop transfers; second fixture stays correctly assigned', async()=>{
  const s=storage(),q=new FootageUploadQueue(s.transport);let release; s.hold(()=>new Promise(r=>release=r));
  const unsubscribe=q.subscribe(()=>{});q.enqueue('match-a','A v B',[{file:file(),kind:'CLIP'}]);await waitFor(()=>release);
  unsubscribe(); // Match page leaves; queue is still owned by the persistent admin layout.
  q.enqueue('match-b','C v D',[{file:file('full.mp4'),kind:'FULL_MATCH'}]);
  assert.equal(s.calls.filter(c=>c.action==='begin').length,1,'Only one transfer runs at a time');
  s.hold(null);release();await waitFor(()=>q.getSnapshot().tasks.every(t=>t.status==='COMPLETE'));
  assert.deepEqual(s.calls.filter(c=>c.action==='begin').map(c=>c.fixtureId),['match-a','match-b']);
  assert.equal(s.calls.filter(c=>c.type==='put').length,2);assert.equal(q.getSnapshot(),q.getSnapshot(),'Stable external-store snapshot');
});
test('pause finishes current part; in-tab resume reuses file and verifies saved bytes',async()=>{
  const s=storage(),q=new FootageUploadQueue(s.transport);let release;s.hold(()=>new Promise(r=>release=r));
  q.enqueue('match-a','A v B',[{file:file('long.mp4',PART+10),kind:'FULL_MATCH'}]);await waitFor(()=>release);
  const id=q.getSnapshot().tasks[0].id;q.pause(id);s.hold(null);release();await waitFor(()=>q.getSnapshot().tasks[0].status==='PAUSED');
  assert.equal(s.calls.filter(c=>c.type==='put').length,1);assert.equal(s.calls.filter(c=>c.action==='finish').length,0);
  q.resume(id);await waitFor(()=>q.getSnapshot().tasks[0].status==='COMPLETE');
  assert.deepEqual(s.calls.filter(c=>c.type==='put').map(c=>c.number),[0,1]);
});
test('completed files are not repeated when a later file fails; retry resumes only incomplete file',async()=>{
  const s=storage(),q=new FootageUploadQueue(s.transport);s.fail(number=>number===1);
  q.enqueue('match-a','A v B',[{file:file('first.mp4'),kind:'CLIP'},{file:file('second.mp4',PART+1),kind:'FULL_MATCH'}]);
  await waitFor(()=>q.getSnapshot().tasks.some(t=>t.status==='FAILED'));
  assert.equal(q.getSnapshot().tasks[0].status,'COMPLETE');s.fail(null);q.resume(q.getSnapshot().tasks[1].id);
  await waitFor(()=>q.getSnapshot().tasks.every(t=>t.status==='COMPLETE'));
  assert.equal(s.calls.filter(c=>c.type==='put'&&c.id==='asset-0').length,1);
  assert.equal(s.calls.filter(c=>c.type==='put'&&c.id==='asset-1'&&c.number===0).length,1);
});
test('new page load rejects changed saved parts instead of uploading mixed footage',async()=>{
  const s=storage(),q=new FootageUploadQueue(s.transport);s.fail(n=>n===1);
  q.enqueue('match-a','A v B',[{file:file('same.mp4',PART+1,1),kind:'CLIP'}]);await waitFor(()=>q.getSnapshot().tasks[0].status==='FAILED');
  const next=new FootageUploadQueue(s.transport);s.fail(null);
  next.enqueue('match-a','A v B',[{file:file('same.mp4',PART+1,2),kind:'CLIP',asset:[...s.assets.values()][0]}]);
  await waitFor(()=>next.getSnapshot().tasks[0].status==='FAILED');assert.match(next.getSnapshot().tasks[0].error,/differs/);
  assert.equal(s.calls.filter(c=>c.action==='finish').length,0);
});
test('duplicate enqueue is ignored; leaving admin aborts transfer and never finalises it',async()=>{
  const s=storage(),q=new FootageUploadQueue(s.transport);let started=false;
  s.hold(signal=>new Promise((resolve,reject)=>{started=true;signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true});}));
  const selection={file:file(),kind:'CLIP'};assert.equal(q.enqueue('match-a','A v B',[selection]),1);await waitFor(()=>started);
  assert.equal(q.enqueue('match-a','A v B',[selection]),0);q.stop();await waitFor(()=>q.getSnapshot().tasks[0].status==='PAUSED');
  assert.equal(s.calls.filter(c=>c.action==='finish').length,0);
  q.forget(q.getSnapshot().tasks[0].id);assert.equal(q.getSnapshot().tasks.length,0);assert.equal(s.assets.size,1,'Forget never deletes server uploads');
});
test('invalid batches do not partially enqueue or start network requests',()=>{
  const s=storage(),q=new FootageUploadQueue(s.transport);
  assert.throws(()=>q.enqueue('match-a','A v B',[{file:file(),kind:'CLIP'},{file:file('bad.txt'),kind:'CLIP'}]));
  assert.equal(q.getSnapshot().tasks.length,0);assert.equal(s.calls.length,0);
});

test('shared branding uses the global upload endpoint without inventing a fixture',async()=>{
  const s=storage(),q=new FootageUploadQueue(s.transport);
  assert.equal(q.enqueue(null,'Shared SIXFL TV branding',[{file:file('intro.mp4'),kind:'INTRO'}]),1);
  await waitFor(()=>q.getSnapshot().tasks[0].status==='COMPLETE');
  assert.equal(q.getSnapshot().tasks[0].fixtureId,null);
  assert.equal(s.calls.find(c=>c.action==='begin').fixtureId,'shared');
});
