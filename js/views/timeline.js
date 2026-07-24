/* ============================================================
   timeline.js — ONE full-page, upright VIKUS viewer.
   Native VIKUS UI: left keyword cloud (count-sized, multi-select),
   bottom year timeline, native detail panel from the right.
   Loaded full-bleed (no #ui=0, no rotation) so detail opens upright.
   ============================================================ */
import { setCrumb, esc } from '../ui.js';
import { L, kwLabel } from '../i18n.js';
import { mount } from '../app.js';
import { meta } from '../data.js';
import { keywordDashHTML, wireKeywordDash } from './keyworddash.js';
/* VIKUS 정적 자산: 로컬은 vikus/, GitHub Pages에선 별도 리포(acai-vikus, 1024px 티어) */
const VIKUS_BASE = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'vikus/' : 'https://felixnam.github.io/acai-vikus/';

const LEGEND = [
  ['Exhibition', '전시', '#4635B1'],
  ['Education',  '교육', '#C0A6EE'],
  ['Culture',    '문화', '#AFD24B'],
  ['Open Call',  '공모', '#E9DFC9'],
];

/* ===== KEYWORD EXPLORER ===============================================================
   A wide, interactive panel above the VIKUS viewer: pick an institution-TYPE (전체 / 국공립미술관 /
   갤러리 / 미술관 / 문화공간), then read that group's representative keyword for a chosen year as a
   big statement + a clickable year strip + a month breakdown. Data = meta.facets.keyword_explorer:
   {groups:[{key,dim}], data:{group:{years:{Y:{total,theme[],genre[]}}, months:{Y:{M:{theme,genre}}}}}}.
   Galleries lack thematic Getty-AAT keywords (only 빅3 국공립 do), so groups carry a `dim`: 국공립=주제(theme),
   나머지=분야(medium/genre). The renderer falls back to whichever signal a group/year actually has. */
