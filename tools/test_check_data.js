// 자료 검사기 단위 테스트 (UT-18): node tools/test_check_data.js
const { inspect, shrunk, FILES } = require('./check_data.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };

const row = o => Object.assign({ title: '가 입찰', org: '나기관', cat: 2, posted: '2026-09-18', open: null, price: null }, o || {});
const file = rows => '// 주석\nwindow.X_BIDS = ' + JSON.stringify({ source: 's', rows }) + ';\n';

t('UT-18a 정상 파일: 통과 · 공고 수', (function () { const r = inspect(file([row(), row({ open: '2026-10-01', price: 5000000 })])); return r.ok && r.rows === 2 && r.problems.length === 0; })());
t('UT-18b 형식이 틀린 공고를 셈: 제목 없음·기관 없음·분류 7·등록일 형식·개찰일 형식·금액이 문자열', (function () {
  const r = inspect(file([row({ title: '' }), row({ org: '' }), row({ cat: 7 }), row({ posted: '2026.09.18' }), row({ open: '내일' }), row({ price: '5,000' }), row()]));
  return !r.ok && r.rows === 7 && r.problems[0] === '형식이 틀린 공고 6건';
})());
t('UT-18c 개인정보 패턴: phone·author 필드나 전화번호가 있으면 실패', !inspect(file([row({ phone: '051-123-4567' })])).ok && !inspect(file([row({ author: '홍길동' })])).ok && !inspect(file([row({ title: '문의 010-1234-5678' })])).ok && inspect(file([row({ title: '2026-09-18 공고' })])).ok);
t('UT-18d 읽을 수 없는 파일: 문법 오류 · 형식이 다른 파일(rows 없음·변수 2개)은 실패', !inspect('window.X = {').ok && !inspect('window.X = {a:1};').ok && !inspect('window.A = {rows:[]}; window.B = {rows:[]};').ok && inspect('window.A = {rows:[]};').ok);
t('UT-18e 급감 검사: 이전 100건→49건은 이상 · 50건은 정상 · 이전이 20건 미만이면 검사 안 함 · 늘어나면 정상', shrunk(100, 49) && !shrunk(100, 50) && !shrunk(19, 0) && shrunk(20, 9) && !shrunk(30, 200));
t('UT-18f 대상 파일 목록: 수집 결과 7개이며 고정 자료(data.js)·비공개(data_pilot.js)는 없음', FILES.length === 7 && !FILES.includes('data.js') && !FILES.includes('data_pilot.js') && FILES.includes('data_g2b.js'));

console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
