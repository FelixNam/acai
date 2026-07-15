/* ============================================================
   edit.js — in-page record editor (TEMPORARY tool)
   Talks to the sidecar edit server (tools/edit_server.py, :8799)
   to write edits straight back into the source RDB xlsx, then
   patches the in-memory data so the page updates immediately.
   Discard this module + the edit server when corrections are done.
   ============================================================ */
import { record, text, relationsFor, entity, ID_FIELD,
         applyRecordPatch, addEntityRecord, addLinkRow, removeLinkRow, updateLinkRole } from './data.js';
import { esc, pixelBurst, titleOf, subOf, th } from './ui.js';

const EVENT_TYPES = new Set(['exhibition','program','opencall']);   // can be related to each other

const EDIT_API = 'http://localhost:8799';

/* controlled-vocabulary cache for multi-select 'type' fields (organization / venue),
   derived from the values already present in the data. Loaded once per session. */
let _VOCAB = null;
async function ensureVocabs(){
  if(_VOCAB) return _VOCAB;
  _VOCAB = {};
  for(const t of ['organization','venue']){
    const freq = new Map();
    try{
      const {list} = await entity(t);
      for(const r of list) for(const tok of (r.type_list || [])) freq.set(tok, (freq.get(tok)||0)+1);
    }catch(e){}
    _VOCAB[t] = [...freq.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  }
  return _VOCAB;
}

let _avail = null;
export function editAvailable(){
  if(_avail !== null) return _avail;
  _avail = fetch(`${EDIT_API}/health`).then(r=>r.ok).catch(()=>false);
  return _avail;
}
async function api(path, body){
  const r = await fetch(`${EDIT_API}${path}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  let j = {}; try{ j = await r.json(); }catch(e){}
  if(!r.ok || j.error) throw new Error(j.error || ('HTTP '+r.status));
  return j;
}

/* editable columns per type: [col, label, kind?, required?, placeholder?, options?]
   kind: undefined=text · 'area'=textarea · 'num'=number · 'sel'=select */
const A='area', N='num', S='sel', M='multi';   // M: multi-select chips from a controlled vocab + free add

/* canonical-ize controlled-vocab free-text fields on save: Korean labels (or English labels) → the
   stored canonical key, so typing "창작" into activity_type lands as "create" (not an orphan value
   that only renders as Korean in EN mode). Also splits on comma, trims, and dedupes. */
const ACT_KEY = {'창작':'create','연구':'research','교육':'educate','기획':'curate','운영':'manage','지원':'support','공연':'perform','비평':'critique'};
function normActivity(v){
  const seen = new Set(), out = [];
  for(let t of String(v||'').split(',')){
    t = t.trim(); if(!t) continue;
    const k = ACT_KEY[t] || ACT_KEY[t.toLowerCase()] || t.toLowerCase();
    if(!seen.has(k)){ seen.add(k); out.push(k); }
  }
  return out.join(',');
}
const FIELD_NORM = { activity_type: normActivity };   // col → value normalizer applied on save
const EDIT_FIELDS = {
  exhibition: [
    ['title','제목',0,1], ['source_system','출처(mmca/sema/acc)'], ['start_date','시작일',0,0,'YYYY-MM-DD'], ['end_date','종료일',0,0,'YYYY-MM-DD'],
    ['series','시리즈'], ['exhibition_field','분야'], ['exhibition_genre','장르'], ['works_count','작품 수(자유 텍스트)'],
    ['venue_text','장소(자유 텍스트)'], ['organizer','주최/후원'], ['admission','관람료'],
    ['detail_url','원문 URL'], ['description_text','설명',A], ['artist_text','작가 정보 (원문 그대로)',A],
  ],
  program: [
    ['title','제목',0,1], ['program_type','유형',S,0,0,['education','culture']], ['source_system','출처'], ['start_date','시작일',0,0,'YYYY-MM-DD'], ['end_date','종료일',0,0,'YYYY-MM-DD'],
    ['category_upper','상위 분류'], ['category_lower','하위 분류'], ['audience','대상'], ['capacity_text','정원'], ['education_day','요일'], ['time_text','시간'],
    ['detail_url','원문 URL'], ['description_text','설명',A],
  ],
  opencall: [
    ['title','제목',0,1], ['region','지역'], ['public_or_other','주최 성격(공공/기타)'], ['target','대상'], ['field','분야'], ['category','지원 유형'],
    ['venue','장소'], ['start_date','접수 시작',0,0,'YYYY-MM-DD'], ['end_date','접수 마감',0,0,'YYYY-MM-DD'],
    ['detail_url','원문 URL'], ['application_url','신청 URL'], ['description_text','설명',A],
  ],
  participant: [
    ['name_kr','이름(KR)',0,1], ['name_en','이름(EN)'], ['birth_year','출생연도',N], ['death_year','사망연도',N],
    ['type','유형',S,0,0,['individual','team','group','organization','unknown']],
    ['role','역할(쉼표 구분, 예: 작가,큐레이터)'], ['daarts_active_field','활동 분야'], ['activity_type','활동 유형(쉼표 구분, 한글·영문 가능, 예: 창작,기획)'],
    ['parent_team_id','소속 팀 ID'], ['wikidata_qid','Wikidata QID'], ['description_text','약력',A],
  ],
  organization: [
    ['name_kr','이름(KR)',0,1], ['name_en','이름(EN)'], ['type','유형(복수 선택)',M,0,0,'organization'], ['country','국가(ISO2, 예: KR)'], ['wikidata_qid','Wikidata QID'],
  ],
  venue: [
    ['institution','기관',0,1], ['building','건물'], ['floor','층'], ['room','실'], ['type','유형(복수 선택)',M,0,0,'venue'], ['address','주소'],
  ],
  work: [
    ['title_ko','제목(KR)',0,1], ['title_en','제목(EN)'], ['year_created_text','제작연도'], ['workType','유형'], ['material_raw','재료'], ['size_text','크기'], ['acquisition_method','수집방법'], ['detail_url','원문 URL'], ['description_text','설명',A],
  ],
};
/* link sections per parent type: which child entities can be searched/created + linked */
const LINKS = {
  exhibition:  [ {child:'participant', bridge:'exhibition_participant', rel:'participants', label:'참가자', rolePh:'참여작가'},
                 {child:'organization', bridge:'exhibition_organization', rel:'organizations', label:'기관', rolePh:'주최'},
                 {child:'venue', bridge:'exhibition_venue', rel:'venues', label:'장소', hasRole:false} ],
  program:     [ {child:'participant', bridge:'program_participant', rel:'participants', label:'참가자', rolePh:'강사'},
                 {child:'organization', bridge:'program_organization', rel:'organizations', label:'기관', rolePh:'주최'},
                 {child:'venue', bridge:'program_venue', rel:'venues', label:'장소', hasRole:false} ],
  opencall:    [ {child:'organization', bridge:'opencall_organization', rel:'organizations', label:'기관', rolePh:'주최'},
                 {child:'venue', bridge:'opencall_venue', rel:'venues', label:'장소', hasRole:false} ],
  participant: [ {child:'organization', bridge:'participant_organization', rel:'organizations', label:'소속 기관', rolePh:'소속'} ],
};
const NEW_CHILD = new Set(['participant','organization','venue']);   // children that can be created fresh
const nameOf = (childType, r) => childType==='participant'
  ? (r.name_kr || r.name_en || r.participant_id)
  : childType==='organization' ? (r.name_kr || r.name_en || r.organization_id)
  : childType==='venue' ? [r.institution, r.room].filter(Boolean).join(' · ') || r.venue_id
  : titleOf(childType, r);

/* ---------------------------------------------------------------- modal ---- */
export async function openEditor(type, id, onChanged){
  const [rec, txt, rel] = await Promise.all([ record(type,id), text(type,id), relationsFor(type,id) ]);
  if(!rec) return;
  await ensureVocabs();                       // controlled vocab for multi-select 'type' fields
  const fields = EDIT_FIELDS[type] || [];
  const links  = LINKS[type] || [];
  const isEvent = EVENT_TYPES.has(type);          // events get a related-events section
  let dirty = false;

  const ov = document.createElement('div');
  ov.className = 'ed-overlay';
  ov.innerHTML = `
    <div class="ed-modal" role="dialog" aria-modal="true">
      <div class="ed-head"><b>편집 · ${esc(type)} <span class="ed-id">${esc(id)}</span></b><button class="ed-x" title="닫기">✕</button></div>
      <div class="ed-body">
        <div class="ed-sec-h">필드</div>
        <div class="ed-fields">${fields.map(f=>fieldRowHTML(f)).join('')}</div>
        ${(links.length || isEvent) ? `<div class="ed-links">${links.map(l=>linkSectionHTML(l, rel[l.rel]||[])).join('')}${isEvent ? relatedEventsSectionHTML(rel.related||[]) : ''}</div>` : ''}
      </div>
      <div class="ed-foot"><span class="ed-status"></span><span class="ed-foot-btns"><button class="ed-cancel">닫기</button><button class="ed-save">필드 저장</button></span></div>
    </div>`;
  document.body.appendChild(ov);
  document.body.classList.add('ed-open');

  // prefill values via JS property (avoids attribute-escaping pitfalls)
  for(const [col] of fields){
    const el = ov.querySelector(`[data-col="${col}"]`);
    if(!el) continue;
    const v = (col in txt) ? txt[col] : rec[col];
    el.value = (v==null ? '' : v);
  }
  wireMultiFields(ov);                         // render chips for any multi-select field from its prefilled value

  const status = ov.querySelector('.ed-status');
  const say = (msg, kind='') => { status.textContent = msg; status.className = 'ed-status '+kind; };
  const close = () => { document.body.classList.remove('ed-open'); ov.remove(); if(dirty && onChanged) onChanged(); };

  ov.querySelector('.ed-x').onclick = close;
  ov.querySelector('.ed-cancel').onclick = close;
  ov.addEventListener('mousedown', e=>{ if(e.target===ov) close(); });
  document.addEventListener('keydown', function esckey(e){ if(e.key==='Escape' && ov.isConnected){ close(); document.removeEventListener('keydown', esckey); } });

  /* save the field form */
  ov.querySelector('.ed-save').onclick = async ()=>{
    const out = {};
    for(const f of fields){
      const [col,,,req] = f;
      const el = ov.querySelector(`[data-col="${col}"]`);
      let v = el ? el.value.trim() : '';
      if(FIELD_NORM[col]) v = FIELD_NORM[col](v);
      if(req && !v){ say(`${f[1]}은(는) 필수입니다`, 'err'); el && el.focus(); return; }
      out[col] = v;
    }
    say('저장 중…');
    try{
      const res = await api('/save', {type, id, fields: out});
      await applyRecordPatch(type, id, out);
      dirty = true;
      const n = Object.keys(res.changed||{}).length;
      pixelBurst(window.innerWidth/2, window.innerHeight/2);
      say(n ? `저장됨 · ${n}개 필드 · xlsx 재빌드 중` : '변경 사항 없음', 'ok');
      setTimeout(close, 650);
    }catch(err){ say('저장 실패: '+err.message, 'err'); }
  };

  /* wire each link section (search existing + create new) */
  links.forEach(cfg => wireLinkSection(ov, cfg, type, id, () => { dirty = true; }, say));
  if(isEvent) wireRelatedEvents(ov, type, id, () => { dirty = true; }, say);
}

/* ---------------------------------------------------------- field markup ---- */
function fieldRowHTML([col, label, kind, , ph, opts]){
  if(kind===M){   // multi-select chips from a controlled vocab (opts = vocab key) + free-text add
    const options = (_VOCAB && _VOCAB[opts]) || [];
    const widget = `<div class="ed-multi">
        <input type="hidden" class="ed-in ed-multi-val" data-col="${col}">
        <div class="ed-multi-chips"></div>
        <div class="ed-multi-row">
          <select class="ed-multi-pick"><option value="">＋ 기존 유형 선택</option>${options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>
          <input class="ed-multi-new" type="text" placeholder="새 유형 직접 입력">
          <button type="button" class="ed-multi-add">추가</button>
        </div>
      </div>`;
    return `<div class="ed-row ed-row-multi"><span class="ed-lab">${esc(label)}</span>${widget}</div>`;
  }
  let input;
  if(kind===A)      input = `<textarea class="ed-in" data-col="${col}" rows="4"></textarea>`;
  else if(kind===S) input = `<select class="ed-in" data-col="${col}">${(opts||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
  else if(kind===N) input = `<input class="ed-in" data-col="${col}" type="number" inputmode="numeric">`;
  else              input = `<input class="ed-in" data-col="${col}" type="text"${ph?` placeholder="${esc(ph)}"`:''}>`;
  return `<label class="ed-row"><span class="ed-lab">${esc(label)}</span>${input}</label>`;
}

/* wire every multi-select widget inside `scope`: chips reflect the (comma-joined) hidden value;
   pick from the vocab dropdown or type a new value; ✕ removes. Hidden value stays in sync for save. */
function wireMultiFields(scope){
  scope.querySelectorAll('.ed-multi').forEach(box=>{
    if(box.dataset.wired) return; box.dataset.wired = '1';
    const hidden = box.querySelector('.ed-multi-val');
    const chips  = box.querySelector('.ed-multi-chips');
    const pick   = box.querySelector('.ed-multi-pick');
    const newI   = box.querySelector('.ed-multi-new');
    const addB   = box.querySelector('.ed-multi-add');
    const vals   = () => [...chips.querySelectorAll('.ed-mchip')].map(c=>c.dataset.v);
    const sync   = () => { hidden.value = vals().join(', '); };
    const chipEl = v => `<span class="ed-mchip" data-v="${esc(v)}">${esc(v)}<button type="button" class="ed-mchip-x" title="제거">✕</button></span>`;
    const add    = v => { v=(v||'').trim(); if(!v || vals().includes(v)) return; chips.insertAdjacentHTML('beforeend', chipEl(v)); sync(); };
    // initial chips from the prefilled hidden value (don't sync — keep DB value intact until edited)
    chips.innerHTML = String(hidden.value||'').split(',').map(s=>s.trim()).filter(Boolean).map(chipEl).join('');
    pick.addEventListener('change', ()=>{ add(pick.value); pick.value=''; });
    addB.addEventListener('click', ()=>{ add(newI.value); newI.value=''; newI.focus(); });
    newI.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); add(newI.value); newI.value=''; } });
    chips.addEventListener('click', e=>{ const x=e.target.closest('.ed-mchip-x'); if(x){ x.parentElement.remove(); sync(); } });
  });
}

/* ----------------------------------------------------------- link markup ---- */
function linkSectionHTML(cfg, items){
  const hasRole = cfg.hasRole !== false;
  return `<section class="ed-link" data-bridge="${cfg.bridge}">
    <div class="ed-sec-h">${esc(cfg.label)} <span class="ed-cnt">${items.length}</span></div>
    <div class="ed-chips">${items.map(it=>chipHTML(cfg.child, it.rec, it.role, hasRole)).join('')}</div>
    <div class="ed-add">
      <input class="ed-search" type="text" placeholder="${esc(cfg.label)} 검색 (이름)…">
      ${hasRole ? `<input class="ed-role" type="text" placeholder="역할: ${esc(cfg.rolePh||'')}">` : ''}
      <button class="ed-new">+ 신규 등록</button>
    </div>
    <div class="ed-hits"></div>
    <div class="ed-newform"></div>
  </section>`;
}
/* existing linked item — removable (✕) and, when the bridge has a role, the role is click-to-edit. */
function chipHTML(childType, rec, role, hasRole){
  if(!rec) return '';
  const cid = rec[ID_FIELD[childType]];
  const roleHTML = hasRole
    ? `<i class="ed-chip-role" title="역할 수정">${role?esc(role):'역할 +'}</i>`
    : (role?`<i>${esc(role)}</i>`:'');
  return `<span class="ed-chip" data-cid="${esc(cid)}"><b>${esc(nameOf(childType, rec))}</b>${roleHTML}<button type="button" class="ed-chip-x" title="연결 해제">✕</button></span>`;
}

function wireLinkSection(ov, cfg, parentType, parentId, markDirty, say){
  const sec   = ov.querySelector(`.ed-link[data-bridge="${cfg.bridge}"]`);
  const search= sec.querySelector('.ed-search');
  const roleI = sec.querySelector('.ed-role');         // null for role-less bridges (venue)
  const hits  = sec.querySelector('.ed-hits');
  const chips = sec.querySelector('.ed-chips');
  const cnt   = sec.querySelector('.ed-cnt');
  const newBtn= sec.querySelector('.ed-new');
  const newForm = sec.querySelector('.ed-newform');
  const hasRole = cfg.hasRole !== false;
  const pcol = ID_FIELD[parentType];                   // e.g. exhibition_id
  const ccol = ID_FIELD[cfg.child];                    // e.g. venue_id
  const match = childId => ({[pcol]: parentId, [ccol]: childId});

  const addChip = (rec, role) => { chips.insertAdjacentHTML('beforeend', chipHTML(cfg.child, rec, role, hasRole)); cnt.textContent = chips.querySelectorAll('.ed-chip').length; };

  /* commit a link parent↔child (child already exists in the base table) */
  const doLink = async (childId, rec) => {
    const role = (roleI ? roleI.value.trim() : '') || (cfg.rolePh || '');
    say('연결 중…');
    try{
      const res = await api('/link', {bridge: cfg.bridge, parentId, childId, role});
      if(res.existed){ say('이미 연결되어 있습니다', 'err'); return; }
      await addLinkRow(cfg.bridge, res.row);
      addChip(rec, res.row[Object.keys(res.row).find(k=>/role/.test(k))] || role);
      markDirty(); say('연결됨', 'ok');
      hits.innerHTML = ''; search.value = '';
    }catch(err){ say('연결 실패: '+err.message, 'err'); }
  };

  /* edit existing links: ✕ unlinks, clicking the role lets you rename it */
  chips.addEventListener('click', async e=>{
    const chip = e.target.closest('.ed-chip'); if(!chip) return;
    const childId = chip.dataset.cid;
    if(e.target.closest('.ed-chip-x')){
      say('연결 해제 중…');
      try{
        await api('/unlink', {bridge: cfg.bridge, parentId, childId});
        await removeLinkRow(cfg.bridge, match(childId));
        chip.remove(); cnt.textContent = chips.querySelectorAll('.ed-chip').length;
        markDirty(); say('연결 해제됨', 'ok');
      }catch(err){ say('해제 실패: '+err.message, 'err'); }
      return;
    }
    if(hasRole && e.target.closest('.ed-chip-role')) editChipRole(chip, childId);
  });

  function editChipRole(chip, childId){
    const roleEl = chip.querySelector('.ed-chip-role'); if(!roleEl || chip.querySelector('.ed-chip-roleedit')) return;
    const cur = roleEl.textContent === '역할 +' ? '' : roleEl.textContent;
    const inp = document.createElement('input');
    inp.className = 'ed-chip-roleedit'; inp.value = cur; inp.placeholder = '역할';
    roleEl.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const toRole = txt => { const i=document.createElement('i'); i.className='ed-chip-role'; i.title='역할 수정'; i.textContent = txt || '역할 +'; return i; };
    const cancel = () => { if(done) return; done = true; inp.replaceWith(toRole(cur)); };
    const commit = async () => {
      if(done) return; done = true;
      const nv = inp.value.trim();
      if(nv === cur){ inp.replaceWith(toRole(cur)); return; }
      say('역할 수정 중…');
      try{
        const res = await api('/link', {bridge: cfg.bridge, parentId, childId, role: nv, update: true});
        await removeLinkRow(cfg.bridge, match(childId));
        if(res.row) await addLinkRow(cfg.bridge, res.row);
        inp.replaceWith(toRole(nv)); markDirty(); say('역할 수정됨', 'ok');
      }catch(err){ done = false; say('수정 실패: '+err.message, 'err'); inp.focus(); }
    };
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); } else if(e.key==='Escape'){ e.preventDefault(); cancel(); } });
    inp.addEventListener('blur', commit);
  }

  /* live search over the in-memory child entity list */
  let store = null;
  const runSearch = async () => {
    const q = search.value.trim().toLowerCase();
    if(q.length < 1){ hits.innerHTML = ''; return; }
    if(!store) store = (await entity(cfg.child)).list;
    const idf = ID_FIELD[cfg.child];
    const out = [];
    for(const r of store){
      const a = (r.name_kr||r.institution||r.title||r.name_en||'').toLowerCase();
      const b = (r.name_en||'').toLowerCase();
      if(a.includes(q) || b.includes(q)){ out.push(r); if(out.length>=10) break; }
    }
    hits.innerHTML = out.length
      ? out.map(r=>`<button class="ed-hit" data-id="${esc(r[idf])}">${esc(nameOf(cfg.child, r))} <i>${esc(r[idf])}</i></button>`).join('')
      : `<div class="ed-nohit">결과 없음 — “+ 신규 등록”으로 추가할 수 있어요</div>`;
  };
  let t; search.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(runSearch, 120); });
  hits.addEventListener('click', async e=>{
    const btn = e.target.closest('.ed-hit'); if(!btn) return;
    const id = btn.dataset.id;
    const rec = (await entity(cfg.child)).byId.get(id);
    doLink(id, rec);
  });

  /* "+ 신규 등록" → full-metadata form for a new child, then link it */
  if(!NEW_CHILD.has(cfg.child)) newBtn.style.display = 'none';
  newBtn.onclick = () => {
    if(newForm.dataset.open){ newForm.dataset.open=''; newForm.innerHTML=''; newBtn.textContent='+ 신규 등록'; return; }
    newForm.dataset.open = '1'; newBtn.textContent = '신규 등록 닫기';
    const ff = EDIT_FIELDS[cfg.child] || [];
    newForm.innerHTML = `<div class="ed-newcard">
      <div class="ed-newcard-h">새 ${esc(cfg.label)} 등록 — 메타데이터 입력</div>
      ${ff.map(f=>fieldRowHTML(f)).join('')}
      <div class="ed-newcard-f"><button class="ed-create">등록 후 연결</button></div>
    </div>`;
    wireMultiFields(newForm);                  // multi-select 'type' inside the new-entity form
    newForm.querySelector('.ed-create').onclick = async ()=>{
      const data = {};
      for(const f of ff){
        const [col,,,req] = f;
        const el = newForm.querySelector(`[data-col="${col}"]`);
        let v = el ? el.value.trim() : '';
        if(FIELD_NORM[col]) v = FIELD_NORM[col](v);
        if(req && !v){ say(`${f[1]}은(는) 필수입니다`, 'err'); el && el.focus(); return; }
        if(v) data[col] = v;
      }
      say('신규 등록 중…');
      try{
        const res = await api('/entity/new', {type: cfg.child, fields: data});
        await addEntityRecord(cfg.child, res.record);
        await doLink(res.id, res.record);                       // immediately link the new child
        newForm.dataset.open=''; newForm.innerHTML=''; newBtn.textContent='+ 신규 등록';
        say(`${res.id} 등록 + 연결됨`, 'ok');
      }catch(err){ say('등록 실패: '+err.message, 'err'); }
    };
  };
}

