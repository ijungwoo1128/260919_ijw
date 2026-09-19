// 나라장터 수집 규칙 단위 테스트 (UT-14): node tools/test_collect_g2b.js
// ※ 서비스키 없이 만든 모의 응답 기준이다. 실제 API 응답과 필드가 같은지는 키로 처음 실행할 때 확인해야 한다(그 전에는 「실제 확인 전」).
const { readKey, classifyInstt, extractItems, apiError, toRow } = require('./collect_g2b.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };

t('UT-14a 키 읽기: .env.local의 G2B_KEY · 따옴표 제거 · Encoding 키(%)는 한 번 풀기 · 없으면 빈 문자열 · 환경변수가 우선',
  readKey('G2B_KEY=abc123', {}) === 'abc123' && readKey('# 메모\nG2B_KEY = "ab+c/d=="\n', {}) === 'ab+c/d==' && readKey('G2B_KEY=ab%2Bc%2Fd%3D%3D', {}) === 'ab+c/d==' &&
  readKey('', {}) === '' && readKey('G2B_KEY=file', { G2B_KEY: 'env' }) === 'env');

t('UT-14b 기관 분류: 교육청·학교→2 · 대학교→3 · 부산시·구·군·시설공단→1 · 정부 산하(공단·진흥원)→4 · 그 밖→5',
  classifyInstt('부산광역시교육청') === 2 && classifyInstt('부산 동래초등학교') === 2 && classifyInstt('부산대학교') === 3 && classifyInstt('동의대학교 산학협력단') === 3 &&
  classifyInstt('부산광역시') === 1 && classifyInstt('부산광역시 해운대구') === 1 && classifyInstt('부산시설공단') === 1 && classifyInstt('한국해양진흥공사') === 4 &&
  classifyInstt('국립해양박물관') === 4 && classifyInstt('(주)어떤회사') === 5 && classifyInstt('') === 5);

t('UT-14c 응답 항목 꺼내기: items가 배열인 형태 · {item: 배열} · {item: 객체 1개} · 항목 없음/오류 응답은 빈 배열',
  extractItems({ response: { body: { items: [{ a: 1 }, { a: 2 }] } } }).length === 2 && extractItems({ response: { body: { items: { item: [{ a: 1 }] } } } }).length === 1 &&
  extractItems({ response: { body: { items: { item: { a: 1 } } } } }).length === 1 && extractItems({ response: { body: {} } }).length === 0 && extractItems({}).length === 0 && extractItems(null).length === 0);

t('UT-14d 오류 응답 알아보기: 키 없음(OpenAPI_ServiceResponse) · resultCode≠00 · 정상은 빈 문자열',
  apiError({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE_KEY_IS_NULL', returnAuthMsg: '서비스 접근거부', returnReasonCode: '20' } } }) === '서비스 접근거부(20)' &&
  apiError({ response: { header: { resultCode: '03', resultMsg: 'NODATA_ERROR' } } }) === 'NODATA_ERROR(03)' && apiError({ response: { header: { resultCode: '00', resultMsg: 'OK' } } }) === '');

const x = { bidNtceNo: 'R26BK01234567', bidNtceOrd: '01', bidNtceNm: '2026 청소년 진로체험 프로그램 운영 용역', ntceInsttNm: '부산광역시교육청', dminsttNm: '부산광역시교육청 부산진구교육지원청',
  bidNtceDt: '2026-09-18 10:30:00', bidClseDt: '2026-09-28 10:00:00', opengDt: '2026-09-28 11:00:00', presmptPrce: '45000000', asignBdgtAmt: '50000000',
  ntceKindNm: '재공고', bidNtceDtlUrl: 'https://www.g2b.go.kr/link/example' };
const r = toRow(x, '용역');
t('UT-14e 행 만들기(모의): 공고번호-차수 · 수요기관 · 2번 기관 · 재공고 · 등록일 · 개찰일 · 마감 원문 · 추정가격(예산보다 우선) · 링크',
  r.no === 'R26BK01234567-01' && r.org === '부산광역시교육청 부산진구교육지원청' && r.cat === 2 && r.type === '나라장터 용역' && r.status === '재공고' && r.posted === '2026-09-18' &&
  r.open === '2026-09-28' && r.openText === '입찰마감 2026-09-28 10:00' && r.price === 45000000 && r.url === 'https://www.g2b.go.kr/link/example');
const y = toRow({ bidNtceNo: 'N1', bidNtceNm: '취소 입찰', ntceInsttNm: '부산대학교', bidNtceDt: '2026-09-01', asignBdgtAmt: '7,000,000' }, '물품');
t('UT-14f 값이 없거나 다를 때: 예산만 있으면 예산 · 쉼표 숫자 · 개찰일 없음 null · 차수 없음 00 · 취소 표시 · 링크 없으면 나라장터 첫 화면',
  y.price === 7000000 && y.open === null && y.openText === '' && y.no === 'N1-00' && y.status === '취소' && y.cat === 3 && y.url === 'https://www.g2b.go.kr' && toRow({ bidNtceNo: 'N2', bidNtceNm: 'x', ntceInsttNm: '가', bidNtceDt: '2026-09-01' }, '용역').price === null);

console.log(`\n${pass}/${pass + fail} PASS (모의 응답 기준 · 실제 API 확인 전)`); process.exit(fail ? 1 : 0);
