// 키 저장 도우미 단위 테스트 (UT-20): node tools/test_save_g2b_key.js
const { cleanKeyInput, mergeEnv } = require('./save_g2b_key.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };

t('UT-20a 입력 정리: 앞뒤 공백·따옴표·「G2B_KEY=」를 같이 붙여 넣은 경우도 키만 남김 · 키 안의 + / = % 는 그대로',
  cleanKeyInput('  abc+12/x==  ') === 'abc+12/x==' && cleanKeyInput('"abc123"') === 'abc123' && cleanKeyInput('G2B_KEY=abc123') === 'abc123' &&
  cleanKeyInput('g2b_key = "ab%2Bc"') === 'ab%2Bc' && cleanKeyInput('') === '' && cleanKeyInput(null) === '');
t('UT-20b 파일 합치기: 파일이 없으면 한 줄 · 이미 있는 G2B_KEY 줄은 바꿈(중복 없음) · 다른 줄은 보존 · 끝에 줄바꿈 하나',
  mergeEnv('', 'k1') === 'G2B_KEY=k1\n' && mergeEnv('OTHER=1\nG2B_KEY=old\n', 'new') === 'OTHER=1\nG2B_KEY=new\n' && mergeEnv('G2B_KEY=a\r\nG2B_KEY=b\r\nX=2\r\n', 'z') === 'X=2\nG2B_KEY=z\n');

console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
