// 부산 구·군 홈페이지 「입찰공고·고시공고」(행안부 표준 전자민원 eminwon 게시판) → data_gu.js
// 실행: node tools/collect_gu.js   (월·목 검색 전에 한 번 돌려 자료를 갱신한다)
// 대상 14곳: 중·서·동·영도·부산진·동래·북·해운대·금정·연제·수영·사상·기장·강서.
// 제외 2곳: 남구(robots.txt가 User-agent: * 에 Disallow: / 로 수집을 막음) · 사하구(홈페이지가 접속 403이라 확인 전 제외).
// 규칙: 키·로그인 없이 공개 목록만 읽는다(브라우저가 하는 것과 같은 목록 조회 양식). 요청 사이 1.2초, 곳마다 최근 60일·최대 15쪽.
//       본문·첨부는 가져오지 않는다. 차단(401·403) 응답이 오면 그 곳은 멈추고 우회하지 않는다.
const fs = require('fs');
const path = require('path');
const { isRelevant } = require('./collect_busan.js');

const GU = {
  중구: 'bsjunggu.go.kr', 서구: 'bsseogu.go.kr', 동구: 'bsdonggu.go.kr', 영도구: 'yeongdo.go.kr', 부산진구: 'busanjin.go.kr',
  동래구: 'dongnae.go.kr', 북구: 'bsbukgu.go.kr', 해운대구: 'haeundae.go.kr', 금정구: 'geumjeong.go.kr', 연제구: 'yeonje.go.kr',
  수영구: 'suyeong.go.kr', 사상구: 'sasang.go.kr', 기장군: 'gijang.go.kr', 강서구: 'bsgangseo.go.kr',
};
const SKIPPED = { 남구: 'robots.txt가 수집을 막음(Disallow: /)', 사하구: '홈페이지 접속 403이라 확인 전 제외' };
const DAYS_BACK = 60, MAX_PAGES = 15, DELAY_MS = 1200;
const UA = 'Mozilla/5.0 (education-project; low-rate list reader)';
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const clean = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();
const DATE_RE = /\d{4}[-.]\d{2}[-.]\d{2}/;
const NOTICE_NO_RE = /제\s*\d{4}-\d+\s*호/;

// 결과 안내(참여 불가)는 뺀다. 「취소」는 남기고 화면에서 표시한다.
const RESULT_RE = /(개찰|입찰|낙찰|선정|계약|평가)\s*결과|결과\s*(공고|안내|공개|통보)|낙찰자/;

