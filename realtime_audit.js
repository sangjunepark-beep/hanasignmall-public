/**
 * 하나사인몰 어드민 실시간 감사 대시보드 (v2 · 2026-04-20)
 *
 * 변경점 (v2):
 *   - 대시보드 크기 1.5배 확대 (width 520→760, font-size↑, log 높이↑)
 *   - 현재 GoodsList URL에서 카테고리/viewCnt 자동 감지
 *   - 검색 결과 전체 페이지 자동 감지 ("총 N건" + 페이지네이션 교차 확인)
 *   - 북마클릿 실행 친화적 (한 클릭으로 동작)
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
  <div class="ha-title"><span class="ha-live"></span>하나사인몰 실시간 감사</div>
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
      <button class="ha-btn" style="background:#065f46;color:#fff;margin-left:auto" id="ha-backup-list">🛡️ 백업 목록</button>
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

// ================== 감사 로직 ==================
const G = {'01':'G1','02':'G2','03':'G3','04':'G4','05':'G5','06':'G6','07':'G7','08':'G8','09':'G9'};
const CBR = /^(\d{2})`\d`(\d{2}-\d{2})`/;

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
        if (/[가-힣]/.test(t) && t.length > 5 && t.length < 100 &&
            !/^(상품|임시|판매|숨김|수정|관리|보기|복사|등록|일자|코드|디자인|상세)/.test(t)) {
          if (t.length > name.length) name = t;
        }
      }
    }
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
  const oneVals = [], twoVals = [];
  for (let i=1; i<=30; i++) {
    const h = doc.querySelector(`input[name="SelectCatoryCodeOne_${i}"]`);
    if (h && h.value) oneVals.push(h.value.split('^')[0]);
    const h2 = doc.querySelector(`input[name="SelectCatoryCodeTwo_${i}"]`);
    if (h2 && h2.value) twoVals.push(h2.value.split('^')[0]);
  }
  const cd = {};
  let cbT=0, cbC=0;
  doc.querySelectorAll('input[type="checkbox"]').forEach(x => {
    const m = (x.value||'').match(CBR);
    if (!m) return;
    cbT++;
    const k = G[m[1]] || ('X'+m[1]);
    if (!cd[k]) cd[k] = [0, 0];
    cd[k][0]++;
    if (x.hasAttribute('checked')) { cd[k][1]++; cbC++; }
  });
  return Object.assign(item, {o: oneVals.join(','), t: twoVals.join(','), cc: cbC, ct: cbT, cd});
}

// ================== 판정 규칙 ==================
function expectO1(name) {
  const kw = [['04',['입간판','A형','오뚜기','스텐','안내봉','원형','철제']],
              ['02',['안내판','표지판','플레이트','프레임']],
              ['01',['게시판','보드','화이트보드']],
              ['10',['스티커','라벨','시트지','출력']],
              ['05',['현수막','배너']],
              ['08',['차량','도로','콘','라바콘']]];
  for (const [c, ws] of kw) for (const w of ws) if (name.includes(w)) return c;
  return null;
}
function expectT1(name) {
  const m = new Set();
  if (/초등학교|학교|학원|교실|교무실|급식/.test(name)) m.add('01');
  if (/식당|카페|음식점|레스토랑|테이크아웃|주문|선불|2층 좌석|주방/.test(name)) m.add('02');
  if (/아파트|단지|입주민|관리소|경비실|공동주택/.test(name)) m.add('03');
  if (/호텔|펜션|모텔|객실|리셉션|숙박/.test(name)) m.add('04');
  if (/병원|약국|의원|요양원|진료|처방|간호/.test(name)) m.add('05');
  if (/회사|공장|사무실|창고|물류|제조|작업장|안전작업|지게차/.test(name)) m.add('06');
  if (/관공서|구청|시청|공기업|소방|경찰|군부대/.test(name)) m.add('07');
  if (/헬스|골프|수영|스포츠|피트니스/.test(name)) m.add('08');
  if (/무지|셀프디자인|타입 - 대형|타입 - 중형|타입 - 소형|교체용|시트 교체|기본 타입/.test(name)) return 'U9';
  if (/주차|오뚜기|요일제|2부제|5부제|외부차량|주정차|전기차|차량/.test(name) && m.size === 0) return 'CAR';
  return m.size ? m : null;
}
function expectO3(name) {
  const m = [['주의','04-01-007'],['위험','04-01-007'],['CCTV','04-01-011'],['금연','04-01-011'],['촬영','04-01-011'],
             ['출입금지','04-01-008'],['금지','04-01-008'],['청소중','04-01-001'],['공사중','04-01-002'],['공사','04-01-002'],
             ['식당','04-01-004'],['카페','04-01-004'],['음식','04-01-004'],['주차','04-01-009'],['학교','04-01-012'],['학원','04-01-012']];
  for (const [kw, c] of m) if (name.includes(kw)) return c;
  return null;
}

function judge(r) {
  const name = r.name || '';
  const oSet = new Set((r.o||'').split(',').filter(x=>x));
  const tSet = new Set((r.t||'').split(',').filter(x=>x));
  const issues = [];
  const eo = expectO1(name);
  if (eo && !Array.from(oSet).some(x => x.split('-')[0] === eo)) issues.push('O1');
  const et = expectT1(name);
  const full9 = ['01','02','03','04','05','06','07','08','09'].every(c => tSet.has(c));
  if (!tSet.size) issues.push('T');
  else if (et === 'U9' && !full9) issues.push('T');
  else if (et instanceof Set && et.size) {
    for (const c of et) if (!tSet.has(c)) { issues.push('T'); break; }
  }
  if (r.cc === 0) issues.push('CB');
  else if (r.cc > 30) {
    if (et === 'U9') {}
    else if (tSet.size >= 7) { if (r.cc > 120) issues.push('CB'); }
    else issues.push('CB');
  }
  const hasA = oSet.has('04-01');
  const eo3 = expectO3(name);
  if (hasA && eo3 && !Array.from(oSet).some(x => x.startsWith(eo3))) issues.push('O1');

  if (!issues.length) return 'OK';
  const codes = new Set(issues);
  if (codes.size === 1) {
    if (codes.has('O1')) return 'FIX_O';
    if (codes.has('T')) return 'FIX_T';
    if (codes.has('CB')) return 'FIX_CB';
  }
  if (codes.has('O1') && codes.has('T') && codes.has('CB')) return 'FIX_ALL';
  return 'FIX_MULTI';
}

// ================== 결과 저장 ==================
const RESULT = {config: CFG, started: startStr, items: []};

// ================== 메인 파이프라인 ==================
async function main(){
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
      if (r.cc > 100) metrics.over++;
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
  const O2_MAP = {
    '04-01':'A형입간판','04-02':'스텐/금속입간판','04-03':'오뚜기/원통',
    '02-01':'기본 안내판','02-06':'사인 플레이트',
    '07-03':'구조물 부속','07-04':'구조물 추가',
    '08-03':'주차금지/도로안전','08-10':'도로안전 부속',
    '09-09':'각종물품 특수',
    '01-01':'게시판 기본'
  };
  // O3 매핑 (입간판 04-01 A형)
  const O3_MAP = {
    '04-01-001':'청소중','04-01-002':'공사중/수리','04-01-003':'안전/경고',
    '04-01-004':'식당/카페/매장','04-01-005':'매장 운영',
    '04-01-007':'주의/위험','04-01-008':'금지/출입금지',
    '04-01-009':'주차/주차장','04-01-010':'CCTV(구버전)',
    '04-01-011':'CCTV/금연/촬영','04-01-012':'학교/학원/교육',
    '04-01-013':'기타/범용'
  };
  // 공간 코드 → 명칭 (체크박스 공간)
  const SPACE_MAP = {
    '02-01':'학교(초/중/고)','02-02':'유치원/학원','02-03':'대학교/연구소','02-04':'도서관/문화시설',
    '03-01':'식당/카페','03-02':'미용/뷰티/헬스','03-03':'스포츠시설',
    '04-01':'병원/의료기관/약국','04-02':'동물병원/펫샵',
    '05-01':'공장/제조업','05-02':'물류/창고','05-03':'자동차 관련',
    '06-01':'관공서','06-02':'공기업','06-03':'복지시설','06-04':'군/경시설',
    '06-05':'소방서','06-06':'사법기관','06-07':'공영주차장',
    '07-01':'소방업','07-02':'조경업','07-03':'보안업','07-04':'방역업',
    '08-01':'마트/유통업','08-02':'아울렛','08-03':'백화점','08-04':'영화관/공연장'
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
  const JUDGE_KR = {
    'OK':        {s:'정상',       d:'3차원 모두 정상',                     f:'-',                          p:0},
    'FIX_T':     {s:'업종 미연결', d:'업종 카테고리 미설정/부족',            f:'업종 9개 일괄 연결',           p:3},
    'FIX_O':     {s:'카테고리 오류', d:'상품별 3차 카테고리 부적합',          f:'상품명에 맞는 3차 코드로 교체', p:2},
    'FIX_CB':    {s:'과태깅',     d:'관심분야 체크박스 과다(30 초과)',      f:'체크박스 재정리',             p:1},
    'FIX_MULTI': {s:'복합 문제',   d:'2개 이상 차원에 문제',                f:'개별 확인 후 수정',           p:4},
    'FIX_ALL':   {s:'전체 미설정', d:'상품별+업종별+관심분야 모두 미설정',   f:'처음부터 재설정',             p:5},
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
      cc: r.cc || 0,
      ct: r.ct || 0,
      over: (r.cc > 30) ? 'O' : '',
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

  // 판정 → 제안(제안 변경값) 계산 · LLM 결과 우선
  function buildProposal(r) {
    const tCodes = (r.t||'').split(',').filter(x=>x);
    const tCurrent = tCodes.length ? tCodes.map(c=>T1_MAP[c]||c).join(', ') : '(미연결)';
    let oProp = '-', tProp = '-', cbProp = '-';
    const j = r.judge || 'OK';
    const hasT = ['FIX_T','FIX_ALL','FIX_MULTI'].includes(j);
    const hasO = ['FIX_O','FIX_ALL','FIX_MULTI'].includes(j);
    const hasCB = ['FIX_CB','FIX_ALL','FIX_MULTI'].includes(j);

    // LLM 결과 있으면 우선 사용
    const orig = RESULT.items.find(x => x.rgr === r.rgr);
    const llmO3 = orig && orig.llm_o3;
    const llmSpaces = orig && orig.llm_spaces;
    const llmReason = orig && orig.llm_reason;

    if (hasT) {
      const allT = ['01','02','03','04','05','06','07','08','09'];
      const missing = allT.filter(c => !tCodes.includes(c));
      if (missing.length) tProp = `9업종 전체 연결 (${missing.length}개 추가: ${missing.map(c=>T1_MAP[c]).join(', ')})`;
      else tProp = '유지';
    }
    if (hasO) {
      if (llmO3) {
        oProp = `🧠 + ${labelO(llmO3)}${llmReason ? '\n(' + llmReason.slice(0,40) + ')' : ''}`;
      } else {
        const m = (r.reason||'').match(/O3:(\d{2}-\d{2}-\d{3})/);
        oProp = m ? `+ ${labelO(m[1])}` : '상품별 3차 보완 필요 (🧠 LLM 판정 권장)';
      }
    }
    if (hasCB) {
      if (llmSpaces && llmSpaces.length) {
        const labeled = llmSpaces.map(labelSpace);
        cbProp = `🧠 해제 후 ${llmSpaces.length}개 공간 재체크:\n${labeled.slice(0,6).join('\n')}${llmSpaces.length>6?'\n...':''}`;
      } else {
        cbProp = `0 (체크 ${r.cc||0}개 전체 해제 · 🧠 LLM 판정 권장)`;
      }
    }
    return {oProp, tProp, cbProp, tCurrent};
  }

  // 스타일 헬퍼
  const STATUS_STYLE = {
    '정상':        {fill:'C6EFCE', font:'006100'},
    '과태깅':      {fill:'FFEB9C', font:'9C5700'},
    '업종 미연결':  {fill:'FFC7CE', font:'9C0006'},
    '카테고리 오류': {fill:'FFD580', font:'9C5700'},
    '복합 문제':   {fill:'F8CBAD', font:'9C0006'},
    '전체 미설정':  {fill:'F8CBAD', font:'9C0006'},
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

      // 헤더 정의 (before/after 비교)
      const H = [
        '#', '페이지', '상태', '판정', '상품명', 'RgrCode',
        '현재 상품별(O)', '제안 상품별 변경',
        '현재 업종수', '현재 연결 업종', '제안 업종 변경',
        '현재 체크수', '제안 체크 변경',
        '권장 조치',
      ];
      const colW = [{wch:4},{wch:6},{wch:12},{wch:10},{wch:40},{wch:20},
                    {wch:30},{wch:30},
                    {wch:8},{wch:30},{wch:38},
                    {wch:8},{wch:32},
                    {wch:24}];

      function buildAOA(items) {
        // 헤더 행
        const headerRow = H.map(h => styleCell(h, HEAD_STYLE));
        const rows = [headerRow];
        for (const r of items) {
          const stStyle = STATUS_STYLE[r.status] || {};
          const prop = buildProposal(r);
          const isFix = r.judge && r.judge !== 'OK';

          // 각 셀 스타일
          const c_status = styleCell(r.status, {fill: stStyle.fill, fontColor: stStyle.font, bold:true, align:'center'});
          const c_judge  = styleCell(r.judge,  {fill: stStyle.fill, fontColor: stStyle.font, align:'center'});
          const c_idx    = styleCell(r.idx,    {align:'center'});
          const c_page   = styleCell(r.page,   {align:'center'});
          const c_name   = styleCell(r.name,   {wrap:true});
          const c_rgr    = styleCell(r.rgr,    {font:'Consolas', align:'center'});
          // 상품별
          const c_oCurr  = styleCell(r.oDetail || (r.productType||'-'),
                                     (prop.oProp!=='-') ? CURR_STYLE_BAD : CURR_STYLE_OK);
          const c_oProp  = styleCell(prop.oProp, prop.oProp==='-' ? PROP_STYLE_NONE : PROP_STYLE_FIX);
          // 업종
          const c_tCount = styleCell(r.tCount,
                                     (prop.tProp!=='-' && prop.tProp!=='유지') ? CURR_STYLE_BAD : CURR_STYLE_OK);
          const c_tCurr  = styleCell(prop.tCurrent,
                                     (prop.tProp!=='-' && prop.tProp!=='유지') ? CURR_STYLE_BAD : CURR_STYLE_OK);
          const c_tProp  = styleCell(prop.tProp, prop.tProp==='-' ? PROP_STYLE_NONE : (prop.tProp==='유지' ? CURR_STYLE_OK : PROP_STYLE_FIX));
          // 체크수
          const c_cc     = styleCell(r.cc,
                                     (prop.cbProp!=='-') ? CURR_STYLE_BAD : CURR_STYLE_OK);
          const c_cbProp = styleCell(prop.cbProp, prop.cbProp==='-' ? PROP_STYLE_NONE : PROP_STYLE_FIX);
          // 권장 조치
          const c_fix = styleCell(r.fix, isFix ? {fill:'FEF3C7', fontColor:'92400E', bold:true} : PROP_STYLE_NONE);

          rows.push([c_idx, c_page, c_status, c_judge, c_name, c_rgr,
                     c_oCurr, c_oProp,
                     c_tCount, c_tCurr, c_tProp,
                     c_cc, c_cbProp,
                     c_fix]);
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

  // ============ LLM 판정 (Claude Haiku) ============
  function getApiKey() {
    return sessionStorage.getItem('hs_anthropic_key') || localStorage.getItem('hs_anthropic_key') || '';
  }

  const LLM_SYSTEM = `당신은 하나사인몰 어드민 카테고리 정리 도우미입니다.
입간판·안내판 등 사인물 상품의 상품명을 보고 적합한 '상품별 3차 코드(O3)'와 '체크할 공간 코드 목록'을 JSON으로 반환하세요.

[상품별 3차 코드 참고 - 입간판(04-01 A형)]
04-01-001 청소중
04-01-002 공사중/수리
04-01-003 안전/경고
04-01-004 식당/카페/매장
04-01-005 매장운영
04-01-007 주의/위험/주차금지/보행주의
04-01-008 금지/출입금지/반려동물 등
04-01-009 주차/주차장
04-01-011 CCTV/금연/촬영/방역
04-01-012 학교/학원/교육
04-01-013 기타(부동산, 분묘, 공통안내 등)

[공간 코드 체계 (체크박스 prefix 02~08)]
02 학교군: 02-01 학교(초/중/고), 02-02 유치원/학원, 02-03 대학교/연구소, 02-04 도서관/문화시설
03 식당/서비스군: 03-01 식당/카페, 03-02 미용/뷰티/헬스, 03-03 스포츠시설
04 의료군: 04-01 병원/의료기관/약국, 04-02 동물병원/펫샵
05 산업군: 05-01 공장/제조업, 05-02 물류/창고, 05-03 자동차 관련
06 공공/복지군: 06-01 관공서, 06-02 공기업, 06-03 복지시설, 06-04 군/경시설, 06-05 소방서, 06-06 사법기관, 06-07 공영주차장
07 전문서비스업: 07-01 소방업, 07-02 조경업, 07-03 보안업, 07-04 방역업
08 유통/상업군: 08-01 마트/유통업, 08-02 아울렛, 08-03 백화점, 08-04 영화관/공연장/놀이공원

[판단 원칙]
- 상품명에서 사용 용도/공간을 파악.
- "주차/요일제/오뚜기" → 주차 관련 (O3=04-01-009, 공간: 06-07 공영주차장 + 업종별 주차장).
- "CCTV/금연/촬영" → 04-01-011, 전업종 관련 공간.
- "학교/학원/초등" → 04-01-012, 02 학교군.
- "식당/카페/테이크아웃/선불" → 04-01-004, 03-01.
- "부동산/분묘/매매" → 04-01-013(기타), 업종 특정 어려우면 06(공공) + 07(전문서비스업).
- "안전작업/지게차/공사" → 04-01-002 or 04-01-003, 05 산업군.
- 확실치 않으면 o3="04-01-013"(기타), spaces는 상품명 힌트 기반 2~6개 선별.

[출력 형식]
JSON 배열만. 다른 텍스트·마크다운 금지.
[
  {"rgr":"240104151418_8287","o3":"04-01-009","spaces":["05-03","06-07","02-01"],"reason":"차량 요일제 주차"},
  ...
]`;

  function buildUserPrompt(batch){
    const lines = batch.map((r,i) => `${i+1}. [${r.rgr}] ${r.name} (현재 O=${r.o||'-'} · T=${r.t||'미연결'} · cc=${r.cc||0})`);
    return `다음 상품들에 대해 JSON 배열로 답하세요.\n\n${lines.join('\n')}`;
  }

  async function callClaude(apiKey, userPrompt){
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-api-key': apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true',
      },
      body: JSON.stringify({
        model:'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: LLM_SYSTEM,
        messages: [{role:'user', content: userPrompt}],
      }),
    });
    if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0,200));
    const j = await res.json();
    return j.content[0].text;
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
    const targets = RESULT.items.filter(it => it.judge && it.judge !== 'OK');
    if (!targets.length) { addLog('LLM 판정 대상 없음 (FIX 없음)', 'warn'); return; }

    $('ha-llm-run').disabled = true;
    $('ha-llm-run').textContent = 'LLM 판정 중...';
    const BATCH = 8;
    let done = 0, fail = 0;
    addLog(`🧠 LLM 판정 시작 · 대상 ${targets.length}건 · 배치 ${BATCH}개`, 'sys');

    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      $('ha-llm-status').textContent = `${done}/${targets.length} 처리 중...`;
      try {
        const text = await callClaude(apiKey, buildUserPrompt(batch));
        const arr = extractJSON(text);
        for (const a of arr) {
          const it = RESULT.items.find(x => x.rgr === a.rgr);
          if (it) {
            it.llm_o3 = a.o3;
            it.llm_spaces = a.spaces || [];
            it.llm_reason = a.reason || '';
            done++;
          }
        }
        addLog(`[LLM] 배치 ${i/BATCH+1} · ${batch.length}건 판정 완료`, 'ok');
      } catch(e) {
        addLog(`[LLM ERR] 배치 ${i/BATCH+1}: ${e.message}`, 'err');
        fail += batch.length;
      }
      await new Promise(r => setTimeout(r, 300));
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

  // ============ 자동 수정 섹션 ============
  const fixItems = sorted.filter(r => r.judge && r.judge.startsWith('FIX'));
  if (fixItems.length > 0) {
    const byJ = {};
    for (const r of fixItems) byJ[r.judge] = (byJ[r.judge]||0) + 1;
    const statsParts = [];
    if (byJ.FIX_T)     statsParts.push(`FIX_T ${byJ.FIX_T}건 (업종 9개 연결)`);
    if (byJ.FIX_O)     statsParts.push(`FIX_O ${byJ.FIX_O}건 (상품별 3차 추가)`);
    if (byJ.FIX_CB)    statsParts.push(`FIX_CB ${byJ.FIX_CB}건 (체크박스 전체 해제)`);
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
  const confirmMsg = `FIX 판정 ${fixItems.length}건을 자동 수정합니다.\n\n` +
    `• FIX_T: 업종 9개 일괄 연결\n` +
    `• FIX_O: 상품별 3차 카테고리 추가 (LLM/reason 우선)\n` +
    `• FIX_CB: 체크박스 전체 해제 + LLM 공간 재체크\n\n` +
    `🛡️ 수정 전에 롤백용 현재 상태 백업을 자동 다운로드합니다.\n` +
    `⚠️ 수정은 되돌리기 어려우니 백업 파일을 꼭 보관하세요. 계속?`;
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
      before: { o: it.o, t: it.t, cc: it.cc, ct: it.ct, cd: it.cd || {} },
      planned: {
        o3_add: it.llm_o3 || (it.reason && (it.reason.match(/O3:(\d{2}-\d{2}-\d{3})/)||[])[1]) || null,
        spaces_recheck: it.llm_spaces || [],
        llm_reason: it.llm_reason || '',
      }
    })),
    // 참고: 전체 감사 스냅샷도 포함 (복원 시 대조용)
    all_items_snapshot: (window.HS_AUDIT_RESULT && window.HS_AUDIT_RESULT.items || []).map(it => ({
      rgr: it.rgr, o: it.o, t: it.t, cc: it.cc
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

async function fixOne(item) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-hs-audit', '1');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1024px;height:768px;border:0;pointer-events:none;opacity:0.01';
  iframe.src = `/AdminManager/MakeGoodsTypeOneDp.php?RgrCode=${item.rgr}&EditMode=1`;
  document.body.appendChild(iframe);
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(()=>rej(new Error('iframe 로드 타임아웃')), 20000);
      iframe.onload = () => { clearTimeout(t); res(); };
    });
    // JS 초기화 대기 (catO/T select 서버값 적용 포함)
    await new Promise(r => setTimeout(r, 2500));
    const doc = iframe.contentDocument;
    const results = [];

    const judge = item.judge;
    const isT  = judge === 'FIX_T'  || judge === 'FIX_ALL' || judge === 'FIX_MULTI';
    const isO  = judge === 'FIX_O'  || judge === 'FIX_ALL' || judge === 'FIX_MULTI';
    const isCB = judge === 'FIX_CB' || judge === 'FIX_ALL' || judge === 'FIX_MULTI';

    // 현재 연결된 업종 읽기
    const connectedT = new Set();
    for (let i=1; i<=30; i++) {
      const h = doc.querySelector(`input[name="SelectCatoryCodeTwo_${i}"]`);
      if (h && h.value) connectedT.add(h.value.split('^')[0]);
    }

    if (isT) {
      const missing = ['01','02','03','04','05','06','07','08','09'].filter(c => !connectedT.has(c));
      if (missing.length) {
        for (const code of missing) {
          const t1 = doc.getElementById('CateCodeT_1');
          if (!t1) break;
          t1.value = code;
          t1.dispatchEvent(new Event('change'));
          await new Promise(r => setTimeout(r, 400));
          const btn = Array.from(doc.querySelectorAll('button')).find(b => {
            const oc = b.getAttribute('onclick') || '';
            return oc.includes('CateCodeT_4') && oc.includes("'2'");
          });
          if (btn) btn.click();
          await new Promise(r => setTimeout(r, 500));
        }
        results.push(`T+${missing.length}업종`);
      } else {
        results.push('T이미완료');
      }
    }

    if (isCB) {
      const CBR = /^(\d{2})`\d`(\d{2}-\d{2})`/;
      // 1) 기존 체크 전부 해제
      const checked = Array.from(doc.querySelectorAll('input[type="checkbox"]:checked')).filter(x => CBR.test(x.value||''));
      for (let i=0; i<checked.length; i++) {
        checked[i].click();
        if ((i+1) % 30 === 0) await new Promise(r => setTimeout(r, 400));
        else await new Promise(r => setTimeout(r, 80));
      }
      // 2) LLM 제안 공간 있으면 재체크
      if (item.llm_spaces && item.llm_spaces.length) {
        await new Promise(r => setTimeout(r, 500));
        let recheck = 0;
        const allCb = Array.from(doc.querySelectorAll('input[type="checkbox"]')).filter(x => CBR.test(x.value||''));
        for (const target of item.llm_spaces) {
          // value 패턴: XX`d`target` (예: 05`5`05-01`)
          const cands = allCb.filter(x => {
            const m = (x.value||'').match(CBR);
            return m && m[2] === target;
          });
          for (const c of cands) {
            if (!c.checked) { c.click(); recheck++; await new Promise(r => setTimeout(r, 80)); }
          }
        }
        results.push(`CB-${checked.length}+${recheck}`);
      } else {
        results.push(`CB-${checked.length}`);
      }
    }

    if (isO && (item.llm_o3 || (item.reason && item.reason.includes('O3')))) {
      // LLM 결과 우선, 없으면 reason에서 추출
      let expectO3 = item.llm_o3;
      if (!expectO3) {
        const m = item.reason.match(/O3:(\d{2}-\d{2}-\d{3})/);
        if (m) expectO3 = m[1];
      }
      if (expectO3) {
        const parts = expectO3.split('-');
        const c1 = parts[0];
        const c2 = parts[0]+'-'+parts[1];
        const c3 = expectO3;
        // catO1
        let sel = doc.getElementById('CateCodeO_1');
        if (sel) { sel.value = c1; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 600)); }
        sel = doc.getElementById('CateCodeO_2');
        if (sel) { sel.value = c2; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 600)); }
        sel = doc.getElementById('CateCodeO_3');
        if (sel) { sel.value = c3; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 400)); }
        // 상품별 추가 버튼 클릭
        const btn = Array.from(doc.querySelectorAll('button')).find(b => {
          const oc = b.getAttribute('onclick') || '';
          return oc.includes('CateCodeO_4') && oc.includes("'1'");
        });
        if (btn) {
          btn.click();
          await new Promise(r => setTimeout(r, 800));
          results.push(`O+${c3}`);
        } else {
          results.push('O:버튼없음');
        }
      }
    }

    return results.join(',') || '변경없음';
  } finally {
    iframe.remove();
  }
}

main().catch(e => addLog('치명적 오류: ' + e.message, 'err'));

// 외부에서 결과 접근
window.HS_AUDIT_RESULT = RESULT;
console.log('[하나사인몰 실시간 감사] 실행 중. window.HS_AUDIT_RESULT 로 결과 접근 가능.');

})();
