// 나라장터(조달청) 입찰공고 → data_g2b.js   ※ 공식 공개 API(공공데이터포털 「조달청_나라장터 입찰공고정보서비스」) 사용
// 실행: node tools/collect_g2b.js   (내 PC 전용. 서비스키가 필요하다)
// 서비스키: 공공데이터포털 활용신청 뒤 받은 키를 deploy 폴더의 .env.local 에 한 줄로 저장한다 → G2B_KEY=복사한키
//           (.env.local 은 .gitignore 로 GitHub·Vercel에 올라가지 않는다. 키는 화면·로그·공개 파일에 절대 찍지 않는다)
// 주의: 이 파일의 응답 필드 이름은 조달청 공개 명세를 기준으로 썼지만, 서비스키 없이 만든 것이라 **실제 키로 처음 실행해 확인해야 한다**.
//       필드가 다르면 rows 가 비거나 오류를 내고 data_g2b.js 를 바꾸지 않는다.
const fs = require('fs');
const path = require('path');
const { fetchRetry } = require('./net.js');

const BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService';
const OPS = [['getBidPblancListInfoServc', '용역'], ['getBidPblancListInfoThng', '물품']];   // 공사는 교육 사업과 무관해 제외
const DAYS_BACK = 30, PAGE_SIZE = 100, MAX_PAGES = 10, DELAY_MS = 800;
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

// .env.local 또는 환경변수에서 키를 읽는다. Encoding 키(%가 들어 있음)는 한 번 풀어 준다(그대로 넣으면 이중 인코딩되어 인증 실패).
function readKey(envText, env = process.env) {
  const m = /^\s*G2B_KEY\s*=\s*(.+?)\s*$/m.exec(envText || '');
  const raw = (env.G2B_KEY || (m && m[1]) || '').replace(/^["']|["']$/g, '');
  if (!raw) return '';
  return raw.includes('%') ? decodeURIComponent(raw) : raw;
}

// 공고기관·수요기관 이름 → 검색 대상 기관 번호(1~5)
function classifyInstt(name) {
  const n = String(name || '');
  if (/교육청|교육지원청|초등학교|중학교|고등학교|특수학교|유치원/.test(n)) return 2;
  if (/대학교|대학$|대학\s|전문대학|산학협력단/.test(n)) return 3;
  if (/^부산광역시(?!교육청)|부산.*(구청|군청|시설공단|도시공사|교통공사|환경공단|관광공사)|^부산\S*(구|군)$/.test(n)) return 1;
  if (/(부|처|청|위원회|공단|공사|진흥원|연구원|재단)$|국립|한국|대한민국/.test(n)) return 4;
  return 5;
}

// 응답 JSON에서 항목 배열을 꺼낸다(items 가 배열이거나 {item: 배열|객체}인 두 형태를 모두 받는다)
function extractItems(json) {
  const body = json && json.response && json.response.body;
  if (!body) return [];
  const it = body.items;
  if (!it) return [];
  const arr = Array.isArray(it) ? it : (it.item !== undefined ? it.item : []);
  return Array.isArray(arr) ? arr : [arr];
}

// 조달청 오류 응답이면 메시지를 돌려준다(정상이면 '')
function apiError(json) {
  if (json && json.OpenAPI_ServiceResponse) {
    const h = json.OpenAPI_ServiceResponse.cmmMsgHeader || {};
    return `${h.returnAuthMsg || h.errMsg || '오류'}(${h.returnReasonCode || ''})`;
  }
  const h = json && json.response && json.response.header;
  if (h && h.resultCode && h.resultCode !== '00') return `${h.resultMsg || '오류'}(${h.resultCode})`;
  return '';
}

const day = s => (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(0, 10) : null);
const won = v => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };

// API 항목 → 앱 행
function toRow(x, kind) {
  const inst = x.dminsttNm || x.ntceInsttNm || '';
  const posted = day(x.bidNtceDt);
  const open = day(x.opengDt);
  const close = x.bidClseDt ? String(x.bidClseDt).slice(0, 16) : '';
  return {
    no: `${x.bidNtceNo}-${x.bidNtceOrd || '00'}`, org: inst || '(기관명 없음)', cat: classifyInstt(inst), type: `나라장터 ${kind}`,
    status: /취소/.test(x.ntceKindNm || '') || /취소/.test(x.bidNtceNm || '') ? '취소' : /재공고/.test(x.ntceKindNm || '') ? '재공고' : '',
    posted, title: String(x.bidNtceNm || '').trim(), award: '', open, openText: close ? `입찰마감 ${close}` : '',
    price: won(x.presmptPrce) ?? won(x.asignBdgtAmt), priceNote: '', url: x.bidNtceDtlUrl || x.bidNtceUrl || 'https://www.g2b.go.kr',
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(key, op, params, page) {
  const q = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: String(PAGE_SIZE), type: 'json', inqryDiv: '1', ...params });
  const res = await fetchRetry(`${BASE}/${op}?${q}`, {}, { timeoutMs: 30000 });   // 일시적인 연결 오류는 다시 시도(서버가 응답한 오류는 그대로)
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error(`JSON이 아닌 응답(HTTP ${res.status})`); }
  const err = apiError(json);
  if (err) throw new Error(err);
  return json;
}

