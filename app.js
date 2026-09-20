// 부산지역 교육 및 학교(어린이 시설 등) 관련 입찰공고 찾기 — 계산·검사는 이 파일의 함수만 한다.
// 데이터는 data.js의 window.BUSAN_BIDS를 읽는다. 화면 연결(DOM)은 app.html에 있다.
// 구현 범위: R-01(정상) · R-02(빈값) · R-06(검색 대상 기관 선택) · 제외 키워드(수강생 요청 2026-09-19). R-03(형식 오류·자료 불러오기 실패)은 이제 있다. R-04 메일 본문(고른 공고만 복사·메일 작성 창)도 있다. R-05 자료 선택(내 PC 전용)도 있다.

// 「교육」은 공고명에 거의 안 나오므로 함께 찾을 동의어 (requirements.md R-01)
const SYNONYMS_EDU = ['교육', '강사', '연수', '수련', '어린이', '놀이', '어린이집', '유치원', '학교'];
const SYNONYM_NOTE = '「교육」은 강사·연수·수련·어린이·놀이·어린이집·유치원·학교로 함께 찾았습니다.';
const CLOSED_HINT = '「마감·개찰 지난 공고 포함」을 켜면 지난 공고도 볼 수 있습니다.';

// "어린이, 강사" → ['어린이','강사'] (쉼표로 여러 개)
function parseKeywords(text) {
  return String(text ?? '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
}

// 「교육」이 있으면 동의어로 넓히고 중복은 뺀다
function expandKeywords(tokens) {
  const out = [];
  for (const t of tokens) {
    for (const k of (t === '교육' ? SYNONYMS_EDU : [t])) if (!out.includes(k)) out.push(k);
  }
  return out;
}

// 금액 칸 → 숫자. 비어 있으면 값 없음, 숫자·쉼표만 허용
function parseAmount(text) {
  const v = String(text ?? '').trim().replace(/,/g, '');
  if (v === '') return { ok: true, value: null };
  if (!/^\d+$/.test(v)) return { ok: false, value: null };
  return { ok: true, value: Number(v) };
}

// 'YYYY-MM-DD' → 해당 날짜 0시(UTC)의 밀리초. 형식·달력이 틀리면 NaN
function toUtc(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}

// 개찰일 − 기준일 (일 수, 지났으면 음수)
function daysUntil(openDate, baseDate) {
  return Math.round((toUtc(openDate) - toUtc(baseDate)) / 86400000);
}

// label: 공개 자료는 「개찰」(기본), 기존 수집 자료(R-05)는 「마감」. 마감일을 모르면 공개 자료는 「개찰일 확인 필요」, 기존 수집 자료는 「-」(마감일 미상은 일정 칸에 따로 표시).
function formatRemaining(days, label) {
  const lb = label || '개찰';
  if (isNaN(days)) return lb === '마감' ? '-' : '개찰일 확인 필요';   // 게시판 표기에서 날짜를 못 읽은 공고
  if (days > 0) return 'D-' + days;
  if (days === 0) return 'D-day';
  return `${lb} 지남(${-days}일 전)`;
}

function formatWon(n) {
  return n.toLocaleString('ko-KR') + '원';
}

// 원본 금액 표기가 깨진 행은 확인 필요를 붙인다
function formatPrice(row) {
  if (row.pilot || 'amount' in row) return formatPilotPrice(row);   // 기존 수집 자료(R-05): 「기초금액 116,825,440원」·「금액 미상」
  if (row.price == null) return '금액 미기재';   // 교육청 게시판 목록에는 금액이 없다
  return formatWon(row.price) + (row.priceNote ? ' (원본 표기 확인 필요)' : '');
}

// 조건: { keywords:[확장된 키워드], min, max, excludeClosed, baseDate } — 키워드는 공고명 부분일치(OR), 금액은 경계 포함
function filterBids(rows, cond) {
  const kws = cond.keywords || [], exs = cond.exclude || [];
  const min = cond.min ?? null, max = cond.max ?? null;
  return rows.filter(r => {
    if (kws.length && !kws.some(k => r.title.includes(k))) return false;   // 키워드: 하나라도 공고명에 있으면 통과(OR)
    if (exs.length && exs.some(k => r.title.includes(k))) return false;   // 제외 키워드: 하나라도 공고명에 있으면 뺀다(2개 이상 가능)
    if (r.price != null) {   // 금액을 모르는(미기재) 공고는 금액 조건으로 빼지 않는다
      if (min !== null && !(r.price >= min)) return false;
      if (max !== null && !(r.price <= max)) return false;
    }
    if (cond.groups && !cond.groups.includes(r.cat ?? 5)) return false;   // 검색 대상 기관: 고른 번호(1~5)에 속한 공고만(분류 없음은 5번 기타)
    if (cond.excludeClosed && daysUntil(r.open, cond.baseDate) < 0) return false;   // 개찰일이 기준일과 같으면 남긴다
    return true;
  });
}

// 개찰 전(남은 일수 적은 순) → 개찰 지난 것(가까운 순) → 개찰일을 모르는 것
function sortBids(rows, baseDate) {
  const items = rows.map(row => ({ row, days: daysUntil(row.open, baseDate) }));
  items.sort((a, b) => {
    const grp = d => (isNaN(d) ? 2 : d >= 0 ? 0 : 1);
    const ga = grp(a.days), gb = grp(b.days);
    if (ga !== gb) return ga - gb;
    if (ga === 2) return 0;
    return ga === 0 ? a.days - b.days : b.days - a.days;
  });
  return items;
}

// 결과가 없을 때 안내 (R-03b). opts = { hasExclude, groupCount } — 제외 키워드를 썼거나 기관을 5개 미만으로 골랐으면 그에 맞는 조언을 덧붙인다.
function emptyResultText(excludeClosed, opts) {
  const o = opts || {};
  return {
    title: '조건에 맞는 공고가 이 자료에 없습니다.',
    body: '이 자료는 도시공사·시청·구(군)·교육청·교육지원청·대학·공공기관의 공개 게시판에서 모은 것뿐입니다. 키워드를 줄이거나 금액 범위를 넓혀 보세요. ' +
      '「교육」을 입력하면 강사·연수·수련·어린이·놀이·어린이집·유치원·학교로 함께 찾습니다.' +
      (o.hasExclude ? ' 제외 키워드를 줄이거나 지워 보세요.' : '') +
      (o.groupCount && o.groupCount < 5 ? ` 검색 대상 기관을 더 골라 보세요(지금 ${o.groupCount}개 선택).` : '') +
      (excludeClosed ? ' ' + CLOSED_HINT : ''),
  };
}

const MSG_EMPTY = '키워드나 금액 범위 중 하나 이상을 입력해 주세요. 예: 키워드에 어린이';

// 오늘 날짜(이 PC의 시계 기준)를 'YYYY-MM-DD'로. 기준일 기본값에 쓴다.
function todayText(now) {
  const d = now || new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 금액 기본값: 최소 5,000,000원 이상을 칸에 미리 채워 두고, 최대는 비워 두면 제한 없음(무한대)이다.
const DEFAULT_MIN = 5000000;
const DEFAULT_MIN_TEXT = '5,000,000';

// ── R-03 안내 문구 (requirements.md 그대로) ──
const MSG_BAD_AMOUNT = '금액은 숫자로 입력해 주세요. 예: 100,000,000';
const MSG_NEGATIVE = '금액은 0 이상으로 입력해 주세요.';
const MSG_RANGE = '최소 금액이 최대 금액보다 클 수 없습니다.';
const MSG_BAD_DATE = '기준일을 날짜로 입력해 주세요. 예: 2025-12-23';
const MSG_LOAD_FAIL = '공고 자료를 불러오지 못했습니다. data.js 파일이 app.html과 같은 폴더에 있는지 확인해 주세요.';
// 결과가 0건일 때 「다른 곳에서 직접 확인하기」 링크 2개 (R-03b)
const EMPTY_LINKS = [
  { text: '부산교육청 입찰공고 안내 (학교장터·나라장터 연결)', url: 'https://www.pen.go.kr/main/cm/cntnts/cntntsView.do?mi=31725&cntntsId=543' },
  { text: '부산교육청 계약체결현황', url: 'https://www.pen.go.kr/main/ir/cntrct/selectCntrctGeyackList.do?mi=30694' },
];

// 금액 칸 하나를 검사: 비었으면 값 없음(정상), 음수는 NEGATIVE, 숫자·쉼표가 아니거나 숫자가 하나도 없으면 BAD_AMOUNT, 0은 정상
function checkAmount(raw) {
  const v = String(raw ?? '').trim();
  if (v === '') return { ok: true, value: null };
  if (/^-\s*[\d,]/.test(v)) return { ok: false, code: 'NEGATIVE' };
  const p = parseAmount(v);
  if (!p.ok || !/\d/.test(v)) return { ok: false, code: 'BAD_AMOUNT' };
  return p;
}

// 자료 불러오기 검사 (R-03c): data.js가 없거나 깨져 window.BUSAN_BIDS가 없거나 비었으면 실패
function loadData(d) {
  return d && Array.isArray(d.rows) && d.rows.length ? { ok: true, count: d.rows.length } : { ok: false, message: MSG_LOAD_FAIL };
}

// 입력 칸의 원문(문자열)을 검사한다. 순서는 기준일 → 최소 금액 → 최대 금액 → 최소·최대 관계 → 빈 조건(R-02) → 키워드 충돌이며 **첫 오류 하나만** 돌려준다.
// R-03a 오류에는 어느 칸 아래에 보여 줄지 field('bd'·'mn'·'mx')가 붙는다.
// 빈 조건: 키워드가 없고, 최소 금액이 비었거나 기본값 그대로이고, 최대 금액이 비었으면 「아직 조건을 안 넣은 것」이다(공백·쉼표만 있는 키워드도 빈 것).
function validateConditions(input) {
  if (isNaN(toUtc(String(input.baseDate ?? '').trim()))) return { ok: false, code: 'BAD_DATE', message: MSG_BAD_DATE, field: 'bd' };
  const mnCheck = checkAmount(input.min);
  if (!mnCheck.ok) return { ok: false, code: mnCheck.code, message: mnCheck.code === 'NEGATIVE' ? MSG_NEGATIVE : MSG_BAD_AMOUNT, field: 'mn' };
  const mxCheck = checkAmount(input.max);
  if (!mxCheck.ok) return { ok: false, code: mxCheck.code, message: mxCheck.code === 'NEGATIVE' ? MSG_NEGATIVE : MSG_BAD_AMOUNT, field: 'mx' };
  if (mnCheck.value !== null && mxCheck.value !== null && mnCheck.value > mxCheck.value) return { ok: false, code: 'RANGE', message: MSG_RANGE, field: 'mx' };
  const noKeyword = parseKeywords(input.keywords).length === 0;
  const minRaw = String(input.min ?? '').trim();
  const minParsed = parseAmount(minRaw);
  const minUntouched = minRaw === '' || (minParsed.ok && minParsed.value === DEFAULT_MIN);
  const noMax = String(input.max ?? '').trim() === '';
  const excludes = parseKeywords(input.exclude);
  if (noKeyword && excludes.length === 0 && minUntouched && noMax) return { ok: false, code: 'EMPTY', message: MSG_EMPTY };
  // 같은 낱말이 키워드와 제외 키워드에 모두 있으면 결과가 항상 0건이라 먼저 알려 준다
  const both = parseKeywords(input.keywords).filter((k, i, a) => a.indexOf(k) === i && excludes.includes(k));
  if (both.length) return { ok: false, code: 'CONFLICT', message: `키워드와 제외 키워드에 같은 낱말이 있습니다: ${both.join(', ')}. 한쪽에서 빼 주세요.` };
  return { ok: true };
}

// ── 검색 대상 기관 5종 (수강생 지정 2026-09-19, 「3. 부산지역 대학」 추가로 5종이 됨) ──
// 1 부산광역시청·16개 구(군)·관계기관(출자출연·지방공기업) / 2 부산광역시교육청·5개 교육지원청·학교(초·중·고)·관계기관
// 3 부산지역 대학 / 4 국가기관(정부·산하기관·단체) / 5 기타 기관. 기본은 1·2번이다. 각 공고는 `cat`(1~5)로 어느 묶음인지 가진다.
const DEFAULT_GROUPS = [1, 2];
const MSG_NO_GROUP = '검색 대상 기관을 하나 이상 선택해 주세요.';

// 고른 기관 번호 목록 검사: 하나도 안 골랐으면 안내
function validateGroups(groups) {
  return groups && groups.length ? { ok: true } : { ok: false, code: 'NO_GROUP', message: MSG_NO_GROUP };
}

// 자료 안의 공고 수를 기관 번호별로 센다 (화면에서 「이 자료에 몇 건 있는지」를 보여 줄 때 쓴다)
function countByGroup(rows) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) c[r.cat ?? 5]++;
  return c;
}