// 목록 HTML → [{id,title,dept,posted,noticeNo}]. 양식(스킨)이 곳마다 달라 searchDetail('번호') 링크가 있는 행을 읽는다.
function parseRows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]).filter(r => /searchDetail\(\s*['"][\w-]+['"]/.test(r)).map(r => {
    const id = (r.match(/searchDetail\(\s*['"]([\w-]+)['"]/) || [])[1];
    const anchors = [...r.matchAll(/<a[^>]*searchDetail[^>]*>([\s\S]*?)<\/a>/gi)].map(a => clean(a[1]));
    const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => clean(c[1]));
    const onlyNo = c => /^[^\d]{0,20}제\s*\d{4}-\d+\s*호$/.test(c);   // 「부산광역시 영도구 공고 제2026-977호」처럼 공고번호만 있는 칸
    let title = anchors.sort((a, b) => b.replace(/\d/g, '').length - a.replace(/\d/g, '').length)[0] || '';
    // 링크 없이 칸에 클릭 동작만 있는 양식(영도구): 공고번호·숫자·날짜가 아닌 칸 중 가장 긴 것이 제목
    if (!title) title = cells.filter(c => c && !/^\d+$/.test(c) && !DATE_RE.test(c) && !onlyNo(c)).sort((a, b) => b.length - a.length)[0] || '';
    const posted = ((cells.join(' ').match(DATE_RE) || [''])[0]).replace(/\./g, '-');
    const noticeNo = cells.find(c => NOTICE_NO_RE.test(c) && c !== title) || '';
    const dept = cells.find(c => c && c !== title && c !== noticeNo && !/^\d+$/.test(c) && !DATE_RE.test(c) && !c.includes(title)) || '';
    return { id, title, dept, posted, noticeNo };
  }).filter(x => x.id && x.title && /^\d{4}-\d{2}-\d{2}$/.test(x.posted));
}

// 행 → 앱 자료. mixed=true(제목이 「고시공고」인 게시판)이면 참여 성격만 남기는 판단에 쓴다.
function toRow(x, gu, host, mixed) {
  const q = new URLSearchParams({
    jndinm: 'OfrNotAncmtEJB', context: 'NTIS', method: 'selectOfrNotAncmt', methodnm: 'selectOfrNotAncmtRegst',
    not_ancmt_mgt_no: x.id, homepage_pbs_yn: 'Y', subCheck: 'Y', ofr_pageSize: '10', not_ancmt_se_code: '02', list_gubun: '', homepagetype: 'new',
  });
  return {
    no: x.noticeNo || x.id, org: `부산광역시 ${gu}` + (x.dept ? ' ' + x.dept : ''), cat: 1, type: mixed ? `${gu} 고시·공고` : `${gu} 입찰공고`,
    status: /취소/.test(x.title) ? '취소' : '', posted: x.posted, title: x.title, award: '', open: null, openText: '', price: null, priceNote: '',
    url: `https://eminwon.${host}/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do?${q}`,
  };
}

const decode = buf => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(host, page) {
  const body = new URLSearchParams({
    pageIndex: String(page), jndinm: 'OfrNotAncmtEJB', context: 'NTIS', method: 'selectListOfrNotAncmt', methodnm: 'selectListOfrNotAncmtHomepage',
    not_ancmt_mgt_no: '', homepage_pbs_yn: 'Y', subCheck: 'Y', ofr_pageSize: '10', not_ancmt_se_code: '02', title: '', cha_dep_code_nm: '',
    initValue: '', countYn: 'Y', list_gubun: '', homepagetype: 'new', not_ancmt_sj: '',
  });
  const res = await fetch(`https://eminwon.${host}/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do`, {
    method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, html: decode(Buffer.from(await res.arrayBuffer())) };
}

async function collectGu(gu, host, cutoffIso) {
  const rows = [], seen = new Set();
  let mixed = false, scanned = 0, pages = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const { status, html } = await fetchPage(host, p);
    if (status === 401 || status === 403) return { gu, error: `HTTP ${status} — 서버가 막아 멈춤(우회하지 않음)`, rows, scanned };
    if (status === 400 && p > 1) break;   // 목록 끝을 넘은 쪽을 요청하면 400을 돌려주는 곳이 있어 끝으로 본다
    if (status !== 200) return { gu, error: `HTTP ${status}`, rows, scanned, pages };
    if (p === 1) mixed = !/입찰/.test((html.match(/<title>\s*([^<]*)/) || [])[1] || '');
    const items = parseRows(html);
    pages++;
    if (!items.length) break;
    let anyInRange = false, newInPage = 0;
    for (const x of items) {
      if (seen.has(x.id)) continue;
      seen.add(x.id); newInPage++;
      if (x.posted < cutoffIso) continue;
      anyInRange = true; scanned++;
      if (RESULT_RE.test(x.title)) continue;
      if (mixed && !isRelevant(x.title)) continue;
      rows.push(toRow(x, gu, host, mixed));
    }
    if (!newInPage || !anyInRange) break;   // 같은 쪽이 반복되거나 기간을 벗어나면 그만
    await sleep(DELAY_MS);
  }
  return { gu, rows, scanned, pages, mixed };
}

async function main() {
  const today = new Date();
  const cutoff = new Date(today.getTime() - DAYS_BACK * 86400000);
  const cutoffIso = iso(cutoff.getFullYear(), cutoff.getMonth() + 1, cutoff.getDate());
  const all = [], byGu = {}, failed = {};
  for (const [gu, host] of Object.entries(GU)) {
    try {
      const r = await collectGu(gu, host, cutoffIso);
      if (r.error) failed[gu] = r.error;
      byGu[gu] = r.rows.length;
      all.push(...r.rows);
      console.log(`${gu}: ${r.error ? '실패 ' + r.error + ' · ' : ''}${r.pages || 0}쪽 · ${r.scanned}건 중 ${r.rows.length}건 담음${r.mixed ? '(고시공고 게시판이라 참여 성격만)' : ''}`);
    } catch (e) {
      failed[gu] = e.cause?.code || e.message;
      console.log(`${gu}: 실패 ${failed[gu]}`);
    }
    await sleep(DELAY_MS);
  }
  if (!all.length) { console.log('가져온 공고가 없어 data_gu.js를 바꾸지 않았습니다.'); process.exit(1); }
  const posted = all.map(r => r.posted).sort();
  const meta = {
    source: '부산 구·군 홈페이지 입찰·고시공고',
    url: 'https://www.busan.go.kr/nbgosi',
    license: '공개 게시판의 제목·부서명·공고일만 담음(본문·첨부 제외). 일정·금액은 원문에서 확인',
    period: { from: posted[0], to: posted[posted.length - 1] },
    updateNote: '수집할 때마다 갱신',
    fetched: iso(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    byGu, failed, skipped: SKIPPED,
    rows: all,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data_gu.js'),
    '// tools/collect_gu.js가 만든 파일입니다. 직접 고치지 마세요.\nwindow.BUSAN_GU_BIDS = ' + JSON.stringify(meta, null, 1) + ';\n', 'utf8');
  console.log(`\n합계 ${all.length}건 저장: data_gu.js · 실패 ${Object.keys(failed).length}곳 · 제외 ${Object.keys(SKIPPED).join('·')}`);
}

if (require.main === module) main().catch(e => { console.error('실패:', e.message); process.exit(1); });
module.exports = { parseRows, toRow, RESULT_RE, GU, SKIPPED };
