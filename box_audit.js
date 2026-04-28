/* 박스별 검수+자동수정+엑셀 대시보드 v11.0.16.5 (드래그/최소화) */
(async function(){
var url=location.href,isE=/MakeGoodsTypeOneDp\.php/.test(url),isL=/GoodsList\.php/.test(url);
if(!isE&&!isL){alert('편집 또는 GoodsList 페이지에서 실행');return;}
var COL={OK:'#d5f5e3',PARTIAL:'#fcf3cf',EMPTY:'#fadbd8',GHOST:'#e8daef',GHOST_ONLY:'#e8daef',ERR:'#fadbd8'};
var ICO={OK:'OK',PARTIAL:'!',EMPTY:'X',GHOST:'G',GHOST_ONLY:'G',ERR:'E'};

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
    var d4=b.items.filter(function(x){return x.dim==='04'&&x.checked;}).length;
    var d5=b.items.filter(function(x){return x.dim==='05'&&x.checked;}).length;
    var tot=b.items.filter(function(x){return x.checked;}).length;
    var gh=hO.indexOf(b.catO1)<0;
    var v=gh?'GHOST':((d4>=9&&d5>=1)?'OK':((d4===0&&d5===0)?'EMPTY':'PARTIAL'));
    return {box:k,catO1:b.catO1,total:tot,d4:d4,d5:d5,ghost:gh,judge:v};
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
      if(item)actions.push({box:x.k,scodeOne:x.b.catO1,optType:item.optType,optCode:item.sub,optTxt:item.label,name:item.name});
    });
  });
  return {okBox:ok?ok.k:null,actions:actions,stdSubs:stdSubs};
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
p.style.cssText='position:fixed;top:20px;left:50%;background:#fff;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,.4);border-radius:8px;width:96vw;max-width:1400px;max-height:90vh;overflow:hidden;font-family:sans-serif;font-size:13px;display:flex;flex-direction:column;';
p.style.transform='translateX(-50%)';
document.body.appendChild(p);

// 드래그 + 최소화 + 닫기 함수
function makeDraggable(handle){
  var sx=0,sy=0,ox=0,oy=0,dragging=false;
  handle.style.cursor='move';
  handle.addEventListener('mousedown',function(e){
    if(e.target.tagName==='BUTTON'||e.target.tagName==='A')return;
    dragging=true;
    var r=p.getBoundingClientRect();
    p.style.transform='none';
    p.style.left=r.left+'px';
    p.style.top=r.top+'px';
    sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!dragging)return;
    p.style.left=(ox+e.clientX-sx)+'px';
    p.style.top=(oy+e.clientY-sy)+'px';
  });
  document.addEventListener('mouseup',function(){dragging=false;});
}
function attachHeaderControls(){
  var cl=document.getElementById('__bcl');if(cl)cl.onclick=function(){p.remove();};
  var mn=document.getElementById('__bmn');if(mn)mn.onclick=function(){
    var body=p.querySelector('.__bbody');
    if(!body)return;
    if(body.style.display==='none'){body.style.display='';mn.textContent='—';}
    else{body.style.display='none';mn.textContent='+';}
  };
  var hdr=p.querySelector('.__bhdr');if(hdr)makeDraggable(hdr);
}
var headerCtrls='<button id="__bmn" title="최소화" style="padding:6px 10px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">—</button><button id="__bcl" style="padding:6px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">닫기 X</button>';

