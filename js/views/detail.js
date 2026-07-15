/* ============================================================
   detail.js — record dossier pages for all 7 entity types
   ============================================================ */
import { record, text, relationsFor, sim, simMap, ID_FIELD, recordSources, keywordIndex, meta } from '../data.js';
import { th, thName, esc, num, thumbHTML, titleOf, subOf, fmtDate, fmtRange, qr, setCrumb, paintLogos, pixelBurst, glossLabel } from '../ui.js';
import { mount } from '../app.js';
import { editAvailable, openEditor } from '../edit.js';
import { L, D, vlabel, kwLabel, mediumLabel, seriesLabel, isLocalCat } from '../i18n.js';

const app = document.getElementById('app');

/* field labels (bilingual via L) — lazy so L() re-evaluates on each render after a language toggle */
const LABEL = () => ({
  source_system:L('출처','Source'), exhibition_field:L('분야','Field'), exhibition_genre:L('장르','Genre'), series:L('시리즈','Series'),
  works_count:L('작품 수','Works Count'), venue_text:L('장소','Venue'), organizer:L('주최/​주관','Organizer/​Supporter'), admission:L('관람료','Admission'),  // ZWSP after '/' so the narrow label column wraps to two lines
  program_type:L('프로그램 유형','Program type'), category_upper:L('분류','Category'),
  category_lower:L('세부 분류','Sub-category'), audience:L('대상','Audience'), capacity_text:L('정원','Capacity'),
  education_day:L('요일','Schedule'), time_text:L('시간','Time'), region:L('지역','Region'), venue:L('장소(원문)','Venue (text)'),
  public_or_other:L('주최 구분','Sector'), target:L('신청 대상','Target'), field:L('분야','Field'), category:L('지원 유형','Category'),
  name_en:L('이름(영문)','Name (EN)'), birth_year:L('출생','Born'), death_year:L('사망','Died'), type:L('유형','Type'), role:L('역할','Role'),
  active_field:L('활동 분야','Active field'), activity_type:L('활동','Activity'), parent_team_id:L('소속 팀','Parent team'),
  title_en:L('제목(영문)','Title (EN)'), year_created_text:L('제작연도','Year'), workType:L('작품유형','Medium'), material_raw:L('재료','Material'),
  size_text:L('크기(cm)','Dimensions (cm)'), acquisition_method:L('수집 방법','Acquisition'), collection:L('컬렉션','Collection'),
  name_kr:L('이름(국문)','Name (KR)'), country:L('국가','Country'), institution:L('운영기관','Institution'), building:L('건물/분관','Building'),
  floor:L('층','Floor'), room:L('공간','Room'), address:L('주소','Address'), start_date:L('시작일','Start'), end_date:L('종료일','End'),
});
const FIELDS = {
  exhibition:['source_system','venue_text','exhibition_genre','exhibition_field','series','organizer','admission','works_count'],
  program:['program_type','source_system','category_upper','category_lower','audience','capacity_text','education_day','time_text'],
  opencall:['public_or_other','region','venue','target','field','category'],
  participant:['name_kr','name_en','type','birth_year','death_year','active_field','role','activity_type','parent_team_id'],
  work:['source_system','title_en','year_created_text','workType','material_raw','size_text','acquisition_method','collection'],
  organization:['name_en','type','country'],
  venue:['institution','building','floor','room','type','address'],
};
/* Field definitions shown as hover tooltips. Composite keys ("type.field")
   override the generic key when the same column means different things per entity. */
