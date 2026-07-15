/* ============================================================
   browse.js — facet screens + generic listing engine
   ============================================================ */
import { meta, entity, facetFilter, ID_FIELD, keywordTexts } from '../data.js';
import { th, esc, num, thumbHTML, titleOf, subOf, fmtRange, setCrumb, thName, glossLabel, glossKO } from '../ui.js';
import { kwLabel } from '../i18n.js';
import { mount } from '../app.js';
import { L, D, vlabel, isEN, MEDIUM_EN, SERIES_EN, isLocalCat } from '../i18n.js';

/* lazy bulk description map {id: 설명} for deep in-list search — loaded once on first text query */
let _KTEXTS = null;
/* a cached lowercase searchable blob per record: title + sub + ID + field/genre + 기관(institutions)
   + keywords + aat + 설명 미리보기 + organizer/venue/artist…  (the listing filter searches ALL of these,
   not just 제목·연도). NOTE: the record ID is included so e.g. "EXH_0181" matches — handy in dev,
   drop this line before release if id-search is unwanted. */
function searchBlob(type, r){
  if(r.__sb != null) return r.__sb;
  const arr = a => Array.isArray(a) ? a.join(' ') : '';
  const v = [ titleOf(type,r), subOf(type,r), r[ID_FIELD[type]],
    r.exhibition_field, r.exhibition_genre, r.field, r.category, r.series, r.program_type,
    arr(r.institutions), arr(r.keywords), arr(r.aat), arr(r.genre_list), arr(r.roles), arr(r.activity),
    r.prev, r.organizer, r.venue_text, r.artist_text, r.name_en, r.role, r.daarts_active_field ];
  return (r.__sb = v.filter(Boolean).join(' ').toLowerCase());
}

/* ---------- shared card (horizontal admission-stub row) ---------- */
export function rowCard(type, r){
  const t = th(type);
  const id = r[`${type}_id`];
  const title = titleOf(type,r), sub = subOf(type,r);
  const c = r._c || {};
  const meta3 = metaLine(type, r);
  const conn = connLine(type, c);
  return `<a class="rowcard" href="#/${type}/${encodeURIComponent(id)}" style="--accent:${t.accent}">
    ${thumbHTML(type, r, {shape: type==='participant'?'circle':'square'})}
    <span class="rc-perf"></span>
    <div class="rc-body">
      <div class="rc-role">${esc(t.label)}${meta3?` · ${esc(meta3)}`:''}</div>
      <div class="rc-title"><b>${esc(title)}</b>${sub?`<i>${esc(sub)}</i>`:''}</div>
      ${(D(r.prev,r.prev_en))?`<p class="rc-prev">${esc(D(r.prev,r.prev_en))}</p>`:''}
      ${conn?`<div class="rc-conn">${conn}</div>`:''}
    </div>
    <div class="rc-end">
      <span class="rc-id">${esc(id)}</span>
      <span class="barcode"></span>
    </div>
  </a>`;
}
function metaLine(type, r){
  if(type==='exhibition') return fmtRange(r.start_date, r.end_date);
  if(type==='program') return `${r.program_type||''}${r.year?` · ${r.year}`:''}`;
  if(type==='opencall') return `${r.region||''}${r.end_date?` · ${L('마감','Deadline')} ${r.end_date}`:''}`;
  if(type==='participant') return [r.type, r.birth_year?`b.${r.birth_year}`:'', (r.roles||[]).slice(0,2).join(', ')].filter(Boolean).join(' · ');
  if(type==='work') return [r.workType, r.year_created_text].filter(Boolean).join(' · ');
  if(type==='organization') return [r.type, r.country].filter(Boolean).join(' · ');
  if(type==='venue') return r.address||'';
  return '';
}
function connLine(type, c){
  const bits = [];
  const add=(k,one,many)=>{ if(c[k]) bits.push(`<span>${num(c[k])} ${c[k]===1?one:many}</span>`); };
  if(type==='exhibition'){ add('participants','participant','participants'); add('works','work','works'); add('venues','venue','venues'); add('related','related','related'); }
  else if(type==='program'){ add('participants','participant','participants'); add('venues','venue','venues'); add('orgs','org','orgs'); add('related','related','related'); }
  else if(type==='opencall'){ add('orgs','org','orgs'); }
  else if(type==='participant'){ add('exhibitions','exhibition','exhibitions'); add('programs','program','programs'); add('works','work','works'); }
  else if(type==='work'){ add('participants','participant','participants'); add('exhibitions','exhibition','exhibitions'); }
  else if(type==='organization'){ add('exhibitions','exhibition','exhibitions'); add('programs','program','programs'); add('opencalls','open call','open calls'); }
  else if(type==='venue'){ add('exhibitions','exhibition','exhibitions'); add('programs','program','programs'); }
  return bits.join('<em>·</em>');
}

/* ============================================================
   FACET: ART ACTIVITY (participant.activity_type)
   ============================================================ */
