/* 박스별 검수 v11.0.34 (법령 사인물 코드 룰 — 무한루프 차단) */
(async function(){
var url=location.href,isE=/MakeGoodsTypeOneDp\.php/.test(url),isL=/GoodsList\.php/.test(url);
if(!isE&&!isL){alert('편집 또는 GoodsList 페이지에서 실행');return;}
var KEY=localStorage.getItem('__ANTHROPIC_KEY');
if(!KEY){KEY=prompt('Claude API Key:');if(KEY)localStorage.setItem('__ANTHROPIC_KEY',KEY);}
var LLM_ENABLED=!!KEY;
window.__bapDebug={llmCalls:[],errors:[]};
console.log('[bap] v11.0.34 시작 LLM_ENABLED=',LLM_ENABLED);
var COL={OK:'#d5f5e3',PARTIAL:'#fcf3cf',EMPTY:'#fadbd8',GHOST:'#e8daef',MISMATCH:'#ffd6d6',ERR:'#fadbd8',DROP:'#e8e8e8'};
var KOR={OK:'정상',PARTIAL:'일부부족',EMPTY:'미설정',GHOST:'유령',MISMATCH:'부적합포함',ERR:'에러',DROP:'박스부적합'};
var ICO={OK:'✅',PARTIAL:'⚠',EMPTY:'❌',GHOST:'👻',MISMATCH:'🚫',ERR:'⚠',DROP:'🗑️'};
var CAT_NAMES={'01':'게시판','02':'안내판','04':'입간판','05':'현수막/배너','07':'구조물','08':'도로안전용품','09':'각종물품','10':'인쇄물/스티커','13':'개인결제'};
var T_NAMES={'01':'학교/학원','02':'식당/카페','03':'아파트','04':'호텔/펜션','05':'병원/요양시설','06':'회사/공장','07':'공공기관','08':'헬스/레저','09':'기타업종'};
var BAD_SPACES=['옥상','수영장/사우나','수영장','사우나','키즈룸','화장실','독서실','골프연습장','헬스장'];
function isBad(l){return BAD_SPACES.indexOf(l)>=0;}
var LAW_PATTERNS=[/소방.*(기록표|안내|표지|위치|점검|시설)/,/자체점검\s*기록/,/비상구/,/화재.*(경보|대피|안내|예방|확인)/,/피난.*(도|안내)/,/소화기.*위치/,/방화.*(문|구역|관리)/,/응급.*시설/];
var COMMON_LAW_SPACES=['공용통로,로비','공용통로','계단','복도/계단','복도','비상구','입구','사무실','관리사무소/사무실','관리사무소','카운터/인포메이션','카운터','엘리베이터','건물외부'];
function isLawSign(n){return n && LAW_PATTERNS.some(function(p){return p.test(n);});}

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
  var r1=s1.filter(b=>!b.ghost && b.judge!=='DROP');
  var r2=s2.filter(b=>b.judge!=='DROP');
  if(r1.some(b=>b.judge==='MISMATCH')||r2.some(b=>b.judge==='MISMATCH'))return 'MISMATCH';
  if(r1.length===0&&r2.length===0)return 'OK';
  var allOK=r1.every(b=>b.judge==='OK')&&r2.every(b=>b.judge==='OK');
  if(allOK)return 'OK';
  if(r1.some(b=>b.judge==='EMPTY')||r2.some(b=>b.judge==='EMPTY'))return 'EMPTY';
  return 'PARTIAL';
}

async function llmCall(model,prompt){
  var dbg={model:model,promptLen:prompt.length,t:Date.now()};
  try{
    var r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
      body:JSON.stringify({model:model,max_tokens:4000,temperature:0,messages:[{role:'user',content:prompt}]})
    });
    dbg.status=r.status;
    if(r.status===401){dbg.err='401_KEY_INVALID';window.__bapDebug.errors.push(dbg);console.error('[bap] 401 키 인증 실패!',dbg);return null;}
    if(r.status===429){dbg.err='429_RATE_LIMIT';window.__bapDebug.errors.push(dbg);console.error('[bap] 429 rate limit',dbg);return null;}
    var j=await r.json();
    if(!j.content||!j.content[0]){dbg.err='NO_CONTENT';dbg.body=JSON.stringify(j).slice(0,300);window.__bapDebug.errors.push(dbg);console.error('[bap] no content',dbg);return null;}
    var txt=j.content[0].text;
    dbg.txtLen=txt.length;
    dbg.txtTail=txt.slice(-100);
    var m=txt.match(/```json\s*([\s\S]+?)\s*```/);
    var jsonStr=m?m[1]:txt;
    try{var parsed=JSON.parse(jsonStr);dbg.ok=1;dbg.keys=Object.keys(parsed);window.__bapDebug.llmCalls.push(dbg);return parsed;}catch(e){
      dbg.parse1Err=String(e).slice(0,80);
      var m2=jsonStr.match(/\{[\s\S]+\}/);
      if(m2){try{var p2=JSON.parse(m2[0]);dbg.ok=2;dbg.keys=Object.keys(p2);window.__bapDebug.llmCalls.push(dbg);return p2;}catch(e2){dbg.parse2Err=String(e2).slice(0,80);}}
      dbg.err='PARSE_FAIL';dbg.txt=txt.slice(0,400);window.__bapDebug.errors.push(dbg);console.error('[bap] JSON 파싱 실패',dbg);
      return null;
    }
  }catch(e){dbg.err='FETCH_'+String(e).slice(0,60);window.__bapDebug.errors.push(dbg);console.error('[bap] fetch err',dbg);return null;}
}

