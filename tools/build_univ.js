// 이전 프로젝트(busan-bid-pilot)가 만든 대학 입찰 자료 → data_univ.js (공개용 최소 항목만)
// 실행: node tools/build_univ.js [data.json 경로]   (기본: C:\Users\user\Downloads\busan-bid-pilot\output\부산지역대학교\data.json)
// 담당자(author)·연락처(phone)·첨부파일·본문 요약은 공개 자료에 넣지 않는다. 제목·기관·등록일·마감일·금액·원문 링크만 담는다.
// 대학 게시판을 실제로 읽는 일은 그 프로젝트의 수집기(run.ps1)가 한다. 이 스크립트는 그 결과를 앱 형식으로 바꿀 뿐이다.
const fs = require('fs');
const path = require('path');

const DEFAULT_SRC = 'C:/Users/user/Downloads/busan-bid-pilot/output/부산지역대학교/data.json';
const COVERAGE = 'C:/Users/user/Downloads/busan-bid-pilot/config/coverage.json';

// 원본 항목 → 앱 행. 마감일이 없으면 open은 null(화면에서 「일정은 원문에서 확인」)
function toRow(x) {
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(x.deadline || '') ? x.deadline : null;
  return {
    no: '', org: x.org, cat: 3, type: `대학 입찰(${x.subCategory || '대학'})`,
    status: /재공고/.test(x.status || '') ? '재공고' : /취소/.test(x.status || '') || /취소/.test(x.title || '') ? '취소' : '',
    posted: x.regDate, title: x.title, award: '', open: deadline, openText: x.submit || '',
    price: Number.isFinite(x.amount) ? x.amount : null, priceNote: '', url: x.url,
  };
}

function build(src) {
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
  const rows = raw.items.filter(x => !x.excluded && x.title && x.url && /^\d{4}-\d{2}-\d{2}$/.test(x.regDate || '')).map(toRow);
  const boards = (raw.meta.boards || []).map(b => ({ owner: b.owner, sub: b.sub, scanned: b.scanned, error: b.error || '' }));
  let notCollected = [];
  try { notCollected = JSON.parse(fs.readFileSync(COVERAGE, 'utf8')).map(c => ({ owner: c.owner, sub: c.sub, status: c.status, reason: c.reason })); } catch { /* 이전 프로젝트 설정이 없으면 생략 */ }
  return {
    source: '부산지역 대학 입찰공고(이전 수집 자료)',
    url: 'https://github.com/ijungwoo1128/260919_ijw',
    license: '대학 공개 게시판의 제목·기관·등록일·마감일·금액·원문 링크만 담음(담당자·연락처·첨부 제외). 내용은 반드시 원문에서 확인',
    period: { from: raw.meta.since, to: raw.meta.until },
    updateNote: `수집 필터: 최근 ${raw.meta.days}일·${(raw.meta.minAmount || 0).toLocaleString('ko-KR')}원 이상·교육사업 키워드`,
    fetched: String(raw.meta.generatedAt || '').slice(0, 10),
    boards, notCollected, rows,
  };
}

if (require.main === module) {
  const src = process.argv[2] || DEFAULT_SRC;
  const meta = build(src);
  if (!meta.rows.length) { console.log('공개할 대학 공고가 없어 data_univ.js를 바꾸지 않았습니다.'); process.exit(1); }
  fs.writeFileSync(path.join(__dirname, '..', 'data_univ.js'),
    '// tools/build_univ.js가 만든 파일입니다. 직접 고치지 마세요.\nwindow.BUSAN_UNIV_BIDS = ' + JSON.stringify(meta, null, 1) + ';\n', 'utf8');
  console.log(`대학 공고 ${meta.rows.length}건 저장: data_univ.js (게시판 ${meta.boards.length}곳 확인 · 수집 못 하는 대학 ${meta.notCollected.length}곳)`);
}
module.exports = { toRow, build };
