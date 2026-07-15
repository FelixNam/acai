/* ============================================================
   about.js — about the archive: stats, data model, sources
   ============================================================ */
import { meta } from '../data.js';
import { th, esc, num, logoSVG, setCrumb, paintLogos, thName } from '../ui.js';
import { mount } from '../app.js';
import { L } from '../i18n.js';

const app = document.getElementById('app');

export async function aboutView(){
  setCrumb(L('소개', 'About'));
  const M = await meta();
  const c = M.counts;

  const bigstats = [
    ['exhibition', c.exhibition], ['program', c.program], ['opencall', c.opencall],
    ['participant', c.participant], ['work', c.work], ['organization', c.organization], ['venue', c.venue],
  ].map(([t,n])=>`<a class="stat" href="#/list/${t}" style="--accent:${th(t).accent}">
      <span class="stat-n">${num(n)}</span><span class="stat-l">${th(t).kr} · ${th(t).label}</span></a>`).join('');

  const sources = [
    ['MMCA','국립현대미술관','National Museum of Modern and Contemporary Art',L('서울·과천·덕수궁·청주','Seoul · Gwacheon · Deoksugung · Cheongju')],
    ['SeMA','서울시립미술관','Seoul Museum of Art',L('서소문·북서울·남서울 + 분관','Seosomun · Buk-Seoul · Nam-Seoul + branches')],
    ['ACC','국립아시아문화전당','Asia Culture Center',L('광주','Gwangju')],
    ['ARTNURI','아르코 아트누리',L('ARKO 공모 애그리게이터','ARKO open-call aggregator'),L('공모(시각예술)','Open Calls (visual art)')],
  ].map(s=>`<div class="src-card"><div class="src-code">${s[0]}</div><div class="src-body"><b>${s[1]}</b><i>${s[2]}</i><span>${s[3]}</span></div></div>`).join('');

  // data-model diagram (events ↔ resources via junctions)
  const model = modelDiagram();

  mount(`
    <div class="phead">
      <div class="phead-l"><div class="tab-v" style="color:var(--green-d)">${L('판권 · 소개', 'COLOPHON · ABOUT')}</div>
        <div><div class="scope">archive of contemporary art &amp; event info</div><h1>${L('소개', 'About')} <span class="acai-wm">ACAI</span></h1></div></div>
      <div class="phead-r"><a class="pill" href="#/">${L('↑ 입구', '↑ Entrance')}</a></div>
    </div>

    <div class="about-lead">
      <span class="about-mark">${logoSVG()}</span>
      <p>${L(`<b>ACAI</b>는 한국 동시대 미술 활동의 관계형 아카이브입니다 — 3개 국·공립 기관 <b>국립현대미술관</b>, <b>서울시립미술관</b>, <b>국립아시아문화전당</b>(공모는 아르코 아트누리)을 기반으로 구축됐습니다. 예술 행사 <b>${num(M.event_total)}</b>건과 자료 <b>${num(M.resource_total)}</b>건을 하나의 탐색 가능한 구조로 엮어, 한 명의 작가·작품·장소·주제를 수십 년에 걸친 전시·프로그램·공모를 가로질러 추적할 수 있게 합니다.`, `<b>ACAI</b> is a relational archive of contemporary art activity in Korea — built on three national and municipal institutions: <b>National Museum of Modern and Contemporary Art</b>, <b>Seoul Museum of Art</b>, and <b>Asia Culture Center</b> (open calls from ARKO ARTNURI). It weaves <b>${num(M.event_total)}</b> art events and <b>${num(M.resource_total)}</b> resources into a single navigable structure, letting you trace a single artist, work, venue, or theme across decades of exhibitions, programs, and open calls.`)}</p>
    </div>

    <section class="about-sec"><h2 class="dt-h2">${L('소장 규모', 'Collection size')}</h2><div class="stat-grid">${bigstats}</div></section>

    <section class="about-sec"><h2 class="dt-h2">${L('구조', 'Structure')}</h2>
      <p class="about-p">${L('모든 레코드는 두 종류 중 하나입니다. <b>예술 행사</b>는 시간 속에서 일어나는 일이고, <b>자료</b>는 그 행사가 끌어들이는 참여자와 물적 대상입니다. 연결 테이블이 둘을 잇습니다 — 전시는 그 작가·작품·장소·주최와 연결되고, 참여자는 자신이 관여한 모든 행사·작품과 연결됩니다.', 'Every record is one of two kinds. An <b>art event</b> is something that happens in time, and a <b>resource</b> is the participants and physical objects that an event draws together. Junction tables link the two — an exhibition connects to its artists, works, venues, and hosts, and a participant connects to every event and work they were involved in.')}</p>
      ${model}
    </section>

    <section class="about-sec"><h2 class="dt-h2">${L('들어가는 길', 'Ways in')}</h2>
      <div class="ways">
        <a class="way" href="#/activity"><b>${L('활동별', 'By activity')}</b><span>${L('참여자가 하는 일 — 창작·기획·연구·교육…', 'What participants do — Create · Curate · Research · Educate…')}</span></a>
        <a class="way" href="#/events"><b>${L('행사 유형별', 'By event type')}</b><span>${L('전시 · 프로그램 · 공모', 'Exhibition · Program · Open Call')}</span></a>
        <a class="way" href="#/resources"><b>${L('자료별', 'By resource')}</b><span>${L('참여자 · 작품 · 기관 · 장소', 'Participants · Works · Organizations · Venues')}</span></a>
        <a class="way" href="#/semantic"><b>${L('주제별', 'By theme')}</b><span>${L('키워드 &amp; 게티 AAT 어휘', 'Keywords &amp; Getty AAT vocabulary')}</span></a>
        <a class="way" href="#/timeline"><b>${L('시간별', 'By time')}</b><span>${L('연도별, 2000–2026', 'By year, 2000–2026')}</span></a>
        <a class="way" href="#/network"><b>${L('연결별', 'By connection')}</b><span>${L('관계망 그래프 따라가기', 'Follow the network graph')}</span></a>
      </div>
    </section>

    <section class="about-sec"><h2 class="dt-h2">${L('출처', 'Sources')}</h2><div class="src-grid">${sources}</div></section>

    <section class="about-sec colophon">
      <h2 class="dt-h2">${L('판권', 'Colophon')}</h2>
      <div class="colo">
        <div><span class="colo-l">${L('데이터', 'Data')}</span> ${L('19개 관계형 테이블(7개 엔터티 · 12개 관계). 기관 공개데이터·소장정보로 구축하고 위키데이터 QID·게티 AAT 개념으로 보강.', '19 relational tables (7 entities · 12 relations). Built from institutional open data and collection records, enriched with Wikidata QIDs and Getty AAT concepts.')}</div>
        <div><span class="colo-l">${L('서체', 'Typefaces')}</span> Space Grotesk · Archivo · Space Mono · Bungee.</div>
        <div><span class="colo-l">${L('빌드', 'Build')}</span> ${L('정적 데이터 기반 앱 — RDB에서 생성한 JSON, 백엔드 없음. 국문 원본 콘텐츠.', 'Static data-driven app — JSON generated from an RDB, no backend. Original content in Korean.')}</div>
      </div>
    </section>`);
  paintLogos(app);
}

function modelDiagram(){
  const ev = [['exhibition'],['program'],['opencall']];
  const rs = [['participant'],['work'],['organization'],['venue']];
  const col = arr => arr.map(([t])=>`<a class="mdl-node" href="#/list/${t}" style="--accent:${th(t).accent}"><span class="mdl-code">${th(t).code}</span>${thName(t)}</a>`).join('');
  return `<div class="model">
    <div class="mdl-col"><div class="mdl-cap">${L('예술 행사', 'Art events')}</div>${col(ev)}</div>
    <div class="mdl-link"><div class="mdl-lines"></div><span>${L('연결<br>테이블', 'Junction<br>tables')}</span></div>
    <div class="mdl-col"><div class="mdl-cap">${L('자료', 'Resources')}</div>${col(rs)}</div>
  </div>`;
}