const FIELD_DESC = () => ({
  /* shared */
  source_system:L('1차 출처 기관 — 국립현대미술관·서울시립미술관·국립아시아문화전당, 공모는 아르코 아트누리.','Primary source institution — MMCA, SeMA, ACC; open calls come from ARKO ARTNURI.'),
  wikidata_qid:L('2차 보강으로 연결된 위키데이터 엔터티 ID — 공개 지식베이스로 이동합니다.','Wikidata entity ID linked via secondary enrichment — opens the public knowledge base.'),
  name_kr:L('국문 대표 표기명(비한국 레코드는 원어 표기).','Primary Korean name (native script for non-Korean records).'),
  name_en:L('로마자 또는 영문 표기명(있을 경우).','Romanized or English name (where available).'),
  start_date:L('시작일, ISO 8601(YYYY-MM-DD).','Start date, ISO 8601 (YYYY-MM-DD).'),
  end_date:L('종료일, ISO 8601(YYYY-MM-DD).','End date, ISO 8601 (YYYY-MM-DD).'),

  /* exhibition */
  exhibition_field:L('전시 작품의 매체·분야 — 전시의 예술 분야이며 기획 유형이 아닙니다.','Medium/field of the exhibited works — the art field of the show, not its curatorial type.'),
  exhibition_genre:L('기관 자체 분류 체계 안에서의 전시 유형(예: 기획).','Exhibition type within the institution’s own classification scheme (e.g. curated).'),
  series:L('이 전시가 속한 기획 시리즈. 비어 있으면 단독 전시입니다.','The curatorial series this exhibition belongs to. Empty means a standalone exhibition.'),
  works_count:L('전시 작품 수. 출처가 근사·비수치 표현을 쓰는 경우가 많아 원문 그대로 보존(예: “100여점”, “미정”).','Number of works exhibited. Sources often use approximate or non-numeric wording, so it is kept verbatim (e.g. “about 100 works”, “TBD”).'),
  venue_text:L('출처 페이지의 장소 원문(예: “서울관 지하1층 6,7전시실”) — 아래 연결된 장소 레코드를 보완합니다.','Venue text from the source page (e.g. “Seoul B1F Galleries 6, 7”) — complements the linked venue record below.'),
  organizer:L('출처 페이지에 게시된 주최·주관·후원 기관.','Host, organizer, and sponsor institutions as posted on the source page.'),
  admission:L('출처의 관람료 원문(예: “무료”, “2,000원”).','Admission text from the source (e.g. “Free”, “2,000 won”).'),

  /* program */
  program_type:L('공공프로그램 유형: 교육 또는 문화 — ID에도 인코딩됨(PRO_EDU / PRO_CUL).','Public program type: education or culture — also encoded in the ID (PRO_EDU / PRO_CUL).'),
  category_upper:L('기관 부여 대분류 — 대상 라벨(성인, 어린이)과 내용 라벨(전시연계, 학술행사)이 섞임. 복수값은 쉼표로 구분.','Institution-assigned top-level category — mixes audience labels (adult, children) with content labels (exhibition-linked, academic event). Multiple values separated by commas.'),
  category_lower:L('대분류 아래의 세부 분류(예: 미술아카데미, 워크숍). 대괄호 접두어는 장소를 뜻합니다.','Sub-category under the top-level category (e.g. art academy, workshop). A bracketed prefix denotes the venue.'),
  audience:L('출처의 대상 관람객 원문(예: “보호자 동반 유아 및 어린이”). 주요 구분: 성인/일반인, 어린이, 청소년, 모든 연령.','Target audience text from the source (e.g. “infants and children accompanied by a guardian”). Main groups: adults/general, children, youth, all ages.'),
  capacity_text:L('모집 정원 원문. 출처 표기가 제각각이라 미파싱 보존(예: “30명”, “10명 내외”, “선착순”).','Capacity text, verbatim. Source wording varies so it is kept unparsed (e.g. “30 people”, “about 10”, “first come, first served”).'),
  education_day:L('세션이 열리는 요일(국문). 여러 요일이면 쉼표로 구분. 주로 정기 교육 프로그램에 채워짐.','Days of the week the sessions run (Korean). Multiple days separated by commas. Mostly filled for recurring education programs.'),
  time_text:L('세션 시간 원문 — 게시된 대로 복수 세션·소요시간·반복 패턴을 포함할 수 있음.','Session time text — may include multiple sessions, durations, and recurrence patterns as posted.'),

  /* open call */
  public_or_other:L('주최가 공공부문인지 그 외인지.','Whether the host is in the public sector or otherwise.'),
  region:L('공모가 대상으로 하는 행정구역. 국문 시·도 약칭 사용(예: 세종).','Administrative region the open call targets. Uses Korean province/city abbreviations (e.g. Sejong).'),
  venue:L('공모와 관련된 장소 원문(예: 학사동 갤러리).','Venue text related to the open call (e.g. Haksa Building Gallery).'),
  target:L('신청 가능 대상 유형(예: 개인 / 단체).','Eligible applicant types (e.g. individual / group).'),
  field:L('공모가 다루는 예술 분야(예: 다원예술, 시각예술, 전통예술).','Art fields the open call covers (e.g. interdisciplinary, visual, traditional arts).'),
  category:L('제공되는 지원 유형(예: 창작지원).','Type of support offered (e.g. creation support).'),

  /* participant */
  'participant.type':L('참여자 종류 — 개인(1인), 팀(지속적 명명 협업), 협업 그룹(일회성 즉석 협업), 미상.','Participant kind — individual (one person), team (a named ongoing collaboration), collaborative group (a one-off ad-hoc collaboration), unknown.'),
  birth_year:L('출생연도(4자리).','Birth year (4 digits).'),
  death_year:L('사망연도(4자리). 생존·미상·비개인 참여자는 비어 있음.','Death year (4 digits). Empty for living, unknown, or non-individual participants.'),
  active_field:L('활동 분야 태그(예: 회화, 조각, 사진). 다수는 아르코예술기록원(DA-Arts)에서 상속됐으나, 일부는 후속 적재로 채워진 분류 태그입니다.','Active-field tags (e.g. painting, sculpture, photography). Most are inherited from the Arko Arts Archive (DA-Arts), but some are classification tags filled by later ingestion.'),
  daarts_url:L('아르코예술기록원 DA-Arts 작가 프로필(미술작가 500人 명부 또는 DSpace 영구주소)로 연결.','Links to the Arko Arts Archive DA-Arts artist profile (the 500 Visual Artists roster or a DSpace permanent URL).'),
  role:L('그 사람이 맡은 전문 역할(예: 작가, 큐레이터, 교수, 강사, 평론가).','The professional role the person held (e.g. artist, curator, professor, lecturer, critic).'),
  activity_type:L('예술 활동 통제어휘 태그 — 창작 / 기획 / 교육 / 연구 / 공연 / 비평 / 운영 / 지원.','Controlled-vocabulary tags for artistic activity — Create / Curate / Educate / Research / Perform / Critique / Manage / Support.'),
  parent_team_id:L('이 개인이 속한 팀/콜렉티브(해당 참여자 레코드로 연결).','The team/collective this individual belongs to (links to that participant record).'),

  /* work */
  title_en:L('기관이 등록한 작품의 영문 제목.','English title of the work as registered by the institution.'),
  year_created_text:L('제작 연도 또는 시기, 원문 그대로(예: “2010년대”).','Year or period created, verbatim (e.g. “2010s”).'),
  workType:L('기관이 분류한 작품 유형(예: 회화).','Work type as classified by the institution (e.g. painting).'),
  material_raw:L('재료와 기법을 결합한 표기. 미술계 관용 표현 보존(예: 종이에 젤라틴실버프린트).','Materials and technique combined. Art-world conventional phrasing preserved (e.g. gelatin silver print on paper).'),
  size_text:L('크기·재생시간 등 원문 — 크기는 센티미터, 재생시간은 mm:ss.','Dimensions/runtime text — dimensions in centimeters, runtime as mm:ss.'),
  acquisition_method:L('작품이 소장된 경위 — 기증, 구입, 관리전환.','How the work entered the collection — donation, purchase, transfer.'),
  'work.collection':L('출처 미술관이 지정한 특별 컬렉션 소속(예: SeMA 컬렉션 200, 천경자 컬렉션).','Named museum collection(s) this work belongs to (e.g. SeMA Collection 200, Chun Kyung-ja Collection).'),

  /* organization */
  'organization.name_en':L('기관 자체 공표 또는 위키데이터를 통해 확인되는 영문 표기명.','English name as published by the organization itself or confirmed via Wikidata.'),
  'organization.type':L('기관 유형 태그(쉼표 구분): 기업, 재단, 교육기관, 문화공간, 지자체, 정부기관, 미술관/박물관, 협회, 갤러리, 해외기관, 행사, 기타.','Organization type tags (comma-separated): company, foundation, educational institution, cultural space, local government, government agency, museum, association, gallery, overseas institution, event, other.'),
  country:L('ISO 3166-1 alpha-2 국가 코드(OTHER=국적 모호, INTL=국제·초국가 기관).','ISO 3166-1 alpha-2 country code (OTHER = ambiguous nationality, INTL = international/supranational organization).'),

  /* venue */
  institution:L('장소가 속한 운영 기관, 국문(예: 국립현대미술관).','The operating institution the venue belongs to, in Korean (e.g. MMCA).'),
  building:L('기관 내 분관·건물명(예: 서울관).','Branch/building name within the institution (e.g. Seoul branch).'),
  floor:L('층 표기 원문, 지하 표기 포함(예: 3층).','Floor text, verbatim, including basement notation (e.g. 3F).'),
  room:L('게시된 구체 전시실·홀·하위 공간명(예: 제1전시실).','Specific gallery, hall, or sub-space name as posted (e.g. Gallery 1).'),
  'venue.type':L('장소 유형 태그(쉼표 구분, 예: 국·공립, 미술관/박물관).','Venue type tags (comma-separated, e.g. national/public, museum).'),
  address:L('상위 건물의 도로명 주소, 국문.','Street address of the parent building, in Korean.'),

  /* semantic tags (Themes section) */
  keywords:L('전시의 제목과 설명에서 LLM(Claude Sonnet 4.6)이 추출한 주제어 3~5개로, Getty AAT의 Related Concepts 관점에 따라, (매체·기법·작가·장소를 제외한) 오직 전시의 내용과 관련된 키워드.','3–5 thematic keywords extracted by an LLM (Claude Sonnet 4.6) from the exhibition’s title and description, following Getty AAT’s Related Concepts perspective — keywords about the exhibition’s content only (excluding medium, technique, artist, and venue).'),
  aat:L('위 키워드를 한 단계 위에서 아우르는 상위 분류 — Getty AAT의 Related Concepts 어휘에 매핑한 범주로 국문 표시(영문 주석은 저장하되 숨김). 미매칭 키워드 중 3회 이상은 자체 범주가 되고, 드문 것은 기타로 묶임.','A higher-level category that subsumes the keywords above — mapped to Getty AAT’s Related Concepts vocabulary and shown in Korean (the English gloss is stored but hidden). Unmatched keywords appearing 3+ times become their own category; rare ones are grouped under Other.'),
});
function descFor(type, f){ const FD = FIELD_DESC(); return FD[`${type}.${f}`] || FD[f] || ''; }
function fmtVal(type, f, v){
  if(f==='source_system') return vlabel(v);
  if(f==='type' && type==='participant') return vlabel(v);
  if(f==='workType') return vlabel(v);
  if(f==='country') return vlabel(v);
  if(f==='program_type') return vlabel(v);
  return v;
}
/* opencall structured sections — decomposed out of description_text into their own columns; rendered
   as titled markdown sections (대상→자격 / 지원 / 신청 / 심사 / 문의). description_text keeps 개요·모집분야·일정. */
const TEXTBLOCKS = {
  opencall:[['application_qualification',L('대상·자격','Eligibility')],['support_amount_text',L('지원내용·금액','Support & Amount')],['application_info_text',L('신청방법','How to Apply')],['review_criteria',L('심사','Review')],['inquiry_contact',L('문의','Contact')]],
};

