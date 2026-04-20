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
  scale: 2.25,             // 대시보드 크기 배율 (1=기본, 2.25=225%)
}, window.HS_AUDIT_CONFIG || {});

// 기존 대시보드가 있으면 제거
const prev = document.getElementById('hs-audit-root');
if (prev) prev.remove();

// ================== UI 생성 ==================
const root = document.createElement('div');
root.id = 'hs-audit-root';
root.innerHTML = `
<style>
  #hs-audit-root, #hs-audit-root * { box-sizing: border-box; font-family: -apple-system, "Noto Sans KR", "Segoe UI", sans-serif; }
  #hs-audit-root {
    position: fixed; top: 16px; right: 16px; z-index: 999999;
    width: calc(520px * var(--hs-scale, 1.5));
    max-height: calc(100vh - 32px);
    background: #0a0e1a; color: #e4e9f0; border: 1px solid #1e293b;
    border-radius: 12px; box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    display: flex; flex-direction: column; overflow: hidden;
    font-size: calc(12px * var(--hs-scale, 1.5));
    line-height: 1.5;
  }
  #hs-audit-root.minimized { width: calc(320px * var(--hs-scale, 1.5)); max-height: 60px; }
  #hs-audit-root .ha-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; background: #111827; border-bottom: 1px solid #1e293b;
    cursor: move;
  }
  #hs-audit-root .ha-title { font-size: 13px; font-weight: 700; letter-spacing: -0.3px; }
  #hs-audit-root .ha-title .ha-live {
    display: inline-block; width: 7px; height: 7px; background: #22c55e;
    border-radius: 50%; margin-right: 6px; animation: ha-pulse 1.5s infinite;
  }
  @keyframes ha-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  #hs-audit-root .ha-ctrl { display: flex; gap: 6px; }
  #hs-audit-root .ha-btn {
    background: #1e293b; color: #cbd5e1; border: 0; border-radius: 4px;
    padding: 4px 8px; font-size: 11px; cursor: pointer;
  }
  #hs-audit-root .ha-btn:hover { background: #334155; }
  #hs-audit-root .ha-btn.primary { background: #3b82f6; color: #fff; }
  #hs-audit-root .ha-btn.primary:hover { background: #2563eb; }
  #hs-audit-root .ha-btn.danger { background: #991b1b; color: #fecaca; }
  #hs-audit-root .ha-body { padding: 14px; overflow-y: auto; flex: 1; }
  #hs-audit-root.minimized .ha-body { display: none; }

  #hs-audit-root .ha-metrics { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; margin-bottom: 12px; }
  #hs-audit-root .ha-mc { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; text-align: center; }
  #hs-audit-root .ha-mc .l { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; }
  #hs-audit-root .ha-mc .v { font-size: 18px; font-weight: 700; margin-top: 2px; font-family: "SF Mono", monospace; }
  #hs-audit-root .ha-mc.ok .v { color: #22c55e; }
  #hs-audit-root .ha-mc.warn .v { color: #f59e0b; }
  #hs-audit-root .ha-mc.err .v { color: #ef4444; }
  #hs-audit-root .ha-mc.blue .v { color: #3b82f6; }

  #hs-audit-root .ha-steps { display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; margin-bottom: 12px; }
  #hs-audit-root .ha-st { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; position: relative; overflow: hidden; }
  #hs-audit-root .ha-st.active { border-color: #3b82f6; background: #0f1b33; }
  #hs-audit-root .ha-st.done { border-color: #22c55e; background: #0a1f13; }
  #hs-audit-root .ha-st .n { font-size: 9px; color: #475569; font-weight: 700; }
  #hs-audit-root .ha-st .t { font-size: 11px; font-weight: 600; margin-top: 2px; }
  #hs-audit-root .ha-st.active .t { color: #60a5fa; }
  #hs-audit-root .ha-st.done .t { color: #86efac; }
  #hs-audit-root .ha-st .b { position: absolute; bottom: 0; left: 0; height: 2px; background: #3b82f6; width: 0; transition: width 0.2s; }
  #hs-audit-root .ha-st.done .b { width: 100% !important; background: #22c55e; }

  #hs-audit-root .ha-pg { display: grid; grid-template-columns: repeat(5,1fr); gap: 4px; margin-bottom: 10px; }
  #hs-audit-root .ha-pgc { background: #0f172a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px; text-align: center; font-size: 10px; }
  #hs-audit-root .ha-pgc.done { border-color: #16a34a; }
  #hs-audit-root .ha-pgc .pn { color: #64748b; font-weight: 600; }
  #hs-audit-root .ha-pgc .pc { color: #3b82f6; font-size: 14px; font-weight: 700; font-family: "SF Mono", monospace; }
  #hs-audit-root .ha-pgc.done .pc { color: #22c55e; }

  #hs-audit-root .ha-cur { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; font-family: "SF Mono", monospace; font-size: calc(13px * var(--hs-scale, 1.5)); line-height: 1.7; min-height: 80px; margin-bottom: 10px; }
  #hs-audit-root .ha-cur .l { color: #64748b; font-weight: 600; }
  #hs-audit-root .ha-cur .c { color: #60a5fa; }
  #hs-audit-root .ha-cur .n { color: #fbbf24; }
  #hs-audit-root .ha-cur .j { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; margin-left: 6px; }
  #hs-audit-root .ha-cur .j.ok { background: #14532d; color: #86efac; }
  #hs-audit-root .ha-cur .j.warn { background: #78350f; color: #fcd34d; }
  #hs-audit-root .ha-cur .j.err { background: #7f1d1d; color: #fca5a5; }

  #hs-audit-root .ha-log { background: #020617; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; height: calc(180px * var(--hs-scale, 1.5)); overflow-y: auto; font-family: "SF Mono", monospace; font-size: calc(14px * var(--hs-scale, 1.5)); line-height: 1.7; }
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
  #hs-audit-root .ha-done-area.show { display: block; }
  #hs-audit-root .ha-done-area .t { font-size: 11px; color: #60a5fa; font-weight: 600; margin-bottom: 6px; }
  #hs-audit-root .ha-done-area .m { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
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
  <div style="font-size:11px;color:#94a3b8;margin-bottom:10px" id="ha-sub">
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
  </div>
</div>
`;
document.body.appendChild(root);
root.style.setProperty('--hs-scale', String(CFG.scale));