// 기존 수집 자료(비공개)의 분류 → 기관 번호. 교육청 계열은 2, 대학(국립·사립·전문대학)은 3, 그 밖은 5
function pilotGroup(category, subCategory) {
  if (/교육청/.test(category || '')) return 2;
  if (/대학/.test(category || '') || /대학/.test(subCategory || '')) return 3;
  return 5;
}

function sourceLine(meta) {
  return `출처: ${meta.source} · ${meta.period.from}~${meta.period.to} 공고분 · ${meta.updateNote} · ${meta.fetched} 수집`;
}

function summaryLine(count, baseDate, exclude) {
  return `조건에 맞는 공고 ${count}건 (기준일 ${baseDate})` + (exclude && exclude.length ? ` · 제외 키워드: ${exclude.join(', ')}` : '');
}

// ── 결과 공유 (수강생 요청 2026-09-19) ──
// 검색조건을 주소(링크)에 담는다. 링크를 열면 같은 조건으로 자동 검색하고, 결과는 마감·개찰이 임박한 것부터 번호를 붙여 보여 준다.
// 기준일은 링크를 여는 날(오늘)이 기본이라, 보낸 날과 여는 날이 다르면 D-day가 여는 날 기준으로 다시 계산된다(기준일을 직접 바꿨을 때만 링크에 담는다).
const SHARE_MAX_TEXT = 200;       // 링크에 담는 키워드 글자 수 상한
const GROUP_SHORT = { 1: '시청·구군·지방공기업', 2: '교육청·학교', 3: '부산지역 대학', 4: '국가기관', 5: '기타 기관' };

