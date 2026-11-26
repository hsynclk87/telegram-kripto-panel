export const defs=[
 ['rsi','RSI','Momentum','14 dönemlik Wilder RSI; 70 üzeri aşırı alım, 30 altı aşırı satım bölgesidir.'],
 ['stochrsi','Stoch RSI','Momentum','RSI değerinin son 14 dönem içindeki konumunu 0–100 aralığında ölçer; ham %K serisidir.'],
 ['mfi','Money Flow Index','Para Akışı','Fiyat ve hacmi birlikte kullanır; 14 dönemlik para giriş/çıkış baskısını ölçer.'],
 ['cci','CCI','Momentum','20 dönemlik ortalamadan sapmayı ölçer; +100 ve -100 eşikleri bağlamla değerlendirilir.'],
 ['obv','OBV','Hacim','Yükseliş/düşüş mumlarının hacmini kümülatif toplar; mutlak seviyesi değil yönü önemlidir.'],
 ['macd','MACD Histogram','Momentum','12/26 EMA farkı ile 9 EMA sinyal çizgisi arasındaki farkı ölçer.'],
 ['cmf','Chaikin Money Flow','Para Akışı','20 dönemlik hacim ağırlıklı kapanış konumunu ölçer; -1 ile +1 aralığındadır.'],
 ['adx','ADX','Trend','14 dönemlik Wilder DMI/ADX; trend gücünü ölçer, tek başına yön belirtmez.'],
 ['vwap','VWAP / VWMA Sapması','Fiyat Referansı','15m–4h grafiklerinde UTC günlük seans VWAP; 1d–1w grafiklerinde 20 dönemlik VWMA yaklaşımı kullanılır.'],
 ['atr','ATR','Volatilite','14 dönemlik Wilder ATR; volatiliteyi ölçer, yön sinyali değildir.']
];
export const directionalIds=new Set(['rsi','stochrsi','mfi','cci','obv','macd','cmf','vwap']);
export const directionalDefs=defs.filter(x=>directionalIds.has(x[0]));