async function main() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const key = readKey(fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '');
  if (!key) { console.log('서비스키가 없습니다. deploy 폴더의 .env.local 에 G2B_KEY=발급받은키 를 저장한 뒤 다시 실행하세요.'); process.exit(3); }
  const today = new Date(), from = new Date(today.getTime() - DAYS_BACK * 86400000);
  const range = { inqryBgnDt: ymd(from) + '0000', inqryEndDt: ymd(today) + '2359' };
  const rows = [], seen = new Set(), failed = {};
  let rawCount = 0, sample = null;   // 응답 항목 수와 첫 항목(필드 이름 진단용)
  for (const [op, kind] of OPS) {
    for (const field of ['ntceInsttNm', 'dminsttNm']) {   // 공고기관 또는 수요기관 이름에 「부산」이 들어간 공고
      try {
        for (let p = 1; p <= MAX_PAGES; p++) {
          const json = await fetchPage(key, op, { ...range, [field]: '부산' }, p);
          const items = extractItems(json);
          rawCount += items.length; if (!sample && items[0]) sample = items[0];
          for (const x of items) { const r = toRow(x, kind); if (r.title && r.posted && !seen.has(r.no)) { seen.add(r.no); rows.push(r); } }
          if (items.length < PAGE_SIZE) break;
          await sleep(DELAY_MS);
        }
        process.stdout.write('.');
      } catch (e) { failed[`${kind}·${field}`] = e.message; process.stdout.write('x'); }
      await sleep(DELAY_MS);
    }
  }
  console.log(`\n나라장터 응답 항목 ${rawCount}건 → 공고 ${rows.length}건 · 실패 ${Object.keys(failed).length}`);
  // 응답은 왔는데 공고로 못 바꿨다면 필드 이름이 예상과 다른 것이다 → 첫 항목의 필드 이름만 보여 준다(값은 찍지 않음)
  if (rawCount && !rows.length && sample) console.log('  응답 항목의 필드 이름:', Object.keys(sample).join(', '));
  Object.entries(failed).forEach(([k, v]) => console.log('  실패:', k, v));
  if (Object.keys(failed).length || !rows.length) { console.log('data_g2b.js를 바꾸지 않았습니다.'); process.exit(2); }
  rows.sort((a, b) => (a.posted < b.posted ? 1 : -1));
  const posted = rows.map(r => r.posted).sort();
  const meta = {
    source: '나라장터 입찰공고(부산 기관, 용역·물품)', url: 'https://www.g2b.go.kr',
    license: '조달청 나라장터 공개 API의 공고명·기관·공고일·마감·금액·원문 링크만 담음. 내용은 반드시 원문에서 확인',
    period: { from: posted[0], to: posted[posted.length - 1] }, updateNote: '수집할 때마다 갱신', fetched: iso(today.getFullYear(), today.getMonth() + 1, today.getDate()), rows,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data_g2b.js'), '// tools/collect_g2b.js가 만든 파일입니다. 직접 고치지 마세요.\nwindow.G2B_BIDS = ' + JSON.stringify(meta, null, 1) + ';\n', 'utf8');
  console.log('저장: data_g2b.js');
}

if (require.main === module) main().catch(e => { console.error('실패:', e.message); process.exit(1); });
module.exports = { readKey, classifyInstt, extractItems, apiError, toRow };
