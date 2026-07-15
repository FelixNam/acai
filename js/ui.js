/* ============================================================
   ui.js — shared rendering atoms & helpers
   ============================================================ */

import { L, D, getLang } from './i18n.js';
export const esc = s => (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num = n => (n==null||isNaN(n)) ? '' : Number(n).toLocaleString('en-US');

/* açaí-cluster mark; pass fills to recolor */
export function logoSVG({leaf='#3E8E4F', berry='#5B3BA6', mid='#6A4BC0'}={}){
  return `<svg viewBox="0 0 140 128" xmlns="http://www.w3.org/2000/svg">
    <g class="lf">
      <path d="M58,63 C24,58 2,78 5,108 C34,106 56,90 62,69 Z" fill="${leaf}"/>
      <g transform="translate(140,0) scale(-1,1)"><path d="M58,63 C24,58 2,78 5,108 C34,106 56,90 62,69 Z" fill="${leaf}"/></g>
    </g>
    <circle cx="44" cy="48" r="31" fill="${berry}"/><circle cx="96" cy="48" r="31" fill="${berry}"/><circle cx="70" cy="84" r="33" fill="${mid}"/>
  </svg>`;
}
export function paintLogos(root=document){
  root.querySelectorAll('[data-logo]').forEach(el=>{
    if(el.dataset.painted) return; el.dataset.painted='1';
    const v = el.dataset.logo;
    el.innerHTML = v==='mono' ? logoSVG({leaf:'currentColor',berry:'currentColor',mid:'currentColor'})
                 : v==='white'? logoSVG({leaf:'#C9BCF8',berry:'#fff',mid:'#fff'})
                 : logoSVG();
  });
}

/* per-entity theme: accent, English + Korean labels, code, route */
export const THEME = {
  exhibition:  {accent:'#5b3ba6', label:'EXHIBITION', kr:'전시',     code:'EXH', kind:'event'},
  program:     {accent:'#9a82ec', label:'PROGRAM',    kr:'프로그램', code:'PRO', kind:'event'},
  opencall:    {accent:'#2c7a3f', label:'OPEN CALL',  kr:'공모',     code:'OPN', kind:'event'},
  participant: {accent:'#6a4bc0', label:'PARTICIPANT', kr:'인물',    code:'PART',kind:'resource'},
  work:        {accent:'#4a2c6b', label:'WORK',       kr:'작품',     code:'WORK',kind:'resource'},
  organization:{accent:'#3a3326', label:'ORGANIZATION',kr:'기관',    code:'ORG', kind:'resource'},
  venue:       {accent:'#3e8e4f', label:'VENUE',      kr:'장소',     code:'VEN', kind:'resource'},
};
export const th = t => THEME[t] || {accent:'#5b3ba6', label:String(t||'').toUpperCase(), kr:'', code:'?', kind:'event'};
/* localized type name: EN → uppercase wordmark label, KO → 한글 */
export const thName = t => { const x = th(t); return L(x.kr || x.label, x.label); };

/* AAT category values are stored bilingually as "한국어 (english gloss)".
   Show the Korean side in KO mode, the English gloss in EN mode (depth-aware,
   keeps Korean-only parens); falls back to the other side when one is absent. */
export function glossKO(s){
  s = String(s).trim();
  for(let i=0;i<4;i++){
    if(!s.endsWith(')')) break;
    let depth=0, j=s.length-1;
    while(j>=0){ const ch=s[j]; if(ch===')')depth++; else if(ch==='(')depth--; if(depth===0)break; j--; }
    if(j<=0) break;
    if(/[A-Za-z]/.test(s.slice(j+1,-1))) s = s.slice(0,j).trim(); else break;
  }
  return s;
}
/* Korean-only disambiguation parentheticals carried by some AAT values
   ("영향 (창의적 개념) (influence)") — the English gloss alone ("influence") drops them,
   so translate and re-attach so EN mirrors KO ("influence (creative concept)"). */
const AAT_DISAMB = {
  '개념':'concept','문화 관련 개념':'culture-related concept','창의적 개념':'creative concept',
  '창의 개념':'creative concept','창작 개념':'creative concept','예술 개념':'artistic concept',
  '미술 개념':'art concept','형식 개념':'formal concept','미적 개념':'aesthetic concept',
  '환경 개념':'environmental concept','시각 개념':'visual concept','종교 개념':'religious concept',
  '철학 개념':'philosophical concept','목록 기술 개념':'cataloguing concept','철학':'philosophy',
  '예술 표현':'artistic expression','표현 형식':'form of expression','예술 유형':'art form',
  '장르':'genre','영화 장르':'film genre','문학 장르':'literary genre','공연 예술':'performing arts',
  '공연 예술 장르':'performing-arts genre','색채 속성':'color attribute','교훈적 이야기':'didactic tale',
  '음식 생활':'dietary life','해석':'interpretation','자세':'posture','아이러니':'irony',
};
export function glossEN(s){
  s = String(s).trim();
  const ko = glossKO(s);
  if(ko === s) return s;                          // no English gloss present → keep as-is
  let en = s.slice(ko.length).trim();             // " (english gloss)"
  if(en.startsWith('(') && en.endsWith(')')) en = en.slice(1,-1).trim();
  if(!en) return ko;
  if(!en.includes('(')){                          // EN gloss carries no disambiguation of its own
    const dm = ko.match(/\(([^()]+)\)\s*$/);       // …but KO does: re-attach a translated copy
    if(dm){ const t = AAT_DISAMB[dm[1].trim()]; if(t && t.toLowerCase() !== en.toLowerCase()) en += ` (${t})`; }
  }
  return en;
}
export const glossLabel = s => getLang()==='en' ? glossEN(s) : glossKO(s);

export const titleOf = (t, r) => {
  if(!r) return '';
  if(t==='work') return D(r.title_ko, r.title_en) || r.title_ko || r.title_en || r.work_id;
  if(t==='participant') return D(r.name_kr, r.name_en) || r.name_kr || r.name_en || r.participant_id;
  if(t==='organization') return D(r.name_kr, r.name_en) || r.name_kr || r.name_en || r.organization_id;
  if(t==='venue') return [r.institution, r.building, r.floor, r.room].filter(Boolean).join(' ') || r.venue_id;
  return D(r.title, r.title_en) || r.title || r[`${t}_id`] || '';
};
export const subOf = (t, r) => {
  if(!r) return '';
  const en = getLang()==='en';
  if(t==='work') return (en ? r.title_ko : r.title_en) || r.year_created_text || '';
  if(t==='participant') return (en ? r.name_kr : r.name_en) || (r.birth_year? (en?`b. ${r.birth_year}`:`${r.birth_year}년생`):'') || '';
  if(t==='organization') return (en ? r.name_kr : r.name_en) || '';
  if(t==='exhibition') return `${(r.source_system||'').toUpperCase()} · ${r.year||''}`;
  if(t==='program') return `${L(({education:'교육',culture:'문화'})[r.program_type]||r.program_type||'', ({education:'Education',culture:'Culture'})[r.program_type]||r.program_type||'')} · ${r.year||''}`;
  if(t==='opencall') return `${r.region||''} · ${r.year||''}`;
  if(t==='venue') return r.address || '';
  return '';
};

/* date helpers */
export const fmtDate = d => { if(!d) return ''; const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m? `${m[1]}.${m[2]}.${m[3]}` : String(d); };
export const fmtRange = (a,b) => { a=fmtDate(a); b=fmtDate(b); return a&&b? (a===b?a:`${a} – ${b}`) : (a||b||''); };

/* thumbnail: real image for exhibitions, else geometric placeholder */
export function thumbHTML(t, r, {shape='square'}={}){
  if(r && r.thumb){
    return `<div class="thumb ${shape}"><img loading="lazy" src="${esc(r.thumb)}" alt=""></div>`;
  }
  const a = th(t).accent;
  const initials = initialsOf(t, r);
  return `<div class="thumb ${shape} ph" style="--ph:${a}">
    <span class="ph-mark">${logoSVG({leaf:a,berry:a,mid:a})}</span>
    <span class="ph-init">${esc(initials)}</span>
  </div>`;
}
function initialsOf(t, r){
  const s = subOf(t,r) || titleOf(t,r) || th(t).code;
  const en = (t==='participant'||t==='organization') ? (r&&r.name_en) : (t==='work'&&r&&r.title_en);
  if(en) return en.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return th(t).code.slice(0,3);
}

/* barcode / stub strip */
export const barcode = (cls='') => `<div class="barcode ${cls}"></div>`;
export const stubNo = (label, n) => `<div class="stub"><div class="barcode-v"></div><div class="stub-txt"><b>${esc(label)}</b><span>${esc(n)}</span></div></div>`;

/* a small QR-ish block (decorative, deterministic from id) */
export function qr(id, size=46){
  let h=0; const s=String(id||'ACAI'); for(let i=0;i<s.length;i++) h=(Math.imul(h,131)+s.charCodeAt(i))>>>0;
  const N=7; let cells='';
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){ h=(Math.imul(h,1103515245)+12345)>>>0; const on=((h>>>16)&1)|((x<2&&y<2)?1:0)|((x>N-3&&y<2)?1:0)|((x<2&&y>N-3)?1:0); if(on) cells+=`<rect x="${x}" y="${y}" width="1" height="1"/>`; }
  return `<svg class="qr" viewBox="0 0 ${N} ${N}" width="${size}" height="${size}" shape-rendering="crispEdges">${cells}</svg>`;
}

