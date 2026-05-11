/* 박스별 검수 v5.2 / v11.0.46 (badOnly 조건에 업종 보정 포함 — 부적합+업종보정 함께 안전 처리) */
(async function(){
var VER='v5.2/v11.0.46';
var oldP=document.getElementById('__bap');if(oldP)oldP.remove();
if(window.__bapVersion&&window.__bapVersion!==VER){console.log('[bap] 옛 버전 감지:',window.__bapVersion,'→',VER);}
window.__bapVersion=VER;
var url=location.href,isE=/MakeGoodsTypeOneDp\.php/.test(url),isL=/GoodsList\.php/.test(url);
if(!isE&&!isL){alert('편집 또는 GoodsList 페이지에서 실행');return;}
var KEY=localStorage.getItem('__ANTHROPIC_KEY');
if(!KEY){KEY=prompt('Claude API Key:');if(KEY)localStorage.setItem('__ANTHROPIC_KEY',KEY);}
var LLM_ENABLED=!!KEY;
window.__bapDebug={llmCalls:[],errors:[],ver:VER,ruleHits:[],synonymHits:[]};
console.log('[bap]',VER,'시작 LLM_ENABLED=',LLM_ENABLED);
var COL={OK:'#d5f5e3',PARTIAL:'#fcf3cf',EMPTY:'#fadbd8',GHOST:'#e8daef',MISMATCH:'#ffd6d6',ERR:'#fadbd8',DROP:'#e8e8e8',RULE:'#fff3cd'};
var KOR={OK:'정상',PARTIAL:'일부부족',EMPTY:'미설정',GHOST:'유령',MISMATCH:'부적합포함',ERR:'에러',DROP:'박스부적합',RULE:'룰적용'};
var ICO={OK:'✅',PARTIAL:'⚠',EMPTY:'❌',GHOST:'👻',MISMATCH:'🚫',ERR:'⚠',DROP:'🗑️',RULE:'📐'};
var CAT_NAMES={'01':'게시판','02':'안내판','04':'입간판','05':'현수막/배너','07':'구조물','08':'도로안전용품','09':'각종물품','10':'인쇄물/스티커','13':'개인결제'};
var T_NAMES={'01':'학교/학원','02':'식당/카페','03':'아파트','04':'호텔/펜션','05':'병원/요양시설','06':'회사/공장','07':'공공기관','08':'헬스/레저','09':'기타업종'};
var BAD_SPACES=['옥상','수영장/사우나','수영장','사우나','키즈룸','화장실','독서실','골프연습장','헬스장'];
function isBad(l){return BAD_SPACES.indexOf(l)>=0;}

/* ===== v3 도메인 룰 사전 (LLM 우회) =====
 * 매칭 우선순위: 위에서 아래로 (구체적 → 일반적 순)
 * action='NO_CHANGE': 현재 상태 유지, 자동수정 차단
 * forceSpaces: v3에서는 "추가만" 작동. 현재 체크된 적합 공간은 보존 (BAD_SPACES만 제거)
 */
var DOMAIN_RULES=[
  // 복합 룰 (구체적인 것 먼저)
  {name:'어린이/차량',
   keywords:/(어린이[\s_-]*보호[\s_-]*차량|어린이[\s_-]*탑승|통학[\s_-]*차량|스쿨[\s_-]*버스)/,
   forceSpaces:['주차장','도로/인도','공영주차장','교문','놀이터/공원','운동장'],
   badge:'🚸 어린이 차량 — 학교+주차+도로',
   reason:'어린이보호 차량은 학교 교문/주차장/도로 모두 적합'},
  // 법령 (NO_CHANGE = 자동수정 차단)
  {name:'법령/소방',
   keywords:/소방|자체점검|점검표|기록표|비상구|피난|화재|대피|소화기|소화전|완강기|질식소화포|옥내소화전|옥상출입|옥상안전|옥상난간|적치금지|안전관리|위험물|특정소방대상물|관계법령|다중이용업소|방화|연기감지|스프링클러|화재경보/,
   action:'NO_CHANGE',
   badge:'⚠ 법령 사인물 — 자동수정 차단',
   reason:'법령상 모든 건물용도 광범위 적합 (수동 검토 권장)'},
  // 차량/주차 (어린이 제외)
  {name:'차량/주차',
   keywords:/주차|차량|진입금지|일방통행|2부제|견인|주정차|차량통제|속도제한|서행|정지선/,
   forceSpaces:['주차장','도로/인도','공영주차장'],
   badge:'🚗 차량용 — 주차/도로 추가',
   reason:'차량 관련 사인물 — 주차/도로 공간 추가 (현재 체크 보존)'},
  // 어린이/놀이
  {name:'어린이/놀이',
   keywords:/놀이터|미끄럼틀|유아|보육|화상주의|뜨거움주의|놀이기구|어린이[^보]/,  // '어린이보호'는 위 복합 룰에서 처리
   forceSpaces:['놀이터/공원','운동장','교문'],
   badge:'👶 어린이용 — 놀이/교육 공간 추가',
   reason:'어린이 관련 사인물 — 놀이/교육 공간 추가 (현재 체크 보존)'}
];

function matchDomainRule(name){
  if(!name)return null;
  for(var i=0;i<DOMAIN_RULES.length;i++){
    if(DOMAIN_RULES[i].keywords.test(name))return DOMAIN_RULES[i];
  }
  return null;
}

/* ===== v3 라벨 동의어 사전 =====
 * LLM이 "운동장" 응답인데 어드민 라벨이 "놀이시설"인 경우 같은 것으로 인식
 * key: 정규형 (어드민 라벨 기준), values: 같은 의미로 보는 변형
 */
var LABEL_SYNONYMS={
  '운동장':['놀이시설','체육시설','운동시설'],
  '놀이터/공원':['놀이시설','어린이놀이터','공원','놀이터'],
  '교문':['정문','출입구','학교 정문'],
  '주차장':['주차구역','주차공간'],
  '도로/인도':['도로','인도','보도'],
  '공영주차장':['공용주차장','공공주차장'],
  '공용통로,로비':['공용통로','로비','복도','공용복도'],
  '복도/계단':['계단','복도','계단/복도','계단복도'],
  '카운터/인포메이션':['카운터','인포','인포메이션','카운터/인포','안내데스크'],
  '건물외부':['건물외부(조경포함)','외부','외관'],
  '건물외부(조경포함)':['건물외부','외부','조경'],
  '매장 내부':['매장내부','매장','매장 안','실내'],
  '엘리베이터':['승강기','EV']
};

function normLabel(s){return String(s||'').trim().replace(/\s+/g,'').replace(/[,，]/g,',');}
function isSameLabel(a,b){
  if(!a||!b)return false;
  if(normLabel(a)===normLabel(b))return true;
  // a가 정규형이고 b가 동의어인 경우
  var syn=LABEL_SYNONYMS[a]||[];
  for(var i=0;i<syn.length;i++){if(normLabel(syn[i])===normLabel(b))return true;}
  // b가 정규형이고 a가 동의어인 경우
  syn=LABEL_SYNONYMS[b]||[];
  for(var i=0;i<syn.length;i++){if(normLabel(syn[i])===normLabel(a))return true;}
  return false;
}
// LLM 응답 라벨이 어드민 라벨과 동의어로 매칭되는지 확인 → 어드민 정규형 반환
function findCanonicalLabel(llmLabel,adminLabels){
  for(var i=0;i<adminLabels.length;i++){
    if(isSameLabel(adminLabels[i],llmLabel)){
      if(normLabel(adminLabels[i])!==normLabel(llmLabel)){
        if(window.__bapDebug)window.__bapDebug.synonymHits.push({llm:llmLabel,admin:adminLabels[i]});
      }
      return adminLabels[i];
    }
  }
  return null;
}

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

async function llmCallOnce(model,prompt,dbg){
  var r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
    body:JSON.stringify({model:model,max_tokens:4000,temperature:0,messages:[{role:'user',content:prompt}]})
  });
  dbg.status=r.status;
  if(r.status===401){dbg.err='401_KEY_INVALID';return {fatal:true};}
  if(r.status===429){dbg.err='429_RATE_LIMIT';return {retryable:true};}
  if(r.status>=500&&r.status<600){dbg.err='5XX_'+r.status;return {retryable:true};}
  if(!r.ok){dbg.err='HTTP_'+r.status;return {fatal:true};}
  var j=await r.json();
  if(!j.content||!j.content[0]){dbg.err='NO_CONTENT';dbg.body=JSON.stringify(j).slice(0,300);return {fatal:true};}
  return {txt:j.content[0].text};
}

