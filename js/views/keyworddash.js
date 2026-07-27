/* ============================================================
   keyworddash.js — expanded keyword explorer (Getty AAT).
   One keyword is the central object; selecting it reveals its trend, medium mix,
   co-occurring themes, top artists/institutions, and the exhibitions/programs that
   carry it. Plus archive-wide overviews: year×keyword heatmap and rising/falling.
   Single-screen report layout.
   Data: data/keyword_index.json (built by tools/build_keyword_index.py).
   ============================================================ */
import { esc } from '../ui.js';
import { isLocalCat, kwLabel, L, aatIdOf, isEN } from '../i18n.js';
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/* item title: the index carries the harvested English title as the 6th field (exhibitions only —
   programs have none), so EN mode shows it when present and falls back to the Korean title. */
const itemTitle = (ko, en) => (isEN() && (en||'').trim()) ? en : ko;

/* Getty AAT id badge for the selected theme — links out to the Getty vocabulary page */
const aatLink = k => { const id = aatIdOf(k);
  return id ? ` <a class="kd-aat" href="https://vocab.getty.edu/page/aat/${id}" target="_blank" rel="noopener" title="Getty AAT ${id}">${id}</a>` : ''; };
const kL=(k,max)=>{const l=kwLabel(k);return (max&&l.length>max)?l.slice(0,max)+'…':l;};
import { keywordIndex, keywordTexts } from '../data.js';

let KIDX = null;
let KTEXTS = null;   // {id: 설명+참여자+기관} — lazy-loaded on first in-list search
let _years = null;
const PER = 10;
const TYPE_ROUTE = { exh: 'exhibition', edu: 'program', cul: 'program', pro: 'program' };
const TYPE_LABEL_KO = { exh: '전시', edu: '교육', cul: '문화행사' };   // 3-way record type
const TYPE_LABEL_EN = { exh: 'Exhibition', edu: 'Education', cul: 'Culture' };
const tLabel = t => L(TYPE_LABEL_KO[t]||'', TYPE_LABEL_EN[t]||'');

const rec = k => (KIDX.index[k] || { n:0, y:{}, first:'', peak:'', g:[], co:[], p:[], inst:[], items:[], more:0 });
const dynOf = k => (KIDX.keywords.find(d => d.k === k) || {}).dyn || 0;
/* fixed 2005–2025 window: pre-2005 data is sparse and 2026 is still in progress (misleading) */
function years(){
  if(_years) return _years;
  _years = KIDX.years.filter(y => y >= 2005 && y <= 2025);
  return _years;
}

