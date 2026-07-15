/* ============================================================
   data.js — data access layer
   Lazy-loads & caches the generated JSON; builds in-memory id
   maps and junction indexes; resolves relationships for detail
   pages. Shard hash mirrors tools/build_data.py.
   ============================================================ */
const BASE = 'data';
const SHARDS = 128;
export const ENTITIES = ['exhibition','program','opencall','participant','work','organization','venue'];
export const ID_FIELD = {
  exhibition:'exhibition_id', program:'program_id', opencall:'opencall_id',
  participant:'participant_id', work:'work_id', organization:'organization_id', venue:'venue_id'
};
const TEXT_ENTITIES = new Set(['exhibition','program','opencall','participant','work']);

const cache = new Map();         // generic promise cache by url
function getJSON(url){
  if(!cache.has(url)) cache.set(url, fetch(url).then(r=>{ if(!r.ok) throw new Error(url+' '+r.status); return r.json(); }));
  return cache.get(url);
}

/* polynomial hash — must match Python shard_of() */
function shardOf(id){
  let h = 0; const s = String(id);
  for(let i=0;i<s.length;i++){ h = (Math.imul(h,31) + s.charCodeAt(i)) >>> 0; }
  return h % SHARDS;
}

/* ---- meta + search ---- */
import { setLocalCats } from './i18n.js';
export const meta   = () => getJSON(`${BASE}/meta.json`).then(m => { setLocalCats(m && m.local_categories || []); return m; });
export const searchIndex = () => getJSON(`${BASE}/search.json`);
export const keywordIndex = () => getJSON(`${BASE}/keyword_index.json`);
export const keywordTexts = () => getJSON(`${BASE}/keyword_texts.json`);   // {id: 설명} — lazy, for in-list search

/* ---- entities ---- */
const entityStore = new Map();   // type -> {list, byId}
export async function entity(type){
  if(entityStore.has(type)) return entityStore.get(type);
  const list = await getJSON(`${BASE}/${type}.json`);
  const idf = ID_FIELD[type];
  const byId = new Map(list.map(r=>[r[idf], r]));
  const store = {list, byId, idf};
  entityStore.set(type, store);
  return store;
}
export async function record(type, id){
  const {byId} = await entity(type);
  return byId.get(id) || null;
}
/* long free-text for a single record (sharded, cached per shard) */
export async function text(type, id){
  if(!TEXT_ENTITIES.has(type)) return {};
  const obj = await getJSON(`${BASE}/text/${type}/${shardOf(id)}.json`).catch(()=>({}));
  return obj[id] || {};
}
/* precomputed similarity record for the comparative viz (participant only; sharded) */
export async function sim(type, id){
  if(type!=='participant') return null;
  const obj = await getJSON(`${BASE}/sim/participant/${shardOf(id)}.json`).catch(()=>null);
  return obj ? (obj[id]||null) : null;
}
let _simMap=null;
export async function simMap(){
  if(_simMap===null) _simMap = await getJSON(`${BASE}/sim/participant_map.json`).catch(()=>false);
  return _simMap || null;
}

/* ---- junctions (lazy, indexed per column on demand) ---- */
const relStore = new Map();      // name -> {rows, idx:{col->Map}}
async function rel(name){
  if(relStore.has(name)) return relStore.get(name);
  const rows = await getJSON(`${BASE}/rel/${name}.json`);
  const store = {rows, idx:{}};
  relStore.set(name, store);
  return store;
}
async function relBy(name, col, val){
  const store = await rel(name);
  if(!store.idx[col]){
    const m = new Map();
    for(const row of store.rows){ const k = row[col]; if(k==null) continue; (m.get(k) || m.set(k,[]).get(k)).push(row); }
    store.idx[col] = m;
  }
  return store.idx[col].get(val) || [];
}

/* multi-source provenance: external sources (aggregators) attesting this record */
export async function recordSources(id){
  return relBy('record_source', 'entity_id', id);
}

/* Resolve a list of junction rows into target entity records.
   spec: {name, key, keyVal, otherCol, otherType, roleCol, sort} */
async function resolve({name, key, keyVal, otherCol, otherType, roleCol, roleFn, sort=true}){
  let rows = await relBy(name, key, keyVal);
  if(sort && rows.length && 'sort_order' in rows[0]) rows = [...rows].sort((a,b)=>(a.sort_order??1e9)-(b.sort_order??1e9));
  const {byId} = await entity(otherType);
  const out = [];
  for(const row of rows){
    const r = byId.get(row[otherCol]);
    const role = roleFn ? roleFn(row) : (roleCol ? row[roleCol] : null);
    if(r) out.push({rec:r, role, type:otherType});
  }
  return out;
}
/* participant <-> organization: most rows have no role, so derive an
   affiliation label (period_marker '전' = former). */