export async function detailView(type, id){
  if(!ID_FIELD[type]){ mount(`<div class="empty">${L('알 수 없는 유형입니다.','Unknown type.')}</div>`); return; }
  const t = th(type);
  mount(`<div class="detail-loading"><span class="spin"></span></div>`, 'page');
  const [rec, txt, rel, simData, sources] = await Promise.all([ record(type,id), text(type,id), relationsFor(type,id), sim(type,id), recordSources(id), meta() ]);   // meta → local_categories(† 자체분류) 주입 보장
  if(!rec){ mount(`<div class="empty"><b>${esc(id)}</b> ${L('레코드를 찾을 수 없습니다.','Record not found.')}<br><br><a class="pill" href="#/">${L('↑ 입구','↑ Entrance')}</a></div>`); return; }
  const mapData = simData ? await simMap() : null;   // field-map backdrop, only when this record has sim data

  const title = titleOf(type,rec), sub = subOf(type,rec);
  setCrumb(`${thName(type)} / ${id}`);

  const hero = rec.thumb
      ? `<div class="dt-photo"><img src="${esc(rec.thumb)}" alt=""></div>` : '';

  const dateline = datelineOf(type, rec);
  const facts = factsHTML(type, rec);
  const tags = tagsHTML(rec);
  const desc = descHTML(type, rec, txt);
  const artists = artistTextHTML(rec);
  const blocks = textBlocksHTML(type, txt);
  const gallery = galleryHTML(type, txt);
  // exhibitions get the archive-POSITION group (filled async from keyword_index) instead of the egocentric profile
  const profileGroup = type==='exhibition' ? '' : profileGroupHTML(type, rec, rel);
  const peerGroup = peerGroupHTML(simData, mapData, t.accent);  // PEER tabs: orbit / map / deviation / twin↔opposite
  const sections = relSectionsHTML(type, rel);
  const ext = extLinksHTML(type, rec);
  const prov = provenanceHTML(rec, sources);
  const backHash = backFor(type);

  mount(`
    <div class="dt-top"><a class="pill dt-back" href="${backHash}">${L('← 뒤로','← BACK')}</a><button class="pill dt-edit" hidden>${L('✎ 편집','✎ EDIT')}</button></div>
    <article class="detail" style="--accent:${t.accent}">
      <header class="dt-head${rec.thumb?' dt-head-photo':''}">
        <div class="dt-head-main">
          <div class="dt-kicker"><span class="logo" data-logo="white"></span><span>${thName(type)} · ${t.label}</span></div>
          <h1 class="dt-title">${esc(title)}</h1>
          ${sub?`<div class="dt-sub">${esc(sub)}</div>`:''}
          ${dateline?`<div class="dt-dateline">${dateline}</div>`:''}
        </div>
        ${hero}
        <div class="dt-stub">
          <div class="dt-stub-id">${esc(id)}</div>
          <div class="dt-stub-mark">${qr(id, 54)}<div class="barcode" style="width:120px;margin-top:8px"></div></div>
        </div>
      </header>
      <div class="dt-berries" aria-hidden="true"><span class="dt-berry b1"></span><span class="dt-berry b2"></span><span class="dt-berry b3"></span><span class="dt-berry b4"></span></div>

      <div class="dt-grid">
        <div class="dt-main">
          ${tags}
          ${desc}
          ${blocks}
          ${gallery}
          ${profileGroup}
          ${peerGroup}
          ${sections}
          ${!desc && !blocks && !gallery && !profileGroup && !peerGroup && !sections && !tags ? '<div class="empty">No further detail recorded for this entry.</div>':''}
        </div>
        <aside class="dt-aside">
          <div class="dt-card">
            <div class="dt-card-h">${L('레코드','Record')}</div>
            <dl class="facts">${facts}</dl>
            ${ext}
            ${prov}
          </div>
          ${artists}
          ${type==='exhibition' ? '<div id="dt-archpos-aside"></div>' : connSummaryHTML(type, rec)}
        </aside>
      </div>
    </article>`);
  paintLogos(app);
  wireExpanders();
  wireTooltips();
  wireDetailBerries();
  wireVizTabs();
  if(type==='exhibition') fillArchPosition(id, rec);   // async: where this show sits in the whole archive
  wireEditButton(type, id);
}

/* ---------- in-page editor (temporary tool): show ✎ EDIT only when the sidecar
   edit server is reachable; re-render this page in place after a save ---------- */
async function wireEditButton(type, id){
  const btn = app.querySelector('.dt-edit');
  if(!btn) return;
  if(!(await editAvailable())) return;          // edit server down → stay read-only
  btn.hidden = false;
  btn.addEventListener('click', ()=> openEditor(type, id, ()=> detailView(type, id)));
}

/* ---------- hero açaí berries: pop into pixels on click, then a fresh one rolls back in ---------- */
function wireDetailBerries(){
  const wrap = app.querySelector('.dt-berries');
  if(!wrap) return;
  wrap.addEventListener('click', e=>{
    const b = e.target.closest('.dt-berry');
    if(!b || b.classList.contains('popped')) return;
    const r = b.getBoundingClientRect();
    pixelBurst(r.left + r.width/2, r.top + r.height/2);            // same pixel-burst as buttons + bg berries
    b.classList.add('popped');                                    // bursts away
    setTimeout(()=>{ if(!b.isConnected) return;
      b.classList.remove('popped');
      b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';   // a fresh one tumbles back in
    }, 1400);
  });
}

/* ---------- dateline ---------- */
function datelineOf(type, r){
  if(type==='exhibition'||type==='program') return fmtRange(r.start_date,r.end_date);
  if(type==='opencall'){
    const open = fmtRange(r.start_date,r.end_date);
    return open ? `<span class="dl-strong">${L(`접수 ${open}`,`Apply ${open}`)}</span>` : '';
  }
  if(type==='participant'){ const a=r.birth_year, b=r.death_year; return a||b? `${a||'?'}–${b||''}` : ''; }
  if(type==='work') return r.year_created_text? esc(r.year_created_text):'';
  return '';
}

/* ---------- facts table ---------- */
function factsHTML(type, r){
  const rows = [];
  for(const f of (FIELDS[type]||[])){
    let v = r[f];
    if(f==='role' && r.roles && r.roles.length) v = r.roles.join(', ');   // comma + space
    if(f==='activity_type' && r.activity) v = r.activity.map(a=>vlabel(a)).join(', ');
    if(f==='venue_text')   v = D(r.venue_text, r.venue_text_en) || v;     // EN page metadata when present
    if(f==='organizer')    v = D(r.organizer, r.organizer_en) || v;
    if(f==='admission')    v = D(r.admission, r.admission_en) || v;
    if(f==='exhibition_genre' || f==='exhibition_field') v = mediumLabel(v);
    if(f==='series')       v = seriesLabel(v);
    if(f==='collection' && typeof v==='string') v = v.split('|').join(', ');   // multi-collection membership
    if(v==null || v==='') continue;
    v = fmtVal(type, f, v);
    if(type==='opencall' && typeof v==='string'){ v = stripMarks(v); if(!v) continue; }
    const d = descFor(type, f);
    const tip = d ? ` data-tip="${esc(d)}" tabindex="0"` : '';
    const dd = (f==='parent_team_id' && r.parent_team_id)
      ? `<a class="fact-link" href="#/participant/${encodeURIComponent(r.parent_team_id)}">${esc(r.parent_team_name || r.parent_team_id)}</a>`
      : esc(v);
    rows.push(`<div class="fact${d?' has-tip':''}"${tip}><dt>${esc(LABEL()[f]||f)}</dt><dd>${dd}</dd></div>`);
  }
  if(r.wikidata_qid) rows.push(`<div class="fact has-tip" data-tip="${esc(descFor(type,'wikidata_qid'))}" tabindex="0"><dt>Wikidata</dt><dd><a class="ext" href="https://www.wikidata.org/wiki/${esc(r.wikidata_qid)}" target="_blank" rel="noopener">${esc(r.wikidata_qid)} ↗</a></dd></div>`);
  if(r.daarts_url) rows.push(`<div class="fact has-tip" data-tip="${esc(descFor(type,'daarts_url'))}" tabindex="0"><dt>DA-Arts</dt><dd><a class="ext" href="${esc(r.daarts_url)}" target="_blank" rel="noopener">${L('아르코예술기록원 프로필 ↗','Arko Arts Archive profile ↗')}</a></dd></div>`);
  return rows.join('') || '<div class="fact"><dd class="dim">—</dd></div>';
}

/* ---------- description ---------- */
/* normalize free text → paragraphs: trim each line, collapse internal whitespace,
   drop blank / whitespace-only lines (fixes stray "\n \n" empty paragraphs and
   ragged hard-wraps). Each remaining non-empty line is one paragraph. */