const ACTIVITY = {
  create:  {blurb:['작품을 만드는 작가·창작자.','Artists and creators who make works.'], hue:'#5B3BA6'},
  research:{blurb:['연구자·아키비스트·보존가.','Researchers, archivists, conservators.'],   hue:'#3E8E4F'},
  educate: {blurb:['교육자·공공프로그램 운영자.','Educators and public-program leads.'], hue:'#6A4BC0'},
  curate:  {blurb:['전시를 기획·구성하는 큐레이터.','Curators who plan and shape exhibitions.'], hue:'#9A82EC'},
  manage:  {blurb:['현장을 이끄는 디렉터·운영자.','Directors and managers who lead on site.'], hue:'#2C7A3F'},
  support: {blurb:['기술·설치·제작 스태프.','Technical, installation, and production staff.'],     hue:'#66C47C'},
  perform: {blurb:['공연자·라이브아트 실연자.','Performers and live-art practitioners.'],   hue:'#4a2c6b'},
  critique:{blurb:['비평가·필자·편집자.','Critics, writers, editors.'],        hue:'#b48fd6'},
};
export async function activityFacet(){
  setCrumb(L('패싯 02 / 예술 활동','Facet 02 / Art Activity'));
  const M = await meta();
  const counts = Object.fromEntries(M.facets.activity.map(x=>[x.k,x.n]));
  const keys = ['create','research','educate','curate','critique'];   // 5 headline activities, shown as vertical tickets
  const tickets = keys.map((k,i)=>actTicket(k,i,counts[k]||0)).join('');
  mount(`
    ${phead('FACET 02 · ART ACTIVITY','participant.activity_type —', L('<span class="pre">미술 현장에서 참가자가</span> <b class="do">하는 일</b><span class="aft"></span>','<span class="pre">What Participants</span> <b class="do">DO</b> <span class="aft">in the Art Scene</span>'), L('참가자 '+num(M.counts.participant)+'명', num(M.counts.participant)+' participants'), L('↑ 입구','↑ Entrance'), '#/', 'sentence do-title', true)}
    <div class="act-grid">${tickets}</div>`);
}
/* a tall vertical "admission ticket" for one art-activity */
export function actTicket(k, i, n){
  const a = ACTIVITY[k] || {blurb:['',''], hue:'#5B3BA6'};
  return `<a class="act-ticket" href="#/activity/${k}" style="--hue:${a.hue}">
    <div class="at-top">
      <div class="at-head"><span class="at-no">${String(i+1).padStart(2,'0')}</span><span class="at-cnt">${num(n)}<i>${esc(L('참가자','participants'))}</i></span></div>
      <div class="at-label">${esc(ACTIVITY[k] ? vlabel(k) : String(k).toUpperCase())}</div>
      <p class="at-blurb">${esc(L(a.blurb[0], a.blurb[1]))}</p>
    </div>
    <div class="at-perf"></div>
    <div class="at-stub"><span class="barcode"></span><span class="at-open"><b>OPEN</b><em>→</em></span></div>
  </a>`;
}
/* "미술 현장에서 ○○하는 사람들" 헤드라인 (동사가 초점어; 3행 스택) */
function verbHTML(label){
  return `<span class="vt-pre">${esc(L('미술 현장에서','People who'))}</span><span class="vt-verb">${esc(label)}</span><span class="vt-post">${esc(L('하는 사람들','in the art scene'))}</span>`;
}
export async function activityListing(key, query){
  const a = ACTIVITY[key] || {blurb:['',''], hue:'#5B3BA6'};
  const aLabel = ACTIVITY[key] ? vlabel(key) : key.toUpperCase();
  setCrumb(L('활동','Activity')+' / '+aLabel);
  return runListing('participant', {...query, activity:key}, {
    kicker:L('활동','Activity')+` · ${aLabel}`,
    titleHTML: verbHTML(aLabel),
    title:aLabel, desc:L(a.blurb[0], a.blurb[1]), accent:a.hue,
    ph:L('이름 · 역할 · 소속 검색…','Search name · role · affiliation…'), crumbTitle:aLabel,
  });
}

/* ============================================================
   FACET: ART EVENT (exhibition / program / opencall)
   ============================================================ */
export async function eventFacet(){
  setCrumb(L('패싯 03 / 예술 행사','Facet 03 / Art Event'));
  const M = await meta();
  const cards = [
    {type:'exhibition', no:'A', sub:L('전시·디스플레이·기획 발표.','Exhibitions, displays, curated presentations.'), src:'SeMA · MMCA · ACC', n:M.counts.exhibition},
    {type:'program',    no:'B', sub:L('교육·문화 프로그램, 강연, 레지던시.','Education and culture programs, talks, residencies.'), src:'education · culture', n:M.counts.program},
    {type:'opencall',   no:'C', sub:L('공모·펠로십·커미션.','Open calls, fellowships, commissions.'), src:'public · other', n:M.counts.opencall},
  ].map(e=>{
    const t = th(e.type);
    return `<a class="event-card" href="#/list/${e.type}" style="--accent:${t.accent}">
      <div class="ec-stub"><span class="barcode-v"></span><span class="ec-admit">ADMIT · ONE</span></div>
      <div class="ec-body">
        <div class="ec-tag">TYPE ${e.no} · ${e.type.toUpperCase()}</div>
        <div class="ec-label"><b>${esc(listTitle(e.type))}</b></div>
        <div class="ec-blurb">${e.sub}</div>
      </div>
      <div class="ec-aside">
        <span class="ec-mark" data-logo="mono"></span>
        <span class="ec-count">${L(num(e.n)+'건', num(e.n)+' records')} · ${esc(e.src)}</span>
        <span class="ec-arrow">→</span>
      </div>
    </a>`;
  }).join('');
  mount(`
    ${phead('FACET 03 · ART EVENT','event.type —','<b class="ev-a">TYPES</b> <span class="ev-of">of</span> <b class="ev-b">Art Event</b>', L('행사 '+num(M.event_total)+'건', num(M.event_total)+' events'), L('↑ 입구','↑ Entrance'), '#/', 'evt-title', true)}
    <div class="event-list">${cards}</div>`);
}

/* ============================================================
   FACET: RESOURCES (participant / work / organization / venue)
   ============================================================ */