const affil = row => {
  const r = row.role, former = row.period_marker === '전';
  if(r) return former ? `전 ${r}` : r;
  return former ? '전 소속' : '소속';
};

/* ---- high-level relationship bundles for detail pages ---- */
export async function relationsFor(type, id){
  const R = {};
  if(type==='exhibition'){
    R.participants = await resolve({name:'exhibition_participant', key:'exhibition_id', keyVal:id, otherCol:'participant_id', otherType:'participant', roleCol:'event_role'});
    R.organizations= await resolve({name:'exhibition_organization',key:'exhibition_id', keyVal:id, otherCol:'organization_id',otherType:'organization',roleCol:'role'});
    R.venues       = await resolve({name:'exhibition_venue',       key:'exhibition_id', keyVal:id, otherCol:'venue_id',       otherType:'venue'});
    R.works        = await resolve({name:'work_exhibition',        key:'exhibition_id', keyVal:id, otherCol:'work_id',        otherType:'work'});
    R.related      = await eventRelations('exhibition', id);
  } else if(type==='program'){
    R.participants = await resolve({name:'program_participant', key:'program_id', keyVal:id, otherCol:'participant_id', otherType:'participant', roleCol:'event_role'});
    R.organizations= await resolve({name:'program_organization',key:'program_id', keyVal:id, otherCol:'organization_id',otherType:'organization',roleCol:'role'});
    R.venues       = await resolve({name:'program_venue',       key:'program_id', keyVal:id, otherCol:'venue_id',       otherType:'venue'});
    R.related      = await eventRelations('program', id);
  } else if(type==='opencall'){
    R.organizations= await resolve({name:'opencall_organization', key:'opencall_id', keyVal:id, otherCol:'organization_id', otherType:'organization', roleCol:'role'});
    R.venues       = await resolve({name:'opencall_venue',        key:'opencall_id', keyVal:id, otherCol:'venue_id',        otherType:'venue'});
  } else if(type==='participant'){
    R.exhibitions  = await resolve({name:'exhibition_participant', key:'participant_id', keyVal:id, otherCol:'exhibition_id', otherType:'exhibition', roleCol:'event_role'});
    R.programs     = await resolve({name:'program_participant',    key:'participant_id', keyVal:id, otherCol:'program_id',    otherType:'program',    roleCol:'event_role'});
    R.works        = await resolve({name:'work_participant',       key:'participant_id', keyVal:id, otherCol:'work_id',       otherType:'work',       roleCol:'role'});
    R.organizations= await resolve({name:'participant_organization',key:'participant_id',keyVal:id, otherCol:'organization_id',otherType:'organization',roleFn:affil});
    const {list:_pall} = await entity('participant');        // team/group ← its members (reverse parent_team_id)
    const _mem = _pall.filter(p => p.parent_team_id === id);
    if(_mem.length) R.members = _mem.map(p => ({rec:p, role:null, type:'participant'}));
  } else if(type==='work'){
    R.participants = await resolve({name:'work_participant', key:'work_id', keyVal:id, otherCol:'participant_id', otherType:'participant', roleCol:'role'});
    R.exhibitions  = await resolve({name:'work_exhibition',  key:'work_id', keyVal:id, otherCol:'exhibition_id',  otherType:'exhibition'});
    R.organizations= await resolve({name:'work_organization',key:'work_id', keyVal:id, otherCol:'organization_id',otherType:'organization',roleCol:'role'});
  } else if(type==='organization'){
    R.exhibitions  = await resolve({name:'exhibition_organization', key:'organization_id', keyVal:id, otherCol:'exhibition_id', otherType:'exhibition', roleCol:'role'});
    R.programs     = await resolve({name:'program_organization',    key:'organization_id', keyVal:id, otherCol:'program_id',    otherType:'program',    roleCol:'role'});
    R.opencalls    = await resolve({name:'opencall_organization',   key:'organization_id', keyVal:id, otherCol:'opencall_id',   otherType:'opencall',   roleCol:'role'});
    R.participants = await resolve({name:'participant_organization',key:'organization_id', keyVal:id, otherCol:'participant_id',otherType:'participant',roleFn:affil});
  } else if(type==='venue'){
    R.exhibitions  = await resolve({name:'exhibition_venue', key:'venue_id', keyVal:id, otherCol:'exhibition_id', otherType:'exhibition'});
    R.programs     = await resolve({name:'program_venue',    key:'venue_id', keyVal:id, otherCol:'program_id',    otherType:'program'});
    R.opencalls    = await resolve({name:'opencall_venue',   key:'venue_id', keyVal:id, otherCol:'opencall_id',   otherType:'opencall'});
  }
  return R;
}

