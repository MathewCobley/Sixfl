const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    let filename = path.resolve(root,file);
    if (!fs.existsSync(filename)) filename += '.ts';
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename,module);
    const compiled = ts.transpileModule(fs.readFileSync(filename,'utf8'), { fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
    new Function('require','module','exports',compiled.outputText)(id => {
      if (Object.hasOwn(mocks,id)) return mocks[id];
      if (id.startsWith('@/')) return load('src/'+id.slice(2));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename),id));
      return require(id);
    },module,module.exports);
    return module.exports;
  }
  return load;
}
const contract = loader()('src/lib/team-logo-export-contract.ts');
const { createStoreZip } = loader()('src/lib/exports/store-zip.ts');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=','base64');
function unzip(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'sixfl-logos-'));
  try {
    fs.writeFileSync(path.join(dir,'test.zip'),data);
    return JSON.parse(execFileSync('python3',['-c', 'import zipfile,json,sys,base64\nz=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None\nprint(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))',path.join(dir,'test.zip')],{encoding:'utf8'}));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
const team = (id,name,extra={}) => ({ id,name,logoUrl:'/team-logos/test.png',leagueKey:'north',leagueName:'Northallerton',season:'Summer 2026',isCurrent:true,...extra });
function exportHarness(rows,failId) {
  const calls=[], queries=[];
  const read = async (url) => { calls.push(url); if(url===failId) throw new Error('Logo unavailable.'); return {data:image,extension:'png'}; };
  const load=loader({ '@/lib/prisma':{prisma:{$queryRaw:async q=>{queries.push(q);return rows;}}}, './team-logo-assets':{readTeamLogo:read} });
  return { ...load('src/lib/exports/team-logos.ts'),calls,queries };
}

test('selection validates IDs and size and never accepts URLs as team IDs',()=>{
  assert.deepEqual(contract.parseLogoTeamIds(['a','a','b']),['a','b']);
  for(const value of [[],null,['../secret'],['https://example.com'],new Array(201).fill('a')]) assert.throws(()=>contract.parseLogoTeamIds(value));
});
test('portable filenames and ZIP traversal/collision protection',()=>{
  assert.equal(contract.logoFileSegment('CON'),'_CON');
  assert.equal(contract.logoFileSegment('../A/B:*?'),' -A-B---'.trim());
  for(const name of ['../bad.png','/bad.png','a/../../bad','a\\bad','C:bad']) assert.throws(()=>createStoreZip([{name,data:image}]));
  assert.throws(()=>createStoreZip([{name:'A.png',data:image},{name:'a.png',data:image}]));
  assert.throws(()=>createStoreZip([{name:'a.png',data:image}],10));
});
test('ZIP is readable by Python, CRC-valid, Unicode-safe and byte-exact',()=>{
  const entries=[{name:"Thirsk/India’s 6s.png",data:image},{name:'report.txt',data:Buffer.from('report')}];
  const files=unzip(createStoreZip(entries));
  assert.equal(files[entries[0].name],image.toString('base64'));
  assert.equal(Buffer.from(files['report.txt'],'base64').toString(),'report');
});
test('only selected IDs are exported, files are named and missing logos reconcile',async()=>{
  const h=exportHarness([team('a','A'),team('b','B'),team('c','C',{logoUrl:null}),team('d','D',{logoUrl:'broken'})],'broken');
  const result=await h.buildTeamLogoExport(['a','c','d'],new AbortController().signal);
  assert.equal(result.exported,1); assert.equal(result.missing,2);
  const files=unzip(result.data);
  assert.deepEqual(Object.keys(files),['Northallerton/A.png','SIXFL-export-report.txt']);
  const report=Buffer.from(files['SIXFL-export-report.txt'],'base64').toString();
  assert.match(report,/Selected teams: 3/);assert.match(report,/C - No logo assigned/);assert.match(report,/D - Logo unavailable/);
  assert.equal(h.calls.length,2);assert.doesNotMatch(report,/contactEmail|phone|paymentToken/);
});
test('duplicate names do not overwrite and unknown IDs fail before reading any artwork',async()=>{
  const h=exportHarness([team('a','Same'),team('b','Same')]);
  assert.equal((await h.buildTeamLogoExport(['a','a','b'],new AbortController().signal)).exported,2);
  assert.ok(Object.keys(unzip((await h.buildTeamLogoExport(['a','b'],new AbortController().signal)).data)).includes('Northallerton/Same (2).png'));
  const missing=exportHarness([team('a','A')]);
  await assert.rejects(missing.buildTeamLogoExport(['missing'],new AbortController().signal),/no longer available/);assert.equal(missing.calls.length,0);
});
test('all-unavailable selections produce an explicit failure, not an empty successful ZIP',async()=>{
  const h=exportHarness([team('a','Missing',{logoUrl:null})]);
  await assert.rejects(h.buildTeamLogoExport(['a'],new AbortController().signal),/None of the selected logos/);
});
test('asset reader recognises own URLs, rejects non-web schemes and private/reserved addresses',()=>{
  const assets=loader({'@/lib/team-badges':{getTeamBadgeImage:async()=>image}})('src/lib/exports/team-logo-assets.ts');
  assert.equal(assets.parseLogoLocation('team-logos/A.png').local,true);
  assert.equal(assets.parseLogoLocation('https://www.sixfl.co.uk/team-logos/A.png').local,true);
  for(const url of ['file:///etc/passwd','data:image/png;base64,a','//localhost/x','https://user:pass@example.com/a']) assert.throws(()=>assets.parseLogoLocation(url));
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','100.64.0.1','198.18.0.1','::1','224.0.0.1']) assert.equal(assets.isPublicLogoAddress(ip),false);
  assert.equal(assets.isPublicLogoAddress('8.8.8.8'),true);
});
test('uploaded badges use full stored image and SVG/HTML active content is rejected',async()=>{
  let thumbnail;
  const assets=loader({'@/lib/team-badges':{getTeamBadgeImage:async(id,small)=>{thumbnail=small;return image;}}})('src/lib/exports/team-logo-assets.ts');
  const result=await assets.readTeamLogo('https://sixfl.co.uk/api/team-badges/11111111-1111-4111-8111-111111111111?variant=thumbnail',new AbortController().signal);
  assert.equal(thumbnail,false);assert.deepEqual(result.data,image);
  await assert.rejects(assets.identifyLogo(Buffer.from('<html>Login</html>')));
  await assert.rejects(assets.identifyLogo(Buffer.from('<svg onload="alert(1)"></svg>')));
  assert.equal(await assets.identifyLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')),'svg');
});
test('API requires admin and same-origin custom header, and preserves binary download feedback',async()=>{
  let allowed=false,calls=0,received;
  const route=loader({'@/lib/requireAdmin':{requireAdmin:async()=>{if(!allowed)throw new Error('login');}},
    '@/lib/exports/team-logos':{buildTeamLogoExport:async ids=>{calls++;received=ids;return {data:createStoreZip([{name:'a.png',data:image}]),exported:1,missing:1};}}})('src/app/api/admin/teams/logo-export/route.ts');
  const request=(origin='https://sixfl.test')=>new Request('https://sixfl.test/api/admin/teams/logo-export',{method:'POST',headers:{origin,'content-type':'application/json','x-sixfl-logo-export':'1'},body:JSON.stringify({teamIds:['a','b']})});
  assert.equal((await route.POST(request())).status,401);assert.equal(calls,0);
  allowed=true;assert.equal((await route.POST(request('https://other.test'))).status,403);assert.equal(calls,0);
  const response=await route.POST(request());assert.equal(response.status,200);assert.deepEqual(received,['a','b']);
  assert.equal(response.headers.get('content-type'),'application/zip');assert.equal(response.headers.get('x-sixfl-logos-missing'),'1');
  assert.match(response.headers.get('cache-control'),/no-store/);unzip(Buffer.from(await response.arrayBuffer()));
});
test('prepared-source entry points stay native and export contains no write or messaging actions',()=>{
  const files=['src/lib/exports/team-logos.ts','src/lib/exports/team-logo-assets.ts','src/app/api/admin/teams/logo-export/route.ts'];
  for(const file of files) assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/\$executeRaw|\.update\(|\.create\(|queueNotification|sendEmail|sendSms|ensureSeasonTeamRows/);
  assert.match(fs.readFileSync(path.join(root,'src/app/(admin)/admin/teams/page.tsx'),'utf8'),/href="\/admin\/teams\/logos"/);
  assert.match(fs.readFileSync(path.join(root,'src/app/(admin)/admin/teams/logos/page.tsx'),'utf8'),/await requireAdmin\(\)/);
});