/* ---- small widgets ------------------------------------------------------ */
function wHead(k){
  const r = rec(k), d = dynOf(k), t = d > 0.15 ? L('상승','Rising') : d < -0.15 ? L('하락','Falling') : L('유지','Steady');
  return `<div class="kd-head">
    <div class="kd-head-l"><div class="kd-eyb">${isLocalCat(k)
      ? L('선택한 주제 · 자체 보완 분류 (GETTY AAT 외)','Selected theme · Local category (outside Getty AAT)')
      : L('선택한 주제 · GETTY AAT','Selected theme · Getty AAT') + aatLink(k)}</div><div class="kd-name">${isLocalCat(k)?'† ':''}${esc(kwLabel(k))}</div></div>
    <div class="kd-head-r">
      <div class="kd-head-stats">${L('총','Total')} <b>${r.n.toLocaleString()}</b>${L('건','')} · ${L('첫 등장','First')} <b>${r.first}</b> · ${L('정점','Peak')} <b>${r.peak}</b></div>
      <div class="kd-dyn kd-dyn-${t}">${L('최근 추세','Recent trend')} <b>${t}</b> <span>${d>0?'+':''}${d}</span></div>
    </div>
  </div>`;
}
function wTrend(k){
  const r = rec(k), ys = years(), max = Math.max(...ys.map(y => r.y[y]||0), 1);
  const bars = ys.map(y => { const c = r.y[y]||0, h = Math.round(3 + 50*(c/max));
    return `<span class="kd-tb${y==2020?' kc':''}" title="${y} · ${c}${L('건','')}"><i style="height:${h}px;background:${y==r.peak?'#534AB7':'#9a82ec'}"></i></span>`; }).join('');
  return wWrap(L('연도별 추이','Yearly trend'), `<div class="kd-trend">${bars}</div>
    <div class="kd-axis"><span>${ys[0]}</span><span>${ys[Math.floor(ys.length/2)]}</span><span>${ys[ys.length-1]}</span></div>`,
    L('해마다 이 주제가 몇 번 등장했는지 — 가장 진한 막대가 정점인 해입니다.','How often this theme appears each year — the darkest bar marks its peak year.'));
}
function wGenre(k){
  const g = rec(k).g;
  if(!g.length) return wWrap(L('분야 · 매체','Field · Medium'),
    `<div class="kd-empty-note">${L('이 주제가 붙은 항목에는 분야·매체(회화·사진·영상 등) 정보가 없습니다. 매체 정보는 전시 기록에만 있어, 프로그램 위주의 주제에서는 비어 있을 수 있습니다.','Items with this theme carry no field/medium data (painting, photography, video …). Medium is recorded only for exhibitions, so program-centric keywords may be empty.')}</div>`,
    L('이 주제를 다룬 전시·작품의 매체(회화·사진·영상 등) 구성입니다.','Medium composition (painting, photography, video …) of exhibitions and works on this theme.'));
  const max = g[0][1];
  const rows = g.map(([n,c]) => `<div class="kd-bar"><span class="kd-bar-l">${esc(n)}</span>
    <span class="kd-bar-t"><i style="width:${Math.round(100*c/max)}%"></i></span><span class="kd-bar-n">${c}</span></div>`).join('');
  return wWrap(L('분야 · 매체','Field · Medium'), rows, L('이 주제를 다룬 전시·작품의 매체(회화·사진·영상 등) 구성입니다.','Medium composition (painting, photography, video …) of exhibitions and works on this theme.'));
}
/* 연관 주제 + 동시출현 네트워크 = one widget: the cluster graph above, the clickable chip list below */
function wRelated(k){
  const co = rec(k).co; if(!co.length) return '';
  const top = co.slice(0,8);
  const cx=150, cy=94, R=74, maxc=top[0][1];
  const nodes = top.map(([c,n],i) => { const a = -Math.PI/2 + i*2*Math.PI/top.length;
    return {c, n, x: cx+R*Math.cos(a), y: cy+R*Math.sin(a), rr: 5+8*(n/maxc)}; });
  let inter = '';
  for(let i=0;i<nodes.length;i++){ const s = new Set((rec(nodes[i].c).co||[]).map(x=>x[0]));
    for(let j=i+1;j<nodes.length;j++) if(s.has(nodes[j].c))
      inter += `<line x1="${nodes[i].x.toFixed(1)}" y1="${nodes[i].y.toFixed(1)}" x2="${nodes[j].x.toFixed(1)}" y2="${nodes[j].y.toFixed(1)}" stroke="#c7bcee" stroke-width="0.8"/>`; }
  const spokes = nodes.map(o => `<line x1="${cx}" y1="${cy}" x2="${o.x.toFixed(1)}" y2="${o.y.toFixed(1)}" stroke="#9a82ec" stroke-width="1.3" opacity="0.5"/>`).join('');
  const dots = nodes.map(o => `<g class="kd-egn" data-k="${esc(o.c)}" style="cursor:pointer">
    <circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="${o.rr.toFixed(1)}" fill="#9a82ec"/>
    <text x="${o.x.toFixed(1)}" y="${(o.y+(o.y<cy?-o.rr-3:o.rr+10)).toFixed(1)}" text-anchor="middle" class="kd-egt">${esc(kL(o.c,7))}</text></g>`).join('');
  // left column = related keywords listed vertically; right column = the network diagram
  const list = `<div class="kd-rel-list">${co.map(([c,n]) =>
    `<button class="kd-co" data-k="${esc(c)}"><span>${esc(kwLabel(c))}</span><i>${n}</i></button>`).join('')}</div>`;
  const net = `<div class="kd-rel-net"><svg viewBox="0 -16 300 220" class="kd-ego">${inter}${spokes}${dots}
      <circle cx="${cx}" cy="${cy}" r="13" fill="#534AB7"/>
      <text x="${cx}" y="${cy+4}" text-anchor="middle" class="kd-egc">${esc(kL(k,5))}</text></svg></div>`;
  return wWrap(L('연관 주제 · 네트워크','Related topics · Network'),
    `<div class="kd-rel">${list}${net}</div>`,
    L('함께 자주 등장한 주제입니다. 왼쪽 목록을 누르면 그 주제로 이동하고, 오른쪽 그림은 그 무리 구조를 보여줍니다.','Topics that frequently co-occur. Click a topic on the left to jump to it; the diagram on the right shows the cluster structure.'), true);
}
/* items = [[id, name, count], ...]; if id is present, the row links to #/{route}/{id} */
function wList(label, items, tip, asTip, route){
  if(!items.length) return '';
  const rows = items.map(([id, n, c], i) => {
    const inner = `<span class="kd-rk">${i+1}</span><span class="kd-rn">${esc(n)}</span><span class="kd-rc">${c}</span>`;
    return (id && route)
      ? `<li><a class="kd-rl" href="#/${route}/${encodeURIComponent(id)}">${inner}</a></li>`
      : `<li class="kd-rl-off">${inner}</li>`;
  }).join('');
  return wWrap(label, `<ol class="kd-rank">${rows}</ol>`, tip, asTip);
}
function itemFiltered(k, iq, tfSet){
  let all = rec(k).items;
  if(tfSet && tfSet.size) all = all.filter(([id,t]) => tfSet.has(t));
  if(!iq) return all;
  const q = iq.toLowerCase();
  return all.filter(([id,t,ti,y,inst,tiEn]) => (ti||'').includes(iq)
    || (tiEn||'').toLowerCase().includes(q)                      // harvested English titles are searchable too
    || (KTEXTS && (KTEXTS[id]||'').includes(iq)));
}
/* the inner list + pager (re-rendered alone on search/page, so the search input keeps focus) */
function itemListHTML(el){
  const k = el.dataset.sel, iq = (el.dataset.iq||'').trim();
  const tf = (el.dataset.tf||'').split(',').filter(Boolean);
  const tfSet = tf.length ? new Set(tf) : null;
  const list = itemFiltered(k, iq, tfSet);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const page = Math.min(Math.max(0, +(el.dataset.ip||0)), pages-1);
  const rows = list.slice(page*PER, page*PER+PER).map(([id,t,ti,y,inst,tiEn]) =>
    `<a class="kd-ex" href="#/${TYPE_ROUTE[t]||'exhibition'}/${encodeURIComponent(id)}">
      <span class="kd-ex-y">${y||''}</span><span class="kd-ex-t">${esc(itemTitle(ti, tiEn) || L('(제목 없음)','(untitled)'))}</span>
      <span class="kd-ex-i">${esc(inst||tLabel(t)||'')}</span><span class="kd-ex-a">→</span></a>`).join('')
    || `<div class="kd-more">${iq||tf.length?L('조건에 맞는 항목이 없습니다.','No items match the filter.'):L('표시할 항목이 없습니다.','No items to show.')}</div>`;
  const filt = iq || tf.length;
  const cap = rec(k).more && !filt ? ` · ${L('최근','latest')} ${list.length}${L('건','')}${rec(k).more?` (+${rec(k).more} ${L('미포함','not shown')})`:''}` : '';
  const head = `<div class="kd-icount">${iq?`${L('검색','Search')} “${esc(iq)}” · `:''}${list.length.toLocaleString()}${L('건','')}${filt?'':cap}</div>`;
  const pager = pages>1 ? `<div class="kd-pager">
      <button class="kd-pg" data-ip="${page-1}"${page<=0?' disabled':''}>← ${L('이전','Prev')}</button>
      <span class="kd-pgn">${page+1} / ${pages}</span>
      <button class="kd-pg" data-ip="${page+1}"${page>=pages-1?' disabled':''}>${L('다음','Next')} →</button></div>` : '';
  return head + rows + pager;
}
function wItems(el){
  const r = rec(el.dataset.sel); if(!r.items.length) return '';
  const tf = new Set((el.dataset.tf||'').split(',').filter(Boolean));
  const tfbtns = Object.keys(TYPE_LABEL_KO).map(code =>
    `<button class="kd-tfb${tf.has(code)?' on':''}" data-tf="${code}">${tLabel(code)}</button>`).join('');
  return `<section class="kd-w kd-items-w">
    <h4 class="kd-wl">${L('이 주제의 전시 · 교육 · 문화행사','Exhibitions · Education · Culture on this topic')} (${r.n.toLocaleString()})</h4>
    <p class="kd-wdesc">${L('이 주제가 붙은 전시·교육·문화행사입니다. 유형으로 거르거나, 제목·설명·작가·기관으로 검색할 수 있습니다.','Exhibitions, education, and cultural events tagged with this theme. Filter by type, or search by title, description, participant, or organization.')}</p>
    <div class="kd-itools">
      <div class="kd-isearch"><input class="kd-isearch-in" type="search" placeholder="${L('제목·설명·작가·기관으로 이 목록 검색','Search this list by title, description, participant, organization')}" value="${esc(el.dataset.iq||'')}" aria-label="${L('목록 내 검색','Search within list')}"></div>
      <div class="kd-tf"><span class="kd-tf-lab">${L('유형','Type')}</span>${tfbtns}</div>
    </div>
    <div class="kd-itemlist">${itemListHTML(el)}</div>
  </section>`;
}
const HEAT_N = 20;   // top-20 keywords in the year×keyword heatmap
function wMonthly(el){
  const M = KIDX.monthly; if(!M) return '';
  const ys = Object.keys(M).filter(y => +y >= 2010 && +y <= 2025);
  if(!ys.length) return '';
  const cur = (el.dataset.kmYear && M[el.dataset.kmYear]) ? el.dataset.kmYear : ys[ys.length-1];
  const picker = ys.map(y => `<button class="kd-kmy${y===cur?' on':''}" data-y="${y}">${y}</button>`).join('');
  const yd = M[cur] || {};
  const maxTop = Math.max(1, ...Object.values(yd).map(a => (a[0] ? a[0][1] : 0)));
  // one ROW per month (12 rows) with the three places side by side — a 12-column strip squeezed the
  // names down to 'Cult…', so the axis is flipped and each place gets a full-width-ish cell.
  const rows = Array.from({length:12}, (_, i) => {
    const m = String(i+1), top = (yd[m] || []).slice(0,3);
    const label = L(`${i+1}월`, MON[i]);
    const cellsOf = top.map(([k,n], ri) =>
      `<button class="kd-mr kd-mr${ri+1}" data-k="${esc(k)}" title="${esc(kwLabel(k))} · ${n}${L('건','')}">
        <b class="kd-mrk">${ri+1}</b><span class="kd-mnm">${esc(kwLabel(k))}</span><i class="kd-mn">${n}</i>
      </button>`).join('');
    const pad = Array.from({length: 3 - top.length}, () => `<span class="kd-mr kd-mr-empty">—</span>`).join('');
    return `<div class="kd-mrow"><span class="kd-mm">${label}</span><div class="kd-mcells">${cellsOf}${pad}</div></div>`;
  }).join('');
  const cells = `<div class="kd-mhead"><span class="kd-mm"></span><div class="kd-mcells">
      <span class="kd-mh">${L('1위','1st')}</span><span class="kd-mh">${L('2위','2nd')}</span><span class="kd-mh">${L('3위','3rd')}</span>
    </div></div>${rows}`;
  return wWrap(L('월별 주제','Monthly themes'),
    `<div class="kd-km-years">${picker}</div><div class="kd-km-strip">${cells}</div>`,
    L('선택한 해의 달마다 가장 많이 등장한 주제입니다. 연도를 고르고, 주제를 누르면 그 주제로 대시보드가 바뀝니다.','The most frequent theme in each month of the selected year. Pick a year, then click a theme to switch the dashboard.'));
}
function wPick(el){
  const sort = el.dataset.sort || 'n', q = (el.dataset.q || '').trim();
  let list = KIDX.keywords;
  if(q) list = list.filter(d => d.k.includes(q) || kwLabel(d.k).toLowerCase().includes(q.toLowerCase()));
  if(sort === 'dyn') list = [...list].sort((a,b) => b.dyn - a.dyn);
  const maxN = KIDX.keywords[0].n;
  // each keyword is a rounded block; both its SIZE (font) and BLOCK COLOUR deepen with frequency
  const chips = list.slice(0,52).map(d => { const t = Math.sqrt(d.n/maxN);
    const sz = (12.5 + 13*t).toFixed(1);          // bigger for more frequent
    const a  = (0.05 + 0.42*t).toFixed(3);        // darker purple block for more frequent
    const on = d.k === el.dataset.sel;
    return `<button class="kd-cl${on?' on':''}" data-k="${esc(d.k)}" style="font-size:${sz}px${on?'':`;background:rgba(83,74,183,${a})`}">${isLocalCat(d.k)?'† ':''}${esc(kwLabel(d.k))}<sup>${d.n}</sup></button>`;
  }).join('') || `<span class="kd-empty">${L('일치하는 주제가 없습니다','No matching themes')}</span>`;
  return `<div class="kd-pick">
    <div class="kd-pickbar">
      <input class="kd-search" type="search" placeholder="${L('주제 검색','Search themes')} · ${KIDX.keywords.length}" value="${esc(q)}" aria-label="${L('주제 검색','Search themes')}">
      <div class="kd-sort"><button class="kd-sortb${sort==='n'?' on':''}" data-sort="n">${L('빈도순','By frequency')}</button><button class="kd-sortb${sort==='dyn'?' on':''}" data-sort="dyn">${L('상승순','By momentum')}</button></div>
    </div>
    <div class="kd-cloud">${chips}</div>
    <div class="kd-hint">${L('크기 = 빈도 · 클릭하면 아래가 그 주제로 바뀝니다','Size = frequency · click to switch the dashboard below')}</div>
  </div>`;
}
/* widget shell. Default: one-line description UNDER the title. asTip=true: description in a
   hover tooltip on an ⓘ next to the title (used by the compact 연관 주제·대표 작가·대표 기관 widgets). */
