/* 박스별 검수 v11.0.20.2 (UI 재설계 - 박스 카드 4단) */
(async function(){
var url=location.href,isE=/MakeGoodsTypeOneDp\.php/.test(url),isL=/GoodsList\.php/.test(url);
if(!isE&&!isL){alert('편집 또는 GoodsList 페이지에서 실행');return;}
var KEY=localStorage.getItem('__ANTHROPIC_KEY');
if(!KEY){KEY=prompt('Claude API Key:');if(KEY)localStorage.setItem('__ANTHROPIC_KEY',KEY);}
var LLM_ENABLED=!!KEY;
var COL={OK:'#d5f5e3',PARTIAL:'#fcf3cf',EMPTY:'#fadbd8',GHOST:'#e8daef',MISMATCH:'#ffd6d6',ERR:'#fadbd8'};
var KOR={OK:'정상',PARTIAL:'일부부족',EMPTY:'미설정',GHOST:'유령',MISMATCH:'부적합포함',ERR:'에러'};
var ICO={OK:'✅',PARTIAL:'⚠',EMPTY:'❌',GHOST:'👻',MISMATCH:'🚫',ERR:'⚠'};
var CAT_NAMES={'01':'게시판','02':'안내판','04':'입간판','05':'현수막/배너','07':'구조물','08':'도로안전용품','09':'각종물품','10':'인쇄물/스티커','13':'개인결제'};
var T_NAMES={'01':'학교/학원','02':'식당/카페','03':'아파트','04':'호텔/펜션','05':'병원/요양시설','06':'회사/공장','07':'공공기관','08':'헬스/레저','09':'기타업종'};
var BAD_SPACES=['옥상','수영장/사우나','수영장','사우나','키즈룸','화장실','독서실','골프연습장','헬스장'];
function isBad(l){return BAD_SPACES.indexOf(l)>=0;}

function analyzeFull(d){
  var cb=Array.from(d.querySelectorAll('input[type=checkbox]'));
  var hO=Array.from(d.querySelectorAll('input[type=hidden]')).filter(i=>/SelectCatoryCodeOne_[123]$/.test(i.name||'')&&i.value).map(i=>i.value.split('^')[0]);
  var bs1={},bs2={};
  cb.forEach(c=>{
    var m=(c.name||'').match(/^SelOptCat([12])_(\d+)_(\d+)_(\d+)$/);
    if(!m)return;
    var t=(c.value||'').split('`'),dim=(t[2]||'').split('-')[0],k=m[1]+'_'+m[2];
    var dst=m[1]==='1'?bs1:bs2;
    if(!dst[k])dst[k]={catX:t[0],items:[]};
    dst[k].items.push({name:c.name,checked:c.checked,dim:dim,sub:t[2],optType:t[1],label:t[3]});
  });
  return {hidO:hO,boxes1:bs1,boxes2:bs2};
}

function summarize(boxes,kind,hO){
  return Object.keys(boxes).map(k=>{
    var b=boxes[k];
    var d4=b.items.filter(x=>x.dim==='04'&&x.checked);
    var d5=b.items.filter(x=>x.dim==='05'&&x.checked);
    var bad=d5.filter(x=>isBad(x.label));
    var gh=kind==='cat1'&&hO&&hO.indexOf(b.catX)<0;
    var v;
    if(gh)v='GHOST';
    else if(bad.length>0)v='MISMATCH';
    else if(kind==='cat1'?(d4.length>=9&&d5.length>=3):(d5.length>=3))v='OK';
    else if((kind==='cat1'?d4.length:0)===0&&d5.length===0)v='EMPTY';
    else v='PARTIAL';
    var name=kind==='cat1'?(CAT_NAMES[b.catX]||'?'):(T_NAMES[b.catX]||'?');
    return {kind,box:k,catX:b.catX,catName:name,d4:d4.length,d5:d5.length,d4items:d4,d5items:d5,bad:bad,ghost:gh,judge:v,boxRef:b};
  });
}

function rowJ(s1,s2){
  var r1=s1.filter(b=>!b.ghost);
  if(r1.some(b=>b.judge==='MISMATCH')||s2.some(b=>b.judge==='MISMATCH'))return 'MISMATCH';
  var allOK=r1.length>0&&r1.every(b=>b.judge==='OK')&&s2.every(b=>b.judge==='OK');
  if(allOK)return 'OK';
  if(r1.some(b=>b.judge==='EMPTY')||s2.some(b=>b.judge==='EMPTY'))return 'EMPTY';
  return 'PARTIAL';
}

async function llmCall(model,prompt){
  try{
    var r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
      body:JSON.stringify({model:model,max_tokens:2000,messages:[{role:'user',content:prompt}]})
    });
    var j=await r.json();
    if(!j.content||!j.content[0])return null;
    var txt=j.content[0].text;
    var m=txt.match(/```json\s*([\s\S]+?)\s*```/);
    var jsonStr=m?m[1]:txt;
    try{return JSON.parse(jsonStr);}catch(e){
      var m2=jsonStr.match(/\{[\s\S]+\}/);
      if(m2){try{return JSON.parse(m2[0]);}catch(e2){return null;}}
      return null;
    }
  }catch(e){return null;}
}

