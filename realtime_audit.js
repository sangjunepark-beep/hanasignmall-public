/**
 * 하나사인몰 어드민 실시간 감사 대시보드 (v11 · 2026-04-22)
 *
 * v11 대전환 — "상품명 키워드 매칭 우선, LLM 보조"
 *   [매칭 엔진] category_matching_rules 기반 (108개 catO 키워드 규칙 + 매트릭스)
 *   [판정 기준] 키워드 3차>2차>1차 깊이 우선 + catO×catT 부적합(C) 경고
 *   [자동수정] "1차 불일치 스킵" 제거 → catO 재분류 허용 (priority>=5 자동, 이하 수동)
 *   [LLM 역할] 키워드 매칭 실패·애매한 경우만 호출 (비용 60~80% 감소 예상)
 *   [수동 보호] catT/공간은 add만 자동, 기존 연결 해제는 사람 검수
 *   [안전장치] v10.6 3중 롤백 유지 + 재분류 전 풀 스냅샷
 *
 * v10.7 변경점 (유지) — "뒤엎기" 금지. "손 댈 곳만 손 대자"
 *   [LLM 프롬프트] keep/remove → add/remove 구조 (현재 체크 99% 존중)
 *                 "2~6개 축소 지향" 가이드 전면 제거
 *                 "명백히 잘못된 것만 remove · 꼭 필요한데 빠진 것만 add"
 *   [fixOne] "type=5 전체 해제 후 재체크" 로직 완전 삭제
 *           LLM 명시 add만 체크, remove만 해제
 *   [판정 기준 완화] t5_cc>25 과태깅 자동 판정 제거 (내용 판단은 LLM에 위임)
 *                   업종당 30+ 과태깅 자동 판정 제거
 *   [재검증] add/remove 각각 완료 여부 체크
 *
 * v10.6 유지: 롤백 3중 안전장치
 *
 * v10.6 변경점 (사고 재발 방지):
 *   [백업] before 필드 명시 복사 + 빈문자열 기본값 (undefined 저장 사고 방지)
 *   [롤백] all_items_snapshot 자동 fallback (before 빈값이면 snapshot 사용)
 *   [롤백 안전장치 ★] before가 여전히 빈값이면 "삭제" 작업 전체 skip
 *                    = 롤백이 데이터를 지우는 사고 원천 차단. 추가만 수행.
 *
 *
 * v10 주요 변경점:
 *   [LLM 판정] 4축 통합 (catO/catT/SelMemCat/SelOptCat2 전부)
 *              상품명 + 매트릭스 주입 → 각 축별 keep/remove 지시 JSON 반환
 *   [매트릭스] 대시보드 시작 시 9업종 연결된 샘플 상품 1건에서 자동 수집
 *              HS_MATRIX 전역 캐시 (SelOptCat2 418개 + SelMemCat 30개)
 *   [응답 파싱] selOptCat2 키 "업종01"/"01" 혼재 자동 정규화
 *   [하위 호환] it.llm_o3/llm_spaces 유지 → 기존 자동수정 로직 그대로 동작
 *
 * v9 변경점 (유지):
 *   [감사] 체크박스 type별 분리 수집 추가 (t1_cc, t2_cc, t5_cc, t2_by_industry, t5_list)
 *          → 기존 cc(type 무관 전체 합산)는 오염된 숫자. 실제 과태깅 판단은 t5_cc(SelMemCat only) 기준
 *   [판정] FIX_CB 기준 변경: t5_cc=0(관심분야 미연결) 또는 t5_cc>25(과태깅)
 *          FIX_T2 신규: SelOptCat2 업종당 30+ 체크 (업종별 공간 과태깅)
 *   [재검증] T9=9개 정확 집합 일치, CB재체크=type=5 전용+과태깅 잔존 감지
 *           report에 after_t5/after_t2/after_t2_by_ind 필드 추가
 *
 * 사용법:
 *   - GoodsList 페이지에서 북마클릿 클릭 또는 Snippets로 실행
 *   - 별도 설정 없으면 현재 필터의 전체 페이지를 감사
 *   - 범위 강제: window.HS_AUDIT_CONFIG = {pages:[1,2], pace:200}
 */