const wWrap = (label, body, tip, asTip) => `<section class="kd-w"><h4 class="kd-wl">${esc(label)}${asTip&&tip?` <span class="kd-tip" data-tip="${esc(tip)}" tabindex="0">ⓘ</span>`:''}</h4>${tip&&!asTip?`<p class="kd-wdesc">${esc(tip)}</p>`:''}${body}</section>`;

/* ---- layouts ------------------------------------------------------------ */
/* single-screen report layout. 연관 주제(목록+네트워크)와 대표 작가·기관 top5를 한 줄로 컴팩트하게 묶는다 */
function layout(el){
  const k = el.dataset.sel;
  return wPick(el) +
    `<div class="kd-focus">${wHead(k)}
      <div class="kd-row2">${wTrend(k)}${wGenre(k)}</div>
      <div class="kd-cmprow">${wRelated(k)}
        <div class="kd-cmpside">${wList(L('대표 작가','Top participants'), rec(k).p.slice(0,5), L('이 주제에 가장 많이 참여한 작가 top 5입니다. 이름을 누르면 그 작가 페이지로 이동합니다.','Top 5 participants most involved with this theme. Click a name to open their page.'), true, 'participant')}${wList(L('대표 기관','Top organizations'), rec(k).inst.slice(0,5), L('이 주제를 가장 많이 다룬 기관 top 5입니다. 이름을 누르면 그 기관 페이지로 이동합니다.','Top 5 organizations that addressed this theme most. Click a name to open its page.'), true, 'organization')}</div>
      </div>
      ${wItems(el)}</div>
    <div class="kd-over"><div class="kd-over-h">${L('전체 보기','Overview')}</div>
      ${wMonthly(el)}</div>`;
}
function render(el){
  el.innerHTML = layout(el);
}