function buildBasePrompt(name,reqs){
  var pt='하나사인몰 사인물 상품에 적합한 노출 공간을 박스별로 추천.\n상품명: "'+name+'"\n\n';
  pt+='원칙:\n1. 진짜 적합한 공간만. 5개 미만 OK.\n';
  pt+='2. 사인물(입간판/안내판/표지판/스티커)은 사람 통행 위치: 입구, 주차장, 공용통로, 카운터, 도로/인도\n';
  pt+='3. 절대 부적합: 옥상, 수영장/사우나, 화장실, 키즈룸, 독서실, 헬스장, 골프연습장 → 추천 X\n';
  pt+='4. 업종별: 학교(입구/주차장/운동장/공용통로) / 아파트(입구/주차장/커뮤니티/관리/엘리베이터) / 회사(정문/주차장/외부)\n\n';
  pt+='박스별 가용 공간:\n';
  reqs.forEach(r=>{pt+='- ['+r.label+'] 가용: ['+r.options.join(', ')+']\n';});
  pt+='\n응답: JSON만\n{\n';
  reqs.forEach((r,i)=>{pt+='  "'+r.key+'": [...적합 라벨]'+(i<reqs.length-1?',':'')+'\n';});
  pt+='}';
  return pt;
}

async function llmJudge(name,reqs){
  if(!KEY||reqs.length===0)return null;
  // 1차: Haiku 빠른 후보
  var basePt=buildBasePrompt(name,reqs);
  var haikuResult=await llmCall('claude-haiku-4-5-20251001',basePt);
  
  // 2차: Sonnet 검증 (Haiku 결과 + 부적합 거름 + 최종 결정)
  var verifyPt='하나사인몰 사인물 상품의 박스별 공간 추천 검증.\n상품명: "'+name+'"\n\n';
  verifyPt+='1차(Haiku) 추천 결과:\n'+JSON.stringify(haikuResult||{},null,2)+'\n\n';
  verifyPt+='검증 원칙:\n1. 사인물 성격에 진짜 적합한지 재확인\n2. 옥상/수영장/화장실/키즈룸/독서실/헬스장/골프연습장은 절대 X (있으면 제거)\n3. 더 좋은 대안 있으면 교체\n4. 5개 미만 OK\n\n';
  verifyPt+='박스별 가용 공간 (1차에서 누락된 좋은 항목 다시 검토):\n';
  reqs.forEach(r=>{verifyPt+='- ['+r.label+'] 가용: ['+r.options.join(', ')+']\n';});
  verifyPt+='\n최종 응답: JSON만\n{\n';
  reqs.forEach((r,i)=>{verifyPt+='  "'+r.key+'": [...최종 적합 라벨]'+(i<reqs.length-1?',':'')+'\n';});
  verifyPt+='}';
  
  var sonnetResult=await llmCall('claude-sonnet-4-6',verifyPt);
  return sonnetResult||haikuResult;
}