// 화면 조건 { kw, ex, mn, mx, bd, past, groups } → 주소 뒤 「?…」에 붙일 문자열(기본값과 같은 것은 생략)
function buildShareQuery(s, today) {
  const q = new URLSearchParams();
  const kw = String(s.kw ?? '').trim().slice(0, SHARE_MAX_TEXT), ex = String(s.ex ?? '').trim().slice(0, SHARE_MAX_TEXT);
  const mn = String(s.mn ?? '').trim(), mx = String(s.mx ?? '').trim(), bd = String(s.bd ?? '').trim();
  if (kw) q.set('kw', kw);
  if (ex) q.set('ex', ex);
  if (mn !== DEFAULT_MIN_TEXT) q.set('mn', mn);           // 비운 것(최소 제한 없음)도 「mn=」으로 남겨 기본값과 구별한다
  if (mx) q.set('mx', mx);
  if (bd && bd !== today) q.set('bd', bd);
  if (s.past) q.set('past', '1');
  const g = (s.groups || []).slice().sort();
  if (g.join(',') !== DEFAULT_GROUPS.join(',')) q.set('g', g.join(','));
  return q.toString();
}

// 주소의 「?…」 → 화면 조건. 잘못된 값은 기본값으로 돌린다. has=true면 링크에 조건이 들어 있다는 뜻(자동 검색)
function parseShareQuery(search) {
  const q = new URLSearchParams(String(search ?? ''));
  const gs = [...new Set((q.get('g') || '').split(',').map(Number).filter(n => [1, 2, 3, 4, 5].includes(n)))].sort();
  const bd = (q.get('bd') || '').trim();
  return {
    has: ['kw', 'ex', 'mn', 'mx', 'bd', 'past', 'g'].some(k => q.has(k)),
    kw: (q.get('kw') || '').slice(0, SHARE_MAX_TEXT), ex: (q.get('ex') || '').slice(0, SHARE_MAX_TEXT),
    mn: q.has('mn') ? q.get('mn').trim() : DEFAULT_MIN_TEXT, mx: (q.get('mx') || '').trim(),
    bd: isNaN(toUtc(bd)) ? '' : bd,                       // 형식이 틀리면 비워서 오늘로 둔다
    past: q.get('past') === '1',
    groups: gs.length ? gs : DEFAULT_GROUPS.slice(),
  };
}

