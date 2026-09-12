import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const posted=[];let reject=true;
 await page.route('**/api/captain/veo/confirm',async route=>{posted.push(route.request().postDataJSON());await route.fulfill({status:reject?400:200,contentType:'application/json',body:JSON.stringify(reject?{error:'Test save failure: choice retained'}:{confirmed:true,message:'Your team is confirmed to play. Veo requested — awaiting confirmation.'})});});
 await page.goto('http://127.0.0.1:3100/__veo-choice-test',{waitUntil:'networkidle'});
 await page.getByRole('radio',{name:/No thanks/}).waitFor();assert.equal(await page.getByRole('radio',{name:/No thanks/}).isChecked(),true);
 await page.getByRole('radio',{name:/Yes, just this match/}).check();await page.getByRole('button',{name:'Confirm our team can play',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Test save failure'}).waitFor();assert.equal(await page.getByRole('radio',{name:/Yes, just this match/}).isChecked(),true);assert.equal(posted[0].choice,'MATCH');
 reject=false;await page.getByRole('button',{name:'Confirm our team can play',exact:true}).click();await page.getByRole('status').filter({hasText:'confirmed to play'}).waitFor();assert.equal(posted.length,2);assert.equal(posted[1].choice,'MATCH');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.screenshot({path:'artifacts/veo/confirmation-live-mobile.png',fullPage:true});
 await page.getByRole('radio',{name:/Yes, this and future/}).check();await page.getByRole('button',{name:'Confirm our team can play',exact:true}).click();await page.waitForTimeout(200);assert.equal(posted.at(-1).choice,'ONGOING');
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/veo/confirmation-live-desktop.png',fullPage:true});
 const before=posted.length;await page.goto('http://127.0.0.1:3100/__veo-choice-test?preview=1',{waitUntil:'networkidle'});assert.equal(await page.getByRole('radio').count(),3);for(const radio of await page.getByRole('radio').all())assert.equal(await radio.isDisabled(),true);
 const button=page.getByRole('button',{name:'Confirm our team can play',exact:true});assert.equal(await button.isDisabled(),true);await button.evaluate(e=>e.click());await page.keyboard.press('Enter');await page.waitForTimeout(150);assert.equal(posted.length,before);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/veo/confirmation-preview-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS real client component: one-match/ongoing payload, retained choice after failure, success acknowledgement, preview no POST, desktop/mobile layout. API and financial services tested separately against PostgreSQL.');
}finally{await browser.close();}
