// ALIO(공공기관 경영정보 공개시스템) 입찰공고 → data_alio.js  (검색 대상 4번 「국가기관·산하기관」 자료)
// 실행: node tools/collect_alio.js   (월·목 검색 전에 한 번 돌려 자료를 갱신한다)
// ALIO의 robots.txt는 전체 허용(Allow: /)이다. 사이트 화면이 쓰는 목록 조회 주소(/occasional/findBidList.json)를 같은 방식으로 부른다. 키·로그인 없음.
// ALIO 목록에는 소재지 조건이 없어서, ① 부산에 본사가 있는 공공기관의 최근 공고 전체 ② 제목에 「부산」이 들어간 전국 공공기관 공고를 합친다.
// ③ 타 지역 공공기관은 교육 관련 키워드(NATIONAL_KEYWORDS)로 전국을 검색해 5번 「기타 기관」으로 담는다(부산 소재 기관은 4번).
// 규칙: 요청 사이 1초, 조회마다 최근 45일(전국 키워드는 30일)·최대 10쪽. 제목·기관명·입찰종료일·등록일·원문 링크만 담는다.
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.alio.go.kr';
const DAYS_BACK = 45, DAYS_BACK_NATIONAL = 30, MAX_PAGES = 10, DELAY_MS = 1000;
const UA = 'Mozilla/5.0 (education-project; low-rate list reader)';

// 부산에 본사가 있는 공공기관(ALIO 기관명과 정확히 같아야 함. 2026-09-19에 ALIO에서 검색되는 것을 확인한 곳만)
const BUSAN_ORGS = [
  '한국해양진흥공사', '한국주택금융공사', '한국자산관리공사', '한국해양수산개발원', '영화진흥위원회', '게임물관리위원회',
  '한국해양과학기술원', '부산항만공사', '해양수산과학기술진흥원', '한국어촌어항공단', '동남권원자력의학원', '국립부산과학관',
  '국립해양박물관', '한국해양수산연수원', '한국수산자원공단', '한국남부발전(주)', '부산대학교병원',
];