export async function resourceFacet(){
  setCrumb(L('자료','Resources'));
  const M = await meta();
  const items = [
    {type:'participant', blurb:L('참여자·팀·콜렉티브.','Participants, teams, collectives.')},
    {type:'work',        blurb:L('소장·전시된 작품(국립현대미술관 소장품).','Collected and exhibited works (MMCA collection).')},
    {type:'organization',blurb:L('미술관·재단·후원사·협력기관.','Museums, foundations, sponsors, partner institutions.')},
    {type:'venue',       blurb:L('전시가 열리는 건물·갤러리·공간.','Buildings, galleries, and spaces where exhibitions happen.')},
  ].map((r,i)=>{
    const t = th(r.type);
    return `<a class="facet-card" href="#/list/${r.type}" style="--hue:${t.accent}">
      <span class="fc-bar"></span>
      <div class="fc-body">
        <div class="fc-head"><span class="fc-no">${t.code}</span><span class="fc-count">${num(M.counts[r.type])}</span></div>
        <div class="fc-label">${esc(thName(r.type))}</div>
        <p class="fc-blurb">${r.blurb}</p>
        <div class="fc-foot"><span class="barcode" style="width:46px"></span><span>OPEN →</span></div>
      </div>
    </a>`;
  }).join('');
  mount(`
    ${phead('RESOURCES','archive.resources —','THE MATERIAL', L('자료 '+num(M.resource_total)+'건', num(M.resource_total)+' records'), L('↑ 입구','↑ Entrance'), '#/')}
    <div class="facet-grid g4">${items}</div>`);
}

/* ============================================================
   FACET: SEMANTIC (keywords + Getty AAT)
   ============================================================ */
export async function semanticFacet(){
  setCrumb(L('주제 태그','Semantic tags'));
  const M = await meta();
  const cloud = (arr, kind) => arr.map(x=>{
    const sz = 12 + Math.min(20, Math.round(Math.log2(x.n+1)*2.2));
    const href = kind==='aat' ? `#/semantic/${encodeURIComponent(x.k)}?kind=aat`
                              : `#/search?q=${encodeURIComponent(stripEn(x.k))}`;
    const loc = kind==='aat' && isLocalCat(glossKO(x.k));
    const tip = kind==='aat' ? (loc ? L('† 자체 보완 분류(Getty AAT 외) — 이 분류의 모든 행사 보기','† Supplemental local category (outside Getty AAT) — view all its events') : L('이 게티 범주의 모든 행사 보기','View all events in this Getty category'))
                             : L(`아카이브에서 “${esc(stripEn(x.k))}” 검색`, `Search the archive for “${esc(stripEn(x.k))}”`);
    return `<a class="cloud-tag" href="${href}" title="${tip}" style="font-size:${sz}px">${kind==='aat'&&loc?'† ':''}${esc(kind==='aat'?glossLabel(x.k):kwLabel(stripEn(x.k)))}<sup>${x.n}</sup></a>`;
  }).join('');
  mount(`
    ${phead('SEMANTIC LAYER','keywords · getty category —','BY THEME', '', L('↑ 입구','↑ Entrance'), '#/')}
    <div class="sem-block">
      <div class="sem-h"><span class="kicker">THEMATIC KEYWORDS</span><span class="mono dim">${esc(L('주제 키워드 · 눌러서 검색','Thematic keywords · click to search'))}</span></div>
      <div class="cloud">${cloud(M.semantic.keywords, 'kw')}</div>
    </div>
    <div class="sem-block">
      <div class="sem-h"><span class="kicker">GETTY CATEGORY</span><span class="mono dim">${esc(L('게티 범주 · 눌러서 행사 묶어보기','Getty category · click to group events'))}</span></div>
      <div class="cloud aat">${cloud(M.semantic.aat, 'aat')}</div>
    </div>`);
}
function stripEn(s){ return s.replace(/\s*\([^()]*\)\s*$/, '').trim() || s; }

export async function semanticListing(tag, query){
  const kind = query.kind==='aat' ? 'aat' : 'keywords';
  const field = kind==='aat' ? 'aat' : 'keywords';
  setCrumb(L('주제','Themes')+' / '+(kind==='aat'?glossLabel(tag):stripEn(tag)));
  // gather exhibitions + programs carrying this tag
  const [ex, pr] = await Promise.all([entity('exhibition'), entity('program')]);
  const hits = [];
  for(const r of ex.list){ if((r[field]||[]).includes(tag)) hits.push({type:'exhibition', r}); }
  for(const r of pr.list){ if((r[field]||[]).includes(tag)) hits.push({type:'program', r}); }
  hits.sort((a,b)=>(b.r.year||0)-(a.r.year||0));
  const head = phead(kind==='aat'?'GETTY CATEGORY':'KEYWORD', `${field} contains —`, ((kind==='aat'&&isLocalCat(glossKO(tag))?'† ':'')+(kind==='aat'?glossLabel(tag):stripEn(tag))), L('행사 '+num(hits.length)+'건', num(hits.length)+' events'), L('← 주제','← Themes'), '#/semantic');
  if(!hits.length){ mount(head+`<div class="empty">${esc(L('이 태그를 가진 행사가 없습니다.','No events carry this tag.'))}</div>`); return; }
  mount(head + `<div class="rowlist">${hits.map(h=>rowCard(h.type, h.r)).join('')}</div>`);
}

/* ============================================================
   GENERIC LISTING ENGINE
   ============================================================ */
