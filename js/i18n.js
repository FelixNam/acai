/* ============================================================
   i18n.js — language state (ko / en) + tiny inline translator
   ============================================================
   Usage in views:  L('주제', 'Themes')   → picks by current language.
   Data fields fall back to Korean when an English value is absent
   (English description backfill happens progressively, Phase 2).
*/
const KEY = 'acai.lang';
export function getLang(){ try{ return localStorage.getItem(KEY)==='en' ? 'en' : 'ko'; }catch(e){ return 'ko'; } }
export function setLang(l){ try{ localStorage.setItem(KEY, l==='en'?'en':'ko'); }catch(e){} }
export function isEN(){ return getLang()==='en'; }
/* inline picker — en falls back to ko only when OMITTED (undefined/null);
   an explicit '' means "intentionally empty in English" (e.g. a Korean grammatical
   suffix that has no English equivalent), so it is kept empty. */
export function L(ko, en){ return getLang()==='en' ? (en==null ? ko : en) : ko; }
/* data-field picker: prefer the *_en value in EN mode, else the base (ko) value */
export function D(ko, en){ const v = getLang()==='en' ? (en!=null && String(en).trim()!=='' ? en : ko) : ko; return v; }

/* controlled-vocab / enum value labels, bilingual. Raw key → [ko, en]. */
const VMAP = {
  // source systems / aggregators
  mmca:['국립현대미술관','MMCA'], sema:['서울시립미술관','SeMA'], acc:['국립아시아문화전당','ACC'],
  artnuri:['아르코 아트누리','ARKO ARTNURI'],
  // participant type
  individual:['개인','Individual'], team:['팀','Team'], group:['협업 그룹','Group'], organization:['기관','Organization'], unknown:['미상','Unknown'],
  // work type
  painting:['회화','Painting'], print:['판화','Printmaking'], photograph:['사진','Photography'], sculpture:['조각','Sculpture'],
  drawing:['드로잉','Drawing'], craft:['공예','Craft'], calligraphy:['서예','Calligraphy'], 'new media art':['뉴미디어','New Media'],
  design:['디자인','Design'], architecture:['건축','Architecture'],
  // program type
  education:['교육','Education'], culture:['문화','Culture'],
  // art activity (activity_type)
  create:['창작','Create'], research:['연구','Research'], educate:['교육','Educate'], curate:['기획','Curate'],
  manage:['운영','Manage'], support:['지원','Support'], perform:['공연','Perform'], critique:['비평','Critique'],
  // country sentinels (ISO codes pass through as-is)
  OTHER:['기타','Other'], INTL:['국제','International'],
};
/* bilingual enum label; unknown keys pass through unchanged */
export function vlabel(v){ const m = VMAP[v]; return m ? L(m[0], m[1]) : v; }

/* EN labels for exhibition FIELD/GENRE (media) and SERIES values — high-confidence official names.
   KO mode returns the value verbatim. Used by both the listing facets and the detail Record card. */
export const MEDIUM_EN = {'설치':'Installation','영상·미디어':'Film & Media','회화':'Painting','사진':'Photography','조각':'Sculpture','드로잉':'Drawing','판화':'Printmaking','공예':'Craft','퍼포먼스':'Performance','사운드':'Sound','복합매체':'Mixed Media','건축':'Architecture','디자인':'Design','서예':'Calligraphy','해외':'Overseas'};
export const SERIES_EN = {'소장품 기획전':'Collection Exhibition','레지던시':'Residency','시민큐레이터 기획전':'Citizen Curator Exhibition','SeMA 신진미술인':'SeMA Emerging Artists','신소장품전':'New Acquisitions','소장품 특별전':'Collection Special Exhibition','올해의 작가상':'Korea Artist Prize','레지던시, 오픈스튜디오':'Residency Open Studio','아카이브전':'Archive Exhibition','MMCA 다원예술':'MMCA Performing Arts','한국현대미술작가시리즈':'Korean Contemporary Artists Series','프로젝트 해시태그':'Project Hashtag','찾아가는 미술관':'Museum on the Move','서울사진축제':'Seoul Photo Festival','서울미술대전':'Seoul Art Exhibition','젊은 모색':'Young Korean Artists','SeMA 타이틀 매치':'SeMA Title Match','MMCA 현대차 시리즈':'MMCA Hyundai Motor Series','SeMA 유휴공간 프로젝트':'SeMA Vacant Space Project','대한민국미술대전':'Grand Art Exhibition of Korea','MMCA 청주프로젝트':'MMCA Cheongju Project','MMCA 아시아 프로젝트':'MMCA Asia Project','MMCA 과천프로젝트':'MMCA Gwacheon Project','사전프로그램':'Pre-program','시민미술아카데미전':'Citizen Art Academy Exhibition','SeMA 옴니버스':'SeMA Omnibus','미술관 봄나들이':'Spring Outing at the Museum','광주비엔날레':'Gwangju Biennale','대한항공 박스 프로젝트':'Korean Air Box Project','MMCA 필름앤비디오':'MMCA Film & Video','막간':'Intermission','디어 시네마':'Dear Cinema','이야기의 재건':'Reconstructing the Story','아시아 필름 앤 비디오아트 포럼':'Asia Film & Video Art Forum'};
export function mediumLabel(v){ if(getLang()!=='en' || !v) return v; return String(v).split(',').map(s=>{const t=s.trim(); return MEDIUM_EN[t]||t;}).join(', '); }
export function seriesLabel(v){ return getLang()==='en' ? (SERIES_EN[v]||v) : v; }

/* 자체(폴백) 분류 목록 — Getty AAT 929 어휘 밖의 카테고리(키워드가 그대로 분류로 승격된 것 + '기타').
   build_data.py가 meta.local_categories 로 내보내고, data.js meta() 로드 시 주입된다.
   호출부는 glossKO/glossStrip 된 한국어 라벨을 넘긴다. UI는 이들 앞에 † 를 붙여 구분한다. */
let _LOCALCATS = new Set();
export function setLocalCats(arr){ if(Array.isArray(arr)) _LOCALCATS = new Set(arr); }
export function isLocalCat(ko){ return _LOCALCATS.has(ko); }

/* freeform-keyword translation overlay (data/keyword_en.json, loaded once at boot).
   Korean keywords have no embedded English gloss, so EN mode looks them up here;
   untranslated keywords fall back to the Korean (progressive coverage). */
let _KWEN = {};
export function setKwMap(m){ if(m && typeof m==='object') _KWEN = Object.assign({}, _KWEN, m); }
export function kwLabel(k){ return getLang()==='en' ? (_KWEN[k] || k) : k; }