/* event_relation links events to events (either direction) */
async function eventRelations(type, id){
  const out = [];
  const from = await relBy('event_relation','from_id', id);
  const to   = await relBy('event_relation','to_id', id);
  for(const row of from){ if(row.from_type===type) out.push({otherType:row.to_type, otherId:row.to_id, title:row.related_title, url:row.related_url, dir:'→'}); }
  for(const row of to){   if(row.to_type===type)   out.push({otherType:row.from_type, otherId:row.from_id, title:row.related_title, url:row.related_url, dir:'←'}); }
  // resolve titles where we have the record
  for(const o of out){
    if(o.otherId){ const r = await record(o.otherType, o.otherId); if(r) o.rec = r; }
  }
  return out;
}

/* filter an entity list by a facet predicate (string equals, multi-includes).
   wildcard: a record flag (e.g. is_nationwide / is_all_genre) whose truthy records match ANY value —
   so filtering Region=부산 also keeps 전국 opencalls, and Field=사진 keeps 전 장르 opencalls. Without this,
   the 19%-전국 / 68%-전체 records vanish under a specific filter (the silent recall-killer). */
export function facetFilter(list, field, value, {multi=false, wildcard=null}={}){
  if(value==null || value==='') return list;
  if(multi) return list.filter(r => (wildcard && r[wildcard]) || (Array.isArray(r[field]) && r[field].includes(value)));
  return list.filter(r => (wildcard && r[wildcard]) || String(r[field]) === String(value));
}

export { shardOf };

/* ============================================================
   in-page editor support (TEMPORARY tool) — patch the cached
   data in place so a save shows immediately, without waiting
   for the background xlsx rebuild.
   ============================================================ */
const _COMMA = v => String(v ?? '').split(',').map(s=>s.trim()).filter(Boolean);
const _BAR   = v => String(v ?? '').split('|').map(s=>s.trim()).filter(Boolean);
const _LONG  = ['description_text','application_qualification','review_criteria','application_info_text','support_amount_text','inquiry_contact'];

export async function applyRecordPatch(type, id, fields){
  const {byId} = await entity(type);
  const r = byId.get(id);
  if(!r) return null;
  for(const [k,v] of Object.entries(fields)){ if(!_LONG.includes(k)) r[k] = (v===''? null : v); }
  if('role' in fields)          r.roles    = _COMMA(fields.role);            // detail facts read the derived arrays
  if('activity_type' in fields) r.activity = _COMMA(fields.activity_type);
  if('type' in fields && (type==='organization'||type==='venue')) r.type_list = _COMMA(fields.type);
  if('start_date' in fields){ const m = String(fields.start_date||'').match(/^(\d{4})/); if(m) r.year = +m[1]; }
  // long free-text lives in the sharded text cache
  if(TEXT_ENTITIES.has(type)){
    const longs = {};
    for(const f of _LONG) if(f in fields) longs[f] = (fields[f]===''? null : fields[f]);
    if(Object.keys(longs).length){
      const url = `${BASE}/text/${type}/${shardOf(id)}.json`;
      if(cache.has(url)){ try{ const obj = await cache.get(url); if(obj) obj[id] = Object.assign({}, obj[id], longs); }catch(e){} }
      if('description_text' in longs) r.prev = longs.description_text ? String(longs.description_text).replace(/\s+/g,' ').trim().slice(0,220) : null;
    }
  }
  return r;
}
export async function addEntityRecord(type, rec){
  const st = await entity(type), key = rec[st.idf];
  if(type==='participant'){ rec.roles = _COMMA(rec.role); rec.activity = _COMMA(rec.activity_type); }
  if(type==='organization'||type==='venue'){ rec.type_list = _COMMA(rec.type); }
  rec._c = rec._c || {};
  if(!st.byId.has(key)){ st.byId.set(key, rec); st.list.push(rec); }
  return rec;
}
export async function addLinkRow(name, row){
  const store = await rel(name);          // ensure the junction is loaded
  store.rows.push(row);
  store.idx = {};                         // bust column indexes so resolve() rebuilds with the new row
}
const _match = (r, m) => Object.entries(m).every(([k,v]) => String(r[k]) === String(v));
export async function removeLinkRow(name, match){
  const store = await rel(name);
  store.rows = store.rows.filter(r => !_match(r, match));
  store.idx = {};
}
export async function updateLinkRole(name, match, roleCol, role){
  const store = await rel(name);
  for(const r of store.rows){ if(_match(r, match)) r[roleCol] = (role || null); }
  store.idx = {};
}