/* filter/sort labels stored as [ko,en] tuples; resolved via L() at render time so they flip with language */
const FILTERS = {
  exhibition: [ {field:'institutions',label:['기관','Organization'],meta:'exhibition_institution',multi:true}, {field:'genre_list',label:['분야','Field'],meta:'exhibition_genre',multi:true}, {field:'series',label:['시리즈','Series'],meta:'exhibition_series'}, {field:'year',label:['연도','Year'],years:true} ],
  program:    [ {field:'program_type',label:['유형','Type'],meta:'program_type'}, {field:'source_system',label:['기관','Organization'],meta:'program_source'}, {field:'category_upper',label:['분류','Category'],meta:'program_category'}, {field:'year',label:['연도','Year'],years:true} ],
  opencall:   [ {field:'field_scope',label:['분야','Field'],meta:'opencall_scope'}, {field:'region_list',label:['지역','Region'],meta:'opencall_region',multi:true,wildcard:'is_nationwide'}, {field:'elig_residence',label:['거주지','Residence'],meta:'opencall_residence'}, {field:'benefit_types',label:['지원','Support'],meta:'opencall_benefit_type',multi:true}, {field:'cat_list',label:['분류','Category'],meta:'opencall_category',multi:true}, {field:'target_list',label:['대상','Target'],meta:'opencall_target',multi:true}, {field:'deadline',label:['마감','Deadline'],deadline:true}, {field:'year',label:['연도','Year'],years:true} ],
  participant:[ {field:'activity',label:['활동','Activity'],meta:'activity',multi:true}, {field:'type',label:['유형','Type'],meta:'participant_type'} ],
  work:       [ {field:'workType',label:['작품유형','Medium'],meta:'work_type'}, {field:'acquisition_method',label:['수집방법','Acquisition'],meta:'work_acquisition'} ],
  organization:[{field:'type_list',label:['유형','Type'],meta:'org_type',multi:true}, {field:'country',label:['국가','Country'],meta:'org_country'} ],
  venue:      [ {field:'institution',label:['기관','Organization'],meta:'venue_institution'} ],
};
const flabel = f => L(f.label[0], f.label[1]);   // resolve a filter label at render time

/* EN labels for facet VALUES (KO mode keeps the value verbatim). MEDIUM_EN/SERIES_EN shared from i18n. */
const ORG_SUPP = {'SBS문화재단':'SBS Foundation'};   // facet orgs missing organization.name_en
let _ORG_EN = null;                                  // name_kr → name_en (built once from organization.json)
async function ensureOrgNames(){
  if(_ORG_EN) return _ORG_EN;
  _ORG_EN = {};
  try{ const {list} = await entity('organization'); for(const o of list){ const k=(o.name_kr||'').trim(), v=(o.name_en||'').trim(); if(k&&v) _ORG_EN[k]=v; } }catch(e){}
  return _ORG_EN;
}
/* facet VALUE label — EN mode resolves org names / media / series; falls back to vlabel then verbatim */
function facetLabel(f, val){
  if(!isEN()) return vlabel(val);
  const m = f.meta;
  if(m==='exhibition_genre') return MEDIUM_EN[val] || vlabel(val);
  if(m==='exhibition_series') return SERIES_EN[val] || val;
  if(m==='exhibition_institution' || m==='venue_institution') return (_ORG_EN && _ORG_EN[val]) || ORG_SUPP[val] || val;
  return vlabel(val);
}
const SORTS = {
  exhibition:[['date_desc','최신순','Newest'],['date_asc','오래된순','Oldest'],['title','제목순','Title A–Z'],['conn','연결많은순','Most connected']],
  program:  [['date_desc','최신순','Newest'],['date_asc','오래된순','Oldest'],['title','제목순','Title A–Z'],['conn','연결많은순','Most connected']],
  opencall: [['deadline','마감순','By deadline'],['date_desc','최신순','Newest'],['title','제목순','Title A–Z']],
  participant:[['conn','연결많은순','Most connected'],['title','이름순','By name'],['birth','출생연도순','By birth year']],
  work:     [['title','제목순','Title A–Z'],['year','연도순','By year'],['conn','연결많은순','Most connected']],
  organization:[['conn','연결많은순','Most connected'],['title','이름순','By name']],
  venue:    [['conn','연결많은순','Most connected'],['title','기관순','By institution']],
};
const PAGE = 48;
const VIEW_KEY = 'acai.listview';
const getView = () => localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';   // thumbnail grid is the default
const setView = v => { try { localStorage.setItem(VIEW_KEY, v); } catch(e){} };
const enc = s => encodeURIComponent(s);

const ICON_LIST = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="2.5" y1="4" x2="13.5" y2="4"/><line x1="2.5" y1="8" x2="13.5" y2="8"/><line x1="2.5" y1="12" x2="13.5" y2="12"/></svg>';
const ICON_GRID = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>';

/* ---------- thumbnail (grid) card ---------- */
export function gridCard(type, r){
  const t = th(type);
  const id = r[`${type}_id`];
  const title = titleOf(type,r), sub = subOf(type,r);
  const meta3 = metaLine(type, r);
  return `<a class="gcard" href="#/${type}/${enc(id)}" style="--accent:${t.accent}">
    <div class="gc-thumb">${thumbHTML(type, r, {shape:'square'})}<span class="gc-id">${esc(id)}</span></div>
    <div class="gc-meta">
      <div class="gc-role">${esc(t.label)}${meta3?` · ${esc(meta3)}`:''}</div>
      <div class="gc-title">${esc(title)}</div>
      ${sub?`<div class="gc-sub">${esc(sub)}</div>`:''}
    </div>
  </a>`;
}

/* ---------- bold listing header (collection title + count) ---------- */
function listHead({kicker, title, titleHTML, count, hint, desc, backLabel, backHash}){
  return `<div class="lzhead">
    ${backLabel?`<a class="pill lz-back" href="${backHash||'#/'}">${esc(backLabel)}</a>`:''}
    <div class="lz-kick"><span class="lz-dot"></span>${esc(kicker)}</div>
    <h1 class="lz-title${titleHTML?' lz-verb':''}">${titleHTML || esc(title)}</h1>
    <div class="lz-count${titleHTML?' lz-count-verb':''}">${esc(count)}</div>
    ${hint?`<p class="lz-hint" style="font-size:.82rem;opacity:.62;margin:.25rem 0 0;font-weight:400">ⓘ ${esc(hint)}</p>`:''}
    ${desc?`<p class="lz-desc">${esc(desc)}</p>`:''}
  </div>`;
}