async function llmCall(model,prompt){
  var dbg={model:model,promptLen:prompt.length,t:Date.now(),attempts:0};
  try{
    var res=null;
    for(var att=0;att<2;att++){
      dbg.attempts=att+1;
      res=await llmCallOnce(model,prompt,dbg);
      if(res.txt)break;
      if(res.fatal){window.__bapDebug.errors.push(dbg);console.error('[bap] LLM fatal',dbg);return null;}
      if(res.retryable&&att===0){console.warn('[bap] LLM 재시도 ('+dbg.err+') 1.5s 대기');await new Promise(rs=>setTimeout(rs,1500));continue;}
      window.__bapDebug.errors.push(dbg);console.error('[bap] LLM 재시도 후도 실패',dbg);return null;
    }
    var txt=res.txt;
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
  var finalRes=sonnetResult||haikuResult;
  if(!finalRes)return {__llmFail:true};
  return finalRes;
}

async function buildPlan(s1,s2,name){
  var rowDbg={name:name,t:Date.now(),boxes:[]};
  var plans=[];
  var allBoxes=s1.concat(s2);
  
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
  
  // ===== v2: ① 도메인 룰 매칭 (LLM 우회) =====
  var rule=matchDomainRule(name);
  if(rule){
    console.log('[bap] 도메인 룰 매칭:',rule.name,'→ LLM 우회');
    if(window.__bapDebug)window.__bapDebug.ruleHits.push({name:name,rule:rule.name});
    reqs.forEach(req=>{
      var p=req.plan;
      if(rule.action==='NO_CHANGE'){
        // 현재 그대로 유지, actions 없음
        p.ruleApplied=true;p.ruleName=rule.name;p.ruleBadge=rule.badge;p.ruleReason=rule.reason;
        p.judge='RULE';
      } else if(rule.forceSpaces){
        // v3: forceSpaces = "추가만" (현재 체크된 적합 공간 보존, BAD_SPACES만 제거)
        var allOptLabels=p.allItems.map(i=>i.label);
        // 동의어 매칭: forceSpaces에 있는 라벨이 어드민에 다른 표기로 있으면 그 표기 사용
        var canonical=[];
        rule.forceSpaces.forEach(l=>{
          var c=findCanonicalLabel(l,allOptLabels);
          if(c&&!isBad(c))canonical.push(c);
        });
        // 제거: 현재 체크 중 BAD_SPACES만 제거 (적합 공간은 보존)
        p.currentItems.forEach(it=>{
          if(isBad(it.label)){p.remove.push(it.label);p.removeItems.push(it);}
        });
        // 추가: canonical 중 현재에 없는 것
        canonical.forEach(lbl=>{
          if(p.current.indexOf(lbl)>=0)return;
          var it=p.allItems.find(i=>i.label===lbl&&!i.checked);
          if(it){p.add.push(lbl);p.addItems.push(it);}
        });
        p.ruleApplied=true;p.ruleName=rule.name;p.ruleBadge=rule.badge;p.ruleReason=rule.reason;
        p.judge='RULE';
      }
      p.result=p.current.filter(c=>p.remove.indexOf(c)<0).concat(p.add);
    });
    var indActionsR=[];
    s1.forEach(b=>{
      if(b.ghost)return;
      var stdInd=['04-01','04-02','04-03','04-04','04-05','04-06','04-07','04-08','04-09'];
      stdInd.forEach(sub=>{
        var it=b.boxRef.items.find(i=>i.sub===sub&&!i.checked);
        if(it)indActionsR.push({op:'add',type:'cat1',box:b.box,scodeOne:b.catX,catName:b.catName,optType:it.optType,optCode:it.sub,optTxt:it.label,dim:'04'});
      });
    });
    rowDbg.ruleApplied=rule.name;
    window.__bapDebug.llmCalls.push({type:'buildPlan',row:rowDbg});
    return {plans:plans,llmUsed:false,llmFailed:false,ruleApplied:true,ruleName:rule.name,ruleBadge:rule.badge,ruleReason:rule.reason,ruleNoChange:rule.action==='NO_CHANGE',indActions:indActionsR};
  }

  // ===== v2: ② LLM 호출 (룰 미적용 케이스만) =====
  var llmResult=null;
  var llmFailed=false;
  if(LLM_ENABLED&&reqs.length>0){
    llmResult=await llmJudge(name||'',reqs);
    if(llmResult&&llmResult.__llmFail){llmFailed=true;llmResult=null;}
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
      // LLM 실패/null → 아무 변경 없음 (v11.0.37: 부적합 제거조차 안 함, 자동수정 차단)
      // 사용자가 LLM 응답 없이 자동 수정 누르는 사고 방지
    } else {
      // BAD_SPACES는 LLM 응답에 있어도 제외
      finalLabels=finalLabels.filter(l=>!isBad(l));
      // v3: LLM 응답을 동의어 사전으로 어드민 정규형으로 변환
      var allOptLabels=p.allItems.map(i=>i.label);
      var canonicalLabels=[];
      finalLabels.forEach(l=>{
        var c=findCanonicalLabel(l,allOptLabels);
        if(c&&canonicalLabels.indexOf(c)<0)canonicalLabels.push(c);
      });
      finalLabels=canonicalLabels;

      // 제거: 현재 중 최종에 없는 것 (BAD_SPACES 자동 포함)
      // v3: 동의어 매칭으로 보존 — LLM이 "운동장" 응답인데 어드민 라벨이 "놀이시설"인 경우 같은 의미로 보존
      p.currentItems.forEach(it=>{
        var keep=false;
        for(var i=0;i<finalLabels.length;i++){if(isSameLabel(it.label,finalLabels[i])){keep=true;break;}}
        if(!keep){p.remove.push(it.label);p.removeItems.push(it);}
      });
      // 추가: 최종 중 현재에 없는 것 (동의어 보존 케이스 제외)
      finalLabels.forEach(lbl=>{
        var already=false;
        for(var i=0;i<p.current.length;i++){if(isSameLabel(p.current[i],lbl)){already=true;break;}}
        if(already)return;
        var it=p.allItems.find(i=>i.label===lbl&&!i.checked);
        if(it){p.add.push(lbl);p.addItems.push(it);}
      });
    }

    p.result=p.current.filter(c=>p.remove.indexOf(c)<0).concat(p.add);
  });

  // catO 박스에 업종(dim 04) 9개 추가 (LLM 실패와 무관 — 단순 보정)
  var indActions=[];
  s1.forEach(b=>{
    if(b.ghost)return;
    var stdInd=['04-01','04-02','04-03','04-04','04-05','04-06','04-07','04-08','04-09'];
    stdInd.forEach(sub=>{
      var it=b.boxRef.items.find(i=>i.sub===sub&&!i.checked);
      if(it)indActions.push({op:'add',type:'cat1',box:b.box,scodeOne:b.catX,catName:b.catName,optType:it.optType,optCode:it.sub,optTxt:it.label,dim:'04'});
    });
  });

  // ===== v3: ④ 부분 비움 안전망 강화 (50% 이상 빈 list면 의심) =====
  // v2에서는 100% 빈 list만 차단했지만, 일부 박스만 비우는 사고가 통과됨 → 50%로 강화
  var llmAllEmpty=false;
  var llmManyEmpty=false;
  if(llmResult){
    var resBoxes=plans.filter(p=>p.current.length>0);  // 현재 체크 있는 박스만 카운트
    var emptyBoxes=resBoxes.filter(p=>p.result.length===0);
    // v4.2: 90% 임계 추가 — 10/11, 9/10 같은 케이스도 잡음 (에스컬레이터 직사각형 사고 방지)
    if(resBoxes.length>=2&&emptyBoxes.length>=Math.ceil(resBoxes.length*0.9)){
      llmAllEmpty=true;
      console.warn('[bap] LLM이 박스 '+emptyBoxes.length+'/'+resBoxes.length+' 비움 (90%↑) → 변경 없음 모드');
      // v5.1: 차단해도 BAD_SPACES 제거는 별도 보존
      reqs.forEach(req=>{clearKeepBad(req.plan);});
    } else if(resBoxes.length>=4&&emptyBoxes.length>=Math.ceil(resBoxes.length*0.5)){
      llmManyEmpty=true;
      console.warn('[bap] LLM이 박스 '+emptyBoxes.length+'/'+resBoxes.length+' 비움 (50%↑) → 부분 의심 모드');
      reqs.forEach(req=>{clearKeepBad(req.plan);});
    }
  }
  // v5.1: 차단 시 BAD_SPACES 제거만 보존하는 헬퍼
  function clearKeepBad(p){
    var badItems=p.currentItems.filter(it=>isBad(it.label));
    p.remove=badItems.map(it=>it.label);
    p.removeItems=badItems;
    p.add=[];p.addItems=[];
    p.result=p.current.filter(c=>!isBad(c));
    p.badOnly=true; // 자동수정 가능: 부적합만 제거
  }

  // ===== v4: 사후 의심 패턴 감지 =====
  // (룰 적용/안전망 행은 이미 변경 actions가 0이라 영향 없음)
  var suspicious={consistentRemove:[],broadAdd:[],hugeAdd:[],dropOnly:[]};
  if(llmResult&&!llmAllEmpty&&!llmManyEmpty){
    // 패턴 1: 한 라벨이 5개 이상 박스에서 동시 제거 (LLM 일관 오판)
    var labelCount={};
    plans.forEach(p=>{p.remove.forEach(lbl=>{labelCount[lbl]=(labelCount[lbl]||0)+1;});});
    suspicious.consistentRemove=Object.keys(labelCount).filter(l=>labelCount[l]>=5).map(l=>({label:l,n:labelCount[l]}));
    // 패턴 2: 박스당 4개 이상 추가 (광범위 추가 인플레이션)
    suspicious.broadAdd=plans.filter(p=>p.add.length>=4).map(p=>({box:p.kind+'|'+p.box,n:p.add.length,labels:p.add.slice()}));
    // 패턴 2-1 (v4.3): 박스당 7개 이상 추가 (강한 광범위 — 1박스라도 의심, false positive 줄이려고 6→7로 상향)
    suspicious.hugeAdd=plans.filter(p=>p.add.length>=7).map(p=>({box:p.kind+'|'+p.box,n:p.add.length,labels:p.add.slice()}));
    // 패턴 3 (v4.3): 박스당 제거 ≥2 + 추가 0 (단순 빼기) — 임계 ≥3 → ≥2 박스로 강화
    suspicious.dropOnly=plans.filter(p=>p.remove.length>=2&&p.add.length===0).map(p=>({box:p.kind+'|'+p.box,removed:p.remove.slice()}));
  }
  var v4Suspicious=(suspicious.consistentRemove.length>0||suspicious.broadAdd.length>=2||suspicious.hugeAdd.length>=1||suspicious.dropOnly.length>=2);
  if(v4Suspicious){
    console.warn('[bap] v4 의심 패턴 감지 → 모든 박스 변경 보류:',{consistentRemove:suspicious.consistentRemove.length,broadAdd:suspicious.broadAdd.length,hugeAdd:suspicious.hugeAdd.length,dropOnly:suspicious.dropOnly.length});
    var sumParts=[];
    if(suspicious.consistentRemove.length>0)sumParts.push('동일라벨'+suspicious.consistentRemove.length+'종 일괄제거');
    if(suspicious.hugeAdd.length>=1)sumParts.push('강한광범위추가'+suspicious.hugeAdd.length+'박스(6+)');
    if(suspicious.broadAdd.length>=2)sumParts.push('광범위추가'+suspicious.broadAdd.length+'박스');
    if(suspicious.dropOnly.length>=2)sumParts.push('단순빼기'+suspicious.dropOnly.length+'박스');
    var v4Note='🔍 v4의심 ('+sumParts.join(', ')+') — 변경 보류';
    plans.forEach(p=>{
      clearKeepBad(p); // v5.1: BAD_SPACES 제거만 보존
      p.v4Suspicious=true;
      p.v4Note=v4Note;
    });
  }

  rowDbg.llmResult=llmResult;
  rowDbg.llmFailed=llmFailed;
  rowDbg.llmAllEmpty=llmAllEmpty;
  rowDbg.llmManyEmpty=llmManyEmpty;
  rowDbg.suspicious=suspicious;
  rowDbg.v4Suspicious=v4Suspicious;
  rowDbg.plans=plans.map(p=>({k:p.kind+'|'+p.box,cur:p.current.length,rm:p.remove.length,ad:p.add.length}));
  window.__bapDebug.llmCalls.push({type:'buildPlan',row:rowDbg});
  return {plans:plans,llmUsed:!!llmResult,llmFailed:llmFailed,llmAllEmpty:llmAllEmpty,llmManyEmpty:llmManyEmpty,suspicious:suspicious,v4Suspicious:v4Suspicious,indActions:indActions};
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

