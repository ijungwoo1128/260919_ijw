// 대학 자료 변환 규칙 단위 테스트 (UT-11): node tools/test_build_univ.js
const { toRow } = require('./build_univ.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };

const x = {
  subCategory: '사립대학교', org: '경성대학교', author: '홍길동', phone: '051-000-0000', title: '입찰공고 경성대학교 e스포츠 교육', url: 'https://example.ac.kr/1',
  status: '재공고', regDate: '2026-09-17', deadline: '2026-10-16', submit: '2026.10.16.(금) 15:00까지', amount: 30000000,
  attachments: [{ name: '제안요청서.hwp', url: 'https://example.ac.kr/f' }], notes: ['협상에 의한 계약'],
};
const r = toRow(x);
t('UT-11a 변환: 3번 기관·유형·재공고 표시·등록일·마감일(open)·제출 원문·금액·원문 링크', r.cat === 3 && r.org === '경성대학교' && r.type === '대학 입찰(사립대학교)' && r.status === '재공고' &&
  r.posted === '2026-09-17' && r.open === '2026-10-16' && r.openText === '2026.10.16.(금) 15:00까지' && r.price === 30000000 && r.url === 'https://example.ac.kr/1');
t('UT-11b 개인정보·첨부 제외: 담당자·연락처·첨부·요약이 결과에 없음', !JSON.stringify(r).includes('홍길동') && !JSON.stringify(r).includes('051-000-0000') &&
  !('author' in r) && !('phone' in r) && !('attachments' in r) && !('notes' in r) && !JSON.stringify(r).includes('제안요청서'));
const y = toRow({ subCategory: '', org: 'ㄱ대', title: '가 입찰', url: 'u', status: '공고', regDate: '2026-09-01', deadline: null, submit: null, amount: null });
t('UT-11c 값이 없을 때: 마감일 null · 금액 null · 제출 원문 빈 문자열 · 유형은 「대학 입찰(대학)」', y.open === null && y.price === null && y.openText === '' && y.type === '대학 입찰(대학)' && y.status === '');

console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