const KX_DIMLABEL = { theme:() => L('주제','theme'), genre:() => L('분야','field') };
const kxCfg   = M => (M.facets && M.facets.keyword_explorer) || {groups:[],data:{}};
const kxGroup = (M,g) => (kxCfg(M).groups.find(x=>x.key===g)) || {key:g,dim:'theme'};
const kxYears = (M,g) => { const d=kxCfg(M).data[g]; return d ? Object.keys(d.years).map(Number).sort((a,b)=>a-b) : []; };
function hadBatchim(w){ if(!w) return false; const c=w.charCodeAt(w.length-1); if(c<0xAC00||c>0xD7A3) return false; return (c-0xAC00)%28!==0; }
/* representative value for (group, year), honouring the group's preferred dim but falling back */
function kxRep(M,g,y){
  const d=kxCfg(M).data[g]; const pref=kxGroup(M,g).dim;
  const yr=(d&&d.years[String(y)])||{total:0,theme:[],genre:[]};
  const primary = pref==='theme' ? yr.theme : yr.genre;
  const list = primary.length ? primary : (pref==='theme' ? yr.genre : yr.theme);
  const dim  = primary.length ? pref : (pref==='theme'?'genre':'theme');
  return { dim, total:yr.total, list, value:(list[0]&&list[0].k)||'' };
}
function kxSayHTML(M,g,y){
  const r=kxRep(M,g,y); const gl=(g==='전체')?L('아카이브 전체','the whole archive'):g; const dl=KX_DIMLABEL[r.dim]();
  const tail = r.value ? L(hadBatchim(r.value)?'이었습니다':'였습니다','') : '';
  const chips=r.list.slice(0,3).map((x,i)=>`<a class="kx-chip${i===0?' is-1':''}" href="#/search?q=${encodeURIComponent(x.k)}">${esc(kwLabel(x.k))}<i>${x.n}</i></a>`).join('');
  return `<div class="kx-say">
    <p class="kx-say-pre">${L(`<b class="kx-yr">${y}</b>년 <b>${esc(gl)}</b>의 대표 ${dl}는`, `<b>${esc(gl)}</b>'s defining ${dl} in <b class="kx-yr">${y}</b> was`)}</p>
    ${ r.value ? `<a class="kx-say-kw" href="#/search?q=${encodeURIComponent(r.value)}" title="${L('이 키워드로 검색','Search this keyword')}">${esc(kwLabel(r.value))}</a>
      <p class="kx-say-post">${tail} <span class="kx-say-n">${L(`· 활동 ${r.total.toLocaleString()}건`, `· ${r.total.toLocaleString()} activities`)}</span></p>`
      : `<p class="kx-say-kw kx-empty">${L('데이터 없음','No data')}</p>` }
    <div class="kx-chips">${chips}</div>
  </div>`;
}
function kxYearsHTML(M,g,y0){
  const ys=kxYears(M,g); if(!ys.length) return '<div class="kx-years"></div>';
  const max=Math.max(...ys.map(y=>kxRep(M,g,y).total),1);
  return `<div class="kx-years">`+ys.map(y=>{
    const r=kxRep(M,g,y); const f=Math.log(r.total+1)/Math.log(max+1); const w=Math.round(16+84*f);
    const top3=r.list.slice(0,3);
    const list = top3.length
      ? top3.map((x,i)=>`<span class="kx-yc-kw"><b>${i+1}</b><span>${esc(kwLabel(x.k))}</span></span>`).join('')
      : `<span class="kx-yc-kw kx-empty"><span>${L('데이터 없음','No data')}</span></span>`;
    return `<button class="kx-yc${y===y0?' is-on':''}" data-y="${y}" title="${L(`${y}년 대표 ${KX_DIMLABEL[r.dim]()} · 활동 ${r.total.toLocaleString()}건`, `${y} defining ${KX_DIMLABEL[r.dim]()} · ${r.total.toLocaleString()} activities`)}">
      <span class="kx-yc-top"><span class="kx-yc-y">${y}</span><span class="kx-yc-n">${r.total.toLocaleString()}</span></span>
      <span class="kx-yc-bar"><i style="width:${w}%;opacity:${(0.55+0.45*f).toFixed(2)}"></i></span>
      <span class="kx-yc-top3">${list}</span></button>`;
  }).join('')+`</div>`;
}
function kxMonthsHTML(M,g,y){
  const d=kxCfg(M).data[g]; const mo=(d&&d.months[String(y)])||{}; const pref=kxGroup(M,g).dim;
  let cells='';
  for(let m=1;m<=12;m++){
    const c=mo[String(m)]||{}; const v = pref==='theme' ? (c.theme||c.genre||'') : (c.genre||c.theme||'');
    cells+=`<div class="kx-mc${v?'':' is-empty'}"><span class="kx-mc-m">${L(`${m}월`, `${m}`)}</span><span class="kx-mc-v">${esc(v||'·')}</span></div>`;
  }
  return `<div class="kx-months"><div class="kx-months-h">${L(`${y}년 월별 대표 ${KX_DIMLABEL[pref]()}`, `Monthly defining ${KX_DIMLABEL[pref]()} in ${y}`)}</div><div class="kx-months-row">${cells}</div></div>`;
}
function kxStageHTML(M,g,y){
  return kxSayHTML(M,g,y)+`<div class="kx-right"><div class="kx-strip">`+kxYearsHTML(M,g,y)+`</div>`+kxMonthsHTML(M,g,y)+`</div>`;
}
/* full panel HTML (initial state = 전체, latest year). Falls back to nothing if data absent. */
export function keywordExplorerHTML(M){
  const groups=kxCfg(M).groups; if(!groups.length) return '';
  const g0='전체', ys=kxYears(M,g0), y0=ys.length?ys[ys.length-1]:2026;
  // institution-type tabs only help when ≥2 distinct types exist (전체 + 2+). With an institutional-only
  // archive 전체 == 국공립미술관, so the filter is redundant → hide the tab row (reappears if data expands).
  const showTabs = groups.length > 2;
  const tabs = showTabs ? groups.map(x=>`<button class="kx-tab${x.key===g0?' is-on':''}" data-g="${esc(x.key)}">${esc(x.key)}</button>`).join('') : '';
  return `<div class="kw-explorer" data-g="${g0}" data-y="${y0}">
    ${showTabs ? `<div class="kx-head"><div class="kx-tabs">${tabs}</div></div>` : ''}
    <div class="kx-stage">${kxStageHTML(M,g0,y0)}</div>
  </div>`;
}
/* attach interactivity: institution tab → switch group; year cell → focus year. Re-renders the stage. */
export function wireKeywordExplorer(root, M){
  const ex=root.querySelector('.kw-explorer'); if(!ex) return;
  const stage=ex.querySelector('.kx-stage');
  const render=()=>{ stage.innerHTML=kxStageHTML(M, ex.dataset.g, +ex.dataset.y); };
  ex.addEventListener('click', e=>{
    const tab=e.target.closest('.kx-tab');
    if(tab){
      ex.querySelectorAll('.kx-tab').forEach(t=>t.classList.toggle('is-on', t===tab));
      ex.dataset.g=tab.dataset.g;
      const ys=kxYears(M,tab.dataset.g);
      if(ys.length && !ys.includes(+ex.dataset.y)) ex.dataset.y=String(ys[ys.length-1]);
      render(); return;
    }
    const yc=e.target.closest('.kx-yc');
    if(yc){ ex.dataset.y=yc.dataset.y; render(); }
  });
}

/* the two stacked horizontal VIKUS viewer blocks (no wrapper) */
function viewerBlocksHTML(p){
  return `<section class="tl-vblock">
      <div class="tl-vhead">
        <h3 class="tl-vtitle">${L('전시 · 교육 · 문화행사','Exhibition · Education · Culture')}</h3>
        <button class="tl-era" id="${p}Era">${L('↤ 2000–2009 보기','↤ View 2000–2009')}</button>
      </div>
      <div class="tl-vbody"><iframe id="${p}Frame" class="tl-frame" title="${L('ACAI 타임라인 — 전시·교육·문화행사','ACAI timeline — Exhibition · Education · Culture')}" loading="lazy" data-src="${VIKUS_BASE}index.html"></iframe></div>
    </section>
    <section class="tl-vblock">
      <div class="tl-vhead">
        <h3 class="tl-vtitle">${L('공모','Open Call')}</h3>
      </div>
      <div class="tl-vbody"><iframe id="${p}FrameOpc" class="tl-frame" title="${L('ACAI 타임라인 — 공모','ACAI timeline — Open Call')}" loading="lazy" data-src="${VIKUS_BASE}index.html?config=data-opencall/config.json"></iframe></div>
    </section>`;
}

/* FEATURE 1 — 연도·월별 키워드 탐색기: its description + the explorer, in one box. */
export function explorerFeatureHTML(M){
  return `<section class="tl-feature">
    <div class="tl-feature-head">
      <h2 class="tl-feat-title"><span class="tl-feat-no">1</span>${L('연도·월별 키워드 탐색기','Keyword Explorer by Year & Month')}</h2>
      <p class="tl-feat-desc">${L('ACAI 아카이브를 <b>주제 키워드(Getty AAT)</b>의 흐름으로 봅니다. 각 <b>연도 카드</b>는 그 해를 대표하는 키워드 <b>Top 3</b>과 활동량을, 카드를 누르면 그 해의 대표 주제와 <b>월별</b> 키워드까지 보여줍니다. 키워드를 누르면 검색으로 이어집니다.', 'View the ACAI archive as a flow of <b>thematic keywords (Getty AAT)</b>. Each <b>year card</b> shows that year\'s <b>Top 3</b> keywords and activity volume; click a card to see the year\'s defining themes and even its <b>monthly</b> keywords. Click a keyword to jump to search.')}</p>
    </div>
    <div class="tl-feature-body">${keywordDashHTML()}</div>
  </section>`;
}

/* FEATURE 2 — VIKUS 타임라인: the tool's description + colour legend + the two viewers, in one box. */
export function viewersFeatureHTML(p='tl'){
  const legend = LEGEND.map(([en,kr,c]) =>
    `<span class="tlg-i"><i style="background:${c}"></i>${L(kr, en)}</span>`).join('');
  return `<section class="tl-feature">
    <div class="tl-feature-head">
      <h2 class="tl-feat-title"><span class="tl-feat-no">2</span>${L('VIKUS 타임라인','VIKUS Timeline')}</h2>
      <p class="tl-feat-desc">${L('개별 전시·프로그램·공모를 <b>VIKUS Viewer</b>로 시각화한 영역입니다. <b>상단 대각선 키워드(Getty AAT)</b>로 거르고(여러 개 동시 선택 가능), <b>가로 연도축</b>을 따라 타일을 훑어봅니다. 타일을 누르면 상세가 열리고, 스크롤로 확대·축소합니다. <b>전시·프로그램</b>과 <b>공모</b>를 각각 탐색하세요.', 'A space that visualizes individual exhibitions, programs, and open calls with the <b>VIKUS Viewer</b>. Filter by the <b>diagonal keywords (Getty AAT)</b> at the top (multiple selections allowed) and scan tiles along the <b>horizontal year axis</b>. Click a tile to open its details; scroll to zoom in and out. Explore <b>Exhibitions · Programs</b> and <b>Open Calls</b> separately.')}</p>
      <div class="tl-legend tl-feat-legend">${legend}</div>
    </div>
    <div class="tl-feature-body tl-viewers">${viewerBlocksHTML(p)}</div>
  </section>`;
}

export async function timelineView(){
  setCrumb(L('연표','Timeline'));
  const M = await meta();
  mount(`
    <header class="tl-page-head">
      <div class="tl-kick"><span class="tl-dot"></span>${L('언제 × 무엇 — 연표','WHEN × WHAT — Timeline')}</div>
      <h1 class="tl-title">${L('키워드 × 타임라인','Keyword × Timeline')}</h1>
      <p class="tl-lead">${L('아카이브를 두 가지로 살펴봅니다 — <b>① 연도·월별 키워드 탐색기</b>로 주제의 흐름을, <b>② VIKUS 타임라인</b>으로 개별 전시·프로그램·공모를 둘러봅니다.', 'Explore the archive two ways — <b>① the Keyword Explorer by Year & Month</b> for the flow of themes, and <b>② the VIKUS Timeline</b> for individual exhibitions, programs, and open calls.')}</p>
    </header>
    ${explorerFeatureHTML(M)}
    ${viewersFeatureHTML('tl')}`, 'tl-page');
  wireKeywordDash(document.querySelector('.tl-page'));

  bootViewer(document.getElementById('tlFrame'),    document.getElementById('tlEra'));   // 전시·프로그램 + era toggle
  bootViewer(document.getElementById('tlFrameOpc'), null);                               // 공모, no toggle
}

/* lazy-boot a horizontal VIKUS iframe when it scrolls near the viewport, then keep it
   resized. The iframe must be ≥500px wide (VIKUS isMobile gate) — full page-column width clears it. */
export function bootViewer(frame, eraBtn){
  if(!frame) return;
  const kick = ()=>{ try{ const w=frame.contentWindow; if(w&&w.acaiResize) w.acaiResize(); else if(w) w.dispatchEvent(new Event('resize')); }catch(e){} };
  let loaded=false, poll=0;
  // lazy load: boot the iframe when its block scrolls within ~500px of the viewport.
  // Polled (works across headless/embedded contexts where scroll/IO events are flaky) + scroll-driven.
  const check=()=>{
    if(loaded || !frame.dataset.src) return;
    if(!frame.isConnected){ stop(); return; }          // navigated away → give up
    if(frame.getBoundingClientRect().top < window.innerHeight + 500){
      loaded=true; frame.src=frame.dataset.src;
      [700,1700,3200].forEach(t=>setTimeout(kick,t));
      stop();
    }
  };
  const stop=()=>{ clearInterval(poll); window.removeEventListener('scroll', check); };
  window.addEventListener('scroll', check, {passive:true});
  poll=setInterval(check, 250);
  check();                    // boot now if already in view (viewer 1 sits just below the hero)
  if(eraBtn) wireEra(frame, eraBtn, kick);
  let rt; window.addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(kick,200); });
}

/* toggle the 전시·프로그램 viewer between the 2010+ and the 2000–2009 dataset (both horizontal) */
export function wireEra(frame, btn, kick){
  if(!frame || !btn) return;
  btn.addEventListener('click', ()=>{
    const pre = btn.dataset.era !== 'pre';
    btn.dataset.era = pre ? 'pre' : 'main';
    frame.src = pre ? VIKUS_BASE+'index.html?config=data-pre/config.json' : VIKUS_BASE+'index.html';
    btn.textContent = pre ? L('2010년 이후 보기 ↦','View 2010+ ↦') : L('↤ 2000–2009 보기','↤ View 2000–2009');
    [900,2200,3800].forEach(t=>setTimeout(()=>kick&&kick(),t));
  });
}