/* 목록 페이지 큰 제목 — 이벤트 유형은 메인 티켓과 동일 표기. [ko,en] tuples, resolved at render time */
const LIST_TITLE = {exhibition:['미술 전시','Exhibition'], program:['미술 프로그램','Program'], opencall:['미술계 공모','Open Call']};
const listTitle = type => { const m = LIST_TITLE[type]; return m ? L(m[0], m[1]) : thName(type); };
export async function listing(type, query){
  if(!FILTERS[type]) { mount(`<div class="empty">${esc(L('알 수 없는 컬렉션: '+type, 'Unknown collection: '+type))}</div>`); return; }
  const t = th(type);
  const tn = thName(type);
  setCrumb(L('둘러보기','Browse')+' / '+tn);
  return runListing(type, query, {
    kicker:L('컬렉션','Collection')+` · ${tn}`, title:listTitle(type),
    desc:L(`모든 ${t.kr} 기록. 항목을 클릭하면 상세 정보와 연결 관계를 볼 수 있습니다.`, `All ${tn} records. Click an item to see its details and connections.`),
    ph:L(`${t.kr} · 제목 · 설명 · 기관 · 분야 검색…`, `Search ${tn} · title · description · organization · field…`), crumbTitle:tn,
  });
}

async function runListing(type, query, opts){
  const t = th(type);
  const store = await entity(type);
  const M = await meta();
  if(isEN()) await ensureOrgNames();          // EN facet pills resolve org names from organization.json
  let list = store.list;

  // apply facet filters present in query
  const fdefs = FILTERS[type] || [];
  for(const f of fdefs){
    const v = query[f.field];
    if(v==null || v==='') continue;
    if(f.years){                                   // YEAR is multi-select: a comma-set of years
      const set = new Set(String(v).split(',').map(s=>s.trim()).filter(Boolean));
      list = list.filter(r => set.has(String(r.year)));
    } else if(f.deadline){                          // DEADLINE status, derived client-side from end_date (stays fresh)
      const today = new Date().toISOString().slice(0,10);
      list = list.filter(r => v==='Open' ? (r.end_date && String(r.end_date).slice(0,10) >= today)
                            : v==='Closed' ? (r.end_date && String(r.end_date).slice(0,10) < today)
                            : true);
    } else list = facetFilter(list, f.field, v, {multi:!!f.multi, wildcard:f.wildcard});
  }
  // sort key (chosen up front so the LIVE text filter can reuse it without a re-route)
  const sort = query.sort || (SORTS[type]?.[0]?.[0]) || 'title';
  const _today = new Date().toISOString().slice(0,10);
  // text filter runs over the facet-filtered base list, so typing can re-filter IN PLACE
  // (repaint only) instead of navigating — otherwise every keystroke re-mounted the page and
  // the search input lost focus, which felt like "자꾸 검색으로 이동".
  const baseList = list;                                   // facet-filtered, before text query
  const filterSort = (qval)=>{
    const q = (qval||'').trim().toLowerCase();
    let l = baseList;
    if(q) l = baseList.filter(r => searchBlob(type,r).includes(q)
                || (_KTEXTS && (_KTEXTS[r[ID_FIELD[type]]]||'').toLowerCase().includes(q)));   // deep 설명
    if(sort==='deadline') l = l.filter(r => String(r.end_date||'') >= _today);   // upcoming only
    return sortList(type, [...l], sort);
  };
  list = filterSort(query.q);

  // TITLE reflects the ACTIVE filters: participant+activity → the "People Who VERB …" headline;
  // any other filter (e.g. exhibition + MMCA) → prepend the filter value(s): "MMCA EXHIBITION".
  let titleHTML = opts.titleHTML, title = opts.title || t.label, accent = opts.accent || t.accent;
  if(!titleHTML){
    const active = fdefs.map(f=>({field:f.field, v:query[f.field]})).filter(x=>x.v!=null && x.v!=='');
    const act = active.find(x=>x.field==='activity');
    if(type==='participant' && act){
      const a = ACTIVITY[act.v] || {label:String(act.v).toUpperCase(), hue:t.accent};
      titleHTML = verbHTML(ACTIVITY[act.v] ? vlabel(act.v) : a.label); accent = a.hue;
    } else if(active.length){
      title = active.map(x=>String(x.v).toUpperCase()).join(' · ') + ' ' + title;
    }
  }

  // wildcard hint: a Field/Region pick silently also keeps 전 장르(전체)/전국 calls — explain the count gap
  const WILD_LABEL = {is_all_genre:L('전 장르 공모','all-genre calls'), is_nationwide:L('전국 공모','nationwide calls')};
  const hints = [];
  for(const f of fdefs){
    const v = query[f.field];
    if(!f.wildcard || v==null || v==='' || v===(f.wildcard==='is_all_genre'?'전체':'전국')) continue;
    const tagged = list.filter(r => Array.isArray(r[f.field]) && r[f.field].includes(v)).length;
    const wild = list.length - tagged;
    if(wild>0) hints.push(L(`${v} ${num(tagged)} + ${WILD_LABEL[f.wildcard]} ${num(wild)} 포함`, `${v} ${num(tagged)} + ${num(wild)} ${WILD_LABEL[f.wildcard]} included`));
  }
  const hint = hints.join(' · ');

  // render shell — KOVOX-style header, prominent search, filter pills, view+sort bar
  const head    = listHead({kicker:opts.kicker, title, titleHTML, count:num(list.length), hint, desc:opts.desc, backLabel:L('↑ 입구','↑ Entrance'), backHash:'#/'});
  const search  = `<div class="lz-search"><span>⌕</span><input id="lz-q" type="text" placeholder="${esc(opts.ph||L(t.kr+' 검색…', thName(type)+' search…'))}" value="${esc(query.q||'')}" autocomplete="off"><div class="lz-suggest" id="lzSuggest" hidden></div></div>`;
  const filters = filterPillsHTML(type, query, fdefs, M, store.list);
  const bar     = toolbarHTML(type, sort);
  mount(`<div class="listing" style="--accent:${accent}">
    ${head}${search}${filters}${bar}
    <div class="lz-items" id="lzitems"></div>
    <div class="loadmore-wrap"><button class="pill" id="loadmore" hidden>${esc(L('더 보기','Load more'))}</button><div class="lm-stat mono" id="lmstat"></div></div>
  </div>`);

  // pagination + view (grid|list) + month grouping (only when date-sorted)
  const elItems = document.getElementById('lzitems');
  const elMore  = document.getElementById('loadmore');
  const elStat  = document.getElementById('lmstat');
  const datey   = ['date_desc','date_asc','deadline'].includes(sort) && ['exhibition','program','opencall'].includes(type);
  let view = getView(), shown = 0, lastYM = null;
  const applyViewClass = ()=>{ elItems.className = 'lz-items ' + (view==='grid' ? 'as-grid' : 'as-list'); };
  function paint(){
    const next = list.slice(shown, shown+PAGE);
    let html = '';
    for(const r of next){
      if(datey){ const ym = ymOf(type, r, sort); if(ym && ym!==lastYM){ html += `<div class="month-sep">${esc(ym)}</div>`; lastYM = ym; } }
      html += view==='grid' ? gridCard(type, r) : rowCard(type, r);
    }
    elItems.insertAdjacentHTML('beforeend', html);
    shown += next.length;
    elStat.textContent = L(`${num(list.length)}건 중 ${num(Math.min(shown,list.length))}건 표시`, `Showing ${num(Math.min(shown,list.length))} of ${num(list.length)}`);
    elMore.hidden = shown >= list.length;
  }
  function repaint(){ elItems.innerHTML=''; shown=0; lastYM=null; applyViewClass(); if(list.length) paint(); else { elItems.innerHTML=`<div class="empty">${esc(L('조건에 맞는 레코드가 없습니다.','No records match these filters.'))}</div>`; elStat.textContent=''; elMore.hidden=true; } }
  applyViewClass();
  if(!list.length){ elItems.innerHTML = `<div class="empty">${esc(L('조건에 맞는 레코드가 없습니다.','No records match these filters.'))}</div>`; elStat.textContent=''; }
  else paint();
  elMore?.addEventListener('click', paint);

  // view toggle (client-side, persisted — no route change)
  document.querySelectorAll('.vbtn').forEach(b=>b.addEventListener('click', ()=>{
    const v = b.dataset.view; if(v===view) return;
    view = v; setView(v);
    document.querySelectorAll('.vbtn').forEach(x=>x.classList.toggle('on', x.dataset.view===v));
    repaint();
  }));

  // LIVE text filter — re-filter the items in place + update the URL via replaceState, so the
  // input keeps focus (no route change / re-mount). Replaces the old navigate-on-keystroke wiring.
  // ── 검색어 추천(autocomplete) 어휘: 기관·키워드·분야·장르·시리즈·역할(+이름) with counts ──
  const NAME_TYPES = new Set(['participant','organization','venue','work']);
  const _vc = new Map();
  const _add = s=>{ s=String(s||'').trim(); if(s.length>=2) _vc.set(s,(_vc.get(s)||0)+1); };
  for(const r of store.list){
    (Array.isArray(r.institutions)?r.institutions:[]).forEach(_add);
    (Array.isArray(r.keywords)?r.keywords:[]).forEach(_add);
    (Array.isArray(r.roles)?r.roles:[]).forEach(_add);
    String(r.exhibition_genre||r.genre||'').split(/[,/·]/).forEach(_add);
    String(r.exhibition_field||r.field||'').split(/[,/·]/).forEach(_add);
    _add(r.series); _add(r.role); _add(r.daarts_active_field); _add(r.category);
    if(NAME_TYPES.has(type)) _add(titleOf(type,r));
  }
  const VOCAB = [..._vc.entries()].map(([tm,n])=>({t:tm,n,tl:tm.toLowerCase()})).sort((a,b)=>b.n-a.n);
  const SG_MAX = 30;   // show up to 30 suggestions; the dropdown scrolls past ~9
  const suggest = qv=>{
    const q=(qv||'').trim().toLowerCase(); if(!q) return [];
    const pre=[], sub=[];
    for(const v of VOCAB){
      if(v.tl===q) continue;
      if(v.tl.startsWith(q)){ if(pre.length<SG_MAX) pre.push(v); }
      else if(v.tl.includes(q) && sub.length<SG_MAX) sub.push(v);
      if(pre.length>=SG_MAX) break;
    }
    return [...pre, ...sub].slice(0,SG_MAX);
  };

  const qInput = document.getElementById('lz-q');
  const sgBox  = document.getElementById('lzSuggest');
  if(qInput){
    let qt, sgIdx=-1, sgItems=[];
    const liveFilter = ()=>{
      list = filterSort(qInput.value);
      repaint();
      const cEl = document.querySelector('.lz-count'); if(cEl) cEl.textContent = num(list.length);
      const params = new URLSearchParams(location.hash.split('?')[1]||'');
      if(qInput.value.trim()) params.set('q', qInput.value); else params.delete('q');
      const qs = params.toString();
      history.replaceState(null, '', location.hash.split('?')[0] + (qs?`?${qs}`:''));
      if(_KTEXTS === null && qInput.value.trim()){          // lazy full-설명 map, then re-filter
        _KTEXTS = {};
        keywordTexts().then(t=>{ _KTEXTS = t; list = filterSort(qInput.value); repaint(); const c2=document.querySelector('.lz-count'); if(c2) c2.textContent=num(list.length); }).catch(()=>{});
      }
    };
    const hl = ()=>{ [...sgBox.children].forEach((c,i)=>{ const on=i===sgIdx; c.classList.toggle('on', on); if(on) c.scrollIntoView({block:'nearest'}); }); };
    const showSuggest = ()=>{
      sgItems = suggest(qInput.value); sgIdx = -1;
      if(!sgItems.length){ sgBox.hidden=true; sgBox.innerHTML=''; return; }
      sgBox.innerHTML = sgItems.map(v=>`<button type="button" class="lz-sg" data-t="${esc(v.t)}"><span class="lz-sg-t">${esc(v.t)}</span><span class="lz-sg-n">${num(v.n)}</span></button>`).join('');
      sgBox.hidden = false;
    };
    const apply = term=>{ qInput.value=term; sgBox.hidden=true; clearTimeout(qt); liveFilter(); qInput.focus(); };
    qInput.addEventListener('input', ()=>{ showSuggest(); clearTimeout(qt); qt=setTimeout(liveFilter, 200); });
    qInput.addEventListener('keydown', e=>{
      if(sgBox.hidden || !sgItems.length){ return; }
      if(e.key==='ArrowDown'){ e.preventDefault(); sgIdx=Math.min(sgItems.length-1,sgIdx+1); hl(); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); sgIdx=Math.max(-1,sgIdx-1); hl(); }
      else if(e.key==='Enter'){ if(sgIdx>=0){ e.preventDefault(); apply(sgItems[sgIdx].t); } else sgBox.hidden=true; }
      else if(e.key==='Escape'){ sgBox.hidden=true; }
    });
    sgBox.addEventListener('mousedown', e=>{ const b=e.target.closest('.lz-sg'); if(b){ e.preventDefault(); apply(b.dataset.t); } });
    qInput.addEventListener('focus', ()=>{ if(qInput.value.trim()) showSuggest(); });
    qInput.addEventListener('blur', ()=>{ setTimeout(()=>{ sgBox.hidden=true; }, 160); });
  }

  wireListing(type, query, sort);
}

