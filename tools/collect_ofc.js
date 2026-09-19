// 부산 5개 교육지원청(서부·남부·북부·동래·해운대) 입찰 게시판 → data_ofc.js  (검색 대상 2번 「교육청·지원청·학교」 자료)
// 실행: node tools/collect_ofc.js   (월·목 검색 전에 한 번 돌려 자료를 갱신한다)
// 접근 규칙: home.pen.go.kr 의 robots.txt(User-agent: *)는 상세 페이지(selectNttInfo.do)·첨부·검색 경로만 막고 목록(selectNttList.do)은 막지 않는다.
//           그래서 목록만 읽고, 상세는 읽지 않는다(화면의 「공고 원문 보기」 링크로만 연결).
// 서부·동래 지원청의 「교육지원청 입찰정보」는 나라장터로 가는 링크뿐이라 여기서 다루지 않는다(나라장터 수집기 몫).
// 규칙: 요청 사이 1초, 게시판마다 최근 30일·최대 40쪽. 제목·기관·입찰일시·등록일·원문 링크만 담는다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseOpenDate, RESULT_RE } = require('./collect_pen.js');
const { fetchRetry } = require('./net.js');

const BASE = 'https://home.pen.go.kr';
const DAYS_BACK = 30, MAX_PAGES = 40, DELAY_MS = 1000;
const UA = 'Mozilla/5.0 (education-project; low-rate list reader)';

const OFFICES = { seobu: '서부', nambu: '남부', bukbu: '북부', dongnae: '동래', haeundae: '해운대' };
// kind: '지원청' = 지원청 자체 입찰, '학교' = 관할 학교 입찰
const BOARDS = [
  { slug: 'seobu', kind: '학교', name: '학교입찰정보', mi: 9487, bbsId: 3989 },
  { slug: 'nambu', kind: '지원청', name: '교육청입찰', mi: 11864, bbsId: 3990 },
  { slug: 'nambu', kind: '학교', name: '학교입찰', mi: 11866, bbsId: 3991 },
  { slug: 'bukbu', kind: '지원청', name: '북부교육지원청입찰공고', mi: 12814, bbsId: 3721 },
  { slug: 'bukbu', kind: '학교', name: '학교입찰공고', mi: 12815, bbsId: 3722 },
  { slug: 'dongnae', kind: '학교', name: '학교 입찰공고', mi: 11262, bbsId: 3632 },
  { slug: 'haeundae', kind: '지원청', name: '교육지원청 입찰공고', mi: 11326, bbsId: 3535 },
  { slug: 'haeundae', kind: '학교', name: '학교 입찰공고', mi: 11328, bbsId: 3536 },
];
const NOT_COLLECTED = { 서부지원청입찰: '나라장터 링크뿐(나라장터 수집기 몫)', 동래지원청입찰: '나라장터 링크뿐(나라장터 수집기 몫)' };

// 학교 급식 식재료 구매 공고는 교육 사업과 거리가 멀고 양이 많아 담지 않는다
const DROP_RE = /식재료|급식품|급식\s*식|학교급식|급식\s*(물품|재료|종합|계약|소액|납품|업체)|불용물품/;
// 제목이 「…결과」로 끝나거나 「…공고 결과」「…구매 결과」인 결과 안내(collect_pen의 RESULT_RE가 못 잡는 표기)
const RESULT2_RE = /결과(\s*(공고|안내|알림|통보|공개))?[\s)\]]*$|공고\s*결과|구매\s*결과/;

const clean = s => String(s ?? '').replace(/<em[^>]*>[\s\S]*?<\/em>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

// 목록 HTML → 행. 표 머리글(입찰명·제목·작성자·입찰일시·등록일)을 보고 열을 찾는다(게시판마다 열 구성이 다름). 「공지」 고정글은 뺀다.
function parseRows(html) {
  const head = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => clean(m[1]));
  const col = names => head.findIndex(h => names.includes(h));
  const ci = { no: col(['번호']), title: col(['제목', '입찰명']), author: col(['작성자', '기관명']), open: col(['입찰일시']), posted: col(['등록일']), result: col(['입찰결과']) };
  if (ci.title < 0 || ci.posted < 0) return [];
  const i = html.search(/<tbody/);
  if (i < 0) return [];
  return [...html.slice(i).matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => clean(c[1]));
    const id = (m[1].match(/data-id="(\d+)"/) || m[1].match(/nttSn=(\d+)/) || [])[1];
    const at = k => (ci[k] >= 0 ? tds[ci[k]] || '' : '');
    return { no: at('no'), title: at('title'), author: at('author'), openText: at('open'), posted: at('posted').replace(/\./g, '-'), result: at('result'), id };
  }).filter(x => /^\d+$/.test(x.no) && x.id && x.title && /^\d{4}-\d{2}-\d{2}$/.test(x.posted));
}

