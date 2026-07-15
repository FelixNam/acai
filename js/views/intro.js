/* ============================================================
   intro.js — single-canvas staged entrance
   Faithful port of ACAI.dc.html choreography:
     loading (small cards + bar) → opening (cards grow, back-face
     detail + notch appear) → main (3D flip to front) → facet
     (stub tears off, world slides to the facet zone).
   One persistent DOM; phase/zone classes drive CSS transitions.
   ============================================================ */
import { meta } from '../data.js';
import { L, vlabel } from '../i18n.js';
import { logoSVG, num, esc, paintLogos, setCrumb, pixelBurst } from '../ui.js';
import { showChrome } from '../app.js';
import { explorerFeatureHTML, viewersFeatureHTML, bootViewer } from './timeline.js';
import { wireKeywordDash } from './keyworddash.js';

const app = document.getElementById('app');
const wait = ms => new Promise(r=>setTimeout(r,ms));
let booted = false;          // loading/opening plays only once per session
export function markBooted(){ booted = true; }

/* ---- loading/opening + main background: the designed 8-bit açaí berry sprite. Berries spread NATURALLY
   over the whole screen (only the central ticket box is avoided), have DEPTH (far = small/faint/slow,
   near = big/opaque/fast parallax), giggle (smile → laugh near the cursor), and POP into pixels when
   clicked — a fresh one fades in. They PERSIST onto the main screen at a smaller size (_berryMini). ---- */
const _brnd = (a,b)=> a + Math.random()*(b-a);
let _berryMini = false;                                    // true once the tickets flip to the main screen → berries shrink
function spawnBerry(bg){
  const depth = _brnd(0.22, 1.15);                         // 0 = far, 1 = near
  const base  = Math.round(38 + depth*116);                // near → bigger
  const size  = Math.round(_berryMini ? base*0.6 : base);  // smaller on the main screen
  const op    = (0.32 + depth*0.58).toFixed(2);            // near → more opaque
  // natural spread across the whole viewport; only nudge berries out of the central ticket box (≈ x 27–73%, y 20–80%)
  let left = _brnd(2, 98), top = _brnd(3, 97);
  if(Math.abs(left-50) < 23 && Math.abs(top-50) < 30) left = (left>=50) ? _brnd(73, 98) : _brnd(2, 27);
  const b = document.createElement('div'); b.className = 'berry';
  b.dataset.depth = depth.toFixed(2); b.dataset.op = op; b.dataset.base = base;
  b.style.cssText = `left:${left.toFixed(1)}%;top:${top.toFixed(1)}%;width:${size}px;height:${size}px;`
    + `z-index:${Math.round(depth*10)};opacity:0;animation-duration:${_brnd(2.4,4.4).toFixed(1)}s;`
    + `animation-delay:${(-_brnd(0,3.5)).toFixed(2)}s`;
  bg.appendChild(b);
  requestAnimationFrame(()=>{ b.style.transition = 'opacity .65s ease, width .55s ease, height .55s ease'; b.style.opacity = op; });
  return b;
}
/* tickets flipped to main → shrink the existing berries in place (they stay, just smaller) */
function shrinkBerries(){
  _berryMini = true;
  const bg = document.getElementById('berry-bg'); if(!bg) return;
  bg.querySelectorAll('.berry').forEach(b=>{
    const mini = Math.round((parseFloat(b.dataset.base)||80) * 0.6);
    b.style.transition = 'opacity .65s ease, width .55s ease, height .55s ease';
    b.style.width = b.style.height = mini + 'px';
  });
}
function mountBerryBg(){
  if(document.getElementById('berry-bg')) return;
  const bg = document.createElement('div'); bg.id = 'berry-bg'; bg.setAttribute('aria-hidden','true');
  document.body.appendChild(bg);
  for(let i=0;i<8;i++) spawnBerry(bg);
  const onMove = (e)=>{
    const mx = (e.clientX/window.innerWidth - .5), my = (e.clientY/window.innerHeight - .5);
    bg.querySelectorAll('.berry').forEach(b=>{
      const d = parseFloat(b.dataset.depth)||.5;
      b.style.setProperty('--px', (mx*70*d).toFixed(1)+'px');   // parallax magnitude scales with depth
      b.style.setProperty('--py', (my*70*d).toFixed(1)+'px');
      const r = b.getBoundingClientRect(), cx = r.left+r.width/2, cy = r.top+r.height/2;
      b.classList.toggle('laugh', Math.hypot(e.clientX-cx, e.clientY-cy) < r.width*0.7 + 46);  // → laugh near the cursor
    });
  };
  const onClick = (e)=>{
    const list = bg.querySelectorAll('.berry');
    for(let i=0;i<list.length;i++){ const b=list[i], r=b.getBoundingClientRect();
      if(e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom){
        pixelBurst(r.left+r.width/2, r.top+r.height/2);   // berry bursts into pixels
        b.remove();
        if(bg.isConnected) spawnBerry(bg);                // a new one fades in elsewhere
        break;
      }
    }
  };
  window.addEventListener('mousemove', onMove, {passive:true});
  window.addEventListener('click', onClick, true);
  bg._cleanup = ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('click', onClick, true); bg.remove(); };
}
export function unmountBerryBg(){ const bg = document.getElementById('berry-bg'); if(bg && bg._cleanup) bg._cleanup(); else if(bg) bg.remove(); }

