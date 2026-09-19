// ALIO 수집 규칙 단위 테스트 (UT-12): node tools/test_collect_alio.js
const { toRow, toIso, BUSAN_ORGS, NATIONAL_KEYWORDS } = require('./collect_alio.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };

t('UT-12a 날짜 변환: 2026.09.19 → 2026-09-19 · null·빈값·형식 틀림 → null', toIso('2026.09.19') === '2026-09-19' && toIso(null) === null && toIso('') === null && toIso('2026-09-19') === null);

const x = { rtitle: '2026년 교육 운영 용역', pname: '부산항만공사', bidInfoEndDt: '2026.09.29', bdate: '2026.09.18', seq: 3577000, cdNo: 'B1030' };
const r = toRow(x);
t('UT-12b 행 만들기: 4번 기관·유형·등록일·입찰종료일(open)과 원문 · 금액 null · 원문 링크', r.cat === 4 && r.org === '부산항만공사' && r.type === '공공기관 입찰(ALIO)' && r.posted === '2026-09-18' &&
  r.open === '2026-09-29' && r.openText === '2026.09.29까지' && r.price === null && r.url === 'https://www.alio.go.kr/occasional/bidDtl.do?seq=3577000' && r.status === '');

const bad = toRow({ ...x, bidInfoEndDt: '2029.09.30' });
const none = toRow({ ...x, bidInfoEndDt: null });
t('UT-12c 입찰종료일이 없거나 등록일에서 2년 넘게 벗어난 오기(2029.09.30) → open null (원문 표기는 남김)', bad.open === null && bad.openText === '2029.09.30까지' && none.open === null && none.openText === '');
t('UT-12d 제목에 「취소」가 있으면 취소 표시', toRow({ ...x, rtitle: '가 입찰 취소 공고' }).status === '취소');
t('UT-12e 부산 본사 기관 목록: 중복 없음 · 17곳 · 한국남부발전은 ALIO 표기 「한국남부발전(주)」', new Set(BUSAN_ORGS).size === BUSAN_ORGS.length && BUSAN_ORGS.length === 17 && BUSAN_ORGS.includes('한국남부발전(주)') && !BUSAN_ORGS.includes('한국남부발전'));

const o5 = toRow(x, 5);
t('UT-12f 타 지역 공공기관은 5번(기타)·유형에 「타 지역」, 기본은 4번 · 전국 키워드 9개(교육·강사·캠프·수학여행·체험·연수·청소년·어린이·위탁)', o5.cat === 5 && o5.type === '공공기관 입찰(ALIO·타 지역)' && toRow(x).cat === 4 &&
  NATIONAL_KEYWORDS.length === 9 && ['교육', '수학여행', '캠프', '위탁'].every(k => NATIONAL_KEYWORDS.includes(k)));

console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
