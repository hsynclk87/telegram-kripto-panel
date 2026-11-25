(()=>{'use strict';
const $=id=>document.getElementById(id);
if(!$('oscLabBtn'))return;
const defs=[
['rsi','RSI','Momentum','Fiyatın son dönemlerdeki yükseliş ve düşüş gücünü ölçer. 70 üzeri güçlü/şişmiş, 30 altı zayıf/aşırı satım bölgesidir. Uyumsuzlukta fiyat dip/tepe yaparken RSI gücünün bunu doğrulayıp doğrulamadığı izlenir.'],
['stochrsi','Stoch RSI','Momentum','RSI değerinin kendi aralığındaki konumunu ölçer; RSI’dan daha hızlı ve hassastır. 80 üzeri yüksek, 20 altı düşük bölgedir. Tek başına değil fiyat yapısıyla birlikte değerlendirilmelidir.'],
['mfi','MFI','Para Akışı','Hacmi de hesaba katan para akışı osilatörüdür. 80 üzeri alım baskısının, 20 altı satış baskısının aşırılaşabileceğini gösterir. Fiyatla uyumsuzluğu akışın fiyatı doğrulamadığına işaret edebilir.'],
['cci','CCI','Momentum','Fiyatın istatistiksel ortalamasından sapmasını ölçer. +100 üzeri güçlü pozitif, -100 altı güçlü negatif momentum alanı kabul edilir. Sıfır çizgisi çevresindeki dönüşler de izlenir.'],
['obv','OBV','Hacim','Yükseliş mumlarında hacmi ekleyip düşüş mumlarında çıkararak birikimli hacim akışı üretir. Mutlak seviyesi değil eğimi ve fiyatla göreli dip/tepe yapısı önemlidir.'],
['williams','Williams %R','Momentum','Kapanışın seçilen dönem aralığındaki konumunu gösterir. -20 üzeri yüksek, -80 altı düşük bölgedir. Hızlı tepki verir; tek başına dönüş garantisi değildir.'],
['macd','MACD Histogram','Momentum','MACD çizgisi ile sinyal çizgisi arasındaki farkı gösterir. Histogramın küçülmesi momentumun zayıfladığını, büyümesi güçlendiğini anlatır. Sıfır çizgisi trend bağlamı sağlar.'],
['cmf','Chaikin Money Flow','Para Akışı','Kapanışın mum aralığındaki konumu ile hacmi birleştirir. Sıfır üzeri net alım, sıfır altı net satış baskısını gösterir. Fiyatla ayrışma akış teyidinin zayıfladığını anlatabilir.'],
['adl','A/D Line','Para Akışı','Hacmi mum içindeki kapanış konumuna göre biriktirir. Mutlak değer yerine eğim ve fiyatla uyumsuz dip/tepe yapısı değerlendirilir.'],
['force','Force Index','Para Akışı','Fiyat değişimini hacimle çarpar. Pozitif değerler alıcı kuvvetini, negatif değerler satıcı kuvvetini temsil eder. Sıfır çevresi ve eğim değişimleri önemlidir.'],
['roc','ROC','Momentum','Fiyatın belirli dönem içindeki yüzde değişimini ölçer. Sıfır üzeri pozitif, sıfır altı negatif momentumdur. Fiyat yeni tepe/dip yaparken ROC’un zayıflaması uyumsuzluk oluşturabilir.'],
['momentum','Momentum','Momentum','Mevcut fiyat ile geçmiş fiyat arasındaki farktır. Sıfır üzeri pozitif, sıfır altı negatif momentum gösterir. Kendi geçmişi ve fiyat salınımlarıyla kıyaslanır.'],
['cmo','CMO','Momentum','Yukarı ve aşağı kapanış değişimlerini karşılaştırır; -100 ile +100 arasında salınır. Pozitif değerler yukarı, negatif değerler aşağı momentum üstünlüğünü gösterir.'],
['tsi','TSI','Momentum','Çift yumuşatılmış fiyat momentumunu ölçer. Sıfır çizgisi yön filtresi, sinyal çizgisi kesişimleri momentum değişimi için kullanılır. Uyumsuzluklar dönüşün erken uyarısı olabilir.'],
['trix','TRIX','Momentum','Üç kez üssel yumuşatılmış fiyatın değişim oranıdır. Sıfır çizgisi trend yönünü, eğim momentumun hızını gösterir. Gürültüyü azaltır ancak gecikmelidir.'],
['ppo','PPO','Momentum','İki hareketli ortalama arasındaki farkı yüzde olarak ölçer. Farklı fiyat seviyelerindeki varlıkları kıyaslamayı kolaylaştırır. Sıfır çizgisi trend bağlamı sağlar.'],
['ultimate','Ultimate Oscillator','Momentum','Kısa, orta ve uzun periyotlu alım baskısını birleştirir. 70 üzeri yüksek, 30 altı düşük bölge olarak izlenir. Tek periyotlu osilatörlere göre çoklu pencere kullanır.'],
['aroon','Aroon Oscillator','Trend','Son dönemdeki en yüksek ve en düşük fiyatın kaç bar önce oluştuğunu ölçer. +100’e yakın değer yukarı, -100’e yakın değer aşağı trend gücünü gösterir.'],
['adx','ADX','Trend','Trendin yönünü değil gücünü ölçer. 20 altı zayıf/yatay, 25 üzeri belirgin trend olarak sık kullanılır. +DI ve -DI yön konusunda yardımcıdır.'],
['vortex','Vortex','Trend','VI+ ve VI- çizgileri pozitif/negatif trend yönünü karşılaştırır. Kesişimler yön değişimi uyarısı verebilir; yatay piyasada sık sinyal üretebilir.'],
['bbp','Bollinger %B','Volatilite','Fiyatın Bollinger bantları içindeki konumunu gösterir. 1 üzeri üst bandın, 0 altı alt bandın dışını ifade eder. Bant teması tek başına dönüş sinyali değildir.'],
['bandwidth','Bollinger Bandwidth','Volatilite','Bollinger bantlarının genişliğini ölçer. Daralma düşük volatiliteyi, genişleme artan volatiliteyi gösterir. Yön belirtmez; fiyat yönüyle birlikte okunur.'],
['atr','ATR','Volatilite','Gerçek mum aralığının ortalamasıdır. Volatiliteyi ölçer, yön göstermez. Fiyatla uyumsuzluk yerine risk/stop mesafesi ve volatilite rejimi için kullanılır.'],
['chop','Choppiness Index','Volatilite','Piyasanın trend mi yatay mı hareket ettiğini ölçer. Yüksek değer sıkışık/yatay, düşük değer daha yönlü hareket anlamına gelir.'],
['eom','Ease of Movement','Hacim','Fiyatın ne kadar az hacimle hareket ettiğini ölçmeye çalışır. Pozitif değer kolay yukarı, negatif değer kolay aşağı hareketi ifade eder.'],
['volosc','Volume Oscillator','Hacim','Kısa ve uzun dönem hacim ortalamalarının yüzde farkıdır. Pozitif değer kısa vadeli hacmin arttığını, negatif değer azaldığını gösterir.'],
['pvt','Price Volume Trend','Hacim','Fiyatın yüzde değişimini hacimle ağırlıklandırarak biriktirir. Eğimi fiyat hareketinin hacimle desteklenip desteklenmediğini incelemek için kullanılır.'],
['nvi','Negative Volume Index','Hacim','Önceki bara göre hacim azaldığında fiyat değişimini endekse işler. Daha sakin hacimli dönemlerdeki fiyat davranışını izler; tek başına al/sat sinyali değildir.'],
['pvi','Positive Volume Index','Hacim','Önceki bara göre hacim arttığında fiyat değişimini endekse işler. Hacim genişlemesindeki fiyat davranışını takip eder.'],
['vwap','VWAP Sapması','Hacim','Hacim ağırlıklı ortalama fiyata göre fiyatın yüzde sapmasını gösterir. Pozitif değer fiyatın VWAP üzerinde, negatif değer altında olduğunu belirtir. Günlük seans VWAP’ı olarak hesaplanır.'],
['relvol','Göreceli Hacim','Hacim','Mevcut mum hacmini geçmiş mumların ortalamasıyla karşılaştırır. 1 üzeri ortalamanın, 2 üzeri iki kat hacmin oluştuğunu gösterir.'],
['bop','Balance of Power','Hacim','Mum içindeki alıcı ve satıcı gücünü high-low aralığına göre normalize eder. Pozitif değer alıcı, negatif değer satıcı üstünlüğünü gösterir.'],
['cvd','Taker CVD','Piyasa Akışı','Binance mum verisindeki taker alım hacmi ile toplam hacim farkını biriktirir. Spot akış için yaklaşık bir vekildir; gerçek işlem bazlı CVD değildir.'],
];
const state={rows:[],selected:'rsi',tf:'15m',symbol:'BTCUSDT',series:[],divs:[]};
const ema=(a,p)=>{let out=Array(a.length).fill(null),k=2/(p+1),v=null;for(let i=0;i<a.length;i++){if(a[i]==null)continue;v=v==null?a[i]:a[i]*k+v*(1-k);out[i]=v;}return out;};
const sma=(a,p)=>a.map((_,i)=>i+1<p?null:a.slice(i-p+1,i+1).every(v=>v!=null)?a.slice(i-p+1,i+1).reduce((x,y)=>x+y,0)/p:null);
const calc=(id,r)=>{const c=r.map(x=>x.c),h=r.map(x=>x.h),l=r.map(x=>x.l),v=r.map(x=>x.v),n=c.length,chg=c.map((x,i)=>i?x-c[i-1]:null),tr=r.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-r[i-1].c),Math.abs(x.l-r[i-1].c)):x.h-x.l),pos=chg.map(x=>x==null?null:Math.max(x,0)),neg=chg.map(x=>x==null?null:Math.max(-x,0));
const roll=(a,p,fn)=>a.map((_,i)=>i+1<p?null:fn(a.slice(i-p+1,i+1)));
const ratio=(a,b)=>a.map((x,i)=>x==null||b[i]==null||b[i]===0?null:x/b[i]);
const diff=(a,b)=>a.map((x,i)=>x==null||b[i]==null?null:x-b[i]);
const rsi=(a,p=14)=>{let out=Array(a.length).fill(null),g=0,d=0;for(let i=1;i<a.length;i++){const x=a[i]-a[i-1];if(i<=p){g+=Math.max(x,0);d+=Math.max(-x,0);if(i===p)out[i]=d===0?100:100-100/(1+g/d);}else{g=(g*(p-1)+Math.max(x,0))/p;d=(d*(p-1)+Math.max(-x,0))/p;out[i]=d===0?100:100-100/(1+g/d);}}return out;};
const rsi14=rsi(c),typ=c.map((x,i)=>(h[i]+l[i]+x)/3),tpS=sma(typ,20),mad=typ.map((x,i)=>i<19?null:typ.slice(i-19,i+1).reduce((s,y)=>s+Math.abs(y-tpS[i]),0)/20);
let out;
switch(id){
case'rsi':out=rsi14;break;
case'stochrsi':{const lo=roll(rsi14,14,a=>Math.min(...a)),hi=roll(rsi14,14,a=>Math.max(...a));out=ratio(diff(rsi14,lo),diff(hi,lo)).map(x=>x==null?null:x*100);break;}
case'mfi':{const mf=typ.map((x,i)=>i?x*v[i]:0),p=mf.map((x,i)=>i&&typ[i]>typ[i-1]?x:0),m=mf.map((x,i)=>i&&typ[i]<typ[i-1]?x:0),ps=roll(p,14,a=>a.reduce((s,x)=>s+x,0)),ms=roll(m,14,a=>a.reduce((s,x)=>s+x,0));out=ps.map((x,i)=>x==null?null:ms[i]===0?100:100-100/(1+x/ms[i]));break;}
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
case'adx':{const plus=r.map((x,i)=>i?Math.max(x.h-r[i-1].h,0):0),minus=r.map((x,i)=>i?Math.max(r[i-1].l-x.l,0):0),trm=roll(tr,14,a=>a.reduce((s,x)=>s+x,0)),p=roll(plus,14,a=>a.reduce((s,x)=>s+x,0)),m=roll(minus,14,a=>a.reduce((s,x)=>s+x,0));const dx=p.map((x,i)=>x==null||trm[i]===0?null:100*Math.abs(x-m[i])/(x+m[i]||1));out=sma(dx,14);break;}
case'vortex':{const vp=r.map((x,i)=>i?Math.abs(x.h-r[i-1].l):0),vm=r.map((x,i)=>i?Math.abs(x.l-r[i-1].h):0),a=roll(vp,14,x=>x.reduce((s,y)=>s+y,0)),b=roll(vm,14,x=>x.reduce((s,y)=>s+y,0)),t=roll(tr,14,x=>x.reduce((s,y)=>s+y,0));out=a.map((x,i)=>x==null?null:(x-b[i])/(t[i]||1));break;}
case'bbp':case'bandwidth':{const mid=sma(c,20),sd=roll(c,20,a=>Math.sqrt(a.reduce((s,x)=>s+(x-a.reduce((p,q)=>p+q,0)/a.length)**2,0)/20));out=c.map((x,i)=>mid[i]==null?null:id==='bbp'?(x-(mid[i]-2*sd[i]))/(4*sd[i]||1):4*sd[i]/mid[i]*100);break;}
case'atr':out=sma(tr,14);break;
case'chop':{const sum=roll(tr,14,a=>a.reduce((s,x)=>s+x,0)),hh=roll(h,14,a=>Math.max(...a)),ll=roll(l,14,a=>Math.min(...a));out=sum.map((x,i)=>x==null?null:100*Math.log10(x/(hh[i]-ll[i]||1))/Math.log10(14));break;}
case'eom':out=sma(r.map((x,i)=>i?(x.h+x.l-r[i-1].h-r[i-1].l)/2*(x.h===x.l?0:x.v/(x.h-x.l)):null),14);break;
case'volosc':{const a=sma(v,5),b=sma(v,20);out=a.map((x,i)=>x==null||!b[i]?null:100*(x-b[i])/b[i]);break;}
case'pvt':{out=Array(n).fill(null);out[0]=0;for(let i=1;i<n;i++)out[i]=out[i-1]+(c[i-1]?v[i]*(c[i]-c[i-1])/c[i-1]:0);break;}
case'nvi':case'pvi':{out=Array(n).fill(null);out[0]=1000;for(let i=1;i<n;i++){const cond=id==='nvi'?v[i]<v[i-1]:v[i]>v[i-1];out[i]=out[i-1]*(cond&&c[i-1]?1+(c[i]-c[i-1])/c[i-1]:1);}break;}
case'vwap':{out=Array(n).fill(null);let pv=0,vol=0,day=null;for(let i=0;i<n;i++){const d=new Date(r[i].t).toISOString().slice(0,10);if(d!==day){day=d;pv=0;vol=0;}pv+=typ[i]*v[i];vol+=v[i];out[i]=vol?(c[i]/(pv/vol)-1)*100:null;}break;}
case'relvol':{const a=sma(v,20);out=v.map((x,i)=>a[i]?x/a[i]:null);break;}
case'bop':out=r.map(x=>x.h===x.l?0:(x.c-x.o)/(x.h-x.l));break;
case'cvd':{out=Array(n).fill(null);let s=0;for(let i=0;i<n;i++){s+=(2*r[i].tb-r[i].v);out[i]=s;}break;}
default:out=rsi14;
}
return out;};
function pivots(a,type){const out=[];for(let i=3;i<a.length-3;i++){if(a[i]==null)continue;let ok=true;for(let j=i-3;j<=i+3;j++){if(j===i||a[j]==null)continue;if(type==='low'?a[j]<a[i]:a[j]>a[i]){ok=false;break;}}if(ok)out.push({i,v:a[i]});}return out;}
function divergences(price,osc){const pl=pivots(price,'low'),ph=pivots(price,'high'),ol=pivots(osc,'low'),oh=pivots(osc,'high'),out=[];function pair(pp,oo,low){for(let k=1;k<pp.length;k++){const a=pp[k-1],b=pp[k];if(b.i-a.i<5||b.i-a.i>80)continue;const x=oo.filter(z=>Math.abs(z.i-a.i)<=3).sort((m,n)=>Math.abs(m.i-a.i)-Math.abs(n.i-a.i))[0],y=oo.filter(z=>Math.abs(z.i-b.i)<=3).sort((m,n)=>Math.abs(m.i-b.i)-Math.abs(n.i-b.i))[0];if(!x||!y||x.i===y.i)continue;const regular=low?(b.v<a.v&&y.v>x.v):(b.v>a.v&&y.v<x.v),hidden=low?(b.v>a.v&&y.v<x.v):(b.v<a.v&&y.v>x.v);if(regular||hidden)out.push({a,b,type:low?(regular?'Pozitif':'Gizli pozitif'):(regular?'Negatif':'Gizli negatif'),confirmed:true});}}
pair(pl,pivots(osc,'low'),true);pair(ph,pivots(osc,'high'),false);return out.sort((a,b)=>b.b.i-a.b.i);}
function draw(){const canvas=$('oscCanvas'),ctx=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio||1;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const offset=state.rows.length-Math.min(120,state.rows.length),rows=state.rows.slice(-120),vals=state.series.slice(-120),valid=vals.filter(x=>x!=null&&Number.isFinite(x));if(!rows.length||!valid.length){ctx.fillStyle='#8da3ba';ctx.fillText('Gösterge verisi bekleniyor',20,30);return;}const pad={l:12,r:12,t:18,b:22},pw=w-pad.l-pad.r,ph=(h-pad.t-pad.b)*.43,oh=(h-pad.t-pad.b)*.39,top=pad.t,bottom=top+ph+30;const pmin=Math.min(...rows.map(x=>x.l)),pmax=Math.max(...rows.map(x=>x.h)),vmin=Math.min(...valid),vmax=Math.max(...valid),px=i=>pad.l+i/(rows.length-1)*pw,py=v=>top+(pmax-v)/(pmax-pmin||1)*ph,oy=v=>bottom+(vmax-v)/(vmax-vmin||1)*oh;ctx.strokeStyle='#203447';ctx.lineWidth=1;for(let k=0;k<4;k++){const y=top+k*ph/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();}const cw=Math.max(2,pw/rows.length*.62);rows.forEach((x,i)=>{const xx=px(i),up=x.c>=x.o,col=up?'#20d99b':'#ff5268';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,py(x.h));ctx.lineTo(xx,py(x.l));ctx.stroke();const y=Math.min(py(x.o),py(x.c)),bh=Math.max(1,Math.abs(py(x.o)-py(x.c)));ctx.fillRect(xx-cw/2,y,cw,bh);});ctx.fillStyle='#8da3ba';ctx.font='10px Arial';ctx.fillText('FİYAT · MUM',pad.l,11);ctx.fillText('GÖSTERGE · '+(defs.find(x=>x[0]===state.selected)?.[1]||''),pad.l,bottom-7);ctx.beginPath();vals.forEach((v,i)=>{if(v==null)return;const y=oy(v);if(i===0)ctx.moveTo(px(i),y);else ctx.lineTo(px(i),y);});ctx.strokeStyle='#42b9ff';ctx.lineWidth=2;ctx.stroke();state.divs.slice(0,8).forEach(d=>{const i=d.b.i-offset,j=d.a.i-offset;if(i<0||j<0||i>=rows.length||j>=rows.length)return;const bullish=d.type.toLowerCase().includes('pozitif'),col=bullish?'#20d99b':'#ff5268';ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(j),py(state.rows[d.a.i].c));ctx.lineTo(px(i),py(state.rows[d.b.i].c));ctx.stroke();ctx.beginPath();ctx.moveTo(px(j),oy(state.series[d.a.i]));ctx.lineTo(px(i),oy(state.series[d.b.i]));ctx.stroke();ctx.fillStyle=col;ctx.beginPath();ctx.arc(px(i),oy(state.series[d.b.i]),4,0,Math.PI*2);ctx.fill();});ctx.fillStyle='#8da3ba';ctx.fillText(new Date(rows[0].t).toLocaleString('tr-TR'),pad.l,h-4);ctx.fillText(new Date(rows[rows.length-1].t).toLocaleString('tr-TR'),w-125,h-4);}
function render(){const d=defs.find(x=>x[0]===state.selected);$('oscName').textContent=d[1];$('oscGroup').textContent=d[2];$('oscExplain').textContent=d[3];$('oscSymbol').value=state.symbol;$('oscTF').textContent=state.tf;$('oscList').innerHTML=defs.map(x=>'<button class="osc-item '+(x[0]===state.selected?'active':'')+'" data-id="'+x[0]+'"><b>'+x[1]+'</b><small>'+x[2]+'</small></button>').join('');$('oscList').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.selected=b.dataset.id;calculate();});$('oscSignals').innerHTML=state.divs.length?state.divs.slice(0,8).map(x=>'<div class="osc-signal '+(x.type.includes('pozitif')?'bull':'bear')+'"><b>'+x.type+'</b><small>'+new Date(state.rows[x.b.i].t).toLocaleString('tr-TR')+' · Onaylandı</small></div>').join(''):'<div class="osc-empty">Seçili periyotta doğrulanmış uyumsuzluk bulunamadı.</div>';draw();}
async function calculate(){const d=defs.find(x=>x[0]===state.selected);$('oscLoading').textContent='Binance geçmiş mumları yükleniyor…';try{const url='https://api.binance.com/api/v3/klines?symbol='+state.symbol+'&interval='+state.tf+'&limit=500';const res=await fetch(url);if(!res.ok)throw Error('Binance veri yanıtı: '+res.status);const raw=await res.json();state.rows=raw.map(x=>({t:x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5],tb:+x[9]}));state.series=calc(state.selected,state.rows);state.divs=divergences(state.rows.map(x=>x.c),state.series);$('oscLoading').textContent='500 mum · Binance Spot · Son güncelleme '+new Date().toLocaleTimeString('tr-TR');render();}catch(e){$('oscLoading').textContent='Veri alınamadı: '+e.message;}}
function openLab(){ $('oscLab').classList.add('show');calculate();}
$('oscLabBtn').onclick=openLab;$('oscClose').onclick=()=>$('oscLab').classList.remove('show');
$('oscSymbol').addEventListener('change',e=>{state.symbol=e.target.value;calculate();});
$('oscTime').addEventListener('change',e=>{state.tf=e.target.value;calculate();});
$('oscRefresh').onclick=calculate;
const list=$('oscList');list.innerHTML=defs.map(x=>'<button class="osc-item" data-id="'+x[0]+'"><b>'+x[1]+'</b><small>'+x[2]+'</small></button>').join('');
})();
