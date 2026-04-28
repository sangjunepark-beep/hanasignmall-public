/* 박스별 검수 대시보드 v11.0.16.7 (한국어/풀어쓰기) */
(async function(){
var url=location.href,isE=/MakeGoodsTypeOneDp\.php/.test(url),isL=/GoodsList\.php/.test(url);
if(!isE&&!isL){alert('편집 또는 GoodsList 페이지에서 실행');return;}
var COL={OK:'#d5f5e3',PARTIAL:'#fcf3cf',EMPTY:'#fadbd8',GHOST:'#e8daef',GHOST_ONLY:'#e8daef',ERR:'#fadbd8'};
var KOR_JUDGE={OK:'정상',PARTIAL:'일부부족',EMPTY:'미설정',GHOST:'유령박스',GHOST_ONLY:'유령박스만',ERR:'에러'};
var ICO={OK:'✅',PARTIAL:'⚠',EMPTY:'❌',GHOST:'👻',GHOST_ONLY:'👻',ERR:'⚠'};
var CAT_NAMES={'01':'게시판','02':'안내판','04':'입간판','05':'현수막/배너','07':'구조물','08':'도로안전용품','09':'각종물품','10':'인쇄물/스티커','13':'개인결제'};

function analyzeFull(d){
  var cb=Array.from(d.querySelectorAll('input[type=checkbox]'));
  var hO=Array.from(d.querySelectorAll('input[type=hidden]')).filter(function(i){return /SelectCatoryCodeOne_[123]$/.test(i.name||'')&&i.value;}).map(function(i){return i.value.split('^')[0];});
  var bs={};
  cb.forEach(function(c){
    var m=(c.name||'').match(/^SelOptCat1_(\d+)_(\d+)_(\d+)$/);
    if(!m)return;
    var t=(c.value||'').split('`'),dim=(t[2]||'').split('-')[0],k='1_'+m[1];
    if(!bs[k])bs[k]={catO1:t[0],items:[]};
    bs[k].items.push({name:c.name,checked:c.checked,dim:dim,sub:t[2],optType:t[1],label:t[3]});
  });
  return {hidO:hO,boxes:bs};
}
function summarize(bs,hO){
  return Object.keys(bs).map(function(k){
    var b=bs[k];
    var d4=b.items.filter(function(x){return x.dim==='04'&&x.checked;});
    var d5=b.items.filter(function(x){return x.dim==='05'&&x.checked;});
    var tot=b.items.filter(function(x){return x.checked;}).length;
    var gh=hO.indexOf(b.catO1)<0;
    var v=gh?'GHOST':((d4.length>=9&&d5.length>=1)?'OK':((d4.length===0&&d5.length===0)?'EMPTY':'PARTIAL'));
    return {box:k,catO1:b.catO1,catName:CAT_NAMES[b.catO1]||'?',total:tot,d4:d4.length,d5:d5.length,d4items:d4,d5items:d5,ghost:gh,judge:v};
  });
}
function rowJ(s){
  var r=s.filter(function(b){return !b.ghost;});
  if(r.length===0)return 'GHOST_ONLY';
  if(r.every(function(b){return b.judge==='OK';}))return 'OK';
  if(r.some(function(b){return b.judge==='EMPTY';}))return 'EMPTY';
  return 'PARTIAL';
}
function propose(full){
  var hO=full.hidO,bs=full.boxes;
  var arr=Object.keys(bs).map(function(k){return {k:k,b:bs[k]};});
  var normal=arr.filter(function(x){return hO.indexOf(x.b.catO1)>=0;});
  var ok=normal.find(function(x){
    var d4=x.b.items.filter(function(i){return i.dim==='04'&&i.checked;}).length;
    var d5=x.b.items.filter(function(i){return i.dim==='05'&&i.checked;}).length;
    return d4>=9&&d5>=1;
  });
  var stdSubs;
  if(ok){
    stdSubs=ok.b.items.filter(function(i){return i.checked&&(i.dim==='04'||i.dim==='05');}).map(function(i){return i.sub;});
  }else{
    stdSubs=['04-01','04-02','04-03','04-04','04-05','04-06','04-07','04-08','04-09','05-01'];
  }
  var actions=[];
  normal.forEach(function(x){
    if(ok&&x.k===ok.k)return;
    stdSubs.forEach(function(sub){
      var item=x.b.items.find(function(i){return i.sub===sub&&!i.checked;});
      if(item)actions.push({box:x.k,scodeOne:x.b.catO1,catName:CAT_NAMES[x.b.catO1]||'?',optType:item.optType,optCode:item.sub,optTxt:item.label,name:item.name,dim:item.dim});
    });
  });
  return {okBox:ok?ok.k:null,okCat:ok?ok.b.catO1:null,actions:actions,stdSubs:stdSubs};
}
async function runFix(rgr,actions){
  if(actions.length===0)return {success:0};
  var ok=0;
  for(var i=0;i<actions.length;i+=5){
    var ck=actions.slice(i,i+5);
    var arr=await Promise.all(ck.map(function(a){
      var u='/AdminManager/SelectCateCode.php?SelCateTab=AM_Gs_CaReg&SelSeaTab=AM_Gs_SeaDef&nMode=RegOptSelect&GoodsNum=1&RegCode='+rgr+'&ScodeOne='+a.scodeOne+'&OptTypeNum='+a.optType+'&OptCode='+a.optCode+'&OptTxt='+encodeURIComponent(a.optTxt);
      return fetch(u,{credentials:'include'}).then(function(r){return r.ok?1:0;}).catch(function(){return 0;});
    }));
    arr.forEach(function(v){ok+=v;});
  }
  return {success:ok,total:actions.length};
}
async function fetchAndAnalyze(rgr,name){
  try{
    var r=await fetch('/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+rgr+'&EditMode=1',{credentials:'include',cache:'no-store'});
    var t=await r.text(),d=new DOMParser().parseFromString(t,'text/html');
    var nm=name;
    if(!nm){var ni=d.querySelector('input[name="GoodsName"]');if(ni&&ni.value)nm=ni.value;}
    var full=analyzeFull(d),sum=summarize(full.boxes,full.hidO),prop=propose(full);
    return {rgr:rgr,name:nm,full:full,summary:sum,proposal:prop};
  }catch(e){return {rgr:rgr,name:name,err:String(e).slice(0,40)};}
}
function downloadCSV(rows,fname){
  var BOM='﻿';
  var csv=BOM+rows.map(function(r){return r.map(function(c){var s=String(c==null?'':c);if(/[,"\n]/.test(s))s='"'+s.replace(/"/g,'""')+'"';return s;}).join(',');}).join('\r\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=fname;a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
}

var p=document.getElementById('__bap');if(p)p.remove();
p=document.createElement('div');p.id='__bap';
p.style.cssText='position:fixed;top:20px;left:50%;background:#fff;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,.4);border-radius:8px;width:96vw;max-width:1500px;max-height:90vh;overflow:hidden;font-family:sans-serif;font-size:13px;display:flex;flex-direction:column;';
p.style.transform='translateX(-50%)';
document.body.appendChild(p);

function makeDraggable(handle){
  var sx=0,sy=0,ox=0,oy=0,dragging=false;
  handle.style.cursor='move';
  handle.addEventListener('mousedown',function(e){
    if(e.target.tagName==='BUTTON'||e.target.tagName==='A')return;
    dragging=true;
    var r=p.getBoundingClientRect();
    p.style.transform='none';p.style.left=r.left+'px';p.style.top=r.top+'px';
    sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!dragging)return;
    p.style.left=(ox+e.clientX-sx)+'px';p.style.top=(oy+e.clientY-sy)+'px';
  });
  document.addEventListener('mouseup',function(){dragging=false;});
}
function attachHeaderControls(){
  var cl=document.getElementById('__bcl');if(cl)cl.onclick=function(){p.remove();};
  var mn=document.getElementById('__bmn');if(mn)mn.onclick=function(){
    var body=p.querySelector('.__bbody');if(!body)return;
    if(body.style.display==='none'){body.style.display='';mn.textContent='—';}
    else{body.style.display='none';mn.textContent='+';}
  };
  var hdr=p.querySelector('.__bhdr');if(hdr)makeDraggable(hdr);
}
var headerCtrls='<button id="__bmn" title="최소화" style="padding:6px 10px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">—</button><button id="__bcl" style="padding:6px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">닫기 X</button>';

function boxLabel(b){
  return b.catO1+' '+(b.catName||'?');
}
function boxStatus(b){
  if(b.ghost)return '유령박스 (어드민 외)';
  return '업종 '+b.d4+'/9, 공간 '+b.d5+'개';
}
function spacesText(items){
  if(!items||items.length===0)return '없음';
  return items.map(function(i){return i.label;}).join(', ');
}

if(isE){
  var rgr=(url.match(/RgrCode=([^&]+)/)||[])[1]||'';
  var nm=((document.querySelector('input[name="GoodsName"]')||{}).value)||'';
  var full=analyzeFull(document),s=summarize(full.boxes,full.hidO),j=rowJ(s),prop=propose(full);
  function renderEdit(){
    var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:16px;font-weight:bold">📋 카테고리별 노출 점검 - 상품코드 '+rgr+'</div><div style="font-size:12px;opacity:.85">'+(nm||'(상품명 없음)')+' · 종합: '+ICO[j]+' '+KOR_JUDGE[j]+' · 추가할 항목 '+prop.actions.length+'개</div></div><div style="display:flex;gap:6px">'+(prop.actions.length>0?'<button id="__bfx" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold">자동수정 '+prop.actions.length+'개</button>':'')+headerCtrls+'</div></div>';
    H+='<div class="__bbody" style="padding:14px;overflow:auto;flex:1">';
    H+='<div style="margin-bottom:8px;color:#666;font-size:11px">이 상품은 '+s.length+'개 카테고리에 등록되어 있습니다. 각 카테고리마다 업종 9개 + 공간 1개 이상 체크되어야 자사몰 카테고리+공간 필터에 노출됩니다.</div>';
    H+='<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#5b9bd5;color:#fff"><th style="padding:6px">카테고리</th><th>현재 업종</th><th>현재 공간</th><th>판정</th><th>자사몰 노출 확인</th></tr></thead><tbody>';
    s.forEach(function(x){
      var lk=(!x.ghost&&rgr)?'<a href="https://www.hanasignmall.kr/Search.php?GetSearch='+rgr+'&CCode='+x.catO1+'&CateCou=1&RsSeaTxt=%60opt%2305-01%40%EC%A3%BC%EC%B0%A8%EC%9E%A5%401360" target="_blank" style="color:#2e75b6">'+boxLabel(x)+'+주차장 →</a>':'-';
      H+='<tr style="background:'+COL[x.judge]+'"><td style="padding:6px;font-weight:bold">'+boxLabel(x)+'</td><td style="text-align:center"><b>'+x.d4+'/9</b></td><td>'+spacesText(x.d5items)+'</td><td style="text-align:center;font-weight:bold">'+ICO[x.judge]+' '+KOR_JUDGE[x.judge]+'</td><td>'+lk+'</td></tr>';
    });
    H+='</tbody></table>';
    if(prop.actions.length>0){
      var byBox={};prop.actions.forEach(function(a){if(!byBox[a.box])byBox[a.box]=[];byBox[a.box].push(a);});
      H+='<div style="margin-top:12px;padding:12px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px"><b>수정 제안 ('+prop.actions.length+'개 추가 예정)</b><div style="font-size:11px;margin-top:4px;color:#666">기준: '+(prop.okBox?'현재 정상인 '+(CAT_NAMES[prop.okCat]||'?')+' 카테고리 박스를 표준으로 다른 박스에 동일 적용':'표준 박스 없음 → 업종 9개 전체 + 주차장 공간 추가 룰 적용')+'</div>';
      Object.keys(byBox).forEach(function(k){
        var arr=byBox[k];
        var ind=arr.filter(function(a){return a.dim==='04';}).map(function(a){return a.optTxt;});
        var spc=arr.filter(function(a){return a.dim==='05';}).map(function(a){return a.optTxt;});
        var cn=CAT_NAMES[arr[0].scodeOne]||'?';
        H+='<div style="margin-top:6px;padding:6px 8px;background:#fff;border-radius:3px"><b>'+arr[0].scodeOne+' '+cn+'</b> 박스에 추가:<br>';
        if(ind.length)H+='&nbsp;&nbsp;업종 '+ind.length+'개 → '+ind.join(', ')+'<br>';
        if(spc.length)H+='&nbsp;&nbsp;공간 '+spc.length+'개 → '+spc.join(', ');
        H+='</div>';
      });
      H+='</div>';
    }
    H+='</div>';
    p.innerHTML=H;
    attachHeaderControls();
    var bfx=document.getElementById('__bfx');
    if(bfx)bfx.onclick=async function(){
      bfx.textContent='수정 중...';bfx.disabled=true;
      var r=await runFix(rgr,prop.actions);
      bfx.textContent='완료 '+r.success+'/'+r.total;
      setTimeout(function(){location.reload();},1200);
    };
  }
  renderEdit();
  return;
}

p.innerHTML='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between"><div style="font-size:16px;font-weight:bold">⏳ 카테고리별 노출 점검 중...</div><div>'+headerCtrls+'</div></div><div class="__bbody" style="padding:30px;text-align:center"><div id="__bpr" style="font-size:13px;color:#666"></div></div>';
attachHeaderControls();

var rows=Array.from(document.querySelectorAll('tr')).map(function(tr){
  var m=tr.innerText.match(/(\d{12}_\d{4})/);
  if(!m)return null;
  var rgr=m[1],cells=Array.from(tr.querySelectorAll('td')),nm='';
  cells.forEach(function(c){
    var t=c.innerText.trim();
    if(t.length>nm.length&&!/^\d+$/.test(t)&&!/^[A-Z0-9_]+$/.test(t)&&t!==rgr&&t.length<80)nm=t;
  });
  return {rgr:rgr,name:nm};
}).filter(function(x){return x;});

var seen={},rgrs=[];
rows.forEach(function(r){if(!seen[r.rgr]){seen[r.rgr]=1;rgrs.push(r);}});
rgrs=rgrs.slice(0,30);
if(rgrs.length===0){p.innerHTML='<div style="padding:30px"><h3>상품코드 없음</h3></div>';return;}

var res=[];
for(var i=0;i<rgrs.length;i+=5){
  var ck=rgrs.slice(i,i+5);
  var arr=await Promise.all(ck.map(function(o){return fetchAndAnalyze(o.rgr,o.name);}));
  res=res.concat(arr);
  var pg2=document.getElementById('__bpr');if(pg2)pg2.textContent=res.length+' / '+rgrs.length;
}

window.__bapResults=res;

function render(){
  var st={OK:0,PARTIAL:0,EMPTY:0,GHOST_ONLY:0,ERR:0};
  res.forEach(function(r){if(r.err)st.ERR++;else st[rowJ(r.summary)]++;});
  var totalActions=res.reduce(function(s,r){return s+(r.proposal?r.proposal.actions.length:0);},0);
  var cat=(url.match(/CodeT1_1=([^&]+)/)||[])[1]||'?';
  var pg=(url.match(/page=(\d+)/)||[])[1]||'1';

  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  H+='<div><div style="font-size:17px;font-weight:bold">📋 카테고리별 노출 점검 — '+res.length+'건</div>';
  H+='<div style="font-size:12px;opacity:.85;margin-top:3px">'+(CAT_NAMES[cat]||'?')+'('+cat+') · '+pg+'페이지 · 정상 '+st.OK+' · 일부부족 '+st.PARTIAL+' · 미설정 '+st.EMPTY;
  if(st.GHOST_ONLY)H+=' · 유령만 '+st.GHOST_ONLY;
  if(st.ERR)H+=' · 에러 '+st.ERR;
  H+=' · 추가할 항목 합 '+totalActions+'개</div></div>';
  H+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  H+='<button data-f="all" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#fff;color:#305496">전체</button>';
  H+='<button data-f="fix" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">수정필요만</button>';
  H+='<button data-f="empty" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">미설정만</button>';
  if(totalActions>0)H+='<button id="__bfa" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold">전체 자동수정 '+totalActions+'개</button>';
  H+='<button id="__bxl" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#28a745;color:#fff">엑셀(현재vs수정안) 다운로드</button>';
  H+=headerCtrls+'</div></div>';

  H+='<div class="__bbody" style="overflow:auto;flex:1;display:flex;flex-direction:column"><div style="overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#5b9bd5;color:#fff;position:sticky;top:0"><th style="padding:8px;width:30px">#</th><th style="text-align:left">상품코드 / 상품명</th><th style="text-align:left;min-width:280px">카테고리별 현재 상태</th><th style="width:90px">판정</th><th style="text-align:left;min-width:300px">수정 제안 (이렇게 수정할 예정)</th><th style="width:160px">액션</th></tr></thead><tbody>';

  res.forEach(function(r,i){
    if(r.err){H+='<tr data-j="ERR" style="background:'+COL.ERR+'"><td colspan=6 style="padding:6px">에러 '+r.rgr+': '+r.err+'</td></tr>';return;}
    var j=rowJ(r.summary);
    var el='https://ad.hanasm.kr/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+r.rgr+'&EditMode=1';
    var status=r.summary.map(function(b){
      var bgc=COL[b.judge];
      return '<div style="display:block;background:'+bgc+';padding:3px 7px;margin:1px 0;border-radius:3px;font-size:11px"><b>'+boxLabel(b)+'</b>: '+boxStatus(b)+(b.d5items.length?' ('+spacesText(b.d5items).slice(0,30)+(spacesText(b.d5items).length>30?'…':'')+')':'')+'</div>';
    }).join('');
    var prop=r.proposal||{actions:[]};
    var propTxt;
    if(prop.actions.length===0){propTxt='<span style="color:#888">수정 불필요 (모든 카테고리 정상)</span>';}
    else{
      var byBox={};prop.actions.forEach(function(a){if(!byBox[a.box])byBox[a.box]=[];byBox[a.box].push(a);});
      propTxt=(prop.okBox?'기준: '+(CAT_NAMES[prop.okCat]||'?')+' 박스 복제':'룰: 업종9+주차장')+'<br>';
      propTxt+=Object.keys(byBox).map(function(k){
        var arr=byBox[k];
        var ind=arr.filter(function(a){return a.dim==='04';}).length;
        var spc=arr.filter(function(a){return a.dim==='05';}).map(function(a){return a.optTxt;});
        var cn=CAT_NAMES[arr[0].scodeOne]||'?';
        return '<b>'+cn+'</b>에 '+(ind?'업종 '+ind+'개':'')+(ind&&spc.length?' + ':'')+(spc.length?'공간 ('+spc.join(', ')+')':'');
      }).join('<br>');
    }
    var fixBtn=prop.actions.length>0?'<button data-fix="'+i+'" class="__brfx" style="padding:3px 8px;background:#ffc107;color:#000;border:none;border-radius:3px;font-size:11px;cursor:pointer;font-weight:bold">수정 '+prop.actions.length+'</button>':'';
    H+='<tr data-j="'+j+'" data-idx="'+i+'" style="background:'+COL[j]+';border-bottom:1px solid #eee">';
    H+='<td style="padding:6px;text-align:center;color:#666">'+(i+1)+'</td>';
    H+='<td style="padding:6px 8px"><div style="font-family:monospace;font-size:10px;color:#666">'+r.rgr+'</div><div>'+(r.name||'').slice(0,45)+'</div></td>';
    H+='<td style="padding:6px 4px">'+status+'</td>';
    H+='<td style="text-align:center;font-weight:bold">'+ICO[j]+' '+KOR_JUDGE[j]+'</td>';
    H+='<td style="padding:6px 4px;font-size:11px">'+propTxt+'</td>';
    H+='<td style="text-align:center"><a href="'+el+'" target="_blank" style="display:inline-block;padding:3px 6px;background:#305496;color:#fff;text-decoration:none;border-radius:3px;font-size:11px;margin-right:2px">편집</a> '+fixBtn+'</td>';
    H+='</tr>';
  });
  H+='</tbody></table></div>';
  H+='<div style="padding:8px 14px;background:#f5f5f5;font-size:11px;color:#666;border-top:1px solid #ddd">"카테고리"=상품 1차 카테고리 (입간판/구조물 등) / "업종 9/9"=아파트 외 9개 업종 모두 체크 / "공간"=주차장 등 / 정상=업종9 + 공간1개 이상 / 자사몰 노출=카테고리+공간 필터<span style="float:right">v11.0.16.7</span></div></div>';

  p.innerHTML=H;
  attachHeaderControls();
  document.getElementById('__bxl').onclick=function(){
    // 엑셀: 카테고리(박스)별로 한 줄. 현재 vs 수정안 비교
    var hdr=['#','상품코드','상품명','카테고리코드','카테고리명','현재 업종 (체크/9)','현재 공간 (체크 라벨)','판정','추가할 업종 수','추가할 공간 (라벨)','수정 후 업종','수정 후 공간 수','자사몰 검증 URL'];
    var data=[hdr];var n=0;
    res.forEach(function(r,i){
      if(r.err){data.push([i+1,r.rgr,r.name||'','','','','','에러','','','','','']);return;}
      var prop=r.proposal||{actions:[]};
      var byBox={};prop.actions.forEach(function(a){if(!byBox[a.box])byBox[a.box]=[];byBox[a.box].push(a);});
      r.summary.forEach(function(b){
        n++;
        var addItems=byBox[b.box]||[];
        var addInd=addItems.filter(function(a){return a.dim==='04';});
        var addSpc=addItems.filter(function(a){return a.dim==='05';}).map(function(a){return a.optTxt;});
        var afterInd=b.d4+addInd.length;
        var afterSpc=b.d5+addSpc.length;
        var spcLabels=b.d5items.map(function(x){return x.label;}).join(', ');
        var verifyUrl=b.ghost?'(유령박스)':'https://www.hanasignmall.kr/Search.php?GetSearch='+r.rgr+'&CCode='+b.catO1+'&CateCou=1&RsSeaTxt=%60opt%2305-01%40%EC%A3%BC%EC%B0%A8%EC%9E%A5%401360';
        data.push([
          n, r.rgr, r.name||'', b.catO1, b.catName,
          b.d4+'/9', spcLabels||'(없음)',
          b.ghost?'유령박스':KOR_JUDGE[b.judge],
          addInd.length, addSpc.join(', ')||'(없음)',
          afterInd+'/9', afterSpc, verifyUrl
        ]);
      });
    });
    downloadCSV(data,'카테고리별_노출점검_'+(CAT_NAMES[cat]||cat)+'_p'+pg+'.csv');
  };
  function flt(m){
    Array.from(p.querySelectorAll('tbody tr')).forEach(function(tr){
      var j=tr.getAttribute('data-j');
      var sh=m==='all'?true:(m==='fix'?(j==='PARTIAL'||j==='EMPTY'||j==='ERR'):(j==='EMPTY'));
      tr.style.display=sh?'':'none';
    });
    Array.from(p.querySelectorAll('.__bf')).forEach(function(b){
      if(b.getAttribute('data-f')===m){b.style.background='#fff';b.style.color='#305496';}
      else{b.style.background='transparent';b.style.color='#fff';}
    });
  }
  Array.from(p.querySelectorAll('.__bf')).forEach(function(b){b.onclick=function(){flt(b.getAttribute('data-f'));};});
  Array.from(p.querySelectorAll('.__brfx')).forEach(function(b){
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
    if(!confirm('전체 '+totalActions+'개 자동수정을 실행할까요?'))return;
    bfa.textContent='수정 중...';bfa.disabled=true;
    for(var k=0;k<res.length;k++){
      var r=res[k];if(!r.proposal||r.proposal.actions.length===0)continue;
      bfa.textContent='수정 중 '+(k+1)+'/'+res.length;
      await runFix(r.rgr,r.proposal.actions);
      var ar=await fetchAndAnalyze(r.rgr,r.name);
      res[k]=ar;
    }
    render();
  };
}
render();
})();