function buildBasePrompt(name,reqs){
  var pt='# 임무\n';
  pt+='하나사인몰의 사인물 상품을 자사몰 "공간 필터"에 매핑하는 전문가다.\n';
  pt+='자사몰 사용자가 특정 공간(예: 주차장)을 클릭했을 때, 그 공간과 무관한 상품이 나오면 사용자 경험이 망가진다.\n';
  pt+='따라서 "이 상품이 그 공간에서 실제로 쓰일 사인물인가?"를 엄격하게 판단한다.\n\n';
  pt+='# 상품명\n"'+name+'"\n\n';
  pt+='# 작업 절차 (반드시 순서대로)\n';
  pt+='## STEP 1: 상품명 의미 분해\n';
  pt+='상품명에서 다음 3가지를 추출:\n';
  pt+=' (1) 주제: 이 사인물이 알리는 내용 (예: "미끄럼틀 화상주의" → 미끄럼틀 안전)\n';
  pt+=' (2) 사용 장소: 이 사인물이 실제 부착될 장소 (예: "미끄럼틀이 있는 곳" = 놀이터, 어린이시설)\n';
  pt+=' (3) 대상: 이 사인물이 경고/안내하는 대상 (예: 어린이, 보호자)\n\n';
  pt+='## STEP 2: 무관한 공간 식별 (가장 중요!)\n';
  pt+='가용 공간 list 중에서 "STEP 1의 사용 장소와 무관한 공간"을 모두 골라낸다.\n';
  pt+='이 공간들은 최종 결과에서 빠진다. 절대 추가하지 않는다.\n';
  pt+='판단 기준: 자사몰 사용자가 그 공간 필터를 눌렀을 때, 이 상품이 결과로 나오면 어색한가?\n';
  pt+=' - 어색하다 → 무관 → 빼기\n';
  pt+=' - 자연스럽다 → 적합 → 유지\n\n';
  pt+='## STEP 3: 적합 공간 선정\n';
  pt+='가용 공간 중 "STEP 1의 사용 장소와 직접 연관된 공간"만 선정. 1~5개. 5개 강박 X.\n';
  pt+='연관 없으면 빈 list [] 반환해도 된다.\n\n';
  pt+='# 절대 규칙 (위반 시 실패)\n';
  pt+='1. 상품 주제와 무관한 공간은 무조건 결과에서 제외 (현재 체크되어 있어도 빼기)\n';
  pt+='2. 5개 채우려고 무관한 공간 추가 금지\n';
  pt+='3. 절대 부적합: 옥상, 수영장/사우나, 화장실, 키즈룸, 독서실, 헬스장, 골프연습장\n';
  pt+='4. 가용 공간 list에 없는 라벨 절대 응답 금지\n\n';
  pt+='# 검증 체크리스트 (응답 전 자체 점검)\n';
  pt+='각 박스의 최종 답을 정하기 전에 박스마다 점검:\n';
  pt+=' Q1. "상품명: \''+name+'\'"이 이 공간에 부착되는 게 자연스러운가?\n';
  pt+=' Q2. 자사몰에서 이 공간 필터로 검색한 사용자가 이 상품을 보고 만족할까?\n';
  pt+=' 둘 중 하나라도 NO → 그 공간은 결과에서 제외\n\n';
  pt+='# 예시 (이대로 학습)\n';
  pt+='예시 A: "미끄럼틀 화상주의 안내판"\n';
  pt+='  STEP 1: 주제=미끄럼틀 안전, 사용 장소=놀이터/어린이시설, 대상=어린이/보호자\n';
  pt+='  가용=[주차장, 계단, 관리사무소, 놀이터/공원, 운동장, 카운터, 입구]\n';
  pt+='  STEP 2 무관: 주차장(미끄럼틀 없음), 계단(아님), 관리사무소(아님), 카운터(아님), 입구(아님)\n';
  pt+='  STEP 3 적합: ["놀이터/공원", "운동장"]\n';
  pt+='  ⚠ 현재 체크에 "주차장"이 있어도 빼야 한다. 미끄럼틀과 주차장은 무관.\n\n';
  pt+='예시 B: "차량 2부제 안내 입간판"\n';
  pt+='  STEP 1: 주제=차량 운행 규칙, 사용 장소=주차장/도로, 대상=운전자\n';
  pt+='  가용=[주차장, 도로/인도, 공영주차장, 놀이터/공원, 카운터, 공용통로]\n';
  pt+='  STEP 2 무관: 놀이터/공원(차량 없음), 카운터(아님), 공용통로(아님)\n';
  pt+='  STEP 3 적합: ["주차장", "도로/인도", "공영주차장"]\n\n';
  pt+='예시 C: "소방시설 위치 안내판"\n';
  pt+='  STEP 1: 주제=소방시설 위치, 사용 장소=건물 내 비상구/통로, 대상=거주자/방문자\n';
  pt+='  가용=[공용통로, 비상구, 건물외부, 놀이터/공원, 운동장, 주차장]\n';
  pt+='  STEP 2 무관: 놀이터/공원(소방시설 X), 운동장(X)\n';
  pt+='  STEP 3 적합: ["공용통로", "비상구", "건물외부", "주차장"] (주차장도 소방시설 있음)\n\n';
  pt+='# 박스 정보\n';
  reqs.forEach(r=>{
    pt+='## ['+r.label+']\n';
    pt+='현재 체크: ['+(r.current.length?r.current.join(', '):'없음')+']\n';
    pt+='가용 공간: ['+r.options.join(', ')+']\n';
  });
  pt+='\n# 응답 형식 (절대 준수)\n';
  pt+='**중요: JSON 키는 아래 그대로 사용. 절대 한국어 라벨이나 다른 형식으로 변환 금지.**\n';
  pt+='JSON만 응답:\n```json\n{\n';
  reqs.forEach((r,i)=>{pt+='  "'+r.key+'": [...최종 적합 라벨, 가용 공간 list 중에서만]'+(i<reqs.length-1?',':'')+'\n';});
  pt+='}\n```\n각 키는 정확히 위 표기(cat1|1_1, cat1|1_2 등)로. 박스 이름이나 카테고리명으로 키 만들지 말 것.';
  return pt;
}

