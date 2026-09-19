// 교육지원청 수집 규칙 단위 테스트 (UT-16): node tools/test_collect_ofc.js
const { parseRows, toRow, isDropped, BOARDS, OFFICES } = require('./collect_ofc.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };

// 열 구성 A(입찰명·입찰일시·등록일·입찰결과): 실제 남부교육지원청 학교입찰 게시판의 한 줄과 같은 모양 + 공지 고정글
const A = '<table><thead><tr><th>번호</th><th>입찰명</th><th>입찰일시</th><th>등록일</th><th>조회</th><th>입찰결과</th></tr></thead><tbody>' +
  '<tr><td><b class="btn_S">공지</b></td><td class="al"><a href="/nambu/na/ntt/selectNttInfo.do?nttSn=864125"> [선금 신청 및 정산 서류] </a></td><td>2024/07/01</td><td>2024.07.18</td><td>1189</td><td>-</td></tr>' +
  '<tr><td class="BD_tm_none">1174</td><td class="ta_l"><a href="javascript:" data-id="1038288" class="nttInfoBtn"> 2027학년도 당감초등학교 현장체험학습 위탁 입찰 공고 </a></td><td> 2026/09/28 10:00 </td><td>2026.09.18</td><td>0</td><td><span>진행중</span></td></tr></tbody></table>';
// 열 구성 B(제목·작성자·등록일·첨부): 북부교육지원청 학교입찰 게시판
const B = '<table><thead><tr><th>번호</th><th>제목</th><th>작성자</th><th>등록일</th><th>조회</th><th>첨부</th></tr></thead><tbody>' +
  '<tr><td>4338</td><td><a href="javascript:" data-id="777" class="nttInfoBtn">명문초등학교 방과후학교 프로그램 위탁 공고</a></td><td>명문초등학교</td><td>2026.09.18</td><td>0</td><td></td></tr>' +
  '<tr><td>1452</td><td><a href="javascript:" data-id="778" class="nttInfoBtn">백양중학교 급식실현대화 및 기타 전기공사 공고</a></td><td>학교지원과</td><td>2026.08.31</td><td>9</td><td></td></tr></tbody></table>';

const a = parseRows(A), b = parseRows(B);
t('UT-16a 열 구성 A: 머리글로 열을 찾아 입찰명·입찰일시·등록일·결과·id 읽기, 「공지」 고정글은 뺌', a.length === 1 && a[0].id === '1038288' && a[0].title === '2027학년도 당감초등학교 현장체험학습 위탁 입찰 공고' &&
  a[0].openText === '2026/09/28 10:00' && a[0].posted === '2026-09-18' && a[0].result === '진행중' && a[0].no === '1174');
t('UT-16b 열 구성 B: 제목·작성자·등록일 읽기(입찰일시 없음) · 머리글이 없거나 알 수 없으면 빈 배열', b.length === 2 && b[0].author === '명문초등학교' && b[1].author === '학교지원과' && b[0].openText === '' && parseRows('<table></table>').length === 0 && parseRows('').length === 0);

const rA = toRow(a[0], BOARDS.find(x => x.slug === 'nambu' && x.kind === '학교'));
const rB0 = toRow(b[0], BOARDS.find(x => x.slug === 'bukbu' && x.kind === '학교')), rB1 = toRow(b[1], BOARDS.find(x => x.slug === 'bukbu' && x.kind === '지원청'));
t('UT-16c 행 만들기: 2번 기관 · 개찰일(입찰일시 슬래시 표기→날짜) · 유형 · 기관명(작성자가 학교면 학교, 부서면 「부산○○교육지원청 부서」) · 상세 링크 · 금액 null',
  rA.cat === 2 && rA.open === '2026-09-28' && rA.openText === '2026/09/28 10:00' && rA.org === '부산남부교육지원청' && rA.type === '남부교육지원청 학교입찰' && rA.price === null &&
  rA.url === 'https://home.pen.go.kr/nambu/na/ntt/selectNttInfo.do?mi=11866&bbsId=3991&nttSn=1038288' &&
  rB0.org === '명문초등학교' && rB0.open === null && rB1.org === '부산북부교육지원청 학교지원과' && rB1.type === '북부교육지원청 입찰공고');
t('UT-16d 제외 규칙: 급식 식재료·급식 종합계약·불용물품·결과 안내(「…공고 결과」「…구매 결과」)는 뺌, 체험학습·방과후·수학여행·급식실 공사·「결과물」이 든 제목은 남김', ['2026년 10월 당감초등학교 학교급식식재료 소액수의 공고', '해운대초 급식품 구매 공고', '아미초등학교 불용물품 매각 전자입찰 공고 알림', '해동중학교 생활복 업체 선정 결과', '성남초등학교 학교급식 식재료 개찰 결과',
  '2026학년도 동수영중학교 고철 매각 전자입찰공고 결과', '2027학년도 사직여자중학교 교복 학교주관구매 결과', '2026년 10월 금사중 급식 종합 계약 소액수의 공고']
  .every(x => isDropped({ title: x })) && ['현장체험학습 위탁 입찰 공고', '방과후학교 프로그램 위탁 공고', '수학여행 위탁 용역 입찰', '전기공사 공고',
    '부산진여자상업고등학교 급식실현대화공사 감리용역', '결과물 활용 콘텐츠 제작 용역 공고'].every(x => !isDropped({ title: x })));
t('UT-16e 대상 게시판 8곳 · 5개 지원청 이름 · 서부·동래는 지원청 자체 입찰 게시판이 없음(나라장터 링크뿐)', BOARDS.length === 8 && Object.values(OFFICES).sort().join(',') === '남부,동래,북부,서부,해운대' &&
  !BOARDS.some(x => x.slug === 'seobu' && x.kind === '지원청') && !BOARDS.some(x => x.slug === 'dongnae' && x.kind === '지원청'));

console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
