const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
function load(file,mocks={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(id=>mocks[id]||require(id),mod,mod.exports);return mod.exports;
}
(async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE TABLE "Team" ("id" TEXT PRIMARY KEY);
 CREATE TABLE "Fixture" ("id" TEXT PRIMARY KEY,"homeTeamId" TEXT,"awayTeamId" TEXT);
 INSERT INTO "Team" VALUES ('a'),('b'),('c'); INSERT INTO "Fixture" VALUES ('f','a','b'),('g','a','b');`);
 await db.exec(fs.readFileSync('prisma/migrations/20260923010000_loan_authority_requests/migration.sql','utf8'));
 const adapter=connection=>({$queryRaw:async sql=>(await connection.query(sql.text,sql.values)).rows});
 const service=load('src/lib/fixtures/loan-authority.ts',{
  './loan-authority-policy':load('src/lib/fixtures/loan-authority-policy.ts'),
  '@/lib/prisma':{prisma:{...adapter(db),$transaction:fn=>db.transaction(tx=>fn(adapter(tx)))}}
 });
 const save=(fixtureId,teamId,count,revision)=>service.saveLoanAuthorityRequest({fixtureId,teamId,count,revision},'admin');
 await save('f','a',2,0); await save('f','b',3,0); await save('g','a',1,0);
 let rows=await service.getLoanAuthorityRequests(['f']);
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.teamId==='a').count,2);
 await assert.rejects(save('f','a',4,0),/Someone changed/);
 await save('f','a',0,1); rows=await service.getLoanAuthorityRequests(['f']);
 assert.equal(rows.find(r=>r.teamId==='a').count,0);assert.equal(rows.find(r=>r.teamId==='b').count,3);
 await db.exec(`UPDATE "Fixture" SET "awayTeamId"='c' WHERE "id"='f'`);
 assert.equal((await service.getLoanAuthorityRequests(['f'])).length,1);
 await assert.rejects(save('f','b',2,1),/no longer/);
 await assert.rejects(db.exec(`UPDATE "FixtureLoanAuthorityRequest" SET "count"=10`));
 await db.exec(`DELETE FROM "Fixture" WHERE "id"='f'`);
 assert.equal((await service.getLoanAuthorityRequests(['f'])).length,0);
 assert.equal((await service.getLoanAuthorityRequests(['g']))[0].count,1);
 console.log('Loan request migration, save/reload, team isolation, clear, stale edits, replacement and cascade passed.');
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
