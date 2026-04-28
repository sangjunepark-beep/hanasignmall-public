/* 하나사인몰 박스별 검수 북마클릿 v11.0.16 (2026-04-28)
 * - 편집 페이지(MakeGoodsTypeOneDp.php): 단건 박스별 분포 + 자사몰 노출 검증 링크
 * - 목록 페이지(GoodsList.php): 페이지 전체(30건) 일괄 박스별 감사 → 표
 * - read-only (자동수정 없음)
 */
(async function(){
  const url = location.href;
  const isEdit = /MakeGoodsTypeOneDp\.php/.test(url);
  const isList = /GoodsList\.php/.test(url);

  if(!isEdit && !isList){
    alert('어드민 편집 페이지(MakeGoodsTypeOneDp) 또는 목록 페이지(GoodsList)에서 실행하세요.');
    return;
  }

  // === 박스 분석 함수 (DOM 또는 fetch된 doc 모두 지원) ===
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
      boxes[k].items.push({dim, sub:t[2], label:t[3], checked:cb.checked});
    });
    return Object.entries(boxes).map(([k, b])=>{
      const d4 = b.items.filter(x=>x.dim==='04' && x.checked).length;
      const d5 = b.items.filter(x=>x.dim==='05' && x.checked).length;
      const total = b.items.filter(x=>x.checked).length;
      const ghost = !hidO.includes(b.catO1);
      let v;
      if(ghost) v = 'GHOST';
      else if(d4>=9 && d5>=1) v = 'OK';
      else if(d4===0 && d5===0) v = 'EMPTY';
      else v = 'PARTIAL';
      return {box:k, catO1:b.catO1, total, d4, d5, ghost, judge:v};
    });
  }

  // === 결과 패널 (재사용) ===
  function showPanel(html){
    let p = document.getElementById('__boxAuditPanel');
    if(p) p.remove();
    p = document.createElement('div');
    p.id = '__boxAuditPanel';
    p.style.cssText = 'position:fixed;top:10px;right:10px;background:#fff;border:2px solid #305496;padding:14px;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:680px;max-height:90vh;overflow:auto;font-family:맑은 고딕,sans-serif;font-size:12px;';
    p.innerHTML = html + '<div style="text-align:right;margin-top:8px"><button id="__bap_close" style="padding:4px 12px;cursor:pointer">닫기</button></div>';
    document.body.appendChild(p);
    document.getElementById('__bap_close').onclick = ()=>p.remove();
  }

  function judgeColor(v){
    return {OK:'#d5f5e3', PARTIAL:'#fcf3cf', EMPTY:'#fadbd8', GHOST:'#e8daef'}[v] || '#fff';
  }
  function judgeIcon(v){
    return {OK:'✅', PARTIAL:'⚠', EMPTY:'❌', GHOST:'👻'}[v] || '';
  }

  // === 편집 페이지 (단건) ===
  if(isEdit){
    const rgr = (url.match(/RgrCode=([^&]+)/)||[])[1] || '';
    const summary = analyzeBoxes(document);

    let html = '<h3 style="margin:0 0 8px">📋 박스별 검수 — '+rgr+'</h3>';
    html += '<table style="border-collapse:collapse;font-size:12px;width:100%">';
    html += '<tr style="background:#305496;color:#fff"><th style="padding:4px">박스</th><th>catO1</th><th>총체크</th><th>업종 D4</th><th>공간 D5</th><th>판정</th></tr>';
    summary.forEach(s=>{
      html += '<tr style="background:'+judgeColor(s.judge)+'">';
      html += '<td style="padding:4px;text-align:center">'+s.box+'</td>';
      html += '<td style="text-align:center">'+s.catO1+'</td>';
      html += '<td style="text-align:center">'+s.total+'</td>';
      html += '<td style="text-align:center">'+s.d4+'/9</td>';
      html += '<td style="text-align:center">'+s.d5+'</td>';
      html += '<td style="text-align:center">'+judgeIcon(s.judge)+' '+s.judge+'</td>';
      html += '</tr>';
    });
    html += '</table>';

    // 자사몰 노출 확인 링크 (정상 박스만)
    if(rgr){
      html += '<h4 style="margin:10px 0 4px">🔗 자사몰 노출 검증 (CCode + 주차장)</h4>';
      summary.filter(s=>!s.ghost).forEach(s=>{
        const link = 'https://www.hanasignmall.kr/Search.php?GetSearch='+rgr+'&CCode='+s.catO1+'&CateCou=1&RsSeaTxt=%60opt%2305-01%40%EC%A3%BC%EC%B0%A8%EC%9E%A5%401360';
        html += '<a href="'+link+'" target="_blank" style="display:inline-block;margin:2px 6px 2px 0;padding:3px 8px;background:#eee;border-radius:3px;text-decoration:none;color:#333">'+s.catO1+' + 주차장 →</a>';
      });
      html += '<div style="font-size:11px;color:#888;margin-top:4px">※ 박스가 OK여야 자사몰 입간판/구조물/도로안전 + 주차장 필터에 노출됨</div>';
    }

    showPanel(html);
    return;
  }

  // === 목록 페이지 (일괄 30건) ===
  if(isList){
    showPanel('<h3 style="margin:0">⏳ 일괄 감사 진행 중... (30건)</h3>');

    // 페이지의 RgrCode 추출
    const rgrPattern = /\b(\d{12}_\d{4})\b/g;
    const html = document.body.innerHTML;
    const rgrs = Array.from(new Set(html.match(rgrPattern)||[])).slice(0, 30);

    if(rgrs.length === 0){
      showPanel('<h3>RgrCode를 찾을 수 없습니다.</h3>');
      return;
    }

    // 5개씩 동시 fetch
    const results = [];
    for(let i=0;i<rgrs.length;i+=5){
      const chunk = rgrs.slice(i, i+5);
      const arr = await Promise.all(chunk.map(async rgr=>{
        try{
          const r = await fetch('/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+rgr+'&EditMode=1',{credentials:'include',cache:'no-store'});
          const txt = await r.text();
          const doc = new DOMParser().parseFromString(txt,'text/html');
          const titleInput = doc.querySelector('input[name="GoodsName"]');
          const name = (titleInput && titleInput.value) || '';
          // 페이지에서 상품명 추출 (GoodsName이 빈 경우)
          const nameMatch = txt.match(/GoodsNameKor[^"']*["'][^>]*value=["']([^"']{2,80})["']/i);
          return {rgr, name: name || (nameMatch?nameMatch[1]:''), boxes: analyzeBoxes(doc)};
        }catch(e){ return {rgr, err:String(e).slice(0,50)}; }
      }));
      results.push(...arr);
    }

    // 결과 표
    let html2 = '<h3 style="margin:0 0 6px">📋 일괄 박스별 검수 — '+results.length+'건</h3>';

    const stat = {OK:0, PARTIAL:0, EMPTY:0, GHOST_ONLY:0, ERR:0};
    results.forEach(r=>{
      if(r.err) { stat.ERR++; return; }
      const real = r.boxes.filter(b=>!b.ghost);
      if(real.length===0) { stat.GHOST_ONLY++; return; }
      const allOK = real.every(b=>b.judge==='OK');
      const anyEmpty = real.some(b=>b.judge==='EMPTY');
      if(allOK) stat.OK++;
      else if(anyEmpty) stat.EMPTY++;
      else stat.PARTIAL++;
    });
    html2 += '<div style="margin-bottom:6px">';
    html2 += '✅ OK: <b>'+stat.OK+'</b> · ⚠ PARTIAL: <b>'+stat.PARTIAL+'</b> · ❌ EMPTY: <b>'+stat.EMPTY+'</b>';
    if(stat.GHOST_ONLY) html2 += ' · 👻 유령만: '+stat.GHOST_ONLY;
    if(stat.ERR) html2 += ' · ⚠ 에러: '+stat.ERR;
    html2 += '</div>';

    html2 += '<table style="border-collapse:collapse;font-size:11px;width:100%">';
    html2 += '<tr style="background:#305496;color:#fff"><th style="padding:3px">RgrCode</th><th>상품명</th><th>박스별 (D4/D5)</th><th>판정</th></tr>';
    results.forEach(r=>{
      if(r.err){
        html2 += '<tr style="background:#fadbd8"><td>'+r.rgr+'</td><td colspan=3>err: '+r.err+'</td></tr>';
        return;
      }
      const real = r.boxes.filter(b=>!b.ghost);
      const allOK = real.length>0 && real.every(b=>b.judge==='OK');
      const judge = real.length===0 ? 'GHOST_ONLY' : (allOK ? 'OK' : (real.some(b=>b.judge==='EMPTY')?'EMPTY':'PARTIAL'));
      const cells = r.boxes.map(b=>{
        const note = b.ghost ? '👻' : (b.judge==='OK' ? '✅' : (b.judge==='EMPTY' ? '❌' : '⚠'));
        return note+b.catO1+':'+b.d4+'/'+b.d5;
      }).join(' ');
      html2 += '<tr style="background:'+judgeColor(judge)+'">';
      html2 += '<td style="padding:2px 4px">'+r.rgr+'</td>';
      html2 += '<td style="padding:2px 4px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(r.name||'').slice(0,40)+'</td>';
      html2 += '<td style="font-family:monospace;font-size:10px">'+cells+'</td>';
      html2 += '<td style="text-align:center">'+judgeIcon(judge)+' '+judge+'</td>';
      html2 += '</tr>';
    });
    html2 += '</table>';
    html2 += '<div style="font-size:11px;color:#888;margin-top:6px">D4=업종(목표 9/9) · D5=공간(목표 ≥1, 주차장 등) · 👻=유령 박스(hidO 외) · OK=모든 박스 D4=9 D5≥1</div>';

    showPanel(html2);
  }
})();