function prose(d){
  return String(d).split('\n')
    .map(s => s.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`).join('');
}
/* ---- lightweight markdown (opencall descriptions arrive as GFM: ## headings, | tables |,
   - lists, **bold**, --- rules, > quotes). Only structural md is supported; everything is escaped. */
function mdInline(s){
  let h = esc(s);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  h = h.replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return h;
}
function mdRow(t){ return t.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim()); }
function mdTable(header, body){
  const h = '<tr>'+header.map(c=>`<th>${mdInline(c)}</th>`).join('')+'</tr>';
  const b = body.map(r=>'<tr>'+r.map(c=>`<td>${mdInline(c)}</td>`).join('')+'</tr>').join('');
  return `<div class="md-tablewrap"><table class="md-table"><thead>${h}</thead><tbody>${b}</tbody></table></div>`;
}
function mdLite(src){
  const L = String(src).replace(/\r/g,'').split('\n');
  const isSep = s => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(s);
  const out = []; let i = 0;
  while(i < L.length){
    const t = L[i].trim();
    if(!t){ i++; continue; }
    if(t.startsWith('|') && i+1 < L.length && isSep(L[i+1])){           // table
      const head = mdRow(t); i += 2; const body = [];
      while(i < L.length && L[i].trim().startsWith('|')){ body.push(mdRow(L[i].trim())); i++; }
      out.push(mdTable(head, body)); continue;
    }
    let m = t.match(/^(#{1,6})\s+(.*)$/);                                // heading
    if(m){ const lv = Math.min(m[1].length+1, 6); out.push(`<h${lv} class="md-h">${mdInline(m[2])}</h${lv}>`); i++; continue; }
    if(/^(---+|\*\*\*+|___+)$/.test(t)){ out.push('<hr class="md-hr">'); i++; continue; }   // rule
    if(t.startsWith('>')){                                              // blockquote
      const q = []; while(i < L.length && L[i].trim().startsWith('>')){ q.push(L[i].trim().replace(/^>\s?/,'')); i++; }
      out.push(`<blockquote class="md-q">${q.map(mdInline).join('<br>')}</blockquote>`); continue;
    }
    if(/^([-*]|\d+\.)\s+/.test(t)){                                     // list
      const ordered = /^\d+\.\s+/.test(t); const items = [];
      while(i < L.length){ const mm = L[i].trim().match(/^(?:[-*]|\d+\.)\s+(.*)$/); if(!mm) break; items.push(`<li>${mdInline(mm[1])}</li>`); i++; }
      out.push(`<${ordered?'ol':'ul'} class="md-list">${items.join('')}</${ordered?'ol':'ul'}>`); continue;
    }
    const para = [];                                                   // paragraph
    while(i < L.length){
      const lt = L[i].trim();
      if(!lt || lt.startsWith('|') || /^#{1,6}\s/.test(lt) || /^(---+|\*\*\*+|___+)$/.test(lt) ||
         lt.startsWith('>') || /^([-*]|\d+\.)\s+/.test(lt)) break;
      para.push(lt); i++;
    }
    out.push(`<p>${para.map(mdInline).join('<br>')}</p>`);
  }
  return out.join('');
}
/* drop dropped-table placeholders (<표>/<그림>) the artnuri crawl left behind, so they never
   render as literal text on opencall pages (the real table content is shown in the poster gallery). */
function stripMarks(s){ return String(s).replace(/[ \t]*<(?:표|그림)>[ \t]*/g,'').replace(/\n{3,}/g,'\n\n').trim(); }
function descHTML(type, r, txt){
  const d0 = D(txt.description_text, txt.description_text_en) || txt.description_text || r.description_text;
  if(!d0) return '';
  const d = type === 'opencall' ? stripMarks(d0) : d0;
  if(!d) return '';
  const md = type === 'opencall';
  const body = md ? mdLite(d) : prose(d);
  if(!body) return '';
  // image-vision recoveries are transcribed from low-res posters — flag provenance, point to the image.
  const caveat = (type === 'opencall' && r.desc_src === 'image-vision')
    ? `<div class="dt-caveat">${L('이 내용은 원문 포스터 이미지에서 자동 추출된 것으로, 연락처·고유명사·표가 부정확할 수 있습니다. 정확한 정보는 아래 <b>원문 이미지</b>를 확인하세요.','This content was automatically extracted from the original poster image, so contact details, proper nouns, and tables may be inaccurate. For accurate information, check the <b>Source images</b> below.')}</div>`
    : '';
  return `<section class="dt-sec"><h2 class="dt-h2">${L('설명','About')}</h2>${caveat}<div class="dt-prose${md?' dt-md':''}">${body}</div></section>`;
}
/* opencall source images — the notice often lives in posters/cardnews/scans; we kept the originals
   so the info that came as images is shown as images too (img/opencall/<id>/NN.jpg). */
function galleryHTML(type, txt){
  if(type !== 'opencall') return '';
  const raw = txt.notice_images;
  const list = (Array.isArray(raw) ? raw : (raw ? String(raw).split('|') : [])).map(s=>String(s).trim()).filter(Boolean);
  if(!list.length) return '';
  const cells = list.map(p=>`<a class="dt-gimg" href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="" decoding="async"></a>`).join('');
  return `<section class="dt-sec"><h2 class="dt-h2">${L('원문 이미지','Source images')}</h2><div class="dt-gallery">${cells}</div></section>`;
}
/* artist_text — free-text artist info copied verbatim from the source page (editable field).
   Rendered as its own card in the aside, under the RECORD box. */
function artistTextHTML(r){
  const t = D(r.artist_text, r.artist_text_en) || r.artist_text;   // EN page artist text when present
  if(t==null || String(t).trim()==='') return '';
  return `<div class="dt-card"><div class="dt-card-h">${L('작가','Artist')}</div><div class="dt-artists">${prose(t)}</div></div>`;
}
function textBlocksHTML(type, txt){
  const defs = TEXTBLOCKS[type]; if(!defs) return '';
  const md = type === 'opencall';                       // opencall column sections are GFM markdown now
  return defs.map(([f,label])=>{
    const v = txt[f]; if(v==null || String(v).trim()==='') return '';
    const body = md ? mdLite(stripMarks(v)) : prose(v);
    return body ? `<section class="dt-sec"><h2 class="dt-h2">${esc(label)}</h2><div class="dt-prose${md?' dt-md':''}">${body}</div></section>` : '';
  }).join('');
}

/* ---------- semantic tags ---------- */
function tagsHTML(r){
  const kw = r.keywords||[], aat = r.aat||[], kc = r.kwcat||[];
  if(!kw.length && !aat.length) return '';
  // 키워드-카테고리 쌍 레이아웃: 각 키워드 아래가 아니라 위에 그 키워드가 매핑된 상위 분류를 세로로 짝지어 배치.
  // 카테고리 href 는 저장된 원본 키(aat 값)를 그대로 써서 /semantic 라우트가 일치하도록 유지.
  let hasLocal = false;
  const catChip = (k) => {
    const ko = glossStrip(k), loc = isLocalCat(ko);
    if(loc) hasLocal = true;
    const tip = ko==='기타'
      ? L('기타 — Getty AAT에 매핑되지 않은 키워드 중 출현 3회 미만을 묶은 잔여 그룹. 클릭 시 해당 행사 보기','Other — residual group of keywords with no Getty AAT mapping, each appearing fewer than 3 times. Click to view its events')
      : loc
      ? L(`“${esc(ko)}” — 자체 보완 분류(Getty AAT에 대응 범주 없음). 클릭 시 해당 행사 보기`,`“${esc(glossLabel(k))}” — supplemental local category (outside Getty AAT). Click to view its events`)
      : L(`Getty AAT “${esc(glossLabel(k))}” 분류의 모든 행사 보기`,`View all events in the Getty AAT “${esc(glossLabel(k))}” category`);
    return `<a class="tag aat th-cat${loc?' th-loc':''}" href="#/semantic/${encodeURIComponent(k)}?kind=aat" title="${tip}">${loc?'† ':''}${esc(glossLabel(k))}</a>`;
  };
  const kwChip = (k) => `<a class="tag th-kw" href="#/search?q=${encodeURIComponent(glossStrip(k))}" title="${L(`아카이브에서 “${esc(glossStrip(k))}” 검색`,`Search the archive for “${esc(kwLabel(glossStrip(k)))}”`)}">${esc(kwLabel(glossStrip(k)))}</a>`;
  const usedCats = new Set();
  const pairs = kw.map((k,i)=>{
    const c = kc[i];
    if(c) usedCats.add(c);
    return `<div class="th-pair">${c?catChip(c):''}<span class="th-pair-tie"></span>${kwChip(k)}</div>`;
  });
  // 현행 키워드와 짝지어지지 않은 잔여 카테고리(정규화로 키워드가 병합된 경우)는 카테고리 단독으로 표시
  for(const a of aat) if(!usedCats.has(a)) pairs.push(`<div class="th-pair th-pair-solo">${catChip(a)}</div>`);
  const tip = L('키워드는 전시 제목·설명에서 LLM(Claude Sonnet 4.6)이 추출한 주제어이고, 그 위의 카테고리는 각 키워드를 아우르는 상위 분류입니다. 카테고리는 대부분 Getty AAT의 Related Concepts 통제어휘에 매핑되며, † 표식이 붙은 것은 AAT에 대응 범주가 없어 키워드가 그대로 분류로 쓰인 자체 보완 분류입니다(출현 3회 미만은 \'기타\'로 묶임).','Keywords are thematic terms an LLM (Claude Sonnet 4.6) extracted from the title and description; the category above each keyword is its broader class. Categories are mapped to the Getty AAT Related Concepts controlled vocabulary where possible; a † mark denotes a supplemental local category with no Getty AAT counterpart (rare unmatched keywords are grouped under \'Other\').');
  const legend = hasLocal ? `<div class="th-legend">${L('† 자체 보완 분류 — Getty AAT에 대응 범주가 없어 키워드가 그대로 분류로 쓰인 항목','† Supplemental local category — no Getty AAT counterpart; the keyword itself serves as the category')}</div>` : '';
  return `<section class="dt-sec dt-themes"><h2 class="dt-h2">${L('주제','Themes')}</h2>
    <div class="th-ladder"><div class="th-tier th-tier-cat">
      <span class="th-tier-l has-tip" data-tip="${esc(tip)}" tabindex="0"><b>${L('키워드 카테고리','Keyword category')}</b><i>${L('키워드별 상위 분류','Broader class per keyword')}</i></span>
      <div class="th-pairs">${pairs.join('')}</div>
    </div>${legend}</div>
  </section>`;
}
/* ---------- relationship sections ---------- */
const SECMETA = () => ({
  participants:{label:L('참여자','Participants')}, organizations:{label:L('기관','Organizations')},
  venues:{label:L('장소','Venues')}, works:{label:L('작품','Works')},
  exhibitions:{label:L('전시','Exhibitions')}, programs:{label:L('프로그램','Programs')},
  opencalls:{label:L('공모','Open Calls')}, related:{label:L('관련 행사','Related events')},
  members:{label:L('팀원','Members')},
});
const ORDER = ['members','participants','works','venues','organizations','exhibitions','programs','opencalls','related'];
const CAP = 24;

function relSectionsHTML(type, rel){
  let out='';
  for(const key of ORDER){
    const arr = rel[key];
    if(!arr || !arr.length) continue;
    if(key==='related'){ out += relatedSection(arr); continue; }
    if(key==='participants'){ out += participantsSection(arr); continue; }
    const sm = SECMETA()[key];
    // a "works" card lists the person's own works → label it 작품 (keep 기증 for donations)
    const items = arr.map(x=>{
      const role = key==='works' ? (x.role==='기증' ? L('기증','Donation') : L('작품','Work')) : x.role;
      return miniCard(x.type, x.rec, role);
    }).join('');
    const more = arr.length>CAP;
    out += `<section class="dt-sec"><h2 class="dt-h2">${sm.label} <span class="dt-n">${num(arr.length)}</span></h2>
      <div class="minigrid mg-${key} ${more?'capped':''}">${items}</div>
      ${more?`<button class="pill sm expander">SHOW ALL ${num(arr.length)} ↓</button>`:''}
    </section>`;
  }
  return out;
}
/* Participants split into 참여작가 (event_role contains 작가 — e.g. 참여작가/한국 작가/중국 작가)
   and 그 외 참여자 (큐레이터·크루·미상). Each subgroup caps + expands independently. */
function participantsSection(arr){
  const isArtist = x => /작가/.test(x.role||'');
  const groups = [[L('참여작가','Participating Artists'), arr.filter(isArtist)], [L('그 외 참여자','Other Participants'), arr.filter(x=>!isArtist(x))]];
  const body = groups.map(([label,list])=>{
    if(!list.length) return '';
    const more = list.length>CAP;
    const cells = list.map(x=>miniCard(x.type, x.rec, x.role)).join('');
    return `<div class="dt-subsec"><h3 class="dt-h3">${esc(label)} <span class="dt-n">${num(list.length)}</span></h3>
      <div class="minigrid mg-participants ${more?'capped':''}">${cells}</div>
      ${more?`<button class="pill sm expander">${L(`전체 ${num(list.length)}명 보기 ↓`,`Show all ${num(list.length)} ↓`)}</button>`:''}</div>`;
  }).join('');
  return `<section class="dt-sec"><h2 class="dt-h2">${L('참여자','Participants')} <span class="dt-n">${num(arr.length)}</span></h2>${body}</section>`;
}
function relatedSection(arr){
  const items = arr.map(o=>{
    if(o.rec){ return miniCard(o.otherType, o.rec, o.dir); }
    return `<a class="minicard ext-mini" href="${esc(o.url||'#')}" ${o.url?'target="_blank" rel="noopener"':''} style="--accent:${th(o.otherType).accent}">
      <span class="mc-thumb ph" style="--ph:${th(o.otherType).accent}">${th(o.otherType).code}</span>
      <span class="mc-body"><span class="mc-role">${thName(o.otherType)} ${esc(o.dir)} ↗</span><span class="mc-title">${esc(o.title||o.otherId||L('외부','External'))}</span></span>
    </a>`;
  }).join('');
  const more = arr.length>CAP;
  return `<section class="dt-sec"><h2 class="dt-h2">${L('관련 행사','Related events')} <span class="dt-n">${num(arr.length)}</span></h2>
    <div class="minigrid ${more?'capped':''}">${items}</div>
    ${more?`<button class="pill sm expander">${L(`전체 ${num(arr.length)}개 보기 ↓`,`Show all ${num(arr.length)} ↓`)}</button>`:''}</section>`;
}

function miniCard(type, rec, role){
  const t = th(type);
  const id = rec[ID_FIELD[type]];
  const title = titleOf(type,rec), sub = subOf(type,rec);
  return `<a class="minicard" data-type="${type}" href="#/${type}/${encodeURIComponent(id)}" style="--accent:${t.accent}">
    ${thumbMini(type,rec)}
    <span class="mc-body">
      <span class="mc-role">${role?esc(role):t.label}</span>
      <span class="mc-title">${esc(title)}</span>
      ${sub?`<span class="mc-sub">${esc(sub)}</span>`:''}
      ${type==='program' && rec.host ? `<span class="mc-host">${L('주최','Host')} · ${esc(rec.host)}</span>` : ''}
    </span>
  </a>`;
}
function thumbMini(type, rec){
  if(rec.thumb) return `<span class="mc-thumb"><img loading="lazy" src="${esc(rec.thumb)}" alt=""></span>`;
  const a = th(type).accent;
  return `<span class="mc-thumb ph ${type==='participant'?'circle':''}" style="--ph:${a}">${th(type).code}</span>`;
}

/* ---------- connection summary (aside) ---------- */
const CONN_LBL = {participants:['participant','participants'],works:['work','works'],venues:['venue','venues'],orgs:['org','orgs'],exhibitions:['exhibition','exhibitions'],programs:['program','programs'],opencalls:['open call','open calls'],related:['related','related'],members:['member','members'],works_linked:['work','works']};
/* which entity-type each connection bucket belongs to (for colouring); null = neutral */
const CONN_TYPE = {participants:'participant',members:'participant',works:'work',works_linked:'work',venues:'venue',orgs:'organization',exhibitions:'exhibition',programs:'program',opencalls:'opencall',related:null};
const connAccent = k => { const ct = CONN_TYPE[k]; return ct ? th(ct).accent : '#9a8f80'; };
function connSummaryHTML(type, r){
  const c = r._c||{}; const entries = Object.entries(c).filter(([k,v])=>v);
  if(!entries.length) return '';
  const total = entries.reduce((s,[,v])=>s+v,0);
  const rows = entries.map(([k,v])=>{ const p=CONN_LBL[k]||[k,k]; return `<div class="cs-row"><span style="color:${connAccent(k)}">${num(v)}</span><em>${v===1?p[0]:p[1]}</em></div>`; }).join('');
  return `<div class="dt-card"><div class="dt-card-h">${L('연결','Connections')} <span class="dt-card-n">${num(total)}</span></div><div class="cs">${rows}</div></div>`;
}
/* ① CONNECTION-MIX bar (inner) — the record's relational fingerprint as a 100% stacked count-bar */
function mixBarInner(r){
  const c=r._c||{}; const entries=Object.entries(c).filter(([k,v])=>v);
  if(entries.length<2) return '';
  const total=entries.reduce((s,[,v])=>s+v,0);
  const bar=`<div class="rm-bar" role="img" aria-label="connection mix">${entries.map(([k,v])=>`<span class="rm-seg" style="flex:${v};background:${connAccent(k)}" title="${esc((CONN_LBL[k]||[k,k])[1])} ${num(v)} · ${Math.round(v/total*100)}%">${v/total>0.08?`<b>${num(v)}</b>`:''}</span>`).join('')}</div>`;
  const leg=entries.map(([k,v])=>`<span class="cm-leg"><i style="background:${connAccent(k)}"></i>${esc((CONN_LBL[k]||[k,k])[1])} ${num(v)}</span>`).join('');
  return bar+`<div class="cm-legend">${leg}</div><div class="dt-cap">${L(`관계 구성 — 이 레코드가 무엇에 가장 많이 연결됐는지 (총 ${num(total)})`,`Connection mix — what this record links to most (total ${num(total)})`)}</div>`;
}

/* ② ACTIVITY SPINE — a per-year histogram of the record's LINKED dated events (career/usage curve).
   For dateless entities (participant/org/venue) the year comes entirely from their resolved relations. */
const SPINE_SRC = {
  participant:  [['exhibitions','exhibition'],['programs','program']],
  organization: [['exhibitions','exhibition'],['programs','program'],['opencalls','opencall']],
  venue:        [['exhibitions','exhibition'],['programs','program'],['opencalls','opencall']],
};
function spineInner(type, rel){
  const src = SPINE_SRC[type]; if(!src) return '';
  const byYear = {}; let total=0;
  for(const [bucket, et] of src) for(const o of (rel[bucket]||[])){
    const y = o.rec && o.rec.year; if(!y) continue;
    (byYear[y] = byYear[y]||{})[et] = (byYear[y][et]||0)+1; total++;
  }
  const years = Object.keys(byYear).map(Number);
  if(years.length<2 || total<3) return '';
  const ymin=Math.min(...years), ymax=Math.max(...years);
  const max = Math.max(...years.map(y=>Object.values(byYear[y]).reduce((a,b)=>a+b,0)));
  const TYPES=['exhibition','program','opencall'];
  let cells='';
  for(let y=ymin; y<=ymax; y++){
    const yc=byYear[y]||{}; const tot=Object.values(yc).reduce((a,b)=>a+b,0);
    const h = tot ? Math.round(8 + 40*(Math.log(tot+1)/Math.log(max+1))) : 0;
    const segs = TYPES.filter(t=>yc[t]).map(t=>`<span style="flex:${yc[t]};background:${th(t).accent}"></span>`).join('');
    cells += `<span class="as-cell"${tot?` title="${y} · ${tot}"`:''}><span class="as-bar" style="height:${h}px">${segs}</span><span class="as-lab">${tot?esc("'"+String(y).slice(2)):''}</span></span>`;
  }
  const multi = src.length>1 && new Set(years.flatMap(y=>Object.keys(byYear[y]))).size>1;
  const legend = multi ? `<div class="as-legend">${src.map(([,et])=>`<span class="as-leg"><i style="background:${th(et).accent}"></i>${esc(thName(et))}</span>`).join('')}</div>` : '';
  return `<div class="dt-spine"><div class="as-track">${cells}</div>${legend}</div><div class="dt-cap">${L(`활동 연표 · ${ymin}–${ymax} · 총 ${total}건 (연결된 이벤트의 연도)`,`Activity timeline · ${ymin}–${ymax} · ${total} events total (years of linked events)`)}</div>`;
}

/* ③ ROLE / CATEGORY MIX — a 100%-stacked composition bar. participant = real role distribution counted
   across their event roles; opencall/org/venue = their distinct multi-value tags (equal-weight fingerprint). */
const MIX_HUES = ['#5b3fb0','#3e8e4f','#c2691f','#b03f7a','#2f7fa8','#8a7f20','#7a5cc0','#558b2f'];
function roleMixInner(type, rec, rel){
  if(type==='participant'){
    // count EVENT-participation roles only (exhibition/program); work authorship is a count, not a role mix.
    const rc={};
    for(const b of ['exhibitions','programs']) for(const o of (rel[b]||[])){ const r=(o.role||'').trim(); if(r) rc[r]=(rc[r]||0)+1; }
    const entries=Object.entries(rc).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if(entries.length<2) return '';
    const total=entries.reduce((s,[,v])=>s+v,0);
    const segs=entries.map(([k,v],i)=>`<span class="cm-seg" style="flex:${v};background:${MIX_HUES[i%MIX_HUES.length]}" title="${esc(k)} · ${num(v)} · ${Math.round(v/total*100)}%">${v/total>0.12?esc(k):''}</span>`).join('');
    const leg=entries.map(([k,v],i)=>`<span class="cm-leg"><i style="background:${MIX_HUES[i%MIX_HUES.length]}"></i>${esc(k)} ${num(v)}</span>`).join('');
    return `<div class="cm-bar">${segs}</div><div class="cm-legend">${leg}</div><div class="dt-cap">${L(`이벤트 참여 역할 구성 (총 ${num(total)})`,`Event-participation role mix (total ${num(total)})`)}</div>`;
  }
  const FIELD={opencall:'target_list', organization:'type_list', venue:'type_list'}[type];
  const vals = FIELD && Array.isArray(rec[FIELD]) ? rec[FIELD].filter(Boolean) : null;
  if(!vals || vals.length<2) return '';
  const segs=vals.map((v,i)=>`<span class="cm-seg" style="flex:1;background:${MIX_HUES[i%MIX_HUES.length]}" title="${esc(v)}">${esc(v)}</span>`).join('');
  return `<div class="cm-bar">${segs}</div>`;
}

/* ============================================================
   COMPARATIVE viz — "how different / how far from peers" (participant; precomputed sim data)
   ============================================================ */
/* ① Z-DEVIATION bars — how many σ above/below the field median on each axis, + most-distinctive trait */
function zDevInner(s){
  if(!s || !s.zmax) return '';
  const rows = s.z.map((z,i)=>{
    if(z==null) return '';
    const c = Math.max(-4, Math.min(4, z)); const w = Math.abs(c)/4*50;   // half-track max
    const big = Math.abs(z)>=2, isMax = s.zmax.i===i;
    return `<div class="zd-row${isMax?' on':''}"><span class="zd-lab">${esc(s.zlab[i])}</span>`
         + `<span class="zd-track"><span class="zd-bar ${z>=0?'pos':'neg'}${big?' big':''}" style="width:${w.toFixed(1)}%"></span></span>`
         + `<span class="zd-v">${z>0?'+':''}${z.toFixed(1)}σ</span></div>`;
  }).join('');
  const m=s.zmax;
  return `<div class="zd-chip">${L('가장 두드러진','Most distinctive')} ▸ <b>${esc(m.label)}</b> ${m.z>0?'+':''}${m.z.toFixed(1)}σ</div>`
       + `<div class="zd-rows">${rows}</div><div class="dt-cap">${L('필드 중앙값 대비 각 축의 편차(σ). 막대가 길수록 평균에서 멂.','Deviation (σ) on each axis from the field median. The longer the bar, the farther from average.')}</div>`;
}
/* ② PEER ORBIT — k=8 nearest peers as satellites, radius ∝ dissimilarity (empty moat = outlier) */
function orbitInner(s, accent){
  const ps = s && s.peers; if(!ps || ps.length<3) return '';
  const C=150, R0=24, R=128, dmax=s.dmax||Math.max(...ps.map(p=>p.d))||1;
  const node=(p,i)=>{ const a=(i/ps.length)*2*Math.PI - Math.PI/2; const r=R0+(p.d/dmax)*(R-R0);
    return {p, x:C+r*Math.cos(a), y:C+r*Math.sin(a), score:Math.round(p.d/dmax*100), first:i===0}; };
  const ns=ps.map(node);
  const rings=[0.33,0.66,1].map(f=>`<circle cx="${C}" cy="${C}" r="${(R0+f*(R-R0)).toFixed(0)}" class="ob-ring"/>`).join('');
  const spk=ns.map(n=>`<line x1="${C}" y1="${C}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" class="ob-spoke"/>`).join('');
  const sat=ns.map(n=>`<a href="#/participant/${esc(n.p.id)}" class="ob-link"><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.first?7:5}" class="ob-sat${n.first?' twin':''}" fill="${n.first?accent:'#8a7f70'}"><title>${esc(n.p.name)} · ${esc(n.p.role||'')} · ${L(`거리 ${n.score}/100`,`distance ${n.score}/100`)} · ${L(`${esc(n.p.dom)} 차이`,`${esc(n.p.dom)} difference`)}</title></circle></a>`).join('');
  return `<svg viewBox="0 0 300 300" class="ob-svg" role="img" aria-label="peer orbit"><text x="${C}" y="14" class="ob-rl">${L('먼 거리','Far')}</text>${rings}${spk}${sat}<circle cx="${C}" cy="${C}" r="9" class="ob-you" fill="${accent}"/></svg>`
       + `<div class="dt-cap">${L(`중심 = 이 인물 · 가장 안쪽 <b>${esc(ps[0].name)}</b> = 가장 닮음 · 바깥일수록 다름 (위성 클릭 → 그 인물)`,`Center = this person · innermost <b>${esc(ps[0].name)}</b> = most similar · farther out = more different (click a satellite to open that person)`)}</div>`;
}
/* ③ TWIN ↔ OPPOSITE — closest twin vs polar opposite on a distance spectrum */
function twinOppInner(s){
  if(!s || !s.twin || !s.opposite || s.opposite.d>=1e8) return '';
  const dmax=s.dmax||1, tp=Math.round(s.twin.d/dmax*100), op=Math.round(s.opposite.d/dmax*100);
  const chip=(c,o)=>`<a class="to-chip ${c}" href="#/participant/${esc(o.id)}"><b>${esc(o.name)}</b><i>${esc(o.role||'')}</i></a>`;
  return `<div class="to-grid"><span class="to-k">${L('가장 닮음','Most similar')}</span>${chip('twin',s.twin)}<span class="to-d">${tp}</span></div>`
       + `<div class="to-spec"><i class="you" style="left:0"></i><i class="tw" style="left:${tp}%"></i><i class="op" style="left:${Math.min(op,100)}%"></i></div>`
       + `<div class="to-grid"><span class="to-k">${L('정반대','Opposite')}</span>${chip('opp',s.opposite)}<span class="to-d">${op}</span></div>`
       + `<div class="dt-cap">${L('가장 닮은 인물(녹색)과 정반대(보라). 숫자=거리(0=동일, 100=최대).','The most similar person (green) and the polar opposite (purple). Numbers = distance (0 = identical, 100 = maximum).')}</div>`;
}
/* ④ FIELD MAP — this record (crosshair) plotted in a 2D embedding of the whole population */
function fieldMapInner(s, map, accent){
  if(!s || !s.xy || !map || !map.points) return '';
  const pts = map.points.map(([x,y])=>`<circle cx="${x.toFixed(1)}" cy="${(100-y).toFixed(1)}" r="0.8" class="fm-pt"/>`).join('');
  const x=s.xy[0], y=100-s.xy[1];
  return `<svg viewBox="-8 -8 116 116" class="fm-svg" role="img" aria-label="field position">${pts}`
       + `<line x1="${x.toFixed(1)}" y1="-8" x2="${x.toFixed(1)}" y2="108" class="fm-cross"/><line x1="-8" y1="${y.toFixed(1)}" x2="108" y2="${y.toFixed(1)}" class="fm-cross"/>`
       + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" class="fm-you" fill="${accent}"/></svg>`
       + `<div class="dt-cap">${L(`전체 ${num(map.n)}명 중 이 인물의 좌표 — 가운데 밀집부 = 전형적, 바깥쪽 = 고유함`,`This person’s position among all ${num(map.n)} people — dense center = typical, outer edge = distinctive`)}</div>`;
}