/* role translation (event_role / org role) KO label kept, EN hint added */
const ROLE_EN = {'참여작가':'artist','작가':'artist','큐레이터':'curator','퍼포머':'performer','교수':'professor','디렉터':'director','기증':'donation','기증자':'donor','주최':'host','주관':'organizer','후원':'patron','협찬':'sponsor','협력':'partner','참여':'participant','강사':'instructor','연구원':'researcher','대표':'representative','학예연구사':'curator','미술평론가':'critic'};
export const roleHint = r => r && ROLE_EN[r] ? `${r}` : (r||'');

/* nav link active state */
export function setCrumb(text){ const c=document.getElementById('crumb'); if(c) c.textContent=text; }

/* ---- 8-bit pixel burst: little squares that pop + fall from a screen point (button clicks) ---- */
const BURST_COLORS = ['#5b3ba6','#3e8e4f','#e0a33d','#9a82ec','#241c33','#6a4bc0'];
export function pixelBurst(cx, cy){
  const wrap = document.createElement('div');
  wrap.className = 'px-burst';
  wrap.style.left = cx + 'px'; wrap.style.top = cy + 'px';
  const N = 12; let h = '';
  for(let i=0;i<N;i++){
    const ang = (i / N) * Math.PI * 2 + Math.random() * 0.6;
    const dist = 16 + Math.random() * 36;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 12;
    const sz = 3 + (i % 3);
    h += `<span class="px-dot" style="width:${sz}px;height:${sz}px;background:${BURST_COLORS[i%BURST_COLORS.length]};`
       + `--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;animation-delay:${Math.round(Math.random()*70)}ms"></span>`;
  }
  wrap.innerHTML = h;
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 820);
}
