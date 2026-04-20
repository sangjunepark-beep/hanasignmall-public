---
name: hanasignmall-realtime-audit
description: 하나사인몰 어드민(ad.hanasm.kr) 상품의 3차원 카테고리(상품별·업종별·공간 체크박스) 실시간 감사, LLM 기반 자동 판정, 일괄 자동 수정, 원클릭 롤백까지 통합한 도구. '실시간 감사', '자동 수정', '과태깅 정리', '업종 일괄 연결', '카테고리 감사', 'LLM 판정', '🧠 판정', '🔧 수정', '🔙 롤백', '감사 북마클릿', '감사 대시보드', '상품 전체 감사', '입간판 감사', '안내판 감사' 등 어드민 카테고리 감사·수정 요청 시 반드시 이 스킬을 먼저 읽고 따른다.
---

# 하나사인몰 실시간 감사 스킬 (v6)

## 개요

ad.hanasm.kr 어드민에 로그인된 Chrome 탭에서 북마클릿 한 번 클릭으로 실행되는 플로팅 대시보드. 이하 기능을 한 번에 수행:

1. 현재 검색 필터(판매상태·카테고리·viewCnt)를 그대로 이어받아 전체 페이지 자동 감사
2. 3차원(상품별 catO / 업종별 catT / 관심분야 체크박스) 동시 fetch 수집
3. 규칙 기반 + Claude Haiku 4.5 LLM 기반 판정
4. Excel/CSV/JSON 리포트 (한글 명칭 병기 + 셀 색상 + Before/After)
5. iframe 기반 일괄 자동 수정 (FIX_T 업종 9개 연결 · FIX_O 상품별 3차 추가 · FIX_CB 체크박스 해제+재체크)
6. 자동 수정 전 JSON 백업 자동 생성 + 원클릭 롤백

## 배포 위치

- 리포: `sangjunepark-beep/hanasignmall-public` (public)
- Raw URL(main): `https://raw.githubusercontent.com/sangjunepark-beep/hanasignmall-public/main/realtime_audit.js`
- 스크립트 본체: `상품속성변경/realtime_audit.js`
- 시연 가이드: `상품속성변경/시연_실행가이드.html`

## 북마클릿 URL (한 번만 설정)

```
javascript:void((async()=>{document.getElementById('hs-audit-root')?.remove();const r=await fetch('https://raw.githubusercontent.com/sangjunepark-beep/hanasignmall-public/main/realtime_audit.js?v='+Math.random(),{cache:'reload'});eval(await r.text());})())
```

크롬 북마크바에 "🔍 실시간 감사" 같은 이름으로 추가. `?v=` 쿼리 + `cache:'reload'` 없으면 GitHub CDN/브라우저 캐시 때문에 이전 버전 실행됨.

## 언제 이 스킬을 쓰나

사용자가 아래 중 하나를 요청하면 **즉시** 이 스킬 절차를 따른다:

- "실시간 감사 돌려줘"
- "입간판 과태깅 정리"
- "업종 9개 일괄 연결"
- "자동 수정 실행"
- "감사 백업해줘"
- "롤백해줘"
- "LLM 판정해줘"
- 그 외 어드민 카테고리 수정 관련 요청 전반

## Claude API 키 관리

- 사용자 브라우저 `sessionStorage['hs_anthropic_key']` + `localStorage['hs_anthropic_key']`
- 스크립트 본체·리포·메모리 어디에도 저장 X
- 키 제거 명령: Console에서 `sessionStorage.removeItem('hs_anthropic_key'); localStorage.removeItem('hs_anthropic_key')`

## 표준 작업 플로우 (승인 기반)

```
1. 어드민 GoodsList에 판매상태·카테고리 필터 세팅
2. 북마클릿 클릭 → 대시보드 자동 시작 (현재 필터 유지)
3. 🧠 LLM 판정 실행 → FIX 상품에 o3 + 공간 코드 자동 추론
4. 📊 Excel 다운로드 → "🧠 + 04-01-XXX (사유)" 제안 눈으로 검수
5. 🔧 일괄 자동 수정 클릭
   → confirm 다이얼로그에 건수 + 경고 + "계속?" 확인
   → 롤백 백업 JSON 자동 다운로드 (파일 반드시 보관 안내)
   → iframe에 상품별 편집 페이지 로드 후 .click() 실행
6. 수정된 상품 1~2개를 어드민에서 직접 열어 결과 확인
7. 이상 발견 시 → 🔙 롤백 실행 → 방금 받은 JSON 선택 → 체크박스 단위 복구
```

## 절대 규칙

1. **체크박스 수정은 반드시 `.click()`** (FnSelOptChk() 직접 호출 금지 → 역방향 저장됨)
2. **배치 30개 × 150ms 간격** 준수
3. **업종 연결은 RegCategory() 호출 금지** → CateCodeT_4 + '2' 버튼 click만
4. **상품별 추가 버튼**은 CateCodeO_4 + '1' onclick 패턴
5. **자동 수정 실행 전 백업 자동 생성** (코드 내장)
6. **대량 실행 전 confirm 다이얼로그** (코드 내장)
7. **대시보드가 기존에 떠 있으면 정리 후 재실행** (`window.__hsAuditCleanup` 호출)

