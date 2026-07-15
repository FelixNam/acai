/* ============================================================
   network.js — interactive ego-network explorer
   Follow the relationship graph from any record.
   ============================================================ */
import { record, relationsFor, entity, ID_FIELD } from '../data.js';
import { th, esc, num, titleOf, subOf, setCrumb, thName } from '../ui.js';
import { mount } from '../app.js';
import { L } from '../i18n.js';

const app = document.getElementById('app');
const MAX_NEIGHBORS = 40;

export async function networkView(query){
  setCrumb(L('관계망','Network'));
  if(!query.id || !query.type){ return landing(); }
  return graph(query.type, query.id);
}

/* ---------- landing: choose a starting point ---------- */
async function landing(){
  mount(`
    <div class="phead"><div class="phead-l"><div class="tab-v" style="color:var(--purple-2)">${L('연결 · 관계망', 'Connections · Network')}</div>
      <div><div class="scope">${L('관계 그래프 — 연결을 따라가기', 'Relationship graph — follow the connections')}</div><h1>${L('관계망 따라가기', 'Follow the network')}</h1></div></div>
      <div class="phead-r"><a class="pill" href="#/">${L('↑ 입구', '↑ Entrance')}</a></div></div>
    <p class="about-p" style="max-width:64ch">${L('아무 레코드나 고르면 ACAI가 그 주변의 직접적인 연결망 — 참여자·작품·장소·기관·행사 — 을 그려줍니다. 노드를 누르면 그 레코드의 이웃으로 이동합니다.', 'Pick any record and ACAI draws its immediate network — participants, works, venues, organizations, events. Click a node to move to that record\'s neighbors.')}</p>
    <div class="nw-seedwrap"><div class="nw-seed-h mono">${L('연결이 많은 레코드부터 시작하기', 'Start from the most connected records')}</div>
      <div class="nw-seeds" id="nwSeeds"><span class="loading-line">${L('허브 수집 중…', 'Gathering hubs…')}</span></div></div>`);

  const [par, exh, org] = await Promise.all([entity('participant'), entity('exhibition'), entity('organization')]);
  const pick = (store, type, n) => store.list
      .map(r=>({type, id:r[ID_FIELD[type]], r, w:sum(r._c)}))
      .sort((a,b)=>b.w-a.w).slice(0,n);
  const seeds = [...pick(par,'participant',6), ...pick(exh,'exhibition',5), ...pick(org,'organization',5)]
      .sort((a,b)=>b.w-a.w);
  document.getElementById('nwSeeds').innerHTML = seeds.map(s=>`
    <a class="nw-seed" href="#/network?type=${s.type}&id=${encodeURIComponent(s.id)}" style="--accent:${th(s.type).accent}">
      <span class="nw-seed-code">${th(s.type).code}</span>
      <span class="nw-seed-body"><b>${esc(titleOf(s.type,s.r))}</b><i>${esc(subOf(s.type,s.r))}</i></span>
      <span class="nw-seed-w">${L(`연결 ${num(s.w)}`, `${num(s.w)} links`)}</span>
    </a>`).join('');
}
const sum = c => Object.values(c||{}).reduce((a,b)=>a+(b||0),0);