/* depth: the ticket row glides OPPOSITE the cursor (and more than the far berries that drift WITH it),
   so the tickets read as a foreground plane floating above the background. Wired once. */
let _ticketDepthWired = false;
function wireTicketDepth(){
  if(_ticketDepthWired) return; _ticketDepthWired = true;
  window.addEventListener('mousemove', (e)=>{
    const row = document.querySelector('.stage .ticket-row'); if(!row) return;
    const mx = (e.clientX/window.innerWidth - .5), my = (e.clientY/window.innerHeight - .5);
    row.style.transform = `translate3d(${(mx*-28).toFixed(1)}px, ${(my*-16).toFixed(1)}px, 0)`;
  }, {passive:true});
}

/* ---- ticket back-face themes (loading + opening) ---- */
const BACKS = [
  {bg:'#e9dfc9', corner:'#bdae89', bottom:'#1c1726', side:'#8a7c58', sideSub:'#9a8b66', tag:'CONTEMPORARY · ARTEVENT', logo:{}},
  {bg:'#5b3ba6', corner:'#efe6fb', bottom:'#ffffff', side:'#efe6fb', sideSub:'#efe6fbcc', tag:'RESOURCE · PARTICIPANT', logo:{leaf:'#C9BCF8',berry:'#fff',mid:'#fff'}},
  {bg:'#9a82ec', corner:'#7e63c8', bottom:'#2a1652', side:'#2a1652', sideSub:'#2a1652cc', tag:'EVENT · STRUCTURE', logo:{leaf:'#3E8E4F',berry:'#5B3BA6',mid:'#6A4BC0'}},
];

function ticketBack(i){
  const b = BACKS[i];
  const dk = i===1 ? 'dark' : '';   // deep-violet ticket → dark master; cream/lilac → light
  return `<div class="tk-back" style="--bg:${b.bg}">
    <div class="tk-loadmark"><span class="tk-lmlogo">${logoSVG(b.logo)}</span><b class="acai-wm ${dk}">ACAI</b></div>
    <div class="tk-shape">
      <div class="tk-corner acai-wm solid ${dk}">ACAI</div>
      <span class="tk-bigmark">${logoSVG(b.logo)}</span>
      <div class="tk-perfline" style="border-color:${i===0?'#1c172626':'#ffffff33'}"></div>
      <div class="tk-bottom acai-wm ${dk}">ACAI</div>
      <div class="tk-side" style="color:${b.side}"><span>2000</span><i></i><em>TO</em><i></i><span>2026</span><u style="color:${b.sideSub}">${b.tag}</u></div>
    </div>
  </div>`;
}

