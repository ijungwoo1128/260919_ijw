// 구·군 수집 규칙 단위 테스트 (UT-10): node tools/test_collect_gu.js
const { parseRows, toRow, RESULT_RE, GU, SKIPPED } = require('./collect_gu.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };

// 양식 A(중구·수영구 등): 번호 · 제목(링크) · 부서명 · 날짜 · 조회
const A = '<table><tr><th>번 호</th><th>제 목</th></tr>' +
  '<tr><td>4</td><td class="subject"><a href="javaScript:searchDetail(\'30104\')">중부소방서 뒤 노상 공영주차장 수탁자 선정 전자입찰 재공고</a></td><td>교통행정과</td><td class="data">2026-09-17</td><td>7</td></tr></table>';
// 양식 B(동구·동래구 등): 번호에도 링크 · 제목 링크 · 공고번호 · 날짜 · 조회 (부서명 칸 없음)
const B = '<table><tr><td><a href="javascript:searchDetail(\'2010\')">2</a></td><td><a href="javascript:searchDetail(\'2010\')">공사 전자입찰 안내 공고(보도정비공사)</a></td>' +
  '<td>부산광역시 동구 공고 제2026-793호</td><td>2026.09.18</td><td>3</td></tr></table>';
// 양식 C(해운대구): 날짜 표기가 점(.)이고 제목 안에 공백·줄바꿈
const C = '<table><tr class="x"><td>10</td><td class="ellipsis"><a href="#" onclick="searchDetail(\'77\');return false;">방치자전거\n  보관 공고</a></td><td>교통행정과</td><td>2026.09.17</td></tr></table>';

// 양식 D(영도구): 링크(<a>) 없이 칸마다 onclick만 있음 · 공고번호 칸이 제목 앞에 있음 · 부서명 칸 있음
const oc = 'onclick="javaScript:searchDetail(\'36448\')"';
const D = `<table><tr ><td ${oc}>53</td><td ${oc}><p>부산광역시 영도구 공고 제2026-977호</p></td><td ${oc}><p>2026년 연안어선 감척사업 대상어선 일괄매각 전자입찰</p></td><td ${oc}>해양수산과</td><td ${oc}>2026-09-16</td></tr></table>`;
const a = parseRows(A), b = parseRows(B), c = parseRows(C), d = parseRows(D);
t('UT-10g 양식 D(영도구, 링크 없음): 공고번호 칸이 아니라 긴 제목 칸을 제목으로, 부서·날짜·공고번호 읽기', d.length === 1 && d[0].id === '36448' &&
  d[0].title === '2026년 연안어선 감척사업 대상어선 일괄매각 전자입찰' && d[0].dept === '해양수산과' && d[0].posted === '2026-09-16' &&
  d[0].noticeNo === '부산광역시 영도구 공고 제2026-977호');
t('UT-10a 양식 A: 번호·제목·부서명·날짜·id 읽기(머리글 줄 무시)', a.length === 1 && a[0].id === '30104' && a[0].title === '중부소방서 뒤 노상 공영주차장 수탁자 선정 전자입찰 재공고' &&
  a[0].dept === '교통행정과' && a[0].posted === '2026-09-17');
t('UT-10b 양식 B: 번호 칸에도 링크가 있어도 제목은 글자가 긴 링크, 공고번호는 부서로 착각하지 않음, 날짜 점 표기 → 하이픈', b.length === 1 && b[0].title === '공사 전자입찰 안내 공고(보도정비공사)' &&
  b[0].noticeNo === '부산광역시 동구 공고 제2026-793호' && b[0].dept === '' && b[0].posted === '2026-09-18');
t('UT-10c 양식 C: 제목 안 줄바꿈은 공백 하나로, 날짜 점 표기', c.length === 1 && c[0].title === '방치자전거 보관 공고' && c[0].posted === '2026-09-17' && c[0].dept === '교통행정과');

const r1 = toRow(a[0], '중구', 'bsjunggu.go.kr', false), r2 = toRow(b[0], '동구', 'bsdonggu.go.kr', true);
t('UT-10d 행 만들기: 1번 기관·기관명(구+부서)·유형(입찰공고/고시·공고)·개찰일 null·금액 null·상세 GET 주소', r1.cat === 1 && r1.org === '부산광역시 중구 교통행정과' && r1.type === '중구 입찰공고' &&
  r2.org === '부산광역시 동구' && r2.type === '동구 고시·공고' && r2.no === '부산광역시 동구 공고 제2026-793호' && r1.open === null && r1.price === null &&
  r1.url.startsWith('https://eminwon.bsjunggu.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do?') && r1.url.includes('not_ancmt_mgt_no=30104'));
t('UT-10e 결과 안내는 거르고, 취소는 남기되 표시', RESULT_RE.test('2026년 수의계약 개찰 결과 공고') && !RESULT_RE.test('공영주차장 위탁 관리 입찰 공고') &&
  toRow({ id: '1', title: '가 입찰 취소 공고', dept: '', posted: '2026-09-01', noticeNo: '' }, '북구', 'bsbukgu.go.kr', false).status === '취소');
t('UT-10f 대상 14곳과 제외 2곳(남구·사하구): 겹치지 않음', Object.keys(GU).length === 14 && !('남구' in GU) && !('사하구' in GU) && SKIPPED['남구'] && SKIPPED['사하구']);

console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