/* ---------- graph: ego network of one node ---------- */
async function graph(type, id){
  mount(`<a class="pill dt-back" href="#/network">${L('← 전체 허브', '← All hubs')}</a><div class="nw-loading"><span class="spin"></span></div>`);
  const [rec, rel] = await Promise.all([record(type,id), relationsFor(type,id)]);
  if(!rec){ mount(`<div class="empty">${L('레코드를 찾을 수 없습니다.', 'Record not found.')} <a class="pill" href="#/network">${L('← 관계망', '← Network')}</a></div>`); return; }

  // flatten neighbors
  let neighbors = [];
  for(const [group, arr] of Object.entries(rel)){
    if(!Array.isArray(arr)) continue;
    for(const x of arr){
      if(group==='related'){
        if(x.rec) neighbors.push({type:x.otherType, rec:x.rec, role:'related'});
      } else if(x.rec){
        neighbors.push({type:x.type, rec:x.rec, role:x.role||group});
      }
    }
  }
  // dedup by type+id, rank by their own connectivity, cap
  const seen=new Set();
  neighbors = neighbors.filter(n=>{ const k=n.type+n.rec[ID_FIELD[n.type]]; if(seen.has(k))return false; seen.add(k); return true; });
  neighbors.sort((a,b)=>sum(b.rec._c)-sum(a.rec._c));
  const totalN = neighbors.length;
  neighbors = neighbors.slice(0, MAX_NEIGHBORS);

  const t = th(type);
  const svg = buildSVG(type, rec, neighbors);
  const legendTypes = [...new Set(neighbors.map(n=>n.type))];
  const legend = legendTypes.map(tp=>`<span class="nw-leg"><span class="nw-dot" style="background:${th(tp).accent}"></span>${thName(tp)}</span>`).join('');

  mount(`
    <a class="pill dt-back" href="#/network">${L('← 전체 허브', '← All hubs')}</a>
    <div class="nw-head" style="--accent:${t.accent}">
      <div class="nw-focusinfo">
        <div class="mono nw-kick">${thName(type)} · ${t.label} · ${L('중심', 'Focus')}</div>
        <h1 class="nw-title">${esc(titleOf(type,rec))}</h1>
        <div class="nw-meta">${esc(subOf(type,rec))} · ${L(`직접 연결 <b>${num(totalN)}</b>건${totalN>MAX_NEIGHBORS?` · 상위 ${MAX_NEIGHBORS}건 표시`:''}`, `<b>${num(totalN)}</b> direct connections${totalN>MAX_NEIGHBORS?` · showing top ${MAX_NEIGHBORS}`:''}`)}</div>
        <a class="pill sm solid" href="#/${type}/${encodeURIComponent(id)}">${L('전체 레코드 보기 →', 'View full record →')}</a>
      </div>
      <div class="nw-legend">${legend}</div>
    </div>
    <div class="nw-stage">${svg}</div>
    <p class="nw-hint mono">${L('노드를 누르면 그래프 중심이 바뀌고 · 가운데를 누르면 해당 레코드가 열립니다', 'Click a node to re-center the graph · click the center to open that record')}</p>`);

  wireGraph(type, id);
}

function buildSVG(type, rec, neighbors){
  const W=1000, H=680, cx=W/2, cy=H/2;
  const t = th(type);
  // place neighbors on rings grouped by type
  const groups = {};
  neighbors.forEach(n=>{ (groups[n.type]=groups[n.type]||[]).push(n); });
  const ordered=[]; Object.keys(groups).forEach(tp=>groups[tp].forEach(n=>ordered.push(n)));
  const N=ordered.length;
  // two rings if many
  const r1 = 210, r2 = 320;
  let edges='', nodes='';
  ordered.forEach((n,i)=>{
    const ring = (N>20 && i%2) ? r2 : r1;
    const ang = (i/N)*Math.PI*2 - Math.PI/2;
    const x = cx + Math.cos(ang)*ring, y = cy + Math.sin(ang)*ring*0.84;
    const a = th(n.type).accent;
    const rad = 7 + Math.min(13, Math.log2(sum(n.rec._c)+1)*1.7);
    const nid = n.rec[ID_FIELD[n.type]];
    const label = clip(titleOf(n.type,n.rec), 16);
    edges += `<line class="nw-edge" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${a}"/>`;
    nodes += `<g class="nw-node" data-type="${n.type}" data-id="${esc(nid)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" style="--accent:${a}">
      <circle r="${rad.toFixed(1)}" fill="${a}"/>
      <text class="nw-nlabel" x="0" y="${(rad+13).toFixed(1)}">${esc(label)}</text>
      <text class="nw-nrole" x="0" y="${(rad+24).toFixed(1)}">${esc(String(n.role||'').slice(0,14))}</text>
    </g>`;
  });
  const centerLabel = clip(titleOf(type,rec), 20);
  const center = `<g class="nw-center" data-type="${type}" data-id="${esc(rec[ID_FIELD[type]])}" transform="translate(${cx},${cy})" style="--accent:${t.accent}">
      <circle r="40" fill="${t.accent}"/><circle r="40" class="nw-pulse" fill="none" stroke="${t.accent}"/>
      <text class="nw-clabel" y="4">${esc(centerLabel)}</text>
    </g>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="nw-svg" preserveAspectRatio="xMidYMid meet"><g class="nw-edges">${edges}</g>${nodes}${center}</svg>`;
}
const clip = (s,n)=> s&&s.length>n ? s.slice(0,n-1)+'…' : (s||'');

function wireGraph(type, id){
  app.querySelectorAll('.nw-node').forEach(g=>{
    g.addEventListener('click', ()=>{ location.hash=`#/network?type=${g.dataset.type}&id=${encodeURIComponent(g.dataset.id)}`; });
  });
  const c = app.querySelector('.nw-center');
  if(c) c.addEventListener('click', ()=>{ location.hash=`#/${c.dataset.type}/${encodeURIComponent(c.dataset.id)}`; });
}
