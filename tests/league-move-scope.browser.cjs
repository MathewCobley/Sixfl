const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { build } = require('esbuild');
const { chromium } = require(process.env.TEAM_MOVE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
let browser, bundle;
test.before(async () => {
  const preparedForm=fs.readFileSync(path.join(root,'src/components/admin/leagues/LeagueForm.tsx'),'utf8');
  console.log('Prepared form owns reset handler:',preparedForm.includes('onReset={event => event.preventDefault()}'));
  const output = await build({stdin:{resolveDir:root,loader:'tsx',contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import Form from '@/components/admin/leagues/LeagueForm';
    import Control from '@/components/admin/teams/TeamMoveConfirmationSelect';
    const formRoot=createRoot(document.getElementById('form'));
    const teamsRoot=createRoot(document.getElementById('teams'));
    let enabled=true;
    window.saves=[]; window.rejectSave=false;
    function renderTeams(){teamsRoot.render(<><section><h2>Northallerton team</h2><Control enabled={enabled} teamId="north-team" teamName="Northallerton team" initialStatus="CONFIRMED"/></section><section><h2>Catterick team</h2><Control enabled={false} teamId="cat-team" teamName="Catterick team" initialStatus="PENDING"/></section></>);}
    async function saveLeague(_,data){
      window.saves.push({flag:data.get('isMoving'),marker:data.get('leagueMoveSettingPresent')});
      if(window.rejectSave)return {error:'Test save rejected'};
      enabled=data.get('isMoving')==='true'; renderTeams();
      return {success:true,message:'League updated successfully.'};
    }
    window.loadForm=(value=true)=>formRoot.render(<Form mode="edit" action={saveLeague} initialValues={{name:'Northallerton',slug:'northallerton',isMoving:value}}/>);
    window.loadForm(); renderTeams();
  `},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'offline-scope',setup(api){
    api.onResolve({filter:/move-confirmation-actions$/},()=>({path:'mock',namespace:'offline'}));
    api.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:"export const saveTeamMoveConfirmation=()=>{throw new Error('League checkbox must not save a team response')};"}));
    api.onResolve({filter:/^@\//},args=>{const file=path.join(root,'src',args.path.slice(2));return {path:[file+'.ts',file+'.tsx'].find(p=>fs.existsSync(p))};});
  }}]});
  bundle=output.outputFiles[0].text; browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();});
for(const width of [1440,390]){
  test(`league move tick/save/untick controls only Northallerton at ${width}px`,async()=>{
    const context=await browser.newContext({viewport:{width,height:950}});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.setContent('<!doctype html><style>*{box-sizing:border-box}body{margin:16px;background:#0b1411;color:white;font-family:Arial}#form{max-width:640px}input:not([type=checkbox]),select,textarea{width:100%;min-width:0}label{display:block}section{margin:16px 0}#teams{max-width:450px}</style><h1>Offline league scope test</h1><div id="teams"></div><div id="form"></div>');
      await page.evaluate(()=>{
        window.formEvents=[];
        document.addEventListener('reset',e=>window.formEvents.push({type:'reset',cancelable:e.cancelable,prevented:e.defaultPrevented}));
        document.addEventListener('change',e=>{if(e.target.id==='isMoving')window.formEvents.push({type:'change',checked:e.target.checked});});
      });
      await page.addScriptTag({content:bundle});
      const checkbox=page.getByRole('checkbox',{name:'League move',exact:true});
      const save=page.getByRole('button',{name:'Save changes',exact:true});
      const north=page.getByRole('combobox',{name:'Move confirmation for Northallerton team'});
      const cat=page.getByRole('combobox',{name:'Move confirmation for Catterick team'});
      await checkbox.waitFor(); assert.equal(await checkbox.isChecked(),true);
      assert.equal(await north.inputValue(),'CONFIRMED'); assert.equal(await cat.count(),0);
      await checkbox.uncheck(); assert.equal(await north.count(),1);
      await page.evaluate(()=>{window.rejectSave=true;});
      await save.click(); await page.getByText('Test save rejected',{exact:true}).waitFor();
      if(await checkbox.isChecked())console.log('Checkbox failure evidence',width,await checkbox.evaluate(el=>({checked:el.checked,defaultChecked:el.defaultChecked,reactChecked:el[Object.keys(el).find(k=>k.startsWith('__reactProps'))]?.checked,events:window.formEvents,saves:window.saves})),errors);
      assert.equal(await north.count(),1); assert.equal(await checkbox.isChecked(),false);
      await page.evaluate(()=>{window.rejectSave=false;});
      await save.click(); await north.waitFor({state:'detached'});
      assert.equal(await cat.count(),0);
      await page.evaluate(()=>window.loadForm(false)); assert.equal(await checkbox.isChecked(),false);
      await checkbox.check(); assert.equal(await north.count(),0);
      await save.click(); await north.waitFor();
      assert.equal(await north.inputValue(),'CONFIRMED'); assert.equal(await cat.count(),0);
      assert.deepEqual(await page.evaluate(()=>window.saves),[
        {flag:null,marker:'1'},{flag:null,marker:'1'},{flag:'true',marker:'1'}
      ]);
      await page.evaluate(()=>window.loadForm(true)); assert.equal(await checkbox.isChecked(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }finally{await context.close();}
  });
}
