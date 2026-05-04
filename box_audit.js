/* 박스별 검수 v11.0.17.2 (catO+catT 풀통합 + catT fallback) */
(async function(){
var url=location.href,isE=/MakeGoodsTypeOneDp\.php/.test(url),isL=/GoodsList\.php/.test(url);
if(!isE&&!isL){alert('편집 또는 GoodsList 페이지에서 실행');return;}
var COL={OK:'#d5f5e3',PARTIAL:'#fcf3cf',EMPTY:'#fadbd8',GHOST:'#e8daef',ERR:'#fadbd8'};
var KOR={OK:'정상',PARTIAL:'일부부족',EMPTY:'미설정',GHOST:'유령',ERR:'에러'};
var ICO={OK:'✅',PARTIAL:'⚠',EMPTY:'❌',GHOST:'👻',ERR:'⚠'};
var CAT_NAMES={'01':'게시판','02':'안내판','04':'입간판','05':'현수막/배너','07':'구조물','08':'도로안전용품','09':'각종물품','10':'인쇄물/스티커','13':'개인결제'};
var T_NAMES={'01':'학교/학원','02':'식당/카페','03':'아파트','04':'호텔/펜션','05':'병원/요양시설','06':'회사/공장','07':'공공기관','08':'헬스/레저','09':'기타업종'};
var KW_SPACE={'주차':['주차장','공영주차장','건물외부'],'차량':['주차장','공영주차장','도로/인도'],'소방':['주차장','공용통로','로비','건물외부'],'어린이':['학교(초/중/고)','유치원/학원','공용통로','로비'],'학교':['학교(초/중/고)','유치원/학원'],'안전':['주차장','공용통로','건물외부'],'놀이터':['놀이터/공원','공용통로'],'공원':['놀이터/공원','조경시설'],'캠핑':['놀이터/공원','조경시설'],'안내':['공용통로','로비','카운터/인포메이션']};

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
    var gh=hO.indexOf(b.catX)<0;
    var v=gh?'GHOST':((d4.length>=9&&d5.length>=5)?'OK':((d4.length===0&&d5.length===0)?'EMPTY':'PARTIAL'));
    return {box:k,catX:b.catX,catName:CAT_NAMES[b.catX]||'?',d4:d4.length,d5:d5.length,d4items:d4,d5items:d5,ghost:gh,judge:v};
  });
}
function summarize2(bs){
  return Object.keys(bs).map(k=>{
    var b=bs[k];
    var d5=b.items.filter(x=>x.dim==='05'&&x.checked);
    var v=d5.length>=5?'OK':(d5.length===0?'EMPTY':'PARTIAL');
    return {box:k,catX:b.catX,catName:T_NAMES[b.catX]||'?',d5:d5.length,d5items:d5,judge:v};
  });
}
function rowJ(s1,s2){
  var r1=s1.filter(b=>!b.ghost);
  var allOK=r1.length>0&&r1.every(b=>b.judge==='OK')&&s2.every(b=>b.judge==='OK');
  if(allOK)return 'OK';
  if(r1.some(b=>b.judge==='EMPTY')||s2.some(b=>b.judge==='EMPTY'))return 'EMPTY';
  return 'PARTIAL';
}
function suggestSpaces(name){
  if(!name)return [];
  var rec={};
  Object.keys(KW_SPACE).forEach(kw=>{if(name.indexOf(kw)>=0)KW_SPACE[kw].forEach(l=>{rec[l]=1;});});
  return Object.keys(rec);
}
function propose(full,name){
  var hO=full.hidO,bs1=full.boxes1,bs2=full.boxes2;
  var actions=[];
  var arr1=Object.keys(bs1).map(k=>({k:k,b:bs1[k]}));
  var normal1=arr1.filter(x=>hO.indexOf(x.b.catX)>=0);
  var ok1=normal1.find(x=>{
    var d4=x.b.items.filter(i=>i.dim==='04'&&i.checked).length;
    var d5=x.b.items.filter(i=>i.dim==='05'&&i.checked).length;
    return d4>=9&&d5>=5;
  });
  var stdInd=['04-01','04-02','04-03','04-04','04-05','04-06','04-07','04-08','04-09'];
  var stdSpc=ok1?ok1.b.items.filter(i=>i.checked&&i.dim==='05').map(i=>i.label):[];
  suggestSpaces(name||'').forEach(l=>{if(stdSpc.indexOf(l)<0)stdSpc.push(l);});
  if(stdSpc.length===0)stdSpc=['주차장'];
  
  // catO 박스 (SelOptCat1) — 업종 9 + 공간 5개 (라벨 우선 + fallback)
  var TGT_O=5;
  normal1.forEach(x=>{
    if(ok1&&x.k===ok1.k)return;
    // 업종 9개
    stdInd.forEach(sub=>{
      var it=x.b.items.find(i=>i.sub===sub&&!i.checked);
      if(it)actions.push({type:'cat1',box:x.k,scodeOne:x.b.catX,catName:CAT_NAMES[x.b.catX]||'?',optType:it.optType,optCode:it.sub,optTxt:it.label,dim:it.dim});
    });
    // 공간 5개 채우기
    var chk5=x.b.items.filter(i=>i.dim==='05'&&i.checked).length;
    if(chk5>=TGT_O)return;
    var added5={};
    stdSpc.forEach(lbl=>{
      if(chk5+Object.keys(added5).length>=TGT_O)return;
      var it=x.b.items.find(i=>i.dim==='05'&&i.label===lbl&&!i.checked&&!added5[i.sub]);
      if(it){added5[it.sub]=1;actions.push({type:'cat1',box:x.k,scodeOne:x.b.catX,catName:CAT_NAMES[x.b.catX]||'?',optType:it.optType,optCode:it.sub,optTxt:it.label,dim:it.dim});}
    });
    if(chk5+Object.keys(added5).length<TGT_O){
      x.b.items.filter(i=>i.dim==='05'&&!i.checked&&!added5[i.sub]).forEach(it=>{
        if(chk5+Object.keys(added5).length>=TGT_O)return;
        added5[it.sub]=1;
        actions.push({type:'cat1',box:x.k,scodeOne:x.b.catX,catName:CAT_NAMES[x.b.catX]||'?',optType:it.optType,optCode:it.sub,optTxt:it.label,dim:it.dim});
      });
    }
  });
  
  // catT 박스: 5개 채울 때까지 (라벨 우선, 부족 시 sub 순서대로 fallback)
  var TGT=5;
  Object.keys(bs2).forEach(k=>{
    var b=bs2[k];
    var chk=b.items.filter(i=>i.dim==='05'&&i.checked).length;
    if(chk>=TGT)return;
    var added={};
    stdSpc.forEach(lbl=>{
      if(chk+Object.keys(added).length>=TGT)return;
      var it=b.items.find(i=>i.dim==='05'&&i.label===lbl&&!i.checked&&!added[i.sub]);
      if(it){added[it.sub]=1;actions.push({type:'cat2',box:k,scodeOne:b.catX,catName:T_NAMES[b.catX]||'?',optType:it.optType,optCode:it.sub,optTxt:it.label,dim:it.dim});}
    });
    if(chk+Object.keys(added).length<TGT){
      b.items.filter(i=>i.dim==='05'&&!i.checked&&!added[i.sub]).forEach(it=>{
        if(chk+Object.keys(added).length>=TGT)return;
        added[it.sub]=1;
        actions.push({type:'cat2',box:k,scodeOne:b.catX,catName:T_NAMES[b.catX]||'?',optType:it.optType,optCode:it.sub,optTxt:it.label,dim:it.dim});
      });
    }
  });
  
  return {okCat1:ok1?ok1.k:null,actions:actions,recSpaces:stdSpc};
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
    var full=analyzeFull(d),s1=summarize1(full.boxes1,full.hidO),s2=summarize2(full.boxes2),prop=propose(full,nm);
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

function spcText(items){return (!items||items.length===0)?'없음':items.map(i=>i.label).join(', ');}

p.innerHTML='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between"><div style="font-size:18px;font-weight:bold">⏳ catO+catT 통합 검수 중...</div><div>'+hdrCtrls+'</div></div><div class="__bbody" style="padding:30px;text-align:center"><div id="__bpr" style="font-size:14px;color:#666"></div></div>';
attachCtrls();

if(isE){
  var rgr=(url.match(/RgrCode=([^&]+)/)||[])[1]||'';
  var nm=((document.querySelector('input[name="GoodsName"]')||{}).value)||'';
  var full=analyzeFull(document),s1=summarize1(full.boxes1,full.hidO),s2=summarize2(full.boxes2),j=rowJ(s1,s2),prop=propose(full,nm);
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:18px;font-weight:bold">📋 통합 검수 - '+rgr+'</div><div style="font-size:14px;opacity:.85">'+(nm||'(없음)')+' · '+ICO[j]+' '+KOR[j]+' · 추가 '+prop.actions.length+'개</div></div><div style="display:flex;gap:6px">'+(prop.actions.length>0?'<button id="__bfx" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold;font-size:14px">자동수정 '+prop.actions.length+'</button>':'')+hdrCtrls+'</div></div>';
  H+='<div class="__bbody" style="padding:14px;overflow:auto;flex:1">';
  H+='<h4 style="margin:6px 0">📦 카테고리(상품별) 박스</h4>';
  H+='<table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:10px"><thead><tr style="background:#5b9bd5;color:#fff"><th style="padding:6px">카테고리</th><th>업종</th><th>공간</th><th>판정</th><th>자사몰</th></tr></thead><tbody>';
  s1.forEach(x=>{
    var lk=(!x.ghost&&rgr)?'<a href="https://www.hanasignmall.kr/Search.php?GetSearch='+rgr+'&CCode='+x.catX+'&CateCou=1" target="_blank" style="color:#2e75b6">카테고리 '+x.catX+'</a>':'-';
    H+='<tr style="background:'+COL[x.judge]+'"><td style="padding:6px;font-weight:bold">'+x.catX+' '+x.catName+'</td><td style="text-align:center"><b>'+x.d4+'/9</b></td><td>'+spcText(x.d5items)+'</td><td style="text-align:center;font-weight:bold">'+ICO[x.judge]+' '+KOR[x.judge]+'</td><td>'+lk+'</td></tr>';
  });
  H+='</tbody></table>';
  H+='<h4 style="margin:6px 0">🏢 업종별 박스 (5개 이상 OK)</h4>';
  H+='<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#70ad47;color:#fff"><th style="padding:6px">업종</th><th>공간</th><th>판정</th><th>자사몰</th></tr></thead><tbody>';
  s2.forEach(x=>{
    var lk='<a href="https://www.hanasignmall.kr/shop/DisplayList.php?CCode='+x.catX+'&CateType=2" target="_blank" style="color:#2e75b6">업종 '+x.catX+' '+x.catName+'</a>';
    H+='<tr style="background:'+COL[x.judge]+'"><td style="padding:6px;font-weight:bold">'+x.catX+' '+x.catName+'</td><td>'+spcText(x.d5items)+' ('+x.d5+'개)</td><td style="text-align:center;font-weight:bold">'+ICO[x.judge]+' '+KOR[x.judge]+'</td><td>'+lk+'</td></tr>';
  });
  H+='</tbody></table>';
  if(prop.actions.length>0){
    var byBox={};prop.actions.forEach(a=>{var k=a.type+'|'+a.box;if(!byBox[k])byBox[k]=[];byBox[k].push(a);});
    H+='<div style="margin-top:12px;padding:12px;background:#fff3cd;border-left:5px solid #ffc107;border-radius:4px"><b>📝 수정 제안 ('+prop.actions.length+'개)</b><div style="font-size:12px;color:#666;margin-top:4px">추천 공간: '+prop.recSpaces.join(', ')+'</div>';
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
for(var i=0;i<rgrs.length;i+=5){
  var ck=rgrs.slice(i,i+5);
  var arr=await Promise.all(ck.map(o=>fetchAndAnalyze(o.rgr,o.name)));
  res=res.concat(arr);
  var pg=document.getElementById('__bpr');if(pg)pg.textContent=res.length+' / '+rgrs.length;
}
window.__bapResults=res;

function render(){
  var st={OK:0,PARTIAL:0,EMPTY:0,ERR:0};
  res.forEach(r=>{if(r.err)st.ERR++;else st[rowJ(r.s1,r.s2)]++;});
  var totalAct=res.reduce((s,r)=>s+(r.proposal?r.proposal.actions.length:0),0);
  var cat=(url.match(/CodeT1_1=([^&]+)/)||[])[1]||'?';
  var pg=(url.match(/page=(\d+)/)||[])[1]||'1';
  
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  H+='<div><div style="font-size:18px;font-weight:bold">📋 통합 검수 - '+res.length+'건</div>';
  H+='<div style="font-size:13px;opacity:.85;margin-top:3px">'+(CAT_NAMES[cat]||'?')+'('+cat+') / '+pg+'페이지 / 정상 '+st.OK+' / 일부부족 '+st.PARTIAL+' / 미설정 '+st.EMPTY;
  if(st.ERR)H+=' / 에러 '+st.ERR;
  H+=' / 추가 '+totalAct+'개</div></div>';
  H+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  H+='<button data-f="all" class="__bf" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#fff;color:#305496;font-size:13px">전체</button>';
  H+='<button data-f="fix" class="__bf" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;font-size:13px">수정필요</button>';
  if(totalAct>0)H+='<button id="__bfa" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold;font-size:13px">전체 자동수정 '+totalAct+'</button>';
  H+='<button id="__bxl" style="padding:7px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#28a745;color:#fff;font-size:13px">엑셀</button>';
  H+=hdrCtrls+'</div></div>';
  H+='<div class="__bbody" style="overflow:auto;flex:1;display:flex;flex-direction:column"><div style="overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#5b9bd5;color:#fff;position:sticky;top:0"><th style="padding:8px;width:30px">#</th><th style="text-align:left;min-width:170px">상품</th><th style="text-align:left;min-width:280px">📦 카테고리 박스</th><th style="text-align:left;min-width:280px">🏢 업종별 박스</th><th style="width:90px">판정</th><th style="text-align:left;min-width:240px">수정 제안</th><th style="width:140px">액션</th></tr></thead><tbody>';
  res.forEach((r,i)=>{
    if(r.err){H+='<tr data-j="ERR" style="background:'+COL.ERR+'"><td colspan=7 style="padding:6px">에러 '+r.rgr+': '+r.err+'</td></tr>';return;}
    var j=rowJ(r.s1,r.s2);
    var el='https://ad.hanasm.kr/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+r.rgr+'&EditMode=1';
    var s1Html=r.s1.map(b=>'<div style="background:'+COL[b.judge]+';padding:3px 6px;margin:1px 0;border-radius:3px;font-size:11px">'+ICO[b.judge]+' <b>'+b.catX+' '+b.catName+'</b>: 업종 '+b.d4+'/9, 공간 '+b.d5+'</div>').join('');
    var s2Html=r.s2.map(b=>{
      var sp=b.d5items.length?spcText(b.d5items).slice(0,30):'(없음)';
      return '<div style="background:'+COL[b.judge]+';padding:3px 6px;margin:1px 0;border-radius:3px;font-size:11px">'+ICO[b.judge]+' <b>'+b.catX+' '+b.catName+'</b>: '+b.d5+'개 ('+sp+')</div>';
    }).join('');
    var prop=r.proposal||{actions:[]};
    var pTxt='';
    if(prop.actions.length===0)pTxt='<span style="color:#888">추가 불필요</span>';
    else{
      var byT={cat1:0,cat2:0};prop.actions.forEach(a=>{byT[a.type]++;});
      pTxt='<div style="font-size:11px"><b>카테고리 박스 +'+byT.cat1+'</b> / <b>업종별 박스 +'+byT.cat2+'</b><br><span style="color:#666">추천: '+prop.recSpaces.join(', ')+'</span></div>';
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
  H+='<div style="padding:8px 14px;background:#f5f5f5;font-size:11px;color:#666;border-top:1px solid #ddd">📦 catO 박스 D4=업종/D5=공간 / 🏢 catT 박스 D5=공간 (5개+ OK) / 추가만 자동<span style="float:right">v11.0.17.2</span></div></div>';
  p.innerHTML=H;attachCtrls();
  document.getElementById('__bxl').onclick=function(){
    var hdr=['#','상품코드','상품명','박스타입','catX','이름','업종','공간','판정','추가업종','추가공간','자사몰URL'];
    var data=[hdr];var n=0;
    res.forEach((r,i)=>{
      if(r.err){data.push([i+1,r.rgr,r.name||'','','','','','','에러','','','']);return;}
      var prop=r.proposal||{actions:[]};
      var byBox={};prop.actions.forEach(a=>{var k=a.type+'|'+a.box;if(!byBox[k])byBox[k]=[];byBox[k].push(a);});
      r.s1.forEach(b=>{
        n++;var ad=byBox['cat1|'+b.box]||[];
        var ai=ad.filter(a=>a.dim==='04').length,as=ad.filter(a=>a.dim==='05').map(a=>a.optTxt).join(', ')||'-';
        data.push([n,r.rgr,r.name||'','catO',b.catX,b.catName,b.d4+'/9',spcText(b.d5items)||'없음',KOR[b.judge],ai,as,'https://www.hanasignmall.kr/Search.php?GetSearch='+r.rgr+'&CCode='+b.catX+'&CateCou=1']);
      });
      r.s2.forEach(b=>{
        n++;var ad=byBox['cat2|'+b.box]||[];
        var as=ad.filter(a=>a.dim==='05').map(a=>a.optTxt).join(', ')||'-';
        data.push([n,r.rgr,r.name||'','catT',b.catX,b.catName,'-',spcText(b.d5items)||'없음',KOR[b.judge],'-',as,'https://www.hanasignmall.kr/shop/DisplayList.php?CCode='+b.catX+'&CateType=2']);
      });
    });
    downloadCSV(data,'통합검수_'+(CAT_NAMES[cat]||cat)+'_p'+pg+'.csv');
  };
  function flt(m){
    Array.from(p.querySelectorAll('tbody tr')).forEach(tr=>{
      var j=tr.getAttribute('data-j');
      var sh=m==='all'?true:(j==='PARTIAL'||j==='EMPTY'||j==='ERR');
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