// ================== 헬퍼 ==================
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fmtT(sec){const m=Math.floor(sec/60);const s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}

const startT = Date.now();
const startStr = new Date().toTimeString().slice(0,8);
$('ha-start-t').textContent = startStr;
const clockTimer = setInterval(() => {
  const e = Math.floor((Date.now() - startT) / 1000);
  $('ha-elapsed').textContent = fmtT(e);
}, 200);

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

// 현재 검색 필터의 전체 페이지 자동 감지
async function detectTotalPages() {
  // 현재 페이지가 GoodsList.php이면 바로 파싱, 아니면 page=1로 fetch
  let doc = document;
  if (!location.pathname.includes('GoodsList.php')) {
    const url = `/AdminManager/GoodsList.php?page=1&startpage=1&CodeT1_1=${CFG.cat}&viewCnt=${CFG.viewCnt}`;
    const res = await fetch(url, {credentials:'include'});
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
  const url = `/AdminManager/GoodsList.php?page=${page}&startpage=1&CodeT1_1=${CFG.cat}&viewCnt=${CFG.viewCnt}`;
  addLog(`GET GoodsList.php?page=${page}`, 'info');
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
  const pgCols = Math.min(CFG.pages.length, 10);
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
    // 상품별 세부 (2차/3차)
    const oDetail = oCodes.slice(1).join(' ') || '-';
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

  // ============ XLSX (색상 포맷) ============
  async function loadSheetJS() {
    if (window.XLSX) return window.XLSX;
    addLog('SheetJS 로딩 중 (xlsx 지원)...', 'sys');
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    return window.XLSX;
  }

  $('ha-dl-xlsx').onclick = async () => {
    try {
      const XLSX = await loadSheetJS();
      const wb = XLSX.utils.book_new();
      const colW = [{wch:4},{wch:6},{wch:12},{wch:45},{wch:22},{wch:10},{wch:28},{wch:6},{wch:38},{wch:6},{wch:6},{wch:22}];

      // 시트1: 전체
      const aoa1 = [HEADERS].concat(sorted.map(toRow));
      const ws1 = XLSX.utils.aoa_to_sheet(aoa1);
      ws1['!cols'] = colW;
      ws1['!freeze'] = {xSplit:0, ySplit:1};
      XLSX.utils.book_append_sheet(wb, ws1, '전체감사결과');

      // 시트2: 수정필요
      const fixItems = sorted.filter(r => r.judge && r.judge !== 'OK');
      if (fixItems.length > 0) {
        const aoa2 = [HEADERS].concat(fixItems.map(toRow));
        const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
        ws2['!cols'] = colW;
        XLSX.utils.book_append_sheet(wb, ws2, `수정필요_${fixItems.length}건`);
      }

      // 시트3: 요약
      const byJudge = {};
      for (const r of sorted) byJudge[r.status] = (byJudge[r.status]||0)+1;
      const sumRows = [['판정','건수','비율']];
      const total = sorted.length;
      Object.entries(byJudge).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
        sumRows.push([k, v, ((v/total)*100).toFixed(1)+'%']);
      });
      sumRows.push(['합계', total, '100%']);
      const ws3 = XLSX.utils.aoa_to_sheet(sumRows);
      ws3['!cols'] = [{wch:20},{wch:8},{wch:10}];
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

  setStep(4, 100);
  for (let i = 1; i <= 4; i++) $('ha-s'+i).classList.add('done');
  addLog('파이프라인 종료. 다운로드 버튼 활성', 'sys');
  clearInterval(clockTimer);
}

main().catch(e => addLog('치명적 오류: ' + e.message, 'err'));

// 외부에서 결과 접근
window.HS_AUDIT_RESULT = RESULT;
console.log('[하나사인몰 실시간 감사] 실행 중. window.HS_AUDIT_RESULT 로 결과 접근 가능.');

})();