/* ---- ticket front-faces (main): every ticket is a tearable facet ---- */
function frontFacet({accent, ink, ghost, ghostLight=true, code, big, stub, arrow, logo, dark=false}){
  return `<div class="tk-front facet" style="--bg:${accent};--tink:${ink}">
    <div class="ff-top">
      <div class="ff-ghost${ghostLight?' light':''}">${ghost}</div>
      <div class="ff-brand"><span class="logo">${logoSVG(logo)}</span><b class="acai-wm${dark?' dark':''}">ACAI</b></div>
      <div class="ff-code" style="color:${ink}">${code}</div>
      <div class="ff-big" style="color:${ink}">${big}</div>
    </div>
    <div class="ff-stub">
      <div class="barcode-v"></div>
      <div class="ff-stub-txt"><b>${esc(stub)}</b><span class="ff-enter">TEAR TO ENTER <em>${arrow}</em></span></div>
    </div>
  </div>`;
}

/* ---- facet zone content (real data) ---- */
const ACTIVITY = [
  ['create','창작','#5B3BA6',['작품을 만드는 작가·창작자.','Artists and creators who make works.']],
  ['research','연구','#3E8E4F',['연구자·아키비스트·보존가.','Researchers, archivists and conservators.']],
  ['educate','교육','#6A4BC0',['교육자·공공프로그램 운영자.','Educators and public-program leads.']],
  ['curate','기획','#9A82EC',['전시를 기획·구성하는 큐레이터.','Curators who plan and shape exhibitions.']],
  ['manage','운영','#2C7A3F',['현장을 이끄는 디렉터·운영자.','Directors and managers running the field.']],
  ['support','지원','#66C47C',['기술·설치·제작 스태프.','Technical, installation and production staff.']],
  ['perform','공연','#4a2c6b',['공연자·라이브아트 실연자.','Performers and live-art practitioners.']],
  ['critique','비평','#b48fd6',['비평가·필자·편집자.','Critics, writers and editors.']],
];
const ACT5 = ['create','research','educate','curate','critique'];   // 5 headline activities only
function activityZone(M){
  const counts = Object.fromEntries(M.facets.activity.map(x=>[x.k,x.n]));
  const byKey = Object.fromEntries(ACTIVITY.map(a=>[a[0],a]));
  const tickets = ACT5.map((k,idx)=>{
    const [,,hue,blurb] = byKey[k];
    const blurbTxt = L(blurb[0], blurb[1]);
    return `<a class="act-ticket" href="#/activity/${k}" style="--hue:${hue}">
      <div class="at-top">
        <div class="at-head"><span class="at-no">${String(idx+1).padStart(2,'0')}</span><span class="at-cnt">${num(counts[k]||0)}<i>${L('참가자','participants')}</i></span></div>
        <div class="at-label">${vlabel(k)}</div>
        <p class="at-blurb">${blurbTxt}</p>
      </div>
      <div class="at-perf"></div>
      <div class="at-stub"><span class="barcode"></span><span class="at-open"><b>OPEN</b><em>→</em></span></div>
    </a>`; }).join('');
  return `<section class="zone-sec sec-activity">
    <div class="zone-head">
      <div class="zone-head-l"><div class="tab-v" style="color:#2c7a3f">FACET 02 · ART ACTIVITY</div>
        <div><div class="scope">participant.activity_type —</div><h2 class="h2-sentence do-title">${L('<span class="pre">미술 현장에서 참가자가</span> <b class="do">하는 일</b><span class="aft"></span>','<span class="pre">What Participants</span> <b class="do">DO</b> <span class="aft">in the Art Scene</span>')}</h2></div></div>
      <button class="pill" data-gomain>↑ ENTRANCE</button>
    </div>
    <div class="act-grid">${tickets}</div>
  </section>`;
}
function eventZone(M){
  const rows = [
    ['exhibition','A',L('미술 전시','Art Exhibition'),'#5b3ba6','#241c33',L('전시·디스플레이·기획 발표.','Exhibitions, displays and curated showings.'),'SeMA · MMCA · ACC',M.counts.exhibition,'2000–2025'],
    ['program','B',L('미술 프로그램','Art Program'),'#9a82ec','#2a1652',L('교육·문화 프로그램, 강연, 레지던시.','Education and culture programs, talks, residencies.'),'education · culture',M.counts.program,'2003–2026'],
    ['opencall','C',L('미술계 공모','Art Open Call'),'#3e8e4f','#fff',L('공모·펠로십·커미션.','Open calls, fellowships and commissions.'),'public · other',M.counts.opencall,'2020–2026'],
  ].map(([type,no,label,bg,ink,blurb,src,n,years])=>`
    <a class="event-card" href="#/list/${type}" style="--accent:${bg}">
      <div class="ec-stub"><span class="barcode-v"></span><span class="ec-admit">ADMIT · ONE</span></div>
      <div class="ec-body"><div class="ec-tag" style="color:${ink}cc">TYPE ${no} · ${years}</div>
        <div class="ec-label" style="color:${ink}"><b>${label}</b></div>
        <div class="ec-blurb" style="color:${ink}d0">${blurb}</div></div>
      <div class="ec-aside"><span class="ec-mark" data-logo="mono" style="color:${ink}"></span>
        <span class="ec-count" style="color:${ink}cc">${L(`${num(n)}건 · ${src}`, `${num(n)} · ${src}`)}</span><span class="ec-arrow" style="color:${ink}">→</span></div>
    </a>`).join('');
  return `<section class="zone-sec sec-event">
    <div class="zone-head">
      <div class="zone-head-l"><div class="tab-v" style="color:#2c7a3f">FACET 03 · ARTEVENT</div>
        <div><div class="scope">event.type —</div><h2 class="evt-title"><b class="ev-a">TYPES</b> <span class="ev-of">of</span> <b class="ev-b">Art Event</b></h2></div></div>
      <button class="pill" data-gomain>← ENTRANCE</button>
    </div>
    <div class="event-list">${rows}</div>
  </section>`;
}

