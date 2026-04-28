/* 하나사인몰 박스별 검수·자동수정 대시보드 v11.0.16.2 (2026-04-28)
 * - 어드민 편집 / GoodsList 페이지 모두 지원
 * - 큰 패널, 필터, 자사몰 노출 검증, 자동수정 일괄 버튼 통합
 */
(async function(){
  const url = location.href;
  const isEdit = /MakeGoodsTypeOneDp\.php/.test(url);
  const isList = /GoodsList\.php/.test(url);
  if(!isEdit && !isList){
    alert('어드민 편집 페이지(MakeGoodsTypeOneDp) 또는 목록 페이지(GoodsList)에서 실행하세요.');
    return;
  }

  // === 공통 함수 ===
  function analyzeBoxes(rootDoc){
    const allCb = Array.from(rootDoc.querySelectorAll('input[type=checkbox]'));
    const hidO = Array.from(rootDoc.querySelectorAll('input[type=hidden]'))
      .filter(i=>/SelectCatoryCodeOne_[123]$/.test(i.name||'') && i.value)
      .map(i=>i.value.split('^')[0]);
    const boxes = {};
    allCb.forEach(cb=>{
      const m = (cb.name||'').match(/^SelOptCat1_(\d+)_(\d+)_(\d+)$/);
      if(!m) return;
      const t = (cb.value||'').split('`');
      const dim = (t[2]||'').split('-')[0];
      const k = '1_'+m[1];
      if(!boxes[k]) boxes[k] = {catO1:t[0], items:[]};
      boxes[k].items.push({name:cb.name, dim, sub:t[2], optType:t[1], label:t[3], checked:cb.checked});
    });
    return Object.entries(boxes).map(([k, b])=>{
      const d4items = b.items.filter(x=>x.dim==='04' && x.checked);
      const d5items = b.items.filter(x=>x.dim==='05' && x.checked);
      const d4 = d4items.length;
      const d5 = d5items.length;
      const total = b.items.filter(x=>x.checked).length;
      const ghost = !hidO.includes(b.catO1);
      let v;
      if(ghost) v = 'GHOST';
      else if(d4>=9 && d5>=1) v = 'OK';
      else if(d4===0 && d5===0) v = 'EMPTY';
      else v = 'PARTIAL';
      return {box:k, catO1:b.catO1, total, d4, d5, ghost, judge:v, allItems:b.items};
    });
  }

  function rowJudge(boxes){
    const real = boxes.filter(b=>!b.ghost);
    if(real.length===0) return 'GHOST_ONLY';
    if(real.every(b=>b.judge==='OK')) return 'OK';
    if(real.some(b=>b.judge==='EMPTY')) return 'EMPTY';
    return 'PARTIAL';
  }

  const COLORS = {
    OK:'#d5f5e3', PARTIAL:'#fcf3cf', EMPTY:'#fadbd8', GHOST:'#e8daef',
    GHOST_ONLY:'#e8daef'
  };
  const ICONS = {OK:'✅', PARTIAL:'⚠', EMPTY:'❌', GHOST:'👻', GHOST_ONLY:'👻'};

  // === 패널 ===
  let panel = document.getElementById('__boxAuditPanel');
  if(panel) panel.remove();
  panel = document.createElement('div');
  panel.id = '__boxAuditPanel';
  panel.style.cssText = `
    position:fixed; top:20px; left:50%; transform:translateX(-50%);
    background:#fff; border:none; padding:0; z-index:99999;
    box-shadow:0 8px 32px rgba(0,0,0,0.4); border-radius:8px;
    width:96vw; max-width:1400px; max-height:90vh; overflow:hidden;
    font-family:'맑은 고딕',sans-serif; font-size:13px; display:flex; flex-direction:column;
  `;
  document.body.appendChild(panel);

  function setPanel(html){ panel.innerHTML = html; }
  function $(sel){ return panel.querySelector(sel); }

  // === 단건 (편집 페이지) ===
  if(isEdit){
    const rgr = (url.match(/RgrCode=([^&]+)/)||[])[1] || '';
    const goodsName = (document.querySelector('input[name="GoodsName"]')||{}).value || '';
    const summary = analyzeBoxes(document);
    const overall = rowJudge(summary);

    let h = `
      <div style="background:#305496;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:16px;font-weight:bold">📋 박스별 검수 — ${rgr}</div>
          <div style="font-size:12px;opacity:.85;margin-top:2px">${goodsName||'(상품명 없음)'} · 종합: ${ICONS[overall]} ${overall}</div>
        </div>
        <button id="__bap_close" style="background:transparent;border:1px solid #fff;color:#fff;padding:6px 14px;cursor:pointer;border-radius:4px">닫기 ×</button>
      </div>
      <div style="padding:14px 18px;overflow:auto;flex:1">
    `;
    h += `<table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:12px">
      <thead><tr style="background:#5b9bd5;color:#fff">
        <th style="padding:6px">박스</th><th>catO1</th><th>총 체크</th><th>업종 D4</th><th>공간 D5</th><th>판정</th><th>자사몰 검증</th>
      </tr></thead><tbody>`;
    summary.forEach(s=>{
      const link = !s.ghost && rgr ? `<a href="https://www.hanasignmall.kr/Search.php?GetSearch=${rgr}&CCode=${s.catO1}&CateCou=1&RsSeaTxt=%60opt%2305-01%40%EC%A3%BC%EC%B0%A8%EC%9E%A5%401360" target="_blank" style="color:#2e75b6;text-decoration:none">${s.catO1}+주차장 →</a>` : '<span style="color:#999">-</span>';
      h += `<tr style="background:${COLORS[s.judge]}">
        <td style="padding:6px;text-align:center;font-weight:bold">${s.box}</td>
        <td style="text-align:center">${s.catO1}</td>
        <td style="text-align:center">${s.total}</td>
        <td style="text-align:center"><b>${s.d4}/9</b></td>
        <td style="text-align:center"><b>${s.d5}</b></td>
        <td style="text-align:center;font-weight:bold">${ICONS[s.judge]} ${s.judge}</td>
        <td style="text-align:center">${link}</td>
      </tr>`;
    });
    h += `</tbody></table>`;

    // 자동수정 액션 미리보기 (필요 시)
    const needFix = summary.some(s=>!s.ghost && s.judge!=='OK');
    if(needFix){
      h += `<div style="margin-top:8px;padding:10px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px">
        <b>⚠ 일부 박스가 표준(D4=9 D5≥1) 미달.</b> 자동수정은 별도 자동수정 엔진으로 진행하세요.
      </div>`;
    }
    h += `</div>`;
    setPanel(h);
    $('#__bap_close').onclick = ()=>panel.remove();
    return;
  }

  // === 일괄 (목록 페이지) ===
  if(isList){
    setPanel(`<div style="padding:30px;text-align:center"><div style="font-size:16px;margin-bottom:10px">⏳ 일괄 박스별 감사 중...</div><div id="__bap_progress" style="font-size:13px;color:#666"></div></div>`);

    // RgrCode 추출 — 행 단위 + 페이지 전체 검색 fallback
    const rowMatch = Array.from(document.querySelectorAll('tr')).map(tr=>{
      const m = tr.innerText.match(/(\d{12}_\d{4})/);
      if(!m) return null;
      const rgr = m[1];
      const cells = Array.from(tr.querySelectorAll('td'));
      // 상품명 추출 — 가장 긴 비-숫자 텍스트
      let name = '';
      cells.forEach(c=>{
        const t = c.innerText.trim();
        if(t.length > name.length && !/^\d+$/.test(t) && !/^[A-Z0-9]+$/.test(t) && t !== rgr && t.length < 80){
          name = t;
        }
      });
      return {rgr, name};
    }).filter(Boolean);

    let rgrs = Array.from(new Map(rowMatch.map(r=>[r.rgr, r])).values());
    if(rgrs.length === 0){
      // fallback: HTML 전체 정규식
      const html = document.body.innerHTML;
      const matches = Array.from(new Set(html.match(/\d{12}_\d{4}/g) || []));
      rgrs = matches.map(rgr=>({rgr, name:''}));
    }
    rgrs = rgrs.slice(0, 30);

    if(rgrs.length === 0){
      setPanel(`<div style="padding:30px"><h3>RgrCode를 찾을 수 없습니다.</h3></div>`);
      return;
    }

    const total = rgrs.length;
    const results = [];
    for(let i=0;i<rgrs.length;i+=5){
      const chunk = rgrs.slice(i, i+5);
      const arr = await Promise.all(chunk.map(async ({rgr, name})=>{
        try{
          const r = await fetch('/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+rgr+'&EditMode=1',{credentials:'include',cache:'no-store'});
          const txt = await r.text();
          const doc = new DOMParser().parseFromString(txt,'text/html');
          // 상품명 fallback
          let realName = name;
          if(!realName){
            const ni = doc.querySelector('input[name="GoodsName"]');
            if(ni && ni.value) realName = ni.value;
          }
          return {rgr, name:realName, boxes: analyzeBoxes(doc)};
        }catch(e){ return {rgr, name, err:String(e).slice(0,50)}; }
      }));
      results.push(...arr);
      const p = $('#__bap_progress'); if(p) p.textContent = `${results.length} / ${total}`;
    }

    // 통계
    const stat = {OK:0, PARTIAL:0, EMPTY:0, GHOST_ONLY:0, ERR:0};
    results.forEach(r=>{
      if(r.err) stat.ERR++;
      else stat[rowJudge(r.boxes)]++;
    });

    // 카테고리(catO1) 자동 감지 (URL의 CodeT1_1 파라미터)
    const catParam = (url.match(/CodeT1_1=([^&]+)/)||[])[1] || '';

    // 페이지 정보
    const pageNum = (url.match(/page=(\d+)/)||[])[1] || '1';

    // === 헤더 + 필터 ===
    let h = `
      <div style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-be