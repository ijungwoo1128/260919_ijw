// 부산광역시청 「고시공고」 게시판 → data_busan.js
// 실행: node tools/collect_busan.js   (월·목 검색 전에 한 번 돌려 자료를 갱신한다)
// 시청 「입찰공고」 화면은 나라장터로 가는 버튼뿐이라 목록이 없다(나라장터는 서비스키가 필요해 보류).
// 그래서 시청 누리집에 직접 올라오는 고시공고 중 참여할 수 있는 성격(모집·위탁·용역·입찰·공모 등)만 담는다.
// 규칙: 키·로그인 없이 공개 목록만 읽는다. 요청 사이 1.5초, 최근 60일·최대 50쪽. 본문·첨부는 가져오지 않는다.
//       차단(401·403) 응답이 오면 즉시 멈추고 우회하지 않는다.
const fs = require('fs');
const path = require('path');
const { fetchRetry } = require('./net.js');

const BASE = 'https://www.busan.go.kr';
const DAYS_BACK = 60, MAX_PAGES = 50, DELAY_MS = 1500;
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// 참여·신청할 수 있는 성격의 제목만 남긴다 (포함 규칙 통과 + 제외 규칙에 안 걸림)
const KEEP_RE = /모집|위탁|수탁|용역|입찰|제안서|제안 |공모|사업자|업체|공급자|참가|참여|지원사업|운영자|수행기관/;
const DROP_RE = /채용|합격|결과|폐업|과태료|처분|직권말소|공시송달|취소|입법\s*예고|조례|규칙안|계약\s*체결|분묘|철회|반환|면허|허가|지정 고시|도시관리계획|서류전형|면접|위원(?!회)|위촉/;
const isRelevant = title => KEEP_RE.test(title) && !DROP_RE.test(title);

const clean = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();

// 목록 HTML → [{no,title,dept,posted,sno}]
function parseList(html) {
  return [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1]);
    const sno = (m[1].match(/view\?sno=(\d+)/) || [])[1];
    const posted = clean(tds[3] || '').replace(/\./g, '-');
    return { no: clean(tds[0] || ''), title: clean(tds[1] || ''), dept: clean(tds[2] || ''), posted, sno };
  }).filter(x => x.sno && x.title && /^\d{4}-\d{2}-\d{2}$/.test(x.posted));
}

function toRow(x) {
  return {
    no: x.no, org: '부산광역시 ' + (x.dept || '(부서명 없음)'), cat: 1, type: '시청 고시공고', status: '',
    posted: x.posted, title: x.title, award: '', open: null, openText: '', price: null, priceNote: '',
    url: `${BASE}/nbgosi/view?sno=${x.sno}&gosiGbn=A`,
  };
}

// 서버가 UTF-8이든 EUC-KR이든 읽는다
function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const today = new Date();
  const cutoff = new Date(today.getTime() - DAYS_BACK * 86400000);
  const cutoffIso = iso(cutoff.getFullYear(), cutoff.getMonth() + 1, cutoff.getDate());
  const rows = [], seen = new Set();
  let all = 0, dropped = 0, pages = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const res = await fetchRetry(`${BASE}/nbgosi?curPage=${p}`, { headers: { 'User-Agent': 'Mozilla/5.0 (education-project; low-rate list reader)' } });
    if (res.status === 401 || res.status === 403) { console.log(`p${p}: HTTP ${res.status} — 서버가 접속을 막아 멈춥니다(우회하지 않음)`); break; }
    if (!res.ok) { console.log(`p${p}: HTTP ${res.status} — 중단`); break; }
    const items = parseList(decode(Buffer.from(await res.arrayBuffer())));
    pages++;
    if (!items.length) { console.log(`p${p}: 행 없음 — 중단`); break; }
    let anyInRange = false;
    for (const x of items) {
      if (x.posted >= cutoffIso) anyInRange = true; else continue;
      if (seen.has(x.sno)) continue;
      seen.add(x.sno); all++;
      if (!isRelevant(x.title)) { dropped++; continue; }
      rows.push(toRow(x));
    }
    process.stdout.write(`p${p} `);
    if (!anyInRange) break;
    await sleep(DELAY_MS);
  }
  console.log(`\n${pages}쪽 읽음 · 고시공고 ${all}건 중 참여 성격 ${rows.length}건 담음(${dropped}건 제외)`);
  if (!rows.length) { console.log('가져온 공고가 없어 data_busan.js를 바꾸지 않았습니다.'); process.exit(1); }
  const posted = rows.map(r => r.posted).sort();
  const meta = {
    source: '부산광역시청 고시공고(참여 성격만)',
    url: `${BASE}/nbgosi`,
    license: '공개 게시판의 제목·부서명·공고일만 담음(본문·첨부 제외). 일정·금액은 원문에서 확인',
    period: { from: posted[0], to: posted[posted.length - 1] },
    updateNote: '수집할 때마다 갱신',
    fetched: iso(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    scanned: all, dropped,
    rows,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data_busan.js'),
    '// tools/collect_busan.js가 만든 파일입니다. 직접 고치지 마세요.\nwindow.BUSAN_CITY_BIDS = ' + JSON.stringify(meta, null, 1) + ';\n', 'utf8');
  console.log('저장: data_busan.js');
}

if (require.main === module) main().catch(e => { console.error('실패:', e.message); process.exit(1); });
module.exports = { parseList, toRow, isRelevant, KEEP_RE, DROP_RE };