/* ---------------------------------------------------- related events ---- */
/* exhibition / program / opencall relate to each other via the event_relation table.
   Search across all three event types, link/unlink, or create a new event on the spot & relate it.
   (e.g. from an exhibition, register a tied-in program and link it.) */
const EVS = ['exhibition','program','opencall'];
function relatedEventsSectionHTML(items){
  const chips = (items||[]).map(evChipHTML).filter(Boolean).join('');
  const n = (items||[]).filter(o=>o.otherId).length;
  return `<section class="ed-link ed-evrel">
    <div class="ed-sec-h">연계 이벤트 <span class="ed-cnt">${n}</span></div>
    <div class="ed-chips">${chips}</div>
    <div class="ed-add">
      <input class="ed-search" type="text" placeholder="연계할 전시·프로그램·공모 검색 (제목)…">
      <select class="ed-evtype" title="신규 등록 유형"><option value="program">＋ 프로그램</option><option value="exhibition">＋ 전시</option><option value="opencall">＋ 공모</option></select>
      <button class="ed-new">+ 신규 등록</button>
    </div>
    <div class="ed-hits"></div>
    <div class="ed-newform"></div>
  </section>`;
}
function evChipHTML(o){
  const cid = o.otherId; if(!cid) return '';
  const name = o.rec ? (o.rec.title || titleOf(o.otherType, o.rec) || cid) : (o.title || cid);
  const kind = (th(o.otherType)||{}).label || o.otherType;
  return `<span class="ed-chip" data-cid="${esc(cid)}" data-ctype="${esc(o.otherType)}"><b>${esc(name)}</b><i>${esc(kind)}</i><button type="button" class="ed-chip-x" title="연계 해제">✕</button></span>`;
}
function wireRelatedEvents(ov, parentType, parentId, markDirty, say){
  const sec    = ov.querySelector('.ed-evrel');
  const search = sec.querySelector('.ed-search');
  const evType = sec.querySelector('.ed-evtype');
  const hits   = sec.querySelector('.ed-hits');
  const chips  = sec.querySelector('.ed-chips');
  const cnt    = sec.querySelector('.ed-cnt');
  const newBtn = sec.querySelector('.ed-new');
  const newForm= sec.querySelector('.ed-newform');

  const addChip = (childType, rec) => {
    chips.insertAdjacentHTML('beforeend', evChipHTML({otherType:childType, otherId:rec[ID_FIELD[childType]], rec}));
    cnt.textContent = chips.querySelectorAll('.ed-chip').length;
  };
  const linkEvent = async (childType, childId, rec) => {
    say('연계 중…');
    try{
      const res = await api('/event-link', {parentType, parentId, childType, childId});
      if(res.existed){ say('이미 연계되어 있습니다', 'err'); return; }
      await addLinkRow('event_relation', res.row);
      addChip(childType, rec); markDirty(); say('연계됨', 'ok');
      hits.innerHTML=''; search.value='';
    }catch(err){ say('연계 실패: '+err.message, 'err'); }
  };

  /* ✕ → unlink (either direction) */
  chips.addEventListener('click', async e=>{
    const x = e.target.closest('.ed-chip-x'); if(!x) return;
    const chip = x.closest('.ed-chip'); const childId = chip.dataset.cid;
    say('연계 해제 중…');
    try{
      await api('/event-unlink', {parentId, childId});
      await removeLinkRow('event_relation', {from_id:parentId, to_id:childId});
      await removeLinkRow('event_relation', {from_id:childId, to_id:parentId});
      chip.remove(); cnt.textContent = chips.querySelectorAll('.ed-chip').length;
      markDirty(); say('연계 해제됨', 'ok');
    }catch(err){ say('해제 실패: '+err.message, 'err'); }
  });

  /* search across all three event types */
  const stores = {};
  const runSearch = async () => {
    const q = search.value.trim().toLowerCase();
    if(q.length < 1){ hits.innerHTML=''; return; }
    const out = [];
    for(const et of EVS){
      if(!stores[et]) stores[et] = (await entity(et)).list;
      const idf = ID_FIELD[et];
      for(const r of stores[et]){
        if(String(r[idf])===String(parentId)) continue;
        if((r.title||'').toLowerCase().includes(q)){ out.push({et, r}); if(out.length>=12) break; }
      }
      if(out.length>=12) break;
    }
    hits.innerHTML = out.length
      ? out.map(({et,r})=>`<button class="ed-hit" data-id="${esc(r[ID_FIELD[et]])}" data-type="${esc(et)}">${esc(r.title||r[ID_FIELD[et]])} <i>${esc((th(et)||{}).label||et)}</i></button>`).join('')
      : `<div class="ed-nohit">결과 없음 — 유형 선택 후 “+ 신규 등록”으로 추가</div>`;
  };
  let tmr; search.addEventListener('input', ()=>{ clearTimeout(tmr); tmr=setTimeout(runSearch, 130); });
  hits.addEventListener('click', async e=>{
    const btn = e.target.closest('.ed-hit'); if(!btn) return;
    const et = btn.dataset.type, cid = btn.dataset.id;
    const rec = (await entity(et)).byId.get(cid);
    linkEvent(et, cid, rec);
  });

  /* changing the type while a new-event form is open resets it */
  evType.addEventListener('change', ()=>{ if(newForm.dataset.open){ newForm.dataset.open=''; newForm.innerHTML=''; newBtn.textContent='+ 신규 등록'; } });

  /* "+ 신규 등록" → full-metadata form for a new event of the chosen type, then relate it */
  newBtn.onclick = () => {
    if(newForm.dataset.open){ newForm.dataset.open=''; newForm.innerHTML=''; newBtn.textContent='+ 신규 등록'; return; }
    const et = evType.value;
    newForm.dataset.open='1'; newBtn.textContent='신규 등록 닫기';
    const ff = EDIT_FIELDS[et] || [];
    newForm.innerHTML = `<div class="ed-newcard">
      <div class="ed-newcard-h">새 ${esc((th(et)||{}).label||et)} 등록 — 메타데이터 입력</div>
      ${ff.map(f=>fieldRowHTML(f)).join('')}
      <div class="ed-newcard-f"><button class="ed-create">등록 후 연계</button></div>
    </div>`;
    wireMultiFields(newForm);
    newForm.querySelector('.ed-create').onclick = async ()=>{
      const data = {};
      for(const f of ff){
        const [col,,,req] = f;
        const el = newForm.querySelector(`[data-col="${col}"]`);
        let v = el ? el.value.trim() : '';
        if(FIELD_NORM[col]) v = FIELD_NORM[col](v);
        if(req && !v){ say(`${f[1]}은(는) 필수입니다`, 'err'); el && el.focus(); return; }
        if(v) data[col] = v;
      }
      say('신규 등록 중…');
      try{
        const res = await api('/entity/new', {type: et, fields: data});
        await addEntityRecord(et, res.record);
        await linkEvent(et, res.id, res.record);
        newForm.dataset.open=''; newForm.innerHTML=''; newBtn.textContent='+ 신규 등록';
        say(`${res.id} 등록 + 연계됨`, 'ok');
      }catch(err){ say('등록 실패: '+err.message, 'err'); }
    };
  };
}