(function(){
'use strict';

// ================== 설정 ==================
// 현재 URL에서 카테고리/viewCnt 자동 감지 (GoodsList.php일 때)
const urlParams = new URLSearchParams(location.search);
const autoCat = urlParams.get('CodeT1_1') || '04';
const autoViewCnt = parseInt(urlParams.get('viewCnt') || '30');

const CFG = Object.assign({
  cat: autoCat,            // 기본: 현재 URL의 CodeT1_1
  catName: '',             // 자동 라벨 찾음
  pages: 'auto',           // 'auto' = 전체 페이지 자동 감지
  viewCnt: autoViewCnt,    // 기본: 현재 URL의 viewCnt
  batch: 10,               // fetch 병렬 묶음
  pace: 200,               // 각 상품 UI 업데이트 후 지연 (ms)
  batchGap: 300,           // 배치 간 간격 (ms)
  scale: 1.125,            // 텍스트 배율 (기본 112.5%)
  width: 780,              // 대시보드 폭 (px, scale과 무관하게 독립)
  pgCols: 5,               // 페이지 셀 한 줄 최대 개수 (넘으면 2줄)
}, window.HS_AUDIT_CONFIG || {});

// 이전 실행의 타이머/DOM/iframe 완전 정리
if (window.__hsAuditCleanup) { try { window.__hsAuditCleanup(); } catch(_){} }
const prev = document.getElementById('hs-audit-root');
if (prev) prev.remove();
document.querySelectorAll('iframe[data-hs-audit="1"]').forEach(f => f.remove());

// ================== UI 생성 ==================
const root = document.createElement('div');
root.id = 'hs-audit-root';
root.innerHTML = `
<style>
  #hs-audit-root, #hs-audit-root * { box-sizing: border-box; font-family: -apple-system, "Noto Sans KR", "Segoe UI", sans-serif; }
  #hs-audit-root {
    position: fixed; top: 16px; right: 16px; z-index: 999999;
    width: calc(var(--hs-width, 780) * 1px);
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    background: #0a0e1a; color: #e4e9f0; border: 1px solid #1e293b;
    border-radius: 12px; box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    display: flex; flex-direction: column; overflow: hidden;
    font-size: calc(12px * var(--hs-scale, 1.5));
    line-height: 1.5;
  }
  #hs-audit-root.minimized { width: 360px; max-height: 60px; }
  #hs-audit-root .ha-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; background: #111827; border-bottom: 1px solid #1e293b;
    cursor: move;
  }
  #hs-audit-root .ha-title { font-size: calc(15px * var(--hs-scale, 1.5)); font-weight: 700; letter-spacing: -0.3px; }
  #hs-audit-root .ha-title .ha-live {
    display: inline-block; width: 7px; height: 7px; background: #22c55e;
    border-radius: 50%; margin-right: 6px; animation: ha-pulse 1.5s infinite;
  }
  @keyframes ha-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  #hs-audit-root .ha-ctrl { display: flex; gap: 6px; }
  #hs-audit-root .ha-btn {
    background: #1e293b; color: #cbd5e1; border: 0; border-radius: 4px;
    padding: 6px 12px; font-size: calc(13px * var(--hs-scale, 1.5)); cursor: pointer;
  }
  #hs-audit-root .ha-btn:hover { background: #334155; }
  #hs-audit-root .ha-btn.primary { background: #3b82f6; color: #fff; }
  #hs-audit-root .ha-btn.primary:hover { background: #2563eb; }
  #hs-audit-root .ha-btn.danger { background: #991b1b; color: #fecaca; }
  #hs-audit-root .ha-body { padding: 14px; overflow-y: auto; flex: 1; }
  #hs-audit-root.minimized .ha-body { display: none; }

  #hs-audit-root .ha-metrics { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; margin-bottom: 12px; }
  #hs-audit-root .ha-mc { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; text-align: center; }
  #hs-audit-root .ha-mc .l { font-size: calc(11px * var(--hs-scale, 1.5)); color: #64748b; font-weight: 600; text-transform: uppercase; }
  #hs-audit-root .ha-mc .v { font-size: calc(26px * var(--hs-scale, 1.5)); font-weight: 700; margin-top: 4px; font-family: "SF Mono", monospace; }
  #hs-audit-root .ha-mc.ok .v { color: #22c55e; }
  #hs-audit-root .ha-mc.warn .v { color: #f59e0b; }
  #hs-audit-root .ha-mc.err .v { color: #ef4444; }
  #hs-audit-root .ha-mc.blue .v { color: #3b82f6; }

  #hs-audit-root .ha-steps { display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; margin-bottom: 12px; }
  #hs-audit-root .ha-st { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; position: relative; overflow: hidden; }
  #hs-audit-root .ha-st.active { border-color: #3b82f6; background: #0f1b33; }
  #hs-audit-root .ha-st.done { border-color: #22c55e; background: #0a1f13; }
  #hs-audit-root .ha-st .n { font-size: calc(11px * var(--hs-scale, 1.5)); color: #475569; font-weight: 700; }
  #hs-audit-root .ha-st .t { font-size: calc(14px * var(--hs-scale, 1.5)); font-weight: 600; margin-top: 4px; }
  #hs-audit-root .ha-st.active .t { color: #60a5fa; }
  #hs-audit-root .ha-st.done .t { color: #86efac; }
  #hs-audit-root .ha-st .b { position: absolute; bottom: 0; left: 0; height: 2px; background: #3b82f6; width: 0; transition: width 0.2s; }
  #hs-audit-root .ha-st.done .b { width: 100% !important; background: #22c55e; }

  #hs-audit-root .ha-pg { display: grid; grid-template-columns: repeat(5,1fr); gap: 4px; margin-bottom: 10px; }
  #hs-audit-root .ha-pgc { background: #0f172a; border: 1px solid #1e293b; border-radius: 4px; padding: 8px; text-align: center; font-size: calc(12px * var(--hs-scale, 1.5)); }
  #hs-audit-root .ha-pgc.done { border-color: #16a34a; }
  #hs-audit-root .ha-pgc .pn { color: #64748b; font-weight: 600; font-size: calc(12px * var(--hs-scale, 1.5)); }
  #hs-audit-root .ha-pgc .pc { color: #3b82f6; font-size: calc(18px * var(--hs-scale, 1.5)); font-weight: 700; font-family: "SF Mono", monospace; margin-top: 4px; }
  #hs-audit-root .ha-pgc.done .pc { color: #22c55e; }

  #hs-audit-root .ha-cur { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 14px; font-family: "SF Mono", monospace; font-size: calc(18px * var(--hs-scale, 1.5)); line-height: 1.8; min-height: 120px; margin-bottom: 12px; }
  #hs-audit-root .ha-cur .l { color: #64748b; font-weight: 600; }
  #hs-audit-root .ha-cur .c { color: #60a5fa; }
  #hs-audit-root .ha-cur .n { color: #fbbf24; }
  #hs-audit-root .ha-cur .j { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: calc(14px * var(--hs-scale, 1.5)); font-weight: 700; margin-left: 8px; }
  #hs-audit-root .ha-cur .j.ok { background: #14532d; color: #86efac; }
  #hs-audit-root .ha-cur .j.warn { background: #78350f; color: #fcd34d; }
  #hs-audit-root .ha-cur .j.err { background: #7f1d1d; color: #fca5a5; }

  #hs-audit-root .ha-log { background: #020617; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; height: calc(180px * var(--hs-scale, 1.5)); overflow-y: auto; font-family: "SF Mono", monospace; font-size: calc(16px * var(--hs-scale, 1.5)); line-height: 1.7; }
  #hs-audit-root .ha-log .ln { margin-bottom: 2px; }
  #hs-audit-root .ha-log::-webkit-scrollbar { width: 5px; }
  #hs-audit-root .ha-log::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
  #hs-audit-root .ha-log .ln { display: flex; gap: 6px; }
  #hs-audit-root .ha-log .lt { color: #475569; flex-shrink: 0; }
  #hs-audit-root .ha-log .lv { color: #60a5fa; flex-shrink: 0; font-weight: 600; }
  #hs-audit-root .ha-log .lm { color: #cbd5e1; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #hs-audit-root .ha-log .ln.ok .lv { color: #22c55e; }
  #hs-audit-root .ha-log .ln.warn .lv { color: #f59e0b; }
  #hs-audit-root .ha-log .ln.err .lv { color: #ef4444; }
  #hs-audit-root .ha-log .ln.sys .lv { color: #a855f7; }

  #hs-audit-root .ha-done-area { display: none; margin-top: 12px; padding: 12px; background: linear-gradient(135deg,#0f1b33,#132346); border: 1px solid #3b82f6; border-radius: 8px; }
  #hs-audit-root .ha-fix-area { display: none; margin-top: 12px; padding: 14px; background: linear-gradient(135deg,#2d1b0e,#3d2415); border: 1px solid #d97706; border-radius: 8px; }
  #hs-audit-root .ha-fix-area.show { display: block; }
  #hs-audit-root .ha-fix-title { font-size: calc(15px * var(--hs-scale, 1.5)); color: #fbbf24; font-weight: 700; margin-bottom: 10px; }
  #hs-audit-root .ha-fix-stats { font-size: calc(13px * var(--hs-scale, 1.5)); color: #fde68a; margin-bottom: 12px; font-family: "SF Mono", monospace; }
  #hs-audit-root .ha-fix-btn { background: #dc2626; color: #fff; border: 0; border-radius: 6px; padding: 10px 16px; font-size: calc(13px * var(--hs-scale, 1.5)); font-weight: 700; cursor: pointer; }
  #hs-audit-root .ha-fix-btn:hover { background: #991b1b; }
  #hs-audit-root .ha-fix-btn:disabled { background: #44403c; color: #a8a29e; cursor: not-allowed; }
  #hs-audit-root .ha-fix-progress { margin-top: 12px; font-size: calc(12px * var(--hs-scale, 1.5)); color: #fcd34d; display: none; }
  #hs-audit-root .ha-fix-progress.show { display: block; }
  #hs-audit-root .ha-fix-progress .pct { font-family: "SF Mono", monospace; font-size: calc(16px * var(--hs-scale, 1.5)); font-weight: 700; color: #fbbf24; }
  #hs-audit-root .ha-done-area.show { display: block; }
  #hs-audit-root .ha-done-area .t { font-size: calc(13px * var(--hs-scale, 1.5)); color: #60a5fa; font-weight: 600; margin-bottom: 6px; }
  #hs-audit-root .ha-done-area .m { font-size: calc(18px * var(--hs-scale, 1.5)); font-weight: 700; margin-bottom: 10px; }
  #hs-audit-root .ha-dl-row { display: flex; gap: 6px; }
</style>

<div class="ha-header" id="ha-drag">
  <div class="ha-title"><span class="ha-live"></span>하나사인몰 실시간 감사 <span style="font-size:11px;opacity:.7;color:#4ade80">v11</span></div>
  <div class="ha-ctrl">
    <button class="ha-btn" id="ha-min">─</button>
    <button class="ha-btn" id="ha-stop">■</button>
    <button class="ha-btn danger" id="ha-close">✕</button>
  </div>
</div>

<div class="ha-body">
  <div style="font-size:calc(13px * var(--hs-scale, 1.5));color:#94a3b8;margin-bottom:12px" id="ha-sub">
    카테고리 ${CFG.cat} · ${Array.isArray(CFG.pages)?CFG.pages.length+'페이지':'전체 페이지 자동 감지'} · viewCnt=${CFG.viewCnt}
    · 시작시각 <span id="ha-start-t">--:--</span> · 경과 <span id="ha-elapsed">00:00</span>
  </div>

  <div class="ha-metrics">
    <div class="ha-mc blue"><div class="l">전체</div><div class="v" id="ha-total">${Array.isArray(CFG.pages)?CFG.pages.length*CFG.viewCnt:'…'}</div></div>
    <div class="ha-mc"><div class="l">완료</div><div class="v" id="ha-done">0</div></div>
    <div class="ha-mc ok"><div class="l">OK</div><div class="v" id="ha-ok">0</div></div>
    <div class="ha-mc warn"><div class="l">FIX</div><div class="v" id="ha-fix">0</div></div>
    <div class="ha-mc err"><div class="l">과태깅</div><div class="v" id="ha-over">0</div></div>
  </div>

  <div class="ha-steps">
    <div class="ha-st" id="ha-s1"><div class="n">STEP 1</div><div class="t">수집</div><div class="b"></div></div>
    <div class="ha-st" id="ha-s2"><div class="n">STEP 2</div><div class="t">3차원 감사</div><div class="b"></div></div>
    <div class="ha-st" id="ha-s3"><div class="n">STEP 3</div><div class="t">판정</div><div class="b"></div></div>
    <div class="ha-st" id="ha-s4"><div class="n">STEP 4</div><div class="t">리포트</div><div class="b"></div></div>
  </div>

  <div class="ha-pg" id="ha-pg"></div>

  <div class="ha-cur" id="ha-cur"><div><span class="l">상태:</span> 준비 중...</div></div>

  <div class="ha-log" id="ha-log"></div>

  <div class="ha-done-area" id="ha-done-area">
    <div class="t">감사 완료 · 소요 <span id="ha-total-t">--:--</span></div>
    <div class="m" id="ha-done-msg">-</div>
    <div class="ha-dl-row">
      <button class="ha-btn primary" id="ha-dl-xlsx">📊 Excel 다운로드</button>
      <button class="ha-btn primary" id="ha-dl-csv">CSV 다운로드</button>
      <button class="ha-btn" id="ha-dl-json">JSON</button>
      <button class="ha-btn" id="ha-copy-json">복사</button>
    </div>
    <div class="ha-dl-row" style="margin-top:10px">
      <button class="ha-btn" style="background:#581c87;color:#fff" id="ha-llm-run">🧠 LLM 판정 실행</button>
      <span id="ha-llm-status" style="font-size:calc(12px * var(--hs-scale, 1.5));color:#c4b5fd;margin-left:8px"></span>
    </div>
    <div class="ha-dl-row" style="margin-top:10px">
      <button class="ha-btn" style="background:#065f46;color:#fff" id="ha-backup-list">🛡️ 백업 목록</button>
      <button class="ha-btn" style="background:#0369a1;color:#fff" id="ha-reverify">✓ 재검증</button>
      <button class="ha-btn" style="background:#991b1b;color:#fff;margin-left:auto" id="ha-rollback">🔙 롤백 실행</button>
      <span id="ha-rb-status" style="font-size:calc(12px * var(--hs-scale, 1.5));color:#fca5a5;margin-left:8px"></span>
    </div>
  </div>

  <div class="ha-fix-area" id="ha-fix-area">
    <div class="ha-fix-title">🔧 자동 수정 실행</div>
    <div class="ha-fix-stats" id="ha-fix-stats">-</div>
    <button class="ha-fix-btn" id="ha-fix-run">일괄 자동 수정 실행</button>
    <div class="ha-fix-progress" id="ha-fix-progress">
      <div>진행: <span class="pct" id="ha-fix-pct">0%</span> · <span id="ha-fix-done">0</span>/<span id="ha-fix-total">0</span>건 처리</div>
      <div id="ha-fix-curr" style="margin-top:6px;font-family:'SF Mono',monospace;font-size:calc(12px * var(--hs-scale, 1.5));color:#fde68a"></div>
    </div>
  </div>
</div>
`;
document.body.appendChild(root);
root.style.setProperty('--hs-scale', String(CFG.scale));
root.style.setProperty('--hs-width', String(CFG.width || 780));

// ================== 헬퍼 ==================
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fmtT(sec){const m=Math.floor(sec/60);const s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}

const startT = Date.now();
const startStr = new Date().toTimeString().slice(0,8);
(function(){ const el = $('ha-start-t'); if (el) el.textContent = startStr; })();
const clockTimer = setInterval(() => {
  const el = $('ha-elapsed');
  if (!el) { clearInterval(clockTimer); return; }
  const e = Math.floor((Date.now() - startT) / 1000);
  el.textContent = fmtT(e);
}, 200);
// 전역 cleanup 등록 (다음 실행 시 자동 정리)
window.__hsAuditCleanup = () => {
  try { clearInterval(clockTimer); } catch(_){}
  const rr = document.getElementById('hs-audit-root');
  if (rr) rr.remove();
  document.querySelectorAll('iframe[data-hs-audit="1"]').forEach(f => f.remove());
};

function setStep(n, pct) {
  for (let i = 1; i <= 4; i++) {
    const s = $('ha-s'+i);
    if (i < n) { s.classList.add('done'); s.classList.remove('active'); }
    else if (i === n) { s.classList.add('active'); s.classList.remove('done'); }
    else { s.classList.remove('active'); s.classList.remove('done'); }
  }
  if (pct != null) $('ha-s'+n).querySelector('.b').style.width = pct + '%';
}

function addLog(msg, type='info') {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2,'0');
  const mm = String(t.getMinutes()).padStart(2,'0');
  const ss = String(t.getSeconds()).padStart(2,'0');
  const log = $('ha-log');
  const ln = document.createElement('div');
  ln.className = 'ln ' + type;
  ln.innerHTML = `<span class="lt">${hh}:${mm}:${ss}</span><span class="lv">[${type.toUpperCase().slice(0,4)}]</span><span class="lm">${msg}</span>`;
  log.appendChild(ln);
  log.scrollTop = log.scrollHeight;
  // 최대 300줄 유지
  while (log.children.length > 300) log.removeChild(log.firstChild);
}

const metrics = {done:0, ok:0, fix:0, over:0};
function updateM(){
  $('ha-done').textContent = metrics.done;
  $('ha-ok').textContent = metrics.ok;
  $('ha-fix').textContent = metrics.fix;
  $('ha-over').textContent = metrics.over;
}

function updateCur(x) {
  const tCount = (x.t||'').split(',').filter(c=>c).length;
  const jClass = x.judge === 'OK' ? 'ok' : (x.judge && x.judge.startsWith('FIX')) ? 'warn' : '';
  $('ha-cur').innerHTML = `
    <div><span class="l">RgrCode:</span> <span class="c">${x.rgr||'-'}</span></div>
    <div><span class="l">상품명  :</span> <span class="n">${(x.name||'').slice(0,46)}</span></div>
    <div><span class="l">상품별O:</span> <span>${(x.o||'').slice(0,55) || '-'}</span></div>
    <div><span class="l">업종  T:</span> <span>${x.t||'-'} <span style="color:#64748b">(${tCount}업종)</span></span></div>
    <div><span class="l">체크수  :</span> <span>${x.cc||0} / ${x.ct||0}</span> ${x.judge ? `<span class="j ${jClass}">${x.judge}</span>` : ''}</div>`;
}

// ================== 페이지 셀 렌더 (초기; main에서 자동감지 후 재렌더 가능) ==================
const pgEl = $('ha-pg');
if (Array.isArray(CFG.pages)) {
  CFG.pages.forEach(p => {
    const el = document.createElement('div');
    el.className = 'ha-pgc';
    el.id = 'ha-pgc-' + p;
    el.innerHTML = `<div class="pn">${p}P</div><div class="pc"><span id="ha-pgc-${p}-c">0</span>/${CFG.viewCnt}</div>`;
    pgEl.appendChild(el);
  });
}

// ================== 헤더 조작 ==================
let stopped = false;
$('ha-min').onclick = () => root.classList.toggle('minimized');
$('ha-stop').onclick = () => { stopped = true; addLog('사용자 중지 요청','err'); };
$('ha-close').onclick = () => { stopped = true; clearInterval(clockTimer); root.remove(); };

// 드래그
(function makeDraggable(){
  const h = $('ha-drag');
  let sx=0, sy=0, sl=0, st=0, drag=false;
  h.onmousedown = e => { drag=true; sx=e.clientX; sy=e.clientY;
    const r = root.getBoundingClientRect(); sl=r.left; st=r.top; };
  document.onmouseup = () => drag=false;
  document.onmousemove = e => {
    if (!drag) return;
    root.style.right = 'auto';
    root.style.left = (sl + e.clientX - sx) + 'px';
    root.style.top = (st + e.clientY - sy) + 'px';
  };
})();

// ================== 감사 로직 (v9) ==================
// v9 변경점: 체크박스 type별 분리 수집 (type=1 상품세부 / type=2 업종×공간 / type=5 관심분야)
//           기존 cc는 전체 체크 개수, 신규 t5_cc/t2_cc/t1_cc + t2_by_industry 로 세분화
const G = {'01':'G1','02':'G2','03':'G3','04':'G4','05':'G5','06':'G6','07':'G7','08':'G8','09':'G9'};
const CBR = /^(\d{2})`\d`(\d{2}-\d{2})`/;
const CBR_TYPED = /^(\d{2})`(\d)`(\d{2}-\d{2})`/;  // v9: type 분리용

// 현재 탭의 GoodsList 필터를 그대로 유지하면서 page만 교체
// (판매상태·카테고리·기간 등 사용자가 지정한 모든 필터 보존)
function buildListUrl(page) {
  if (location.pathname.includes('GoodsList.php')) {
    const params = new URLSearchParams(location.search);
    params.set('page', String(page));
    if (!params.has('startpage')) params.set('startpage', '1');
    if (!params.has('CodeT1_1')) params.set('CodeT1_1', CFG.cat);
    if (!params.has('viewCnt')) params.set('viewCnt', String(CFG.viewCnt));
    return '/AdminManager/GoodsList.php?' + params.toString();
  }
  // GoodsList가 아니면 CFG 기반 (필터 없음, 경고 필요)
  return `/AdminManager/GoodsList.php?page=${page}&startpage=1&CodeT1_1=${CFG.cat}&viewCnt=${CFG.viewCnt}`;
}

// 현재 검색 필터의 전체 페이지 자동 감지
async function detectTotalPages() {
  // 현재 페이지가 GoodsList.php이면 바로 파싱, 아니면 page=1로 fetch
  let doc = document;
  if (!location.pathname.includes('GoodsList.php')) {
    const res = await fetch(buildListUrl(1), {credentials:'include'});
    const html = await res.text();
    doc = new DOMParser().parseFromString(html, 'text/html');
  }
  // 1) "총 N건" 파싱
  const bt = doc.body ? doc.body.innerText : '';
  let total = null;
  const m1 = bt.match(/총\s*([\d,]+)\s*건/);
  const m2 = bt.match(/총\s*([\d,]+)/);
  if (m1) total = parseInt(m1[1].replace(/,/g,''));
  else if (m2) total = parseInt(m2[1].replace(/,/g,''));

  // 2) 페이지네이션 링크의 최대 번호
  const nums = new Set();
  doc.querySelectorAll('a, button').forEach(el => {
    const oc = el.getAttribute('onclick') || '';
    // ItemSearch('', '5', '1') 형태
    const m = oc.match(/ItemSearch\s*\(\s*['"]?[^,'"]*['"]?\s*,\s*['"]?(\d+)['"]?/);
    if (m) nums.add(parseInt(m[1]));
  });
  const navMax = nums.size ? Math.max(...nums) : 0;

  // 총건수 기반 계산이 우선 (더 정확)
  let maxPage;
  if (total != null && total > 0) {
    maxPage = Math.ceil(total / CFG.viewCnt);
  } else if (navMax > 0) {
    maxPage = navMax;
  } else {
    maxPage = 1;
  }
  return {total, navMax, maxPage};
}

async function fetchGoodsList(page) {
  const url = buildListUrl(page);
  // 필터 표시를 위해 short log 생성
  const shortFilter = url.split('?')[1].replace(/^.*?page=\d+&?/, '').slice(0, 60);
  addLog(`GET page=${page} · ${shortFilter}`, 'info');
  const res = await fetch(url, {credentials: 'include'});
  if (!res.ok) throw new Error('HTTP '+res.status);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const buttons = Array.from(doc.querySelectorAll('button[onclick]'));
  const items = [], seen = new Set();
  for (const b of buttons) {
    if (!/상품수정/.test(b.textContent||'')) continue;
    const oc = b.getAttribute('onclick') || '';
    const m = oc.match(/(\d{12}_\d{4})/);
    if (!m) continue;
    const rgr = m[1];
    if (seen.has(rgr)) continue;
    seen.add(rgr);
    const tr = b.closest('tr');
    let name = '';
    if (tr) {
      for (const td of tr.querySelectorAll('td')) {
        const t = (td.textContent||'').trim().replace(/\s+/g,' ');
        // v11.0.4: 가격 텍스트 제외 (예: "2,178,000원", "341,000원")
        if (/^[\d,.\s]+원$/.test(t)) continue;
        // 숫자 비율이 50% 이상이면 가격/코드일 가능성 → 제외
        const digitRatio = (t.match(/\d/g)||[]).length / t.length;
        if (digitRatio > 0.5) continue;
        if (/[가-힣]/.test(t) && t.length > 5 && t.length < 100 &&
            !/^(상품|임시|판매|숨김|수정|관리|보기|복사|등록|일자|코드|디자인|상세)/.test(t)) {
          if (t.length > name.length) name = t;
        }
      }
    }
    if (!name) name = '(상품명 없음)';  // v11.0.4: 빈 이름 방지
    items.push({rgr, name: name.slice(0, 60), page});
  }
  return items;
}

async function auditOne(item) {
  const url = `/AdminManager/MakeGoodsTypeOneDp.php?RgrCode=${item.rgr}&EditMode=1`;
  const res = await fetch(url, {credentials:'include'});
  if (!res.ok) return Object.assign(item, {err:'HTTP'+res.status});
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // RgrRowid 추출 (방법 B AJAX 호출에 필수)
  const rowidM = html.match(/RgrRowid:\s*'(\d+)'/);
  const rgrRowid = rowidM ? rowidM[1] : null;
  const oneVals = [], twoVals = [];
  for (let i=1; i<=30; i++) {
    const h = doc.querySelector(`input[name="SelectCatoryCodeOne_${i}"]`);
    if (h && h.value) oneVals.push(h.value.split('^')[0]);
    const h2 = doc.querySelector(`input[name="SelectCatoryCodeTwo_${i}"]`);
    if (h2 && h2.value) twoVals.push(h2.value.split('^')[0]);
  }
  const cd = {};
  const checked_values = [];
  let cbT=0, cbC=0;
  // v9: type별 분리 수집
  let t1_cc=0, t2_cc=0, t5_cc=0;
  const t2_by_industry = {};
  const t5_list = [];
  doc.querySelectorAll('input[type="checkbox"]').forEach(x => {
    const v = x.value||'';
    const m = v.match(CBR);
    if (!m) return;
    cbT++;
    const k = G[m[1]] || ('X'+m[1]);
    if (!cd[k]) cd[k] = [0, 0];
    cd[k][0]++;
    if (x.hasAttribute('checked')) {
      cd[k][1]++;
      cbC++;
      checked_values.push(v);  // 전체 value 저장 (롤백·방법 B용)
      // v9: type별 카운트
      const tm = v.match(CBR_TYPED);
      if (tm) {
        const pfx = tm[1], typ = tm[2], sub = tm[3];
        if (typ==='1') t1_cc++;
        else if (typ==='2') {
          t2_cc++;
          if (!t2_by_industry[pfx]) t2_by_industry[pfx] = [];
          t2_by_industry[pfx].push(sub);
        }
        else if (typ==='5') {
          t5_cc++;
          t5_list.push(pfx+'-'+sub);
        }
      }
    }
  });
  return Object.assign(item, {
    o: oneVals.join(','), t: twoVals.join(','),
    cc: cbC, ct: cbT, cd, checked_values, rowid: rgrRowid,
    // v9 추가 필드
    t1_cc, t2_cc, t5_cc, t2_by_industry, t5_list
  });
}

// ==================== v11 매칭 엔진 ====================
// 원본 규칙: category_matching_rules.json · 카테고리_매칭_규칙_v1.md (2026-04-22)
// 주요 원칙: 키워드 우선 · LLM 보조 · catO 재분류 허용 · 수동 태그 존중

const MATCHING_RULES = {
  kw_catO: [
    // 01 게시판
    {c:{o1:"01",o2:"01-01"},k:["슬림디자인","슬림 디자인 게시판"],p:5},
    {c:{o1:"01",o2:"01-02"},k:["안전강화유리","강화유리 게시판"],p:5},
    {c:{o1:"01",o2:"01-03"},k:["디자인 게시판"],p:3,ex:["슬림"]},
    {c:{o1:"01",o2:"01-04"},k:["크리스탈"],p:5},
    {c:{o1:"01",o2:"01-05"},k:["아크릴 게시판","아크릴보드"],p:5},
    {c:{o1:"01",o2:"01-06"},k:["슬림자석","자석 게시판"],p:5},
    {c:{o1:"01",o2:"01-07"},k:["우드 게시판","원목 게시판"],p:5},
    {c:{o1:"01",o2:"01-08"},k:["알미늄 게시판","알루미늄 게시판"],p:5},
    {c:{o1:"01",o2:"01-09"},k:["갈바 게시판"],p:5},
    {c:{o1:"01",o2:"01-14"},k:["메모보드","화이트보드"],p:5},
    {c:{o1:"01",o2:"01-15"},k:["액자"],p:5},
    {c:{o1:"01",o2:"01-17"},k:["슬림 안전보건","안전보건 게시판"],p:5},
    {c:{o1:"01"},k:["게시판","보드"],p:1},
    // 02 안내판
    {c:{o1:"02",o2:"02-05",o3:"02-05-001"},k:["매립 금연","매립형 금연"],p:7},
    {c:{o1:"02",o2:"02-05",o3:"02-05-002"},k:["매립 주의"],p:7},
    {c:{o1:"02",o2:"02-05",o3:"02-05-003"},k:["매립 금지"],p:7},
    {c:{o1:"02",o2:"02-05",o3:"02-05-004"},k:["매립 주차"],p:7},
    {c:{o1:"02",o2:"02-05",o3:"02-05-006"},k:["매립 화단","화단 보호 매립"],p:7},
    {c:{o1:"02",o2:"02-05",o3:"02-05-007"},k:["매립 반려","반려동물 매립"],p:7},
    {c:{o1:"02",o2:"02-05"},k:["매립 표지판","매립형 표지판","말뚝","매립"],p:5},
    {c:{o1:"02",o2:"02-05"},k:["스텐 표지판"],p:5,ex:["도로","주차","교통","매장","실내","H입간판"]},  // 부록A: 기본값 매립표지판
    {c:{o1:"02",o2:"02-06",o3:"02-06-001"},k:["피난대피층","피난 대피층"],p:7},
    {c:{o1:"02",o2:"02-06"},k:["소방 안내판","소방안전"],p:5},
    {c:{o1:"02",o2:"02-07",o3:"02-07-001"},k:["MSDS 주의"],p:7},
    {c:{o1:"02",o2:"02-07",o3:"02-07-002"},k:["MSDS 안전","MSDS 지시"],p:7},
    {c:{o1:"02",o2:"02-07",o3:"02-07-003"},k:["MSDS 안내"],p:7},
    {c:{o1:"02",o2:"02-07",o3:"02-07-004"},k:["MSDS 위험"],p:7},
    {c:{o1:"02",o2:"02-07",o3:"02-07-005"},k:["MSDS 이용수칙"],p:7},
    {c:{o1:"02",o2:"02-07",o3:"02-07-006"},k:["MSDS 경고"],p:7},
    {c:{o1:"02",o2:"02-07"},k:["MSDS","물질안전보건"],p:5},
    {c:{o1:"02",o2:"02-08"},k:["법령","법정게시물","법정표지"],p:6},  // 법령 우선: 안전보건 게시판과 충돌 시 이김
    {c:{o1:"02",o2:"02-01"},k:["금연 안내판","CCTV 안내판"],p:5},
    {c:{o1:"02",o2:"02-03"},k:["이용수칙 안내판","이용수칙"],p:5},
    {c:{o1:"02",o2:"02-04"},k:["유도 안내","유도판"],p:5},
    {c:{o1:"02"},k:["안내판","표지판","플레이트","사인"],p:1},
    // 04 입간판
    {c:{o1:"04",o2:"04-01",o3:"04-01-001"},k:["A형 청소"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-002"},k:["A형 공사"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-003"},k:["A형 수영장"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-004"},k:["A형 식당","A형 카페"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-005"},k:["A형 반려"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-007"},k:["A형 주의"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-008"},k:["A형 금지"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-009"},k:["A형 주차"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-010"},k:["A형 주유","A형 세차"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-011"},k:["A형 CCTV","A형 금연"],p:7},
    {c:{o1:"04",o2:"04-01",o3:"04-01-012"},k:["A형 학교"],p:7},
    {c:{o1:"04",o2:"04-01"},k:["A형 입간판","A형"],p:5},
    {c:{o1:"04",o2:"04-02",o3:"04-02-001"},k:["H입간판","H형 입간판"],p:7},
    {c:{o1:"04",o2:"04-02",o3:"04-02-002"},k:["놀이터 수칙","놀이터수칙"],p:7},
    {c:{o1:"04",o2:"04-02"},k:["스텐 입간판"],p:5},
    {c:{o1:"04",o2:"04-03"},k:["오뚜기 입간판","오뚜기 사인"],p:5,ex:["주차금지"]},
    {c:{o1:"04"},k:["입간판"],p:1},
    // 05 현수막/배너
    {c:{o1:"05",o2:"05-01"},k:["명절","설날","추석"],p:5},
    {c:{o1:"05",o2:"05-02"},k:["불조심"],p:5},
    {c:{o1:"05",o2:"05-03"},k:["신년","연말","새해"],p:5},
    {c:{o1:"05",o2:"05-04"},k:["주차 현수막","불법주차 현수막"],p:5},
    {c:{o1:"05",o2:"05-05"},k:["유치원 현수막","학교 현수막"],p:5},
    {c:{o1:"05",o2:"05-06"},k:["배너","X배너","실사 배너"],p:5},
    {c:{o1:"05"},k:["현수막"],p:1},
    // 07 구조물
    {c:{o1:"07",o2:"07-04"},k:["구조물 간판","대형 간판","설치 구조물"],p:5},
    // 08 도로안전
    {c:{o1:"08",o2:"08-01"},k:["차선규제봉","규제봉"],p:5},
    {c:{o1:"08",o2:"08-02"},k:["카스토퍼","주차스토퍼","스톱바"],p:5},
    {c:{o1:"08",o2:"08-03"},k:["주차금지 오뚜기","주차금지 콘"],p:6},
    {c:{o1:"08",o2:"08-04"},k:["과속방지턱","방지턱"],p:5},
    {c:{o1:"08",o2:"08-05"},k:["코너보호대","코너가드"],p:5},
    {c:{o1:"08",o2:"08-06"},k:["볼라드"],p:5},
    {c:{o1:"08",o2:"08-07"},k:["반사경","교통거울","코너미러"],p:5},
    {c:{o1:"08",o2:"08-08"},k:["표지병","쏠라표지"],p:5},
    {c:{o1:"08",o2:"08-09"},k:["바리게이트","바리케이드"],p:5},
    {c:{o1:"08",o2:"08-10"},k:["스텐입간판"],p:6,req:["도로","주차","교통"]},
    {c:{o1:"08",o2:"08-11"},k:["높이제한바","높이제한"],p:5},
    {c:{o1:"08",o2:"08-12"},k:["자전거보관대"],p:5},
    {c:{o1:"08",o2:"08-13"},k:["쐐기","셋트앙카","앙카"],p:5},
    {c:{o1:"08",o2:"08-14"},k:["교통표시등","쏠라등"],p:5},
    {c:{o1:"08",o2:"08-15"},k:["제설함","염화칼슘함"],p:5},
    {c:{o1:"08",o2:"08-17"},k:["장애인편의시설","장애인시설"],p:5},
    {c:{o1:"08",o2:"08-18"},k:["차량진입판","진입판"],p:5},
    {c:{o1:"08",o2:"08-19"},k:["차단봉"],p:5},
    {c:{o1:"08",o2:"08-20"},k:["디자인휀스","디자인 펜스"],p:5},
    {c:{o1:"08",o2:"08-21"},k:["차선분리대"],p:5},
    {c:{o1:"08",o2:"08-22"},k:["방호벽","충격흡수"],p:5},
    {c:{o1:"08",o2:"08-23"},k:["가림막"],p:5},
    {c:{o1:"08",o2:"08-24"},k:["차량버팀목"],p:5},
    {c:{o1:"08",o2:"08-25"},k:["추락방지","U형 철책"],p:5},
    {c:{o1:"08",o2:"08-26"},k:["전선보호대"],p:5},
    {c:{o1:"08",o2:"08-27"},k:["소화기함","수방보관함"],p:5},
    {c:{o1:"08",o2:"08-28"},k:["도로표지판","교통표지판"],p:5},
    // 09 각종물품
    {c:{o1:"09",o2:"09-01"},k:["명패","명찰","부서명패"],p:5},
    {c:{o1:"09",o2:"09-06"},k:["매트","발판매트"],p:5},
    {c:{o1:"09",o2:"09-08"},k:["쇼케이스"],p:5},
    {c:{o1:"09",o2:"09-09",o3:"09-09-001"},k:["쇼클립"],p:7},
    {c:{o1:"09",o2:"09-09",o3:"09-09-004"},k:["스탠드사인"],p:7},
    {c:{o1:"09",o2:"09-09",o3:"09-09-005"},k:["데스크사인"],p:7},
    {c:{o1:"09",o2:"09-10"},k:["현판"],p:5},
    // 10 인쇄물/스티커
    {c:{o1:"10",o2:"10-02",o3:"10-02-001"},k:["주차스티커 화이트"],p:7},
    {c:{o1:"10",o2:"10-02",o3:"10-02-002"},k:["주차스티커 사각 홀로그램"],p:7},
    {c:{o1:"10",o2:"10-02",o3:"10-02-003"},k:["주차스티커 모래알"],p:7},
    {c:{o1:"10",o2:"10-02",o3:"10-02-004"},k:["주차스티커 민무늬"],p:7},
    {c:{o1:"10",o2:"10-02",o3:"10-02-005"},k:["주차스티커 반사지"],p:7},
    {c:{o1:"10",o2:"10-02",o3:"10-02-006"},k:["주차스티커 야광"],p:7},
    {c:{o1:"10",o2:"10-02",o3:"10-02-007"},k:["주차스티커 럭셔리실버"],p:7},
    {c:{o1:"10",o2:"10-02",o3:"10-02-008"},k:["주차스티커 럭셔리골드"],p:7},
    {c:{o1:"10",o2:"10-02",o3:"10-02-009"},k:["주차스티커 종이"],p:7},
    {c:{o1:"10",o2:"10-02"},k:["주차스티커","주차증"],p:5},
    {c:{o1:"10",o2:"10-03"},k:["경고장","주차경고장"],p:5},
    {c:{o1:"10",o2:"10-04"},k:["자전거스티커"],p:5},
    {c:{o1:"10",o2:"10-05"},k:["전단","포스터","인쇄물"],p:3},
    {c:{o1:"10",o2:"10-06"},k:["안전스티커"],p:5},
    {c:{o1:"10"},k:["스티커","라벨"],p:1},
  ],
  kw_catT: [
    {c:"01",k:["학교","학원","유치원","초등","중등","고등","대학","교실"]},
    {c:"02",k:["식당","카페","레스토랑","음식점","베이커리"]},
    {c:"03",k:["아파트","단지","입주민","주민","동대표"]},
    {c:"04",k:["호텔","펜션","리조트","숙박","모텔"]},
    {c:"05",k:["병원","약국","요양원","진료","의원","치과","한의원"]},
    {c:"06",k:["회사","공장","사무실","기업","제조","공단"]},
    {c:"07",k:["관공서","공공","구청","시청","주민센터","도청"]},
    {c:"08",k:["헬스","피트니스","스포츠","체육","골프","수영장"]},
  ],
  default_catT: {"01":["01","03","06","07"],"02":["01","02","03","05","06","07","08","09"],"04":["02","03","06","07","09"],"05":["01","03","06","07","09"],"07":["06","07","09"],"08":["03","06","07","09"],"09":["01","03","06","07","09"],"10":["01","02","03","05","06","07","09"]},
  default_spaces: {"01":["02-01","02-02","02-03","02-04"],"02":["03-01"],"03":["06-07"],"04":["08-02","08-03","08-04"],"05":["04-01","04-02","07-04"],"06":["05-01","05-02","07-06"],"07":["06-01","06-02","06-03","06-04","06-05","06-06","07-01","07-03"],"08":["03-02","03-03","08-04"],"09":[]},
  extra_spaces: [
    {m:["주차","주차장"],a:["06-07","05-03"]},
    {m:["소방","화재"],a:["06-05","07-01"]},
    {m:["청소","환경"],a:["07-05"]},
    {m:["보안","CCTV"],a:["07-03","06-04"]},
    {m:["물류","창고"],a:["05-02"]},
    {m:["반려동물","반려견","애견"],a:["04-02"]},
    {m:["공사","작업장"],a:["05-01","07-06"]},
  ],
  fitness: {"01":{"01":"A","02":"B","03":"A","04":"B","05":"A","06":"A","07":"A","08":"B","09":"A"},"02":{"01":"A","02":"A","03":"A","04":"A","05":"A","06":"A","07":"A","08":"A","09":"A"},"04":{"01":"B","02":"A","03":"A","04":"A","05":"B","06":"A","07":"A","08":"A","09":"A"},"05":{"01":"A","02":"B","03":"A","04":"B","05":"B","06":"A","07":"A","08":"B","09":"A"},"07":{"01":"C","02":"C","03":"B","04":"C","05":"C","06":"A","07":"A","08":"C","09":"B"},"08":{"01":"B","02":"C","03":"A","04":"B","05":"C","06":"A","07":"A","08":"C","09":"A"},"09":{"01":"A","02":"B","03":"A","04":"B","05":"A","06":"A","07":"A","08":"B","09":"A"},"10":{"01":"A","02":"A","03":"A","04":"A","05":"A","06":"A","07":"A","08":"A","09":"A"}},
  skip_catO: ["13","60"]
};

// 매칭 헬퍼 (공백·대소문자 정규화)
function _mNorm(s){return (s||'').replace(/\s+/g,'').toLowerCase();}

// 상품명 → catO 키워드 매칭. priority+길이 최대값 반환
function kwMatchCatO(name) {
  const n = _mNorm(name);
  let best = null;
  for (const rule of MATCHING_RULES.kw_catO) {
    for (const kw of rule.k) {
      if (!n.includes(_mNorm(kw))) continue;
      if (rule.ex && rule.ex.some(x => n.includes(_mNorm(x)))) continue;
      if (rule.req && !rule.req.some(x => n.includes(_mNorm(x)))) continue;
      const cand = {c: rule.c, p: rule.p, kw, kwLen: kw.length};
      if (!best || cand.p > best.p || (cand.p === best.p && cand.kwLen > best.kwLen)) {
        best = cand;
      }
    }
  }
  return best;  // {c:{o1,o2,o3?}, p, kw, kwLen} or null
}

// 상품명 → 명시 업종 세트
function kwMatchCatT(name) {
  const n = _mNorm(name);
  const matched = new Set();
  for (const rule of MATCHING_RULES.kw_catT) {
    for (const kw of rule.k) {
      if (n.includes(_mNorm(kw))) { matched.add(rule.c); break; }
    }
  }
  return matched;
}

// catO1 → 기본 catT 세트
function defaultCatT(o1) {
  return new Set(MATCHING_RULES.default_catT[o1] || []);
}

// catT 세트 → 기본 공간 합집합
function defaultSpaces(catTSet) {
  const spaces = new Set();
  for (const t of catTSet) {
    for (const sp of (MATCHING_RULES.default_spaces[t] || [])) spaces.add(sp);
  }
  return spaces;
}

// 상품명 → 추가 공간 (특성 보정)
function kwExtraSpaces(name) {
  const n = _mNorm(name);
  const extra = new Set();
  for (const rule of MATCHING_RULES.extra_spaces) {
    if (rule.m.some(k => n.includes(_mNorm(k)))) rule.a.forEach(s => extra.add(s));
  }
  return extra;
}

// catO1 × catT → 적합도 A/B/C
function matrixFit(o1, t) {
  return (MATCHING_RULES.fitness[o1] || {})[t] || 'B';
}

// ==================== v11.1 규칙 기반 자동 판정 (LLM 전 단계) ====================
// 키워드 매칭 강하고 매트릭스 적합이면 LLM 없이 규칙만으로 add/remove 지시 생성
// 반환값 true = 해결 완료 (LLM 불필요) · false = LLM 필요
function ruleBasedResolve(item) {
  const kwO = item._kw_catO;
  // 조건 1: 키워드 매칭 priority >= 5 (명확한 매칭)
  if (!kwO || kwO.p < 5) return false;

  // 조건 2: 매트릭스 부적합(C) 경고 있으면 LLM 검증 필요
  if (item._kw_fit_warn && item._kw_fit_warn.length > 0) return false;

  const name = item.name || '';
  const kwT = kwMatchCatT(name);
  const expT = kwT.size ? kwT : defaultCatT(kwO.c.o1);

  // 1. catO 지시 (재분류 또는 2/3차 추가)
  item.llm_catO = {
    o1: kwO.c.o1,
    o2: kwO.c.o2 || null,
    o3: kwO.c.o3 || null
  };
  item.llm_o3 = kwO.c.o3 || kwO.c.o2 || null;

  // 2. catT add (기존 없는 것만)
  const curT = new Set((item.t||'').split(',').filter(x=>x));
  const tAdd = Array.from(expT).filter(t => !curT.has(t));
  item.llm_catT_add = tAdd;
  item.llm_catT_remove = [];  // 규칙 기반은 remove 안 함 (수동 태그 존중)

  // 3. SelMemCat 공간 add (매트릭스 기반 + 키워드 보정)
  const baseSpaces = defaultSpaces(expT);
  const extraSpaces = kwExtraSpaces(name);
  const targetSpaces = new Set([...baseSpaces, ...extraSpaces]);
  const curSpaces = new Set(item.t5_list || []);
  const spAdd = Array.from(targetSpaces).filter(s => !curSpaces.has(s));
  item.llm_selMemCat_add = spAdd;
  item.llm_selMemCat_remove = [];  // 규칙 기반은 remove 안 함

  // 4. SelOptCat2 (업종×공간) — 규칙만으론 어려움, LLM이 해결할 영역이므로 빈 객체
  item.llm_selOptCat2_add = {};
  item.llm_selOptCat2_remove = {};

  // 5. 메타 정보
  item.llm_reason = `v11 규칙(kw:${kwO.kw} p${kwO.p} · 업종:${Array.from(expT).join(',') || '기본'} · 공간 ${spAdd.length}개 add)`;
  item.llm_source = 'rule';  // 규칙 기반임을 표시 (Excel/UI에서 구분용)

  return true;
}

// ================== 판정 규칙 (v11) ==================
// 하위 호환 proxy
function expectO1(name) {
  const m = kwMatchCatO(name);
  return m ? m.c.o1 : null;
}
function expectT1(name) {
  const kw = kwMatchCatT(name);
  if (/무지|셀프디자인|타입 - 대형|타입 - 중형|타입 - 소형|교체용|시트 교체|기본 타입/.test(name)) return 'U9';
  if (/주차|오뚜기|요일제|2부제|5부제|외부차량|주정차|전기차|차량/.test(name) && kw.size === 0) return 'CAR';
  return kw.size ? kw : null;
}
function expectO3(name) {
  const m = kwMatchCatO(name);
  return (m && m.c.o3) ? m.c.o3 : null;
}

// v11 judge: 키워드 매칭 우선 + 매트릭스 적합도 포함
function judge(r) {
  const name = r.name || '';
  const oSet = new Set((r.o||'').split(',').filter(x=>x));
  const tSet = new Set((r.t||'').split(',').filter(x=>x));
  const issues = new Set();

  // === 1. catO 키워드 매칭 ===
  const kwO = kwMatchCatO(name);
  let curO1 = null;
  for (const o of oSet) { const p = o.split('-')[0]; if (p) { curO1 = p; break; } }
  if (kwO) {
    r._kw_catO = kwO;
    const expO1 = kwO.c.o1;
    if (curO1 && expO1 && curO1 !== expO1) {
      issues.add('O1_RECLASS');  // 재분류 필요
    }
    if (kwO.c.o2 && !oSet.has(kwO.c.o2)) issues.add('O2');
    if (kwO.c.o3 && !oSet.has(kwO.c.o3)) issues.add('O3');
  } else {
    r._kw_catO = null;
  }

  // === 2. catT 체크 ===
  const kwT = kwMatchCatT(name);
  const expT = kwT.size ? kwT : defaultCatT(kwO ? kwO.c.o1 : (curO1 || '09'));
  r._kw_catT_expected = Array.from(expT);
  const missingT = Array.from(expT).filter(t => !tSet.has(t));
  r._kw_catT_missing = missingT;
  if (!tSet.size) issues.add('T');
  else if (missingT.length > 0) issues.add('T');

  // === 3. SelMemCat 체크 (t5_cc 0일 때만 FIX_CB) ===
  const memCnt = (typeof r.t5_cc === 'number') ? r.t5_cc : (r.cc || 0);
  if (memCnt === 0) issues.add('CB');

  // === 4. 매트릭스 부적합(C) 플래그 ===
  if (kwO) {
    const badFit = [];
    for (const t of expT) {
      if (matrixFit(kwO.c.o1, t) === 'C') badFit.push(t);
    }
    if (badFit.length) r._kw_fit_warn = badFit;
  }

  // === 5. 판정 코드 ===
  if (!issues.size) return 'OK';
  const hasO = issues.has('O1_RECLASS') || issues.has('O2') || issues.has('O3');
  if (issues.size === 1) {
    if (hasO) return 'FIX_O';
    if (issues.has('T')) return 'FIX_T';
    if (issues.has('CB')) return 'FIX_CB';
  }
  if (hasO && issues.has('T') && issues.has('CB')) return 'FIX_ALL';
  return 'FIX_MULTI';
}

// ================== 결과 저장 ==================
const RESULT = {config: CFG, started: startStr, items: []};

// ================== 메인 파이프라인 ==================
async function main(){
  addLog('🚀 v11 매칭 엔진 로드 · 규칙 ' + MATCHING_RULES.kw_catO.length + '개 활성', 'ok');
  addLog('파이프라인 시작 · 카테고리=' + CFG.cat + (CFG.catName ? ' ('+CFG.catName+')' : ''), 'sys');
  // 현재 탭 필터 상태 로그
  if (location.pathname.includes('GoodsList.php')) {
    const params = new URLSearchParams(location.search);
    const keys = ['CodeT1_1','viewCnt','RegRegView','SearchKey','SearchString','DateStart','DateEnd'];
    const shown = keys.filter(k => params.get(k)).map(k => `${k}=${params.get(k)}`);
    addLog('필터 적용: ' + (shown.join(' · ') || '(기본)'), 'sys');
  } else {
    addLog('⚠️ GoodsList.php 아님 → 기본 필터 사용 (판매상태 무시됨)', 'warn');
  }

  // pages: 'auto' 이면 자동 감지
  if (CFG.pages === 'auto' || !Array.isArray(CFG.pages)) {
    addLog('전체 페이지 자동 감지 중...', 'sys');
    try {
      const d = await detectTotalPages();
      if (d.total) addLog(`총 상품 ${d.total}건 · viewCnt=${CFG.viewCnt} · 최대 ${d.maxPage}페이지`, 'ok');
      else addLog(`페이지네이션 기반 최대 ${d.maxPage}페이지 감지`, 'ok');
      CFG.pages = [];
      for (let i = 1; i <= d.maxPage; i++) CFG.pages.push(i);
      CFG.total = d.total;
    } catch (e) {
      addLog('자동 감지 실패, 1페이지만 진행: ' + e.message, 'err');
      CFG.pages = [1];
    }
  }
  // 총 카운트 업데이트 (자동 감지 결과 반영)
  const tgtTotal = CFG.pages.length * CFG.viewCnt;
  $('ha-total').textContent = CFG.total || tgtTotal;
  // 상단 서브 텍스트도 갱신
  $('ha-sub').innerHTML = `카테고리 ${CFG.cat} · ${CFG.pages.length}페이지 × ${CFG.viewCnt} = <b>${CFG.total || tgtTotal}개</b> · 시작 <span id="ha-start-t">${startStr}</span> · 경과 <span id="ha-elapsed">00:00</span>`;
  // 페이지 셀 재렌더링 (자동 감지된 페이지 수에 맞춤)
  pgEl.innerHTML = '';
  const pgCols = Math.min(CFG.pages.length, CFG.pgCols || 5);
  pgEl.style.gridTemplateColumns = `repeat(${pgCols}, 1fr)`;
  CFG.pages.forEach(p => {
    const el = document.createElement('div');
    el.className = 'ha-pgc'; el.id = 'ha-pgc-' + p;
    el.innerHTML = `<div class="pn">${p}P</div><div class="pc"><span id="ha-pgc-${p}-c">0</span>/${CFG.viewCnt}</div>`;
    pgEl.appendChild(el);
  });

  // ========== STEP 1: 수집 ==========
  setStep(1);
  const collected = [];
  for (let i = 0; i < CFG.pages.length; i++) {
    if (stopped) return;
    const p = CFG.pages[i];
    try {
      const items = await fetchGoodsList(p);
      for (const it of items) {
        collected.push(it);
        $('ha-pgc-'+p+'-c').textContent = items.indexOf(it) + 1;
        setStep(1, ((i + (items.indexOf(it)+1)/items.length) / CFG.pages.length) * 100);
      }
      addLog(`수집: p${p} ${items.length}개 (누적 ${collected.length})`, 'ok');
      $('ha-pgc-'+p).classList.add('done');
    } catch(e) {
      addLog(`수집 실패 p${p}: ${e.message}`, 'err');
    }
    await sleep(CFG.batchGap);
  }
  setStep(1, 100);
  addLog(`수집 완료 · 총 ${collected.length}개`, 'ok');
  await sleep(400);

  // ========== STEP 2: 감사 ==========
  setStep(2);
  // 페이지 카운터 초기화
  CFG.pages.forEach(p => { $('ha-pgc-'+p+'-c').textContent = '0'; $('ha-pgc-'+p).classList.remove('done'); });
  const pageCounts = {};

  for (let i = 0; i < collected.length; i += CFG.batch) {
    if (stopped) return;
    const batch = collected.slice(i, i + CFG.batch);
    const results = await Promise.all(batch.map(auditOne));
    for (const r of results) {
      RESULT.items.push(r);
      metrics.done++;
      // v10.7.4: 과태깅 카운트 기준 수정 (cc>100 옛 기준 → SelMemCat(t5)>25 실질 기준)
      // cc는 type=1/2/5 전부 합산이라 범용 상품은 당연히 높음. 실제 과태깅은 t5 기준이 맞음.
      if ((r.t5_cc || 0) > 25) metrics.over++;
      const tCount = (r.t||'').split(',').filter(x=>x).length;
      const cls = r.cc > 100 ? 'err' : r.cc > 30 ? 'warn' : 'ok';
      addLog(`audit ${r.rgr} · O[${(r.o||'').slice(0,18)}] T[${tCount}] cb=${r.cc}/${r.ct}`, cls);
      updateCur(r);
      updateM();
      pageCounts[r.page] = (pageCounts[r.page]||0) + 1;
      $('ha-pgc-'+r.page+'-c').textContent = pageCounts[r.page];
      setStep(2, metrics.done / collected.length * 100);
      await sleep(CFG.pace);
    }
  }
  CFG.pages.forEach(p => $('ha-pgc-'+p).classList.add('done'));
  setStep(2, 100);
  addLog('3차원 감사 완료', 'ok');
  await sleep(400);

  // ========== STEP 3: 판정 ==========
  setStep(3);
  const counter = {};
  for (let i = 0; i < RESULT.items.length; i++) {
    if (stopped) return;
    const r = RESULT.items[i];
    r.judge = judge(r);
    counter[r.judge] = (counter[r.judge]||0) + 1;
    if (r.judge === 'OK') metrics.ok++;
    else if (r.judge.startsWith('FIX')) metrics.fix++;
    updateCur(r);
    updateM();
    setStep(3, (i+1)/RESULT.items.length * 100);
    if (r.judge === 'OK') addLog(`${r.rgr} → OK`, 'ok');
    else addLog(`${r.rgr} → ${r.judge} · ${r.name.slice(0,22)}`, 'warn');
    await sleep(80);
  }
  setStep(3, 100);
  addLog('판정 완료 · ' + JSON.stringify(counter), 'ok');
  await sleep(400);

  // ========== STEP 4: 리포트 (다운로드 버튼 활성화) ==========
  setStep(4);
  addLog('리포트 페이로드 준비', 'sys');
  const total = RESULT.items.length;
  const ok = metrics.ok, fix = metrics.fix;
  $('ha-done-msg').textContent = `총 ${total}개 중 OK ${ok}건 · FIX ${fix}건 (과태깅 ${metrics.over})`;
  $('ha-total-t').textContent = $('ha-elapsed').textContent;
  $('ha-done-area').classList.add('show');

  // ============ 매핑 테이블 ============
  const O1_MAP = {'01':'게시판','02':'안내판','04':'입간판','05':'현수막/배너','07':'구조물','08':'도로안전용품','09':'각종물품','10':'인쇄물/스티커','13':'개인결제','60':'기획전'};
  const T1_MAP = {'01':'학교/학원','02':'식당/카페','03':'아파트','04':'호텔/펜션','05':'병원/요양시설','06':'회사/공장','07':'공공기관','08':'헬스/레저','09':'기타업종','12':'개인결제창'};
  // O2 매핑 (1차-2차 조합)
  // v11.0.4: hs_full_tree.json 기준 실제 카테고리명으로 교체 (기존은 임의로 만든 이름)
  const O2_MAP = {
    // 01 게시판
    '01-01':'슬림디자인게시판','01-02':'안전강화유리게시판','01-03':'디자인게시판',
    '01-04':'크리스탈게시판','01-05':'아크릴게시판','01-06':'슬림자석게시판',
    '01-07':'우드게시판','01-08':'알미늄게시판','01-09':'갈바게시판',
    '01-10':'게시판구성품','01-11':'자석프레임','01-13':'포켓/월프레임',
    '01-14':'메모보드','01-15':'액자','01-16':'슬림업게시판','01-17':'슬림안전보건게시판',
    // 02 안내판
    '02-01':'금연/CCTV','02-02':'주의/금지','02-03':'이용수칙','02-04':'유도안내',
    '02-05':'매립표지판(말뚝)','02-06':'소방안전','02-07':'MSDS','02-08':'법령상품','02-09':'기타안내',
    // 04 입간판
    '04-01':'A형','04-02':'스텐','04-03':'오뚜기',
    // 05 현수막/배너
    '05-01':'명절','05-02':'불조심','05-03':'신년/연말','05-04':'주차','05-05':'유치원/학교','05-06':'배너',
    // 07 구조물
    '07-04':'구조물/간판',
    // 08 도로안전용품
    '08-01':'차선규제봉','08-02':'카스토퍼','08-03':'주차금지 오뚜기','08-04':'과속방지턱',
    '08-05':'코너보호대','08-06':'볼라드','08-07':'반사경','08-08':'표지병(쏠라)',
    '08-09':'바리게이트','08-10':'스텐입간판','08-11':'높이제한바','08-12':'자전거보관대',
    '08-13':'쐐기/셋트앙카','08-14':'쏠라교통표시등','08-15':'제설함','08-17':'장애인편의시설',
    '08-18':'차량진입판','08-19':'차단봉','08-20':'디자인휀스','08-21':'차선분리대',
    '08-22':'방호벽/충격흡수','08-23':'가림막휀스','08-24':'차량버팀목','08-25':'추락방지(U형)',
    '08-26':'전선보호대','08-27':'소화/수방 보관함','08-28':'표지판','08-29':'기타',
    // 09 각종물품
    '09-01':'명패/명찰','09-06':'매트','09-07':'기타물품','09-08':'쇼케이스','09-09':'사무실용품','09-10':'현판',
    // 10 인쇄물/스티커
    '10-02':'주차스티커','10-03':'경고장','10-04':'자전거스티커','10-05':'각종인쇄물','10-06':'안전스티커'
  };
  // O3 매핑 (hs_full_tree 기준)
  const O3_MAP = {
    // 02-05 매립표지판
    '02-05-001':'금연','02-05-002':'주의','02-05-003':'금지','02-05-004':'주차장',
    '02-05-005':'기타','02-05-006':'화단보호','02-05-007':'반려동물',
    // 02-06 소방안전
    '02-06-001':'피난대피층',
    // 02-07 MSDS
    '02-07-001':'주의표시','02-07-002':'안전/지시','02-07-003':'안내표시',
    '02-07-004':'위험표시','02-07-005':'이용수칙','02-07-006':'경고표시',
    // 04-01 A형
    '04-01-001':'청소중','04-01-002':'공사중','04-01-003':'수영장',
    '04-01-004':'식당/카페','04-01-005':'반려동물','04-01-007':'주의',
    '04-01-008':'금지','04-01-009':'주차장','04-01-010':'주유소/세차장',
    '04-01-011':'CCTV/금연','04-01-012':'학교','04-01-013':'기타',
    // 04-02 스텐
    '04-02-001':'H입간판','04-02-002':'놀이터수칙',
    // 09-09 사무실용품
    '09-09-001':'쇼클립','09-09-002':'스탠드형꽂이','09-09-003':'데스크형꽂이',
    '09-09-004':'스탠드사인','09-09-005':'데스크사인','09-09-006':'다용도케이스',
    '09-09-007':'응모함','09-09-008':'페그보','09-09-009':'보드',
    // 10-02 주차스티커 재질
    '10-02-001':'화이트시트','10-02-002':'사각홀로그램','10-02-003':'모래알홀로그램',
    '10-02-004':'민무늬홀로그램','10-02-005':'반사지','10-02-006':'야광',
    '10-02-007':'럭셔리실버','10-02-008':'럭셔리골드','10-02-009':'종이'
  };
  // v11.0.4: SPACE_MAP 완비 (기존은 6~8개 누락)
  const SPACE_MAP = {
    // 02 학교군
    '02-01':'학교(초/중/고)','02-02':'유치원/학원','02-03':'대학교/연구소','02-04':'도서관/문화시설',
    // 03 식당/서비스군
    '03-01':'식당/카페','03-02':'미용/뷰티/헬스','03-03':'스포츠시설',
    // 04 의료군
    '04-01':'병원/의료기관/약국','04-02':'동물병원/애견카페/펫샵',
    // 05 산업군
    '05-01':'공장/제조업','05-02':'물류/창고업','05-03':'자동차 관련',
    // 06 공공/복지군
    '06-01':'관공서','06-02':'공기업','06-03':'복지시설','06-04':'군/경시설',
    '06-05':'소방서','06-06':'사법기관','06-07':'공영주차장',
    // 07 전문서비스업 (v11.0.4: 07-05, 07-06 추가)
    '07-01':'소방업','07-02':'조경업','07-03':'보안업','07-04':'방역업',
    '07-05':'환경미화/청소업','07-06':'시설유지/보수업',
    // 08 유통/상업군 (v11.0.4: 08-05 추가)
    '08-01':'마트/유통업','08-02':'아울렛','08-03':'백화점',
    '08-04':'영화관/공연장/놀이공원','08-05':'서점/문고'
  };

  // 코드 → "코드 명칭" 형태 변환
  function labelO(code) {
    if (!code) return '';
    if (O3_MAP[code])  return `${code} ${O3_MAP[code]}`;
    if (O2_MAP[code])  return `${code} ${O2_MAP[code]}`;
    if (O1_MAP[code])  return `${code} ${O1_MAP[code]}`;
    return code;
  }
  function labelSpace(code) {
    return SPACE_MAP[code] ? `${code} ${SPACE_MAP[code]}` : code;
  }
  // v11.0.2: 라벨을 실제 판정 로직과 일치시킴 (기존 v10 라벨은 오해 유발)
  const JUDGE_KR = {
    'OK':        {s:'정상',         d:'3차원 모두 정상',                     f:'-',                            p:0},
    'FIX_T':     {s:'업종 부족',     d:'업종 연결 부족 (키워드 기준 누락)',    f:'키워드 매칭 업종 추가',         p:3},
    'FIX_O':     {s:'카테고리 부족',  d:'상품별 2/3차 부족 또는 1차 재분류 필요', f:'키워드 매칭 카테고리 교체',   p:2},
    'FIX_CB':    {s:'관심분야 미연결', d:'SelMemCat 공간 체크 없음',           f:'관심분야 공간 추가',            p:1},
    'FIX_MULTI': {s:'복합 문제',      d:'2개 이상 차원에 문제',                f:'개별 확인 후 수정',             p:4},
    'FIX_ALL':   {s:'전체 미설정',    d:'상품별+업종별+관심분야 모두 미설정',    f:'처음부터 재설정',               p:5},
  };

  // 각 item을 표시용 행으로 변환
  function toDisplayRow(r, i) {
    const j = JUDGE_KR[r.judge] || JUDGE_KR.OK;
    const oCodes = (r.o||'').split(',').filter(x=>x);
    // 상품별 1차 라벨
    const o1 = (oCodes[0]||'').split('-')[0];
    const productType = O1_MAP[o1] || '-';
    // 상품별 세부 (2차/3차) · 코드 + 명칭
    const oDetail = oCodes.slice(1).map(labelO).join(' · ') || '-';
    // 업종
    const tCodes = (r.t||'').split(',').filter(x=>x);
    const tLabels = tCodes.map(c => T1_MAP[c] || c).join(', ');
    const tCount = tCodes.length;
    // v11.0.5: 현재 체크된 공간 목록 (SelMemCat type=5) 이름으로 변환
    // t5_list 아이템 형식: '01-02-01' (pfx-sub) → slice(3) = '02-01'
    const t5Names = [];
    for (const code of (r.t5_list || [])) {
      const sp = (code || '').slice(3);  // '01-02-01' → '02-01'
      if (sp) t5Names.push(SPACE_MAP[sp] || sp);
    }
    const spaceLabels = t5Names.length ? t5Names.join(', ') : '(체크 없음)';
    return {
      idx: i+1,
      page: r.page,
      status: j.s,
      desc: j.d,
      name: r.name || '',
      rgr: r.rgr,
      productType,
      oDetail,
      tCount,
      tLabels: tLabels || '(미연결)',
      tCodes,  // v11.0.3: buildProposal 참조용 (원본 r.t 잃지 않게)
      oCodes,  // v11.0.3: 동일 이유
      spaceLabels,  // v11.0.5: 현재 체크된 공간 이름 목록
      spaceCount: t5Names.length,  // v11.0.5: 공간 체크 개수 (SelMemCat만)
      cc: r.cc || 0,
      ct: r.ct || 0,
      t5_cc: r.t5_cc || 0,  // v11.0.3: 과태깅 판정용
      over: ((r.t5_cc || 0) > 25) ? 'O' : '',  // v10.7.4: t5 기준
      judge: r.judge,
      fix: j.f,
      priority: j.p,
    };
  }

  // 정렬: 판정 우선순위 ↓, 페이지 ↑, 체크수 ↓
  const sorted = [...RESULT.items].map(toDisplayRow).sort((a,b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.page !== b.page) return a.page - b.page;
    return b.cc - a.cc;
  });
  // 정렬 후 idx 재부여
  sorted.forEach((r,i) => r.idx = i+1);

  const HEADERS = ['#','페이지','상태','상품명','RgrCode','상품종류','상품별 세부','업종수','연결 업종','체크수','과태깅','권장 조치'];
  function toRow(r) {
    return [r.idx, r.page, r.status, r.name, r.rgr, r.productType, r.oDetail, r.tCount, r.tLabels, r.cc, r.over, r.fix];
  }

  // ============ XLSX (스타일 지원: xlsx-js-style) ============
  async function loadSheetJS() {
    if (window.XLSX && window.XLSX.__hs_styled) return window.XLSX;
    addLog('xlsx-js-style 로딩 중 (색상 지원)...', 'sys');
    // 기존 XLSX 있어도 스타일 미지원이면 교체 시도
    if (window.XLSX && !window.XLSX.__hs_styled) { try { delete window.XLSX; } catch(_){} }
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    if (window.XLSX) window.XLSX.__hs_styled = true;
    return window.XLSX;
  }

  // v11.0.5: 가독성 개선 — 이모지·디버그 메시지·기술용어 제거, 평어체 한국어로
  function buildProposal(r) {
    const tCodes = r.tCodes || [];
    const tCurrent = tCodes.length ? tCodes.map(c=>T1_MAP[c]||c).join(', ') : '(미연결)';
    let oProp = '변경없음', tProp = '변경없음', cbProp = '변경없음';
    let reason = '';  // v11.0.5: 이유는 별도 컬럼으로
    const j = r.judge || 'OK';
    const hasT = ['FIX_T','FIX_ALL','FIX_MULTI'].includes(j);
    const hasO = ['FIX_O','FIX_ALL','FIX_MULTI'].includes(j);
    const hasCB = ['FIX_CB','FIX_ALL','FIX_MULTI'].includes(j);

    const orig = RESULT.items.find(x => x.rgr === r.rgr);
    const llmO3 = orig && orig.llm_o3;
    const llmReason = orig && orig.llm_reason;
    const memAdd = (orig && orig.llm_selMemCat_add) || [];
    const memRm  = (orig && orig.llm_selMemCat_remove) || [];
    const t2Add  = (orig && orig.llm_selOptCat2_add) || {};
    const t2Rm   = (orig && orig.llm_selOptCat2_remove) || {};
    const tAdd   = (orig && orig.llm_catT_add) || [];
    const tRm    = (orig && orig.llm_catT_remove) || [];
    const hasLLM = !!(orig && orig.llm_reason);
    const isRule = orig && orig.llm_source === 'rule';

    // 이유 텍스트 정제 (v11.0.5: 디버그 메시지 'v11 규칙(kw:...)' 제거)
    if (llmReason) {
      let cleaned = llmReason;
      // "v11 규칙(kw:... · 업종:... · 공간 ...개 add)" 형태는 숨김
      if (/^v11 규칙\(/.test(cleaned)) {
        cleaned = '키워드 매칭 자동 판정';
      } else {
        // LLM 이유 중 앞 100자만
        cleaned = cleaned.slice(0, 100).replace(/\n/g, ' ');
        if (llmReason.length > 100) cleaned += '...';
      }
      reason = cleaned;
    }

    // === catT 업종 제안 ===
    if (hasLLM && (tAdd.length || tRm.length)) {
      const parts = [];
      if (tAdd.length) parts.push('추가 ' + tAdd.map(c=>T1_MAP[c]||c).join(', '));
      if (tRm.length)  parts.push('해제 ' + tRm.map(c=>T1_MAP[c]||c).join(', '));
      tProp = parts.join(' / ');
    } else if (hasT) {
      const allT = ['01','02','03','04','05','06','07','08','09'];
      const missing = allT.filter(c => !tCodes.includes(c));
      if (missing.length === 9) tProp = '9업종 모두 연결 필요';
      else if (missing.length) tProp = `${missing.length}개 추가: ` + missing.map(c=>T1_MAP[c]).join(', ');
      else tProp = '변경없음';
    }

    // === catO 상품별 제안 ===
    if (llmO3) {
      oProp = labelO(llmO3);  // 예: "02-04 유도안내"
    } else if (hasO) {
      const m = (r.reason||'').match(/O3:(\d{2}-\d{2}-\d{3})/);
      oProp = m ? labelO(m[1]) : '(LLM 판정 필요)';
    }

    // === 관심분야 공간 제안 ===
    const cbLines = [];
    if (memAdd.length) {
      // 상위 5개 공간 이름으로 표시
      const names = memAdd.slice(0, 5).map(c => (SPACE_MAP[c] || c));
      const more = memAdd.length > 5 ? ` 외 ${memAdd.length-5}개` : '';
      cbLines.push(`공간 ${memAdd.length}개 추가: ${names.join(', ')}${more}`);
    }
    if (memRm.length) {
      const names = memRm.slice(0, 5).map(c => (SPACE_MAP[c] || c));
      const more = memRm.length > 5 ? ` 외 ${memRm.length-5}개` : '';
      cbLines.push(`공간 ${memRm.length}개 해제: ${names.join(', ')}${more}`);
    }
    const t2AddCnt = Object.values(t2Add).reduce((a,b)=>a+(b||[]).length, 0);
    const t2RmCnt  = Object.values(t2Rm).reduce((a,b)=>a+(b||[]).length, 0);
    if (t2AddCnt) cbLines.push(`업종×공간 ${t2AddCnt}개 추가`);
    if (t2RmCnt)  cbLines.push(`업종×공간 ${t2RmCnt}개 해제`);

    if (cbLines.length) {
      cbProp = cbLines.join('\n');
    } else if (hasLLM) {
      cbProp = '변경없음';
    } else if (hasCB) {
      cbProp = `LLM 판정 필요`;
    }

    return {oProp, tProp, cbProp, tCurrent, reason, isRule};
  }

  // 스타일 헬퍼 (v11.0.2: 새 라벨에 맞게 스타일 매핑 갱신)
  const STATUS_STYLE = {
    '정상':            {fill:'C6EFCE', font:'006100'},
    '업종 부족':        {fill:'FFC7CE', font:'9C0006'},
    '카테고리 부족':    {fill:'FFD580', font:'9C5700'},
    '관심분야 미연결':  {fill:'FFEB9C', font:'9C5700'},
    '복합 문제':        {fill:'F8CBAD', font:'9C0006'},
    '전체 미설정':      {fill:'F8CBAD', font:'9C0006'},
    // 하위호환 (옛 라벨 잔존 대비)
    '업종 미연결':      {fill:'FFC7CE', font:'9C0006'},
    '카테고리 오류':    {fill:'FFD580', font:'9C5700'},
    '과태깅':          {fill:'FFEB9C', font:'9C5700'},
  };
  function styleCell(text, opts){
    const s = {
      font: {name:'맑은 고딕', sz: opts && opts.fontSize || 11, bold: !!(opts&&opts.bold), color: opts && opts.fontColor ? {rgb: opts.fontColor} : undefined},
      alignment: {vertical:'center', horizontal: opts && opts.align || 'left', wrapText: !!(opts&&opts.wrap)},
      border: {
        top:    {style:'thin', color:{rgb:'D0D0D0'}},
        bottom: {style:'thin', color:{rgb:'D0D0D0'}},
        left:   {style:'thin', color:{rgb:'D0D0D0'}},
        right:  {style:'thin', color:{rgb:'D0D0D0'}},
      },
    };
    if (opts && opts.fill) s.fill = {patternType:'solid', fgColor:{rgb: opts.fill}};
    return {v: text == null ? '' : text, t: typeof text === 'number' ? 'n' : 's', s};
  }
  const HEAD_STYLE = {fill:'305496', fontColor:'FFFFFF', bold:true, align:'center'};
  const CURR_STYLE_OK  = {fill:'F2F2F2'};                                 // 변경 없음(회색)
  const CURR_STYLE_BAD = {fill:'FBE5D6', fontColor:'9C0006'};              // 현재 문제 있음(연살구)
  const PROP_STYLE_FIX = {fill:'E2EFDA', fontColor:'006100', bold:true};   // 제안(연녹)
  const PROP_STYLE_NONE= {fill:'F2F2F2', fontColor:'808080'};              // 제안 없음(회색)

  $('ha-dl-xlsx').onclick = async () => {
    try {
      const XLSX = await loadSheetJS();
      const wb = XLSX.utils.book_new();

      // v11.0.5: 가독성 개선 — "판정" 열 제거(상태와 중복), "현재 공간" 열 추가, "변경 이유" 열 추가
      const H = [
        '#', '페이지', '상태', '상품명', 'RgrCode',
        '현재 상품별(O)', '제안 상품별 변경',
        '현재 업종수', '현재 연결 업종', '제안 업종 변경',
        '현재 공간수', '현재 체크된 공간', '공간 변경 제안',
        '변경 이유', '권장 조치',
      ];
      const colW = [{wch:4},{wch:6},{wch:14},{wch:40},{wch:20},
                    {wch:28},{wch:28},
                    {wch:8},{wch:30},{wch:30},
                    {wch:8},{wch:40},{wch:40},
                    {wch:40},{wch:22}];

      function buildAOA(items) {
        // 헤더 행
        const headerRow = H.map(h => styleCell(h, HEAD_STYLE));
        const rows = [headerRow];
        for (const r of items) {
          const stStyle = STATUS_STYLE[r.status] || {};
          const prop = buildProposal(r);
          const isFix = r.judge && r.judge !== 'OK';
          const hasChange = prop.oProp !== '변경없음' || prop.tProp !== '변경없음' || prop.cbProp !== '변경없음';

          // v11.0.5: 판정 열 제거. 상태 열만 (한글 라벨)
          const c_status = styleCell(r.status, {fill: stStyle.fill, fontColor: stStyle.font, bold:true, align:'center', wrap:true});
          const c_idx    = styleCell(r.idx,    {align:'center'});
          const c_page   = styleCell(r.page,   {align:'center'});
          const c_name   = styleCell(r.name,   {wrap:true});
          const c_rgr    = styleCell(r.rgr,    {font:'Consolas', align:'center'});

          // 상품별(O)
          const c_oCurr  = styleCell(r.oDetail || (r.productType||'-'),
                                     (prop.oProp!=='변경없음') ? CURR_STYLE_BAD : CURR_STYLE_OK);
          const c_oProp  = styleCell(prop.oProp, prop.oProp==='변경없음' ? PROP_STYLE_NONE : PROP_STYLE_FIX);

          // 업종 (T)
          const c_tCount = styleCell(r.tCount,
                                     (prop.tProp!=='변경없음') ? CURR_STYLE_BAD : CURR_STYLE_OK);
          const c_tCurr  = styleCell(prop.tCurrent, {wrap:true, ...((prop.tProp!=='변경없음') ? CURR_STYLE_BAD : CURR_STYLE_OK)});
          const c_tProp  = styleCell(prop.tProp, prop.tProp==='변경없음' ? PROP_STYLE_NONE : PROP_STYLE_FIX);

          // 공간 (SelMemCat)
          const c_spCount = styleCell(r.spaceCount, {align:'center'});
          const c_spCurr  = styleCell(r.spaceLabels, {wrap:true});  // v11.0.5: 모든 상품에 표시
          const c_cbProp  = styleCell(prop.cbProp, prop.cbProp==='변경없음' ? PROP_STYLE_NONE : PROP_STYLE_FIX);

          // 이유 (v11.0.5: 별도 컬럼)
          const c_reason  = styleCell(prop.reason || '-', {wrap:true, fontSize:10, fontColor:'666666'});

          // 권장 조치
          const c_fix = styleCell(r.fix, isFix ? {fill:'FEF3C7', fontColor:'92400E', bold:true} : PROP_STYLE_NONE);

          rows.push([c_idx, c_page, c_status, c_name, c_rgr,
                     c_oCurr, c_oProp,
                     c_tCount, c_tCurr, c_tProp,
                     c_spCount, c_spCurr, c_cbProp,
                     c_reason, c_fix]);
        }
        return rows;
      }

      function makeSheet(items, withAutofilter) {
        const aoa = buildAOA(items);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = colW;
        ws['!rows'] = [{hpt:24}].concat(items.map(()=>({hpt:32})));
        if (withAutofilter) ws['!autofilter'] = {ref: `A1:${String.fromCharCode(64+H.length)}${items.length+1}`};
        return ws;
      }

      // 시트1: 전체
      const ws1 = makeSheet(sorted, true);
      XLSX.utils.book_append_sheet(wb, ws1, '전체감사결과');

      // 시트2: 수정필요
      const fixItems = sorted.filter(r => r.judge && r.judge !== 'OK');
      if (fixItems.length > 0) {
        const ws2 = makeSheet(fixItems, true);
        XLSX.utils.book_append_sheet(wb, ws2, `수정필요_${fixItems.length}건`);
      }

      // 시트3: 요약
      const byJudge = {};
      for (const r of sorted) byJudge[r.status] = (byJudge[r.status]||0)+1;
      const total = sorted.length;
      const sumHeader = ['판정','건수','비율'].map(h => styleCell(h, HEAD_STYLE));
      const sumRows = [sumHeader];
      Object.entries(byJudge).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
        const st = STATUS_STYLE[k] || {};
        sumRows.push([
          styleCell(k, {fill:st.fill, fontColor:st.font, bold:true}),
          styleCell(v, {align:'right'}),
          styleCell(((v/total)*100).toFixed(1)+'%', {align:'right'}),
        ]);
      });
      sumRows.push([
        styleCell('합계', {bold:true, fill:'E7E6E6'}),
        styleCell(total, {bold:true, align:'right', fill:'E7E6E6'}),
        styleCell('100%', {bold:true, align:'right', fill:'E7E6E6'}),
      ]);
      const ws3 = XLSX.utils.aoa_to_sheet(sumRows);
      ws3['!cols'] = [{wch:24},{wch:10},{wch:12}];
      XLSX.utils.book_append_sheet(wb, ws3, '요약');

      const cat = CFG.cat || '04';
      const catName = O1_MAP[cat] || cat;
      const fname = `${catName}_감사리포트_${startStr.replace(/:/g,'')}.xlsx`;
      XLSX.writeFile(wb, fname);
      addLog(`Excel 다운로드: ${fname}`, 'ok');
    } catch(e) {
      addLog('XLSX 실패: ' + e.message + ' (CSV 써주세요)', 'err');
    }
  };

  // ============ CSV (한글 라벨 버전) ============
  $('ha-dl-csv').onclick = () => {
    const rows = [HEADERS];
    for (const r of sorted) rows.push(toRow(r));
    const csv = '\ufeff' + rows.map(r => r.map(v => {
      const s = String(v==null?'':v);
      return /[,"\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const cat = CFG.cat || '04';
    const catName = O1_MAP[cat] || cat;
    a.download = `${catName}_감사리포트_${startStr.replace(/:/g,'')}.csv`;
    a.click();
    addLog('CSV 다운로드 시작', 'ok');
  };

  // ============ JSON (원본 데이터) ============
  $('ha-dl-json').onclick = () => {
    const blob = new Blob([JSON.stringify(RESULT, null, 2)], {type:'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `감사원본_${CFG.cat}_${startStr.replace(/:/g,'')}.json`;
    a.click();
    addLog('JSON 다운로드 시작', 'ok');
  };

  // ============ JSON 복사 ============
  $('ha-copy-json').onclick = async () => {
    await navigator.clipboard.writeText(JSON.stringify(RESULT));
    addLog('JSON 클립보드에 복사됨', 'ok');
  };

  // ============ LLM 판정 (Claude Haiku) v10 ============
  function getApiKey() {
    return sessionStorage.getItem('hs_anthropic_key') || localStorage.getItem('hs_anthropic_key') || '';
  }

  // v10: 매트릭스 런타임 자동 수집 (9업종 연결된 샘플 상품에서 SelOptCat2 + SelMemCat 전체 덤프)
  let HS_MATRIX = null;
  async function buildRuntimeMatrix() {
    if (HS_MATRIX) return HS_MATRIX;
    let sampleRgr = '260223171857_3033';
    // 현 RESULT에서 9업종 연결된 상품 우선 탐색 (없으면 기본)
    if (RESULT.items && RESULT.items.length > 0) {
      const nine = RESULT.items.find(it => (it.t||'').split(',').filter(x=>x).length === 9);
      if (nine) sampleRgr = nine.rgr;
    }
    try {
      const res = await fetch(`/AdminManager/MakeGoodsTypeOneDp.php?RgrCode=${sampleRgr}&EditMode=1`, {credentials:'include'});
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const m2 = {}, m5 = {};
      // 주의: value 형식은 "pfx`type`sub`label" 이고 label 뒤에 종결 백틱 없음
      doc.querySelectorAll('input[type="checkbox"]').forEach(x => {
        const m = (x.value||'').match(/^(\d{2})`(\d)`(\d{2}-\d{2})`(.*)$/);
        if (!m) return;
        const pfx = m[1], typ = m[2], sub = m[3], label = (m[4]||'').trim();
        if (typ === '2') {
          if (!m2[pfx]) m2[pfx] = {};
          m2[pfx][sub] = label;
        } else if (typ === '5') {
          if (!m5[pfx]) m5[pfx] = {};
          m5[pfx][sub] = label;
        }
      });
      HS_MATRIX = {SelOptCat2: m2, SelMemCat: m5, source_rgr: sampleRgr};
      addLog(`🧩 매트릭스 수집 완료 · 업종 ${Object.keys(m2).length}개 · 공간그룹 ${Object.keys(m5).length}개 · 샘플 ${sampleRgr}`, 'sys');
      return HS_MATRIX;
    } catch(e) {
      addLog('매트릭스 수집 실패: ' + e.message, 'err');
      return null;
    }
  }

  // v10: LLM 응답의 selOptCat2 키를 "업종01" / "01" 혼재 → "01"로 정규화
  function normalizeT2Keys(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const out = {};
    for (const k in obj) {
      const m = k.match(/(\d{2})$/);
      const clean = m ? m[1] : k;
      out[clean] = obj[k];
    }
    return out;
  }

  const LLM_SYSTEM = `당신은 하나사인몰 어드민 카테고리 정리 도우미입니다.
상품의 **현재 1차 카테고리**(catO1)를 최우선 존중하여, 해당 카테고리 안에서 가장 적합한 '2차 또는 3차 코드' 하나와 '체크할 관심분야 공간 코드 목록'을 JSON으로 반환하세요.

[★ 최우선 규칙]
- 입력의 현재 O에서 **맨 앞 1차 코드**(예: "01", "02", "04", "08")를 먼저 확인
- 그 1차 하위의 2/3차 코드만 제안 (다른 카테고리 코드 절대 금지)
- 이미 적합한 2/3차가 등록돼 있으면 o3="" (빈 문자열) + reason="변경 불필요" 반환
- 확신 없으면 o3="" 로 두고 공간 체크만 제안

[1차 카테고리별 하위 코드 전수 - 이 안에서만 제안]

═══════ 01 게시판 (2차만 있음) ═══════
01-01 슬림디자인게시판 · 01-02 안전강화유리게시판 · 01-03 디자인게시판
01-04 크리스탈게시판 · 01-05 아크릴게시판 · 01-06 슬림자석게시판
01-07 우드게시판 · 01-08 알미늄게시판 · 01-09 갈바게시판
01-10 게시판구성품 · 01-11 자석프레임 · 01-13 포켓/월프레임
01-14 메모보드 · 01-15 액자 · 01-16 슬림업게시판 · 01-17 슬림안전보건게시판

═══════ 02 안내판 ═══════
2차: 02-01 금연/CCTV · 02-02 주의/금지 · 02-03 이용수칙 · 02-04 유도안내
     02-05 매립표지판(말뚝) · 02-06 소방안전 · 02-07 MSDS · 02-08 법령상품 · 02-09 기타안내
02-05 하위 3차: 02-05-001 금연 · 02-05-002 주의 · 02-05-003 금지 · 02-05-004 주차장 · 02-05-005 기타 · 02-05-006 화단보호 · 02-05-007 반려동물
02-06 하위 3차: 02-06-001 피난대피층
02-07 하위 3차(MSDS): 02-07-001 주의표시 · 02-07-002 안전/지시 · 02-07-003 안내표시 · 02-07-004 위험표시 · 02-07-005 이용수칙 · 02-07-006 경고표시

═══════ 04 입간판 ═══════
2차: 04-01 A형 · 04-02 스텐 · 04-03 오뚜기
04-01 하위 3차(A형): 04-01-001 청소중 · 04-01-002 공사중 · 04-01-003 수영장 · 04-01-004 식당/카페 · 04-01-005 반려동물 · 04-01-007 주의 · 04-01-008 금지 · 04-01-009 주차장 · 04-01-010 주유소/세차장 · 04-01-011 CCTV/금연 · 04-01-012 학교 · 04-01-013 기타
04-02 하위 3차(스텐): 04-02-001 H입간판 · 04-02-002 놀이터수칙

═══════ 05 현수막/배너 (2차만) ═══════
05-01 명절 · 05-02 불조심 · 05-03 신년/연말 · 05-04 주차 · 05-05 유치원/학교 · 05-06 배너

═══════ 07 구조물 (2차만) ═══════
07-04 구조물/간판

═══════ 08 도로안전용품 (2차만, 28개) ═══════
08-01 차선규제봉 · 08-02 카스토퍼 · 08-03 주차금지 오뚜기 · 08-04 과속방지턱 · 08-05 코너보호대 · 08-06 볼라드 · 08-07 반사경 · 08-08 표지병(쏠라) · 08-09 바리게이트 · 08-10 스텐입간판 · 08-11 높이제한바 · 08-12 자전거보관대 · 08-13 쐐기/셋트앙카 · 08-14 쏠라교통표시등 · 08-15 제설함 · 08-17 장애인편의시설 · 08-18 차량진입판 · 08-19 차단봉 · 08-20 디자인휀스 · 08-21 차선분리대 · 08-22 방호벽/충격흡수 · 08-23 가림막휀스 · 08-24 차량버팀목 · 08-25 추락방지(U형) · 08-26 전선보호대 · 08-27 소화/수방 보관함 · 08-28 표지판 · 08-29 기타

═══════ 09 각종물품 ═══════
2차: 09-01 명패/명찰 · 09-06 매트 · 09-07 기타물품 · 09-08 쇼케이스 · 09-09 사무실용품 · 09-10 현판
09-09 하위 3차(사무실용품): 09-09-001 쇼클립 · 09-09-002 스탠드형꽂이 · 09-09-003 데스크형꽂이 · 09-09-004 스탠드사인 · 09-09-005 데스크사인 · 09-09-006 다용도케이스 · 09-09-007 응모함 · 09-09-008 페그보 · 09-09-009 보드

═══════ 10 인쇄물/스티커 ═══════
2차: 10-02 주차스티커 · 10-03 경고장 · 10-04 자전거스티커 · 10-05 각종인쇄물 · 10-06 안전스티커
10-02 하위 3차(주차스티커): 10-02-001 화이트시트 · 10-02-002 사각홀로그램 · 10-02-003 모래알홀로그램 · 10-02-004 민무늬홀로그램 · 10-02-005 반사지 · 10-02-006 야광 · 10-02-007 럭셔리실버 · 10-02-008 럭셔리골드 · 10-02-009 종이

═══════ 13 개인결제 · 60 기획전 (하위 없음) ═══════

[업종 카테고리 (catT, 10개)]
01 학교/학원 · 02 식당/카페 · 03 아파트 · 04 호텔/펜션 · 05 병원/요양시설 · 06 회사/공장 · 07 공공기관 · 08 헬스/레저 · 09 기타업종 · 12 개인결제창

[관심분야 공간 체크박스 (30개, 7개 그룹) - 체크박스 value에서 type=5만 해당]
02 학교군: 02-01 학교(초/중/고) · 02-02 유치원/학원 · 02-03 대학교/연구소 · 02-04 도서관/문화시설
03 식당/서비스군: 03-01 식당/카페 · 03-02 미용/뷰티/헬스 · 03-03 스포츠시설
04 의료군: 04-01 병원/의료기관/약국 · 04-02 동물병원/애견카페/펫샵
05 산업군: 05-01 공장/제조업 · 05-02 물류/창고업 · 05-03 자동차 관련
06 공공/복지군: 06-01 관공서 · 06-02 공기업 · 06-03 복지시설 · 06-04 군/경시설 · 06-05 소방서 · 06-06 사법기관 · 06-07 공영주차장
07 전문서비스업: 07-01 소방업 · 07-02 조경업 · 07-03 보안업 · 07-04 방역업 · 07-05 환경미화/청소업 · 07-06 시설유지/보수업
08 유통/상업군: 08-01 마트/유통업 · 08-02 아울렛 · 08-03 백화점 · 08-04 영화관/공연장/놀이공원 · 08-05 서점/문고

[상품명 → 카테고리 예시]
- "월프레임/포켓" + 1차=01 → o3="01-13" (이미 등록이면 변경불필요)
- "액자" + 1차=01 → o3="01-15"
- "자석 프레임" + 1차=01 → o3="01-11"
- "A형 입간판 주차" + 1차=04 → o3="04-01-009"
- "A형 입간판 CCTV/금연" + 1차=04 → o3="04-01-011"
- "소방/피난" + 1차=02 → o3="02-06-001"
- "MSDS 경고표시" + 1차=02 → o3="02-07-006"
- "주차스티커 야광" + 1차=10 → o3="10-02-006"
- "사무실 보드/데스크사인" + 1차=09 → o3="09-09-009" or "09-09-005"
- "차선규제봉" + 1차=08 → o3="08-01"
- "볼라드" + 1차=08 → o3="08-06"

[상품명 → 공간 추천 예시]
- "주차/요일제/오뚜기/주차금지" → 06-07(공영주차장) + 05-03(자동차 관련) + 업종별 주차장
- "CCTV/금연/촬영" → 전업종 범용 2~4개
- "학교/학원/초등/교실" → 02-01, 02-02, 02-03
- "식당/카페/테이크아웃/선불" → 03-01
- "부동산/분묘/공통" → 06-01, 07-06, 09 범용
- "안전작업/지게차/공사" → 05-01, 05-02, 07-06
- "소방/피난" → 06-05(소방서), 07-01(소방업)
- "호텔/숙박" → 08-01, 08-03

[공간 추천 갯수] 2~6개 적정. 너무 많으면 과태깅.

[출력 형식]
JSON 배열만. 다른 텍스트·마크다운 금지. o3가 빈 문자열("")이면 "변경 불필요" 의미.
[
  {"rgr":"240104151418_8287","o3":"04-01-009","spaces":["05-03","06-07","02-01"],"reason":"차량 요일제 주차"},
  {"rgr":"240207143943_4777","o3":"","spaces":["08-01","08-03","03-01"],"reason":"월프레임 이미 01-13 등록"}
]`;

  // ============ v10 시스템 프롬프트 (4축 통합 + 매트릭스) ============
  // ============ v10.7 LLM 시스템 프롬프트 (add/remove 원칙) ============
  // 핵심 원칙: 현재 상태 최대한 존중. "뒤엎기" 금지.
  //           - 상품 성격에 명백히 안 맞는 것만 remove
  //           - 상품 성격상 꼭 필요한데 빠진 것만 add
  //           - 나머지는 건드리지 말 것
  const LLM_SYSTEM_V10 = `당신은 하나사인몰 상품 카테고리 4축 "정리 도우미"입니다.
★★ 중요: 당신의 역할은 "현재 상태를 뒤엎는 것"이 아니라 "손 댈 곳만 손 대는" 것입니다.
★★ 현재 체크된 대부분은 그대로 둡니다. 명백히 잘못된 것만 remove, 명백히 빠진 것만 add.

[출력 방식 - add / remove 구조]
★ 각 축에 대해 3가지만 판단:
  - add: 현재 없는데 상품 성격상 추가해야 하는 코드
  - remove: 현재 있는데 상품 성격에 명백히 안 맞는 코드
  - 애매하거나 유지할 것은 언급하지 말 것 (기본이 "현재 유지")

[catO 2차 코드 (이 안에서만 제안)]
01 게시판: 01-01 슬림디자인 · 01-02 안전강화유리 · 01-03 디자인 · 01-04 크리스탈
  · 01-05 아크릴 · 01-06 슬림자석 · 01-07 우드 · 01-08 알미늄 · 01-09 갈바
  · 01-10 게시판구성품 · 01-11 자석프레임 · 01-13 포켓/월프레임 · 01-14 메모보드
  · 01-15 액자 · 01-16 슬림업 · 01-17 슬림안전보건
02 안내판: 02-01 금연/CCTV · 02-02 주의/금지 · 02-03 이용수칙 · 02-04 유도안내
  · 02-05 매립표지판 · 02-06 소방안전 · 02-07 MSDS · 02-08 법령상품 · 02-09 기타안내
04 입간판: 04-01 A형 · 04-02 스텐 · 04-03 오뚜기
  04-01 3차: 001 청소중 / 002 공사중 / 004 식당/카페 / 007 주의 / 008 금지 / 009 주차
          / 011 CCTV/금연 / 012 학교 / 013 기타
05 현수막/배너: 05-01~05-06
08 도로안전용품: 08-01~08-29
09 각종물품: 09-01 명패 · 09-06 매트 · 09-07 기타 · 09-08 쇼케이스 · 09-09 사무실용품 · 09-10 현판
10 인쇄물/스티커: 10-02 주차스티커 · 10-03 경고장 · 10-04 자전거스티커 · 10-05 각종인쇄물 · 10-06 안전스티커

[상품명 키워드 → catO 매핑]
- "아크릴 게시판" → 01-05
- "슬림자석게시판" → 01-06  · "슬림안전보건/산업안전보건" → 01-17
- "개폐식 액자" / "액자 프레임" → 01-15 · "월프레임" / "포켓" → 01-13
- "자석프레임" → 01-11 · "메모보드" → 01-14
- "A형 입간판 주차" → 04-01-009 · "A형 CCTV/금연" → 04-01-011
- "주차스티커" → 10-02

[catT 업종 (9개)]
01 학교/학원 · 02 식당/카페 · 03 아파트 · 04 호텔/펜션 · 05 병원/요양/약국
· 06 회사/공장 · 07 공공기관 · 08 헬스/레저 · 09 기타업종

[catT 원칙]
- 현재 연결된 업종은 대부분 유지 (명백히 안 맞는 것만 remove)
- 주요 업종 중 빠진 것만 add (필수 업종이 빠졌을 때)

[SelMemCat / SelOptCat2 — ★ 상태별 행동 규칙 ★]

★ 규칙 1: 현재 SelMemCat이 "0개"이거나 3개 이하로 빈 상태
  → ★★ 반드시 상품 성격에 맞는 공간 5~15개를 add에 포함 ★★
  → "검색 필터 미노출" 상태 방치 금지
  → 예: 주정차 금지 현수막이 t5=0이면
       add에 최소 02-01(학교), 03-01(식당), 04-01(병원), 06-01(관공서), 06-07(공영주차장) 등 포함

★ 규칙 2: 현재 SelMemCat이 4~25개 (정상 범위)
  → 기본 유지. 명백히 상품 성격과 상충하는 것만 remove
  → 빠진 핵심 그룹만 add (2~3개 정도)

★ 규칙 3: 현재 SelMemCat이 26개 이상 (과다 의심)
  → 상품 성격과 명백히 안 맞는 것을 remove 대상
  → 무리하게 다 지우지 말고 핵심만

★ SelOptCat2 (업종×공간)도 동일 원칙 적용
  - 업종당 0~2개면 add 적극적으로 (3~8개 되도록)
  - 업종당 3~15개면 유지 + 부적합만 remove
  - 업종당 20+ 과다 의심

[절대 금지]
- 빈 상태(t5=0)를 "현재 상태 적절"이라고 판단 금지 → 반드시 add 수행
- "전체 해제 후 새로 체크" 사고방식 금지
- 현재 체크 중 90% 이상 remove 금지 (명백한 과태깅 아니면)

[REMOVE 판단 예시]
- 약국용 상품인데 헬스장/골프연습장 체크 → remove
- 주정차 금지 현수막인데 학교 급식실 체크 → remove
- "이 상품이 왜 저기 있어?" 수준일 때만 remove

[출력 JSON 배열 only. 마크다운·텍스트 금지]
[
  {
    "rgr":"주정차_금지_현수막_예시",
    "catO":{"o1":"05","o2":"05-04","o3":""},
    "catT_add":[],
    "catT_remove":[],
    "_note":"t5=0 → 규칙 1 적용: 5~15개 add 필수",
    "selMemCat_add":["02-01","03-01","04-01","05-03","06-01","06-07","07-06","08-01"],
    "selMemCat_remove":[],
    "selOptCat2_add":{},
    "selOptCat2_remove":{},
    "reason":"주정차 금지 현수막: t5=0 빈상태이므로 모든 업종군 주요 공간 추가. 범용 금지 사인."
  }
]

[출력 엄수]
- 배열 키 이름: catT_add, catT_remove, selMemCat_add, selMemCat_remove, selOptCat2_add, selOptCat2_remove
- selOptCat2_* 의 키는 반드시 2자리 "01"~"09"
- add/remove가 없으면 빈 배열 [] 또는 빈 객체 {}
- o3 가 불명이면 빈 문자열
`;

  // v10 userPrompt: 매트릭스 + 현재 상태 덤프
  function buildUserPromptV10(batch, matrix) {
    const t2M = matrix?.SelOptCat2 || {};
    const t5M = matrix?.SelMemCat || {};
    const t5Dump = Object.entries(t5M).map(([pfx,obj])=>
      `[${pfx}군] ${Object.entries(obj).map(([k,v])=>`${k}:${v}`).join(' / ')}`
    ).join('\n');
    const t2Dump = Object.entries(t2M).map(([pfx,obj])=>
      `[업종${pfx}] ${Object.entries(obj).map(([k,v])=>`${k}:${v}`).join(' / ')}`
    ).join('\n');

    const lines = batch.map((r,i) => {
      const t2Cur = Object.entries(r.t2_by_industry||{}).map(([pfx,arr])=>{
        const mm = t2M[pfx] || {};
        return `  업종${pfx}(${arr.length}): ${arr.map(s=>`${s}`).join(',')}`;
      }).join('\n');
      // v10.7.2: 상태 플래그 명시
      const t5 = r.t5_cc || 0;
      const flag = t5 === 0 ? ' ★★ 빈상태-규칙1적용(5~15개 add 필수) ★★'
                  : t5 <= 3 ? ' ★ 부족상태-add 필요 ★'
                  : t5 > 25 ? ' ⚠️ 과다의심-remove 검토 ⚠️'
                  : ' (정상범위-유지)';
      return `${i+1}. rgr=${r.rgr}
  상품명: ${r.name}
  catO: ${r.o||'(없음)'}
  catT: ${r.t||'(없음)'}
  SelMemCat(${t5}): ${(r.t5_list||[]).join(',') || '(없음)'}${flag}
  SelOptCat2(${r.t2_cc||0}):
${t2Cur || '  (업종 미연결)'}`;
    }).join('\n\n---\n\n');

    return `=== 매트릭스 (이 키만 사용, 환각 금지) ===
SelMemCat:
${t5Dump}

SelOptCat2 (각 업종의 공간 화이트리스트):
${t2Dump}

=== 판정 대상 ${batch.length}건 ===
${lines}

=== 지시 ===
각 상품에 대해 4축 전체 판정. JSON 배열만 출력.`;
  }

  function buildUserPrompt(batch){
    const lines = batch.map((r,i) => {
      const oList = (r.o||'').split(',').filter(x=>x);
      const cat1 = (oList[0]||'').split('-')[0];
      const cat1Name = O1_MAP[cat1] || '(미등록)';
      // v9: t5/t2 분리 정보 전달 (과태깅 판단용)
      const t5 = r.t5_cc ?? 0;
      const t2Total = r.t2_cc ?? 0;
      const t2Summary = r.t2_by_industry ? Object.entries(r.t2_by_industry).map(([k,v])=>`${k}:${(v||[]).length}`).join('/') : '';
      const flags = [];
      if (t5 === 0) flags.push('관심분야미연결');
      else if (t5 > 25) flags.push('관심분야과태깅');
      if (t2Summary) {
        const overInd = Object.entries(r.t2_by_industry).filter(([k,v])=>(v||[]).length > 30).map(([k])=>k);
        if (overInd.length) flags.push('업종'+overInd.join(',')+'공간과다');
      }
      return `${i+1}. [${r.rgr}] ${r.name}
   1차: ${cat1} ${cat1Name} · O: ${r.o||'(없음)'} · T: ${r.t||'미연결'}
   SelMemCat=${t5} · SelOptCat2=${t2Total}${t2Summary?' ('+t2Summary+')':''}${flags.length?' · ⚠'+flags.join(','):''}`;
    });
    return `각 상품의 현재 1차를 존중하며 적합한 o3와 SelMemCat 공간을 제안.
관심분야(SelMemCat)가 "미연결" 또는 "과태깅"이면 상품명에 맞는 2~6개 공간 코드를 spaces에 반드시 포함.
업종별 공간 과다는 현재 v9에서 정리 대상이 아니니 spaces에는 관심분야 코드(type=5)만 넣을 것.

${lines.join('\n')}`;
  }

  // v10.3: 429(rate limit) 감지 시 Retry-After 헤더 또는 30초 대기 후 재시도 (최대 3회)
  async function callClaude(apiKey, userPrompt, systemPrompt, maxTokens){
    const body = JSON.stringify({
      model:'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 2048,
      system: systemPrompt || LLM_SYSTEM,
      messages: [{role:'user', content: userPrompt}],
    });
    const headers = {
      'content-type':'application/json',
      'x-api-key': apiKey,
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true',
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers, body});
      if (res.ok) {
        const j = await res.json();
        return j.content[0].text;
      }
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '30');
        const waitSec = Math.min(retryAfter, 60);
        addLog(`⏳ Rate limit(429) · ${waitSec}초 대기 후 재시도 (시도 ${attempt}/3)`, 'warn');
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0,200));
    }
    throw new Error('429 재시도 3회 실패');
  }

  function extractJSON(text){
    // 본문에서 JSON 배열 추출
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('JSON 배열 못 찾음: ' + text.slice(0, 100));
    return JSON.parse(m[0]);
  }

  async function runLLMJudgeAll() {
    const apiKey = getApiKey();
    if (!apiKey) {
      alert('Claude API 키가 없습니다. sessionStorage.setItem("hs_anthropic_key", "sk-ant-...")로 저장하세요.');
      return;
    }
    // FIX 판정 상품 대상 (OK는 스킵)
    // v10.2: 기본은 OK 상품까지 포함 (내용 검증 목적). 기존 동작 원하면 HS_AUDIT_CONFIG.llm_fix_only = true
    const fixOnly = (CFG && CFG.llm_fix_only === true);
    const allTargets = fixOnly
      ? RESULT.items.filter(it => it.judge && it.judge !== 'OK')
      : RESULT.items.filter(it => it.judge);
    if (!allTargets.length) { addLog('LLM 판정 대상 없음', 'warn'); return; }

    // ==================== v11.1 규칙 기반 사전 처리 ====================
    // 키워드 매칭 강함(p≥5) + 매트릭스 적합(A/B) → 규칙만으로 해결 · LLM 스킵
    // 약함(p<5) 또는 매트릭스 부적합(C) → LLM 필요
    const kwSkipEnabled = (CFG && CFG.llm_kw_skip !== false);  // 기본 true
    let ruleResolvedCnt = 0;
    const targets = [];
    for (const it of allTargets) {
      if (kwSkipEnabled && ruleBasedResolve(it)) {
        ruleResolvedCnt++;
      } else {
        targets.push(it);
      }
    }
    addLog(`📊 규칙 기반 자동 판정: ${ruleResolvedCnt}건 (LLM 스킵) · LLM 필요: ${targets.length}건`, 'ok');
    if (!targets.length) {
      addLog(`✅ 모든 FIX 항목을 규칙만으로 해결 — LLM 호출 불필요 (비용 절감)`, 'ok');
      $('ha-llm-status').textContent = `규칙기반 ${ruleResolvedCnt}건 완료 · LLM 불필요`;
      return;
    }
    addLog(`🎯 LLM 판정 대상 ${targets.length}건 (OK ${fixOnly?'제외':'포함'}, 규칙 해결 ${ruleResolvedCnt}건 제외)`, 'sys');

    $('ha-llm-run').disabled = true;
    $('ha-llm-run').textContent = 'LLM 판정 중...';
    const BATCH = 8;
    let done = 0, fail = 0;
    addLog(`🧠 LLM 판정 시작 · 대상 ${targets.length}건 · 배치 ${BATCH}개`, 'sys');

    // v10: 매트릭스 먼저 확보 (9업종 샘플 상품 1회 fetch)
    const matrix = await buildRuntimeMatrix();
    if (!matrix) { addLog('매트릭스 없음 · v9 호환 모드로 진행', 'warn'); }

    // v10은 배치 4건 (한 건당 응답 크기 커서 JSON 파싱 실패 방지)
    const V10_BATCH = matrix ? 4 : BATCH;
    for (let i = 0; i < targets.length; i += V10_BATCH) {
      const batch = targets.slice(i, i + V10_BATCH);
      $('ha-llm-status').textContent = `${done}/${targets.length} 처리 중...`;
      try {
        let arr;
        if (matrix) {
          // v10 경로
          const text = await callClaude(apiKey, buildUserPromptV10(batch, matrix), LLM_SYSTEM_V10, 6000);
          arr = extractJSON(text);
        } else {
          // v9 호환 fallback
          const text = await callClaude(apiKey, buildUserPrompt(batch));
          arr = extractJSON(text);
        }
        for (const a of arr) {
          const it = RESULT.items.find(x => x.rgr === a.rgr);
          if (!it) continue;
          if (matrix) {
            // v10.7: add/remove 구조 (기존 keep은 "아무 것도 안 함" 의미 → 저장 안 함)
            it.llm_catO = a.catO || {};
            it.llm_catT_add = a.catT_add || [];
            it.llm_catT_remove = a.catT_remove || [];
            it.llm_selMemCat_add = a.selMemCat_add || [];
            it.llm_selMemCat_remove = a.selMemCat_remove || [];
            it.llm_selOptCat2_add = normalizeT2Keys(a.selOptCat2_add);
            it.llm_selOptCat2_remove = normalizeT2Keys(a.selOptCat2_remove);
            it.llm_reason = a.reason || '';
            // 하위 호환 (기존 llm_catT_keep/llm_selMemCat_keep 참조 코드용)
            it.llm_catT_keep = null;  // v10.7: keep은 "그대로 유지" 개념이라 명시 안 함
            it.llm_selMemCat_keep = null;
            it.llm_selOptCat2_keep = null;
            it.llm_o3 = (a.catO && a.catO.o3) || (a.catO && a.catO.o2) || null;
            it.llm_spaces = null;  // v10.7: spaces는 add로 대체
          } else {
            it.llm_o3 = (a.o3 && a.o3.length > 0) ? a.o3 : null;
            it.llm_spaces = a.spaces || [];
            it.llm_reason = a.reason || '';
          }
          done++;
        }
        addLog(`[LLM v10] 배치 ${Math.floor(i/V10_BATCH)+1} · ${batch.length}건 판정 완료`, 'ok');
      } catch(e) {
        addLog(`[LLM ERR] 배치 ${Math.floor(i/V10_BATCH)+1}: ${e.message}`, 'err');
        fail += batch.length;
      }
      // v10.4: Anthropic Tier 1 출력토큰 10K/분 제약 고려 → 배치 간격 12초
      // (배치당 출력 약 3200토큰 × 분당 3배치 = 약 9600토큰). HS_AUDIT_CONFIG.llm_gap으로 조절 가능.
      const gap = (CFG && CFG.llm_gap) || 12000;
      await new Promise(r => setTimeout(r, gap));
    }

    $('ha-llm-run').disabled = false;
    $('ha-llm-run').textContent = '🧠 LLM 판정 완료';
    $('ha-llm-status').textContent = `완료 · 성공 ${done} · 실패 ${fail}`;
    addLog(`🧠 LLM 판정 종료 · 성공 ${done} · 실패 ${fail}`, 'ok');
    alert(`LLM 판정 완료\n성공: ${done}건 · 실패: ${fail}건\n\nExcel 다시 다운로드하면 LLM 결과가 제안 컬럼에 반영됩니다.\n자동 수정도 LLM 결과를 사용합니다.`);
  }

  $('ha-llm-run').onclick = runLLMJudgeAll;

  // ============ 백업 목록 조회 ============
  $('ha-backup-list').onclick = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('hs_backup_')).sort().reverse();
    if (!keys.length) {
      alert('저장된 롤백 백업이 없습니다.\n(자동 수정 실행 시 자동 생성됩니다)');
      return;
    }
    const lines = keys.map((k,i) => {
      try {
        const d = JSON.parse(localStorage.getItem(k));
        return `${i+1}. ${d.ts} · 카테고리 ${d.category} · ${d.fix_count}건`;
      } catch(e) { return `${i+1}. ${k} (파싱 실패)`; }
    });
    const sel = prompt(
      `저장된 백업 (최근 10개):\n\n${lines.join('\n')}\n\n` +
      `번호를 입력하면 JSON 파일로 다시 다운로드합니다.\n` +
      `'삭제N' 입력 시 해당 백업 제거 (예: 삭제3)`,
      '1'
    );
    if (!sel) return;
    let idx;
    if (sel.startsWith('삭제')) {
      idx = parseInt(sel.replace('삭제','')) - 1;
      if (idx >= 0 && idx < keys.length) {
        if (confirm(`${keys[idx]} 삭제?`)) {
          localStorage.removeItem(keys[idx]);
          alert('삭제 완료');
        }
      }
      return;
    }
    idx = parseInt(sel) - 1;
    if (idx < 0 || idx >= keys.length) { alert('잘못된 번호'); return; }
    const content = localStorage.getItem(keys[idx]);
    const blob = new Blob([content], {type:'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = keys[idx].replace('hs_backup_','롤백백업_재다운로드_') + '.json';
    a.click();
    addLog('백업 재다운로드: ' + a.download, 'ok');
  };

  // ============ ✓ 재검증 (자동 수정 후 반영 여부 확인) ============
  $('ha-reverify').onclick = async () => {
    const fixItems = (RESULT.items || []).filter(r => r.judge && r.judge !== 'OK');
    if (!fixItems.length) { alert('FIX 대상 없음'); return; }
    if (!confirm(`FIX 판정 ${fixItems.length}건 재검증을 시작합니다.\n각 상품 편집 페이지를 다시 fetch해서 수정 반영 여부 확인.\n\n소요 시간 약 ${Math.ceil(fixItems.length*0.5/60)}~${Math.ceil(fixItems.length*1.5/60)}분. 계속?`)) return;

    $('ha-reverify').disabled = true;
    $('ha-reverify').textContent = '재검증 중...';
    addLog(`✓ 재검증 시작 (${fixItems.length}건)`, 'sys');

    let done=0, fullOk=0, partial=0, nothing=0;
    const report = [];
    for (let i=0; i<fixItems.length; i+=5) {
      const batch = fixItems.slice(i, i+5);
      const states = await Promise.all(batch.map(it => hsFetchState(it.rgr).then(s => ({it, s}))));
      for (const {it, s} of states) {
        done++;
        if (!s) { report.push({rgr:it.rgr, status:'fetch_fail'}); continue; }
        // v9 엄밀 검증: 각 축의 "실제 수정 완료" 여부 판정
        const checks = [];
        // T9: 9개 업종 집합 일치 (단순 개수가 아닌 정확한 셋)
        if (['FIX_T','FIX_ALL','FIX_MULTI'].includes(it.judge)) {
          const tSet = new Set(s.t);
          const expected9 = ['01','02','03','04','05','06','07','08','09'];
          const missing = expected9.filter(c => !tSet.has(c));
          checks.push({name:'T9', ok: missing.length===0, detail: missing.length ? '누락 '+missing.join(',') : '9개 완전'});
        }
        // O3: llm_o3 포함 여부
        if (['FIX_O','FIX_ALL','FIX_MULTI'].includes(it.judge) && it.llm_o3) {
          const hasCode = s.o.includes(it.llm_o3);
          checks.push({name:'O3('+it.llm_o3+')', ok: hasCode, detail: hasCode ? '등록' : '누락'});
        }
        // v10.7 재검증: add/remove 완료 여부만 체크
        const CBR_T2_V = /^(\d{2})`2`(\d{2}-\d{2})`/;
        const CBR_T5_V = /^(\d{2})`5`(\d{2}-\d{2})`/;
        const curT2 = new Set(), curT5 = new Set();
        (s.checked_values||[]).forEach(v => {
          const m2 = v.match(CBR_T2_V); if (m2) curT2.add(m2[1]+'|'+m2[2]);
          const m5 = v.match(CBR_T5_V); if (m5) curT5.add(m5[2]);  // t5는 sub만 비교
        });
        // SelMemCat add 검증
        if (it.llm_selMemCat_add && it.llm_selMemCat_add.length) {
          const added = it.llm_selMemCat_add.filter(sp => curT5.has(sp)).length;
          checks.push({name:'Mem추가', ok: added===it.llm_selMemCat_add.length, detail: added+'/'+it.llm_selMemCat_add.length});
        }
        // SelMemCat remove 검증
        if (it.llm_selMemCat_remove && it.llm_selMemCat_remove.length) {
          const remained = it.llm_selMemCat_remove.filter(sp => curT5.has(sp)).length;
          checks.push({name:'Mem해제', ok: remained===0, detail: '잔존 '+remained+'/'+it.llm_selMemCat_remove.length});
        }
        // SelOptCat2 add 검증
        if (it.llm_selOptCat2_add && Object.keys(it.llm_selOptCat2_add).length) {
          let matched=0, total=0;
          for (const pfx in it.llm_selOptCat2_add) for (const sub of (it.llm_selOptCat2_add[pfx]||[])) {
            total++;
            if (curT2.has(pfx+'|'+sub)) matched++;
          }
          checks.push({name:'T2추가', ok: matched===total, detail: matched+'/'+total});
        }
        // SelOptCat2 remove 검증
        if (it.llm_selOptCat2_remove && Object.keys(it.llm_selOptCat2_remove).length) {
          let leftover=0, total=0;
          for (const pfx in it.llm_selOptCat2_remove) for (const sub of (it.llm_selOptCat2_remove[pfx]||[])) {
            total++;
            if (curT2.has(pfx+'|'+sub)) leftover++;
          }
          checks.push({name:'T2해제', ok: leftover===0, detail: '잔존 '+leftover+'/'+total});
        }
        const okN = checks.filter(c=>c.ok).length;
        const status = okN === checks.length ? 'full' : (okN > 0 ? 'partial' : 'none');
        if (status==='full') fullOk++;
        else if (status==='partial') partial++;
        else nothing++;
        report.push({
          rgr:it.rgr, name:it.name, judge:it.judge, status, checks,
          after_t: s.t.length, after_cc: s.cc,
          // v9 추가 필드
          after_t5: s.t5_cc ?? 0,
          after_t2: s.t2_cc ?? 0,
          after_t2_by_ind: s.t2_by_industry ?? {}
        });
        $('ha-rb-status').textContent = `${done}/${fixItems.length} · 완료 ${fullOk} · 부분 ${partial} · 미반영 ${nothing}`;
      }
    }
    // 결과 저장 (window에)
    window.HS_REVERIFY = report;
    $('ha-reverify').disabled = false;
    $('ha-reverify').textContent = '✓ 재검증 완료';
    addLog(`✓ 재검증 종료 · 완료 ${fullOk} · 부분 ${partial} · 미반영 ${nothing}`, 'ok');
    // JSON 다운로드
    const blob = new Blob([JSON.stringify({summary:{total:done,fullOk,partial,nothing},report}, null, 2)], {type:'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `재검증리포트_${startStr.replace(/:/g,'')}.json`;
    a.click();
    alert(`재검증 완료\n완전 반영: ${fullOk}건\n부분 반영: ${partial}건\n미반영: ${nothing}건\n\n재검증리포트 JSON 다운로드됨.\nwindow.HS_REVERIFY 로 접근 가능.`);
  };

  // ============ 🔙 롤백 실행 ============
  $('ha-rollback').onclick = async () => {
    // 백업 소스 선택: localStorage 또는 파일
    const keys = Object.keys(localStorage).filter(k => k.startsWith('hs_backup_')).sort().reverse();
    let source = keys.length > 0
      ? confirm(`저장된 백업이 ${keys.length}개 있습니다.\n\n[확인] = 가장 최근 백업(${keys[0].replace('hs_backup_','')})으로 롤백\n[취소] = 다른 백업 파일 선택`)
      : false;

    let backup;
    if (source) {
      backup = JSON.parse(localStorage.getItem(keys[0]));
    } else {
      // 파일 선택
      const file = await new Promise((res) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = e => res(e.target.files[0]);
        input.click();
      });
      if (!file) { addLog('롤백 취소', 'warn'); return; }
      const text = await file.text();
      try { backup = JSON.parse(text); } catch(e) { alert('JSON 파싱 실패: ' + e.message); return; }
    }

    if (!backup || !backup.items) { alert('유효한 롤백 백업이 아닙니다.'); return; }

    // 어떤 시점으로 돌릴지 확인
    const msg = `📅 ${backup.ts || backup.created_at}\n` +
                `카테고리: ${backup.category}\n` +
                `수정 대상이었던 상품: ${backup.fix_count}건\n` +
                `전체 감사 스냅샷: ${(backup.all_items_snapshot||[]).length}건\n\n` +
                `이 백업의 상태로 되돌립니다.\n` +
                `(각 상품의 체크박스를 백업 시점 상태로 복구)\n\n` +
                `⚠️ 이 작업도 시간 걸리고 되돌리기 어렵습니다. 계속?`;
    if (!confirm(msg)) { addLog('롤백 취소', 'warn'); return; }

    $('ha-rollback').disabled = true;
    $('ha-rollback').textContent = '롤백 진행 중...';
    addLog(`🔙 롤백 시작 · ${backup.items.length}건`, 'sys');

    // 롤백 대상은 items (수정 대상이었던 것) 우선
    // v10.6: before가 빈값인 item에 all_items_snapshot 자동 주입 (사고 재발 방지)
    const snapMap = new Map();
    (backup.all_items_snapshot||[]).forEach(s => snapMap.set(s.rgr, s));
    backup.items.forEach(bit => {
      const snap = snapMap.get(bit.rgr);
      if (snap) bit._snapshot = snap;
    });
    const targets = backup.items;
    let done=0, okCnt=0, errCnt=0;
    for (const bit of targets) {
      $('ha-rb-status').textContent = `${done+1}/${targets.length} · ${bit.rgr}`;
      try {
        const r = await rollbackOne(bit);
        addLog(`[RB] ${bit.rgr} → ${r}`, 'ok');
        okCnt++;
      } catch(e) {
        addLog(`[RB ERR] ${bit.rgr}: ${e.message}`, 'err');
        errCnt++;
      }
      done++;
    }

    $('ha-rollback').disabled = false;
    $('ha-rollback').textContent = '🔙 롤백 완료';
    $('ha-rb-status').textContent = `완료 · 성공 ${okCnt} · 실패 ${errCnt}`;
    addLog(`🔙 롤백 종료 · 성공 ${okCnt} · 실패 ${errCnt}`, 'sys');
    alert(`롤백 완료\n성공 ${okCnt} · 실패 ${errCnt}\n\n재감사로 원상복구 여부 확인하세요.`);
  };

  // ============ 자동 수정 섹션 ============
  // v10.7.3 ★ 치명 버그 수정: sorted는 toDisplayRow로 변환된 객체라 llm_* 필드가 없음
  // 원본 RESULT.items에서 직접 필터링 + sorted 순서 유지
  const sortedRgrs = sorted.filter(r => r.judge && r.judge.startsWith('FIX')).map(r => r.rgr);
  const fixItems = sortedRgrs.map(rgr => RESULT.items.find(it => it.rgr === rgr)).filter(Boolean);
  if (fixItems.length > 0) {
    const byJ = {};
    for (const r of fixItems) byJ[r.judge] = (byJ[r.judge]||0) + 1;
    const statsParts = [];
    if (byJ.FIX_T)     statsParts.push(`FIX_T ${byJ.FIX_T}건 (업종 부족 · 키워드 매칭 추가)`);
    if (byJ.FIX_O)     statsParts.push(`FIX_O ${byJ.FIX_O}건 (카테고리 부족 · 키워드 매칭 재분류)`);
    if (byJ.FIX_CB)    statsParts.push(`FIX_CB ${byJ.FIX_CB}건 (관심분야 미연결 · 공간 추가)`);
    if (byJ.FIX_MULTI) statsParts.push(`FIX_MULTI ${byJ.FIX_MULTI}건`);
    if (byJ.FIX_ALL)   statsParts.push(`FIX_ALL ${byJ.FIX_ALL}건`);
    $('ha-fix-stats').innerHTML = `수정 대상 <b>${fixItems.length}건</b><br>` + statsParts.join(' · ');
    $('ha-fix-area').classList.add('show');
    $('ha-fix-total').textContent = fixItems.length;
    $('ha-fix-run').onclick = () => runAutoFix(fixItems);
  }

  setStep(4, 100);
  for (let i = 1; i <= 4; i++) $('ha-s'+i).classList.add('done');
  addLog('파이프라인 종료. 다운로드 버튼 활성', 'sys');
  if (fixItems.length > 0) addLog(`자동 수정 대기: ${fixItems.length}건 (🔧 버튼 클릭)`, 'warn');
  clearInterval(clockTimer);
}

// ==================== 자동 수정 로직 ====================
async function runAutoFix(fixItems) {
  const confirmMsg = `FIX 판정 ${fixItems.length}건을 자동 수정합니다. (v11 매칭 엔진)\n\n` +
    `• FIX_T: 키워드 매칭 업종 add (기존 연결 유지)\n` +
    `• FIX_O: 키워드 매칭 catO 재분류 또는 2/3차 추가\n` +
    `• FIX_CB: 관심분야 공간 add (기존 연결 유지)\n\n` +
    `🛡️ 수정 전에 롤백용 현재 상태 백업을 자동 다운로드합니다.\n` +
    `⚠️ catO 재분류는 1차까지 교체되므로 영향 큼. 백업 필수 보관.`;
  if (!confirm(confirmMsg)) { addLog('자동 수정 취소', 'warn'); return; }

  // ========== 🛡️ 롤백 백업 생성 ==========
  try { autoFixBackup(fixItems); }
  catch(e) { addLog('백업 생성 실패 (계속 진행): ' + e.message, 'warn'); }

  $('ha-fix-run').disabled = true;
  $('ha-fix-run').textContent = '수정 진행 중...';
  $('ha-fix-progress').classList.add('show');
  addLog(`🔧 자동 수정 시작 (${fixItems.length}건)`, 'sys');

  let done = 0, okCnt = 0, errCnt = 0;
  for (const item of fixItems) {
    $('ha-fix-curr').textContent = `처리 중: ${item.rgr} · ${item.name.slice(0,30)} [${item.judge}]`;
    try {
      const r = await fixOne(item);
      addLog(`[FIX] ${item.rgr} → ${item.judge} · ${r}`, 'ok');
      okCnt++;
    } catch(e) {
      addLog(`[FIX ERR] ${item.rgr}: ${e.message}`, 'err');
      errCnt++;
    }
    done++;
    $('ha-fix-done').textContent = done;
    $('ha-fix-pct').textContent = Math.round(done/fixItems.length*100) + '%';
  }
  $('ha-fix-curr').textContent = `완료 · 성공 ${okCnt} · 실패 ${errCnt}`;
  $('ha-fix-run').textContent = '수정 완료 · 재감사 권장';
  addLog(`🔧 자동 수정 완료 · 성공 ${okCnt} · 실패 ${errCnt}`, 'sys');
  alert(`자동 수정 완료\n성공: ${okCnt}건\n실패: ${errCnt}건\n\n재감사 권장합니다.`);
}

// 🛡️ 자동 수정 실행 직전 현재 상태 백업 · 파일 다운로드 + localStorage
function autoFixBackup(fixItems) {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const backup = {
    created_at: now.toISOString(),
    ts,
    backup_type: 'pre_autofix',
    category: (window.HS_AUDIT_RESULT && window.HS_AUDIT_RESULT.config && window.HS_AUDIT_RESULT.config.cat) || '?',
    fix_count: fixItems.length,
    total_items: (window.HS_AUDIT_RESULT && window.HS_AUDIT_RESULT.items || []).length,
    items: fixItems.map(it => ({
      rgr: it.rgr,
      name: it.name,
      page: it.page,
      judge: it.judge,
      // v10.6: 명시 복사 + 빈 문자열 기본값 (undefined로 저장되어 롤백이 빈값으로 읽는 사고 방지)
      before: {
        o: (typeof it.o === 'string') ? it.o : '',
        t: (typeof it.t === 'string') ? it.t : '',
        cc: (typeof it.cc === 'number') ? it.cc : 0,
        ct: (typeof it.ct === 'number') ? it.ct : 0,
        cd: it.cd ? JSON.parse(JSON.stringify(it.cd)) : {},
        checked_values: Array.isArray(it.checked_values) ? it.checked_values.slice() : [],
      },
      planned: {
        o3_add: it.llm_o3 || (it.reason && (it.reason.match(/O3:(\d{2}-\d{2}-\d{3})/)||[])[1]) || null,
        spaces_recheck: it.llm_spaces || [],
        llm_reason: it.llm_reason || '',
      }
    })),
    // 전체 감사 스냅샷 (OK 상품 포함, 완전 복원용)
    all_items_snapshot: (window.HS_AUDIT_RESULT && window.HS_AUDIT_RESULT.items || []).map(it => ({
      rgr: it.rgr,
      o: it.o,
      t: it.t,
      cc: it.cc,
      checked_values: it.checked_values || [],
    })),
  };
  // 파일 다운로드
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `롤백백업_${backup.category}_${ts}.json`;
  a.click();
  // localStorage 보관 (최대 10개)
  try {
    const key = `hs_backup_${ts}`;
    localStorage.setItem(key, JSON.stringify(backup));
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('hs_backup_')).sort();
    while (allKeys.length > 10) {
      localStorage.removeItem(allKeys.shift());
    }
  } catch(e) { /* 저장 용량 초과 무시 */ }
  // 로그
  if (typeof addLog === 'function') {
    addLog(`🛡️ 롤백 백업 생성: ${a.download} (localStorage + 파일)`, 'ok');
  }
  return backup;
}

// ==================== 방법 B: 어드민 AJAX 직접 호출 ====================
const HS_API = '/AdminManager/SelectCateCode.php';

// 카테고리 추가 (업종 또는 상품별)
async function hsApiCateAdd(rowid, rgr, code, optType, currentCount) {
  const cateName = optType === '1' ? 'AM_CoOne' : 'AM_CoTwo';
  const params = new URLSearchParams({
    SelCateTab: 'AM_Gs_CaReg',
    SelectCode: code,
    CateName: cateName,
    OptTypeNum: optType,
    RgrRowid: rowid,
    RgrCode: rgr,
    SelScodeCount: String(currentCount || 0),
    NowCatCount: String(currentCount || 0),
  });
  const res = await fetch(`${HS_API}?RegCate=1&${params}`, {credentials:'include'});
  if (!res.ok) return {ok:false, status:res.status};
  try {
    const data = await res.json();
    return {ok: data.RsInsertUpdate === 1, data};
  } catch(e) { return {ok:false, err:e.message}; }
}

// 카테고리 삭제
async function hsApiCateDel(rowid, rgr, code, optType) {
  const params = new URLSearchParams({
    SelCateTab: 'AM_Gs_CaReg',
    nMode: 'RegCateDel',
    SelScode: code,
    OptTypeNum: optType,
    RgrRowid: rowid,
    RgrCode: rgr,
  });
  const res = await fetch(`${HS_API}?${params}`, {credentials:'include'});
  if (!res.ok) return {ok:false, status:res.status};
  try {
    const data = await res.json();
    return {ok: data.RsRegCateDel === 1, data};
  } catch(e) { return {ok:false, err:e.message}; }
}

// 체크박스 토글 (check=true 체크, false 해제)
// cbValue 포맷: "XX`Y`YY-YY`이름"  (예: "04`1`07-08`플라스틱")
async function hsApiCbToggle(rgr, cbValue, check) {
  const parts = cbValue.split('`');
  if (parts.length < 4) return {ok:false, err:'invalid value'};
  const scodeOne = parts[0];    // 04
  const optType = parts[1];     // 1/2/5
  const optCode = parts[2];     // 07-08
  const optTxt = parts[3];       // 플라스틱
  const params = new URLSearchParams({
    SelCateTab: 'AM_Gs_CaReg',
    SelSeaTab: 'AM_Gs_SeaDef',
    nMode: check ? 'RegOptSelect' : 'DelOptSelect',
    GoodsNum: '1',
    RegCode: rgr,
    ScodeOne: scodeOne,
    OptTypeNum: optType,
    OptCode: optCode,
    OptTxt: optTxt,
  });
  const res = await fetch(`${HS_API}?${params}`, {credentials:'include'});
  if (!res.ok) return {ok:false, status:res.status};
  try {
    const data = await res.json();
    return {ok: true, data};
  } catch(e) { return {ok:false, err:e.message}; }
}

// 상품의 현재 상태 (편집 페이지 fetch 후 파싱)
async function hsFetchState(rgr) {
  const url = `/AdminManager/MakeGoodsTypeOneDp.php?RgrCode=${rgr}&EditMode=1`;
  const res = await fetch(url, {credentials:'include'});
  if (!res.ok) return null;
  const html = await res.text();
  const rowidM = html.match(/RgrRowid:\s*'(\d+)'/);
  const rgrRowid = rowidM ? rowidM[1] : null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const oneVals = [], twoVals = [];
  for (let i=1; i<=30; i++) {
    const h = doc.querySelector(`input[name="SelectCatoryCodeOne_${i}"]`);
    if (h && h.value) oneVals.push(h.value.split('^')[0]);
    const h2 = doc.querySelector(`input[name="SelectCatoryCodeTwo_${i}"]`);
    if (h2 && h2.value) twoVals.push(h2.value.split('^')[0]);
  }
  const CBR_L = /^(\d{2})`\d`(\d{2}-\d{2})`/;
  const CBR_L_TYPED = /^(\d{2})`(\d)`(\d{2}-\d{2})`/;  // v9 type 분리
  const checkedValues = [];
  let cbC = 0;
  // v9: type별 분리
  let t1_cc=0, t2_cc=0, t5_cc=0;
  const t2_by_industry = {};
  const t5_list = [];
  doc.querySelectorAll('input[type="checkbox"]').forEach(x => {
    const v = x.value||'';
    const m = v.match(CBR_L);
    if (!m) return;
    if (!x.hasAttribute('checked')) return;
    cbC++;
    checkedValues.push(v);
    const tm = v.match(CBR_L_TYPED);
    if (tm) {
      const pfx = tm[1], typ = tm[2], sub = tm[3];
      if (typ==='1') t1_cc++;
      else if (typ==='2') {
        t2_cc++;
        if (!t2_by_industry[pfx]) t2_by_industry[pfx] = [];
        t2_by_industry[pfx].push(sub);
      }
      else if (typ==='5') { t5_cc++; t5_list.push(pfx+'-'+sub); }
    }
  });
  return {
    rowid: rgrRowid, o: oneVals, t: twoVals,
    cc: cbC, checked_values: checkedValues,
    // v9 추가
    t1_cc, t2_cc, t5_cc, t2_by_industry, t5_list
  };
}

async function fixOne(item) {
  const results = [];
  const judge = item.judge;
  const isT  = judge === 'FIX_T'  || judge === 'FIX_ALL' || judge === 'FIX_MULTI';
  const isO  = judge === 'FIX_O'  || judge === 'FIX_ALL' || judge === 'FIX_MULTI';
  const isCB = judge === 'FIX_CB' || judge === 'FIX_ALL' || judge === 'FIX_MULTI';

  // rowid가 감사 단계에서 수집됐으면 그걸 사용, 아니면 즉시 fetch
  let rowid = item.rowid;
  let existingCheckedValues = item.checked_values || [];
  let connectedT = new Set((item.t||'').split(',').filter(x=>x));
  if (!rowid) {
    const state = await hsFetchState(item.rgr);
    if (!state) return 'fetch 실패';
    rowid = state.rowid;
    existingCheckedValues = state.checked_values;
    connectedT = new Set(state.t);
  }
  if (!rowid) return 'rowid 없음';

  // ============ v10.7 업종 연결 (add 기반) ============
  // LLM이 llm_catT_add에 지정한 업종만 추가. 없으면 (FIX_T 판정일 때만) 기존 9개 일괄.
  const catTAdd = item.llm_catT_add || [];
  if (catTAdd.length) {
    // v10.7: LLM 명시 add만 추가 (기존 연결 그대로 유지)
    const missing = catTAdd.filter(c => !connectedT.has(c));
    if (missing.length) {
      const results_t = await Promise.all(
        missing.map(code => hsApiCateAdd(rowid, item.rgr, code, '2', connectedT.size))
      );
      const ok_n = results_t.filter(r => r.ok).length;
      results.push(`T+${ok_n}/${missing.length}`);
      missing.forEach(c => connectedT.add(c));
    }
  } else if (isT) {
    // LLM 판정 없이 FIX_T 단독 판정일 때만 기존 9개 일괄 로직 유지
    const missing = ['01','02','03','04','05','06','07','08','09'].filter(c => !connectedT.has(c));
    if (missing.length) {
      const results_t = await Promise.all(
        missing.map(code => hsApiCateAdd(rowid, item.rgr, code, '2', connectedT.size))
      );
      const ok_n = results_t.filter(r => r.ok).length;
      results.push(`T+${ok_n}/${missing.length}(기본)`);
      missing.forEach(c => connectedT.add(c));
    }
  }

  // ============ v11 FIX_O: 키워드 우선 catO 재분류/추가 ============
  // 정책:
  //  1) 키워드 매칭 priority >= 5: 자동 재분류 허용 (1차까지 바꿈)
  //  2) 키워드 매칭 없음 → LLM 지시(llm_catO) 사용, 단 priority mid 이하는 승인 대기
  //  3) 1차 일치 시: 2/3차만 추가
  //  4) 1차 불일치 시: 기존 전체 해제 후 새로 등록 (catO 재분류)
  if (isO) {
    // 우선순위 1: 키워드 매칭 결과
    let targetCatO = null;
    let src = '';
    if (item._kw_catO && item._kw_catO.p >= 5) {
      targetCatO = item._kw_catO.c;
      src = `kw:${item._kw_catO.kw}(p${item._kw_catO.p})`;
    } else if (item.llm_catO && Object.keys(item.llm_catO).length) {
      // LLM 지시 사용 (priority 낮은 키워드도 LLM이 보정)
      targetCatO = item.llm_catO;
      src = 'llm';
    } else if (item.llm_o3) {
      // 하위 호환: llm_o3에서 역산
      const o3 = item.llm_o3;
      targetCatO = {
        o1: o3.split('-')[0],
        o2: o3.split('-').slice(0,2).join('-'),
        o3
      };
      src = 'llm_o3';
    }

    if (!targetCatO || !targetCatO.o1) {
      results.push('O변경불필요(매칭없음)');
    } else {
      const currentOs = (item.o||'').split(',').filter(x=>x);
      const currentCat1 = (currentOs[0]||'').split('-')[0];
      const expectCat1 = targetCatO.o1;

      if (currentCat1 && expectCat1 && currentCat1 !== expectCat1) {
        // ===== catO 재분류 (v11 신규) =====
        // 안전장치: 이 분기는 이미 priority>=5 또는 LLM 지시여야 도달
        addLog(`🔀 catO 재분류: ${item.rgr} ${currentCat1}→${expectCat1} (${src})`, 'warn');
        // 기존 catO 전체 해제
        let delOk = 0, delFail = 0;
        for (const oldO of currentOs) {
          const dr = await hsApiCateDel(rowid, item.rgr, oldO, '1');
          if (dr.ok) delOk++; else delFail++;
        }
        results.push(`O해제:${delOk}/${currentOs.length}`);
        if (delFail > 0) {
          results.push(`⚠ 일부 삭제실패(${delFail})`);
        }
        // 새 catO 등록 (1차 → 2차 → 3차 순서)
        const addList = [targetCatO.o1, targetCatO.o2, targetCatO.o3].filter(x=>x);
        for (const code of addList) {
          const ar = await hsApiCateAdd(rowid, item.rgr, code, '1', 0);
          results.push(ar.ok ? `O+${code}` : `O실패(${code})`);
        }
        results.push(`재분류완료(${src})`);
      } else {
        // ===== 1차 일치: 2/3차만 추가 =====
        const toAdd = [];
        if (targetCatO.o2 && !currentOs.includes(targetCatO.o2)) toAdd.push(targetCatO.o2);
        if (targetCatO.o3 && !currentOs.includes(targetCatO.o3)) toAdd.push(targetCatO.o3);
        if (!toAdd.length) {
          results.push('O변경불필요(이미일치)');
        } else {
          for (const code of toAdd) {
            const ar = await hsApiCateAdd(rowid, item.rgr, code, '1', 0);
            results.push(ar.ok ? `O+${code}` : `O실패(${code})`);
          }
        }
      }
    }
  }

  // ============ v10.7 SelMemCat add/remove (type=5 관심분야) ============
  // ★ 원칙: 기존 체크는 건드리지 않음. LLM이 명시한 add만 체크, remove만 해제.
  const memAdd = item.llm_selMemCat_add || [];
  const memRemove = item.llm_selMemCat_remove || [];
  if (memAdd.length || memRemove.length) {
    const CBR_F = /^(\d{2})`5`(\d{2}-\d{2})`/;
    const CBR_F2 = /^(\d{2})`5`(\d{2}-\d{2})`(.*)$/;
    // 페이지 fetch (업종 추가 반영 대기)
    await new Promise(r=>setTimeout(r, 500));
    const html2 = await (await fetch(`/AdminManager/MakeGoodsTypeOneDp.php?RgrCode=${item.rgr}&EditMode=1`,{credentials:'include'})).text();
    const doc2 = new DOMParser().parseFromString(html2,'text/html');
    const allT5 = [];
    const checkedT5 = new Set();
    doc2.querySelectorAll('input[type="checkbox"]').forEach(x=>{
      const v = x.value||'';
      if (!CBR_F.test(v)) return;
      allT5.push(v);
      if (x.hasAttribute('checked')) checkedT5.add(v);
    });
    // add: 체크 안 된 상태의 sub 매칭 value
    const toAddValues = [];
    for (const target of memAdd) {
      for (const v of allT5) {
        const m = v.match(CBR_F2);
        if (m && m[2] === target && !checkedT5.has(v)) toAddValues.push(v);
      }
    }
    // remove: 현재 체크된 상태의 sub 매칭 value
    const toRmValues = [];
    for (const target of memRemove) {
      for (const v of checkedT5) {
        const m = v.match(CBR_F2);
        if (m && m[2] === target) toRmValues.push(v);
      }
    }
    let memOn = 0, memOff = 0;
    for (let i=0; i<toAddValues.length; i+=10) {
      const r = await Promise.all(toAddValues.slice(i,i+10).map(v => hsApiCbToggle(item.rgr, v, true)));
      memOn += r.filter(x=>x.ok).length;
    }
    for (let i=0; i<toRmValues.length; i+=10) {
      const r = await Promise.all(toRmValues.slice(i,i+10).map(v => hsApiCbToggle(item.rgr, v, false)));
      memOff += r.filter(x=>x.ok).length;
    }
    if (memOn || memOff) results.push(`Mem+${memOn}-${memOff}`);
  }

  // ============ v10.7 SelOptCat2 add/remove (업종×공간) ============
  // ★ 원칙: 기존 체크 유지. add/remove만 실행.
  const t2AddMap = item.llm_selOptCat2_add || {};
  const t2RemoveMap = item.llm_selOptCat2_remove || {};
  if (Object.keys(t2AddMap).length || Object.keys(t2RemoveMap).length) {
    await new Promise(r => setTimeout(r, 250));
    const CBR_T2_ANY = /^(\d{2})`2`(\d{2}-\d{2})`/;
    const html3 = await (await fetch(`/AdminManager/MakeGoodsTypeOneDp.php?RgrCode=${item.rgr}&EditMode=1`,{credentials:'include'})).text();
    const doc3 = new DOMParser().parseFromString(html3, 'text/html');
    const allT2 = [];
    const checkedT2 = new Set();
    doc3.querySelectorAll('input[type="checkbox"]').forEach(x => {
      const v = x.value||'';
      if (!CBR_T2_ANY.test(v)) return;
      allT2.push(v);
      if (x.hasAttribute('checked')) checkedT2.add(v);
    });
    // add: pfx+sub 매칭 + 미체크 value
    const toCheckT2 = [];
    for (const pfx in t2AddMap) {
      for (const sub of (t2AddMap[pfx]||[])) {
        const m = allT2.find(v => {
          const mm = v.match(CBR_T2_ANY);
          return mm && mm[1]===pfx && mm[2]===sub && !checkedT2.has(v);
        });
        if (m) toCheckT2.push(m);
      }
    }
    // remove: pfx+sub 매칭 + 체크됨 value
    const toUncheckT2 = [];
    for (const pfx in t2RemoveMap) {
      for (const sub of (t2RemoveMap[pfx]||[])) {
        for (const v of checkedT2) {
          const mm = v.match(CBR_T2_ANY);
          if (mm && mm[1]===pfx && mm[2]===sub) toUncheckT2.push(v);
        }
      }
    }
    let t2On=0, t2Off=0;
    for (let i=0; i<toCheckT2.length; i+=10) {
      const r = await Promise.all(toCheckT2.slice(i,i+10).map(v => hsApiCbToggle(item.rgr, v, true)));
      t2On += r.filter(x=>x.ok).length;
    }
    for (let i=0; i<toUncheckT2.length; i+=10) {
      const r = await Promise.all(toUncheckT2.slice(i,i+10).map(v => hsApiCbToggle(item.rgr, v, false)));
      t2Off += r.filter(x=>x.ok).length;
    }
    if (t2On || t2Off) results.push(`T2+${t2On}-${t2Off}`);
  }

  // ============ v10.7 catT remove (LLM 지시만) ============
  const catTRemove = item.llm_catT_remove || [];
  if (catTRemove.length) {
    let tDel = 0;
    for (const code of catTRemove) {
      if (connectedT.has(code)) {
        const r = await hsApiCateDel(rowid, item.rgr, code, '2');
        if (r.ok) tDel++;
      }
    }
    if (tDel) results.push(`T-${tDel}`);
  }

  return results.join(',') || '변경없음';
}

// ==================== 🔙 롤백 로직 ====================
// 단일 상품의 체크박스를 백업 시점으로 되돌림
// 롤백: 방법 B 기반 (체크박스 type=5 + 업종 + 상품별 복원)
async function rollbackOne(bit) {
  const CBR_R = /^(\d{2})`5`(\d{2}-\d{2})`/;  // type=5만 복원 대상
  // 현재 상태 조회
  const state = await hsFetchState(bit.rgr);
  if (!state) return '상태 조회 실패';
  const rowid = state.rowid;
  if (!rowid) return 'rowid 없음';

  // v10.6: before가 빈값이면 bit._snapshot (all_items_snapshot fallback)에서 보완
  let _bO = (bit.before && bit.before.o) || '';
  let _bT = (bit.before && bit.before.t) || '';
  let _bCV = (bit.before && bit.before.checked_values) || [];
  if ((!_bO && !_bT && !_bCV.length) && bit._snapshot) {
    _bO = bit._snapshot.o || ''; _bT = bit._snapshot.t || '';
    _bCV = bit._snapshot.checked_values || [];
  }
  const beforeO = new Set(_bO.split(',').filter(x=>x));
  const beforeT = new Set(_bT.split(',').filter(x=>x));
  const beforeCheckedValues = new Set(_bCV);
  const currO = new Set(state.o);
  const currT = new Set(state.t);
  const currCheckedValues = new Set(state.checked_values);

  // v10.6 ★ 안전장치: before가 여전히 빈값이면 "삭제" 작업 전체 skip
  // (before 미기입 = 원상태 모름 → 삭제하면 데이터 망가짐. 추가만 수행)
  const hasValidBefore = !!(beforeO.size || beforeT.size || beforeCheckedValues.size);

  let logs = [];

  // 1. 업종 T 복원 (★ 안전장치 적용)
  const tToRemove = hasValidBefore ? [...currT].filter(c => !beforeT.has(c)) : [];
  const tToAdd = [...beforeT].filter(c => !currT.has(c));
  if (tToRemove.length) {
    const r = await Promise.all(tToRemove.map(c => hsApiCateDel(rowid, bit.rgr, c, '2')));
    logs.push(`T-${r.filter(x=>x.ok).length}`);
  }
  if (tToAdd.length) {
    const r = await Promise.all(tToAdd.map(c => hsApiCateAdd(rowid, bit.rgr, c, '2', currT.size)));
    logs.push(`T+${r.filter(x=>x.ok).length}`);
  }

  // 2. 상품별 O 복원 (★ 안전장치 적용)
  const oToRemove = hasValidBefore ? [...currO].filter(c => !beforeO.has(c)) : [];
  const oToAdd = [...beforeO].filter(c => !currO.has(c));
  if (oToRemove.length) {
    const r = await Promise.all(oToRemove.map(c => hsApiCateDel(rowid, bit.rgr, c, '1')));
    logs.push(`O-${r.filter(x=>x.ok).length}`);
  }
  if (oToAdd.length) {
    const r = await Promise.all(oToAdd.map(c => hsApiCateAdd(rowid, bit.rgr, c, '1', currO.size)));
    logs.push(`O+${r.filter(x=>x.ok).length}`);
  }

  // 3. 체크박스 복원 (★ 안전장치 적용)
  const cbToUncheck = hasValidBefore ? [...currCheckedValues].filter(v => CBR_R.test(v) && !beforeCheckedValues.has(v)) : [];
  const cbToCheck = [...beforeCheckedValues].filter(v => CBR_R.test(v) && !currCheckedValues.has(v));
  if (cbToUncheck.length) {
    let ok = 0;
    for (let i=0; i<cbToUncheck.length; i+=10) {
      const batch = cbToUncheck.slice(i, i+10);
      const r = await Promise.all(batch.map(v => hsApiCbToggle(bit.rgr, v, false)));
      ok += r.filter(x=>x.ok).length;
    }
    logs.push(`CB-${ok}`);
  }
  if (cbToCheck.length) {
    let ok = 0;
    for (let i=0; i<cbToCheck.length; i+=10) {
      const batch = cbToCheck.slice(i, i+10);
      const r = await Promise.all(batch.map(v => hsApiCbToggle(bit.rgr, v, true)));
      ok += r.filter(x=>x.ok).length;
    }
    logs.push(`CB+${ok}`);
  }

  return logs.length ? logs.join(',') : '변경없음';
}

main().catch(e => addLog('치명적 오류: ' + e.message, 'err'));

// 외부에서 결과 접근
window.HS_AUDIT_RESULT = RESULT;
console.log('[하나사인몰 실시간 감사] 실행 중. window.HS_AUDIT_RESULT 로 결과 접근 가능.');

})();
