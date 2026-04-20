/**
 * 하나사인몰 어드민 실시간 감사 대시보드 (v1 · 2026-04-20)
 *
 * 사용법:
 *   1) ad.hanasm.kr 로그인 탭에서 F12 → Console
 *   2) 이 파일 전체 내용 붙여넣기 → Enter
 *   또는 북마클릿/리더:
 *      fetch('https://raw.githubusercontent.com/sangjunepark-beep/hanasignmall-cowork/main/realtime_audit.js')
 *        .then(r=>r.text()).then(eval)
 *
 * 기본 범위: 입간판(카테고리 04) 1~4페이지 × 30 = 120개
 * 변경: window.HS_AUDIT_CONFIG = {cat:'04', pages:[1,2,3,4,5], viewCnt:30, batch:10, pace:300}
 *        로 지정 후 재실행
 */
(function(){
'use strict';

// ================== 설정 ==================
const CFG = Object.assign({
  cat: '04',               // 카테고리 코드 (04=입간판)
  catName: '입간판',
  pages: [1, 2, 3, 4],     // 대상 페이지
  viewCnt: 30,             // 페이지당 상품 수
  batch: 10,               // fetch 병렬 묶음
  pace: 300,               // 각 상품 UI 업데이트 후 지연 (ms) — 시연용
  batchGap: 400,           // 배치 간 간격 (ms)
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
    width: 520px; max-height: calc(100vh - 32px);
    background: #0a0e1a; color: #e4e9f0; border: 1px solid #1e293b;
    border-radius: 12px; box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    display: flex; flex-direction: column; overflow: hidden;
    font-size: 12px; line-height: 1.5;
  }
  #hs-audit-root.minimized { width: 320px; max-height: 60px; }
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

  #hs-audit-root .ha-cur { background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; font-family: "SF Mono", monospace; font-size: 11px; line-height: 1.7; min-height: 80px; margin-bottom: 10px; }
  #hs-audit-root .ha-cur .l { color: #64748b; font-weight: 600; }
  #hs-audit-root .ha-cur .c { color: #60a5fa; }
  #hs-audit-root .ha-cur .n { color: #fbbf24; }
  #hs-audit-root .ha-cur .j { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; margin-left: 6px; }
  #hs-audit-root .ha-cur .j.ok { background: #14532d; color: #86efac; }
  #hs-audit-root .ha-cur .j.warn { background: #78350f; color: #fcd34d; }
  #hs-audit-root .ha-cur .j.err { background: #7f1d1d; color: #fca5a5; }

  #hs-audit-root .ha-log { background: #020617; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; height: 180px; overflow-y: auto; font-family: "SF Mono", monospace; font-size: 10px; line-height: 1.6; }
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
    카테고리 ${CFG.cat} · ${CFG.pages.length}페이지 × ${CFG.viewCnt}개 = <b>${CFG.pages.length*CFG.viewCnt}개 대상</b>
    · 시작시각 <span id="ha-start-t">--:--</span> · 경과 <span id="ha-elapsed">00:00</span>
  </div>

  <div class="ha-metrics">
    <div class="ha-mc blue"><div class="l">전체</div><div class="v" id="ha-total">${CFG.pages.length*CFG.viewCnt}</div></div>
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
      <button class="ha-btn primary" id="ha-dl-json">JSON 다운로드</button>
      <button class="ha-btn primary" id="ha-dl-csv">CSV 다운로드</button>
      <button class="ha-btn" id="ha-copy-json">JSON 복사</button>
    </div>
  </div>
</div>
`;
document.body.appendChild(root);

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

// ================== 페이지 셀 렌더 ==================
const pgEl = $('ha-pg');
CFG.pages.forEach(p => {
  const el = document.createElement('div');
  el.className = 'ha-pgc';
  el.id = 'ha-pgc-' + p;
  el.innerHTML = `<div class="pn">${p}P</div><div class="pc"><span id="ha-pgc-${p}-c">0</span>/${CFG.viewCnt}</div>`;
  pgEl.appendChild(el);
});

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
  addLog('파이프라인 시작 · 카테고리=' + CFG.cat + ' (' + CFG.catName + ')', 'sys');
  addLog('로그인 세션 확인: document.cookie 공유', 'sys');

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

  // JSON 다운로드
  $('ha-dl-json').onclick = () => {
    const blob = new Blob([JSON.stringify(RESULT, null, 2)], {type:'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `입간판_실시간감사_${CFG.pages.join('-')}페이지_${startStr.replace(/:/g,'')}.json`;
    a.click();
    addLog('JSON 다운로드 시작', 'ok');
  };
  // CSV 다운로드
  $('ha-dl-csv').onclick = () => {
    const header = ['페이지','RgrCode','상품명','상품별O','업종T','체크수','총체크박스','판정'];
    const rows = [header];
    for (const r of RESULT.items) {
      rows.push([r.page, r.rgr, `"${(r.name||'').replace(/"/g,'""')}"`, r.o, r.t, r.cc, r.ct, r.judge]);
    }
    const csv = '\ufeff' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `입간판_실시간감사_${CFG.pages.join('-')}페이지_${startStr.replace(/:/g,'')}.csv`;
    a.click();
    addLog('CSV 다운로드 시작', 'ok');
  };
  // JSON 복사
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