// 타 지역 공공기관에서 찾을 교육 관련 키워드(수강생 업무 범위: 콘텐츠·캠프·영어·수학여행·위탁 등)
const NATIONAL_KEYWORDS = ['교육', '강사', '캠프', '수학여행', '체험', '연수', '청소년', '어린이', '위탁'];

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const toIso = s => { const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(String(s ?? '')); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const dayMs = s => Date.parse(s + 'T00:00:00Z');

// ALIO 항목 → 앱 행. 입찰종료일이 없거나 등록일에서 2년 넘게 벗어나면(원본 표기 오류) open은 null로 둔다.
function toRow(x, cat = 4) {
  const posted = toIso(x.bdate);
  let open = toIso(x.bidInfoEndDt);
  if (open && posted && Math.abs(dayMs(open) - dayMs(posted)) > 730 * 86400000) open = null;
  return {
    no: String(x.seq), org: x.pname, cat, type: cat === 5 ? '공공기관 입찰(ALIO·타 지역)' : '공공기관 입찰(ALIO)', status: /취소/.test(x.rtitle) ? '취소' : '',
    posted, title: String(x.rtitle).trim(), award: '', open, openText: x.bidInfoEndDt ? x.bidInfoEndDt + '까지' : '', price: null, priceNote: '',
    url: `${BASE}/occasional/bidDtl.do?seq=${x.seq}`,
  };
}

const usable = x => x && x.rtitle && x.pname && x.seq && toIso(x.bdate);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function query(type, word, page) {
  const url = `${BASE}/occasional/findBidList.json?` + new URLSearchParams({ type, word, pageNo: String(page), area: '' });
  let res;
  for (let attempt = 1; ; attempt++) {   // 일시적인 연결 오류는 3초 쉬고 최대 2번 다시 시도한다(차단 응답은 다시 시도하지 않음)
    try { res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); break; }
    catch (e) { if (attempt >= 3) throw e; await sleep(3000); }
  }
  if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status} — 서버가 막아 멈춤(우회하지 않음)`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.status !== 'success') throw new Error('응답 오류: ' + (j.message || j.status));
  return j.data;
}

// 한 조회를 최신순으로 넘기며 cutoff(YYYY-MM-DD)보다 오래된 글이 나오면 멈춘다
async function collect(type, word, cutoffIso, onRow, keep) {
  let scanned = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const d = await query(type, word, p);
    const items = d.result || [];
    if (!items.length) break;
    let anyInRange = false;
    for (const x of items) {
      if (!usable(x)) continue;
      if (toIso(x.bdate) < cutoffIso) continue;
      anyInRange = true; scanned++;
      if (!keep || keep(x)) onRow(x);
    }
    if (!anyInRange || !d.page || d.page.nextPage_is === false) break;
    await sleep(DELAY_MS);
  }
  await sleep(DELAY_MS);
  return scanned;
}

async function main() {
  const today = new Date();
  const c = new Date(today.getTime() - DAYS_BACK * 86400000);
  const cutoffIso = iso(c.getFullYear(), c.getMonth() + 1, c.getDate());
  const seen = new Set(), rows = [], perOrg = {}, failed = {};
  const add = x => { if (seen.has(x.seq)) return; seen.add(x.seq); rows.push(toRow(x)); };
  const addOther = x => { if (seen.has(x.seq)) return; seen.add(x.seq); rows.push(toRow(x, 5)); };   // 부산 조회에서 이미 담은 공고는 4번으로 남는다
  for (const org of BUSAN_ORGS) {
    try { const n = await collect('apbaNa', org, cutoffIso, add, x => x.pname === org); perOrg[org] = n; process.stdout.write('.'); }
    catch (e) { failed[org] = e.message; process.stdout.write('x'); }
  }
  let titleBusan = 0;
  try { titleBusan = await collect('title', '부산', cutoffIso, add); } catch (e) { failed['제목 「부산」'] = e.message; }
  const busanCount = rows.length;
  const c2 = new Date(today.getTime() - DAYS_BACK_NATIONAL * 86400000);
  const cutoffNational = iso(c2.getFullYear(), c2.getMonth() + 1, c2.getDate());
  const perKeyword = {};
  for (const kw of NATIONAL_KEYWORDS) {
    try { perKeyword[kw] = await collect('title', kw, cutoffNational, addOther); process.stdout.write('+'); }
    catch (e) { failed['전국 「' + kw + '」'] = e.message; process.stdout.write('x'); }
  }
  console.log(`\n4번(부산 본사 기관 ${BUSAN_ORGS.length}곳 + 제목 「부산」 ${titleBusan}건 확인) ${busanCount}건 · 5번(타 지역 교육 키워드 ${NATIONAL_KEYWORDS.length}개) ${rows.length - busanCount}건 · 합계 ${rows.length} · 실패 ${Object.keys(failed).length}`);
  Object.entries(failed).forEach(([k, v]) => console.log('  실패:', k, v));
  // 일부 조회가 실패했는데 저장하면 자료가 줄어든 채 덮어써지므로, 실패가 있으면 기존 파일을 그대로 둔다
  if (Object.keys(failed).length) { console.log('일부 조회가 실패해 data_alio.js를 바꾸지 않았습니다. 잠시 뒤 다시 실행해 주세요.'); process.exit(2); }
  if (!rows.length) { console.log('가져온 공고가 없어 data_alio.js를 바꾸지 않았습니다.'); process.exit(1); }
  rows.sort((a, b) => (a.posted < b.posted ? 1 : -1));
  const posted = rows.map(r => r.posted).sort();
  const meta = {
    source: 'ALIO 공공기관 입찰공고(부산 본사 기관·제목에 「부산」 + 타 지역 교육 키워드)',
    url: `${BASE}/occasional/bidList.do`,
    license: 'ALIO 공개 입찰공고의 제목·기관명·입찰종료일·등록일·원문 링크만 담음. 내용·금액은 반드시 원문에서 확인',
    period: { from: posted[0], to: posted[posted.length - 1] },
    updateNote: '수집할 때마다 갱신',
    fetched: iso(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    orgs: BUSAN_ORGS, perOrg, nationalKeywords: NATIONAL_KEYWORDS, perKeyword, failed, rows,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data_alio.js'),
    '// tools/collect_alio.js가 만든 파일입니다. 직접 고치지 마세요.\nwindow.ALIO_BIDS = ' + JSON.stringify(meta, null, 1) + ';\n', 'utf8');
  console.log('저장: data_alio.js');
}

if (require.main === module) main().catch(e => { console.error('실패:', e.message); process.exit(1); });
module.exports = { toRow, toIso, BUSAN_ORGS, NATIONAL_KEYWORDS };
