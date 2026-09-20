// 배포된 주소를 진짜 브라우저(Chrome/Edge, 화면 없이)로 열어 사람이 눌러 보는 확인을 자동으로 한다.
// 실행: node tools/e2e_deployed.js [주소] [--browser 경로] [--json 결과파일] [--allow-private]
//   기본 주소: https://260919-ijw.vercel.app     로컬 시험: node tools/e2e_deployed.js http://localhost:5187
// 방법: 브라우저를 원격 조종(CDP)해 실제 마우스 클릭·글자 입력·클립보드 읽기를 한다(Node 22+ 내장 WebSocket만 쓰고 따로 설치할 것이 없다).
// 끝 코드: 0 = 전부 통과, 1 = 실패가 있음.  --allow-private: 비공개 자료 점검(E-privacy)을 건너뜀(내 PC 로컬 주소용).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { fetchRetry } = require('./net.js');

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const BASE = (args.find(a => /^https?:\/\//.test(a)) || 'https://260919-ijw.vercel.app').replace(/\/$/, '');
const ALLOW_PRIVATE = args.includes('--allow-private');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findBrowser() {
  const c = [flag('--browser'), process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return c.find(p => fs.existsSync(p));
}

// ── 아주 작은 CDP 클라이언트 ──
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; this.session = null;
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      else if (m.method) this.handlers.forEach(h => h(m));
    });
  }
  send(method, params = {}, useSession = true) {
    const id = ++this.id; const msg = { id, method, params };
    if (useSession && this.session) msg.sessionId = this.session;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify(msg)); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('시간 초과: ' + method)); } }, 30000); });
  }
  on(fn) { this.handlers.push(fn); }
  once(method) { return new Promise(res => { const h = m => { if (m.method === method) { this.handlers = this.handlers.filter(x => x !== h); res(m); } }; this.handlers.push(h); }); }
}

