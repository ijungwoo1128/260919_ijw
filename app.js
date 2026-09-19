// 부산지역 교육 및 학교(어린이 시설 등) 관련 입찰공고 찾기 — 계산·검사는 이 파일의 함수만 한다.
// 데이터는 data.js의 window.BUSAN_BIDS를 읽는다. 화면 연결(DOM)은 app.html에 있다.
// 구현 범위: R-01(정상) · R-02(빈값) · R-06(검색 대상 기관 선택). R-03 오류·R-04 메일 본문·R-05 자료 선택은 아직 없다.

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

function formatRemaining(days) {
  if (isNaN(days)) return '개찰일 확인 필요';   // 게시판 표기에서 날짜를 못 읽은 공고
  if (days > 0) return 'D-' + days;
  if (days === 0) return 'D-day';
  return `개찰 지남(${-days}일 전)`;
}

function formatWon(n) {
  return n.toLocaleString('ko-KR') + '원';
}

// 원본 금액 표기가 깨진 행은 확인 필요를 붙인다
function formatPrice(row) {
  if (row.price == null) return '금액 미기재';   // 교육청 게시판 목록에는 금액이 없다
  return formatWon(row.price) + (row.priceNote ? ' (원본 표기 확인 필요)' : '');
}

// 조건: { keywords:[확장된 키워드], min, max, excludeClosed, baseDate } — 키워드는 공고명 부분일치(OR), 금액은 경계 포함
function filterBids(rows, cond) {
  const kws = cond.keywords || [];
  const min = cond.min ?? null, max = cond.max ?? null;
  return rows.filter(r => {
    if (kws.length && !kws.some(k => r.title.includes(k))) return false;
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

// 결과가 없을 때 안내 (R-03b에서 화면에 쓴다. 지금은 UT-01g가 「제외 켬」 문구를 검사하려고 먼저 둔다)
function emptyResultText(excludeClosed) {
  return {
    title: '조건에 맞는 공고가 이 자료에 없습니다.',
    body: '이 자료는 부산도시공사 2025년 공고와 부산광역시교육청 학교입찰정보 최근 3개월분뿐입니다. 키워드를 줄이거나 금액 범위를 넓혀 보세요. ' +
      '「교육」을 입력하면 강사·연수·수련·어린이·놀이·어린이집·유치원·학교로 함께 찾습니다.' +
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

// 입력 칸의 원문(문자열)을 검사한다. 지금은 빈 조건(R-02)만 본다.
// 키워드가 없고, 최소 금액이 비었거나 기본값 그대로이고, 최대 금액이 비었으면 「아직 조건을 안 넣은 것」으로 본다.
// 공백·쉼표만 있는 키워드도 빈 것으로 본다. 금액·기준일 형식 오류(R-03a)는 아직 없다.
function validateConditions(input) {
  const noKeyword = parseKeywords(input.keywords).length === 0;
  const minRaw = String(input.min ?? '').trim();
  const minParsed = parseAmount(minRaw);
  const minUntouched = minRaw === '' || (minParsed.ok && minParsed.value === DEFAULT_MIN);
  const noMax = String(input.max ?? '').trim() === '';
  if (noKeyword && minUntouched && noMax) return { ok: false, code: 'EMPTY', message: MSG_EMPTY };
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

function summaryLine(count, baseDate) {
  return `조건에 맞는 공고 ${count}건 (기준일 ${baseDate})`;
}
