/* ============================================================
   search.js — global search across all entities (search.json)
   ============================================================ */
import { searchIndex } from '../data.js';
import { th, thName, esc, num, setCrumb } from '../ui.js';
import { mount } from '../app.js';
import { L } from '../i18n.js';

let INDEX = null;        // [{t,id,n,s, nl, sl}]
const TYPES = ['exhibition','program','opencall','participant','work','organization','venue'];
const PER_GROUP = 12;

async function ensureIndex(){
  if(INDEX) return INDEX;
  const raw = await searchIndex();
  INDEX = raw.map(r=>({ ...r, nl:(r.n||'').toLowerCase(), sl:(r.s||'').toLowerCase(), kl:(r.k||'').toLowerCase() }));
  return INDEX;
}

export async function searchView(query){
  setCrumb(L('검색', 'Search'));
  const q0 = query.q || '';
  const tf = query.t || '';   // type filter
  mount(`
    ${headerHTML()}
    <div class="search-wrap">
      <div class="search-box">
        <span class="sb-ico">⌕</span>
        <input id="searchInput" type="search" placeholder="${esc(L('아카이브 전체 검색 — 참여자, 작품, 전시, 프로그램, 공모…', 'Search the whole archive — participants, works, exhibitions, programs, open calls…'))}" value="${esc(q0)}" autocomplete="off" spellcheck="false">
        <button class="sb-clear" id="sbClear" ${q0?'':'hidden'}>✕</button>
      </div>
      <div class="search-hint mono" id="searchHint"></div>
      <div class="type-tabs" id="typeTabs"></div>
      <div id="searchResults" class="search-results"></div>
    </div>`);

  const input = document.getElementById('searchInput');
  const clear = document.getElementById('sbClear');
  await ensureIndex();

  let curType = tf;
  const run = (q)=>{ renderResults(q, curType); };

  let tmr;
  input.addEventListener('input', ()=>{
    clear.hidden = !input.value;
    clearTimeout(tmr); tmr = setTimeout(()=>{ syncHash(input.value, curType); run(input.value); }, 200);
  });
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const a=document.querySelector('.search-results .rescard'); if(a) location.hash=a.getAttribute('href'); }});
  clear.addEventListener('click', ()=>{ input.value=''; clear.hidden=true; syncHash('',curType); run(''); input.focus(); });
  document.getElementById('typeTabs').addEventListener('click', e=>{
    const b = e.target.closest('[data-type]'); if(!b) return;
    curType = b.dataset.type; syncHash(input.value, curType); run(input.value);
  });

  run(q0);
  if(!q0) input.focus();
}

function headerHTML(){
  return `<div class="phead">
    <div class="phead-l">
      <div class="tab-v" style="color:var(--purple)">${L('찾기 · 검색', 'FIND · SEARCH')}</div>
      <div><div class="scope">${L('전체 컬렉션 통합 검색', 'Unified search across the full collection')}</div><h1>${L('검색', 'Search')}</h1></div>
    </div>
    <div class="phead-r"><a class="pill" href="#/">${L('↑ 입구', '↑ Entrance')}</a></div>
  </div>`;
}

function score(rec, q){
  if(rec.nl.startsWith(q)) return 0;
  if(rec.nl.includes(' '+q) || rec.sl.startsWith(q)) return 1;
  if(rec.nl.includes(q)) return 2;
  if(rec.sl.includes(q)) return 3;
  if(rec.kl && rec.kl.includes(q)) return 4;   // matches a theme keyword
  if((rec.id||'').toLowerCase().includes(q)) return 5;
  return 99;
}

function search(q){
  q = q.trim().toLowerCase();
  if(!q) return null;
  const out = [];
  for(const rec of INDEX){
    const s = score(rec, q);
    if(s<99) out.push({rec, s});
  }
  out.sort((a,b)=> a.s-b.s || a.rec.nl.length-b.rec.nl.length);
  return out;
}

