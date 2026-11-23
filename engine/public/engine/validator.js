(()=>{'use strict';
const $=id=>document.getElementById(id);
const card=document.createElement('section');
card.className='card';card.id='validatorCard';
card.style.cssText='margin:12px 0;background:linear-gradient(145deg,rgba(20,34,57,.98),rgba(13,22,39,.98));border:1px solid rgba(91,150,220,.35);border-radius:16px;padding:13px;color:#f3f7ff;font:13px system-ui';
card.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b style="letter-spacing:1px;font-size:11px;color:#b5bdd2">BINANCE LIVE VALIDATOR</b><div id="vUpdated" style="font-size:10px;color:#a9bad4;margin-top:4px">Bağımsız veri kontrolü başlatılıyor</div></div><b id="vStatus" style="font-size:10px;padding:5px 8px;border-radius:20px;background:#33394d;color:#ffd166">BAŞLATILIYOR</b></div><div id="vGrid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:11px"></div><div style="margin-top:12px;padding:10px;background:rgba(8,17,31,.75);border:1px solid rgba(100,145,195,.2);border-radius:10px"><b style="font-size:10px;color:#b5bdd2;letter-spacing:.6px">BAĞIMSIZ WEBSOCKET SAĞLIK KONTROLÜ</b><div id="vWsGrid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px"></div></div><div style="display:flex;align-items:center;gap:10px;margin-top:10px"><button id="vRun" style="border:1px solid #435477;background:#18263d;color:#e5edfa;border-radius:8px;padding:8px 11px;font-weight:700">ŞİMDİ KONTROL ET</button><span id="vCount" style="font-size:10px;color:#a9bad4"></span></div><div id="vSummary" style="font-size:10px;line-height:1.5;color:#a9bad4;margin-top:9px">Mevcut analiz motoruna müdahale etmeden bağımsız Binance API ve WebSocket akışları kontrol edilir.</div>';
const anchor=document.querySelector('.market-card');
if(anchor)anchor.insertAdjacentElement('afterend',card);else document.body.appendChild(card);
const fields=[['spot','SPOT FİYAT'],['futures','FUTURES FİYAT'],['spotCvd','SPOT CVD · 5 DK'],['futuresCvd','FUTURES CVD · 5 DK'],['oi','OPEN INTEREST'],['sentiment','FUNDING / LONG-SHORT'],['spotBook','SPOT ORDER BOOK'],['futuresBook','FUTURES ORDER BOOK']];
const grid=$('vGrid');
fields.forEach(([id,label])=>{const el=document.createElement('div');el.style.cssText='background:rgba(8,17,31,.75);border:1px solid rgba(100,145,195,.2);border-radius:10px;padding:9px;min-width:0';el.innerHTML='<span style="display:block;color:#a9bad4;font-size:10px">'+label+'</span><b id="v_'+id+'" style="display:block;font-size:13px;margin-top:4px;overflow-wrap:anywhere">—</b><small id="vn_'+id+'" style="display:block;color:#a9bad4;font-size:10px;margin-top:3px">Veri bekleniyor</small>';grid.appendChild(el);});
const wsGrid=$('vWsGrid');
[['spotWs','SPOT TRADE STREAM'],['futuresWs','FUTURES AGGTRADE STREAM']].forEach(([id,label])=>{const el=document.createElement('div');el.style.cssText='min-width:0';el.innerHTML='<span style="display:block;color:#a9bad4;font-size:9px">'+label+'</span><b id="v_'+id+'" style="display:block;font-size:11px;margin-top:3px;color:#ffd166">BAĞLANIYOR</b><small id="vn_'+id+'" style="display:block;color:#a9bad4;font-size:10px;margin-top:3px">Henüz veri yok</small>';wsGrid.appendChild(el);});
let sockets={spot:null,futures:null},reconnectTimers={},watchdogs={},rows={spot:[],futures:[]},stats={spot:{count:0,lastAt:0,connectedAt:0,errors:0,quote:0},futures:{count:0,lastAt:0,connectedAt:0,errors:0,quote:0}},runs=0,busy=false,currentSymbol='',checkTimer=null;
const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
const status=(txt,color)=>{set('vStatus',txt);$('vStatus').style.color=color;$('vStatus').style.background='rgba(150,160,190,.13)';};
const money=x=>(x<0?'-':'')+'$'+Math.abs(x).toLocaleString('en-US',{maximumFractionDigits:2});
const compact=x=>Math.abs(x)>=1e9?(x/1e9).toFixed(2)+'B':Math.abs(x)>=1e6?(x/1e6).toFixed(2)+'M':Math.abs(x)>=1e3?(x/1e3).toFixed(2)+'K':x.toFixed(2);
function item(id,value,note,ok=true){set('v_'+id,value);set('vn_'+id,note);const e=$('v_'+id);if(e)e.style.color=ok?'#35f2a1':'#ffd166';}
function symbol(){const x=$('symbol')?.textContent||'BTCUSDT';return (x.match(/[A-Z0-9]+USDT/)||['BTCUSDT'])[0];}
function trim(){const t=Date.now()-300000;rows.spot=rows.spot.filter(x=>x.t>=t);rows.futures=rows.futures.filter(x=>x.t>=t);}
function cvd(arr){let b=0,s=0,q=0;arr.forEach(x=>{if(x.buy)b+=x.quote;else s+=x.quote;q+=x.quote;});return{net:b-s,n:arr.length,quote:q,buy:b,sell:s};}
function parseCvd(id){const t=$(id)?.textContent||'';const m=t.match(/[-+]?\s*\$?\s*[0-9][0-9.,]*(?:\s*[KMB])?/i);if(!m)return NaN;let z=m[0].replace(/\$/g,'').replace(/\s/g,'');const unit=(z.match(/[KMB]$/i)||[''])[0].toUpperCase();z=z.replace(/[KMB]$/i,'');if(z.includes(',')&&z.includes('.'))z=z.replace(/,/g,'');else if(z.includes(',')&&!z.includes('.'))z=z.replace(',','.');const n=Number(z);return Number.isFinite(n)?n*(unit==='K'?1e3:unit==='M'?1e6:unit==='B'?1e9:1):NaN;}
function numText(s){if(!s)return NaN;let x=String(s).replace(/[^0-9,.-]/g,'');if(!x||x==='-'||x==='.'||x===',')return NaN;const comma=x.lastIndexOf(','),dot=x.lastIndexOf('.');if(comma>=0&&dot>=0){const decimal=comma>dot?',':'.';const thousands=decimal===','?'.':',';x=x.split(thousands).join('');if(decimal===',')x=x.replace(',','.');}else if(comma>=0){const tail=x.length-comma-1;if(tail===1||tail===2)x=x.replace(/,/g,'.');else x=x.replace(/,/g,'');}else if(dot>=0){const tail=x.length-dot-1;if(tail!==1&&tail!==2)x=x.replace(/\./g,'');}const n=Number(x);return Number.isFinite(n)?n:NaN;}
function wsView(which,state,note,color){set('v_'+which+'Ws',state);set('vn_'+which+'Ws',note);const e=$('v_'+which+'Ws');if(e)e.style.color=color||'#ffd166';}
function stopSocket(which){const w=sockets[which];if(w){w.onopen=w.onmessage=w.onerror=w.onclose=null;try{w.close();}catch(_){}}sockets[which]=null;if(reconnectTimers[which]){clearTimeout(reconnectTimers[which]);reconnectTimers[which]=null;}if(watchdogs[which]){clearTimeout(watchdogs[which]);watchdogs[which]=null;}}
function connectStream(which,sym,attempt=0){
 stopSocket(which);
 const isSpot=which==='spot';
 const url=isSpot?'wss://stream.binance.com:443/ws/'+sym.toLowerCase()+'@trade':'wss://fstream.binance.com/ws/'+sym.toLowerCase()+'@trade';
 wsView(which,'BAĞLANIYOR','Binance WebSocket açılıyor…','#ffd166');
 let w;try{w=new WebSocket(url);}catch(e){stats[which].errors++;scheduleReconnect(which,sym,attempt+1);return;}
 sockets[which]=w;
 w.onopen=()=>{if(sockets[which]!==w)return;stats[which].connectedAt=Date.now();wsView(which,'BAĞLI','Bağlantı açık · ilk işlem bekleniyor','#35f2a1');if(watchdogs[which])clearTimeout(watchdogs[which]);watchdogs[which]=setTimeout(()=>{if(sockets[which]===w&&stats[which].lastAt<stats[which].connectedAt){wsView(which,'KESİLDİ','Bağlantı açık fakat 12 sn işlem gelmedi · yeniden bağlanıyor','#ffd166');try{w.close();}catch(_){scheduleReconnect(which,sym,attempt+1);}}},12000);};
 w.onmessage=e=>{if(sockets[which]!==w)return;try{const d=JSON.parse(e.data),price=+d.p,qty=+d.q,quote=price*qty;if(!(quote>0))return;const now=Date.now();if(watchdogs[which]){clearTimeout(watchdogs[which]);watchdogs[which]=null;}rows[which].push({t:now,quote,buy:!d.m});stats[which].count++;stats[which].lastAt=now;stats[which].quote+=quote;trim();const c=cvd(rows[which]);const age=Math.max(0,Math.round((now-stats[which].connectedAt)/1000));wsView(which,'AKTİF',stats[which].count+' işlem · son veri şimdi · '+money(c.quote)+' hacim','#35f2a1');}catch(err){stats[which].errors++;}};
 w.onerror=()=>{stats[which].errors++;wsView(which,'HATA','WebSocket hata olayı · bağlantı yenileniyor','#ffd166');try{w.close();}catch(_){scheduleReconnect(which,sym,attempt+1);}};
 w.onclose=()=>{if(sockets[which]!==w)return;sockets[which]=null;wsView(which,'KESİLDİ','Bağlantı kapandı · otomatik yeniden bağlanacak','#ff647c');scheduleReconnect(which,sym,attempt+1);};
}
function scheduleReconnect(which,sym,attempt){if(reconnectTimers[which])clearTimeout(reconnectTimers[which]);const delay=Math.min(30000,1000*Math.pow(2,Math.min(attempt,5)));reconnectTimers[which]=setTimeout(()=>{if(symbol()===sym)connectStream(which,sym,attempt);},delay);}
function startStreams(sym){['spot','futures'].forEach(k=>{stopSocket(k);rows[k]=[];stats[k]={count:0,lastAt:0,connectedAt:0,errors:0,quote:0};});connectStream('spot',sym);connectStream('futures',sym);}
function timeSince(t){return t?Math.max(0,Math.round((Date.now()-t)/1000))+' sn önce':'henüz gelmedi';}
async function getJson(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status+' · '+url);return r.json();}
async function optionalJson(url){try{return await getJson(url);}catch(e){return{_error:e.message};}}
async function check(){
 if(busy)return;busy=true;const sym=symbol();
 try{
 const base='https://api.binance.com',fbase='https://fapi.binance.com';
 const urls=[
 base+'/api/v3/ticker/price?symbol='+sym,
 fbase+'/fapi/v1/ticker/price?symbol='+sym,
 fbase+'/fapi/v1/openInterest?symbol='+sym,
 fbase+'/fapi/v1/fundingRate?symbol='+sym+'&limit=1',
 fbase+'/futures/data/globalLongShortAccountRatio?symbol='+sym+'&period=5m&limit=1',
 base+'/api/v3/depth?symbol='+sym+'&limit=20',
 fbase+'/fapi/v1/depth?symbol='+sym+'&limit=20'
 ];
 const d=await Promise.all(urls.map(getJson));
 if(sym!==symbol())return;
 const [sp,fu,oi,fr,ls,sb,fb]=d,spot=+sp.price,future=+fu.price;
 const panel=numText($('price')?.textContent),diff=Math.abs(spot-panel),priceOk=Number.isFinite(panel)&&diff<=Math.max(.5,spot*.00002);
 item('spot',spot.toLocaleString('en-US',{maximumFractionDigits:2})+' USDT',Number.isFinite(panel)?'Panel farkı '+diff.toFixed(4)+' USDT':'Panel fiyatı okunamadı',priceOk);
 item('futures',future.toLocaleString('en-US',{maximumFractionDigits:2})+' USDT','Bağımsız Futures REST referansı · '+new Date().toLocaleTimeString('tr-TR'),true);
 trim();const a=cvd(rows.spot),b=cvd(rows.futures),warmSpot=Date.now()-(stats.spot.connectedAt||Date.now())>=300000,warmFut=Date.now()-(stats.futures.connectedAt||Date.now())>=300000;
 const panelSpot=parseCvd('spotCvd'),panelFut=parseCvd('futuresCvd');
 const sOk=warmSpot&&a.n>0&&Number.isFinite(panelSpot)&&Math.abs(a.net-panelSpot)<=Math.max(10,Math.abs(a.net)*.02);
 const fOk=warmFut&&b.n>0&&Number.isFinite(panelFut)&&Math.abs(b.net-panelFut)<=Math.max(10,Math.abs(b.net)*.02);
 const sNote=a.n+' işlem · '+money(a.quote)+' toplam hacim · son '+timeSince(stats.spot.lastAt)+(warmSpot?' · panel farkı '+(Number.isFinite(panelSpot)?money(a.net-panelSpot):'okunamadı'):' · 5 dk dolmadı');
 const fNote=b.n+' işlem · '+money(b.quote)+' toplam hacim · son '+timeSince(stats.futures.lastAt)+(warmFut?' · panel farkı '+(Number.isFinite(panelFut)?money(b.net-panelFut):'okunamadı'):' · 5 dk dolmadı');
 item('spotCvd',money(a.net),sNote,warmSpot?sOk:a.n>0);
 item('futuresCvd',money(b.net),fNote,warmFut?fOk:b.n>0);
 const oiValue=+oi.openInterest,baseAsset=sym.replace(/USDT$/,'');
 item('oi',oiValue.toLocaleString('en-US',{maximumFractionDigits:4})+' '+baseAsset,'Binance Futures açık pozisyon API · '+new Date().toLocaleTimeString('tr-TR'),true);
 const funding=Array.isArray(fr)&&fr.length?+fr[0].fundingRate:NaN,ratio=Array.isArray(ls)&&ls.length?+ls[0].longShortRatio:NaN;
 item('sentiment',(Number.isFinite(funding)?(funding*100).toFixed(5)+'%':'Funding alınamadı')+' · L/S '+(Number.isFinite(ratio)?ratio.toFixed(4):'—'), 'Funding / global hesap oranı'+(ls? ' · '+(ls._error||'') :''),Number.isFinite(funding)&&Number.isFinite(ratio));
 const depth=book=>{const bid=book.bids.reduce((z,x)=>z+(+x[0])*(+x[1]),0),ask=book.asks.reduce((z,x)=>z+(+x[0])*(+x[1]),0);return{pct:(bid-ask)/(bid+ask||1)*100,bid,ask};};
 const s=depth(sb),f=depth(fb);
 item('spotBook',s.pct.toFixed(2)+'% denge','Bid '+compact(s.bid)+' / Ask '+compact(s.ask)+' · 20 kademe',true);
 item('futuresBook',f.pct.toFixed(2)+'% denge','Bid '+compact(f.bid)+' / Ask '+compact(f.ask)+' · 20 kademe',true);
 const wsReady=stats.spot.lastAt>0&&stats.futures.lastAt>0;
 const cvdReady=warmSpot&&warmFut&&a.n>0&&b.n>0&&Number.isFinite(panelSpot)&&Number.isFinite(panelFut);
 const issues=(priceOk?0:1)+(wsReady?0:1)+(cvdReady&&(!sOk||!fOk)?1:0);
 status(issues?'KONTROL GEREKİYOR':(cvdReady?'TÜM KONTROLLER TAMAM':'KISMİ TEST'),issues?'#ffd166':'#35f2a1');
 runs++;set('vUpdated','Son kontrol '+new Date().toLocaleTimeString('tr-TR')+' · '+sym);set('vCount',runs+' kontrol');
 set('vSummary',(priceOk?'Spot fiyat panelle eşleşiyor. ':'Spot fiyat panel farkı toleransı aşıyor. ')+(wsReady?'Her iki bağımsız WebSocket işlem verisi üretiyor. ':'WebSocket akışlarından en az biri henüz işlem üretmedi. ')+(cvdReady?'CVD panel karşılaştırması tamamlandı. ':'CVD karşılaştırması için iki akışta da 5 dakikalık veri birikmesi gerekiyor. ')+'Emir defteri 20 kademe anlık görüntüdür; bekleyen emirler iptal edilebilir.');
 }catch(e){status('REST API HATASI','#ff647c');set('vSummary','REST kontrolü tamamlanamadı: '+e.message+' · WebSocket sağlık kontrolleri bağımsız çalışmaya devam ediyor.');}
 finally{busy=false;}
}
function restartIfNeeded(){const sym=symbol();if(sym!==currentSymbol){currentSymbol=sym;startStreams(sym);check();}}
$('vRun').addEventListener('click',check);
restartIfNeeded();
checkTimer=setInterval(()=>{if(symbol()!==currentSymbol)restartIfNeeded();else{trim();check();['spot','futures'].forEach(k=>{const age=stats[k].lastAt?timeSince(stats[k].lastAt):'işlem gelmedi';if(sockets[k]&&sockets[k].readyState===WebSocket.OPEN&&stats[k].lastAt)wsView(k,'AKTİF',stats[k].count+' işlem · son '+age+' · hata '+stats[k].errors,'#35f2a1');});}},15000);
window.addEventListener('beforeunload',()=>{clearInterval(checkTimer);['spot','futures'].forEach(stopSocket);});
})();