async function main() {
  const exe = findBrowser();
  if (!exe) { console.log('Chrome/Edge를 찾지 못했습니다. --browser 경로 또는 CHROME_PATH를 지정하세요.'); process.exit(2); }
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1000,1000', '--disable-extensions'];
  if (process.platform === 'linux') flags.push('--no-sandbox');
  const proc = spawn(exe, [...flags, 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => { try { proc.kill(); } catch {} setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }, 1500); };
  process.on('exit', cleanup);

  let ver;
  for (let i = 0; i < 60; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(500); } }
  if (!ver) { console.log('브라우저를 시작하지 못했습니다.'); cleanup(); process.exit(2); }
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new Cdp(ws);
  const origin = new URL(BASE).origin;
  await cdp.send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }, false).catch(() => {});
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false);
  cdp.session = (await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  for (const d of ['Page', 'Runtime', 'Network', 'Log']) await cdp.send(d + '.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1000, deviceScaleFactor: 1, mobile: false });

  // 페이지에서 일어난 오류·요청을 모은다
  let jsErrors = [], requests = [], badStatus = [];
  cdp.on(m => {
    if (m.sessionId !== cdp.session) return;
    if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) badStatus.push(m.params.response.status + ' ' + m.params.response.url);
  });
  const resetLogs = () => { jsErrors = []; requests = []; badStatus = []; };

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('페이지 오류: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await ev(expr)) return true; } catch {} await sleep(150); } return false; };
  const go = async (p) => { resetLogs(); const loaded = cdp.once('Page.loadEventFired'); await cdp.send('Page.navigate', { url: BASE + p }); await Promise.race([loaded, sleep(20000)]); await waitFor('document.readyState==="complete"'); await sleep(400); };
  // 실제 마우스 클릭: 요소를 화면 가운데로 옮기고 그 좌표를 누른다(사용자 조작으로 인정되어 클립보드도 허용된다)
  const click = async (sel) => {
    const pt = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    if (!pt) throw new Error('요소 없음: ' + sel);
    for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type: t, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(250);
  };
  // 실제 글자 입력: 칸을 선택해 통째로 바꿔 넣는다
  const typeInto = async (sel, text) => {
    await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'center'});e.focus();e.select();})()`);
    if (text === '') await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 }), await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
    else await cdp.send('Input.insertText', { text });
    await sleep(120);
  };
  const $t = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent:null})()`);
  const hidden = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return !e||e.hidden||e.offsetParent===null})()`);

  const results = [];
  const check = async (id, name, fn) => {
    let ok = false, detail = '';
    try { const r = await fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? r.detail : ''; if (r && r.ok === false) detail = r.detail || ''; } catch (e) { detail = e.message; }
    results.push({ id, name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} · ${id} · ${name}${detail ? ' — ' + detail : ''}`);
  };
  const httpGet = async p => { const r = await fetchRetry(BASE + p, { redirect: 'follow' }, { tries: 3, waitMs: 1500 }); return { status: r.status, text: await r.text() }; };   // 시작 직후 일시 오류는 다시 시도

  console.log(`점검 주소: ${BASE}\n브라우저: ${path.basename(exe)} ${ver.Browser}\n`);

  // ── 1. 파일이 열리는가 ──
  await check('E-01', '주요 화면 3곳이 열림(/ · /app.html · /test.html)', async () => {
    const st = []; for (const p of ['/', '/app.html', '/test.html']) st.push((await httpGet(p)).status);
    return { ok: st.every(s => s === 200), detail: st.join(' ') };
  });
  await check('E-02', '자료 파일 7개가 열리고 공고가 들어 있음', async () => {
    const names = ['data.js', 'data_busan.js', 'data_gu.js', 'data_univ.js', 'data_alio.js', 'data_ofc.js', 'data_pen.js'];
    const info = [];
    for (const n of names) { const r = await httpGet('/' + n); const m = r.text.match(/["']?rows["']?\s*:\s*\[/); info.push(`${n}:${r.status}`); if (r.status !== 200 || !m) return { ok: false, detail: info.join(' ') }; }
    return { ok: true, detail: info.length + '개' };
  });
  if (!ALLOW_PRIVATE) {
    await check('E-03', '비공개 파일이 배포에 없음(data_pilot.js·.env.local·data_pilot 이름 변형이 404)', async () => {
      const st = []; for (const p of ['/data_pilot.js', '/.env.local', '/.env', '/refresh_local.log']) { const r = await httpGet(p); st.push(r.status); if (r.status === 200 && /BUSAN_PILOT|G2B_KEY/.test(r.text)) return { ok: false, detail: p + ' 이 공개되어 있음' }; }
      return { ok: st.every(s => s !== 200), detail: st.join(' ') };
    });
    await check('E-04', '공개 자료 파일에 전화번호·담당자·연락처 필드가 없음', async () => {
      const names = ['data.js', 'data_busan.js', 'data_gu.js', 'data_univ.js', 'data_alio.js', 'data_ofc.js', 'data_pen.js', 'data_g2b.js'];
      for (const n of names) { const r = await httpGet('/' + n); if (r.status !== 200) continue; const m = r.text.match(/"(?:phone|author)"|\b0\d{1,2}-\d{3,4}-\d{4}\b/); if (m) return { ok: false, detail: `${n}: ${m[0]}` }; }
      return true;
    });
  }
  await check('E-05', '자료가 최신임(교육청 자료의 수집일이 7일 이내)', async () => {
    const r = await httpGet('/data_pen.js'); const m = r.text.match(/"fetched":\s*"(\d{4}-\d{2}-\d{2})"/);
    if (!m) return { ok: false, detail: '수집일을 찾지 못함' };
    const age = Math.floor((Date.now() - Date.parse(m[1] + 'T00:00:00+09:00')) / 86400000);
    return { ok: age <= 7, detail: `수집일 ${m[1]} (${age}일 전)` };
  });

  // ── 2. 브라우저에서 ──
  await go('/');
  await check('E-06', '랜딩 페이지가 오류 없이 열리고 앱으로 가는 링크가 있음', async () => {
    const t = await ev('document.title'); const link = await ev(`!!document.querySelector('a[href="./app.html"]')`);
    return { ok: jsErrors.length === 0 && link && t.length > 3, detail: `제목「${t}」 JS오류 ${jsErrors.length}` };
  });
  await go('/test.html');
  await waitFor('/PASS|FAIL/.test(document.title)', 15000);
  await check('E-07', '배포된 화면 테스트(test.html)가 모두 통과', async () => {
    const title = await ev('document.title'); const fails = await ev(`document.querySelectorAll('li.fail').length`); const skip = await ev(`document.querySelectorAll('li.skip').length`);
    const m = title.match(/^(\d+)\/(\d+) PASS/);
    return { ok: !!m && m[1] === m[2] && +m[2] >= 33 && fails === 0, detail: `${title} · 실패 ${fails} · 해당 없음 ${skip}` };
  });

  await go('/app.html');
  await check('E-08', '앱이 오류 없이 열림: 기관 5종 건수 표시, 「자료」 선택 숨김, 비공개 자료를 요청하지 않음', async () => {
    const cnt = await ev(`[1,2,3,4,5].map(function(i){return document.getElementById('cnt'+i).textContent})`);
    const noSel = await hidden('#srcsel'); const noReq = !requests.some(u => /data_pilot/.test(u));
    return { ok: jsErrors.length === 0 && cnt.every(c => /이 자료 \d+건/.test(c)) && (ALLOW_PRIVATE || noSel) && (ALLOW_PRIVATE || noReq), detail: cnt.join(' ') + ` · JS오류 ${jsErrors.length}` };
  });

  await go('/app.html?kw=' + encodeURIComponent('체험') + '&mn=&g=2&past=1');
  await check('E-09', '검색 링크로 열면 자동 검색되고 결과에 1, 2, 3… 번호가 붙음(공유 링크)', async () => {
    const sum = await $t('#summary'); const nos = await ev(`[].map.call(document.querySelectorAll('#list .no'),function(e){return e.textContent})`);
    const seq = nos.length > 0 && nos.every((n, i) => n === (i + 1) + '.');
    const kw = await ev(`document.getElementById('kw').value`); const shareVisible = !(await hidden('#share'));
    return { ok: /조건에 맞는 공고 \d+건/.test(sum) && seq && kw === '체험' && shareVisible, detail: `${sum} · 번호 ${nos.length}개` };
  });

  await check('E-10', '제외 키워드: 「학교」에서 「급식, 교복」을 빼면 줄어들고 제목에 없음', async () => {
    await go('/app.html?kw=' + encodeURIComponent('학교') + '&mn=&past=1');
    const a = +(await $t('#summary')).match(/(\d+)건/)[1];
    await go('/app.html?kw=' + encodeURIComponent('학교') + '&ex=' + encodeURIComponent('급식, 교복') + '&mn=&past=1');
    const sum = await $t('#summary'); const b = +sum.match(/(\d+)건/)[1];
    const bad = await ev(`[].filter.call(document.querySelectorAll('#list .t'),function(e){return /급식|교복/.test(e.textContent)}).length`);
    return { ok: b < a && bad === 0 && /제외 키워드/.test(sum), detail: `${a}건 → ${b}건, 급식·교복 제목 ${bad}개` };
  });

  await check('E-11', '결과 0건이면 안내와 「직접 확인하기」 링크 2개(공유 패널은 숨김)', async () => {
    await go('/app.html?kw=' + encodeURIComponent('없는낱말zzz') + '&mn=');
    const title = await $t('#summary'); const links = await ev(`[].map.call(document.querySelectorAll('#emptylinks a'),function(a){return a.href+'|'+a.target})`);
    return { ok: title === '조건에 맞는 공고가 이 자료에 없습니다.' && links.length === 2 && links.every(l => /^https:\/\/www\.pen\.go\.kr\/.*\|_blank$/.test(l)) && (await hidden('#share')), detail: links.length + '개 링크' };
  });

  await go('/app.html');
  await check('E-12', '금액 형식 오류(R-03a): 최소 「abc」를 실제로 입력하고 검색 → 그 칸 아래 안내, 다른 칸 오류 없음', async () => {
    await typeInto('#kw', '체험'); await typeInto('#mn', 'abc'); await click('.primary'); await sleep(300);
    const msg = await $t('#err-mn'); const others = await ev(`['err-mx','err-bd','err-kw'].every(function(i){return document.getElementById(i).hidden})`);
    return { ok: msg === '금액은 숫자로 입력해 주세요. 예: 100,000,000' && others && (await hidden('#res')), detail: msg };
  });
  await check('E-13', '최소>최대(R-03a): 500,000,000 > 100,000,000 → 최대 칸 아래 「최소 금액이 최대 금액보다 클 수 없습니다.」', async () => {
    await typeInto('#mn', '500,000,000'); await typeInto('#mx', '100,000,000'); await click('.primary'); await sleep(300);
    const msg = await $t('#err-mx'); return { ok: msg === '최소 금액이 최대 금액보다 클 수 없습니다.', detail: msg };
  });
  await check('E-14', '기준일 형식 오류(R-03a): 「2025-13-45」 → 기준일 칸 아래 안내(다른 오류보다 먼저)', async () => {
    await typeInto('#bd', '2025-13-45'); await click('.primary'); await sleep(300);
    const msg = await $t('#err-bd'); const mxHidden = await ev(`document.getElementById('err-mx').hidden`);
    return { ok: msg === '기준일을 날짜로 입력해 주세요. 예: 2025-12-23' && mxHidden, detail: msg };
  });

  await go('/app.html?kw=' + encodeURIComponent('체험') + '&mn=&g=2&past=1');
  await check('E-15', '메일 본문(R-04): 선택 없이 복사하면 안내, 공고를 실제로 선택하면 「선택 1건」', async () => {
    await click('#copytext'); const m1 = await $t('#sharemsg');
    await click('#list input.pk'); const cnt = await $t('#pickcount');
    return { ok: m1 === '메일 본문에 넣을 공고를 하나 이상 선택해 주세요.' && cnt === '선택 1건', detail: `${m1} → ${cnt}` };
  });
  await check('E-16', '메일 본문 복사(R-04): 실제 클립보드에 미리 보기와 같은 본문이 들어감', async () => {
    await click('#copytext'); await sleep(600);
    const msg = await $t('#sharemsg'); const preview = await ev(`document.getElementById('sharetext').value`);
    let clip = null; try { clip = await ev(`navigator.clipboard.readText()`); } catch (e) { clip = null; }
    const first = preview.split('\n')[0];
    const same = clip !== null && String(clip).replace(/\r\n/g, '\n') === preview;   // 윈도우 클립보드는 줄바꿈을 \r\n으로 바꿔 돌려주므로 맞춰서 비교한다
    return { ok: msg === '메일 본문을 복사했습니다. 메일에 붙여넣기(Ctrl+V) 하세요.' && same && /^\[입찰 공고 공유\] 기준일 \d{4}-\d{2}-\d{2} · 1건$/.test(first), detail: `${msg} · 클립보드 ${same ? '본문과 동일' : clip === null ? '읽지 못함' : '다름'}` };
  });
  await check('E-17', '메일 작성 창(R-04): 주소가 mailto:?subject=… (받는 사람 비어 있음), 본문이 미리 보기와 같고, 길이 상한을 지킴', async () => {
    await ev(`window.__m=[];document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="mailto:"]');if(a){e.preventDefault();window.__m.push(a.getAttribute('href'))}},true)`);
    await click('#mailto'); const one = await ev('window.__m.slice()');
    const q = one[0] ? new URLSearchParams(one[0].slice('mailto:?'.length)) : null;
    const bodyOk = q && q.get('body').replace(/\r\n/g, '\n') === await ev(`document.getElementById('sharetext').value`);
    const subjOk = q && /^\[입찰 공고 공유\] \d{4}-\d{2}-\d{2} 기준 1건$/.test(q.get('subject'));
    await click('#pickall'); await click('#mailto');
    const all = await ev('window.__m.slice()'); const msg = await $t('#sharemsg');
    const len = await ev(`encodeURIComponent(document.getElementById('sharetext').value.replace(/\\n/g,'\\r\\n')).length`);
    const shouldOpen = len + 200 <= 4000 ? null : false;   // 본문이 충분히 길면 열리지 않아야 한다
    const longOk = shouldOpen === false ? (all.length === 1 && /본문이 길어 메일 작성 창을 열 수 없습니다/.test(msg)) : true;
    return { ok: one.length === 1 && one[0].indexOf('mailto:?subject=') === 0 && !!bodyOk && !!subjOk && longOk, detail: `1건 주소 ${one[0] ? one[0].length : 0}자 · 전체 선택 본문 ${len}자 → ${all.length === 1 ? '열지 않음: ' + msg : '열림'}` };
  });

  await check('E-19', '배포된 파일이 이 저장소의 파일과 같음(최신이 배포됐는지)', async () => {
    const root = path.join(__dirname, '..'); const norm = t => t.replace(/\r\n/g, '\n');   // 줄바꿈 표기 차이(CRLF/LF)는 무시하고 비교한다
    const diff = [], same = [];
    for (const f of ['index.html', 'app.html', 'app.js', 'test.html', 'data.js', 'data_pen.js', 'data_busan.js', 'data_gu.js', 'data_ofc.js', 'data_alio.js', 'data_univ.js']) {
      const lp = path.join(root, f); if (!fs.existsSync(lp)) continue;
      const h = t => crypto.createHash('sha256').update(norm(t)).digest('hex');
      const remote = await httpGet('/' + f);
      (h(fs.readFileSync(lp, 'utf8')) === h(remote.text) ? same : diff).push(f);
    }
    return { ok: diff.length === 0, detail: diff.length ? '다른 파일: ' + diff.join(', ') + ' (아직 올리지 않았거나 배포 중일 수 있음)' : same.length + '개 동일' };
  });

  await check('E-18', '화면에 JS 오류가 하나도 없음(마지막 화면까지 누적)', async () => ({ ok: jsErrors.length === 0, detail: jsErrors[0] || '오류 0' }));

  const pass = results.filter(r => r.ok).length;
  console.log(`\n결과: ${pass}/${results.length} 통과 · 실패 ${results.length - pass}`);
  const out = flag('--json'); if (out) fs.writeFileSync(out, JSON.stringify({ base: BASE, at: new Date().toISOString(), browser: ver.Browser, results }, null, 1), 'utf8');
  cleanup();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('점검기 오류:', e.message); process.exit(2); });