async function llmJudge(name,reqs){
  if(!KEY||reqs.length===0)return null;
  var basePt=buildBasePrompt(name,reqs);
  var haikuResult=await llmCall('claude-haiku-4-5-20251001',basePt);
  
  var verifyPt='# 임무\n';
  verifyPt+='Haiku가 1차 추천한 공간을 엄격히 재검증하는 Sonnet 검수자다.\n';
  verifyPt+='Haiku는 종종 "가용 공간이니까"라는 이유로 무관한 공간을 남긴다. 너는 그걸 잡아내야 한다.\n\n';
  verifyPt+='# 상품명\n"'+name+'"\n\n';
  verifyPt+='# Haiku 1차 결과\n'+JSON.stringify(haikuResult||{},null,2)+'\n\n';
  verifyPt+='# 재검증 절차\n';
  verifyPt+='## 1. 상품 주제 확정\n';
  verifyPt+='상품명: "'+name+'"의 핵심 주제(무엇을 알리는가)와 사용 장소(어디 부착되는가)를 다시 확인.\n\n';
  verifyPt+='## 2. Haiku 결과 1개씩 검증\n';
  verifyPt+='Haiku가 추천한 각 공간에 대해 자문:\n';
  verifyPt+=' - "이 상품이 정말 [공간]에 부착될까?"\n';
  verifyPt+=' - "자사몰에서 [공간] 필터를 누른 사용자가 이 상품을 보고 만족할까?"\n';
  verifyPt+='둘 중 하나라도 NO → 그 공간 제거\n\n';
  verifyPt+='## 3. 누락 확인\n';
  verifyPt+='상품 주제와 직접 연관된 공간이 가용 list에 있는데 Haiku가 빠뜨렸으면 추가.\n\n';
  verifyPt+='# 절대 규칙\n';
  verifyPt+='1. "현재 체크되어 있으니 유지" 같은 이유로 무관한 공간 보존 금지\n';
  verifyPt+='2. 5개 강박 금지. 1~3개로 좁혀도 OK. 0개도 OK.\n';
  verifyPt+='3. 옥상/수영장/화장실/키즈룸/독서실/헬스장/골프연습장 절대 X\n';
  verifyPt+='4. 가용 공간 list에 없는 라벨 응답 금지\n\n';
  verifyPt+='# 자주 발생하는 오판 (반드시 잡아내기)\n';
  verifyPt+=' - 어린이/놀이 관련 상품에 "주차장" 추천 → 제거\n';
  verifyPt+=' - 차량 관련 상품에 "놀이터/공원" 추천 → 제거\n';
  verifyPt+=' - 의료/병원 상품에 "운동장" 추천 → 제거\n';
  verifyPt+=' - 식당 관련 상품에 "주차장/계단/공용통로" 추천 → 제거 (식당 내부만)\n';
  verifyPt+=' - 일반적이라고 무조건 "공용통로/입구" 추가 금지\n\n';
  verifyPt+='# 박스 정보\n';
  reqs.forEach(r=>{
    verifyPt+='## ['+r.label+']\n';
    verifyPt+='현재 체크: ['+(r.current.join(', ')||'없음')+']\n';
    verifyPt+='가용 공간: ['+r.options.join(', ')+']\n';
    verifyPt+='Haiku 추천: '+JSON.stringify((haikuResult&&haikuResult[r.key])||[])+'\n';
  });
  verifyPt+='\n# 응답 형식 (절대 준수)\n';
  verifyPt+='**중요: JSON 키는 아래 그대로 사용. 절대 변환 금지.**\n';
  verifyPt+='JSON만:\n```json\n{\n';
  reqs.forEach((r,i)=>{verifyPt+='  "'+r.key+'": [...최종]'+(i<reqs.length-1?',':'')+'\n';});
  verifyPt+='}\n```\n각 키는 정확히 위 표기로 (cat1|1_1, cat2|2_1 등). 라벨로 바꾸지 말 것.';
  var sonnetResult=await llmCall('claude-sonnet-4-6',verifyPt);
  return sonnetResult||haikuResult;
}