const isDropped = x => DROP_RE.test(x.title) || RESULT_RE.test(x.title) || RESULT2_RE.test(x.title);

// 행 → 앱 자료
function toRow(x, b) {
  const ofc = OFFICES[b.slug] + '교육지원청';
  const school = /(학교|유치원)$/.test(x.author);
  const org = school ? x.author : '부산' + ofc + (x.author && !/^\d+$/.test(x.author) ? ' ' + x.author : '');
  const openText = /\d/.test(x.openText) ? x.openText : '';
  return {
    no: String(x.no), org, cat: 2, type: `${OFFICES[b.slug]}교육지원청 ${b.kind === '학교' ? '학교입찰' : '입찰공고'}`,
    status: /취소/.test(x.title) ? '취소' : '', posted: x.posted, title: x.title, award: '',
    open: parseOpenDate(openText, x.posted), openText, price: null, priceNote: '',
    url: `${BASE}/${b.slug}/na/ntt/selectNttInfo.do?mi=${b.mi}&bbsId=${b.bbsId}&nttSn=${x.id}`,
  };
}

// 교육청 본청 자료(data_pen.js)와 같은 공고는 겹쳐 담지 않는다(제목+등록일)
function loadKnown() {
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'data_pen.js'), 'utf8');
    const ctx = { window: {} }; vm.runInNewContext(src, ctx);
    return new Set(ctx.window.PEN_BIDS.rows.map(r => r.title + '|' + r.posted));
  } catch { return new Set(); }
}

const decode = buf => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

async function collectBoard(b, cutoffIso, known, seen, rows) {
  let scanned = 0, kept = 0, pages = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const res = await fetchRetry(`${BASE}/${b.slug}/na/ntt/selectNttList.do?mi=${b.mi}&bbsId=${b.bbsId}&currPage=${p}`, { headers: { 'User-Agent': UA } });
    if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status} — 서버가 막아 멈춤(우회하지 않음)`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseRows(decode(Buffer.from(await res.arrayBuffer())));
    pages++;
    if (!items.length) break;
    let anyInRange = false;
    for (const x of items) {
      if (x.posted < cutoffIso) continue;
      anyInRange = true; scanned++;
      const key = x.title + '|' + x.posted;
      if (seen.has(b.slug + x.id) || known.has(key) || isDropped(x)) continue;
      seen.add(b.slug + x.id); rows.push(toRow(x, b)); kept++;
    }
    if (!anyInRange) break;
    await sleep(DELAY_MS);
  }
  return { scanned, kept, pages };
}

async function main() {
  const today = new Date(), c = new Date(today.getTime() - DAYS_BACK * 86400000);
  const cutoffIso = iso(c.getFullYear(), c.getMonth() + 1, c.getDate());
  const known = loadKnown(), seen = new Set(), rows = [], per = {}, failed = {};
  for (const b of BOARDS) {
    const label = `${OFFICES[b.slug]}·${b.name}`;
    try { per[label] = await collectBoard(b, cutoffIso, known, seen, rows); console.log(`${label}: ${per[label].pages}쪽 · ${per[label].scanned}건 중 ${per[label].kept}건 담음`); }
    catch (e) { failed[label] = e.cause?.code || e.message; console.log(`${label}: 실패 ${failed[label]}`); }
    await sleep(DELAY_MS);
  }
  console.log(`\n합계 ${rows.length}건 · 실패 ${Object.keys(failed).length}`);
  if (Object.keys(failed).length || !rows.length) { console.log('data_ofc.js를 바꾸지 않았습니다.'); process.exit(2); }
  rows.sort((a, b) => (a.posted < b.posted ? 1 : -1));
  const posted = rows.map(r => r.posted).sort();
  const meta = {
    source: '부산 5개 교육지원청 입찰 게시판', url: `${BASE}/nambu/main.do`,
    license: '공개 게시판의 제목·기관·입찰일시·등록일·원문 링크만 담음(급식 식재료·결과 안내 제외). 내용은 반드시 원문에서 확인',
    period: { from: posted[0], to: posted[posted.length - 1] }, updateNote: '수집할 때마다 갱신',
    fetched: iso(today.getFullYear(), today.getMonth() + 1, today.getDate()), per, notCollected: NOT_COLLECTED, failed, rows,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data_ofc.js'), '// tools/collect_ofc.js가 만든 파일입니다. 직접 고치지 마세요.\nwindow.OFC_BIDS = ' + JSON.stringify(meta, null, 1) + ';\n', 'utf8');
  console.log('저장: data_ofc.js');
}

if (require.main === module) main().catch(e => { console.error('실패:', e.message); process.exit(1); });
module.exports = { parseRows, toRow, isDropped, BOARDS, OFFICES };
