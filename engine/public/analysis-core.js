const defs=[
['rsi','RSI','Momentum','Yükseliş ve düşüş momentumunu ölçer. 70 üzeri yüksek, 30 altı düşük momentum bölgesidir.'],
['stochrsi','Stoch RSI','Momentum','RSI momentumunu daha hassas ölçer. 80 üzeri yüksek, 20 altı düşük bölgedir.'],
['mfi','MFI','Para Akışı','Hacim destekli para akışını ölçer. 80 üzeri alım, 20 altı satış baskısının aşırılaşabileceğini gösterir.'],
['cci','CCI','Momentum','Fiyatın ortalamadan sapmasını ölçer. +100 üzeri güçlü pozitif, -100 altı negatif momentumdur.'],
['obv','OBV','Hacim','Yükseliş ve düşüş mumlarının hacmini biriktirerek hacim yönünü gösterir.'],
['macd','MACD Histogram','Trend','MACD ve sinyal çizgisi arasındaki farkla momentum değişimini izler.'],
['cmf','Chaikin Money Flow','Para Akışı','Hacim ve mum kapanış konumundan alım/satım akışını ölçer. Sıfır üstü pozitif, altı negatiftir.'],
['adx','ADX','Trend','Trendin gücünü ölçer; 25 üzeri belirgin trend, 20 altı zayıf trend kabul edilir.'],
['vwap','VWAP / VWMA Sapması','Fiyat Referansı','15m–4h grafiklerinde UTC günlük seans VWAP; 1d–1w grafiklerinde 20 dönemlik VWMA yaklaşımı kullanılır.'],
['atr','ATR','Volatilite','Piyasanın ortalama gerçek hareket aralığını ölçer; yön sinyali değildir.']
];
const directionalIds=new Set(['rsi','stochrsi','mfi','cci','obv','macd','cmf','vwap']);
const directionalDefs=defs.filter(x=>directionalIds.has(x[0]));
const ema=(a,p)=>{const out=Array(a.length).fill(null),k=2/(p+1);let seed=[],prev=null;for(let i=0;i<a.length;i++){const value=a[i];if(!Number.isFinite(value))continue;if(prev===null){seed.push(value);if(seed.length===p){prev=seed.reduce((x,y)=>x+y,0)/p;out[i]=prev;}}else{prev=value*k+prev*(1-k);out[i]=prev;}}return out;};
const sma=(a,p)=>a.map((_,i)=>i+1<p?null:a.slice(i-p+1,i+1).every(v=>v!=null)?a.slice(i-p+1,i+1).reduce((x,y)=>x+y,0)/p:null);
const calc=(id,r)=>{const c=r.map(x=>x.c),h=r.map(x=>x.h),l=r.map(x=>x.l),v=r.map(x=>x.v),n=c.length,chg=c.map((x,i)=>i?x-c[i-1]:null),tr=r.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-r[i-1].c),Math.abs(x.l-r[i-1].c)):x.h-x.l),pos=chg.map(x=>x==null?null:Math.max(x,0)),neg=chg.map(x=>x==null?null:Math.max(-x,0));
const roll=(a,p,fn)=>a.map((_,i)=>i+1<p?null:fn(a.slice(i-p+1,i+1)));
const ratio=(a,b)=>a.map((x,i)=>x==null||b[i]==null||b[i]===0?null:x/b[i]);
const diff=(a,b)=>a.map((x,i)=>x==null||b[i]==null?null:x-b[i]);
const rsi=(a,p=14)=>{let out=Array(a.length).fill(null),g=0,d=0;for(let i=1;i<a.length;i++){const x=a[i]-a[i-1];if(i<=p){g+=Math.max(x,0);d+=Math.max(-x,0);if(i===p)out[i]=g===0&&d===0?50:d===0?100:100-100/(1+g/d);}else{g=(g*(p-1)+Math.max(x,0))/p;d=(d*(p-1)+Math.max(-x,0))/p;out[i]=g===0&&d===0?50:d===0?100:100-100/(1+g/d);}}return out;};
const rsi14=rsi(c),typ=c.map((x,i)=>(h[i]+l[i]+x)/3),tpS=sma(typ,20),mad=typ.map((x,i)=>i<19?null:typ.slice(i-19,i+1).reduce((s,y)=>s+Math.abs(y-tpS[i]),0)/20);
let out;
switch(id){
case'rsi':out=rsi14;break;
case'stochrsi':{const lo=roll(rsi14,14,a=>Math.min(...a)),hi=roll(rsi14,14,a=>Math.max(...a));out=ratio(diff(rsi14,lo),diff(hi,lo)).map(x=>x==null?null:x*100);break;}
case'mfi':{out=Array(n).fill(null);for(let i=14;i<n;i++){let positive=0,negative=0;for(let j=i-13;j<=i;j++){const flow=typ[j]*v[j];if(typ[j]>typ[j-1])positive+=flow;else if(typ[j]<typ[j-1])negative+=flow;}out[i]=positive===0&&negative===0?50:negative===0?100:100-100/(1+positive/negative);}break;}
case'cci':out=typ.map((x,i)=>tpS[i]==null||mad[i]===0?null:(x-tpS[i])/(.015*mad[i]));break;
case'obv':{out=Array(n).fill(null);out[0]=v[0];for(let i=1;i<n;i++)out[i]=out[i-1]+(c[i]>c[i-1]?v[i]:c[i]<c[i-1]?-v[i]:0);break;}
case'williams':{const hh=roll(h,14,a=>Math.max(...a)),ll=roll(l,14,a=>Math.min(...a));out=c.map((x,i)=>hh[i]==null||hh[i]===ll[i]?null:-100*(hh[i]-x)/(hh[i]-ll[i]));break;}
case'macd':{const m=diff(ema(c,12),ema(c,26));out=diff(m,ema(m,9));break;}
case'cmf':{const mfv=r.map((x,i)=>x.h===x.l?0:((2*x.c-x.h-x.l)/(x.h-x.l))*x.v);const a=roll(mfv,20,x=>x.reduce((s,y)=>s+y,0)),b=roll(v,20,x=>x.reduce((s,y)=>s+y,0));out=ratio(a,b);break;}
case'adl':{out=Array(n).fill(null);let s=0;for(let i=0;i<n;i++){s+=(h[i]===l[i]?0:((2*c[i]-h[i]-l[i])/(h[i]-l[i]))*v[i]);out[i]=s;}break;}
case'force':out=ema(chg.map((x,i)=>x==null?null:x*v[i]),13);break;
case'roc':out=c.map((x,i)=>i<12?null:c[i-12]===0?null:(x/c[i-12]-1)*100);break;
case'momentum':out=c.map((x,i)=>i<10?null:x-c[i-10]);break;
case'cmo':{const up=roll(pos,14,a=>a.reduce((s,x)=>s+(x||0),0)),dn=roll(neg,14,a=>a.reduce((s,x)=>s+(x||0),0));out=up.map((x,i)=>x==null?null:(x+dn[i]===0?0:100*(x-dn[i])/(x+dn[i])));break;}
case'tsi':{const a=ema(ema(chg,25),13),b=ema(ema(chg.map(x=>x==null?null:Math.abs(x)),25),13);out=ratio(a,b).map(x=>x==null?null:x*100);break;}
case'trix':{const e=ema(ema(ema(c,15),15),15);out=e.map((x,i)=>i&&e[i-1]?100*(x/e[i-1]-1):null);break;}
case'ppo':{const a=ema(c,12),b=ema(c,26);out=a.map((x,i)=>b[i]?100*(x-b[i])/b[i]:null);break;}
case'ultimate':{const bp=r.map((x,i)=>x.c-Math.min(x.l,i?r[i-1].c:x.l)),rr=r.map((x,i)=>x.h-Math.max(x.l,i?r[i-1].c:x.l));const av=p=>ratio(roll(bp,p,a=>a.reduce((s,x)=>s+x,0)),roll(rr,p,a=>a.reduce((s,x)=>s+x,0)));const a=av(7),b=av(14),d=av(28);out=a.map((x,i)=>x==null||b[i]==null||d[i]==null?null:100*(4*x+2*b[i]+d[i])/7);break;}
case'aroon':{const up=roll(h,25,a=>a.lastIndexOf(Math.max(...a))),dn=roll(l,25,a=>a.lastIndexOf(Math.min(...a)));out=up.map((x,i)=>x==null?null:100*(x-dn[i])/24);break;}
case'adx':{const plus=Array(n).fill(0),minus=Array(n).fill(0),trueRange=tr.slice();for(let i=1;i<n;i++){const up=h[i]-h[i-1],down=l[i-1]-l[i];if(up>down&&up>0)plus[i]=up;if(down>up&&down>0)minus[i]=down;}const wilder=(a)=>{const out=Array(n).fill(null);if(n<=14)return out;let sum=0;for(let i=1;i<=14;i++)sum+=a[i];out[14]=sum;for(let i=15;i<n;i++)out[i]=out[i-1]-out[i-1]/14+a[i];return out;};const tr14=wilder(trueRange),p14=wilder(plus),m14=wilder(minus),dx=Array(n).fill(null);for(let i=14;i<n;i++){if(!tr14[i])continue;const pdi=100*p14[i]/tr14[i],mdi=100*m14[i]/tr14[i];dx[i]=100*Math.abs(pdi-mdi)/(pdi+mdi||1);}out=Array(n).fill(null);let seed=0,count=0,prev=null;for(let i=14;i<n;i++){if(dx[i]==null)continue;if(prev===null){seed+=dx[i];count++;if(count===14){prev=seed/14;out[i]=prev;}}else{prev=(prev*13+dx[i])/14;out[i]=prev;}}break;}
case'vortex':{const vp=r.map((x,i)=>i?Math.abs(x.h-r[i-1].l):0),vm=r.map((x,i)=>i?Math.abs(x.l-r[i-1].h):0),a=roll(vp,14,x=>x.reduce((s,y)=>s+y,0)),b=roll(vm,14,x=>x.reduce((s,y)=>s+y,0)),t=roll(tr,14,x=>x.reduce((s,y)=>s+y,0));out=a.map((x,i)=>x==null?null:(x-b[i])/(t[i]||1));break;}
case'bbp':case'bandwidth':{const mid=sma(c,20),sd=roll(c,20,a=>Math.sqrt(a.reduce((s,x)=>s+(x-a.reduce((p,q)=>p+q,0)/a.length)**2,0)/20));out=c.map((x,i)=>mid[i]==null?null:id==='bbp'?(x-(mid[i]-2*sd[i]))/(4*sd[i]||1):4*sd[i]/mid[i]*100);break;}
case'atr':{out=Array(n).fill(null);if(n>14){let prev=0;for(let i=1;i<=14;i++)prev+=tr[i];prev/=14;out[14]=prev;for(let i=15;i<n;i++){prev=(prev*13+tr[i])/14;out[i]=prev;}}break;}
case'chop':{const sum=roll(tr,14,a=>a.reduce((s,x)=>s+x,0)),hh=roll(h,14,a=>Math.max(...a)),ll=roll(l,14,a=>Math.min(...a));out=sum.map((x,i)=>x==null?null:100*Math.log10(x/(hh[i]-ll[i]||1))/Math.log10(14));break;}
case'eom':out=sma(r.map((x,i)=>i?(x.h+x.l-r[i-1].h-r[i-1].l)/2*(x.h===x.l?0:x.v/(x.h-x.l)):null),14);break;
case'volosc':{const a=sma(v,5),b=sma(v,20);out=a.map((x,i)=>x==null||!b[i]?null:100*(x-b[i])/b[i]);break;}
case'pvt':{out=Array(n).fill(null);out[0]=0;for(let i=1;i<n;i++)out[i]=out[i-1]+(c[i-1]?v[i]*(c[i]-c[i-1])/c[i-1]:0);break;}
case'nvi':case'pvi':{out=Array(n).fill(null);out[0]=1000;for(let i=1;i<n;i++){const cond=id==='nvi'?v[i]<v[i-1]:v[i]>v[i-1];out[i]=out[i-1]*(cond&&c[i-1]?1+(c[i]-c[i-1])/c[i-1]:1);}break;}
case'vwap':{out=Array(n).fill(null);const interval=n>1?r[1].t-r[0].t:0;if(interval>=86400000){const pv=typ.map((x,i)=>x*v[i]),pvSum=roll(pv,20,a=>a.reduce((s,x)=>s+x,0)),volSum=roll(v,20,a=>a.reduce((s,x)=>s+x,0));out=c.map((x,i)=>pvSum[i]==null||!volSum[i]?null:(x/(pvSum[i]/volSum[i])-1)*100);}else{let pv=0,vol=0,day=null;for(let i=0;i<n;i++){const d=new Date(r[i].t).toISOString().slice(0,10);if(d!==day){day=d;pv=0;vol=0;}pv+=typ[i]*v[i];vol+=v[i];out[i]=vol?(c[i]/(pv/vol)-1)*100:null;}}break;}
case'relvol':{out=Array(n).fill(null);for(let i=20;i<n;i++){const avg=v.slice(i-20,i).reduce((s,x)=>s+x,0)/20;out[i]=avg>0?v[i]/avg:null;}break;}
case'bop':out=r.map(x=>x.h===x.l?0:(x.c-x.o)/(x.h-x.l));break;
case'cvd':{out=Array(n).fill(null);let s=0;for(let i=0;i<n;i++){s+=(2*r[i].tb-r[i].v);out[i]=s;}break;}
default:out=rsi14;
}
return out;};
function pivots(a,type){const out=[];for(let i=3;i<a.length-3;i++){const value=a[i];if(!Number.isFinite(value))continue;let ok=true;for(let j=i-3;j<=i+3;j++){if(j===i||!Number.isFinite(a[j]))continue;if(type==='low'?a[j]<=value:a[j]>=value){ok=false;break;}}if(ok)out.push({i,v:value});}return out;}
function divergences(price,osc){if(price.length!==osc.length)return [];
 const pl=pivots(price,'low'),ph=pivots(price,'high'),ol=pivots(osc,'low'),oh=pivots(osc,'high'),out=[];
 const nearest=(arr,index)=>{let lo=0,hi=arr.length;while(lo<hi){const mid=(lo+hi)>>1;if(arr[mid].i<index)lo=mid+1;else hi=mid;}let best=null,dist=4;for(let k=Math.max(0,lo-1);k<Math.min(arr.length,lo+2);k++){const d=Math.abs(arr[k].i-index);if(d<=3&&d<dist){best=arr[k];dist=d;}}return best;};
 function pair(pp,oo,low){for(let k=1;k<pp.length;k++){const a=pp[k-1],b=pp[k];if(b.i-a.i<5||b.i-a.i>80)continue;const x=nearest(oo,a.i),y=nearest(oo,b.i);if(!x||!y||x.i>=y.i)continue;const regular=low?(b.v<a.v&&y.v>x.v):(b.v>a.v&&y.v<x.v),hidden=low?(b.v>a.v&&y.v<x.v):(b.v<a.v&&y.v>x.v);if(regular||hidden)out.push({a,b,type:low?(regular?'Pozitif':'Gizli pozitif'):(regular?'Negatif':'Gizli negatif'),confirmed:true});}}
 pair(pl,ol,true);pair(ph,oh,false);return out.sort((a,b)=>b.b.i-a.b.i);
}
export {defs,directionalIds,directionalDefs,ema,sma,calc,pivots,divergences};
export function normalizeKlines(raw,now=Date.now()){
 if(!Array.isArray(raw))throw new Error('Binance mum yanıtı dizi değil');
 const parsed=raw.map((x,i)=>({t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5]),closeTime:Number(x[6]),quoteVolume:Number(x[7]),trades:Number(x[8]),tb:Number(x[9]),takerBuyQuoteVolume:Number(x[10])}));
 if(parsed.some(x=>![x.t,x.o,x.h,x.l,x.c,x.v,x.closeTime,x.quoteVolume,x.tb,x.takerBuyQuoteVolume].every(Number.isFinite)))throw new Error('Mum verisinde geçersiz sayısal alan var');
 parsed.sort((a,b)=>a.t-b.t);
 const unique=parsed.filter((x,i)=>i===0||x.t!==parsed[i-1].t);
 for(const x of unique){if(x.t<=0||x.closeTime<x.t||x.o<=0||x.c<=0||x.l<=0||x.h<x.l||x.h<Math.max(x.o,x.c)||x.l>Math.min(x.o,x.c)||x.v<0||x.quoteVolume<0||x.tb<0||x.tb>x.v*1.000001||x.takerBuyQuoteVolume>x.quoteVolume*1.000001)throw new Error('OHLCV tutarsızlığı · '+new Date(x.t).toISOString());}
 const closed=unique.filter(x=>x.closeTime<now);
 if(closed.length<100)throw new Error('Yeterli kapanmış mum yok · '+closed.length+'/100');
 return closed;
}