// 부산시청 고시공고 수집 규칙 단위 테스트 (UT-09): node tools/test_collect_busan.js
const { parseList, toRow, isRelevant } = require('./collect_busan.js');
let pass = 0, fail = 0;
const t = (name, ok) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name); };

const html = '<table><tbody>' +
  '<tr><td class="pc_Y">2026-2808</td><td class="title"><a href="/nbgosi/view?sno=79600&gosiGbn=A&curPage=1">부산광역시청소년활동진흥센터 관리·운영 민간위탁 수탁기관 모집 공고</a></td><td>여성가족국 아동청소년과</td><td> 2026.09.18</td><td> 148</td></tr>' +
  '<tr><td>2026-2817</td><td class="title"><a href="/nbgosi/view?sno=79677&gosiGbn=A&curPage=1">종합건설업 폐업공고 [(주)디아이건설]</a></td><td>행정자치국 통합민원과</td><td> 2026.09.18</td><td> 39</td></tr>' +
  '<tr><th>번호</th><th>제목</th></tr>' +
  '</tbody></table>';
const r = parseList(html);
t('UT-09a 목록 읽기: 번호·제목·부서명·공고일(→2026-09-18)·sno, 머리글 줄은 무시', r.length === 2 && r[0].no === '2026-2808' && r[0].dept === '여성가족국 아동청소년과' &&
  r[0].posted === '2026-09-18' && r[0].sno === '79600' && r[0].title.startsWith('부산광역시청소년활동진흥센터'));

const keep = ['부산광역시청소년활동진흥센터 관리·운영 민간위탁 수탁기관 모집 공고', '2027년 생활체육대축전 자원봉사자 운영 수탁기관 공개모집 공고', '2026년 부산광역시 의용소방대 국외 정책연수 진행업체 모집 공고',
  '녹산하수 방류펌프 토출배관 교체사업 기술제안서 제출안내 공고', '함정 MRO 방산혁신클러스터 수행기관 모집 공고', '「부산시 동백전 카드수수료 지원사업」 공고'];
const drop = ['종합건설업 폐업공고 [(주)디아이건설]', '건설업 과태료 처분 공고', '2026년도 하반기 청원경찰 채용시험 합격자 발표 공고',
  '「기업환경개선 사업」지원 기업 최종 선정 결과 공고', '자갈치현대화시장 무상사용 종료 안내', '2026년 위탁사업자 모집 취소 공고', '부산광역시 광역도서관위원회 위원 공개모집 공고', '제27대 국가유산위원회 보궐위원 공개모집 공고',
  '부산광역시 한센병관리사업 위탁에 관한 조례 시행규칙 일부개정 규칙안 입법 예고', '계약형 지역필수의사제 지원사업 공공기관 위탁계약 체결 공고', '구덕운동장 씨름장 관리 및 운영 민간위탁 계약 체결 공고'];
t('UT-09b 참여 성격 고르기: 모집·위탁·용역·제안서·지원사업은 남기고 폐업·과태료·채용·결과·취소·종료 안내·위원 모집·입법예고·계약 체결 공고는 뺌', keep.every(isRelevant) && drop.every(x => !isRelevant(x)));

const row = toRow(r[0]);
t('UT-09c 행 만들기: 1번 기관·기관명에 부서·개찰일 없음(null)·금액 null·원문 링크', row.cat === 1 && row.org === '부산광역시 여성가족국 아동청소년과' && row.open === null &&
  row.price === null && row.type === '시청 고시공고' && row.url === 'https://www.busan.go.kr/nbgosi/view?sno=79600&gosiGbn=A');

console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