/* "YYYY" for the section separators — group by YEAR */
function ymOf(type, r, sort){
  let d = sort==='deadline' ? (r.end_date||'') : (r.start_date || r.date || '');
  const m = String(d).match(/^(\d{4})/);
  if(m) return m[1];
  return r.year ? String(r.year) : '';
}

function sortList(type, list, sort){
  const tt = t=>titleOf(type,t)||'';
  const cn = r=>{ const c=r._c||{}; return Object.values(c).reduce((a,b)=>a+(b||0),0); };
  switch(sort){
    case 'date_desc': return list.sort((a,b)=>String(b.start_date||'').localeCompare(String(a.start_date||'')));
    case 'date_asc':  return list.sort((a,b)=>String(a.start_date||'').localeCompare(String(b.start_date||'')));
    case 'deadline':  return list.sort((a,b)=>String(a.end_date||'9999').localeCompare(String(b.end_date||'9999')));
    case 'year':      return list.sort((a,b)=>String(b.year_created_text||'').localeCompare(String(a.year_created_text||'')));
    case 'birth':     return list.sort((a,b)=>(b.birth_year||0)-(a.birth_year||0));
    case 'conn':      return list.sort((a,b)=>cn(b)-cn(a));
    case 'title': default: return list.sort((a,b)=>tt(a).localeCompare(tt(b),'ko'));
  }
}