if(isE){
  var rgr=(url.match(/RgrCode=([^&]+)/)||[])[1]||'';
  var nm=((document.querySelector('input[name="GoodsName"]')||{}).value)||'';
  var full=analyzeFull(document),s=summarize(full.boxes,full.hidO),j=rowJ(s),prop=propose(full);
  function renderEdit(){
    var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:16px;font-weight:bold">📋 박스별 검수 - '+rgr+'</div><div style="font-size:12px;opacity:.85">'+(nm||'(상품명 없음)')+' / 종합: '+ICO[j]+' '+j+' / 부족 '+prop.actions.length+'건</div></div><div style="display:flex;gap:6px">'+(prop.actions.length>0?'<button id="__bfx" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold">자동수정 ('+prop.actions.length+'건)</button>':'')+headerCtrls+'</div></div>';
    H+='<div class="__bbody" style="padding:14px;overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#5b9bd5;color:#fff"><th style="padding:6px">박스</th><th>catO1</th><th>총</th><th>업종 D4</th><th>공간 D5</th><th>판정</th><th>자사몰 검증</th></tr></thead><tbody>';
    s.forEach(function(x){
      var lk=(!x.ghost&&rgr)?'<a href="https://www.hanasignmall.kr/Search.php?GetSearch='+rgr+'&CCode='+x.catO1+'&CateCou=1&RsSeaTxt=%60opt%2305-01%40%EC%A3%BC%EC%B0%A8%EC%9E%A5%401360" target="_blank" style="color:#2e75b6">'+x.catO1+'+주차장</a>':'-';
      H+='<tr style="background:'+COL[x.judge]+'"><td style="padding:6px;text-align:center;font-weight:bold">'+x.box+'</td><td style="text-align:center">'+x.catO1+'</td><td style="text-align:center">'+x.total+'</td><td style="text-align:center"><b>'+x.d4+'/9</b></td><td style="text-align:center"><b>'+x.d5+'</b></td><td style="text-align:center;font-weight:bold">'+ICO[x.judge]+' '+x.judge+'</td><td style="text-align:center">'+lk+'</td></tr>';
    });
    H+='</tbody></table>';
    if(prop.actions.length>0){
      H+='<div style="margin-top:12px;padding:10px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px"><b>LLM 자동수정 제안 ('+prop.actions.length+'건)</b><br>표준 박스: '+(prop.okBox||'없음 → 업종9+주차장 룰')+'<br><div style="margin-top:6px;font-size:11px">'+prop.actions.map(function(a){return a.box+'('+a.scodeOne+'): '+a.optCode+' '+a.optTxt;}).join(' / ')+'</div></div>';
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

p.innerHTML='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between"><div style="font-size:16px;font-weight:bold">⏳ 박스별 감사 중...</div><div>'+headerCtrls+'</div></div><div class="__bbody" style="padding:30px;text-align:center"><div id="__bpr" style="font-size:13px;color:#666"></div></div>';
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
if(rgrs.length===0){p.innerHTML='<div style="padding:30px"><h3>RgrCode 없음</h3></div>';return;}

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
  H+='<div><div style="font-size:17px;font-weight:bold">📋 박스별 검수 - '+res.length+'건</div>';
  H+='<div style="font-size:12px;opacity:.85;margin-top:3px">카테고리 '+cat+' / '+pg+'페이지 / OK '+st.OK+' / PARTIAL '+st.PARTIAL+' / EMPTY '+st.EMPTY;
  if(st.GHOST_ONLY)H+=' / GHOST '+st.GHOST_ONLY;
  if(st.ERR)H+=' / ERR '+st.ERR;
  H+=' / 부족 add '+totalActions+'건</div></div>';
  H+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
  H+='<button data-f="all" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#fff;color:#305496">전체</button>';
  H+='<button data-f="fix" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">수정필요</button>';
  H+='<button data-f="empty" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">EMPTY</button>';
  if(totalActions>0)H+='<button id="__bfa" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold">전체 자동수정 ('+totalActions+')</button>';
  H+='<button id="__bxl" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#28a745;color:#fff">엑셀 다운로드</button>';
  H+=headerCtrls+'</div></div>';

  H+='<div class="__bbody" style="overflow:auto;flex:1;display:flex;flex-direction:column"><div style="overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#5b9bd5;color:#fff;position:sticky;top:0"><th style="padding:8px;width:30px">#</th><th style="text-align:left">RgrCode</th><th style="text-align:left;min-width:220px">상품명</th><th style="text-align:left;min-width:260px">박스별 (catO1: D4/D5)</th><th style="width:90px">판정</th><th style="text-align:left;min-width:200px">LLM 제안 (add)</th><th style="width:170px">액션</th></tr></thead><tbody>';

  res.forEach(function(r,i){
    if(r.err){H+='<tr data-j="ERR" style="background:'+COL.ERR+'"><td colspan=7 style="padding:6px">ERR '+r.rgr+': '+r.err+'</td></tr>';return;}
    var j=rowJ(r.summary);
    var el='https://ad.hanasm.kr/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+r.rgr+'&EditMode=1';
    var bc=r.summary.map(function(b){return '<span style="display:inline-block;background:'+COL[b.judge]+';padding:3px 7px;margin:1px;border-radius:3px;font-family:monospace;font-size:11px">'+ICO[b.judge]+' '+b.catO1+': <b>'+b.d4+'</b>/<b>'+b.d5+'</b></span>';}).join(' ');
    var vl=r.summary.filter(function(b){return !b.ghost;}).map(function(b){return '<a href="https://www.hanasignmall.kr/Search.php?GetSearch='+r.rgr+'&CCode='+b.catO1+'&CateCou=1&RsSeaTxt=%60opt%2305-01%40%EC%A3%BC%EC%B0%A8%EC%9E%A5%401360" target="_blank" style="font-size:10px;color:#2e75b6;text-decoration:none;margin-right:4px">'+b.catO1+'</a>';}).join('');
    var prop=r.proposal||{actions:[]};
    var pBox=prop.okBox?'표준 박스 '+prop.okBox:'룰: 업종9+주차장';
    var pTxt=prop.actions.length===0?'<span style="color:#888">없음 (정상)</span>':pBox+' → '+prop.actions.slice(0,3).map(function(a){return a.box+'/'+a.optCode;}).join(', ')+(prop.actions.length>3?' 외 '+(prop.actions.length-3)+'건':'');
    var fixBtn=prop.actions.length>0?'<button data-fix="'+i+'" class="__brfx" style="padding:3px 8px;background:#ffc107;color:#000;border:none;border-radius:3px;font-size:11px;cursor:pointer;font-weight:bold">수정 '+prop.actions.length+'</button>':'';
    H+='<tr data-j="'+j+'" data-idx="'+i+'" style="background:'+COL[j]+';border-bottom:1px solid #eee"><td style="padding:6px;text-align:center;color:#666">'+(i+1)+'</td><td style="font-family:monospace;font-size:11px"><a href="'+el+'" target="_blank" style="color:#305496">'+r.rgr+'</a></td><td style="padding:6px 8px">'+(r.name||'').slice(0,45)+'</td><td style="padding:6px 4px">'+bc+'</td><td style="text-align:center;font-weight:bold">'+ICO[j]+' '+j+'</td><td style="padding:6px 4px;font-size:11px">'+pTxt+'</td><td style="text-align:center"><a href="'+el+'" target="_blank" style="display:inline-block;padding:3px 6px;background:#305496;color:#fff;text-decoration:none;border-radius:3px;font-size:11px;margin-right:2px">편집</a> '+fixBtn+(vl?'<br><div style="margin-top:2px">'+vl+'</div>':'')+'</td></tr>';
  });
  H+='</tbody></table></div>';
  H+='<div style="padding:8px 14px;background:#f5f5f5;font-size:11px;color:#666;border-top:1px solid #ddd">D4=업종(9/9) / D5=공간(>=1) / GHOST=유령박스 / OK=모든 박스 D4=9 D5>=1 / LLM 제안=OK박스 복제 또는 업종9+주차장 룰 / 헤더 드래그로 이동<span style="float:right">v11.0.16.5</span></div></div>';

  p.innerHTML=H;
  attachHeaderControls();
  document.getElementById('__bxl').onclick=function(){
    var hdr=['#','RgrCode','상품명','종합판정','박스별','부족 add','LLM 제안'];
    var data=[hdr];
    res.forEach(function(r,i){
      if(r.err){data.push([i+1,r.rgr,r.name||'','ERR','','','']);return;}
      var j=rowJ(r.summary);
      var bc=r.summary.map(function(b){return (b.ghost?'G':b.judge)+' '+b.catO1+':'+b.d4+'/'+b.d5;}).join(' | ');
      var prop=r.proposal||{actions:[]};
      var ps=prop.actions.map(function(a){return a.box+'/'+a.optCode+' '+a.optTxt;}).join(' / ');
      data.push([i+1,r.rgr,r.name||'',j,bc,prop.actions.length,ps]);
    });
    downloadCSV(data,'box_audit_cat'+cat+'_p'+pg+'.csv');
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
    if(!confirm('전체 '+totalActions+'건 자동수정 실행?'))return;
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
