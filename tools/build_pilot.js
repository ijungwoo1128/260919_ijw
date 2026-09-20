// 이전 프로젝트(busan-bid-pilot)의 통합본 → data_pilot.js  (R-05 「기존 수집 자료(비공개)」, 내 PC 전용)
// 실행: node tools/build_pilot.js [data.json 경로]   (기본: C:\Users\user\Downloads\busan-bid-pilot\output\_이전_통합본\data.json)
// !! 결과 파일 data_pilot.js 에는 스크랩한 제3자의 담당자 이름·연락처가 들어간다. .gitignore 로 막혀 있어 GitHub·Vercel에 올라가지 않는다. 절대 올리지 않는다. !!
// 화면에 필요한 항목만 담는다(첨부파일·본문 요약·입찰 방식 등은 뺀다).
const fs = require('fs');
const path = require('path');

const DEFAULT_SRC = 'C:/Users/user/Downloads/busan-bid-pilot/output/_이전_통합본/data.json';

// 원본 항목 → data_pilot.js 행 (필요한 항목만)
function slim(x) {
  return {
    category: x.category || '', subCategory: x.subCategory || '', org: x.org || '', title: x.title || '', url: x.url || '',
    status: x.status || '', regDate: x.regDate || '', deadline: x.deadline || null,
    amount: Number.isFinite(x.amount) ? x.amount : null, amountLabel: x.amountLabel || '',
    author: x.author || null, phone: x.phone || null,
    history: (x.history || []).map(h => ({ status: h.status, date: h.date })),
  };
}

function build(src) {
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
  const rows = raw.items.filter(x => !x.excluded && x.title && x.regDate).map(slim);
  return {
    source: '기존 수집 자료(비공개)',
    sourceText: `기존 수집 자료(부산교육청 계열·대학 게시판, ${raw.meta.since}~${raw.meta.until} 스냅숏)`,
    period: { from: raw.meta.since, to: raw.meta.until },
    private: true, rows,
  };
}

if (require.main === module) {
  const meta = build(process.argv[2] || DEFAULT_SRC);
  fs.writeFileSync(path.join(__dirname, '..', 'data_pilot.js'),
    '// 내 PC 전용 비공개 자료입니다(담당자·연락처 포함). GitHub·Vercel에 올리지 마세요. tools/build_pilot.js가 만들었습니다.\nwindow.BUSAN_PILOT = ' + JSON.stringify(meta, null, 1) + ';\n', 'utf8');
  const withAuthor = meta.rows.filter(r => r.author).length, withPhone = meta.rows.filter(r => r.phone).length;
  console.log(`기존 수집 자료 ${meta.rows.length}건 저장: data_pilot.js (담당자 ${withAuthor}건 · 연락처 ${withPhone}건) — 내 PC 전용, .gitignore로 제외됨`);
}
module.exports = { slim, build };