/* filter rows as pill groups (YEAR + facets). single-select, route-driven */
function filterPillsHTML(type, query, fdefs, M, fullList){
  const rows = fdefs.map(f=>{
    if(f.years) return yearTrackHTML(f, query, fullList);   // YEAR = a scrollable count-bar track, not pills
    if(f.deadline){                                          // DEADLINE = Open/Closed pills, counts live from end_date
      const today = new Date().toISOString().slice(0,10);
      let open=0, closed=0;
      for(const r of fullList){ if(!r.end_date) continue; (String(r.end_date).slice(0,10)>=today?open++:closed++); }
      const vals=[{k:'Open',lab:L('진행중','Open'),n:open},{k:'Closed',lab:L('마감','Closed'),n:closed}];
      const cur=query[f.field]; const allOn=(cur==null||cur==='');
      const pills=[`<button class="fpill${allOn?' on':''}" data-field="${esc(f.field)}" data-val="">${esc(L('전체','All'))}</button>`]
        .concat(vals.map(v=>`<button class="fpill${String(cur)===String(v.k)?' on':''}" data-field="${esc(f.field)}" data-val="${esc(v.k)}">${esc(v.lab)}<span class="fp-n">${num(v.n)}</span></button>`)).join('');
      return `<div class="flt"><span class="flt-l">${esc(flabel(f))}</span><div class="flt-pills">${pills}</div></div>`;
    }
    const vals = (M.facets[f.meta]||[]).map(x=>({k:x.k, n:x.n}));
    const cur = query[f.field];
    const allOn = (cur==null || cur==='');
    const pills = [`<button class="fpill${allOn?' on':''}" data-field="${esc(f.field)}" data-val="">${esc(L('전체','All'))}</button>`]
      .concat(vals.map(v=>`<button class="fpill${String(cur)===String(v.k)?' on':''}" data-field="${esc(f.field)}" data-val="${esc(v.k)}">${esc(facetLabel(f, v.k))}${v.n!=null?`<span class="fp-n">${num(v.n)}</span>`:''}</button>`)).join('');
    return `<div class="flt"><span class="flt-l">${esc(flabel(f))}</span><div class="flt-pills">${pills}</div></div>`;
  }).join('');
  return rows ? `<div class="lz-filters">${rows}</div>` : '';
}

/* YEAR TRACK — one scrollable row: a count-bar cell per year (height ∝ log count), tap to single-select.
   Cells route exactly like a pill (data-field/data-val → location.hash); an active-year chip keeps the
   current pick visible while the track scrolls. No range — the single-select filter logic is untouched. */