/* ---- keywords zone (left of main): the REAL timeline lives here, in-place ---- */
function keysZone(M){
  return `<section class="zone-sec sec-keys">
    <button class="pill keys-back" data-gomain>← ENTRANCE</button>
    <header class="tl-page-head">
      <div class="tl-kick"><span class="tl-dot"></span>WHEN × WHAT — TIMELINE</div>
      <h1 class="tl-title">키워드 × 타임라인</h1>
      <p class="tl-lead">아카이브를 두 가지로 살펴봅니다 — <b>① 연도·월별 키워드 탐색기</b>로 주제의 흐름을, <b>② VIKUS 타임라인</b>으로 개별 전시·프로그램·공모를 둘러봅니다.</p>
    </header>
    ${explorerFeatureHTML(M)}
    ${viewersFeatureHTML('keys')}
  </section>`;
}

/* ---- build the whole stage ---- */
function stageHTML(M){
  return `<div class="stage zone-main ${booted?'phase-main':'phase-loading'}">
    <div class="world">
      <section class="zone-sec sec-main">
        <div class="ticket-row">
          <div class="ticket t0"><div class="ticket-inner">${ticketBack(0)}${frontFacet({accent:'#e9dfc9',ink:'#1c1726',ghost:'KEY',ghostLight:false,code:'FACET 01 · TIMELINE',big:'BY<br>KEYWORD',stub:'N° 01 · TAG · GETTY AAT',arrow:'←',logo:undefined,dark:false})}</div></div>
          <div class="ticket t1"><div class="ticket-inner">${ticketBack(1)}${frontFacet({accent:'#5b3ba6',ink:'#fff',ghost:'ACT',code:'FACET 02 · RESOURCES',big:'ART<br>ACTIVITY',stub:`N° 02 · PART · ${num(M.counts.participant)}`,arrow:'↓',logo:{leaf:'#C9BCF8',berry:'#fff',mid:'#fff'},dark:true})}</div></div>
          <div class="ticket t2"><div class="ticket-inner">${ticketBack(2)}${frontFacet({accent:'#9a82ec',ink:'#2a1652',ghost:'EVT',code:'FACET 03 · EVENTS',big:'ART<br>EVENT',stub:`N° 03 · EVT · ${num(M.event_total)}`,arrow:'→',logo:{leaf:'#3E8E4F',berry:'#5B3BA6',mid:'#6A4BC0'},dark:false})}</div></div>
        </div>
        <div class="intro-foot">
          <div class="foot-loading">
            <div class="load-kick">ARCHIVE OF CONTEMPORARY ART &amp; EVENT INFO</div>
            <div class="load-row"><span>LOADING ARCHIVE</span><span class="blink">●</span></div>
            <div class="load-bar"><i></i></div>
            <div class="load-stat"><i>${num(M.event_total)} events · ${num(M.counts.participant)} participants · ${num(M.counts.work)} works</i></div>
          </div>
          <button class="pill ghost foot-open" id="turnBtn">TURN THE TICKETS →</button>
          <div class="foot-main">
            <div class="load-kick">ARCHIVE OF CONTEMPORARY ART &amp; EVENT INFO</div>
            <div class="enter-hint mono">TEAR A TICKET — OR PICK A TRACK BELOW</div>
            <div class="track-row">
              <a class="pill sm" href="#/activity">◔ ART ACTIVITY · ${num(M.counts.participant)}</a>
              <a class="pill sm" href="#/events">◑ ART EVENT · ${num(M.event_total)}</a>
              <a class="pill sm" href="#/resources">◕ RESOURCES · ${num(M.resource_total)}</a>
              <a class="pill sm" href="#/semantic">◓ SEMANTIC TAGS</a>
              <a class="pill sm" href="#/search">⌕ SEARCH</a>
            </div>
          </div>
        </div>
      </section>
      ${keysZone(M)}
      ${activityZone(M)}
      ${eventZone(M)}
    </div>
  </div>`;
}