/* ---- two TABBED viz groups: PROFILE (self fingerprint) + PEER ANALYSIS (comparison) ---- */
function tabGroupHTML(gid, title, kr, panels){
  panels = panels.filter(p=>p.html);
  if(!panels.length) return '';
  const head = `<h2 class="dt-h2">${title} <span class="dt-h2-kr">${kr}</span></h2>`;
  if(panels.length===1) return `<section class="dt-sec">${head}<div class="va-panel on">${panels[0].html}</div></section>`;
  const tabs = panels.map((p,i)=>`<button class="va-tab${i?'':' on'}" data-vg="${gid}" data-vp="${p.k}">${esc(p.lab)}</button>`).join('');
  const pans = panels.map((p,i)=>`<div class="va-panel${i?'':' on'}" data-vg="${gid}" data-vp="${p.k}">${p.html}</div>`).join('');
  return `<section class="dt-sec va-group" data-vg="${gid}">${head}<div class="va-tabs">${tabs}</div><div class="va-panels">${pans}</div></section>`;
}
function profileGroupHTML(type, rec, rel){
  return tabGroupHTML('prof',L('프로필','Profile'),L('프로필 — 이 레코드 자체','Profile — this record itself'), [
    {k:'act',  lab:L('활동연표','Activity timeline'), html:spineInner(type, rel)},
    {k:'conn', lab:L('연결구성','Connection mix'), html:mixBarInner(rec)},
    {k:'role', lab:type==='participant'?L('역할','Role'):L('유형','Type'), html:roleMixInner(type, rec, rel)},
  ]);
}
function peerGroupHTML(simData, mapData, accent){
  return tabGroupHTML('peer',L('유사도 분석','Peer Analysis'),L('유사도 — 다른 인물과 얼마나 다른가','Similarity — how different from other people'), [
    {k:'orbit', lab:L('최근접 궤도','Nearest orbit'), html:orbitInner(simData, accent)},
    {k:'map',   lab:L('필드맵','Field map'),      html:fieldMapInner(simData, mapData, accent)},
    {k:'dev',   lab:L('편차','Deviation'),        html:zDevInner(simData)},
    {k:'twin',  lab:L('트윈↔반대','Twin↔Opposite'),   html:twinOppInner(simData)},
  ]);
}
function wireVizTabs(){
  app.querySelectorAll('.va-tab').forEach(t=>t.addEventListener('click', ()=>{
    const g=t.dataset.vg, p=t.dataset.vp;
    app.querySelectorAll(`.va-tab[data-vg="${g}"]`).forEach(x=>x.classList.toggle('on', x===t));
    app.querySelectorAll(`.va-panel[data-vg="${g}"]`).forEach(x=>x.classList.toggle('on', x.dataset.vp===p));
  }));
}

