/* 박스별 검수 대시보드 v11.0.16.3 */
(async function(){
var url=location.href,isE=/MakeGoodsTypeOneDp\.php/.test(url),isL=/GoodsList\.php/.test(url);
if(!isE&&!isL){alert('편집 또는 GoodsList 페이지에서 실행');return;}
var COL={OK:'#d5f5e3',PARTIAL:'#fcf3cf',EMPTY:'#fadbd8',GHOST:'#e8daef',GHOST_ONLY:'#e8daef',ERR:'#fadbd8'};
var ICO={OK:'OK',PARTIAL:'!',EMPTY:'X',GHOST:'G',GHOST_ONLY:'G',ERR:'E'};

function analyze(d){
  var cb=Array.from(d.querySelectorAll('input[type=checkbox]'));
  var hO=Array.from(d.querySelectorAll('input[type=hidden]')).filter(function(i){return /SelectCatoryCodeOne_[123]$/.test(i.name||'')&&i.value;}).map(function(i){return i.value.split('^')[0];});
  var bs={};
  cb.forEach(function(c){
    var m=(c.name||'').match(/^SelOptCat1_(\d+)_(\d+)_(\d+)$/);
    if(!m)return;
    var t=(c.value||'').split('`'),dim=(t[2]||'').split('-')[0],k='1_'+m[1];
    if(!bs[k])bs[k]={catO1:t[0],items:[]};
    bs[k].items.push({dim:dim,checked:c.checked});
  });
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
function rowJ(bs){
  var r=bs.filter(function(b){return !b.ghost;});
  if(r.length===0)return 'GHOST_ONLY';
  if(r.every(function(b){return b.judge==='OK';}))return 'OK';
  if(r.some(function(b){return b.judge==='EMPTY';}))return 'EMPTY';
  return 'PARTIAL';
}

var p=document.getElementById('__bap');if(p)p.remove();
p=document.createElement('div');p.id='__bap';
p.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#fff;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,.4);border-radius:8px;width:96vw;max-width:1400px;max-height:90vh;overflow:hidden;font-family:sans-serif;font-size:13px;display:flex;flex-direction:column;';
document.body.appendChild(p);

if(isE){
  var rgr=(url.match(/RgrCode=([^&]+)/)||[])[1]||'';
  var nm=((document.querySelector('input[name="GoodsName"]')||{}).value)||'';
  var s=analyze(document),j=rowJ(s);
  var H='<div style="background:#305496;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:16px;font-weight:bold">박스별 검수 - '+rgr+'</div><div style="font-size:12px;opacity:.85">'+(nm||'(상품명 없음)')+' / 종합: '+ICO[j]+' '+j+'</div></div><button id="__bcl" style="padding:6px 14px;cursor:pointer;border:1px solid #fff;background:transparent;color:#fff;border-radius:4px">닫기 X</button></div>';
  H+='<div style="padding:14px;overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#5b9bd5;color:#fff"><th style="padding:6px">박스</th><th>catO1</th><th>총</th><th>업종 D4</th><th>공간 D5</th><th>판정</th><th>자사몰</th></tr></thead><tbody>';
  s.forEach(function(x){
    var lk=(!x.ghost&&rgr)?'<a href="https://www.hanasignmall.kr/Search.php?GetSearch='+rgr+'&CCode='+x.catO1+'&CateCou=1&RsSeaTxt=%60opt%2305-01%40%EC%A3%BC%EC%B0%A8%EC%9E%A5%401360" target="_blank" style="color:#2e75b6">'+x.catO1+'+주차장</a>':'-';
    H+='<tr style="background:'+COL[x.judge]+'"><td style="padding:6px;text-align:center;font-weight:bold">'+x.box+'</td><td style="text-align:center">'+x.catO1+'</td><td style="text-align:center">'+x.total+'</td><td style="text-align:center"><b>'+x.d4+'/9</b></td><td style="text-align:center"><b>'+x.d5+'</b></td><td style="text-align:center;font-weight:bold">'+ICO[x.judge]+' '+x.judge+'</td><td style="text-align:center">'+lk+'</td></tr>';
  });
  H+='</tbody></table></div>';
  p.innerHTML=H;
  document.getElementById('__bcl').onclick=function(){p.remove();};
  return;
}

p.innerHTML='<div style="padding:30px;text-align:center"><div style="font-size:16px">박스별 감사 중...</div><div id="__bpr" style="margin-top:8px;font-size:13px;color:#666"></div></div>';

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
  var arr=await Promise.all(ck.map(async function(o){
    try{
      var r=await fetch('/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+o.rgr+'&EditMode=1',{credentials:'include',cache:'no-store'});
      var t=await r.text(),d=new DOMParser().parseFromString(t,'text/html');
      var nm=o.name;
      if(!nm){var ni=d.querySelector('input[name="GoodsName"]');if(ni&&ni.value)nm=ni.value;}
      return {rgr:o.rgr,name:nm,boxes:analyze(d)};
    }catch(e){return {rgr:o.rgr,name:o.name,err:String(e).slice(0,40)};}
  }));
  res=res.concat(arr);
  var pg=document.getElementById('__bpr');if(pg)pg.textContent=res.length+' / '+rgrs.length;
}

var st={OK:0,PARTIAL:0,EMPTY:0,GHOST_ONLY:0,ERR:0};
res.forEach(function(r){if(r.err)st.ERR++;else st[rowJ(r.boxes)]++;});

var cat=(url.match(/CodeT1_1=([^&]+)/)||[])[1]||'?';
var pg=(url.match(/page=(\d+)/)||[])[1]||'1';

var H='<div style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
H+='<div><div style="font-size:17px;font-weight:bold">박스별 검수 - '+res.length+'건</div>';
H+='<div style="font-size:12px;opacity:.85;margin-top:3px">카테고리 '+cat+' / '+pg+'페이지 / OK '+st.OK+' / PARTIAL '+st.PARTIAL+' / EMPTY '+st.EMPTY;
if(st.GHOST_ONLY)H+=' / GHOST '+st.GHOST_ONLY;
if(st.ERR)H+=' / ERR '+st.ERR;
H+='</div></div>';
H+='<div style="display:flex;gap:6px"><button data-f="all" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:#fff;color:#305496">전체</button><button data-f="fix" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">수정필요</button><button data-f="empty" class="__bf" style="padding:6px 12px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">EMPTY</button><button id="__bcl" style="padding:6px 14px;cursor:pointer;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff">닫기 X</button></div></div>';

H+='<div style="overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#5b9bd5;color:#fff;position:sticky;top:0"><th style="padding:8px;width:30px">#</th><th style="text-align:left">RgrCode</th><th style="text-align:left;min-width:240px">상품명</th><th style="text-align:left;min-width:280px">박스별 (catO1: D4/D5)</th><th style="width:110px">판정</th><th style="width:160px">액션</th></tr></thead><tbody>';

res.forEach(function(r,i){
  if(r.err){H+='<tr data-j="ERR" style="background:'+COL.ERR+'"><td colspan=6 style="padding:6px">ERR '+r.rgr+': '+r.err+'</td></tr>';return;}
  var j=rowJ(r.boxes);
  var el='https://ad.hanasm.kr/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+r.rgr+'&EditMode=1';
  var bc=r.boxes.map(function(b){return '<span style="display:inline-block;background:'+COL[b.judge]+';padding:3px 7px;margin:1px;border-radius:3px;font-family:monospace;font-size:11px">'+ICO[b.judge]+' '+b.catO1+': <b>'+b.d4+'</b>/<b>'+b.d5+'</b></span>';}).join(' ');
  var vl=r.boxes.filter(function(b){return !b.ghost;}).map(function(b){return '<a href="https://www.hanasignmall.kr/Search.php?GetSearch='+r.rgr+'&CCode='+b.catO1+'&CateCou=1&RsSeaTxt=%60opt%2305-01%40%EC%A3%BC%EC%B0%A8%EC%9E%A5%401360" target="_blank" style="font-size:10px;color:#2e75b6;text-decoration:none;margin-right:4px">'+b.catO1+'</a>';}).join('');
  H+='<tr data-j="'+j+'" style="background:'+COL[j]+';border-bottom:1px solid #eee"><td style="padding:6px;text-align:center;color:#666">'+(i+1)+'</td><td style="font-family:monospace;font-size:11px"><a href="'+el+'" target="_blank" style="color:#305496">'+r.rgr+'</a></td><td style="padding:6px 8px">'+(r.name||'').slice(0,50)+'</td><td style="padding:6px 4px">'+bc+'</td><td style="text-align:center;font-weight:bold">'+ICO[j]+' '+j+'</td><td style="text-align:center"><a href="'+el+'" target="_blank" style="display:inline-block;padding:3px 8px;background:#305496;color:#fff;text-decoration:none;border-radius:3px;font-size:11px">편집</a>'+(vl?'<br><div style="margin-top:2px">'+vl+'</div>':'')+'</td></tr>';
});
H+='</tbody></table></div>';
H+='<div style="padding:8px 14px;background:#f5f5f5;font-size:11px;color:#666;border-top:1px solid #ddd">D4=업종(목표 9/9) / D5=공간(목표>=1) / GHOST=유령박스 / OK=모든 박스 D4=9 D5>=1<span style="float:right">v11.0.16.3</span></div>';

p.innerHTML=H;
document.getElementById('__bcl').onclick=function(){p.remove();};
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
})();
