const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { build } = require('esbuild');
const { chromium } = require(process.env.TEAM_MOVE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
let browser, bundle;

test.before(async () => {
  const output = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import Form from '@/components/admin/leagues/LeagueForm';
      import Control from '@/components/admin/teams/TeamMoveConfirmationSelect';
      const formRoot=createRoot(document.getElementById('form'));
      const teamsRoot=createRoot(document.getElementById('teams'));
      let enabled=true, version=0;
      window.saves=[];
      function renderTeams(){teamsRoot.render(<>
        <section><h2>Northallerton team</h2><Control enabled={enabled} teamId="north-team" teamName="Northallerton team" initialStatus="CONFIRMED"/></section>
        <section><h2>Catterick team</h2><Control enabled={false} teamId="cat-team" teamName="Catterick team" initialStatus="PENDING"/></section>
      </>);}
      async function saveLeague(_,data){
        window.saves.push({flag:data.get('isMoving'),marker:data.get('leagueMoveSettingPresent'),venue:data.get('venueName')});
        const result=await new Promise(resolve=>{window.completeSave=resolve;});
        if(result.success){enabled=data.get('isMoving')==='true';renderTeams();}
        return result;
      }
      window.loadForm=(value=true,mode='edit')=>formRoot.render(<Form key={++version} mode={mode} action={saveLeague} initialValues={{name:'Northallerton',slug:'northallerton',isMoving:value}}/>);
      window.loadForm();renderTeams();
    ` },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'offline-scope', setup(api) {
      api.onResolve({ filter: /move-confirmation-actions$/ }, () => ({ path: 'mock', namespace: 'offline' }));
      api.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: "export const saveTeamMoveConfirmation=()=>{throw new Error('League checkbox must not save a team response')};" }));
      api.onResolve({ filter: /^@\// }, args => {
        const file=path.join(root,'src',args.path.slice(2));
        return { path:[file+'.ts',file+'.tsx'].find(p=>fs.existsSync(p)) };
      });
    } }],
  });
  bundle=output.outputFiles[0].text;
  browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();});

for(const width of [1440,390]){
  test(`league move failure, retry and scope remain correct at ${width}px`,async()=>{
    const context=await browser.newContext({viewport:{width,height:950}});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.setContent('<!doctype html><style>*{box-sizing:border-box}body{margin:16px;background:#0b1411;color:white;font-family:Arial}#form{max-width:640px}input:not([type=checkbox]),select,textarea{width:100%;min-width:0}label{display:block}section{margin:16px 0}#teams{max-width:450px}</style><h1>Offline league scope test</h1><div id="teams"></div><div id="form"></div>');
      await page.addScriptTag({content:bundle});
      const checkbox=page.getByRole('checkbox',{name:'League move',exact:true});
      const save=page.getByRole('button',{name:'Save changes',exact:true});
      const pending=page.getByRole('button',{name:'Saving...',exact:true});
      const venue=page.getByLabel('Venue name',{exact:true});
      const north=page.getByRole('combobox',{name:'Move confirmation for Northallerton team'});
      const cat=page.getByRole('combobox',{name:'Move confirmation for Catterick team'});
      await checkbox.waitFor();
      assert.equal(await checkbox.isChecked(),true);
      assert.equal(await north.inputValue(),'CONFIRMED');
      assert.equal(await cat.count(),0);
      await venue.fill('Changed venue retained for retry');
      await checkbox.uncheck();
      assert.equal(await north.count(),1,'Unsaved checkbox must not change team visibility');

      await save.click();
      await pending.waitFor();
      assert.equal(await pending.isDisabled(),true);
      // A second submit while the response is outstanding cannot queue a write.
      await page.locator('#form form').evaluate(form=>form.requestSubmit());
      assert.equal(await page.evaluate(()=>window.saves.length),1);
      await page.evaluate(()=>window.completeSave({error:'Test save rejected'}));
      await page.getByText('Test save rejected',{exact:true}).waitFor();
      await save.waitFor();
      assert.equal(await north.count(),1);
      assert.equal(await checkbox.isChecked(),false,'A rejected save must retain the attempted unchecked value');
      assert.equal(await venue.inputValue(),'Changed venue retained for retry');

      await save.click();
      await pending.waitFor();
      await page.evaluate(()=>window.completeSave({success:true,message:'League updated successfully.'}));
      await north.waitFor({state:'detached'});
      await save.waitFor();
      assert.equal(await checkbox.isChecked(),false,'A successful untick must not visually reset');
      assert.equal(await venue.inputValue(),'Changed venue retained for retry');
      assert.equal(await cat.count(),0);
      assert.deepEqual(await page.evaluate(()=>window.saves),[
        {flag:null,marker:'1',venue:'Changed venue retained for retry'},
        {flag:null,marker:'1',venue:'Changed venue retained for retry'},
      ]);

      // Navigate back with persisted server data, then enable again.
      await page.evaluate(()=>window.loadForm(false));
      await page.waitForFunction(()=>document.querySelector('#isMoving')?.checked===false);
      await checkbox.check();
      assert.equal(await north.count(),0,'Ticking alone must not apply before Save');
      await save.click();
      await pending.waitFor();
      await page.evaluate(()=>window.completeSave({success:true,message:'League updated successfully.'}));
      await north.waitFor();
      await save.waitFor();
      assert.equal(await checkbox.isChecked(),true);
      assert.equal(await north.inputValue(),'CONFIRMED','Hiding and restoring tracking must preserve the response');
      assert.equal(await cat.count(),0);
      assert.deepEqual(await page.evaluate(()=>window.saves[2]),{flag:'true',marker:'1',venue:''});
      assert.equal(await page.evaluate(()=>window.saves.length),3);
      await page.evaluate(()=>window.loadForm(true));
      await page.waitForFunction(()=>document.querySelector('#isMoving')?.checked===true);
      assert.equal(await checkbox.isChecked(),true);

      // The same shared form also supports create with tracking off by default.
      await page.evaluate(()=>window.loadForm(false,'create'));
      await page.getByRole('button',{name:'Create league',exact:true}).waitFor();
      assert.equal(await checkbox.isChecked(),false);
      assert.equal(await page.evaluate(()=>window.saves.length),3,'Remounting the form must not save');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}