/* ============================================================
   ARCHIVE POSITION (exhibition) — where this show sits in the WHOLE archive,
   built from the precomputed Getty-AAT keyword_index (lazy-loaded). Replaces the
   egocentric Profile group on exhibition pages. Tabs: 주제 위치 / 이웃 전시 / 고유성.
   ============================================================ */
/* strip the trailing English gloss "(...)" (depth-aware; keeps Korean-only parens like "문화 (개념)") */
function glossStrip(s){
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
/* Compact SIDEBAR card (aside): vertical stack — 고유성 게이지 → 주제 희귀도 막대 →
   유사한 주제의 전시. Replaces both the egocentric CONNECTIONS box and the old tabbed group. */
function archPositionAsideHTML(id, rec, KIDX){
  const seen = new Set(), cats = [];
  for(const a of (rec.aat||[])){
    const key = glossStrip(a);
    if(!key || key==='기타' || seen.has(key) || !KIDX.index[key]) continue;
    seen.add(key);
    cats.push({ key, raw:a, e:KIDX.index[key], dyn:(KIDX.keywords.find(k=>k.k===key)||{}).dyn||0 });
  }
  if(!cats.length) return '';
  const total = KIDX.keywords.length, maxN = KIDX.keywords[0].n;
  const kwRank = new Map(KIDX.keywords.map((d,i)=>[d.k, i+1]));   // 1 = most common

  /* 원점수 = 이 전시 주제들의 평균 희귀도(0 흔함 ~ 100 희귀). 주제 빈도가 멱법칙이라 원점수는
     0~25에 몰리므로, 전 전시 점수 분포(uscale, 101점 사다리)에 대비한 백분위로 환산해 '상위 X%'로
     보여준다 → 대부분이 "흔한 주제 위주"로 뭉치지 않고 고르게 퍼진다. */
  const rawScore = cats.reduce((s,c)=>s+(kwRank.get(c.key)-1)/total*100,0)/cats.length;
  const uscale = KIDX.uscale;
  let pctl;
  if(uscale && uscale.length===101){ let lo=0,hi=100; while(lo<hi){ const mid=(lo+hi+1)>>1; uscale[mid]<=rawScore?lo=mid:hi=mid-1; } pctl=lo; }
  else pctl = Math.round(rawScore);                       // fallback if uscale not in cache
  const topPct = Math.max(1, 100-pctl);                   // 더 희귀한 쪽 = 상위 X%
  const tier = pctl>=67 ? L('희귀한 주제 위주의 전시','An exhibition focused on rare themes')
             : pctl>=33 ? L('흔한 주제와 희귀한 주제가 섞인 전시','An exhibition mixing common and rare themes')
             : L('널리 다뤄진 주제 위주의 전시','An exhibition focused on widely-covered themes');
  const sorted = [...cats].sort((a,b)=>a.e.n-b.e.n);      // rarest first
  const rarest = sorted[0];

  /* ── 통합 희귀도 보고: 한 줄 평가(보라) → 설명 → 게이지(상위 X%) → 주제별 막대 ──
     게이지는 희귀(왼쪽 '상위')↔흔함(오른쪽). 마커·숫자 모두 topPct로 일치(상위 X%가 작을수록 희귀=왼쪽). */
  const head = `<div class="apx-verdict">${tier}</div>`;
  const note = `<p class="apx-say">${L('다른 모든 전시와 견줘 이 전시가 얼마나 <b>희귀한 주제</b>를 다루는지 매긴 순위예요. 아래 막대는 주제마다 전 아카이브에서 그 주제를 다룬 전시·행사 수로, 건수가 적을수록 더 드문 주제예요.','A ranking of how <b>rare</b> the themes this exhibition covers are, compared with every other exhibition. Each bar below is the number of exhibitions and events across the whole archive that cover that theme — fewer means a rarer theme.')}</p>`;
  const meter = `<div class="apx-meter">
      <div class="apx-meter-score"><span class="apx-ms-lab">${L('전체 전시 중 주제 희귀도 상위','Theme rarity, top percentile among all exhibitions')}</span><b>${topPct}</b><i>%</i></div>
      <div class="apx-meter-track"><span class="apx-meter-mark" style="left:${Math.max(2,Math.min(98,topPct))}%"></span></div>
      <div class="apx-meter-ends"><span>${L('희귀한 주제','Rare themes')}</span><span>${L('흔한 주제','Common themes')}</span></div>
    </div>`;
  const rows = sorted.map(c=>{
    const barW = Math.max(6, Math.round(100*Math.log(c.e.n+1)/Math.log(maxN+1)));
    const mom = c.dyn>0.15?L('최근 늘어나는 주제','Trending up recently'):c.dyn<-0.15?L('최근 줄어드는 주제','Trending down recently'):'';
    return `<a class="apx-th" href="#/semantic/${encodeURIComponent(c.key)}?kind=aat" title="${esc(glossLabel(c.raw))} — ${L(`이 주제를 다룬 전시·행사 ${num(c.e.n)}건 · 전체 ${total}개 주제 중 흔한 순 ${kwRank.get(c.key)}위`,`${num(c.e.n)} exhibitions/events cover this theme · ranked ${kwRank.get(c.key)} by commonness of ${total} themes`)}${mom?' · '+mom:''}">
      <span class="apx-th-n">${isLocalCat(c.key)?'† ':''}${esc(glossLabel(c.raw))}</span>
      <span class="apx-th-bar"><i style="width:${barW}%"></i></span>
      <span class="apx-th-c">${L(`${num(c.e.n)}건`,`${num(c.e.n)}`)}</span></a>`;
  }).join('');

  /* ── 유사한 주제의 전시 — 원/숫자·설명 제거, 클릭 가능함을 또렷이 ── */
  const shared = new Map();
  for(const c of cats) for(const it of c.e.items){
    const [eid,t,title,ey,ins,ten] = it;
    if(t!=='exh' || eid===id) continue;
    const cur = shared.get(eid) || {n:0, title, title_en:ten, year:ey}; cur.n++; shared.set(eid, cur);
  }
  const nbTop = [...shared.entries()].sort((a,b)=>b[1].n-a[1].n).slice(0,5);
  const nbName = o => D(o.title, o.title_en) || o.title;
  const nb = nbTop.length
    ? `<div class="apx-sec-h">${L('유사한 주제의 전시','Exhibitions on similar themes')}</div><div class="apx-nbs">${nbTop.map(([eid,o])=>`<a class="apx-nb" href="#/exhibition/${encodeURIComponent(eid)}" title="${esc(nbName(o)||eid)} · ${L(`공유 주제 ${o.n}개`,`${o.n} shared themes`)}${o.year?' · '+o.year:''}"><span class="apx-nb-b">•</span><span class="apx-nb-t">${esc(nbName(o)||eid)}</span><span class="apx-nb-arr">→</span></a>`).join('')}</div>`
    : '';

  return `<div class="dt-card apx-card">
    <div class="dt-card-h">${L('아카이브 속 위치','Archive position')}</div>
    ${head}
    ${note}
    ${meter}
    <div class="apx-ths">${rows}</div>
    ${nb}
  </div>`;
}
/* lazy: render a light card shell immediately, then load keyword_index (cached if the keyword
   dashboard was visited) and fill the SIDEBAR slot in place. */
async function fillArchPosition(id, rec){
  const slot = app.querySelector('#dt-archpos-aside'); if(!slot) return;
  if(!(rec.aat||[]).length){ slot.remove(); return; }
  slot.innerHTML = `<div class="dt-card apx-card"><div class="dt-card-h">${L('아카이브 속 위치','Archive position')}</div><div class="ap-loading"><span class="spin"></span> ${L('전체 대조 중…','Comparing across the archive…')}</div></div>`;
  let KIDX; try{ KIDX = await keywordIndex(); }catch(e){ slot.remove(); return; }
  if(!app.querySelector('#dt-archpos-aside')) return;   // navigated away while loading
  const html = archPositionAsideHTML(id, rec, KIDX);
  if(!html){ slot.remove(); return; }
  slot.innerHTML = html;
}

/* ---------- external links ---------- */
function extLinksHTML(type, r){
  const links=[];
  if(r.detail_url) links.push(`<a class="ext-btn" href="${esc(D(r.detail_url, r.source_url_en) || r.detail_url)}" target="_blank" rel="noopener">${L('원문 페이지 ↗','Source page ↗')}</a>`);
  if(r.application_url) links.push(`<a class="ext-btn" href="${esc(r.application_url)}" target="_blank" rel="noopener">${L('신청하기 ↗','Apply ↗')}</a>`);
  return links.length?`<div class="dt-ext">${links.join('')}</div>`:'';
}

/* ---------- multi-source provenance: aggregator portals that ALSO list this record ----------
   The primary source (rec.source_system, shown as SOURCE PAGE) is excluded; the rest come
   from the record_source bridge so a record is attested by more than one portal. */
function provenanceHTML(rec, sources){
  if(!sources || !sources.length) return '';
  const seen = new Set([rec.source_system]);
  const chips = [];
  for(const s of sources){
    const sys = s.source_system;
    if(!sys || seen.has(sys)) continue;
    seen.add(sys);
    const label = vlabel(sys);
    chips.push(s.detail_url
      ? `<a class="ext-btn alt" href="${esc(s.detail_url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`
      : `<span class="ext-btn alt">${esc(label)}</span>`);
  }
  if(!chips.length) return '';
  return `<div class="dt-prov"><div class="dt-prov-h">${L('다른 출처에도 수록','Also listed on')}</div><div class="dt-ext">${chips.join('')}</div></div>`;
}

function backFor(type){
  if(type==='participant') return '#/activity';
  return `#/list/${type}`;
}

/* expand capped relationship grids */
function wireExpanders(){
  app.querySelectorAll('.expander').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const grid = btn.previousElementSibling;
      if(grid && grid.classList.contains('minigrid')){ grid.classList.remove('capped'); btn.remove(); }
    });
  });
}