// 공고의 일정 표기(화면과 메일 본문이 같은 문구를 쓴다)
function scheduleText(r) {
  if (r.pilot) return r.open ? '마감일 ' + r.open : '마감일 미상';   // 기존 수집 자료(R-05)
  return r.openText ? '입찰일시 ' + r.openText : r.open ? '개찰예정일 ' + r.open : '일정은 원문에서 확인';
}

// 검색 조건을 한 줄 글로
function conditionText(s) {
  const parts = [];
  const kws = parseKeywords(s.kw), exs = parseKeywords(s.ex);
  parts.push('키워드 ' + (kws.length ? kws.join(', ') : '없음'));
  if (exs.length) parts.push('제외 ' + exs.join(', '));
  const mn = String(s.mn ?? '').trim(), mx = String(s.mx ?? '').trim();
  parts.push('금액 ' + (mn ? mn + '원 이상' : '최소 제한 없음') + (mx ? ' · ' + mx + '원 이하' : ''));
  parts.push(s.pilot ? '자료 기존 수집 자료(비공개)' : '대상 기관 ' + (s.groups || []).map(g => g + '.' + GROUP_SHORT[g]).join(' / '));
  parts.push(s.past ? '지난 공고 포함' : '지난 공고 제외');
  return parts.join(' · ');
}

