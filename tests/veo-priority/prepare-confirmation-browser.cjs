// Creates an isolated development-only host for the real client component. This
// runs AFTER production build/auth tests; it is never committed or deployed.
const fs=require('node:fs');
if(process.env.VEO_TEST_DATABASE!=='1'||!/^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/sixfl_veo_test$/.test(process.env.DATABASE_URL||''))throw new Error('Isolated test database required.');
const dir='src/app/__veo-choice-test';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(`${dir}/page.tsx`, `import Form from '@/components/captain/VeoFixtureConfirmation';
export default async function Test({searchParams}:{searchParams:Promise<{preview?:string}>}) {
const q=await searchParams;return <main className="mx-auto max-w-2xl p-4"><Form teamId="test-team" confirmed={false} preview={q.preview==='1'} offer={{fixtureId:'test-fixture',leagueId:'test-league',fixtureStamp:'stamp',ongoing:false,choice:'NONE',requested:false,closed:false,status:'OPEN',extraPence:0,capacity:3,basePence:4000,termsVersion:'veo-match-choice-v1'}} /></main>;
}`);
