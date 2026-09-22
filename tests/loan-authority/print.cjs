const fs=require('node:fs');
const ts=require('typescript');
const assert=require('node:assert/strict');
const canvas=require('canvas');
function load(route) {
 const source=fs.readFileSync(`src/app/api/admin/night-board/${route}/route.ts`,'utf8')+'\nexport { createPdf };';
 const mod={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(id=>{
  if(id==='@/lib/fixtures/loan-authority-policy')return {loanAuthorityLabel:count=>count>0?`Loan authority requested: ${count}`:''};
  if(id==='@/lib/datetime/london')return {formatTimeInLondon:()=> '19:30'};
  if(id.startsWith('@/'))return {};
  return require(id);
 },mod,mod.exports); return mod.exports;
}
(async()=>{
 const labels=[]; const original=canvas.CanvasRenderingContext2D.prototype.fillText;
 canvas.CanvasRenderingContext2D.prototype.fillText=function(text,...args){labels.push(text);return original.call(this,text,...args);};
 const fixture={id:'f',kickoffAt:new Date(),pitch:'1',homeTeam:{id:'a',name:'Long Team Name Athletic'},awayTeam:{id:'b',name:'Other Team United'},league:{name:'Test league',venueName:'Test venue'},division:null,venue:null,referee:{name:'Test referee'},prediction:null,homeLoanCount:2,awayLoanCount:3,homeKitColour:'#ff0000',awayKitColour:'#00ff00',homeShinPadWarningCount:2,awayShinPadWarningCount:0,homeNeedsKitSizeCheck:true,awayNeedsKitSizeCheck:false,nightBoardNote:'Bring spare bibs',isTv:true};
 for(const route of ['pitch-tally-sheets','night-fixtures']) {
  labels.length=0;
  const fixtures=Array.from({length:route==='night-fixtures'?10:3},(_,i)=>({...fixture,id:`f${i}`,pitch:i>=5?'2':'1'}));
  const pdf=await load(route).createPdf(fixtures,'23 September 2026');
  assert.equal(labels.filter(text=>text==='Loan authority requested: 2').length,fixtures.length);
  assert.equal(labels.filter(text=>text==='Loan authority requested: 3').length,fixtures.length);
  assert.ok(pdf.length>1000);
  if(process.env.PRINT_OUTPUT_DIR){fs.mkdirSync(process.env.PRINT_OUTPUT_DIR,{recursive:true});fs.writeFileSync(`${process.env.PRINT_OUTPUT_DIR}/${route}.pdf`,pdf);}
 }
 console.log('Both prepared PDF renderers print the correct request count for each team.');
})().catch(error=>{console.error(error);process.exitCode=1;});
