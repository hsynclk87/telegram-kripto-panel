(() => {
"use strict";
const $=id=>document.getElementById(id);
const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString("tr-TR",{maximumFractionDigits:d}):"—";
const compact=v=>{const n=Number(v),a=Math.abs(n);return !Number.isFinite(n)?"—":a>=1e9?(n/1e9).toFixed(2)+"B":a>=1e6?(n/1e6).toFixed(2)+"M":a>=1e3?(n/1e3).toFixed(1)+"K":fmt(n,2)};
const pct=(v,d=2)=>(Number(v)>0?"+":"")+fmt(v,d)+"%";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sign=v=>Number(v)>0?"up":Number(v)<0?"down":"flat";
const usd=v=>compact(v)+" $";
const time=v=>v?new Date(Number(v)).toLocaleTimeString("tr-TR",{hour12:false}):"—";
const FUT="https://fapi.binance.com",SPOT="https://data-api.binance.vision";
const state={busy:false,lastAt:0,selected:"BTCUSDT",failed:[]};

function mount(){
 if($("binancePro"))return;
 if(typeof CFG!=="undefined"&&Array.isArray(CFG.tabs)&&!CFG.tabs.some(x=>x[0]==="binancepro"))CFG.tabs.push(["binancepro","Binance Pro"]);
 const style=document.createElement("style");style.id="binanceProStyles";
 style.textContent=String.raw`
 #binancePro{--bg:#0a1020;--card:#111b2e;--line:#20304a;--muted:#8ea1bb;--text:#e8f0fc;--green:#2ee6a6;--red:#ff6685;color:var(--text);font-size:12px}
 #binancePro .hero{background:radial-gradient(ellipse at 85% 0%,#1b3a64 0%,transparent 45%),linear-gradient(135deg,#142640,#0d1728 68%);border:1px solid #294466;border-radius:17px;padding:15px;margin-bottom:10px}
 #binancePro .top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
 #binancePro .kicker{font-size:10px;letter-spacing:1.4px;color:#9db9dc;font-weight:800}
 #binancePro .headline{font-size:19px;font-weight:850;margin:5px 0}
 #binancePro .sub{color:var(--muted);font-size:11px}
 #binancePro .live{border:1px solid #286b5c;background:#103a35;color:#6af0c1;border-radius:99px;padding:5px 9px;font-size:10px;font-weight:800}
 #binancePro .coins{display:flex;gap:6px;overflow:auto;padding:10px 0}
 #binancePro .coins button{flex:0 0 auto;border-radius:9px;padding:7px 11px;background:#15243a;border:1px solid #2a3c57;color:#cbd8eb}
 #binancePro .coins button.active{background:#28528a;border-color:#568bd2;color:white}
 #binancePro .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}
 #binancePro .card{background:linear-gradient(145deg,#111b2e,#0d1728);border:1px solid var(--line);border-radius:13px;padding:11px;min-width:0;box-shadow:0 7px 20px #0002}
 #binancePro .wide{grid-column:1/-1}
 #binancePro .label{color:var(--muted);font-size:10px;letter-spacing:.45px;text-transform:uppercase}
 #binancePro .value{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:6px;overflow-wrap:anywhere}
 #binancePro .small{font-size:11px;color:var(--muted);margin-top:4px}
 #binancePro .section{font-size:11px;font-weight:850;letter-spacing:1px;color:#9db9dc;margin:17px 2px 8px;text-transform:uppercase}
 #binancePro table{width:100%;border-collapse:collapse;font-size:11px}
 #binancePro th{font-weight:600;color:var(--muted);text-align:left;padding:7px 4px;border-bottom:1px solid var(--line)}
 #binancePro td{padding:8px 4px;border-bottom:1px solid #1b2a40;font-variant-numeric:tabular-nums}
 #binancePro tr:last-child td{border-bottom:0}
 #binancePro .right{text-align:right}
 #binancePro .up{color:var(--green)!important}#binancePro .down{color:var(--red)!important}#binancePro .flat{color:#c0cce0}
 #binancePro .bar{height:9px;border-radius:99px;background:#29384e;overflow:hidden;display:flex;margin:9px 0 5px}
 #binancePro .bar .long{background:linear-gradient(90deg,#1bbd91,#54efc2)}
 #binancePro .bar .short{background:linear-gradient(90deg,#ff9b83,#ff5478)}
 #binancePro .split{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--muted)}
 #binancePro .pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
 #binancePro .pill{padding:5px 8px;border-radius:8px;background:#17263d;border:1px solid #293d5a;color:#b9cbe3;font-size:10px}
 #binancePro .note{font-size:10px;line-height:1.5;color:var(--muted);margin-top:9px}
 #binancePro .scroll{overflow-x:auto}#binancePro .status{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:9px}
 #binancePro .error{color:#ff9aab}#binancePro.loading{opacity:.6}
 @media(min-width:700px){#binancePro .grid{grid-template-columns:repeat(4,minmax(0,1fr))}#binancePro .grid .wide{grid-column:span 2}#binancePro .grid .full{grid-column:1/-1}}
 `;
 const section=document.createElement("section");section.id="binancePro";section.className="tab";section.dataset.tab="binancepro";section.hidden=true;
 section.innerHTML=String.raw`
 <div class="hero"><div class="top"><div><div class="kicker">BINANCE PUBLIC MARKET DATA</div><div class="headline">Piyasa İstihbarat Merkezi</div><div class="sub">Spot · USDⓈ-M Futures · Pozisyonlanma · Akış · Likidite</div></div><span class="live" id="bpLive">● BAĞLANTI HAZIR</span></div><div class="status"><span class="sub" id="bpUpdated">Veri bekleniyor</span><span class="sub" id="bpHealth">API kontrol ediliyor</span></div></div>
 <div class="coins" id="bpCoins"></div>
 <div class="section">Anlık piyasa özeti</div><div class="grid">
 <div class="card"><div class="label">Spot son fiyat</div><div class="value" id="bpSpot">—</div><div class="small" id="bpSpotChange">24s değişim —</div></div>
 <div class="card"><div class="label">Vadeli son fiyat</div><div class="value" id="bpFut">—</div><div class="small" id="bpFutChange">24s değişim —</div></div>
 <div class="card"><div class="label">Mark / Endeks</div><div class="value" id="bpMark">—</div><div class="small" id="bpIndex">Endeks —</div></div>
 <div class="card"><div class="label">Basis / Premium</div><div class="value" id="bpBasis">—</div><div class="small" id="bpPremium">Spot-futures farkı —</div></div>
 <div class="card"><div class="label">24s vadeli hacim</div><div class="value" id="bpFutVol">—</div><div class="small" id="bpFutTrades">İşlem sayısı —</div></div>
 <div class="card"><div class="label">24s spot hacim</div><div class="value" id="bpSpotVol">—</div><div class="small" id="bpSpotTrades">İşlem sayısı —</div></div>
 <div class="card"><div class="label">Açık pozisyon (USD)</div><div class="value" id="bpOI">—</div><div class="small" id="bpOIChange">OI değişimi —</div></div>
 <div class="card"><div class="label">Fonlama oranı</div><div class="value" id="bpFunding">—</div><div class="small" id="bpNextFunding">Sonraki fonlama —</div></div></div>
 <div class="section">Piyasa pozisyonlanması · 5 dakika</div><div class="grid">
 <div class="card"><div class="label">Global Long / Short</div><div class="value" id="bpGlobalRatio">—</div><div id="bpGlobalBar"></div><div class="small" id="bpGlobalMeta">Hesap dağılımı</div></div>
 <div class="card"><div class="label">Top Trader · Hesap</div><div class="value" id="bpTopAccount">—</div><div id="bpTopAccountBar"></div><div class="small" id="bpTopAccountMeta">Büyük trader hesap dağılımı</div></div>
 <div class="card"><div class="label">Top Trader · Pozisyon</div><div class="value" id="bpTopPosition">—</div><div id="bpTopPositionBar"></div><div class="small" id="bpTopPositionMeta">Büyük trader pozisyon dağılımı</div></div>
 <div class="card"><div class="label">Taker Alım / Satım</div><div class="value" id="bpTakerRatio">—</div><div id="bpTakerBar"></div><div class="small" id="bpTakerMeta">Agresif piyasa emirleri</div></div></div>
 <div class="section">Vadeli piyasa detayları</div><div class="grid">
 <div class="card"><div class="label">Son fonlama ortalaması</div><div class="value" id="bpFundingAvg">—</div><div class="small">Son 30 fonlama kaydı</div></div>
 <div class="card"><div class="label">Tahmini uzlaşma fiyatı</div><div class="value" id="bpSettle">—</div><div class="small">Uzlaşma öncesi tahmin</div></div>
 <div class="card"><div class="label">Açık pozisyon adedi</div><div class="value" id="bpOICount">—</div><div class="small">Kontrat miktarı</div></div>
 <div class="card"><div class="label">Taker hacmi</div><div class="value" id="bpTakerVol">—</div><div class="small" id="bpTakerVolMeta">Son 5 dakika</div></div>
 <div class="card wide"><div class="label">Açık pozisyon geçmişi · 48 saat</div><div class="scroll"><table id="bpOIHistory"></table></div><div class="note">OI artışı tek başına yön göstermez; fiyat ve taker akışıyla birlikte değerlendirilmelidir.</div></div>
 <div class="card wide"><div class="label">Fonlama geçmişi · Son 10 dönem</div><div class="scroll"><table id="bpFundingHistory"></table></div></div></div>
 <div class="section">Piyasa tarayıcı · USDⓈ-M</div><div class="card full"><div class="top"><div><div class="label">En yüksek hacimli kontratlar</div><div class="small">24 saatlik vadeli piyasa verisi · USDT sözleşmeleri</div></div><span class="pill" id="bpScanCount">— kontrat</span></div><div class="scroll"><table id="bpScanner"></table></div></div>
 <div class="section">Veri kapsamı</div><div class="card full"><div class="pills"><span class="pill">Spot ticker</span><span class="pill">Futures ticker</span><span class="pill">Mark / Index</span><span class="pill">Funding</span><span class="pill">Open Interest</span><span class="pill">Global L/S</span><span class="pill">Top Trader L/S</span><span class="pill">Taker flow</span><span class="pill">Basis</span><span class="pill">24h volume</span><span class="pill">Market scanner</span><span class="pill">Order book / trades / whales / liquidations / klines</span></div><div class="note">Binance'in herkese açık piyasa verileri kullanılır. Hesap bakiyesi, cüzdan, açık emirler ve kişisel işlem geçmişi özel API anahtarı gerektirir. Long/Short metrikleri farklı ölçümlerdir; tek başına AL/SAT sinyali değildir.</div></div>
 `;
 document.body.insertBefore(section,$("updated")||null);
 if(typeof st!=="undefined"&&st.coin)state.selected=st.coin+"USDT";drawCoins();if(typeof drawControls==="function")drawControls();refreshAll();setInterval(refreshAll,30000);
}
function drawCoins(){
 const coins=typeof CFG!=="undefined"&&Array.isArray(CFG.coins)?CFG.coins:["BTC","ETH","SOL","BNB","XRP","DOGE"];
 $("bpCoins").innerHTML=coins.map(c=>'<button type="button" data-bp-coin="'+safe(c)+'" class="'+(c+"USDT"===state.selected?"active":"")+'">'+safe(c)+'</button>').join("");
 $("bpCoins").onclick=e=>{const b=e.target.closest("[data-bp-coin]");if(!b)return;state.selected=b.dataset.bpCoin+"USDT";drawCoins();refreshAll()};
}
async function get(path,host=FUT){const r=await fetch(host+path,{cache:"no-store",headers:{Accept:"application/json"}});if(!r.ok)throw Error("HTTP "+r.status+" "+path);return r.json()}
async function settled(path,host=FUT){try{return await get(path,host)}catch(e){state.failed.push(e.message);return null}}
function renderRatio(row,valueId,barId,metaId,taker=false){
 if(!row)return;let long,short,ratio;
 if(taker){ratio=Number(row.buySellRatio);long=ratio/(1+ratio)*100;short=100-long}
 else{long=Number(row.longAccount)*100;short=Number(row.shortAccount)*100;ratio=Number(row.longShortRatio)}
 $(valueId).textContent=fmt(ratio,2)+" : 1";
 $(barId).innerHTML='<div class="bar"><i class="long" style="width:'+Math.max(0,Math.min(100,long))+'%"></i><i class="short" style="width:'+Math.max(0,Math.min(100,short))+'%"></i></div><div class="split"><span class="up">'+(taker?"Alım":"Long")+" "+fmt(long,1)+'%</span><span class="down">'+(taker?"Satım":"Short")+" "+fmt(short,1)+'%</span></div>';
 $(metaId).textContent="Veri zamanı: "+time(row.timestamp);
}
function renderHistory(rows,id,mode){
 if(!Array.isArray(rows)||!rows.length){$(id).innerHTML="<tr><td>Veri bulunamadı</td></tr>";return}
 const recent=rows.slice(-10).reverse();
 if(mode==="oi")$(id).innerHTML="<tr><th>Zaman</th><th class='right'>OI (USD)</th><th class='right'>Kontrat</th></tr>"+recent.map(x=>'<tr><td>'+time(x.timestamp)+'</td><td class="right">'+usd(x.sumOpenInterestValue)+'</td><td class="right">'+compact(x.sumOpenInterest)+'</td></tr>').join("");
}
function renderScanner(rows){
 if(!Array.isArray(rows)){$("bpScanner").innerHTML="<tr><td>Tarama verisi alınamadı</td></tr>";return}
 const filtered=rows.filter(x=>x.symbol.endsWith("USDT")&&!x.symbol.includes("_")).sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume));
 $("bpScanCount").textContent=filtered.length+" kontrat";
 $("bpScanner").innerHTML="<tr><th>Kontrat</th><th class='right'>Son fiyat</th><th class='right'>24s %</th><th class='right'>Hacim</th><th class='right'>İşlem</th></tr>"+filtered.slice(0,30).map(x=>'<tr><td><b>'+safe(x.symbol.replace("USDT",""))+'</b></td><td class="right">'+fmt(x.lastPrice,Number(x.lastPrice)<1?6:2)+'</td><td class="right '+sign(x.priceChangePercent)+'">'+pct(x.priceChangePercent)+'</td><td class="right">'+compact(x.quoteVolume)+'</td><td class="right">'+compact(x.count)+'</td></tr>').join("");
}
async function refreshAll(){
 if(state.busy)return;state.busy=true;state.failed=[];$("bpLive").textContent="● VERİ ALINIYOR";$("binancePro").classList.add("loading");
 const q="?symbol="+encodeURIComponent(state.selected),p5="&period=5m&limit=24";
 const t=await Promise.all([
 settled("/fapi/v1/premiumIndex"+q),settled("/fapi/v1/ticker/24hr"+q),settled("/fapi/v1/openInterest"+q),
 settled("/futures/data/openInterestHist"+q+"&period=1h&limit=48"),
 settled("/futures/data/globalLongShortAccountRatio"+q+p5),
 settled("/futures/data/topLongShortAccountRatio"+q+p5),
 settled("/futures/data/topLongShortPositionRatio"+q+p5),
 settled("/futures/data/takerlongshortRatio"+q+p5),
 settled("/fapi/v1/fundingRate"+q+"&limit=30"),
 settled("/fapi/v1/ticker/24hr"),settled("/api/v3/ticker/24hr"+q,SPOT),
 settled("/futures/data/basis?pair="+encodeURIComponent(state.selected)+"&contractType=PERPETUAL&period=5m&limit=24")
 ]);
 const [premium,fut,oi,oiHist,globalLS,topAcc,topPos,taker,funding,allFut,spot,basis]=t;
 if(premium){
 $("bpMark").textContent=fmt(premium.markPrice,Number(premium.markPrice)<1?6:2);$("bpIndex").textContent="Endeks "+fmt(premium.indexPrice,Number(premium.indexPrice)<1?6:2);
 $("bpFunding").textContent=pct(Number(premium.lastFundingRate)*100,4);$("bpFunding").className="value "+sign(Number(premium.lastFundingRate));
 $("bpNextFunding").textContent="Sonraki: "+new Date(Number(premium.nextFundingTime)).toLocaleTimeString("tr-TR",{hour12:false});
 $("bpSettle").textContent=fmt(premium.estimatedSettlePrice,Number(premium.estimatedSettlePrice)<1?6:2);
 $("bpPremium").textContent="Mark / Endeks farkı "+pct((Number(premium.markPrice)/Number(premium.indexPrice)-1)*100,4);
 }
 if(fut){$("bpFut").textContent=fmt(fut.lastPrice,Number(fut.lastPrice)<1?6:2);$("bpFutChange").textContent="24s "+pct(fut.priceChangePercent);$("bpFutVol").textContent=usd(fut.quoteVolume);$("bpFutTrades").textContent="İşlem sayısı "+compact(fut.count)}
 if(spot){$("bpSpot").textContent=fmt(spot.lastPrice,Number(spot.lastPrice)<1?6:2);$("bpSpotChange").textContent="24s "+pct(spot.priceChangePercent);$("bpSpotVol").textContent=usd(spot.quoteVolume);$("bpSpotTrades").textContent="İşlem sayısı "+compact(spot.count)}
 if(fut&&spot){const b=(Number(fut.lastPrice)/Number(spot.lastPrice)-1)*100;$("bpBasis").textContent=pct(b,4);$("bpBasis").className="value "+sign(b)}
 if(oi&&premium){$("bpOI").textContent=usd(Number(oi.openInterest)*Number(premium.markPrice));$("bpOICount").textContent=compact(oi.openInterest)}
 if(Array.isArray(oiHist)&&oiHist.length){const a=Number(oiHist[0].sumOpenInterestValue),b=Number(oiHist[oiHist.length-1].sumOpenInterestValue);$("bpOIChange").textContent="48s değişim "+pct(a?(b/a-1)*100:0);renderHistory(oiHist,"bpOIHistory","oi")}else{$("bpOIChange").textContent="OI geçmişi alınamadı";$("bpOIHistory").innerHTML="<tr><td>Veri bulunamadı</td></tr>"}
 if(globalLS?.length)renderRatio(globalLS.at(-1),"bpGlobalRatio","bpGlobalBar","bpGlobalMeta");
 if(topAcc?.length)renderRatio(topAcc.at(-1),"bpTopAccount","bpTopAccountBar","bpTopAccountMeta");
 if(topPos?.length)renderRatio(topPos.at(-1),"bpTopPosition","bpTopPositionBar","bpTopPositionMeta");
 if(taker?.length){const x=taker.at(-1);renderRatio(x,"bpTakerRatio","bpTakerBar","bpTakerMeta",true);$("bpTakerVol").textContent="Al "+compact(x.buyVol)+" / Sat "+compact(x.sellVol);$("bpTakerVolMeta").textContent="Son dönem · "+time(x.timestamp)}
 if(funding?.length){const avg=funding.reduce((s,x)=>s+Number(x.fundingRate),0)/funding.length*100;$("bpFundingAvg").textContent=pct(avg,4);$("bpFundingHistory").innerHTML="<tr><th>Zaman</th><th class='right'>Fonlama</th></tr>"+funding.slice(-10).reverse().map(x=>'<tr><td>'+time(x.fundingTime)+'</td><td class="right '+sign(x.fundingRate)+'">'+pct(Number(x.fundingRate)*100,4)+'</td></tr>').join("")}
 if(Array.isArray(basis)&&basis.length){const x=basis.at(-1);$("bpBasis").textContent=pct(Number(x.basisRate)*100,4);$("bpPremium").textContent="Basis endpoint · "+time(x.timestamp)}
 if(allFut)renderScanner(allFut);
 $("bpUpdated").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR",{hour12:false})+" · "+state.selected;
 $("bpHealth").textContent=state.failed.length?state.failed.length+" veri uç noktası yanıt vermedi":"Ana veri kaynakları yanıt verdi";
 $("bpHealth").className="sub"+(state.failed.length?" error":"");$("bpLive").textContent=state.failed.length?"● KISMİ VERİ":"● CANLI API";
 $("binancePro").classList.remove("loading");state.busy=false;
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
})();