// 수집 규칙 단위 테스트 (UT-07): node tools/test_collect_pen.js
const { parseOpenDate: p, RESULT_RE, parseList, toRow } = require('./collect_pen.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };
const P = '2026-09-18';
t('UT-07a 기간(연도 있음) 2026.9.18~2026.9.22 → 2026-09-22', p('2026.9.18~2026.9.22', P) === '2026-09-22');
t('UT-07b 시각 포함 단일 2026.10.08 11:00 → 2026-10-08', p('2026.10.08 11:00', P) === '2026-10-08');
t('UT-07c 끝 점·요일 2026.9.23. / 2026.09.21.(월) → 그 날짜', p('2026.9.23.', P) === '2026-09-23' && p('2026.09.21.(월)', P) === '2026-09-21');
t('UT-07d 뒤 날짜의 연도 생략 2026.9.17-9.23 → 2026-09-23', p('2026.9.17-9.23', '2026-09-17') === '2026-09-23');
t('UT-07e 시·분 문구 2026. 9. 15. 12시30분 ~ 9. 18. 12시30분 → 2026-09-18', p('2026. 9. 15. 12시30분 ~ 9. 18. 12시30분', '2026-09-15') === '2026-09-18');
t('UT-07f 해 넘김 2026.12.28~1.5 → 2027-01-05', p('2026.12.28~1.5', '2026-12-28') === '2027-01-05');
t('UT-07g 한글 표기 2026년 9월 30일 → 2026-09-30', p('2026년 9월 30일', P) === '2026-09-30');
t('UT-07h 못 읽으면 null: 빈 값·날짜 없음·없는 날짜(2026.2.31)·해가 1년 넘게 다름', p('', P) === null && p('상시', P) === null && p('2026.2.31', P) === null && p('2031.9.1', P) === null);
t('UT-07i 결과 안내는 거르고 공고는 남김', ['2026년 9월 식재료 (소액수의) 구매 개찰 결과', '입찰 결과 공고', '낙찰자 결정 안내'].every(x => RESULT_RE.test(x)) &&
  ['삼성여자고등학교 10월 급식 식자재구매 전자입찰 공고', '초연중학교 다목적강당증축 건축설계공모 공고', '학교 교육과정 결과물 전시 운영 용역'].every(x => !RESULT_RE.test(x)));
const html = '<table><tbody><tr><td>1</td><td class="bbs_tit"><em class="mTit">제목</em><a data-id="77" class="nttInfoBtn"> 가나 &amp; 다 입찰공고 </a></td><td><em>기관명</em> 해운대초등학교 </td><td><em>입찰일시</em> 2026.9.22 </td><td><em>등록일</em> 2026.09.18 </td></tr></tbody></table>';
const r = parseList(html);
t('UT-07j 목록 한 줄 읽기: 번호·제목(&amp; 풀림)·기관·입찰일시·등록일(→2026-09-18)·id', r.length === 1 && r[0].title === '가나 & 다 입찰공고' && r[0].org === '해운대초등학교' && r[0].openText === '2026.9.22' && r[0].posted === '2026-09-18' && r[0].id === '77');
const row = toRow({ no: '5', title: '가 수학여행 입찰 취소공고', org: '나중', openText: '2026.9.22', posted: '2026-09-18', id: '9' });
const dot = toRow({ no: '6', title: '다 입찰공고', org: '라중', openText: '.', posted: '2026-09-18', id: '10' });
t('UT-07k 행 만들기: 개찰일·입찰일시 원문 보존, 취소 표시, 금액 null, 분류 2번, 원문 링크 · 날짜 없는 원문(「.」)은 비움',
  row.open === '2026-09-22' && row.openText === '2026.9.22' && row.status === '취소' && row.price === null && row.cat === 2 &&
  row.url === 'https://www.pen.go.kr/main/na/ntt/selectNttInfo.do?mi=30514&bbsId=2407&nttSn=9' &&
  dot.openText === '' && dot.open === null && dot.status === '');
console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