// ── R-04 메일 본문 (고른 공고만) ──
const MSG_PICK_NONE = '메일 본문에 넣을 공고를 하나 이상 선택해 주세요.';
const MSG_COPY_OK = '메일 본문을 복사했습니다. 메일에 붙여넣기(Ctrl+V) 하세요.';
const MSG_COPY_FAIL = '자동 복사가 안 됩니다. 아래 본문을 직접 선택해 복사해 주세요.';
const MSG_MAIL_TOO_LONG = '본문이 길어 메일 작성 창을 열 수 없습니다. 「메일 본문 복사」를 사용해 주세요.';
// 메일 작성 창(mailto:) 주소의 길이 상한. 메일 프로그램마다 한계가 달라 「설계값」이며 실제 메일 프로그램으로는 확인하지 못했다.
const MAILTO_MAX_LENGTH = 4000;
const REPLY_NOTE = '참여 여부를 회신해 주세요. 개찰예정일은 접수 마감과 다를 수 있으니 공고 원문에서 확인해 주세요.';

function mailSubject(base, count) {
  return `[입찰 공고 공유] ${base} 기준 ${count}건`;
}

// 고른 공고 → 메일 본문. info = { base, items(sortBids 결과 중 고른 것, 화면 순서 그대로), sources(출처 문구 목록), conditionLine?, link? }
// 조건 줄과 링크는 있을 때만 넣는다. 번호는 고른 순서(=마감·개찰 임박순)대로 1, 2, 3…이다. 하나도 안 골랐으면 { ok:false, message }.
function buildMailBody(info) {
  const items = info.items || [];
  if (!items.length) return { ok: false, message: MSG_PICK_NONE };
  if (items[0].row.pilot) return buildPilotMailBody(info);   // 기존 수집 자료(R-05)는 자기 형식을 쓴다
  const lines = [`[입찰 공고 공유] 기준일 ${info.base} · ${items.length}건`];
  if (info.conditionLine) lines.push('검색조건: ' + info.conditionLine);
  if (info.link) lines.push('같은 조건으로 다시 보기: ' + info.link);
  lines.push('');
  items.forEach((it, i) => {
    const r = it.row;
    lines.push(`${i + 1}. ${r.status === '취소' ? '【취소된 공고】 ' : ''}${r.title}`);
    lines.push('- ' + [r.org, r.no ? '공고번호 ' + r.no : '', r.type].filter(Boolean).join(' · '));
    const remaining = isNaN(it.days) ? '' : ` (${formatRemaining(it.days)})`;
    lines.push(`- 공고게시일 ${r.posted} · ${scheduleText(r)}${remaining}`);
    lines.push('- ' + [r.award ? '낙찰방법 ' + r.award : '', r.price != null ? '추정가격 ' + formatPrice(r) : formatPrice(r)].filter(Boolean).join(' · '));
    if (r.url) lines.push('- 원문: ' + r.url);
    lines.push('');
  });
  const src = (info.sources || []).filter(Boolean);
  if (src.length) lines.push('출처: ' + src.join(' / '));
  lines.push(REPLY_NOTE);
  return { ok: true, text: lines.join('\n') };
}

