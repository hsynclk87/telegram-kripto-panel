const SPOT="https://api.binance.com", FUT="https://fapi.binance.com";
const TFS=new Set(["15m","1h","4h","1d","1w"]), KS=[5,10,20,30], HS=[3,5,10,20], cache=new Map();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const med=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):0};
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error("Binance API "+r.status);return r.json()}
async function candles(symbol,tf,count){
 let all=[],end=Date.now();
 while(all.length<count){const n=Math.min(1000,count-all.length),u=SPOT+"/api/v3/klines?symbol="+symbol+"&interval="+tf+"&limit="+n+"&endTime="+end,b=await json(u);if(!b.length)break;all.unshift(...b);if(b.length<n)break;end=Number(b[0][0])-1}
 const map=new Map();for(const x of all)map.set(Number(x[0]),{t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5],ct:+x[6]});
 return [...map.values()].sort((a,b)=>a.t-b.t).filter(x=>x.ct<Date.now()-1000).slice(-count)
}
function features(r){
 const n=r.length, f=Array(n).fill(null),tr=Array(n).fill(0),pdm=Array(n).fill(0),mdm=Array(n).fill(0),tp=r.map(x=>(x.h+x.l+x.c)/3),rsi=Array(n).fill(null),adx=Array(n).fill(null);
 for(let i=0;i<n;i++){if(i){tr[i]=Math.max(r[i].h-r[i].l,Math.abs(r[i].h-r[i-1].c),Math.abs(r[i].l-r[i-1].c));const up=r[i].h-r[i-1].h,dn=r[i-1].l-r[i].l;pdm[i]=up>dn&&up>0?up:0;mdm[i]=dn>up&&dn>0?dn:0}}
 let g=0,l=0,atr=0,sp=0,sm=0,adxNow=null,dxs=[];
 for(let i=1;i<n;i++){const d=r[i].c-r[i-1].c;if(i<=14){g+=Math.max(d,0);l+=Math.max(-d,0);atr+=tr[i];sp+=pdm[i];sm+=mdm[i]}else{g=(g*13+Math.max(d,0))/14;l=(l*13+Math.max(-d,0))/14;atr=atr-atr/14+tr[i];sp=sp-sp/14+pdm[i];sm=sm-sm/14+mdm[i]}if(i>=14)rsi[i]=l===0?100:100-100/(1+g/l);if(i>=14&&atr>0){const a=100*sp/atr,b=100*sm/atr,dx=100*Math.abs(a-b)/Math.max(a+b,1e-9);if(dxs.length<14){dxs.push(dx);if(dxs.length===14)adxNow=dxs.reduce((x,y)=>x+y,0)/14}else adxNow=(adxNow*13+dx)/14;if(adxNow!==null)adx[i]=adxNow}}
 const avg=(a,i,k)=>{let s=0;for(let j=i-k+1;j<=i;j++)s+=a[j];return s/k};
 for(let i=30;i<n;i++){
  const rw=rsi.slice(i-13,i+1);if(rw.some(x=>x===null))continue;
  const lo=Math.min(...rw),hi=Math.max(...rw),st=(rsi[i]-lo)/Math.max(hi-lo,1e-9);
  let pos=0,neg=0,obv=0,vol=0,pv=0,vv=0;
  for(let j=i-19;j<=i;j++){const flow=tp[j]*r[j].v;if(j&&tp[j]>tp[j-1])pos+=flow;else if(j&&tp[j]<tp[j-1])neg+=flow;if(j&&r[j].c>r[j-1].c)obv+=r[j].v;else if(j&&r[j].c<r[j-1].c)obv-=r[j].v;vol+=r[j].v;pv+=flow;vv+=r[j].v}
  let tpMean=avg(tp,i,20),dev=0;for(let j=i-19;j<=i;j++)dev+=Math.abs(tp[j]-tpMean);
  const cci=(tp[i]-tpMean)/Math.max(.015*dev/20,1e-9),mfi=neg===0?100:100-100/(1+pos/neg),atrPct=avg(tr,i,14)/r[i].c,vwap=pv/Math.max(vv,1e-12),rel=r[i].v/Math.max(avg(r.map(x=>x.v),i-1,20),1e-12),roc=r[i].c/r[i-10].c-1,body=(r[i].c-r[i].o)/Math.max(atrPct*r[i].c,1e-9);
  f[i]=[rsi[i]/100,st,mfi/100,clamp(cci/300,-2,2),clamp(obv/Math.max(vol,1e-12),-1,1),clamp((adx[i]||0)/100,0,1),atrPct,(r[i].c-vwap)/vwap,clamp(rel,0,5)/5,clamp(roc,-.15,.15),clamp(body,-3,3)/3]
 }
 return f
}
function label(r,f,i,h){if(!f[i]||i+h>=r.length)return null;const ret=r[i+h].c/r[i].c-1,th=Math.max(.0015,f[i][6]*.35);return{ret,cls:ret>th?"LONG":ret< -th?"SHORT":"NEUTRAL"}}
function scaleFit(v){const m=Array(v[0].length).fill(0),s=Array(m.length).fill(0);for(const x of v)for(let d=0;d<m.length;d++)m[d]+=x[d]/v.length;for(const x of v)for(let d=0;d<m.length;d++)s[d]+=(x[d]-m[d])**2/v.length;return{m,s:s.map(x=>Math.sqrt(x)||1)}}
const scale=(v,z)=>v.map((x,i)=>(x-z.m[i])/z.s[i]);
function dist(a,b,type){let s=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);s+=type==="lorentzian"?Math.log1p(d):d*d}return type==="euclidean"?Math.sqrt(s):s}
function predict(train,q,k,type){
 if(train.length<k)return null;const z=scaleFit(train.map(x=>x.f)),qq=scale(q,z);
 const near=train.map(x=>({...x,d:dist(qq,scale(x.f,z),type)})).sort((a,b)=>a.d-b.d).slice(0,k),votes={LONG:0,SHORT:0,NEUTRAL:0};
 for(const x of near)votes[x.cls]+=1/(x.d+.05);
 const total=Object.values(votes).reduce((a,b)=>a+b,0),probs=Object.fromEntries(Object.entries(votes).map(([a,b])=>[a,b/total])),rank=Object.entries(probs).sort((a,b)=>b[1]-a[1]),signal=rank[0][0]==="NEUTRAL"||rank[0][1]<.4?"NEUTRAL":rank[0][0],rets=near.map(x=>x.ret);
 return{signal,probabilities:probs,voteShare:rank[0][1],margin:rank[0][1]-rank[1][1],meanReturn:rets.reduce((a,b)=>a+b,0)/rets.length,medianReturn:med(rets),neighbors:near.map(x=>({time:x.time,close:x.close,outcome:x.cls,forwardReturn:x.ret,distance:x.d}))}
}
function training(r,f,end,h,max=1200){const a=[];for(let i=Math.max(30,end-h-max);i<end-h;i++){const y=label(r,f,i,h);if(f[i]&&y)a.push({f:f[i],cls:y.cls,ret:y.ret,time:r[i].t,close:r[i].c})}return a}
function backtest(r,f,h,type,k){
 const out=[];for(let t=Math.max(500,r.length-180);t<r.length-h-1;t+=h){if(!f[t])continue;const tr=training(r,f,t,h);if(tr.length<Math.max(80,k*4))continue;const p=predict(tr,f[t],k,type),y=label(r,f,t,h);if(p&&y)out.push({p:p.signal,y:y.cls})}
 const correct=out.filter(x=>x.p===x.y).length,dir=out.filter(x=>x.y!=="NEUTRAL"),dc=dir.filter(x=>x.p===x.y).length,coverage=out.filter(x=>x.p!=="NEUTRAL").length;
 return{samples:out.length,accuracy:out.length?correct/out.length:null,directionalSamples:dir.length,directionalAccuracy:dir.length?dc/dir.length:null,signalCoverage:out.length?coverage/out.length:null,note:"Walk-forward: her test anında yalnızca sonucu önceden belli olmuş geçmiş örnekler kullanılır."}
}
async function futuresContext(s){
 const vals=await Promise.allSettled([json(FUT+"/fapi/v1/openInterest?symbol="+s),json(FUT+"/fapi/v1/premiumIndex?symbol="+s),json(FUT+"/futures/data/globalLongShortAccountRatio?symbol="+s+"&period=15m&limit=1")]);
 return{openInterestContracts:vals[0].status==="fulfilled"?+vals[0].value.openInterest:null,fundingRate:vals[1].status==="fulfilled"?+vals[1].value.lastFundingRate:null,markPrice:vals[1].status==="fulfilled"?+vals[1].value.markPrice:null,longShortAccountRatio:vals[2].status==="fulfilled"&&vals[2].value[0]?+vals[2].value[0].longShortRatio:null}
}
export async function analyzeKnn({symbol="BTCUSDT",timeframe="15m",k=10,horizon=5,distanceType="lorentzian",history=2500}={}){
 symbol=String(symbol).toUpperCase();k=+k;horizon=+horizon;history=clamp(+history||2500,1000,3000);
 if(!/^[A-Z0-9]{5,20}$/.test(symbol))throw Error("Geçersiz parite");if(!TFS.has(timeframe))throw Error("Desteklenmeyen zaman dilimi");if(!KS.includes(k))throw Error("K değeri 5, 10, 20 veya 30 olmalı");if(!HS.includes(horizon))throw Error("Tahmin ufku 3, 5, 10 veya 20 mum olmalı");if(!["lorentzian","euclidean"].includes(distanceType))throw Error("Geçersiz mesafe yöntemi");
 const key=[symbol,timeframe,k,horizon,distanceType,history].join(":");if(cache.has(key)&&Date.now()-cache.get(key).at<30000)return{...cache.get(key).value,cached:true};
 const r=await candles(symbol,timeframe,history);if(r.length<600)throw Error("Yeterli kapanmış mum yok: "+r.length);const f=features(r),i=r.length-1;if(!f[i])throw Error("Son kapanmış mum göstergeleri hesaplanamadı");
 const tr=training(r,f,i,horizon);if(tr.length<100)throw Error("Yeterli geçmiş benzer örnek bulunamadı");const p=predict(tr,f[i],k,distanceType);
 const kSensitivity=KS.map(v=>{const x=predict(tr,f[i],v,distanceType);return{k:v,signal:x.signal,probabilities:x.probabilities,voteShare:x.voteShare}});
 const distanceComparison=["lorentzian","euclidean"].map(v=>{const x=predict(tr,f[i],k,v);return{method:v,signal:x.signal,probabilities:x.probabilities}});
 const [bt,ctx]=await Promise.all([Promise.resolve(backtest(r,f,horizon,distanceType,k)),futuresContext(symbol)]);
 const result={symbol,timeframe,k,horizon,distance:distanceType,signal:p.signal,probabilities:p.probabilities,voteShare:p.voteShare,voteMargin:p.margin,expectedForwardReturnMean:p.meanReturn,expectedForwardReturnMedian:p.medianReturn,currentClose:r[i].c,candleCloseTime:r[i].ct,candlesUsed:r.length,trainingExamples:tr.length,closedCandlesOnly:true,neighbors:p.neighbors.slice(0,50),kSensitivity,distanceComparison,backtest:bt,marketContext:ctx,featureSet:["RSI14","StochRSI14","MFI14","CCI20","OBV20 normalized slope","ADX14","ATR14 percent","VWAP20 deviation","RelativeVolume20","ROC10","CandleBody/ATR"],limitations:["OI, funding ve long/short oranı güncel vadeli piyasa bağlamıdır; tarihsel eğitim vektörüne dahil değildir.","Komşu oyları kalibre edilmiş olasılık değildir.","Backtest geçmiş örneklem performansıdır; geleceği garanti etmez."]};
 cache.set(key,{at:Date.now(),value:result});return result
}