## 실행 범위 조절

대시보드 시작 전 Console에 config 주입 가능:

```javascript
window.HS_AUDIT_CONFIG = {
  cat: '04',           // 카테고리 (01=게시판, 02=안내판, 04=입간판, 05=현수막, 08=도로안전용품, 10=인쇄물)
  pages: 'auto',       // 또는 [1, 2, 3]
  viewCnt: 30,
  scale: 1.125,        // 텍스트 배율
  width: 780,          // 대시보드 폭 (px)
  pgCols: 5,           // 페이지 셀 한 줄 최대 개수
  pace: 200,           // 상품 간 지연 (ms)
};
```

**시연·테스트 시에는 반드시 `pages: [1]` 로 축소**하여 소규모에서 먼저 검증.

## 판정 체계

**3차원 판정 결과**

| 코드 | 한글 상태 | 의미 | 자동 수정 동작 |
|------|---------|------|---------------|
| OK | 정상 | 3차원 모두 정상 | 수정 없음 |
| FIX_O | 카테고리 오류 | 상품별 3차 부적합 | catO1/2/3 선택 + 추가 버튼 클릭 |
| FIX_T | 업종 미연결 | 업종 카테고리 비거나 누락 | 9개 업종 순차 연결 |
| FIX_CB | 과태깅 | 체크박스 30개 초과 또는 0개 | 전체 해제 + LLM 지정 공간 재체크 |
| FIX_MULTI | 복합 문제 | 2개 이상 차원 문제 | 해당 항목 모두 수행 |
| FIX_ALL | 전체 미설정 | O+T+CB 모두 미설정 | 모두 수행 |

**한글 명칭 매핑 (Excel 병기)**

- O1: 01=게시판, 02=안내판, 04=입간판, 05=현수막/배너, 07=구조물, 08=도로안전용품, 09=각종물품, 10=인쇄물/스티커
- T1: 01=학교/학원, 02=식당/카페, 03=아파트, 04=호텔/펜션, 05=병원/요양시설, 06=회사/공장, 07=공공기관, 08=헬스/레저, 09=기타업종
- O3 (입간판 04-01 A형): -001 청소중 · -002 공사중/수리 · -003 안전/경고 · -004 식당/카페/매장 · -007 주의/위험 · -008 금지/출입금지 · -009 주차/주차장 · -011 CCTV/금연/촬영 · -012 학교/학원/교육 · -013 기타/범용
- 공간 prefix: 02 학교군 · 03 식당/서비스군 · 04 의료군 · 05 산업군 · 06 공공/복지군 · 07 전문서비스업 · 08 유통/상업군

## Excel 리포트 구조 (xlsx-js-style)

- 시트1 **전체감사결과** — 14 컬럼 Before/After 비교 · 판정별 색상 · 필터 적용
- 시트2 **수정필요_N건** — FIX 판정만 필터
- 시트3 **요약** — 판정별 건수/비율

컬럼: # · 페이지 · 상태 · 판정 · 상품명 · RgrCode · 현재 상품별(O) · 제안 상품별 변경 · 현재 업종수 · 현재 연결 업종 · 제안 업종 변경 · 현재 체크수 · 제안 체크 변경 · 권장 조치

## 알려진 한계

- **FIX_O 롤백**: 상품별 "삭제" 버튼 패턴 아직 미조사. 롤백은 체크박스(CB)만 완전 복구 가능. O/T는 수동 복구 필요
- **iframe JS 초기화**: 2.5초 고정 대기. 어드민 응답 느리면 일부 실패 가능
- **FIX_CB 재체크**: LLM 판정 안 돌리면 "전체 해제만" 수행됨 (재체크 X)

## 비용 (Claude Haiku 4.5)

- FIX 상품 1개당 ~1500 tokens (8개 배치)
- 300 FIX 상품 기준 $0.20~0.35
- 사용량 조회: https://console.anthropic.com/settings/usage

## 관련 참고 메모리

- `reference_admin_rules.md` — .click() 규칙, 업종/공간그룹 체계, demo_verify.py
- `feedback_autofix_safety.md` — 자동 수정 4중 안전 장치
- `project_admin_progress.md` — 페이지별 진행 상태 (작업 재개 시)

## 사용 안내 템플릿 (사용자에게 설명할 때)

```
1) ad.hanasm.kr 로그인 탭에서 검색 필터 설정 (판매중 + 카테고리)
2) 북마크바 🔍 실시간 감사 클릭
3) 감사 완료 → 🧠 LLM 판정 (비용 $0.2 내외)
4) 📊 Excel 다운받아 제안 검수
5) 🔧 일괄 자동 수정 → 백업 JSON 반드시 보관
6) 수정 결과 1~2건 육안 확인
7) 이상 있으면 🔙 롤백 실행
```