async function buildPlan(s1,s2,name){
  var rowDbg={name:name,t:Date.now(),boxes:[]};
  var plans=[];
  var allBoxes=s1.concat(s2);
  var lawMode=isLawSign(name);
  if(lawMode)console.log('[bap] 법령 사인물 모드 (LLM 우회):',name);
  
  var reqs=[];
  allBoxes.forEach(b=>{
    if(b.ghost)return;
    var current=b.d5items.map(i=>i.label);
    var allOpts=b.boxRef.items.filter(i=>i.dim==='05').map(i=>i.label);
    var p={kind:b.kind,box:b.box,catX:b.catX,catName:b.catName,judge:b.judge,
      current:current,
      currentItems:b.d5items,
      allItems:b.boxRef.items.filter(i=>i.dim==='05'),
      remove:[],removeItems:[],
      add:[],addItems:[]};
    plans.push(p);
    reqs.push({
      key:p.kind+'|'+p.box,
      label:(p.kind==='cat1'?'카테고리 ':'업종 ')+p.catX+' '+p.catName,
      current:current,
      options:allOpts,
      plan:p
    });
  });
  
  var llmResult=null;
  if(lawMode){
    llmResult={};
    reqs.forEach(function(req){
      var p=req.plan;
      var allOpts=p.allItems.map(function(i){return i.label;});
      var lawFit=COMMON_LAW_SPACES.filter(function(s){return allOpts.indexOf(s)>=0;});
      llmResult[req.key]=lawFit;
    });
    if(window.__bapDebug)window.__bapDebug.llmCalls.push({type:'lawMode',name:name,result:llmResult});
  } else if(LLM_ENABLED&&reqs.length>0){
    llmResult=await llmJudge(name||'',reqs);
  }
  
  // 키 매핑 fallback: LLM이 키를 라벨로 바꿔 반환한 경우 보정
  if(llmResult){
    reqs.forEach(req=>{
      if(llmResult[req.key])return; // 정상 키 있으면 OK
      // label 또는 변형 매칭 시도
      var candidates=[req.label,req.label.replace(/\s/g,'_').replace(/\//g,''),req.label.replace(/\s/g,'').replace(/\//g,'')];
      for(var i=0;i<candidates.length;i++){
        if(llmResult[candidates[i]]){llmResult[req.key]=llmResult[candidates[i]];break;}
      }
      // 그래도 없으면 모든 키 부분 매칭 (예: "카테고리02_안내판" → catX="02"+name="안내판" 매칭)
      if(!llmResult[req.key]){
        var lkeys=Object.keys(llmResult);
        var catX=req.label.match(/\d{2}/);
        if(catX){
          var matched=lkeys.find(k=>k.indexOf(catX[0])>=0&&Array.isArray(llmResult[k]));
          if(matched){llmResult[req.key]=llmResult[matched];}
        }
      }
    });
    if(window.__bapDebug)window.__bapDebug.llmCalls.push({type:'keyMapping',mapped:reqs.map(r=>({k:r.key,found:!!llmResult[r.key],val:llmResult[r.key]}))});
  }
  
  reqs.forEach(req=>{
    var p=req.plan;
    var finalLabels=(llmResult&&llmResult[req.key]&&Array.isArray(llmResult[req.key]))?llmResult[req.key]:null;
    
    if(finalLabels===null){
      // LLM 실패 → 부적합만 자동 제거 (안전 모드)
      p.currentItems.filter(i=>isBad(i.label)).forEach(it=>{p.remove.push(it.label);p.removeItems.push(it);});
    } else {
      // BAD_SPACES는 LLM 응답에 있어도 제외
      finalLabels=finalLabels.filter(l=>!isBad(l));
      // 가용 공간 list에 없는 라벨 제거 (LLM 환각 방지)
      var allOptLabels=p.allItems.map(i=>i.label);
      finalLabels=finalLabels.filter(l=>allOptLabels.indexOf(l)>=0);
      
      // 제거: 현재 중 최종에 없는 것 (BAD_SPACES 자동 포함)
      p.currentItems.forEach(it=>{
        if(finalLabels.indexOf(it.label)<0){
          p.remove.push(it.label);p.removeItems.push(it);
        }
      });
      // 추가: 최종 중 현재에 없는 것
      finalLabels.forEach(lbl=>{
        if(p.current.indexOf(lbl)>=0)return;
        var it=p.allItems.find(i=>i.label===lbl&&!i.checked);
        if(it){p.add.push(lbl);p.addItems.push(it);}
      });
    }
    
    p.result=p.current.filter(c=>p.remove.indexOf(c)<0).concat(p.add);
  });
  
  // catO 박스에 업종(dim 04) 9개 추가
  var indActions=[];
  s1.forEach(b=>{
    if(b.ghost)return;
    var stdInd=['04-01','04-02','04-03','04-04','04-05','04-06','04-07','04-08','04-09'];
    stdInd.forEach(sub=>{
      var it=b.boxRef.items.find(i=>i.sub===sub&&!i.checked);
      if(it)indActions.push({op:'add',type:'cat1',box:b.box,scodeOne:b.catX,catName:b.catName,optType:it.optType,optCode:it.sub,optTxt:it.label,dim:'04'});
    });
  });
  
  rowDbg.llmResult=llmResult;
  rowDbg.plans=plans.map(p=>({k:p.kind+'|'+p.box,cur:p.current.length,rm:p.remove.length,ad:p.add.length}));
  window.__bapDebug.llmCalls.push({type:'buildPlan',row:rowDbg});
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
    // LLM 결과 반영해서 박스 judge 후처리
    if(planResult.llmUsed){
      planResult.plans.forEach(p=>{
        var arr=p.kind==='cat1'?s1:s2;
        var box=arr.find(b=>b.box===p.box);
        if(!box||box.ghost)return;
        if(box.judge==='MISMATCH')return; // 부적합 그대로
        if(p.result.length===0){
          box.judge='DROP';p.judge='DROP'; // LLM 빈 응답 = 박스 부적합 (current 0이어도)
        } else {
          box.judge='OK';p.judge='OK'; // LLM 결과 1개라도 있으면 OK
        }
      });
    }
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
      var pgr=document.getElementById('__bpr');if(pgr)pgr.textContent='페이지 '+pp+' 수집... 누적 '+out.length+'건';
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
var llmBadge=LLM_ENABLED?'<span style="background:#28a745;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;margin-left:8px">🤖 Haiku→Sonnet</span>':'<span style="background:#6c757d;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;margin-left:8px">룰</span>';

function renderBoxCard(plan){
  var changed=plan.remove.length>0||plan.add.length>0;
  var bgC=plan.judge==='DROP'?'#e8e8e8':(plan.judge==='OK'&&!changed?'#e8f5e9':(plan.remove.length>0?'#ffe0e0':(plan.add.length>0?'#fff8dc':'#f5f5f5')));
  var icon=plan.kind==='cat1'?'📦':'🏢';
  var prefix=plan.kind==='cat1'?'카테고리':'업종';
  var H='<div style="border:1px solid #ccc;border-radius:6px;padding:10px;margin:6px 0;background:'+bgC+';font-size:13px">';
  H+='<div style="font-weight:bold;font-size:14px;margin-bottom:6px">'+icon+' '+prefix+' '+plan.catX+' '+plan.catName+'</div>';
  H+='<div style="margin:3px 0"><b style="color:#666;display:inline-block;width:60px">현재:</b> '+(plan.current.length?plan.current.join(', '):'<span style="color:#999">없음</span>')+'</div>';
  if(plan.judge==='DROP')H+='<div style="margin:3px 0;color:#666;font-style:italic;border-top:1px dashed #aaa;padding-top:4px">🗑️ <b>박스 부적합</b> — LLM 판정상 이 카테고리에 노출 부적합. 매핑 해제는 수동 권장.</div>';
  if(plan.remove.length>0)H+='<div style="margin:3px 0;color:#d9534f"><b style="display:inline-block;width:60px">❌ 제거:</b> '+plan.remove.join(', ')+'</div>';
  if(plan.add.length>0)H+='<div style="margin:3px 0;color:#28a745"><b style="display:inline-block;width:60px">➕ 추가:</b> '+plan.add.join(', ')+'</div>';
  if(changed)H+='<div style="margin:3px 0;color:#1565c0;font-weight:bold;border-top:1px dashed #aaa;padding-top:4px"><b style="display:inline-block;width:60px">⇒ 결과:</b> '+(plan.result.length?plan.result.join(', '):'<span style="color:#999">없음</span>')+'</div>';
  H+='</div>';
  return H;
}

p.innerHTML='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between"><div style="font-size:18px;font-weight:bold">⏳ '+(LLM_ENABLED?'Haiku→Sonnet 검증 중':'룰 검수 중')+'...</div><div>'+hdrCtrls+'</div></div><div class="__bbody" style="padding:30px;text-align:center"><div id="__bpr" style="font-size:14px;color:#666"></div></div>';
attachCtrls();

if(isE){
  var rgr=(url.match(/RgrCode=([^&]+)/)||[])[1]||'';
  var nm=((document.querySelector('input[name="GoodsName"]')||{}).value)||'';
  var rd=await fetchAndAnalyze(rgr,nm);
  var j=rowJ(rd.s1,rd.s2);
  var delN=rd.actions.filter(a=>a.op==='del').length;
  var addN=rd.actions.filter(a=>a.op==='add').length;
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:18px;font-weight:bold">'+ICO[j]+' '+(rd.name||'(없음)')+llmBadge+'</div><div style="font-size:13px;opacity:.85">'+rgr+' · '+KOR[j]+' · ❌'+delN+' / ➕'+addN+'</div></div><div style="display:flex;gap:6px">'+(rd.actions.length>0?'<button id="__bfx" style="padding:8px 16px;cursor:pointer;border-radius:4px;border:none;background:#ffc107;color:#000;font-weight:bold;font-size:14px">자동수정 '+rd.actions.length+'</button>':'')+hdrCtrls+'</div></div>';
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
    if(!confirm('자동수정?\n❌ 제거 '+delN+' + ➕ 추가 '+addN))return;
    bfx.textContent='수정중...';bfx.disabled=true;
    var r=await runFix(rgr,rd.actions);
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
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  H+='<div><div style="font-size:18px;font-weight:bold">📋 통합 검수 - '+res.length+'건'+llmBadge+'</div>';
  H+='<div style="font-size:13px;opacity:.85">'+(CAT_NAMES[cat]||'?')+'('+cat+') / '+pg+'p · ✅'+st.OK+' / ⚠'+st.PARTIAL+' / ❌'+st.EMPTY+(st.MISMATCH?' / 🚫'+st.MISMATCH:'')+(st.ERR?' / err'+st.ERR:'')+' · ❌'+totDel+' ➕'+totAdd+'</div></div>';
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
  H+='</div><div style="padding:8px 14px;background:#f5f5f5;font-size:11px;color:#666;border-top:1px solid #ddd">박스마다 [현재 / ❌제거 / ➕추가 / ⇒결과] · 이중 LLM 강화 프롬프트<span style="float:right">v11.0.34</span></div>';
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
  Array.from(p.querySelectorAll('.__bf')).forEach(b=>{b.onclick=function(){flt(b.getAttribute('data-f'));};});
  var ball=document.getElementById('__ball');
  if(ball)ball.onclick=async function(){
    if(!confirm('전체 페이지 일괄 검수?'))return;
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
    if(!confirm('전체 자동수정?\n❌ '+totDel+' + ➕ '+totAdd))return;
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