let stageEl = null;
export async function home(){
  const M = await meta();
  app.innerHTML = stageHTML(M);
  stageEl = app.querySelector('.stage');
  paintLogos(app);
  wireKeywordDash(app.querySelector('.sec-keys'));          // expanded keyword dashboard in the keys zone
  wireStage();
  wireTicketDepth();
  _berryMini = booted;                               // re-entering the main screen → berries mount already small
  mountBerryBg();                                    // floating pixel-açaí background (loading + opening + main)

  if(!booted){
    showChrome(false);
    document.body.classList.add('boot');
    document.getElementById('paper').style.opacity='0';
    // loading → opening
    await wait(2000);
    if(!stageEl.isConnected) return;
    stageEl.classList.remove('phase-loading'); stageEl.classList.add('phase-opening');
    // opening → main on TURN click
    await new Promise(res=>{
      const btn = document.getElementById('turnBtn');
      if(!btn){ res(); return; }
      btn.addEventListener('click', res, {once:true});
    });
    if(!stageEl.isConnected) return;
    booted = true;
    toMain();
  } else {
    stageEl.classList.add('stage-in');   // re-entering the entrance from a route (e.g. About → by activity → ↑ ENTRANCE) → fade/slide in, not an abrupt cut
    toMain(true);
  }
}

function toMain(instant){
  document.body.classList.remove('boot');
  shrinkBerries();                                   // tickets flipped → berries stay, just smaller (not removed)
  document.getElementById('paper').style.opacity='1';
  stageEl.classList.remove('phase-loading','phase-opening');
  stageEl.classList.add('phase-main');
  showChrome(true);
  setCrumb('ENTRANCE');
}