async function buildPlan(s1,s2,name){
  // 각 박스마다 plan 객체: {current:[], remove:[], add:[], result:[], box, catX, catName, kind, judge}
  var plans=[];
  var allBoxes=s1.concat(s2);
  
  // 부적합 제거 후보
  allBoxes.forEach(b=>{
    if(b.ghost)return;
    var p={kind:b.kind,box:b.box,catX:b.catX,catName:b.catName,judge:b.judge,
      current:b.d5items.map(i=>i.label),
      remove:b.bad.map(i=>i.label),
      removeItems:b.bad,
      addItems:[],add:[]};
    plans.push(p);
  });
  
  // LLM 추천 박스 list
  var reqs=[];
  plans.forEach(p=>{
    var b=allBoxes.find(x=>x.kind===p.kind&&x.box===p.box);
    var chk=b.d5items.filter(i=>!isBad(i.label)).length;
    if(chk>=5)return;
    var opts=b.boxRef.items.filter(i=>i.dim==='05'&&!i.checked&&!isBad(i.label)).map(i=>i.label);
    if(opts.length===0)return;
    reqs.push({key:p.kind+'|'+p.box,label:(p.kind==='cat1'?'카테고리 ':'업종 ')+p.catX+' '+p.catName,options:opts,need:5-chk,plan:p,boxRef:b.boxRef});
  });
  
  var llmResult=null;
  if(LLM_ENABLED&&reqs.length>0){llmResult=await llmJudge(name||'',reqs);}
  
  reqs.forEach(req=>{
    var picks=(llmResult&&llmResult[req.key])?llmResult[req.key]:null;
    var added={};
    if(picks&&Array.isArray(picks)){
      picks.slice(0,5).forEach(lbl=>{
        if(isBad(lbl))return;
        var it=req.boxRef.items.find(i=>i.dim==='05'&&i.label===lbl&&!i.checked&&!added[i.sub]);
        if(it){added[it.sub]=1;req.plan.add.push(lbl);req.plan.addItems.push(it);}
      });
    } else if(!llmResult){
      req.boxRef.items.filter(i=>i.dim==='05'&&!i.checked&&!isBad(i.label)&&!added[i.sub]).forEach(it=>{
        if(Object.keys(added).length>=req.need)return;
        added[it.sub]=1;req.plan.add.push(it.label);req.plan.addItems.push(it);
      });
    }
  });
  
  // 결과 = 현재 - 제거 + 추가
  plans.forEach(p=>{
    var rem=p.remove;
    p.result=p.current.filter(c=>rem.indexOf(c)<0).concat(p.add);
  });
  
  // catO 박스에 업종(dim 04) 9개 추가도 actions에 포함
  var indActions=[];
  s1.forEach(b=>{
    if(b.ghost)return;
    var stdInd=['04-01','04-02','04-03','04-04','04-05','04-06','04-07','04-08','04-09'];
    stdInd.forEach(sub=>{
      var it=b.boxRef.items.find(i=>i.sub===sub&&!i.checked);
      if(it)indActions.push({op:'add',type:'cat1',box:b.box,scodeOne:b.catX,catName:b.catName,optType:it.optType,optCode:it.sub,optTxt:it.label,dim:'04'});
    });
  });
  
  return {plans:plans,llmUsed:!!llmResult,indActions:indActions};
}

function plansToActions(plans,indActions){
  var actions=[];
  plans.forEach(p=>{
    p.removeItems.forEach(it=>{
      actions.push({op:'del',type:p.kind,box:p.box,scodeOne:p.catX,catName:p.catName,optType:it.optType,optCode:it.sub,optTxt:it.label,dim:'05'});
    });
    p.addItems.forEach(it=>{
      actions.push({op:'add',type:p.kind,box:p.box,scodeOne:p.catX,catName:p.catName,optType:it.optType,optCode:it.sub,optTxt:it.label,dim:'05'});
    });
  });
  return actions.concat(indActions||[]);
}

