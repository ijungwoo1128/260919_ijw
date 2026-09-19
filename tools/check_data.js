// 수집한 자료 파일(data_*.js) 검사기 — 자동 갱신(GitHub Actions)이 커밋하기 전에 돌린다.
// 실행: node tools/check_data.js [--revert]
//   검사 ① 파일이 window.XXX = {…rows} 형식으로 읽히는가 ② 모든 공고에 제목·기관·분류(1~5)·등록일이 있는가 ③ 개인정보 패턴이 없는가
//        ④ 이전 커밋의 같은 파일보다 공고 수가 절반 아래로 줄지 않았는가(일부 조회 실패로 자료가 통째로 줄어드는 사고 방지)
//   --revert 를 주면 검사에 실패한 파일만 이전 커밋 상태로 되돌린다(성공한 파일은 그대로 둔다).
// 끝 코드: 0 = 전부 통과 또는 실패한 파일을 되돌림, 1 = 되돌리기 없이 실패가 있음.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILES = ['data_pen.js', 'data_busan.js', 'data_gu.js', 'data_ofc.js', 'data_alio.js', 'data_univ.js', 'data_g2b.js'];   // data.js(고정 CSV)와 비공개 data_pilot.js는 대상이 아님
const PII_RE = /"(?:phone|author)"|\d{2,3}-\d{3,4}-\d{4}/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 파일 내용 → { ok, problems[], rows, meta }
function inspect(text) {
  const problems = [];
  const ctx = { window: {} };
  try { vm.runInNewContext(text, ctx, { timeout: 5000 }); } catch (e) { return { ok: false, problems: ['읽을 수 없음: ' + e.message], rows: 0 }; }
  const keys = Object.keys(ctx.window);
  const meta = keys.length === 1 ? ctx.window[keys[0]] : null;
  if (!meta || !Array.isArray(meta.rows)) return { ok: false, problems: ['window.XXX = {rows:[…]} 형식이 아님'], rows: 0 };
  let bad = 0;
  meta.rows.forEach(r => {
    if (!r || !r.title || !r.org || ![1, 2, 3, 4, 5].includes(r.cat) || !DATE_RE.test(r.posted || '')) bad++;
    else if (r.open != null && !DATE_RE.test(r.open)) bad++;
    else if (r.price != null && typeof r.price !== 'number') bad++;
  });
  if (bad) problems.push(`형식이 틀린 공고 ${bad}건`);
  if (PII_RE.test(text)) problems.push('개인정보 패턴(전화번호·phone·author)이 있음');
  return { ok: problems.length === 0, problems, rows: meta.rows.length, meta };
}

// 이전 공고 수와 비교: 이전이 20건 이상이었는데 절반 아래로 줄면 이상으로 본다
function shrunk(oldRows, newRows) {
  return oldRows >= 20 && newRows < oldRows / 2;
}

function previousText(file) {
  try { return execFileSync('git', ['show', 'HEAD:' + file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

function main() {
  const revert = process.argv.includes('--revert');
  let failed = 0;
  for (const f of FILES) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) { console.log(`- ${f}: 없음(건너뜀)`); continue; }
    const now = inspect(fs.readFileSync(p, 'utf8'));
    const prevText = previousText(f);
    const prev = prevText ? inspect(prevText) : null;
    const problems = now.problems.slice();
    if (prev && prev.ok && shrunk(prev.rows, now.rows)) problems.push(`공고 수가 ${prev.rows}건에서 ${now.rows}건으로 절반 넘게 줄었음`);
    if (!problems.length) { console.log(`✔ ${f}: ${now.rows}건${prev ? ` (이전 ${prev.rows}건)` : ''}`); continue; }
    failed++;
    console.log(`✘ ${f}: ${problems.join(' / ')}`);
    if (revert && prevText) { fs.writeFileSync(p, prevText, 'utf8'); console.log(`   → 이전 커밋 상태로 되돌림`); }
  }
  process.exit(failed && !revert ? 1 : 0);
}

if (require.main === module) main();
module.exports = { inspect, shrunk, FILES };
