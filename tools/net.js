// 수집기 공통: 일시적인 연결 오류(시간 초과·연결 끊김)는 잠깐 쉬고 다시 시도한다.
// 서버가 응답한 오류(401·403·404 등)는 다시 시도하지 않는다 — 차단 응답을 반복해서 두드리지 않기 위해서다.
// 시간 제한 신호(AbortSignal)는 시도마다 새로 만든다(한 번 만료된 신호를 다시 쓰면 다시 시도해도 곧바로 실패한다).
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchRetry(url, opts = {}, cfg = {}) {
  const { tries = 3, waitMs = 3000, timeoutMs = 20000 } = cfg;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (attempt >= tries) throw e;
      await sleep(waitMs);
    }
  }
}

module.exports = { fetchRetry, sleep };