/* ---------- field definition tooltips (one shared floating popup) ---------- */
function ensureTip(){
  let tip = document.getElementById('fact-tip');
  if(tip) return tip;
  tip = document.createElement('div');
  tip.id = 'fact-tip'; tip.className = 'fact-tip'; tip.setAttribute('role','tooltip');
  document.body.appendChild(tip);
  const reflow = ()=>{ if(tip._cur && tip.classList.contains('on')) positionTip(tip, tip._cur); };
  window.addEventListener('scroll', reflow, {passive:true, capture:true});
  window.addEventListener('resize', reflow, {passive:true});
  return tip;
}
function positionTip(tip, el){
  const r = el.getBoundingClientRect();
  tip.style.maxWidth = Math.min(340, window.innerWidth - 24) + 'px';
  const tr = tip.getBoundingClientRect();
  let top = r.bottom + 8;
  if(top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 8;   // flip above if it would overflow
  let left = Math.min(r.left, window.innerWidth - tr.width - 8);
  left = Math.max(8, left);
  tip.style.left = left + 'px';
  tip.style.top  = Math.max(8, top) + 'px';
}
function wireTooltips(){
  const tip = ensureTip();
  const show = el => { tip._cur = el; tip.textContent = el.getAttribute('data-tip'); tip.classList.add('on'); positionTip(tip, el); };
  const hide = () => { tip._cur = null; tip.classList.remove('on'); };
  app.querySelectorAll('[data-tip]').forEach(el=>{
    el.addEventListener('mouseenter', ()=>show(el));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', ()=>show(el));
    el.addEventListener('blur', hide);
  });
}
