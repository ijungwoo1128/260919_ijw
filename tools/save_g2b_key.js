// 나라장터 서비스키를 .env.local 에 저장하고, 서버에 한 번 물어 유효한지 확인한다. (키를 채팅에 붙여 넣지 않기 위한 도우미)
// 사용: 터미널에서  node tools/save_g2b_key.js   → 「키를 붙여 넣고 Enter」 → 저장 + 확인 결과(성공/실패 사유)만 화면에 나온다. 키는 화면에 다시 찍지 않는다.
// 옵션: --out <경로>  저장 위치를 바꾼다(시험용)
// 참고: 활용신청 직후에는 키가 서버에 반영되기까지 시간이 걸려(보통 몇 분~1시간) 「등록되지 않은 서비스키」로 나올 수 있다. 그때도 파일은 저장되니 조금 뒤 다시 확인하면 된다.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { readKey } = require('./collect_g2b.js');
const { apiError } = require('./collect_g2b.js');

const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : path.join(__dirname, '..', '.env.local');
const CHECK_URL = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc';

// 입력한 글자에서 키만 뽑는다(「G2B_KEY=」를 같이 붙여 넣었거나 따옴표·공백이 있어도 받는다)
function cleanKeyInput(s) {
  return String(s ?? '').trim().replace(/^G2B_KEY\s*=\s*/i, '').replace(/^["']|["']$/g, '').trim();
}

// .env.local 내용을 만든다: 기존의 다른 줄은 두고 G2B_KEY 줄만 바꾼다
function mergeEnv(oldText, key) {
  const lines = String(oldText ?? '').split(/\r?\n/).filter(l => l.trim() !== '' && !/^\s*G2B_KEY\s*=/.test(l));
  lines.push('G2B_KEY=' + key);
  return lines.join('\n') + '\n';
}

async function verify(key) {
  const decoded = readKey('G2B_KEY=' + key, {});
  const q = new URLSearchParams({ serviceKey: decoded, pageNo: '1', numOfRows: '1', type: 'json', inqryDiv: '1', inqryBgnDt: '202609010000', inqryEndDt: '202609012359' });
  try {
    const res = await fetch(`${CHECK_URL}?${q}`, { signal: AbortSignal.timeout(20000) });
    const json = await res.json();
    const err = apiError(json);
    return err ? { ok: false, message: err } : { ok: true, message: `정상 응답(HTTP ${res.status})` };
  } catch (e) {
    return { ok: false, message: '확인하지 못함: ' + (e.cause?.code || e.message) };
  }
}

function ask(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    process.stdout.write(prompt);
    // 줄을 받으면 먼저 값을 돌려주고 나서 입력창을 닫는다(닫는 순간 「close」 처리기가 빈 값을 돌려주는 것을 막기 위해 순서가 중요하다)
    rl.once('line', line => { resolve(line); rl.close(); });
    rl.once('close', () => resolve(''));
  });
}

async function main() {
  console.log('나라장터 서비스키를 저장합니다. (이 창에만 붙여 넣으세요. 채팅에는 붙여 넣지 마세요)');
  const key = cleanKeyInput(await ask('서비스키 붙여 넣고 Enter: '));
  if (!key) { console.log('빈 값이라 저장하지 않았습니다.'); process.exitCode = 1; return; }   // process.exit()는 윈도우에서 입력창이 닫히는 중이면 경고와 함께 비정상 종료한다
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  fs.writeFileSync(OUT, mergeEnv(old, key), 'utf8');
  console.log(`저장했습니다: ${OUT} (키 ${key.length}글자, 화면에는 다시 표시하지 않습니다)`);
  const v = await verify(key);
  console.log(v.ok ? `✔ 서버 확인: ${v.message}` : `✘ 서버 확인: ${v.message}`);
  if (!v.ok) console.log('  → 「등록되지 않은 서비스키」라면 활용신청 직후 반영 대기이거나 키를 잘못 복사한 것입니다. 잠시 뒤 다시 실행해 보세요.');
  process.exitCode = v.ok ? 0 : 2;
}

if (require.main === module) main();
module.exports = { cleanKeyInput, mergeEnv };