export function sma(values,period){
 const out=Array(values.length).fill(null);
 for(let i=period-1;i<values.length;i++){
  const window=values.slice(i-period+1,i+1);
  if(window.every(Number.isFinite))out[i]=window.reduce((a,b)=>a+b,0)/period;
 }
 return out;
}
export function ema(values,period){
 const out=Array(values.length).fill(null),k=2/(period+1);
 let seed=[],previous=null;
 for(let i=0;i<values.length;i++){
  const value=values[i];
  if(!Number.isFinite(value)){if(previous===null)seed=[];continue;}
  if(previous===null){
   seed.push(value);
   if(seed.length===period){previous=seed.reduce((a,b)=>a+b,0)/period;out[i]=previous;}
  }else{previous=value*k+previous*(1-k);out[i]=previous;}
 }
 return out;
}
function rolling(values,period,fn){
 const out=Array(values.length).fill(null);
 for(let i=period-1;i<values.length;i++){
  const window=values.slice(i-period+1,i+1);
  if(window.every(Number.isFinite))out[i]=fn(window);
 }
 return out;
}
function wilderSum(values,period){
 const out=Array(values.length).fill(null);
 if(values.length<=period)return out;
 let sum=0;
 for(let i=1;i<=period;i++)sum+=values[i];
 out[period]=sum;
 for(let i=period+1;i<values.length;i++)out[i]=out[i-1]-out[i-1]/period+values[i];
 return out;
}
function rsi(values,period=14){
 const out=Array(values.length).fill(null);
 let gain=0,loss=0;
 for(let i=1;i<values.length;i++){
  const change=values[i]-values[i-1],up=Math.max(change,0),down=Math.max(-change,0);
  if(i<=period){
   gain+=up;loss+=down;
   if(i===period)out[i]=gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
  }else{
   gain=(gain*(period-1)+up)/period;loss=(loss*(period-1)+down)/period;
   out[i]=gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
  }
 }
 return out;
}
export function calc(id,rows){
 const n=rows.length;
 if(!n)return [];
 const close=rows.map(x=>x.c),high=rows.map(x=>x.h),low=rows.map(x=>x.l),volume=rows.map(x=>x.v);
 const typical=rows.map(x=>(x.h+x.l+x.c)/3);
 const change=close.map((x,i)=>i?x-close[i-1]:null);
 const trueRange=rows.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-rows[i-1].c),Math.abs(x.l-rows[i-1].c)):x.h-x.l);
 const rsiValues=rsi(close,14);
 let out=Array(n).fill(null);
 switch(id){
  case 'rsi': return rsiValues;
  case 'stochrsi':{
   const min=rolling(rsiValues,14,a=>Math.min(...a)),max=rolling(rsiValues,14,a=>Math.max(...a));
   return rsiValues.map((x,i)=>min[i]===null||max[i]===null||max[i]===min[i]?null:(x-min[i])/(max[i]-min[i])*100);
  }
  case 'mfi':{
   for(let i=14;i<n;i++){
    let positive=0,negative=0;
    for(let j=i-13;j<=i;j++){
     const flow=typical[j]*volume[j];
     if(typical[j]>typical[j-1])positive+=flow;
     else if(typical[j]<typical[j-1])negative+=flow;
    }
    out[i]=positive===0&&negative===0?50:negative===0?100:100-100/(1+positive/negative);
   }
   return out;
  }
  case 'cci':{
   const mean=sma(typical,20);
   for(let i=19;i<n;i++){
    const deviation=typical.slice(i-19,i+1).reduce((sum,x)=>sum+Math.abs(x-mean[i]),0)/20;
    out[i]=deviation===0?null:(typical[i]-mean[i])/(.015*deviation);
   }
   return out;
  }
  case 'obv':{
   out[0]=volume[0];
   for(let i=1;i<n;i++)out[i]=out[i-1]+(close[i]>close[i-1]?volume[i]:close[i]<close[i-1]?-volume[i]:0);
   return out;
  }
  case 'macd':{
   const fast=ema(close,12),slow=ema(close,26);
   const line=close.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]);
   const signal=ema(line,9);
   return line.map((x,i)=>x===null||signal[i]===null?null:x-signal[i]);
  }
  case 'cmf':{
   const moneyFlow=rows.map(x=>x.h===x.l?0:((2*x.c-x.h-x.l)/(x.h-x.l))*x.v);
   const flowSum=rolling(moneyFlow,20,a=>a.reduce((sum,x)=>sum+x,0));
   const volumeSum=rolling(volume,20,a=>a.reduce((sum,x)=>sum+x,0));
   return flowSum.map((x,i)=>x===null||!volumeSum[i]?null:x/volumeSum[i]);
  }
  case 'adx':{
   const plus=Array(n).fill(0),minus=Array(n).fill(0);
   for(let i=1;i<n;i++){
    const up=high[i]-high[i-1],down=low[i-1]-low[i];
    if(up>down&&up>0)plus[i]=up;
    if(down>up&&down>0)minus[i]=down;
   }
   const tr14=wilderSum(trueRange,14),plus14=wilderSum(plus,14),minus14=wilderSum(minus,14);
   const dx=Array(n).fill(null);
   for(let i=14;i<n;i++){
    if(!tr14[i])continue;
    const pdi=100*plus14[i]/tr14[i],mdi=100*minus14[i]/tr14[i];
    dx[i]=100*Math.abs(pdi-mdi)/(pdi+mdi||1);
   }
   let seed=0,count=0,previous=null;
   for(let i=14;i<n;i++){
    if(dx[i]===null)continue;
    if(previous===null){seed+=dx[i];count++;if(count===14){previous=seed/14;out[i]=previous;}}
    else{previous=(previous*13+dx[i])/14;out[i]=previous;}
   }
   return out;
  }
  case 'vwap':{
   const interval=n>1?rows[1].t-rows[0].t:0;
   if(interval>=86400000){
    const pv=typical.map((x,i)=>x*volume[i]);
    const pvSum=rolling(pv,20,a=>a.reduce((sum,x)=>sum+x,0));
    const volumeSum=rolling(volume,20,a=>a.reduce((sum,x)=>sum+x,0));
    return close.map((x,i)=>pvSum[i]===null||!volumeSum[i]?null:(x/(pvSum[i]/volumeSum[i])-1)*100);
   }
   let pv=0,vol=0,session=null;
   for(let i=0;i<n;i++){
    const day=new Date(rows[i].t).toISOString().slice(0,10);
    if(day!==session){session=day;pv=0;vol=0;}
    pv+=typical[i]*volume[i];vol+=volume[i];
    out[i]=vol? (close[i]/(pv/vol)-1)*100:null;
   }
   return out;
  }
  case 'atr':{
   if(n<=14)return out;
   let previous=0;
   for(let i=1;i<=14;i++)previous+=trueRange[i];
   previous/=14;out[14]=previous;
   for(let i=15;i<n;i++){previous=(previous*13+trueRange[i])/14;out[i]=previous;}
   return out;
  }
  case 'relvol':{
   for(let i=20;i<n;i++){
    const average=volume.slice(i-20,i).reduce((sum,x)=>sum+x,0)/20;
    out[i]=average>0?volume[i]/average:null;
   }
   return out;
  }
  default:return out;
 }
}
export function pivots(values,type){
 const result=[];
 for(let i=3;i<values.length-3;i++){
  const value=values[i];if(!Number.isFinite(value))continue;
  let valid=true;
  for(let j=i-3;j<=i+3;j++){
   if(j===i||!Number.isFinite(values[j]))continue;
   if(type==='low'?values[j]<=value:values[j]>=value){valid=false;break;}
  }
  if(valid)result.push({i,v:value});
 }
 return result;
}
export function divergences(price,oscillator){
 if(price.length!==oscillator.length)return [];
 const lows=pivots(price,'low'),highs=pivots(price,'high');
 const oscLows=pivots(oscillator,'low'),oscHighs=pivots(oscillator,'high'),result=[];
 const nearest=(list,index)=>{
  let left=0,right=list.length;
  while(left<right){const middle=(left+right)>>1;if(list[middle].i<index)left=middle+1;else right=middle;}
  let best=null,distance=4;
  for(let k=Math.max(0,left-1);k<Math.min(list.length,left+2);k++){
   const delta=Math.abs(list[k].i-index);
   if(delta<=3&&delta<distance){best=list[k];distance=delta;}
  }
  return best;
 };
 const compare=(pricePivots,oscPivots,isLow)=>{
  for(let i=1;i<pricePivots.length;i++){
   const first=pricePivots[i-1],second=pricePivots[i],gap=second.i-first.i;
   if(gap<5||gap>80)continue;
   const oscFirst=nearest(oscPivots,first.i),oscSecond=nearest(oscPivots,second.i);
   if(!oscFirst||!oscSecond||oscFirst.i>=oscSecond.i)continue;
   const regular=isLow?(second.v<first.v&&oscSecond.v>oscFirst.v):(second.v>first.v&&oscSecond.v<oscFirst.v);
   const hidden=isLow?(second.v>first.v&&oscSecond.v<oscFirst.v):(second.v<first.v&&oscSecond.v>oscFirst.v);
   if(regular||hidden)result.push({a:first,b:second,type:isLow?(regular?'Pozitif':'Gizli pozitif'):(regular?'Negatif':'Gizli negatif'),confirmed:true});
  }
 };
 compare(lows,oscLows,true);compare(highs,oscHighs,false);
 return result.sort((a,b)=>b.b.i-a.b.i);
}
export function clusterSignals(items,maxDistance=3){
 const groups=[];
 for(const item of items.slice().sort((a,b)=>b.index-a.index)){
  let group=groups.find(g=>g.tf===item.tf&&g.side===item.side&&Math.abs(g.anchorIndex-item.index)<=maxDistance);
  if(!group){group={tf:item.tf,side:item.side,anchorIndex:item.index,time:item.time,items:[]};groups.push(group);}
  if(!group.items.some(x=>x.id===item.id))group.items.push(item);
  group.time=Math.max(group.time,item.time);
 }
 return groups.sort((a,b)=>b.time-a.time);
}
export function normalizeKlines(raw,now=Date.now()){
 if(!Array.isArray(raw))throw new Error('Binance mum yanıtı dizi değil');
 const parsed=raw.map(x=>({t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5]),closeTime:Number(x[6]),quoteVolume:Number(x[7]),trades:Number(x[8]),tb:Number(x[9]),takerBuyQuoteVolume:Number(x[10])}));
 if(parsed.some(x=>![x.t,x.o,x.h,x.l,x.c,x.v,x.closeTime,x.quoteVolume,x.tb,x.takerBuyQuoteVolume].every(Number.isFinite)))throw new Error('Mum verisinde geçersiz sayısal alan var');
 parsed.sort((a,b)=>a.t-b.t);
 const unique=parsed.filter((x,i)=>i===0||x.t!==parsed[i-1].t);
 for(const x of unique){
  if(x.t<=0||x.closeTime<x.t||x.o<=0||x.c<=0||x.l<=0||x.h<x.l||x.h<Math.max(x.o,x.c)||x.l>Math.min(x.o,x.c)||x.v<0||x.quoteVolume<0||x.tb<0||x.tb>x.v*1.000001||x.takerBuyQuoteVolume<0||x.takerBuyQuoteVolume>x.quoteVolume*1.000001)throw new Error('OHLCV tutarsızlığı · '+new Date(x.t).toISOString());
 }
 const closed=unique.filter(x=>x.closeTime<now);
 if(closed.length<100)throw new Error('Yeterli kapanmış mum yok · '+closed.length+'/100');
 return closed;
}
