// 부산광역시교육청 「학교입찰정보」 게시판 → data_pen.js
// 실행: node tools/collect_pen.js   (월·목 검색 전에 한 번 돌려 자료를 갱신한다)
// 규칙: 키·로그인 없이 공개 목록만 읽는다. robots.txt(User-agent: *)가 막지 않는 /main/na/ 경로만 쓰고,
//       요청 사이에 1.5초를 쉬며, 최근 90일 등록분까지만(최대 60쪽) 가져온다. 본문·첨부는 가져오지 않는다.
const fs = require('fs');
const path = require('path');
const { fetchRetry } = require('./net.js');

const BASE = 'https://www.pen.go.kr';
const BOARD = { mi: 30514, bbsId: 2407 };
const DAYS_BACK = 90, MAX_PAGES = 60, DELAY_MS = 1500;

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function validDate(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// 「입찰일시」 칸의 자유 표기에서 마지막 날짜(개찰·마감 쪽)를 'YYYY-MM-DD'로. 못 읽으면 null.
// 연도가 빠진 날짜는 앞 날짜의 연도를 따르고, 달이 앞 날짜보다 작으면 다음 해로 본다.
function parseOpenDate(text, postedIso) {
  const t = String(text ?? '');
  const re = /(?:(\d{4})\s*[.\-\/년]\s*)?(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})(?!\d)/g;
  const postedYear = +String(postedIso ?? '').slice(0, 4) || null;
  let prev = null, last = null, m;
  while ((m = re.exec(t))) {
    let y = m[1] ? +m[1] : (prev ? prev.y : postedYear);
    const mo = +m[2], d = +m[3];
    if (!y) continue;
    if (!m[1] && prev && mo < prev.m) y++;
    if (!validDate(y, mo, d)) continue;
    prev = { y, m: mo };
    last = iso(y, mo, d);
  }
  if (last && postedYear && Math.abs(+last.slice(0, 4) - postedYear) > 1) return null;
  return last;
}

// 개찰·낙찰 결과 안내는 참여할 수 있는 공고가 아니므로 뺀다
const RESULT_RE = /(개찰|입찰|낙찰|선정|계약|평가)\s*결과|결과\s*(공고|안내|공개|통보)|낙찰자/;

// 제목에 「취소」가 있는 공고는 status를 '취소'로 표시한다(목록에는 남기고 화면에서 알려 준다)
const CANCEL_RE = /취소/;

const clean = s => s.replace(/<em[^>]*>[\s\S]*?<\/em>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

// 목록 HTML → [{no,title,org,openText,posted,id}]
function parseList(html) {
  const i = html.search(/<tbody/);
  if (i < 0) return [];
  return [...html.slice(i).matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => clean(c[1]));
    const id = (m[1].match(/data-id="(\d+)"/) || [])[1];
    const posted = (tds[4] || '').replace(/\./g, '-');
    return { no: tds[0], title: tds[1], org: tds[2], openText: tds[3], posted, id };
  }).filter(x => x.id && x.title && /^\d{4}-\d{2}-\d{2}$/.test(x.posted));
}

// 목록 한 줄 → 앱이 쓰는 행. 금액은 목록에 없으므로 null(금액 미기재)
function toRow(x) {
  return {
    no: +x.no || x.no, org: x.org || '(기관명 없음)', cat: 2, type: '학교입찰', status: CANCEL_RE.test(x.title) ? '취소' : '',
    posted: x.posted, title: x.title, award: '', open: parseOpenDate(x.openText, x.posted), openText: /\d/.test(x.openText || '') ? x.openText : '',
    price: null, priceNote: '',
    url: `${BASE}/main/na/ntt/selectNttInfo.do?mi=${BOARD.mi}&bbsId=${BOARD.bbsId}&nttSn=${x.id}`,
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const today = new Date();
  const cutoff = new Date(today.getTime() - DAYS_BACK * 86400000);
  const cutoffIso = iso(cutoff.getFullYear(), cutoff.getMonth() + 1, cutoff.getDate());
  const rows = [], seen = new Set();
  let excluded = 0, pages = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = `${BASE}/main/na/ntt/selectNttList.do?mi=${BOARD.mi}&bbsId=${BOARD.bbsId}&currPage=${p}`;
    const res = await fetchRetry(url, { headers: { 'User-Agent': 'Mozilla/5.0 (education-project; low-rate list reader)' } });
    if (!res.ok) { console.log(`p${p}: HTTP ${res.status} — 중단`); break; }
    const items = parseList(await res.text());
    pages++;
    if (!items.length) { console.log(`p${p}: 행 없음 — 중단`); break; }
    let anyInRange = false;
    for (const x of items) {
      if (x.posted >= cutoffIso) anyInRange = true; else continue;
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      if (RESULT_RE.test(x.title)) { excluded++; continue; }
      rows.push(toRow(x));
    }
    process.stdout.write(`p${p} `);
    if (!anyInRange) break;
    await sleep(DELAY_MS);
  }
  console.log(`\n${pages}쪽 읽음 · 공고 ${rows.length}건 · 결과 안내 ${excluded}건 제외`);
  if (!rows.length) { console.log('가져온 공고가 없어 data_pen.js를 바꾸지 않았습니다.'); process.exit(1); }
  const posted = rows.map(r => r.posted).sort();
  const meta = {
    source: '부산광역시교육청 학교입찰정보',
    url: `${BASE}/main/na/ntt/selectNttList.do?mi=${BOARD.mi}&bbsId=${BOARD.bbsId}`,
    license: '공개 게시판의 제목·기관명·입찰일시만 담음(본문·첨부 제외). 내용은 반드시 원문에서 확인',
    period: { from: posted[0], to: posted[posted.length - 1] },
    updateNote: '수집할 때마다 갱신',
    fetched: iso(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    excludedResults: excluded,
    rows,
  };
  const out = path.join(__dirname, '..', 'data_pen.js');
  fs.writeFileSync(out, '// tools/collect_pen.js가 만든 파일입니다. 직접 고치지 마세요.\nwindow.PEN_BIDS = ' + JSON.stringify(meta, null, 1) + ';\n', 'utf8');
  console.log('저장:', out, `(개찰일 못 읽은 공고 ${rows.filter(r => !r.open).length}건)`);
}

if (require.main === module) main().catch(e => { console.error('실패:', e.message); process.exit(1); });
module.exports = { parseOpenDate, parseList, toRow, RESULT_RE };