async function runFix(rgr,actions,plans,llmTrust){
  // llmTrust: LLM이 정상 응답한 경우만 true. false면 LOCK 박제 안 함.
  if(actions.length===0){
    // v11.0.37: actions 0이어도 LLM 정상 응답이면 현재 상태 LOCK 박제 (재호출 방지)
    if(llmTrust&&plans&&plans.length>0){
      await saveLockFromDom(rgr,plans);
    }
    return {success:0,total:0,locked:!!llmTrust};
  }
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
  // v11.0.37 LOCK 조건부 박제: LLM 정상 + 100% 성공 + 실측 DOM
  var locked=false;
  if(llmTrust&&ok===actions.length&&plans){
    locked=await saveLockFromDom(rgr,plans);
  } else if(plans){
    console.warn('[bap] LOCK 저장 skip:',rgr,'llmTrust=',llmTrust,'success=',ok+'/'+actions.length);
  }
  return {success:ok,total:actions.length,locked:locked};
}

async function saveLockFromDom(rgr,plans){
  // 자동수정 후 실제 DOM 다시 읽어서 그 결과로 LOCK 박제
  try{
    var r=await fetch('/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+rgr+'&EditMode=1',{credentials:'include',cache:'no-store'});
    var t=await r.text(),d=new DOMParser().parseFromString(t,'text/html');
    var full=analyzeFull(d);
    var lock={};
    plans.forEach(function(p){
      var src=p.kind==='cat1'?full.boxes1:full.boxes2;
      var b=src[p.box];
      if(!b){lock[p.kind+'|'+p.box]=p.result||p.current||[];return;}
      var actual=b.items.filter(function(i){return i.dim==='05'&&i.checked;}).map(function(i){return (i.label||'').trim();});
      lock[p.kind+'|'+p.box]=actual;
    });
    localStorage.setItem('__bapLock_'+rgr,JSON.stringify(lock));
    console.log('[bap] LOCK 저장 (실측 DOM):',rgr,Object.keys(lock).length+'박스');
    return true;
  }catch(e){console.error('[bap] LOCK 저장 실패:',e);return false;}
}

async function fetchAndAnalyze(rgr,name,force){
  try{
    var r=await fetch('/AdminManager/MakeGoodsTypeOneDp.php?RgrCode='+rgr+'&EditMode=1',{credentials:'include',cache:'no-store'});
    var t=await r.text(),d=new DOMParser().parseFromString(t,'text/html');
    var nm=name;
    if(!nm){var ni=d.querySelector('input[name="GoodsName"]');if(ni&&ni.value)nm=ni.value;}
    var full=analyzeFull(d);
    var s1=summarize(full.boxes1,'cat1',full.hidO);
    var s2=summarize(full.boxes2,'cat2',null);
    if(!force){
      var lkRaw=localStorage.getItem('__bapLock_'+rgr);
      if(lkRaw){
        try{
          var lock=JSON.parse(lkRaw);
          var ab=s1.concat(s2);
          var nrm=function(a){return (a||[]).map(function(s){return String(s||'').trim();}).slice().sort().join('|');};
          var mt=ab.every(function(b){
            if(b.ghost)return true;
            var k=b.kind+'|'+b.box,lk=lock[k];
            if(!lk)return false;
            var cu=b.d5items.map(function(i){return i.label;});
            return nrm(cu)===nrm(lk);
          });
          if(mt){
            s1.forEach(function(b){if(!b.ghost)b.judge='OK';});
            s2.forEach(function(b){b.judge='OK';});
            var lkPlans=ab.filter(function(b){return !b.ghost;}).map(function(b){
              var cur=b.d5items.map(function(i){return i.label;});
              return {kind:b.kind,box:b.box,catX:b.catX,catName:b.catName,judge:'OK',
                current:cur,currentItems:b.d5items,
                allItems:b.boxRef.items.filter(function(i){return i.dim==='05';}),
                remove:[],removeItems:[],add:[],addItems:[],result:cur};
            });
            console.log('[bap] LOCK 모드:',rgr);
            return {rgr:rgr,name:nm,s1:s1,s2:s2,plans:lkPlans,actions:[],llmUsed:false,locked:true};
          }
        }catch(e){}
      }
    }
    var planResult=await buildPlan(s1,s2,nm);
    // v2: 룰 적용 시 judge='RULE'
    if(planResult.ruleApplied){
      planResult.plans.forEach(p=>{
        var arr=p.kind==='cat1'?s1:s2;
        var box=arr.find(b=>b.box===p.box);
        if(box&&!box.ghost)box.judge='RULE';
      });
    } else if(planResult.llmUsed){
      // LLM 결과 반영해서 박스 judge 후처리
      planResult.plans.forEach(p=>{
        var arr=p.kind==='cat1'?s1:s2;
        var box=arr.find(b=>b.box===p.box);
        if(!box||box.ghost)return;
        if(box.judge==='MISMATCH')return;
        if(planResult.llmAllEmpty){box.judge='OK';p.judge='OK';return;} // 안전망: 변경 없음 = 정상
        if(p.result.length===0){
          box.judge='DROP';p.judge='DROP';
        } else {
          box.judge='OK';p.judge='OK';
        }
      });
    }
    var actions=plansToActions(planResult.plans,planResult.indActions);
    return {rgr:rgr,name:nm,s1:s1,s2:s2,plans:planResult.plans,actions:actions,
      llmUsed:planResult.llmUsed,llmFailed:!!planResult.llmFailed,
      ruleApplied:!!planResult.ruleApplied,ruleName:planResult.ruleName,ruleBadge:planResult.ruleBadge,ruleNoChange:!!planResult.ruleNoChange,
      llmAllEmpty:!!planResult.llmAllEmpty,llmManyEmpty:!!planResult.llmManyEmpty,
      suspicious:planResult.suspicious,v4Suspicious:!!planResult.v4Suspicious};
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
  var bgC=plan.ruleApplied?'#fff3cd':(plan.judge==='DROP'?'#e8e8e8':(plan.judge==='OK'&&!changed?'#e8f5e9':(plan.remove.length>0?'#ffe0e0':(plan.add.length>0?'#fff8dc':'#f5f5f5'))));
  var icon=plan.kind==='cat1'?'📦':'🏢';
  var prefix=plan.kind==='cat1'?'카테고리':'업종';
  var H='<div style="border:1px solid '+(plan.ruleApplied?'#ffc107':'#ccc')+';border-radius:6px;padding:10px;margin:6px 0;background:'+bgC+';font-size:13px">';
  if(plan.ruleApplied)H+='<div style="background:#fff;border-left:4px solid #ffc107;padding:4px 8px;margin-bottom:6px;font-size:12px;color:#856404"><b>📐 룰 적용:</b> '+plan.ruleName+' — '+(plan.ruleReason||'')+'</div>';
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
  // v5: 모든 차단 사유를 한 빨간 배지로 통합 + 사유는 작은 글씨로
  var blockFix=rd.llmFailed||rd.ruleNoChange||rd.llmAllEmpty||rd.llmManyEmpty||rd.v4Suspicious;
  // v5.1: 차단이어도 actions가 전부 BAD_SPACES 제거뿐이면 "부적합만 빼기"로 활성화
  var badOnlyMode=blockFix&&rd.actions&&rd.actions.length>0&&rd.actions.every(function(a){return (a.op==='del'&&BAD_SPACES.indexOf(a.optTxt)>=0)||(a.op==='add'&&a.dim==='04');});
  if(badOnlyMode)blockFix=false;
  var why='';
  if(rd.llmFailed)why='LLM 응답 실패';
  else if(rd.ruleNoChange)why='법령 사인물 — 광범위 적합';
  else if(rd.llmAllEmpty)why='LLM이 모든 박스 비움 — 의심';
  else if(rd.llmManyEmpty)why='LLM이 박스 50%↑ 비움 — 의심';
  else if(rd.v4Suspicious&&rd.suspicious){
    var s=rd.suspicious,parts=[];
    if(s.consistentRemove&&s.consistentRemove.length>0)parts.push('같은 공간 일괄 제거');
    if(s.hugeAdd&&s.hugeAdd.length>=1)parts.push('한 박스 추가 너무 많음');
    if(s.broadAdd&&s.broadAdd.length>=2)parts.push('여러 박스 광범위 추가');
    if(s.dropOnly&&s.dropOnly.length>=2)parts.push('빼기만 발생');
    why='LLM 의심 ('+parts.join(', ')+')';
  }
  var verdictBadge='';
  if(blockFix){
    verdictBadge='<span style="background:#d9534f;color:#fff;padding:4px 10px;border-radius:4px;font-size:13px;margin-left:8px;font-weight:bold">🚫 건들지 말 것</span><span style="font-size:12px;color:#ffd;margin-left:6px">— '+why+'</span>';
  } else if(rd.actions.length>0){
    verdictBadge='<span style="background:#ffc107;color:#000;padding:4px 10px;border-radius:4px;font-size:13px;margin-left:8px;font-weight:bold">✏️ 박스 보고 판단</span>'+(rd.ruleApplied?'<span style="font-size:12px;color:#ffd;margin-left:6px">— '+(rd.ruleName||'')+'</span>':'');
  } else {
    verdictBadge='<span style="background:#28a745;color:#fff;padding:4px 10px;border-radius:4px;font-size:13px;margin-left:8px;font-weight:bold">✅ 변경 없음</span>';
  }
  var _delBad=rd.actions?rd.actions.filter(function(a){return a.op==='del'&&BAD_SPACES.indexOf(a.optTxt)>=0;}).length:0;
  var _addInd=rd.actions?rd.actions.filter(function(a){return a.op==='add'&&a.dim==='04';}).length:0;
  var fixBtnLabel=badOnlyMode?('🧹 안전 정리 — 부적합'+_delBad+'/업종보정'+_addInd):('자동수정 '+rd.actions.length);
  var fixBtnColor=badOnlyMode?'#17a2b8':'#ffc107';
  var fixBtnTextColor=badOnlyMode?'#fff':'#000';
  var fixBtn=(rd.actions.length>0&&(!blockFix||badOnlyMode))?'<button id="__bfx" style="padding:8px 16px;cursor:pointer;border-radius:4px;border:none;background:'+fixBtnColor+';color:'+fixBtnTextColor+';font-weight:bold;font-size:14px">'+fixBtnLabel+'</button>':'';
  var H='<div class="__bhdr" style="background:#305496;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap"><div><div style="font-size:18px;font-weight:bold">'+(rd.name||'(없음)')+verdictBadge+'</div><div style="font-size:13px;opacity:.85">'+rgr+' · 변경 ❌'+delN+' / ➕'+addN+' · '+VER+'</div></div><div style="display:flex;gap:6px">'+fixBtn+hdrCtrls+'</div></div>';
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
    var r=await runFix(rgr,rd.actions,rd.plans,!rd.llmFailed);
    bfx.textContent='완료 '+r.success+'/'+r.total+(r.locked?' 🔒':'');
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
  // v5: 차단 / 검토 / 변경없음 3가지로 카운트
  var blockedN=res.filter(r=>r.llmFailed||r.ruleNoChange||r.llmAllEmpty||r.llmManyEmpty||r.v4Suspicious).length;
  var reviewN=res.filter(r=>!(r.llmFailed||r.ruleNoChange||r.llmAllEmpty||r.llmManyEmpty||r.v4Suspicious)&&r.actions&&r.actions.length>0).length;
  var noChangeN=res.length-blockedN-reviewN;
  H+='<div style="font-size:13px;opacity:.85">'+(CAT_NAMES[cat]||'?')+'('+cat+') / '+pg+'p · '+
    '<span style="background:#d9534f;color:#fff;padding:3px 8px;border-radius:3px;font-weight:bold">🚫 건들지말것 '+blockedN+'</span> · '+
    '<span style="background:#ffc107;color:#000;padding:3px 8px;border-radius:3px;font-weight:bold">✏️ 박스 보고 판단 '+reviewN+'</span> · '+
    '<span style="background:#28a745;color:#fff;padding:3px 8px;border-radius:3px;font-weight:bold">✅ 변경 없음 '+noChangeN+'</span>'+
    '</div></div>';
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
    // v5: 차단/검토 두 가지 배지로 통합
    var _blocked=r.llmFailed||r.ruleNoChange||r.llmAllEmpty||r.llmManyEmpty||r.v4Suspicious;
    // v5.1: 차단이어도 actions 전부 BAD_SPACES 제거뿐이면 "부적합만 빼기" 버튼 활성화
    var _badOnly=_blocked&&r.actions&&r.actions.length>0&&r.actions.every(function(a){return (a.op==='del'&&BAD_SPACES.indexOf(a.optTxt)>=0)||(a.op==='add'&&a.dim==='04');});
    var _why='';
    if(r.llmFailed)_why='LLM 응답 실패';
    else if(r.ruleNoChange)_why='법령 사인물';
    else if(r.llmAllEmpty)_why='LLM이 모든 박스 비움';
    else if(r.llmManyEmpty)_why='LLM이 박스 50%↑ 비움';
    else if(r.v4Suspicious)_why='LLM 의심 패턴';
    if(_blocked&&!_badOnly)H+='<span style="padding:6px 10px;background:#d9534f;color:#fff;border-radius:4px;font-size:12px;font-weight:bold" title="'+_why+'">🚫 건들지 말 것</span><span style="padding:6px 8px;font-size:11px;color:#666">'+_why+'</span>';
    else if(_badOnly)H+='<span style="padding:6px 10px;background:#d9534f;color:#fff;border-radius:4px;font-size:11px;font-weight:bold;margin-right:6px">🚫 '+_why+'</span><button data-fix="'+i+'" class="__brfx" style="padding:6px 12px;background:#17a2b8;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;font-weight:bold">🧹 안전 정리 '+r.actions.length+'</button>';
    else if(r.ruleApplied&&r.actions.length>0)H+='<button data-fix="'+i+'" class="__brfx" style="padding:6px 12px;background:#ffc107;color:#000;border:none;border-radius:4px;font-size:12px;cursor:pointer;font-weight:bold">✏️ 박스 보고 판단 '+r.actions.length+' (룰)</button>';
    else if(r.actions.length>0)H+='<button data-fix="'+i+'" class="__brfx" style="padding:6px 12px;background:#ffc107;color:#000;border:none;border-radius:4px;font-size:12px;cursor:pointer;font-weight:bold">✏️ 박스 보고 판단 '+r.actions.length+'</button>';
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
  H+='</div><div style="padding:8px 14px;background:#f5f5f5;font-size:11px;color:#666;border-top:1px solid #ddd">🚫 빨강 = 건들지 말 것 / ✏️ 노랑 = 박스 보고 판단 / ✅ 초록 = 변경 없음 ('+VER+')<span style="float:right">'+VER+'</span></div>';
  p.innerHTML=H;attachCtrls();
  document.getElementById('__bxl').onclick=function(){
    var hdr=['#','상품코드','상품명','판정','상세','박스','catX','이름','현재','제거','추가','결과','URL'];
    var data=[hdr];var n=0;
    res.forEach((r,i)=>{
      if(r.err){data.push([i+1,r.rgr,r.name||'','에러','','','','','','','','','']);return;}
      // v5: 모든 차단 케이스를 하나로 묶음
      var blocked=r.llmFailed||r.ruleNoChange||r.llmAllEmpty||r.llmManyEmpty||r.v4Suspicious;
      var hasChange=(r.actions&&r.actions.length>0);
      var verdict='',detail='';
      if(blocked){
        verdict='🚫 건들지 말 것';
        if(r.llmFailed)detail='LLM 응답 실패';
        else if(r.ruleNoChange)detail='법령 사인물 (광범위 적합)';
        else if(r.llmAllEmpty)detail='LLM이 모든 박스 비움';
        else if(r.llmManyEmpty)detail='LLM이 박스 50%↑ 비움';
        else if(r.v4Suspicious){
          var s=r.suspicious||{};var dp=[];
          if(s.consistentRemove&&s.consistentRemove.length)dp.push('같은 공간 일괄 제거');
          if(s.hugeAdd&&s.hugeAdd.length)dp.push('한 박스 추가 너무 많음');
          if(s.broadAdd&&s.broadAdd.length>=2)dp.push('여러 박스 광범위 추가');
          if(s.dropOnly&&s.dropOnly.length>=2)dp.push('빼기만 발생');
          detail='LLM 의심 ('+dp.join(', ')+')';
        }
      } else if(hasChange){
        verdict='✏️ 박스 보고 판단';
        detail=r.ruleApplied?('도메인 룰 적용 — '+(r.ruleName||'')):'LLM 추천';
      } else {
        verdict='✅ 변경 없음';
        detail='현재 그대로';
      }
      r.plans.forEach(pl=>{
        n++;
        var url=pl.kind==='cat1'?('https://www.hanasignmall.kr/Search.php?GetSearch='+r.rgr+'&CCode='+pl.catX+'&CateCou=1'):('https://www.hanasignmall.kr/shop/DisplayList.php?CCode='+pl.catX+'&CateType=2');
        data.push([n,r.rgr,r.name||'',verdict,detail,pl.kind==='cat1'?'상품별':'업종별',pl.catX,pl.catName,pl.current.join(', ')||'없음',pl.remove.join(', ')||'-',pl.add.join(', ')||'-',pl.result.join(', ')||'없음',url]);
      });
    });
    var d=new Date(),ts=d.getFullYear().toString().slice(2)+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0');
    downloadCSV(data,'박스별검수_v5_'+(CAT_NAMES[cat]||cat)+'_p'+pg+'_'+ts+'.csv');
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
      var pgr=document.getElementById('__bpr');if(pgr)pgr.textContent='검수 '+newRes.length+' / '+allRgrs.length+' (v4)';
    }
    res=newRes;window.__bapResults=res;render();
  };
  Array.from(p.querySelectorAll('.__brfx')).forEach(b=>{
    b.onclick=async function(){
      var idx=parseInt(b.getAttribute('data-fix'),10),r=res[idx];
      if(!r||!r.actions)return;
      // v5.1: BAD_SPACES 제거만이면 차단 무시
      var badOnly=r.actions.every(function(a){return (a.op==='del'&&BAD_SPACES.indexOf(a.optTxt)>=0)||(a.op==='add'&&a.dim==='04');});
      if(!badOnly){
        if(r.llmFailed){alert('LLM 응답 실패 — 자동수정 불가');return;}
        if(r.llmAllEmpty||r.llmManyEmpty){alert('LLM이 박스 50%↑ 비움 → 안전망 작동. 수동 검토 필요.');return;}
        if(r.v4Suspicious){
          var s=r.suspicious||{};
          var msg='v4 의심 패턴 감지 — 자동수정 보류:\n';
          if(s.consistentRemove&&s.consistentRemove.length)msg+='• 동일 라벨 일괄 제거: '+s.consistentRemove.map(x=>x.label+'('+x.n+'박스)').join(', ')+'\n';
          if(s.broadAdd&&s.broadAdd.length>=2)msg+='• 광범위 추가 박스: '+s.broadAdd.length+'개\n';
          if(s.dropOnly&&s.dropOnly.length>=2)msg+='• 단순 빼기 박스: '+s.dropOnly.length+'개\n';
          msg+='\n수동 검토 권장.';
          alert(msg);return;
        }
      }
      b.textContent='...';b.disabled=true;
      await runFix(r.rgr,r.actions,r.plans,!r.llmFailed);
      var ar=await fetchAndAnalyze(r.rgr,r.name);
      res[idx]=ar;render();
    };
  });
  var bfa=document.getElementById('__bfa');
  if(bfa)bfa.onclick=async function(){
    if(!confirm('전체 자동수정?\n❌ '+totDel+' + ➕ '+totAdd+'\n(LLM 실패 / 룰 차단 / 안전망 / v4 의심 행은 자동 제외)'))return;
    bfa.textContent='수정중...';bfa.disabled=true;
    for(var k=0;k<res.length;k++){
      var r=res[k];if(!r.actions||r.actions.length===0)continue;
      if(r.llmFailed){console.warn('[bap] LLM 실패 행 skip:',r.rgr);continue;}
      if(r.ruleNoChange){console.warn('[bap] 룰 차단 행 skip:',r.rgr,r.ruleName);continue;}
      if(r.llmAllEmpty||r.llmManyEmpty){console.warn('[bap] 안전망 행 skip:',r.rgr);continue;}
      if(r.v4Suspicious){console.warn('[bap] v4 의심 행 skip:',r.rgr);continue;}
      bfa.textContent='수정중 '+(k+1)+'/'+res.length;
      await runFix(r.rgr,r.actions,r.plans,!r.llmFailed);
      var ar=await fetchAndAnalyze(r.rgr,r.name);
      res[k]=ar;
    }
    render();
  };
}
render();
})();