// 메일 작성 창 주소. 받는 사람은 비워 둔다(앱은 수신자 주소를 받지도 저장하지도 않는다). 너무 길면 { ok:false, message }.
function buildMailto(subject, body) {
  const url = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(String(body).replace(/\n/g, '\r\n'));
  return url.length > MAILTO_MAX_LENGTH ? { ok: false, message: MSG_MAIL_TOO_LONG } : { ok: true, url };
}

// ── R-05 기존 수집 자료(내 PC 전용) ──
// data_pilot.js(window.BUSAN_PILOT)가 있는 내 PC에서만 「자료」 선택이 보인다. 공개 배포·저장소에는 이 파일이 없다(담당자·연락처 등 개인정보가 들어 있음).
const PILOT_REPLY_NOTE = '참여 여부를 회신해 주세요. 금액·마감일은 자동 추출값이라 공고 원문에서 확인해 주세요.';

// 고를 수 있는 자료 목록: data_pilot.js가 없거나 비었으면 공개 자료뿐(선택 항목을 숨김)
function availableSources(pilot) {
  return pilot && Array.isArray(pilot.rows) && pilot.rows.length ? ['public', 'pilot'] : ['public'];
}

// 「기초금액 116,825,440원」 · 금액이 없으면 「금액 미상」
function formatPilotPrice(o) {
  const a = o.amount ?? o.price ?? null;
  return a == null ? '금액 미상' : `${o.amountLabel || o.priceLabel || '금액'} ${formatWon(a)}`;
}

// 「담당자 A · 연락처 P」 · 값이 없으면 각각 「없음」. author는 게시글 작성자라 계약 담당자와 다를 수 있다.
function contactText(o) {
  return `담당자 ${o.author || '없음'} · 연락처 ${o.phone || '없음'}`;
}

// 이전 프로젝트 수집 항목 → 화면·검색용 행. 검색·정렬이 쓰는 공통 필드(open=마감일, price, cat, title…)와 화면용 필드를 함께 돌려준다.
function normalizeRow(kind, raw) {
  if (kind !== 'pilot') throw new Error('알 수 없는 자료: ' + kind);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline || '') ? raw.deadline : null;
  const historyText = (raw.history || []).map(h => `${h.status} ${h.date}`).join(' → ');
  return {
    dueLabel: '마감일', due, priceText: formatPilotPrice(raw), statusText: raw.status || '', historyText,
    pilot: true, no: '', org: raw.org, cat: pilotGroup(raw.category, raw.subCategory), type: raw.subCategory || raw.category || '',
    status: raw.status === '취소' ? '취소' : '', posted: raw.regDate, title: raw.title, award: '', open: due, openText: '',
    price: raw.amount ?? null, priceNote: '', priceLabel: raw.amountLabel || '', url: raw.url || '', author: raw.author || '', phone: raw.phone || '',
  };
}

// 기존 수집 자료용 메일 본문(명세의 「기존 수집 자료의 표시·메일 본문」 형식)
function buildPilotMailBody(info) {
  const items = info.items;
  const lines = [`[입찰 공고 공유] 기준일 ${info.base} · ${items.length}건 (기존 수집 자료)`];
  if (info.conditionLine) lines.push('검색조건: ' + info.conditionLine);
  lines.push('');
  items.forEach((it, i) => {
    const r = it.row;
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`- ${r.org} · ${r.statusText}${r.historyText ? ` (이력: ${r.historyText})` : ''}`);
    lines.push(`- 등록일 ${r.posted} · ${r.open ? '마감일 ' + r.open : '마감일 미상'}${isNaN(it.days) ? '' : ` (${formatRemaining(it.days, '마감')})`}`);
    lines.push('- ' + formatPilotPrice(r));
    lines.push('- 문의: ' + contactText(r));
    if (r.url) lines.push('- 원문: ' + r.url);
    lines.push('');
  });
  const src = (info.sources || []).filter(Boolean);
  if (src.length) lines.push('출처: ' + src.join(' / '));
  lines.push(PILOT_REPLY_NOTE);
  return { ok: true, text: lines.join('\n') };
}