function yearTrackHTML(f, query, fullList){
  const yc = {};
  for(const r of fullList){ if(r.year) yc[r.year] = (yc[r.year]||0)+1; }
  const ys = Object.keys(yc).map(Number).sort((a,b)=>a-b);        // chronological L→R
  if(!ys.length) return '';
  const max = Math.max(...ys.map(y=>yc[y]));
  const curSet = new Set(String(query[f.field]||'').split(',').map(s=>s.trim()).filter(Boolean));  // multi-select set
  const allOn = curSet.size===0;
  const cells = ys.map(y=>{
    const n = yc[y];
    const h = Math.round(9 + 29*(Math.log(n+1)/Math.log(max+1)));  // log-scaled 9–38px (keeps sparse years visible)
    const on = curSet.has(String(y));
    return `<button class="yrcell${on?' on':''}" data-field="${esc(f.field)}" data-val="${y}" title="${y} · ${num(n)}" aria-label="${L(`${y}, ${num(n)}건`, `${y}, ${num(n)} records`)}${on?L(' (선택됨)',' (selected)'):''}" aria-pressed="${on}"><span class="yr-bar" style="height:${h}px" aria-hidden="true"></span><span class="yr-lab">${esc("'"+String(y).slice(2))}</span></button>`;
  }).join('');
  const yrs = [...curSet].sort();
  const chip = allOn ? '' :
    `<button class="yr-active" data-field="${esc(f.field)}" data-val="" title="${esc(L('연도 필터 전체 해제','Clear year filter'))}">${esc(yrs.length<=3 ? yrs.join(' · ') : L(yrs.length+'개 연도', yrs.length+' years'))} <span class="yr-x" aria-hidden="true">✕</span></button>`;
  return `<div class="flt flt-yr"><span class="flt-l">${esc(flabel(f))}</span>`
       + `<div class="yrtrack" role="group" aria-label="${esc(L('연도 필터','Year filter'))}"><button class="yrcell yr-all${allOn?' on':''}" data-field="${esc(f.field)}" data-val="" aria-pressed="${allOn}" title="${esc(L('모든 연도','All years'))}">ALL</button>${cells}</div>${chip}</div>`;
}

/* view toggle + sort buttons */
function toolbarHTML(type, sort){
  const v = getView();
  const sorts = (SORTS[type]||[]).map(s=>`<button class="sbtn${s[0]===sort?' on':''}" data-sort="${esc(s[0])}">${esc(L(s[1], s[2]))}</button>`).join('');
  const listT = L('목록 보기','List view'), gridT = L('격자 보기','Grid view');
  return `<div class="lz-bar">
    <div class="lz-view">
      <button class="vbtn${v==='list'?' on':''}" data-view="list" title="${esc(listT)}" aria-label="${esc(listT)}">${ICON_LIST}</button>
      <button class="vbtn${v==='grid'?' on':''}" data-view="grid" title="${esc(gridT)}" aria-label="${esc(gridT)}">${ICON_GRID}</button>
    </div>
    <div class="lz-sort">${sorts}</div>
  </div>`;
}

/* wire pills / sort / search → route changes (shareable + back-able) */
function wireListing(type, query, sort){
  const cur = currentBase(type);
  const onActivity = /^activity\//.test(cur);   // activity lives in the PATH (#/activity/:k), not the query
  const base = `#/${cur}`;
  const clean = (o)=>{ o={...o}; Object.keys(o).forEach(k=>{ if(o[k]==='' || o[k]==null) delete o[k]; }); return o; };
  const build = (patch)=>{
    const q = clean({...query, ...patch});
    if(onActivity) delete q.activity;            // never emit activity as a query param on an activity route
    const qs = new URLSearchParams(q).toString();
    return base + (qs?`?${qs}`:'');
  };
  document.querySelectorAll('.fpill').forEach(p=>p.addEventListener('click', ()=>{
    // BUGFIX: on #/activity/:k the activity is the PATH; switching it must change the path
    // (so the title, the filter and the highlight all follow) — not add an ignored ?activity= param.
    if(onActivity && p.dataset.field==='activity'){
      const q = clean({...query}); delete q.activity;
      const qs = new URLSearchParams(q).toString();
      location.hash = (p.dataset.val ? `#/activity/${p.dataset.val}` : '#/list/participant') + (qs?`?${qs}`:'');
      return;
    }
    location.hash = build({[p.dataset.field]: p.dataset.val});
  }));
  // YEAR cells are MULTI-select: each click toggles that year in/out of the comma-set; ALL/✕ clears.
  document.querySelectorAll('.yrcell, .yr-active').forEach(p=>p.addEventListener('click', ()=>{
    const field = p.dataset.field, val = p.dataset.val;
    const set = new Set(String(query[field]||'').split(',').map(s=>s.trim()).filter(Boolean));
    if(!val) set.clear();
    else if(set.has(val)) set.delete(val);
    else set.add(val);
    location.hash = build({[field]: [...set].sort().join(',')});
  }));
  document.querySelectorAll('.sbtn').forEach(b=>b.addEventListener('click', ()=>{ location.hash = build({sort: b.dataset.sort}); }));
  // NOTE: the #lz-q text filter is wired in runListing() as a LIVE in-place filter (no re-route),
  // so it is intentionally NOT wired here anymore.
}
/* route base must preserve activity/list distinction */
function currentBase(type){
  const h = location.hash.replace(/^#\//,'').split('?')[0];
  return h || `list/${type}`;
}

/* ---------- page header helper ---------- */
export function phead(kicker, scope, title, count, backLabel, backHash, titleClass, rawTitle){
  return `<div class="phead">
    <div class="phead-l">
      <div class="tab-v">${esc(kicker)}</div>
      <div>
        ${scope?`<div class="scope">${esc(scope)}</div>`:''}
        <h1${titleClass?` class="${titleClass}"`:''}>${rawTitle ? title : esc(title)}</h1>
      </div>
    </div>
    <div class="phead-r">
      ${count?`<span class="count">${esc(count)}</span>`:''}
      ${backLabel?`<a class="pill" href="${backHash||'#/'}">${esc(backLabel)}</a>`:''}
    </div>
  </div>`;
}
