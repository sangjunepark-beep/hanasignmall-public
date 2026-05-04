/* 박스별 검수 v11.0.18.2 (부적합 검증 + 옥상 등 거름) */
(async function(){
var url=location.href,isE=/MakeGoodsTypeOneDp\.php/.test(url),isL=/GoodsList\.php/.test(url);
if(!isE&&!isL){alert('편집 또는 GoodsList 페이지에서 실행');return;}
var KEY=localStorage.getItem('__ANTHROPIC_KEY');
if(!KEY){KEY=prompt('Claude API Key (한 번만 입력):');if(KEY)localStorage.setItem('__ANTHROPIC_KEY',KEY);}
var LLM_ENABLED=!!KEY;
var COL={OK:'#d5f5e3',PARTIAL:'#fcf3cf',EMPTY:'#fadbd8',GHOST:'#e8daef',MISMATCH:'#ffd6d6',ERR:'#fadbd8'};
var KOR={OK:'정상',PARTIAL:'일부부족',EMPTY:'미설정',GHOST:'유령',MISMATCH:'부적합포함',ERR:'에러'};
var ICO={OK:'✅',PARTIAL:'⚠',EMPTY:'❌',GHOST:'👻',MISMATCH:'🚫',ERR:'⚠'};
var CAT_NAMES={'01':'게시판','02':'안내판','04':'입간판','05':'현수막/배너','07':'구조물','08':'도로안전용품','09':'각종물품','10':'인쇄물/스티커','13':'개인결제'};
var T_NAMES={'01':'학교/학원','02':'식당/카페','03':'아파트','04':'호텔/펜션','05':'병원/요양시설','06':'회사/공장','07':'공공기관','08':'헬스/레저','09':'기타업종'};

// 사인물 일반 부적합 공간 (룰 기반 1차 검출)
var BAD_SPACES=['옥상','수영장/사우나','수영장','사우나','키즈룸','화장실','독서실','골프연습장','헬스장'];
function isBadSpace(label){return BAD_SPACES.indexOf(label)>=0;}

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
function summarize1(bs,hO){
  return Object.keys(bs).map(k=>{
    var b=bs[k];
    var d4=b.items.filter(x=>x.dim==='04'&&x.checked);
    var d5=b.items.filter(x=>x.dim==='05'&&x.checked);
    var bad=d5.filter(x=>isBadSpace(x.label));
    var gh=hO.indexOf(b.catX)<0;
    var v;
    if(gh)v='GHOST';
    else if(bad.length>0)v='MISMATCH';
    else if(d4.length>=9&&d5.length>=3)v='OK';
    else if(d4.length===0&&d5.length===0)v='EMPTY';
    else v='PARTIAL';
    return {box:k,catX:b.catX,catName:CAT_NAMES[b.catX]||'?',d4:d4.length,d5:d5.length,d4items:d4,d5items:d5,bad:bad,ghost:gh,judge:v};
  });
}
function summarize2(bs){
  return Object.keys(bs).map(k=>{
    var b=bs[k];
    var d5=b.items.filter(x=>x.dim==='05'&&x.checked);
    var bad=d5.filter(x=>isBadSpace(x.label));
    var v;
    if(bad.length>0)v='MISMATCH';
    else if(d5.length>=3)v='OK';
    else if(d5.length===0)v='EMPTY';
    else v='PARTIAL';
    return {box:k,catX:b.catX,catName:T_NAMES[b.catX]||'?',d5:d5.length,d5items:d5,bad:bad,judge:v};
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

async function llmJudge(name,boxRequests){
  if(!KEY||boxRequests.length===0)return null;
  var pt='하나사인몰 사인물 상품에 적합한 노출 공간을 박스별로 추천.\n\n';
  pt+='상품명: "'+name+'"\n\n';
  pt+='판단 원칙 (엄격):\n';
  pt+='1. 진짜 적합한 공간만 선택. 5개 미만 OK. 절대 억지로 채우지 말 것.\n';
  pt+='2. 사인물(입간판/안내판/표지판/스티커 등)은 사람 통행 위치에 설치:\n';
  pt+='   - 입구, 주차장, 공용통로, 카운터, 출입구, 도로/인도, 건물외부\n';
  pt+='3. 절대 부적합 (이런 곳에 사인물 안 둠):\n';
  pt+='   - 옥상, 수영장/사우나, 화장실, 키즈룸, 독서실, 헬스장, 골프연습장\n';
  pt+='   → 이런 곳은 추천 절대 X (룰 위반 시 작업 거부)\n';
  pt+='4. 업종별 적합 공간:\n';
  pt+='   - 학교/학원: 입구/교문, 주차장, 운동장, 공용통로, 도서관/문화시설\n';
  pt+='   - 아파트: 입구, 주차장, 커뮤니티시설, 관리사무소, 엘리베이터\n';
  pt+='   - 회사/공장: 정문, 주차장, 외부, 사무실 안내\n';
  pt+='   - 병원/요양시설: 입구, 주차장, 외부\n';
  pt+='\n박스별 가용 공간:\n';
  boxRequests.forEach(r=>{pt+='- ['+r.label+'] 가용: ['+r.options.join(', ')+']\n';});
  pt+='\n응답: JSON만, 적합한 라벨만 (5개 미만 OK, 옥상/수영장/화장실 등 절대 X)\n{\n';
  boxRequests.forEach((r,i)=>{pt+='  "'+r.key+'": [...적합 라벨]'+(i<boxRequests.length-1?',':'')+'\n';});
  pt+='}';
  try{
    var r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:2000,messages:[{role:'user',content:pt}]})
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

async function propose(full,name){
  var hO=full.hidO,bs1=full.boxes1,bs2=full.boxes2;
  var actions=[];
  var arr1=Object.keys(bs1).map(k=>({k:k,b:bs1[k]}));
  var normal1=arr1.filter(x=>hO.indexOf(x.b.catX)>=0);
  var stdInd=['04-01','04-02','04-03','04-04','04-05','04-06','04-07','04-08','04-09'];
  normal1.forEach(x=>{
    stdInd.forEach(sub=>{
      var it=x.b.items.find(i=>i.sub===sub&&!i.checked);
      if(it)actions.push({type:'cat1',box:x.k,scodeOne:x.b.catX,catName:CAT_NAMES[x.b.catX]||'?',optType:it.optType,optCode:it.sub,optTxt:it.label,dim:it.dim});
    });
  });
  var boxReqs=[];
  normal1.forEach(x=>{
    var chk=x.b.items.filter(i=>i.dim==='05'&&i.checked&&!isBadSpace(i.label)).length;
    if(chk>=3)return;
    var opts=x.b.items.filter(i=>i.dim==='05'&&!i.checked&&!isBadSpace(i.label)).map(i=>i.label);
    if(opts.length===0)return;
    boxReqs.push({key:x.k,type:'cat1',catX:x.b.catX,label:'카테고리 '+x.b.catX+' '+(CAT_NAMES[x.b.catX]||'?'),options:opts,need:5-chk,box:x.b});
  });
  Object.keys(bs2).forEach(k=>{
    var b=bs2[k];
    var chk=b.items.filter(i=>i.dim==='05'&&i.checked&&!isBadSpace(i.label)).length;
    if(chk>=3)return;
    var opts=b.items.filter(i=>i.dim==='05'&&!i.checked&&!isBadSpace(i.label)).map(i=>i.label);
    if(opts.length===0)return;
    boxReqs.push({key:k,type:'cat2',catX:b.catX,label:'업종 '+b.catX+' '+(T_NAMES[b.catX]||'?'),options:opts,need:5-chk,box:b});
  });
  var llmResult=null;
  if(LLM_ENABLED&&boxReqs.length>0){llmResult=await llmJudge(name||'',boxReqs);}
  boxReqs.forEach(req=>{
    var picks=(llmResult&&llmResult[req.key])?llmResult[req.key]:null;
    var added={};
    if(picks&&Array.isArray(picks)){
      picks.slice(0,5).forEach(lbl=>{
        if(isBadSpace(lbl))return;
        var it=req.box.items.find(i=>i.dim==='05'&&i.label===lbl&&!i.checked&&!added[i.sub]);
        if(it){added[it.sub]=1;actions.push({type:req.type,box:req.key,scodeOne:req.catX,catName:(req.type==='cat1'?CAT_NAMES:T_NAMES)[req.catX]||'?',optType:it.optType,optCode:it.sub,optTxt:it.label,dim:it.dim});}
      });
    } else if(!llmResult){
      req.box.items.filter(i=>i.dim==='05'&&!i.checked&&!isBadSpace(i.label)&&!added[i.sub]).forEach(it=>{
        if(Object.keys(added).length>=req.need)return;
        added[it.sub]=1;
        actions.push({type:req.type,box:req.key,scodeOne:req.catX,catName:(req.type==='cat1'?CAT_NAMES:T_NAMES)[req.catX]||'?',optType:it.optType,optCode:it.sub,optTxt:it.label,dim:it.dim});
      });
    }
  });
  return {actions:actions,llmUsed:!!llmResult};
}

async function runFix(rgr,actions){
  if(actions.length===0)return {success:0,total:0};
  var ok=0;
  for(var i=0;i<actions.length;i+=5){
    var ck=actions.slice(i,i+5);
    var arr=await Promise.all(ck.map(a=>{
      var u='/AdminManager/SelectCateCode.php?SelCateTab=AM_Gs_CaReg&SelSeaTab=AM_Gs_SeaDef&nMode=RegOptSelect&GoodsNum=1&RegCode='+rgr+'&ScodeOne='+a.scodeOne+'&OptTypeNum='+a.optType+'&OptCode='+a.optCode+'&OptTxt='+encodeURIComponent(a.optTxt);
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
    var full=analyzeFull(d),s1=summarize1(full.boxes1,full.hidO),s2=summarize2(full.boxes2),prop=await propose(full,nm);
    return {rgr:rgr,name:nm,s1:s1,s2:s2,proposal:prop};
  }catch(e){return {rgr:rgr,name:name,err:String(e).slice(0,40)};}
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
p.style.cssText='position:fixed;top:20px;left:50%;background:#fff;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,.4);border-radius:8px;width:96vw;max-width:1600px;max-height:92vh;overflow:hidden;font-family:sans-serif;font-size:14px;display:flex;flex-direction:column;';
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
var llmBadge=LLM_ENABLED?'<span style="background:#28a745;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;margin-left:8px">🤖 Haiku</span>':'<span style="background:#6c757d;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;margin-left:8px">룰 모드</span>';

function spcText(items){return (!items||items.length===0)?'없음':items.map(i=>i.label).join(', ');}
function spcTextBad(items,badList){
  if(!items||items.length===0)return '없음';
  var badSubs={};(badList||[]).forEach(b=>{badSubs[b.sub]=1;});
  return items.map(i=>badSubs[i.sub]?'<span style="color:#d9534f;font-weight:bold">⚠'+i.label+'</span>':i.label).join(', ');
}

p.innerHTML='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between"><div style="font-size:18px;font-weight:bold">⏳ '+(LLM_ENABLED?'Haiku 판단 중':'룰 검수 중')+'...</div><div>'+hdrCtrls+'</div></div><div class="__bbody" style="padding:30px;text-align:center"><div id="__bpr" style="font-size:14px;color:#666"></div></div>';
attachCtrls();

if(isE){
  var rgr=(url.match(/RgrCode=([^&]+)/)||[])[1]||'';
  var nm=((document.querySelector('input[name="GoodsName"]')||{}).value)||'';
  var full=analyzeFull(document),s1=summarize1(full.boxes1,full.hidO),s2=summarize2(full.boxes2);
  var prop=await propose(full,nm);
  var j=rowJ(s1,s2);
  var allBads=[];s1.concat(s2).forEach(b=>{(b.bad||[]).forEach(x=>allBads.push(b.catX+' '+b.catName+': '+x.label));});
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:18px;font-weight:bold">📋 통합 검수 - '+rgr+llmBadge+'</div><div style="font-size:14px;opacity:.85">'+(nm||'(없음)')+' · '+ICO[j]+' '+KOR[j]+(allBads.length>0?' · 🚫 부적합 '+allBads.length+'개':'')+'</div></div><div style="display:flex;gap:6px">'+(prop.actions.length>0?'<button id="__bfx" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold;font-size:14px">자동수정 '+prop.actions.length+'</button>':'')+hdrCtrls+'</div></div>';
  H+='<div class="__bbody" style="padding:14px;overflow:auto;flex:1">';
  if(allBads.length>0){
    H+='<div style="background:#ffe0e0;border-left:5px solid #d9534f;padding:10px;margin-bottom:10px;border-radius:4px"><b>🚫 부적합 공간 발견 ('+allBads.length+'개)</b><div style="font-size:12px;color:#a00;margin-top:4px">사인물에 부적합한 위치(옥상/화장실/수영장 등) 체크되어 있음. 사람 검수 후 어드민에서 직접 해제 필요 (자동 제거 X).</div><div style="font-size:11px;margin-top:6px">'+allBads.join(' / ')+'</div></div>';
  }
  H+='<h4 style="margin:6px 0">📦 카테고리(상품별) 박스</h4>';
  H+='<table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:10px"><thead><tr style="background:#5b9bd5;color:#fff"><th style="padding:6px">카테고리</th><th>업종</th><th>공간</th><th>판정</th></tr></thead><tbody>';
  s1.forEach(x=>{
    H+='<tr style="background:'+COL[x.judge]+'"><td style="padding:6px;font-weight:bold">'+x.catX+' '+x.catName+'</td><td style="text-align:center"><b>'+x.d4+'/9</b></td><td>'+spcTextBad(x.d5items,x.bad)+'</td><td style="text-align:center;font-weight:bold">'+ICO[x.judge]+' '+KOR[x.judge]+'</td></tr>';
  });
  H+='</tbody></table>';
  H+='<h4 style="margin:6px 0">🏢 업종별 박스 (3개+ OK, 부적합 0)</h4>';
  H+='<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#70ad47;color:#fff"><th style="padding:6px">업종</th><th>공간</th><th>판정</th></tr></thead><tbody>';
  s2.forEach(x=>{
    H+='<tr style="background:'+COL[x.judge]+'"><td style="padding:6px;font-weight:bold">'+x.catX+' '+x.catName+'</td><td>'+spcTextBad(x.d5items,x.bad)+' ('+x.d5+'개'+(x.bad.length?', 부적합 '+x.bad.length:'')+')</td><td style="text-align:center;font-weight:bold">'+ICO[x.judge]+' '+KOR[x.judge]+'</td></tr>';
  });
  H+='</tbody></table>';
  if(prop.actions.length>0){
    var byBox={};prop.actions.forEach(a=>{var k=a.type+'|'+a.box;if(!byBox[k])byBox[k]=[];byBox[k].push(a);});
    H+='<div style="margin-top:12px;padding:12px;background:#fff3cd;border-left:5px solid #ffc107;border-radius:4px"><b>📝 '+(prop.llmUsed?'🤖 Haiku 판단':'룰')+' 추가 제안 ('+prop.actions.length+'개)</b>';
    Object.keys(byBox).forEach(k=>{
      var arr=byBox[k],t=k.split('|')[0];
      var ind=arr.filter(a=>a.dim==='04').map(a=>a.optTxt);
      var spc=arr.filter(a=>a.dim==='05').map(a=>a.optTxt);
      var label=t==='cat1'?'카테고리 '+arr[0].scodeOne+' '+arr[0].catName:'업종 '+arr[0].scodeOne+' '+arr[0].catName;
      H+='<div style="margin-top:6px;padding:6px 8px;background:#fff;border-radius:3px"><b>'+label+'</b>';
      if(ind.length)H+=' / 업종 '+ind.length+'개';
      if(spc.length)H+=' / 공간: '+spc.join(', ');
      H+='</div>';
    });
    H+='</div>';
  }
  H+='</div>';
  p.innerHTML=H;attachCtrls();
  var bfx=document.getElementById('__bfx');
  if(bfx)bfx.onclick=async function(){
    bfx.textContent='수정중...';bfx.disabled=true;
    var r=await runFix(rgr,prop.actions);
    bfx.textContent='완료 '+r.success+'/'+r.total;
    setTimeout(()=>location.reload(),1200);
  };
  return;
}

var rows=Array.from(document.querySelectorAll('tr')).map(tr=>{
  var m=tr.innerText.match(/(\d{12}_\d{4})/);
  if(!m)return null;
  var rgr=m[1],cells=Array.from(tr.querySelectorAll('td')),nm='';
  cells.forEach(c=>{var t=c.innerText.trim();if(t.length>nm.length&&!/^\d+$/.test(t)&&!/^[A-Z0-9_]+$/.test(t)&&t!==rgr&&t.length<80)nm=t;});
  return {rgr:rgr,name:nm};
}).filter(x=>x);
var seen={},rgrs=[];
rows.forEach(r=>{if(!seen[r.rgr]){seen[r.rgr]=1;rgrs.push(r);}});
rgrs=rgrs.slice(0,30);
if(rgrs.length===0){p.innerHTML='<div style="padding:30px"><h3>상품코드 없음</h3></div>';return;}

var res=[];
for(var i=0;i<rgrs.length;i++){
  var o=rgrs[i];
  res.push(await fetchAndAnalyze(o.rgr,o.name));
  var pgr=document.getElementById('__bpr');if(pgr)pgr.textContent=res.length+' / '+rgrs.length+(LLM_ENABLED?' (Haiku)':'');
}
window.__bapResults=res;

function render(){
  var st={OK:0,PARTIAL:0,EMPTY:0,MISMATCH:0,ERR:0};
  res.forEach(r=>{if(r.err)st.ERR++;else st[rowJ(r.s1,r.s2)]++;});
  var totalAct=res.reduce((s,r)=>s+(r.proposal?r.proposal.actions.length:0),0);
  var llmCount=res.filter(r=>r.proposal&&r.proposal.llmUsed).length;
  var cat=(url.match(/CodeT1_1=([^&]+)/)||[])[1]||'?';
  var pg=(url.match(/page=(\d+)/)||[])[1]||'1';
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  H+='<div><div style="font-size:18px;font-weight:bold">📋 통합 검수 - '+res.length+'건'+llmBadge+'</div>';
  H+='<div style="font-size:13px;opacity:.85;margin-top:3px">'+(CAT_NAMES[cat]||'?')+'('+cat+') / '+pg+'p / 정상 '+st.OK+' / 일부부족 '+st.PARTIAL+' / 미설정 '+st.EMPTY;
  if(st.MISMATCH)H+=' / 🚫 부적합포함 '+st.MISMATCH;
  if(st.ERR)H+=' / 에러 '+st.ERR;
  H+=' / 추가 '+totalAct+'개';
  if(LLM_ENABLED)H+=' / 🤖 '+llmCount+'/'+res.length;
  H+='</div></div>';
  H+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  H+='<button data-f="all" class="__bf" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#fff;color:#305496;font-size:13px">전체</button>';
  H+='<button data-f="fix" class="__bf" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;font-size:13px">수정필요</button>';
  H+='<button data-f="bad" class="__bf" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;font-size:13px">🚫 부적합만</button>';
  if(totalAct>0)H+='<button id="__bfa" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold;font-size:13px">전체 자동수정 '+totalAct+'</button>';
  H+='<button id="__bxl" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#28a745;color:#fff;font-size:13px">엑셀</button>';
  H+=hdrCtrls+'</div></div>';
  H+='<div class="__bbody" style="overflow:auto;flex:1;display:flex;flex-direction:column"><div style="overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#5b9bd5;color:#fff;position:sticky;top:0"><th style="padding:8px;width:30px">#</th><th style="text-align:left;min-width:170px">상품</th><th style="text-align:left;min-width:280px">📦 카테고리</th><th style="text-align:left;min-width:280px">🏢 업종별</th><th style="width:100px">판정</th><th style="text-align:left;min-width:200px">제안</th><th style="width:140px">액션</th></tr></thead><tbody>';
  res.forEach((r,i)=>{
    if(r.err){H+='<tr data-j="ERR" style="background:'+COL.ERR+'"><td colspan=7 style="padding:6px">에러 '+r.rgr+': '+r.err+'</td></tr>';return;}
    var j=rowJ(r.s1,r.s2);
    var el='https://ad.hanasm.kr/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+r.rgr+'&EditMode=1';
    var s1Html=r.s1.map(b=>'<div style="background:'+COL[b.judge]+';padding:3px 6px;margin:1px 0;border-radius:3px;font-size:11px">'+ICO[b.judge]+' <b>'+b.catX+' '+b.catName+'</b>: 업종 '+b.d4+'/9, 공간 '+b.d5+(b.bad.length?' (🚫'+b.bad.length+')':'')+'</div>').join('');
    var s2Html=r.s2.map(b=>{
      var sp=b.d5items.length?spcTextBad(b.d5items,b.bad).slice(0,80):'(없음)';
      return '<div style="background:'+COL[b.judge]+';padding:3px 6px;margin:1px 0;border-radius:3px;font-size:11px">'+ICO[b.judge]+' <b>'+b.catX+' '+b.catName+'</b>: '+b.d5+'개'+(b.bad.length?' (🚫'+b.bad.length+')':'')+'</div>';
    }).join('');
    var prop=r.proposal||{actions:[]};
    var pTxt='';
    if(prop.actions.length===0)pTxt='<span style="color:#888">추가 불필요</span>';
    else{
      var byT={cat1:0,cat2:0};prop.actions.forEach(a=>{byT[a.type]++;});
      var srcMark=prop.llmUsed?'🤖':'(룰)';
      pTxt='<div style="font-size:11px">'+srcMark+' 카테고리 +'+byT.cat1+' / 업종 +'+byT.cat2+'</div>';
    }
    var fixBtn=prop.actions.length>0?'<button data-fix="'+i+'" class="__brfx" style="padding:5px 10px;background:#ffc107;color:#000;border:none;border-radius:3px;font-size:12px;cursor:pointer;font-weight:bold">수정 '+prop.actions.length+'</button>':'';
    H+='<tr data-j="'+j+'" data-idx="'+i+'" style="background:'+COL[j]+';border-bottom:1px solid #eee">';
    H+='<td style="padding:6px;text-align:center;color:#666">'+(i+1)+'</td>';
    H+='<td style="padding:6px"><div style="font-family:monospace;font-size:10px;color:#666">'+r.rgr+'</div><div style="font-size:13px">'+(r.name||'').slice(0,40)+'</div></td>';
    H+='<td style="padding:6px">'+s1Html+'</td>';
    H+='<td style="padding:6px">'+s2Html+'</td>';
    H+='<td style="text-align:center;font-weight:bold">'+ICO[j]+' '+KOR[j]+'</td>';
    H+='<td style="padding:6px">'+pTxt+'</td>';
    H+='<td style="text-align:center"><a href="'+el+'" target="_blank" style="display:inline-block;padding:4px 8px;background:#305496;color:#fff;text-decoration:none;border-radius:3px;font-size:11px">편집</a><br>'+fixBtn+'</td>';
    H+='</tr>';
  });
  H+='</tbody></table></div>';
  H+='<div style="padding:8px 14px;background:#f5f5f5;font-size:11px;color:#666;border-top:1px solid #ddd">📦 catO + 🏢 catT 둘 다 3개+ OK / 🚫 부적합(옥상/수영장/화장실 등) 발견 시 사람 검수 / '+(LLM_ENABLED?'🤖 Haiku':'룰')+'<span style="float:right">v11.0.18.2</span></div></div>';
  p.innerHTML=H;attachCtrls();
  document.getElementById('__bxl').onclick=function(){
    var hdr=['#','상품코드','상품명','박스타입','catX','이름','업종','공간','부적합','판정','추가업종','추가공간','LLM','URL'];
    var data=[hdr];var n=0;
    res.forEach((r,i)=>{
      if(r.err){data.push([i+1,r.rgr,r.name||'','','','','','','','에러','','','','']);return;}
      var prop=r.proposal||{actions:[]};
      var byBox={};prop.actions.forEach(a=>{var k=a.type+'|'+a.box;if(!byBox[k])byBox[k]=[];byBox[k].push(a);});
      r.s1.forEach(b=>{
        n++;var ad=byBox['cat1|'+b.box]||[];
        var ai=ad.filter(a=>a.dim==='04').length,as=ad.filter(a=>a.dim==='05').map(a=>a.optTxt).join(', ')||'-';
        var bad=b.bad.map(x=>x.label).join(', ')||'-';
        data.push([n,r.rgr,r.name||'','catO',b.catX,b.catName,b.d4+'/9',spcText(b.d5items)||'없음',bad,KOR[b.judge],ai,as,prop.llmUsed?'Y':'N','https://www.hanasignmall.kr/Search.php?GetSearch='+r.rgr+'&CCode='+b.catX+'&CateCou=1']);
      });
      r.s2.forEach(b=>{
        n++;var ad=byBox['cat2|'+b.box]||[];
        var as=ad.filter(a=>a.dim==='05').map(a=>a.optTxt).join(', ')||'-';
        var bad=b.bad.map(x=>x.label).join(', ')||'-';
        data.push([n,r.rgr,r.name||'','catT',b.catX,b.catName,'-',spcText(b.d5items)||'없음',bad,KOR[b.judge],'-',as,prop.llmUsed?'Y':'N','https://www.hanasignmall.kr/shop/DisplayList.php?CCode='+b.catX+'&CateType=2']);
      });
    });
    downloadCSV(data,'통합검수_'+(CAT_NAMES[cat]||cat)+'_p'+pg+'.csv');
  };
  function flt(m){
    Array.from(p.querySelectorAll('tbody tr')).forEach(tr=>{
      var jj=tr.getAttribute('data-j');
      var sh=m==='all'?true:(m==='bad'?(jj==='MISMATCH'):(jj==='PARTIAL'||jj==='EMPTY'||jj==='ERR'||jj==='MISMATCH'));
      tr.style.display=sh?'':'none';
    });
    Array.from(p.querySelectorAll('.__bf')).forEach(b=>{
      if(b.getAttribute('data-f')===m){b.style.background='#fff';b.style.color='#305496';}
      else{b.style.background='transparent';b.style.color='#fff';}
    });
  }
  Array.from(p.querySelectorAll('.__bf')).forEach(b=>{b.onclick=function(){flt(b.getAttribute('data-f'));};});
  Array.from(p.querySelectorAll('.__brfx')).forEach(b=>{
    b.onclick=async function(){
      var idx=parseInt(b.getAttribute('data-fix'),10),r=res[idx];
      if(!r||!r.proposal)return;
      b.textContent='...';b.disabled=true;
      await runFix(r.rgr,r.proposal.actions);
      var ar=await fetchAndAnalyze(r.rgr,r.name);
      res[idx]=ar;render();
    };
  });
  var bfa=document.getElementById('__bfa');
  if(bfa)bfa.onclick=async function(){
    if(!confirm('전체 '+totalAct+'개 자동수정?'))return;
    bfa.textContent='수정중...';bfa.disabled=true;
    for(var k=0;k<res.length;k++){
      var r=res[k];if(!r.proposal||r.proposal.actions.length===0)continue;
      bfa.textContent='수정중 '+(k+1)+'/'+res.length;
      await runFix(r.rgr,r.proposal.actions);
      var ar=await fetchAndAnalyze(r.rgr,r.name);
      res[k]=ar;
    }
    render();
  };
}
render();
})();
