/* ============================================================
   app.js — boot sequence + hash router + view dispatch
   ============================================================ */
import { paintLogos, setCrumb, th, pixelBurst } from './ui.js';
import { meta, searchIndex, ENTITIES } from './data.js';
import { home, markBooted, unmountBerryBg } from './views/intro.js';
import { L, getLang, setLang, setKwMap } from './i18n.js';

export const wait = ms => new Promise(r=>setTimeout(r,ms));
const app = document.getElementById('app');

/* every button-ish click emits the 8-bit pixel burst (capture phase, so it fires even when the
   click also navigates away). Tickets keep their own bigger tear burst. */
document.addEventListener('click', (e)=>{
  if(e.target.closest('.tk-front')) return;   // tickets already burst on tear
  const btn = e.target.closest('.pill,.chrome-nav a,.fpill,.sbtn,.vbtn,.tl-era,.act-ticket,.ttab,a.tag,.cloud-tag,.way,button');
  if(btn) pixelBurst(e.clientX, e.clientY);
}, true);

/* ---- route parsing ---- */
export function parseHash(){
  let h = location.hash.replace(/^#\/?/, '');
  const [pathStr, queryStr=''] = h.split('?');
  const path = pathStr.split('/').filter(Boolean).map(decodeURIComponent);
  const query = {};
  new URLSearchParams(queryStr).forEach((v,k)=>query[k]=v);
  return {path, query};
}
export const go = (hash)=>{ location.hash = hash; };

/* ---- chrome nav ---- */
const NAV = [
  {ko:'둘러보기', en:'Browse',      hash:'#/',               key:'browse'},
  {ko:'검색',     en:'Search',      hash:'#/search',         key:'search'},
  {ko:'전시',     en:'Exhibition',  hash:'#/list/exhibition', key:'exhibition'},
  {ko:'프로그램', en:'Program',     hash:'#/list/program',    key:'program'},
  {ko:'공모',     en:'Open Call',   hash:'#/list/opencall',   key:'opencall'},
  {ko:'장소',     en:'Venue',       hash:'#/list/venue',      key:'venue'},
  {ko:'연표',     en:'Timeline',    hash:'#/timeline',        key:'timeline'},
  {ko:'관계망',   en:'Network',     hash:'#/network',         key:'network'},
  {ko:'소개',     en:'About',       hash:'#/about',           key:'about'},
];
function buildNav(){
  const nav = document.getElementById('chrome-nav');
  nav.innerHTML = NAV.map(n=>`<a href="${n.hash}" data-nav="${n.key}">${L(n.ko,n.en)}</a>`).join('');
}
/* fixed top-right language toggle — always visible (incl. the intro/home screen) */
function paintLangToggle(){
  const t = document.getElementById('langToggle'); if(!t) return;
  const en = getLang()==='en';
  t.textContent = en ? 'KR' : 'EN';
  t.dataset.next = en ? 'ko' : 'en';
  t.title = en ? '한국어로 보기' : 'View in English';
}
/* language toggle → persist + re-render current view + relabel chrome */
export function applyLang(l){
  setLang(l);
  document.documentElement.lang = l;
  buildNav();
  paintLangToggle();
  route();
}
document.addEventListener('click', (e)=>{
  const t = e.target.closest('#langToggle'); if(!t) return;
  e.preventDefault();
  applyLang(t.dataset.next);
});
function markNav(key){
  document.querySelectorAll('#chrome-nav a').forEach(a=>a.classList.toggle('on', a.dataset.nav===key));
}
export function showChrome(on){
  const c = document.getElementById('chrome');
  if(on){ c.hidden=false; } else { c.hidden=true; }
}

/* ---- view loaders (dynamic) ---- */
const views = {
  browse:   () => import('./views/browse.js'),
  detail:   () => import('./views/detail.js'),
  search:   () => import('./views/search.js'),
  timeline: () => import('./views/timeline.js'),
  network:  () => import('./views/network.js'),
  about:    () => import('./views/about.js'),
};

/* scroll + transition helper */
export function mount(html, cls='page'){
  // any mounted (non-intro) view runs on the revealed paper, never the boot dark ground
  document.body.classList.remove('boot');
  unmountBerryBg();                       // berries live only on the entrance (boot + main), not on route pages
  const paper = document.getElementById('paper'); if(paper) paper.style.opacity = '1';
  app.innerHTML = `<div class="${cls} view-in">${html}</div>`;
  paintLogos(app);
  window.scrollTo(0,0);
}

/* ---- main router ---- */
async function route(){
  const {path, query} = parseHash();

  // home / main entrance (intro.home handles the staged boot once)
  if(path.length===0){
    markNav('browse'); setCrumb('입구');
    await home(); return;
  }
  showChrome(true);
  const head = path[0];

  try {
    if(head==='activity'){ markNav('browse'); const m=await views.browse(); return path[1]? m.activityListing(path[1],query) : m.activityFacet(); }
    if(head==='events'){   markNav('browse'); const m=await views.browse(); return m.eventFacet(); }
    if(head==='resources'){markNav('browse'); const m=await views.browse(); return m.resourceFacet(); }
    if(head==='list'){     markNav(path[1]||'browse'); const m=await views.browse(); return m.listing(path[1], query); }
    if(head==='semantic'){ markNav('browse'); const m=await views.browse(); return path[1]? m.semanticListing(path[1],query) : m.semanticFacet(); }
    if(head==='search'){   markNav('search'); const m=await views.search(); return m.searchView(query); }
    if(head==='timeline'){ markNav('timeline');const m=await views.timeline(); return m.timelineView(query); }
    if(head==='network'){  markNav('network'); const m=await views.network(); return m.networkView(query); }
    if(head==='about'){    markNav('about');   const m=await views.about(); return m.aboutView(); }
    if(ENTITIES.includes(head) && path[1]){ markNav(''); const m=await views.detail(); return m.detailView(head, path[1]); }
  } catch(err){
    console.error(err);
    mount(`<div class="empty">이 화면을 불러오지 못했습니다.<br><span class="mono" style="font-size:11px">${th(head).label||head} — ${err.message}</span><br><br><a class="pill" href="#/">↑ 입구</a></div>`);
    return;
  }
  // fallback
  mount(`<div class="empty">찾을 수 없습니다.<br><br><a class="pill" href="#/">↑ 입구</a></div>`);
}

/* ---- boot ---- */
async function start(){
  document.documentElement.lang = getLang();
  paintLogos();
  buildNav();
  paintLangToggle();
  window.addEventListener('hashchange', route);
  // preload meta + search index in background
  meta(); searchIndex();
  // EN overlays (keyword + category) — EN 모드에서는 초기 렌더 전에 로드 완료를 보장 (렌더 레이스 방지)
  const _ov = Promise.all([
    fetch('data/keyword_en.json').then(r=>r.ok?r.json():{}).then(setKwMap).catch(()=>{}),
    fetch('data/category_en.json').then(r=>r.ok?r.json():{}).then(setKwMap).catch(()=>{})
  ]);
  if(getLang()==='en'){ await _ov; }
  const h = parseHash();
  if(h.path.length>0){ // deep link → skip the staged intro
    markBooted();
    document.body.classList.remove('boot');
    document.getElementById('paper').style.opacity='1';
    showChrome(true);
    await meta();
    route();
  } else {
    document.body.classList.add('boot');
    await route();   // home() runs the staged boot
  }
}
start();