/* ---- public ------------------------------------------------------------- */
export function keywordDashHTML(){
  return `<div class="kdash" data-sort="n" data-q=""><div class="kd-loading">${L('주제 인덱스를 불러오는 중…','Loading theme index…')}</div></div>`;
}
export async function wireKeywordDash(root){
  const el = root && root.querySelector('.kdash'); if(!el) return;
  try { KIDX = KIDX || await keywordIndex(); }
  catch(e){ el.innerHTML = `<div class="kd-loading">${L('주제 인덱스를 불러오지 못했습니다.','Could not load the theme index.')}</div>`; return; }
  if(!KIDX.keywords || !KIDX.keywords.length){ el.innerHTML = `<div class="kd-loading">${L('주제 데이터가 없습니다.','No theme data.')}</div>`; return; }
  el.dataset.sel = el.dataset.sel || KIDX.keywords[0].k;
  render(el);
  const refreshItems = () => { const wrap = el.querySelector('.kd-itemlist'); if(wrap) wrap.innerHTML = itemListHTML(el); };
  el.addEventListener('click', e => {
    const pg = e.target.closest('.kd-pg');
    if(pg && !pg.disabled){ el.dataset.ip = pg.dataset.ip; refreshItems(); return; }   // paginate the item list only
    const tfb = e.target.closest('.kd-tfb');                                            // 유형 필터 토글 (전시/교육/문화행사)
    if(tfb){ const c = tfb.dataset.tf, cur = new Set((el.dataset.tf||'').split(',').filter(Boolean));
      cur.has(c) ? cur.delete(c) : cur.add(c); el.dataset.tf = [...cur].join(','); el.dataset.ip = 0;
      tfb.classList.toggle('on', cur.has(c)); refreshItems(); return; }
    const kmy = e.target.closest('.kd-kmy');                                            // 월별 주제 연도 선택
    if(kmy){ el.dataset.kmYear = kmy.dataset.y; render(el); return; }
    const pick = e.target.closest('[data-k]');
    if(pick && !pick.classList.contains('kd-ex')){ el.dataset.sel = pick.dataset.k; el.dataset.iq = ''; el.dataset.ip = 0; el.dataset.tf = ''; render(el);
      el.querySelector('.kd-focus,.kd-grid')?.scrollIntoView({behavior:'smooth', block:'nearest'}); return; }
    const sortb = e.target.closest('.kd-sortb'); if(sortb){ el.dataset.sort = sortb.dataset.sort; render(el); return; }
  });
  el.addEventListener('input', e => {
    if(e.target.classList.contains('kd-search')){            // keyword cloud filter
      el.dataset.q = e.target.value;
      const cloud = el.querySelector('.kd-cloud');
      if(cloud){ const tmp = document.createElement('div'); tmp.innerHTML = wPick(el); cloud.innerHTML = tmp.querySelector('.kd-cloud').innerHTML; }
      return;
    }
    if(e.target.classList.contains('kd-isearch-in')){        // search WITHIN the selected keyword's items (title + 설명)
      el.dataset.iq = e.target.value; el.dataset.ip = 0;
      refreshItems();
      if(KTEXTS === null && e.target.value.trim()){          // lazy-load the description text once, then re-filter
        KTEXTS = {}; keywordTexts().then(t => { KTEXTS = t; refreshItems(); }).catch(()=>{});
      }
    }
  });
}
