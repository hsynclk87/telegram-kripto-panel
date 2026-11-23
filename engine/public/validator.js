(()=>{'use strict';
const $=id=>document.getElementById(id);
const card=document.createElement('div');card.className='card';card.id='validatorCard';card.style.cssText='margin:12px 0;background:linear-gradient(145deg,rgba(20,34,57,.98),rgba(13,22,39,.98));border:1px solid rgba(91,150,220,.35);border-radius:16px;padding:13px;color:#f3f7ff;font:13px system-ui';
card.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b style="letter-spacing:1px;font-size:11px;color:#b5bdd2">BINANCE LIVE VALIDATOR</b><div id="vUpdated" style="font-size:10px;color:#a9bad4;margin-top:4px">Bağımsız veri kontrolü başlatılıyor</div></div><b id="vStatus" style="font-size:10px;padding:5px 8px;border-radius:20px;background:#33394d;color:#ffd166">BEKLENİYOR</b></div><div id="vGrid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:11px"></div><div style="display:flex;align-items:center;gap:10px;margin-top:10px"><button id="vRun" style="border:1px solid #435477;background:#18263d;color:#e5edfa;border-radius:8px;padding:8px 11px;font-weight:700">ŞİMDİ KONTROL ET</button><span id="vCount" style="font-size:10px;color:#a9bad4"></span></div><div id="vSummary" style="font-size:10px;line-height:1.5;color:#a9bad4;margin-top:9px">Mevcut analiz motoruna müdahale etmeden bağımsız Binance API ve WebSocket akışları kontrol edilir.</div>';
const anchor=document.querySelector('.market-card');if(anchor)anchor.insertAdjacentElement('afterend',card);else document.body.appendChild(card);
const fields=[['spot','SPOT FİYAT'],['futures','FUTURES FİYAT'],['spotCvd','SPOT CVD · 5 DK'],['futuresCvd','FUTURES CVD · 5 DK'],['oi','OPEN INTEREST'],['sentiment','FUNDING / LONG-SHORT'],['spotBook','SPOT ORDER BOOK'],['futuresBook','FUTURES ORDER BOOK']];
const grid=$('vGrid');fields.forEach(([id,label])=>{const el=document.createElement('div');el.style.cssText='background:rgba(8,17,31,.75);border:1px solid rgba(100,145,195,.2);border-radius:10px;padding:9px;min-width:0';el.innerHTML='<span style="display:block;color:#a9bad4;font-size:10px">'+label+'</span><b id="v_'+id+'" style="display:block;font-size:13px;margin-top:4px;overflow-wrap:anywhere">—</b><small id="vn_'+id+'" style="display:block;color:#a9bad4;font-size:10px;margin-top:3px">Veri bekleniyor</small>';grid.appendChild(el);});
let sockets=[],spotRows=[],futRows=[],timer=null,runs=0,busy=false,currentSymbol='';
const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
const status=(txt,color)=>{set('vStatus',txt);$('vStatus').style.color=color;$('vStatus').style.background='rgba(150,160,190,.13)';};
const money=x=>(x<0?'-':'')+'$'+Math.abs(x).toLocaleString('en-US',{maximumFractionDigits:2});
const compact=x=>Math.abs(x)>=1e9?(x/1e9).toFixed(2)+'B':Math.abs(x)>=1e6?(x/1e6).toFixed(2)+'M':Math.abs(x)>=1e3?(x/1e3).toFixed(2)+'K':x.toFixed(2);
function item(id,value,note,ok=true){set('v_'+id,value);set('vn_'+id,note);$('v_'+id).style.color=ok?'#35f2a1':'#ffd166';}
function symbol(){const x=$('symbol')?.textContent||'BTCUSDT';return (x.match(/[A-Z0-9]+USDT/)||['BTCUSDT'])[0];}
function trim(){const t=Date.now()-300000;spotRows=spotRows.filter(x=>x.t>=t);futRows=futRows.filter(x=>x.t>=t);}
function cvd(rows){let b=0,s=0;rows.forEach(x=>x.buy?b+=x.q:s+=x.q);return{net:b-s,n:rows.length};}
function stopStreams(){sockets.forEach(x=>{try{x.close();}catch(_){}});sockets=[];if(timer){clearInterval(timer);timer=null;}}
function startStreams(sym){stopStreams();spotRows=[];futRows=[];const specs=[['wss://stream.binance.com:443/ws/'+sym.toLowerCase()+'@trade',spotRows],['wss://fstream.binance.com/ws/'+sym.toLowerCase()+'@aggTrade',futRows]];specs.forEach(([url,arr])=>{try{const w=new WebSocket(url);sockets.push(w);w.onmessage=e=>{try{const d=JSON.parse(e.data),q=+d.p*+d.q;if(q>0){arr.push({t:+(d.T||d.E||Date.now()),q,buy:!d.m});trim();}}catch(_){}};}catch(_){}});}
function numText(s){if(!s)return NaN;let x=s.replace(/[^0-9,.-]/g,'');if(x.includes(',')&&x.includes('.'))x=x.replace(/\./g,'').replace(',','.');else if(x.includes(','))x=x.replace(',','.');return Number(x);}
async function check(){
 if(busy)return;busy=true;const sym=symbol();try{
 const paths=['https://api.binance.com/api/v3/ticker/price?symbol='+sym,'https://fapi.binance.com/fapi/v1/ticker/price?symbol='+sym,'https://fapi.binance.com/fapi/v1/openInterest?symbol='+sym,'https://fapi.binance.com/fapi/v1/fundingRate?symbol='+sym+'&limit=1','https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol='+sym+'&period=5m&limit=1','https://api.binance.com/api/v3/depth?symbol='+sym+'&limit=20','https://fapi.binance.com/fapi/v1/depth?symbol='+sym+'&limit=20'];
 const d=await Promise.all(paths.map(async u=>{const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('Binance API HTTP '+r.status);return r.json();}));
 const [sp,fu,oi,fr,ls,sb,fb]=d,spot=+sp.price,future=+fu.price;
 const panel=numText($('price')?.textContent),diff=Math.abs(spot-panel),priceOk=Number.isFinite(panel)&&diff<=Math.max(.5,spot*.00002);
 item('spot',spot.toLocaleString('en-US',{maximumFractionDigits:2})+' USDT',Number.isFinite(panel)?'Panel farkı '+diff.toFixed(4)+' USDT':'Panel fiyatı okunamadı',priceOk);
 item('futures',future.toLocaleString('en-US',{maximumFractionDigits:2})+' USDT','Bağımsız Futures REST referansı · '+new Date(fu.time||Date.now()).toLocaleTimeString('tr-TR'),true);
 trim();const a=cvd(spotRows),b=cvd(futRows);item('spotCvd',money(a.net),a.n+' bağımsız Spot işlem · 5 dk kayan pencere',a.n>0);item('futuresCvd',money(b.net),b.n+' bağımsız Futures işlem · 5 dk kayan pencere',b.n>0);
 item('oi',(+oi.openInterest).toLocaleString('en-US',{maximumFractionDigits:3})+' BTC','Binance Futures açık pozisyon API',true);
 item('sentiment',(+fr[0].fundingRate*100).toFixed(5)+'% · L/S '+(+ls[0].longShortRatio).toFixed(4),'Funding / global hesap oranı',true);
 const depth=(book)=>{const bid=book.bids.reduce((z,x)=>z+(+x[0])*(+x[1]),0),ask=book.asks.reduce((z,x)=>z+(+x[0])*(+x[1]),0);return{pct:(bid-ask)/(bid+ask||1)*100,bid,ask};};
 const s=depth(sb),f=depth(fb);item('spotBook',s.pct.toFixed(2)+'% denge','Bid '+compact(s.bid)+' / Ask '+compact(s.ask),true);item('futuresBook',f.pct.toFixed(2)+'% denge','Bid '+compact(f.bid)+' / Ask '+compact(f.ask),true);
 runs++;const issues=priceOk?0:1;status(issues?'FİYAT FARKI VAR':(a.n&&b.n?'KONTROLLER ÇALIŞIYOR':'KISMİ TEST'),issues?'#ffd166':'#35f2a1');set('vUpdated','Son kontrol '+new Date().toLocaleTimeString('tr-TR')+' · '+sym);set('vCount',runs+' kontrol');
 set('vSummary',(issues?'Panel fiyatı ile Binance REST arasında tolerans üstü fark var. ':'Fiyat referansı tolerans içinde. ')+((a.n&&b.n)?'CVD bağımsız WS akışlarından hesaplanıyor.':'CVD için WebSocket işlem örneği birikiyor.')+' Order book anlık snapshot karşılaştırmasıdır; duvar kalıcılığı kanıtı değildir.');
 }catch(e){status('API HATASI','#ff647c');set('vSummary','Kontrol tamamlanamadı: '+e.message+' · Bir sonraki otomatik denemede yeniden kontrol edilecek.');}
 finally{busy=false;}
}
function restartIfNeeded(){const sym=symbol();if(sym!==currentSymbol){currentSymbol=sym;startStreams(sym);check();}}
$('vRun').addEventListener('click',check);restartIfNeeded();timer=setInterval(()=>{if(symbol()!==currentSymbol)restartIfNeeded();else check();},15000);
})();