/* ---- interactions: tear → slide, and go-back ---- */
function wireStage(){
  // every facet ticket tears; the keywords ticket slides left to the in-place timeline
  bindTear('.ticket.t0', 'keys');
  bindTear('.ticket.t1', 'activity');
  bindTear('.ticket.t2', 'event');
  // back buttons in facet zones
  stageEl.querySelectorAll('[data-gomain]').forEach(b=>b.addEventListener('click', goMain));
}
const CRUMB = {keys:'FACET 01 / KEYWORDS', activity:'FACET 02 / ART ACTIVITY', event:'FACET 03 / ARTEVENT'};
let tearing = false;
function bindTear(sel, zone){
  const ticket = stageEl.querySelector(sel);
  if(!ticket) return;
  const front = ticket.querySelector('.tk-front');
  front.addEventListener('click', (e)=>{
    // let real links (facet cards) pass; here front is the ticket face → tear
    if(!stageEl.classList.contains('phase-main') || tearing) return;
    e.preventDefault();
    tearing = true;
    ticket.classList.add('tearing');
    spawnTearDots(front);            // 8-bit pixel dots bounce off the perforation
    setCrumb(CRUMB[zone] || 'ENTRANCE');
    setTimeout(()=>{
      stageEl.classList.remove('zone-main');
      stageEl.classList.add('zone-'+zone);
      if(zone==='keys') bootKeysTimeline();   // lazy-boot the embedded VIKUS on first reveal
      tearing = false;
    }, 720);
  });
}
/* tear FX: a row of little 8-bit pixel dots that burst + bounce off the perforation line */
const DOT_COLORS = ['#5b3ba6','#3e8e4f','#e0a33d','#9a82ec','#241c33','#6a4bc0'];
function spawnTearDots(front){
  if(!front) return;
  const burst = document.createElement('div');
  burst.className = 'tear-burst';
  const N = 16;
  let h = '';
  for(let i=0;i<N;i++){
    const t = i/(N-1);
    const left = 5 + t*90;                                  // spread along the tear line (%)
    const dir = (left<50?-1:1);                             // fly outward from the centre
    const dx = dir*(10 + Math.round(Math.random()*46));     // horizontal travel
    const peak = -(28 + Math.round(Math.random()*40));      // bounce height (up = negative)
    const sz = 3 + (i%3);                                   // 3–5px pixel squares (finer)
    const col = DOT_COLORS[i%DOT_COLORS.length];
    const delay = Math.round(Math.random()*120);
    const dur = 760 + Math.round(Math.random()*260);
    h += `<span class="tear-dot" style="left:${left}%;width:${sz}px;height:${sz}px;background:${col};`
       + `--dx:${dx}px;--peak:${peak}px;animation-delay:${delay}ms;animation-duration:${dur}ms"></span>`;
  }
  burst.innerHTML = h;
  front.appendChild(burst);
  setTimeout(()=>burst.remove(), 1200);
}

/* lazy-load + size-kick the in-place timeline iframe when the keys zone is revealed */
function bootKeysTimeline(){
  // same two horizontal viewers as the #/timeline route, lazy-booted now that the keys zone is revealed.
  if(document.getElementById('keysFrame')?.dataset.wired) return;   // wire once per stage build
  const f1=document.getElementById('keysFrame');
  if(f1) f1.dataset.wired='1';
  bootViewer(f1, document.getElementById('keysEra'));               // 전시·프로그램 + era toggle
  bootViewer(document.getElementById('keysFrameOpc'), null);        // 공모
}
function goMain(){
  if(!stageEl) return;
  stageEl.classList.remove('zone-activity','zone-event','zone-keys');
  stageEl.classList.add('zone-main');
  stageEl.querySelectorAll('.ticket.tearing').forEach(t=>t.classList.remove('tearing'));
  setCrumb('ENTRANCE');
}