async function runFix(rgr,actions){
  if(actions.length===0)return {success:0,total:0};
  var ok=0;
  for(var i=0;i<actions.length;i+=5){
    var ck=actions.slice(i,i+5);
    var arr=await Promise.all(ck.map(a=>{
      var mode=a.op==='del'?'DelOptSelect':'RegOptSelect';
      var u='/AdminManager/SelectCateCode.php?SelCateTab=AM_Gs_CaReg&SelSeaTab=AM_Gs_SeaDef&nMode='+mode+'&GoodsNum=1&RegCode='+rgr+'&ScodeOne='+a.scodeOne+'&OptTypeNum='+a.optType+'&OptCode='+a.optCode+'&OptTxt='+encodeURIComponent(a.optTxt);
      return fetch(u,{credentials:'include'}).then(r=>r.ok?1:0).catch(()=>0);
    }));
    arr.forEach(v=>{ok+=v;});
  }
  return {success:ok,total:actions.length};
}

async function fetchAndAnalyze(rgr,name){
  try{
    var r=await fetch('/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+rgr+'&EditMode=1',{credentials:'include',cache:'no-store'});
    var t=await r.text(),d=new DOMParser().parseFromString(t,'text/html');
    var nm=name;
    if(!nm){var ni=d.querySelector('input[name="GoodsName"]');if(ni&&ni.value)nm=ni.value;}
    var full=analyzeFull(d);
    var s1=summarize(full.boxes1,'cat1',full.hidO);
    var s2=summarize(full.boxes2,'cat2',null);
    var planResult=await buildPlan(s1,s2,nm);
    var actions=plansToActions(planResult.plans,planResult.indActions);
    return {rgr:rgr,name:nm,s1:s1,s2:s2,plans:planResult.plans,actions:actions,llmUsed:planResult.llmUsed};
  }catch(e){return {rgr:rgr,name:name,err:String(e).slice(0,40)};}
}

async function fetchAllPagesRgrs(catCode){
  var all={},out=[];
  for(var pp=1;pp<=30;pp++){
    try{
      var u='/AdminManager/GoodsList.php?CodeT1_1='+catCode+'&page='+pp+'&startpage='+pp+'&viewCnt=30';
      var r=await fetch(u,{credentials:'include',cache:'no-store'});
      var t=await r.text();
      var d=new DOMParser().parseFromString(t,'text/html');
      var rows=Array.from(d.querySelectorAll('tr')).map(tr=>{
        var m=tr.innerText.match(/(\d{12}_\d{4})/);
        if(!m)return null;
        var rgr=m[1],cells=Array.from(tr.querySelectorAll('td')),nm='';
        cells.forEach(c=>{var t=c.innerText.trim();if(t.length>nm.length&&!/^\d+$/.test(t)&&!/^[A-Z0-9_]+$/.test(t)&&t!==rgr&&t.length<80)nm=t;});
        return {rgr:rgr,name:nm};
      }).filter(x=>x);
      var added=0;
      rows.forEach(r=>{if(!all[r.rgr]){all[r.rgr]=1;out.push(r);added++;}});
      if(added===0)break;
      var pgr=document.getElementById('__bpr');if(pgr)pgr.textContent='페이지 '+pp+' 수집 중... 누적 '+out.length+'건';
    }catch(e){break;}
  }
  return out;
}

function downloadCSV(rows,fname){
  var BOM='﻿';
  var csv=BOM+rows.map(r=>r.map(c=>{var s=String(c==null?'':c);if(/[,"\n]/.test(s))s='"'+s.replace(/"/g,'""')+'"';return s;}).join(',')).join('\r\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=fname;a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);},1000);
}

var p=document.getElementById('__bap');if(p)p.remove();
p=document.createElement('div');p.id='__bap';
p.style.cssText='position:fixed;top:20px;left:50%;background:#fff;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,.4);border-radius:8px;width:96vw;max-width:1500px;max-height:92vh;overflow:hidden;font-family:sans-serif;font-size:14px;display:flex;flex-direction:column;';
p.style.transform='translateX(-50%)';
document.body.appendChild(p);

function makeDraggable(handle){
  var sx=0,sy=0,ox=0,oy=0,dragging=false;
  handle.style.cursor='move';
  handle.addEventListener('mousedown',e=>{
    if(e.target.tagName==='BUTTON'||e.target.tagName==='A')return;
    dragging=true;
    var r=p.getBoundingClientRect();
    p.style.transform='none';p.style.left=r.left+'px';p.style.top=r.top+'px';
    sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{if(dragging){p.style.left=(ox+e.clientX-sx)+'px';p.style.top=(oy+e.clientY-sy)+'px';}});
  document.addEventListener('mouseup',()=>{dragging=false;});
}
function attachCtrls(){
  var cl=document.getElementById('__bcl');if(cl)cl.onclick=()=>p.remove();
  var mn=document.getElementById('__bmn');if(mn)mn.onclick=()=>{
    var bd=p.querySelector('.__bbody');if(!bd)return;
    if(bd.style.display==='none'){bd.style.display='';mn.textContent='—';}else{bd.style.display='none';mn.textContent='+';}
  };
  var hdr=p.querySelector('.__bhdr');if(hdr)makeDraggable(hdr);
}
var hdrCtrls='<button id="__bmn" style="padding:7px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;font-size:14px">—</button><button id="__bcl" style="padding:7px 16px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;font-size:14px">닫기 X</button>';

// 박스 카드 렌더링 — 4단 (현재/제거/추가/결과)
function renderBoxCard(plan){
  var changed=plan.remove.length>0||plan.add.length>0;
  var bgC=plan.judge==='OK'&&!changed?'#e8f5e9':(plan.judge==='MISMATCH'?'#ffe0e0':'#fff8dc');
  var icon=plan.kind==='cat1'?'📦':'🏢';
  var prefix=plan.kind==='cat1'?'카테고리':'업종';
  var H='<div style="border:1px solid #ccc;border-radius:6px;padding:10px;margin:6px 0;background:'+bgC+';font-size:13px">';
  H+='<div style="font-weight:bold;font-size:14px;margin-bottom:6px">'+icon+' '+prefix+' '+plan.catX+' '+plan.catName+'</div>';
  H+='<div style="margin:3px 0"><b style="color:#666;display:inline-block;width:60px">현재:</b> '+(plan.current.length?plan.current.join(', '):'<span style="color:#999">없음</span>')+'</div>';
  if(plan.remove.length>0)H+='<div style="margin:3px 0;color:#d9534f"><b style="display:inline-block;width:60px">❌ 제거:</b> '+plan.remove.join(', ')+'</div>';
  if(plan.add.length>0)H+='<div style="margin:3px 0;color:#28a745"><b style="display:inline-block;width:60px">➕ 추가:</b> '+plan.add.join(', ')+'</div>';
  if(changed)H+='<div style="margin:3px 0;color:#1565c0;font-weight:bold;border-top:1px dashed #aaa;padding-top:4px"><b style="display:inline-block;width:60px">⇒ 결과:</b> '+(plan.result.length?plan.result.join(', '):'<span style="color:#999">없음</span>')+'</div>';
  H+='</div>';
  return H;
}

p.innerHTML='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between"><div style="font-size:18px;font-weight:bold">⏳ '+(LLM_ENABLED?'Haiku→Sonnet 이중검증 중':'룰 검수 중')+'...</div><div>'+hdrCtrls+'</div></div><div class="__bbody" style="padding:30px;text-align:center"><div id="__bpr" style="font-size:14px;color:#666"></div></div>';
attachCtrls();

// === 단건 (편집 페이지) ===
if(isE){
  var rgr=(url.match(/RgrCode=([^&]+)/)||[])[1]||'';
  var nm=((document.querySelector('input[name="GoodsName"]')||{}).value)||'';
  var rd=await fetchAndAnalyze(rgr,nm);
  var j=rowJ(rd.s1,rd.s2);
  var delN=rd.actions.filter(a=>a.op==='del').length;
  var addN=rd.actions.filter(a=>a.op==='add').length;
  var llmBadge=LLM_ENABLED?'<span style="background:#28a745;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;margin-left:8px">🤖 Sonnet 4.6</span>':'<span style="background:#6c757d;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;margin-left:8px">룰</span>';
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:18px;font-weight:bold">'+ICO[j]+' '+(rd.name||'(없음)')+llmBadge+'</div><div style="font-size:13px;opacity:.85">'+rgr+' · 종합 '+KOR[j]+' · ❌'+delN+' / ➕'+addN+'</div></div><div style="display:flex;gap:6px">'+(rd.actions.length>0?'<button id="__bfx" style="padding:8px 16px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold;font-size:14px">자동수정 '+rd.actions.length+'</button>':'')+hdrCtrls+'</div></div>';
  H+='<div class="__bbody" style="padding:14px;overflow:auto;flex:1">';
  H+='<div style="font-size:15px;font-weight:bold;color:#305496;margin:8px 0 6px">📦 상품별 카테고리</div>';
  rd.s1.filter(b=>!b.ghost).forEach(b=>{
    var pl=rd.plans.find(x=>x.kind==='cat1'&&x.box===b.box);
    if(pl)H+=renderBoxCard(pl);
  });
  H+='<div style="font-size:15px;font-weight:bold;color:#70ad47;margin:14px 0 6px">🏢 업종별 카테고리</div>';
  rd.s2.forEach(b=>{
    var pl=rd.plans.find(x=>x.kind==='cat2'&&x.box===b.box);
    if(pl)H+=renderBoxCard(pl);
  });
  H+='</div>';
  p.innerHTML=H;attachCtrls();
  var bfx=document.getElementById('__bfx');
  if(bfx)bfx.onclick=async function(){
    if(!confirm('자동수정 실행?\n❌ 제거 '+delN+' + ➕ 추가 '+addN))return;
    bfx.textContent='수정중...';bfx.disabled=true;
    var r=await runFix(rgr,rd.actions);
    bfx.textContent='완료 '+r.success+'/'+r.total;
    setTimeout(()=>location.reload(),1200);
  };
  return;
}

// === 일괄 (목록 페이지) ===
var rows=Array.from(document.querySelectorAll('tr')).map(tr=>{
  var m=tr.innerText.match(/(\d{12}_\d{4})/);
  if(!m)return null;
  var rgr=m[1],cells=Array.from(tr.querySelectorAll('td')),nm='';
  cells.forEach(c=>{var t=c.innerText.trim();if(t.length>nm.length&&!/^\d+$/.test(t)&&!/^[A-Z0-9_]+$/.test(t)&&t!==rgr&&t.length<80)nm=t;});
  return {rgr:rgr,name:nm};
}).filter(x=>x);
var seen={},rgrs=[];
rows.forEach(r=>{if(!seen[r.rgr]){seen[r.rgr]=1;rgrs.push(r);}});
// rgrs 제한 제거 (현재 페이지 모든 RgrCode 처리)
if(rgrs.length===0){p.innerHTML='<div style="padding:30px"><h3>상품코드 없음</h3></div>';return;}

var res=[];
for(var i=0;i<rgrs.length;i++){
  var o=rgrs[i];
  res.push(await fetchAndAnalyze(o.rgr,o.name));
  var pgr=document.getElementById('__bpr');if(pgr)pgr.textContent=res.length+' / '+rgrs.length+(LLM_ENABLED?' (Haiku→Sonnet)':'');
}
window.__bapResults=res;

function render(){
  var st={OK:0,PARTIAL:0,EMPTY:0,MISMATCH:0,ERR:0};
  res.forEach(r=>{if(r.err)st.ERR++;else st[rowJ(r.s1,r.s2)]++;});
  var totDel=res.reduce((s,r)=>s+(r.actions?r.actions.filter(a=>a.op==='del').length:0),0);
  var totAdd=res.reduce((s,r)=>s+(r.actions?r.actions.filter(a=>a.op==='add').length:0),0);
  var cat=(url.match(/CodeT1_1=([^&]+)/)||[])[1]||'?';
  var pg=(url.match(/page=(\d+)/)||[])[1]||'1';
  var llmBadge=LLM_ENABLED?'<span style="background:#28a745;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;margin-left:8px">🤖 Sonnet 4.6</span>':'<span style="background:#6c757d;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;margin-left:8px">룰</span>';
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  H+='<div><div style="font-size:18px;font-weight:bold">📋 통합 검수 - '+res.length+'건'+llmBadge+'</div>';
  H+='<div style="font-size:13px;opacity:.85">'+(CAT_NAMES[cat]||'?')+'('+cat+') / '+pg+'p · ✅'+st.OK+' / ⚠'+st.PARTIAL+' / ❌'+st.EMPTY+(st.MISMATCH?' / 🚫'+st.MISMATCH:'')+(st.ERR?' / err'+st.ERR:'')+' · 변경 ❌'+totDel+' ➕'+totAdd+'</div></div>';
  H+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  H+='<button data-f="all" class="__bf" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#fff;color:#305496;font-size:13px">전체</button>';
  H+='<button data-f="fix" class="__bf" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;font-size:13px">수정필요</button>';
  H+='<button id="__ball" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#17a2b8;color:#fff;font-size:13px">📂 전체 페이지</button>';
  if(totDel+totAdd>0)H+='<button id="__bfa" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold;font-size:13px">전체 자동수정 '+(totDel+totAdd)+'</button>';
  H+='<button id="__bxl" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#28a745;color:#fff;font-size:13px">엑셀</button>';
  H+=hdrCtrls+'</div></div>';
  H+='<div class="__bbody" style="overflow:auto;flex:1;padding:8px">';
  res.forEach((r,i)=>{
    if(r.err){H+='<div data-j="ERR" style="border:1px solid #d9534f;border-radius:6px;padding:10px;margin:6px 0;background:#fadbd8">에러 '+r.rgr+': '+r.err+'</div>';return;}
    var j=rowJ(r.s1,r.s2);
    var dN=r.actions.filter(a=>a.op==='del').length;
    var aN=r.actions.filter(a=>a.op==='add').length;
    var el='https://ad.hanasm.kr/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+r.rgr+'&EditMode=1';
    H+='<div data-j="'+j+'" data-idx="'+i+'" style="border:2px solid '+(j==='OK'?'#28a745':j==='MISMATCH'?'#d9534f':'#ffc107')+';border-radius:8px;margin:10px 0;padding:12px;background:'+COL[j]+'">';
    H+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    H+='<div><div style="font-size:15px;font-weight:bold">'+ICO[j]+' '+(i+1)+'. '+(r.name||'')+'</div><div style="font-size:11px;color:#666;font-family:monospace">'+r.rgr+' · '+KOR[j]+' · ❌'+dN+' / ➕'+aN+'</div></div>';
    H+='<div style="display:flex;gap:6px"><a href="'+el+'" target="_blank" style="padding:6px 12px;background:#305496;color:#fff;text-decoration:none;border-radius:4px;font-size:12px">편집</a>';
    if(r.actions.length>0)H+='<button data-fix="'+i+'" class="__brfx" style="padding:6px 12px;background:'+(dN>0?'#d9534f':'#ffc107')+';color:'+(dN>0?'#fff':'#000')+';border:none;border-radius:4px;font-size:12px;cursor:pointer;font-weight:bold">'+(dN>0?'수정+제거':'수정')+' '+r.actions.length+'</button>';
    H+='</div></div>';
    H+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
    H+='<div><div style="font-size:12px;font-weight:bold;color:#305496;margin-bottom:4px">📦 상품별</div>';
    r.s1.filter(b=>!b.ghost).forEach(b=>{
      var pl=r.plans.find(x=>x.kind==='cat1'&&x.box===b.box);
      if(pl)H+=renderBoxCard(pl);
    });
    H+='</div><div><div style="font-size:12px;font-weight:bold;color:#70ad47;margin-bottom:4px">🏢 업종별</div>';
    r.s2.forEach(b=>{
      var pl=r.plans.find(x=>x.kind==='cat2'&&x.box===b.box);
      if(pl)H+=renderBoxCard(pl);
    });
    H+='</div></div>';
    H+='</div>';
  });
  H+='</div><div style="padding:8px 14px;background:#f5f5f5;font-size:11px;color:#666;border-top:1px solid #ddd">박스마다 [현재 / ❌제거 / ➕추가 / ⇒결과] 4단 / 부적합(옥상 등) 자동 제거<span style="float:right">v11.0.20.2</span></div>';
  p.innerHTML=H;attachCtrls();
  document.getElementById('__bxl').onclick=function(){
    var hdr=['#','상품코드','상품명','박스','catX','이름','현재','제거','추가','결과','URL'];
    var data=[hdr];var n=0;
    res.forEach((r,i)=>{
      if(r.err){data.push([i+1,r.rgr,r.name||'','','','','','','에러','','']);return;}
      r.plans.forEach(pl=>{
        n++;
        var url=pl.kind==='cat1'?('https://www.hanasignmall.kr/Search.php?GetSearch='+r.rgr+'&CCode='+pl.catX+'&CateCou=1'):('https://www.hanasignmall.kr/shop/DisplayList.php?CCode='+pl.catX+'&CateType=2');
        data.push([n,r.rgr,r.name||'',pl.kind==='cat1'?'상품별':'업종별',pl.catX,pl.catName,pl.current.join(', ')||'없음',pl.remove.join(', ')||'-',pl.add.join(', ')||'-',pl.result.join(', ')||'없음',url]);
      });
    });
    downloadCSV(data,'박스별검수_'+(CAT_NAMES[cat]||cat)+'_p'+pg+'.csv');
  };
  function flt(m){
    Array.from(p.querySelectorAll('[data-j]')).forEach(tr=>{
      var jj=tr.getAttribute('data-j');
      var sh=m==='all'?true:(jj==='PARTIAL'||jj==='EMPTY'||jj==='ERR'||jj==='MISMATCH');
      tr.style.display=sh?'':'none';
    });
    Array.from(p.querySelectorAll('.__bf')).forEach(b=>{
      if(b.getAttribute('data-f')===m){b.style.background='#fff';b.style.color='#305496';}
      else{b.style.background='transparent';b.style.color='#fff';}
    });
  }
  var ball=document.getElementById('__ball');
  if(ball)ball.onclick=async function(){
    if(!confirm('현재 카테고리의 전체 페이지를 일괄 검수할까요?\n(LLM 호출 = 페이지 X 30건)'))return;
    p.innerHTML='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between"><div style="font-size:18px;font-weight:bold">📂 전체 페이지 수집 중...</div><div>'+hdrCtrls+'</div></div><div class="__bbody" style="padding:30px;text-align:center"><div id="__bpr" style="font-size:14px;color:#666"></div></div>';
    attachCtrls();
    var allRgrs=await fetchAllPagesRgrs(cat);
    var newRes=[];
    for(var i=0;i<allRgrs.length;i++){
      var o=allRgrs[i];
      newRes.push(await fetchAndAnalyze(o.rgr,o.name));
      var pgr=document.getElementById('__bpr');if(pgr)pgr.textContent='검수 '+newRes.length+' / '+allRgrs.length+' (Haiku→Sonnet)';
    }
    res=newRes;window.__bapResults=res;render();
  };
    Array.from(p.querySelectorAll('.__bf')).forEach(b=>{b.onclick=function(){flt(b.getAttribute('data-f'));};});
  Array.from(p.querySelectorAll('.__brfx')).forEach(b=>{
    b.onclick=async function(){
      var idx=parseInt(b.getAttribute('data-fix'),10),r=res[idx];
      if(!r||!r.actions)return;
      b.textContent='...';b.disabled=true;
      await runFix(r.rgr,r.actions);
      var ar=await fetchAndAnalyze(r.rgr,r.name);
      res[idx]=ar;render();
    };
  });
  var bfa=document.getElementById('__bfa');
  if(bfa)bfa.onclick=async function(){
    var totalAct=totDel+totAdd;
    if(!confirm('전체 자동수정?\n❌ 제거 '+totDel+' + ➕ 추가 '+totAdd))return;
    bfa.textContent='수정중...';bfa.disabled=true;
    for(var k=0;k<res.length;k++){
      var r=res[k];if(!r.actions||r.actions.length===0)continue;
      bfa.textContent='수정중 '+(k+1)+'/'+res.length;
      await runFix(r.rgr,r.actions);
      var ar=await fetchAndAnalyze(r.rgr,r.name);
      res[k]=ar;
    }
    render();
  };
}
render();
})();