function renderResults(q, typeFilter){
  const box = document.getElementById('searchResults');
  const tabs = document.getElementById('typeTabs');
  const hint = document.getElementById('searchHint');
  const res = search(q);

  if(res===null){
    tabs.innerHTML=''; hint.textContent='';
    box.innerHTML = emptyState();
    return;
  }
  // counts per type
  const counts = {}; let total=0;
  for(const {rec} of res){ counts[rec.t]=(counts[rec.t]||0)+1; total++; }
  hint.textContent = L(`“${q}” 검색결과 ${num(total)}건`, `${num(total)} results for “${q}”`);

  // type tabs
  tabs.innerHTML = `<button class="ttab ${!typeFilter?'on':''}" data-type="">${L('전체','All')} <i>${num(total)}</i></button>` +
    TYPES.filter(t=>counts[t]).map(t=>`<button class="ttab ${typeFilter===t?'on':''}" data-type="${t}" style="--accent:${th(t).accent}">${thName(t)} <i>${num(counts[t])}</i></button>`).join('');

  if(!total){ box.innerHTML = `<div class="empty">${L(`“${esc(q)}”에 해당하는 레코드가 없습니다.`, `No records match “${esc(q)}”.`)}</div>`; return; }

  if(typeFilter){
    const list = res.filter(r=>r.rec.t===typeFilter).slice(0,300);
    box.innerHTML = `<div class="res-group"><div class="resgrid">${list.map(r=>resCard(r.rec)).join('')}</div>
      ${counts[typeFilter]>300?`<div class="lm-stat mono">${L(`${num(counts[typeFilter])}건 중 처음 300건 표시`, `Showing first 300 of ${num(counts[typeFilter])}`)}</div>`:''}</div>`;
  } else {
    let html='';
    for(const t of TYPES){
      const list = res.filter(r=>r.rec.t===t);
      if(!list.length) continue;
      const shown = list.slice(0,PER_GROUP);
      html += `<div class="res-group">
        <div class="resg-h"><span style="color:${th(t).accent}">${thName(t)}</span><em>${num(list.length)}</em>
          ${list.length>PER_GROUP?`<button class="pill sm" data-type="${t}" style="margin-left:auto">${L(`전체 ${num(list.length)}건 보기 →`, `View all ${num(list.length)} →`)}</button>`:''}</div>
        <div class="resgrid">${shown.map(r=>resCard(r.rec)).join('')}</div>
      </div>`;
    }
    box.innerHTML = html;
  }
}

function resCard(rec){
  const t = th(rec.t);
  return `<a class="rescard" href="#/${rec.t}/${encodeURIComponent(rec.id)}" style="--accent:${t.accent}">
    <span class="rc-type">${t.code}</span>
    <span class="rc-main"><b>${esc(rec.n)}</b>${rec.s?`<i>${esc(rec.s)}</i>`:''}</span>
    <span class="rc-arrow">→</span>
  </a>`;
}

function emptyState(){
  const suggest = [
    ['김창열','participant'],['미디어아트','theme'],['난지','residency'],['MMCA','institution'],['공모','open call'],['아카이브','archive']
  ];
  return `<div class="search-empty">
    <p class="se-lead">${L(`아카이브의 모든 전시·프로그램·공모·참여자·작품·기관·장소 <b>${num(37826)}</b>건을 검색합니다. 주제 키워드도 검색됩니다.`, `Search all <b>${num(37826)}</b> exhibitions, programs, open calls, participants, works, organizations and venues in the archive. Theme keywords are searched too.`)}</p>
    <div class="se-suggest"><span class="mono">${L('예시', 'TRY')}</span>${suggest.map(s=>`<button class="pill sm" data-suggest="${esc(s[0])}">${esc(s[0])}</button>`).join('')}</div>
  </div>`;
}

function syncHash(q, t){
  const p = {}; if(q) p.q=q; if(t) p.t=t;
  const qs = new URLSearchParams(p).toString();
  history.replaceState(null,'', '#/search'+(qs?`?${qs}`:''));
}

/* delegate suggestion clicks (since emptyState is re-rendered) */
document.addEventListener('click', e=>{
  const s = e.target.closest('[data-suggest]');
  if(s){ const inp=document.getElementById('searchInput'); if(inp){ inp.value=s.dataset.suggest; inp.dispatchEvent(new Event('input')); inp.focus(); } }
});
