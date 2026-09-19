// 공통 재시도 단위 테스트 (UT-19): node tools/test_net.js  (가짜 fetch로 검사, 네트워크 안 씀)
const { fetchRetry } = require('./net.js');
let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS' : 'FAIL') + ' · ' + name); };

(async () => {
  const realFetch = global.fetch;
  try {
    // ① 처음 2번은 연결 오류, 3번째에 성공 → 3번 부르고 결과를 돌려줌
    let calls = 0, signals = [];
    global.fetch = async (url, o) => { calls++; signals.push(o.signal); if (calls < 3) throw new Error('timeout'); return { status: 200, url }; };
    const r = await fetchRetry('http://x', {}, { tries: 3, waitMs: 1, timeoutMs: 1000 });
    ok('UT-19a 일시 오류 2번 뒤 성공: 3번째 시도의 응답을 돌려줌', r.status === 200 && calls === 3);
    ok('UT-19b 시도마다 새 시간 제한 신호를 만듦(같은 신호를 재사용하지 않음)', signals.length === 3 && new Set(signals).size === 3);

    // ② 계속 실패 → tries번 부르고 마지막 오류를 던짐
    calls = 0; global.fetch = async () => { calls++; throw new Error('연결 끊김 ' + calls); };
    let msg = ''; try { await fetchRetry('http://x', {}, { tries: 3, waitMs: 1 }); } catch (e) { msg = e.message; }
    ok('UT-19c 계속 실패하면 정확히 3번 시도하고 마지막 오류를 던짐', calls === 3 && msg === '연결 끊김 3');

    // ③ 서버가 응답한 오류(403)는 다시 시도하지 않고 그대로 돌려줌(차단 응답을 반복해서 두드리지 않음)
    calls = 0; global.fetch = async () => { calls++; return { status: 403 }; };
    const b = await fetchRetry('http://x', {}, { tries: 3, waitMs: 1 });
    ok('UT-19d 403 같은 서버 응답은 1번만 부르고 그대로 돌려줌', b.status === 403 && calls === 1);
  } finally { global.fetch = realFetch; }
  console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
})();
