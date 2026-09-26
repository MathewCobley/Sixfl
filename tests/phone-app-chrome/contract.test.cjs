const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {loadSource}=require('../admin-activity/load.cjs');
const read=file=>fs.readFileSync(file,'utf8');

test('shared viewport chrome is an owned portal, with a measured non-overlapping header and complete cleanup',()=>{
 const path='src/components/pwa/PinnedAppChrome.tsx',source=read(path);
 assert.match(source,/createPortal\(/);assert.match(source,/setHost\(document.body\)/);assert.match(source,/ResizeObserver/);assert.match(source,/data-app-header-space/);
 assert.match(source,/position: "fixed"/);assert.match(source,/observer\?\.disconnect\(\)/);assert.match(source,/removeEventListener\("resize"/);assert.match(source,/removeEventListener\("scroll"/);
 assert.doesNotMatch(source,/MutationObserver|querySelector|createElement|innerHTML|\.classList/);
 const Component=loadSource(path).default;
 for(const edge of ['top','bottom'])assert.equal(renderToStaticMarkup(React.createElement(Component,{edge},React.createElement('nav',null,'Keep links'))),'<nav>Keep links</nav>','SSR and first hydration keep the original chrome');
});

test('all real role header and nav owners use the same pinned chrome, not a preview-only fix',()=>{
 for(const file of ['captain/CaptainAppHeader.tsx','captain/CaptainPwaBottomNav.tsx','player/PlayerPwaPortalHeader.tsx','player/PlayerTeamNav.tsx','referee/RefereeAppHome.tsx','referee/RefereeAppShell.tsx']){
  const source=read('src/components/'+file);assert.match(source,/import PinnedAppChrome from "@\/components\/pwa\/PinnedAppChrome"/);
  if(!file.includes('Nav'))assert.match(source,/<PinnedAppChrome edge="top">/);
  if(file.includes('Nav')||file.startsWith('referee'))assert.match(source,/<PinnedAppChrome edge="bottom">/);
 }
 const home=read('src/components/referee/RefereeAppHome.tsx');
 assert.doesNotMatch(home.match(/<PinnedAppChrome edge="bottom">[\s\S]*?<\/PinnedAppChrome>/)[0],/sm:hidden|md:hidden/,'landscape phone keeps the referee tabs');
});

test('existing identity, app gates, role routes, desktop branch and bottom reserves are preserved',()=>{
 assert.match(read('src/components/captain/CaptainAppHeader.tsx'),/<strong>\{teamName\}<\/strong>/);
 assert.match(read('src/components/player/PlayerPwaPortalHeader.tsx'),/previewPlayers\.find/);
 assert.match(read('src/components/player/PlayerTeamNav.tsx'),/previewMembershipId/);
 for(const name of ['RefereeAppHome','RefereeAppShell'])assert.match(read('src/components/referee/'+name+'.tsx'),/safe-area-inset-bottom/);
 assert.match(read('src/components/referee/RefereeAppShell.tsx'),/RefereePortalViewMode mode="web"/);
 assert.match(read('src/app/captain/team/[teamid]/layout.tsx'),/5\.75rem \+ env\(safe-area-inset-bottom\)/);
 assert.match(read('src/components/player/PlayerPwaPortalHeader.tsx'),/4\.8rem \+ env\(safe-area-inset-bottom\)/);
});
