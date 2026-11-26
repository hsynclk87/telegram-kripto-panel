(()=>{"use strict";
const API="/api/knn";
const $=s=>document.querySelector(s),fmt=(v,d=2)=>v==null?"—":(Number(v)*100).toFixed(d)+"%",num=(v,d=2)=>v==null?"—":Number(v).toLocaleString("tr-TR",{maximumFractionDigits:d}),date=v=>new Date(v).toLocaleString("tr-TR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
const symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","LINKUSDT","AVAXUSDT","HBARUSDT"];
const css=`
#knnOpen{position:fixed;z-index:2147483646;left:50%;top:calc(14px + env(safe-area-inset-top));bottom:auto;transform:translateX(-50%);pointer-events:auto;touch-action:manipulation;cursor:pointer;display:block;margin:0;white-space:nowrap;background:#101e2b;border:1px solid #3c6e87;color:#bce8f4;border-radius:11px;padding:12px 20px;font-size:12px;font-weight:800;letter-spacing:.08em}
#knnPanel{display:none;position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#080e16;color:#e8eff7;padding:env(safe-area-inset-top) 14px max(28px,env(safe-area-inset-bottom));font-family:Inter,system-ui,Arial,sans-serif;text-shadow:none}
#knnPanel.show{display:block}#knnPanel *{box-sizing:border-box}
.knn-wrap{max-width:1080px;margin:auto}.knn-head{position:sticky;top:0;z-index:4;display:flex;justify-content:space-between;align-items:center;padding:13px 0;background:rgba(8,14,22,.96);border-bottom:1px solid #243446;backdrop-filter:blur(14px)}
.knn-head b{font-size:13px;letter-spacing:.16em}.knn-head button,.knn-btn{background:#152536;border:1px solid #344b60;color:#dce9f4;border-radius:9px;padding:10px 13px;font-weight:750;font-size:11px}
.knn-controls{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;gap:8px;padding:15px 0}
.knn-controls label{display:flex;flex-direction:column;gap:6px;color:#8197ad;font-size:9px;font-weight:800;letter-spacing:.1em}
.knn-controls select{width:100%;min-width:0;background:#101e2d;border:1px solid #30455b;color:#edf4fa;border-radius:9px;padding:11px 9px;font-size:12px}
.knn-actions{display:flex;gap:8px;align-items:center}.knn-actions .knn-btn{flex:1;background:#12352e;border-color:#286d58;color:#a7f1d2}
.knn-status{font-size:10px;color:#8096ad;padding:0 0 10px;min-height:23px}
.knn-hero{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.knn-card{background:linear-gradient(145deg,#111f2e,#0c1723);border:1px solid #273b50;border-radius:13px;padding:14px;min-width:0}
.knn-signal{display:flex;align-items:center;justify-content:space-between;gap:10px}.knn-signal strong{font-size:25px;letter-spacing:.04em}.knn-signal small{color:#8398ae;font-size:9px}
.knn-long{color:#4be0ad}.knn-short{color:#ff6b83}.knn-neutral{color:#b4c2d1}
.knn-probs{display:grid;gap:9px;margin-top:15px}.knn-prob{display:grid;grid-template-columns:62px 1fr 42px;gap:8px;align-items:center;font-size:10px;color:#9bacc0}
.knn-track{height:7px;background:#1c2a39;border-radius:8px;overflow:hidden}.knn-fill{height:100%;border-radius:8px;background:#43d5a4}.knn-fill.short{background:#f2637d}.knn-fill.neutral{background:#8b9caf}
.knn-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.knn-metric{background:#0b1621;border:1px solid #1f3041;border-radius:9px;padding:10px}.knn-metric small{display:block;color:#7e94aa;font-size:8px;letter-spacing:.08em}.knn-metric b{display:block;margin-top:5px;font-size:16px;font-variant-numeric:tabular-nums}
.knn-section{margin-top:12px}.knn-section h3{font-size:11px;letter-spacing:.1em;color:#b8c8d8;margin:0 0 9px}
.knn-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.knn-krow{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1e2d3d;font-size:10px;color:#a9bacb}.knn-krow b{color:#e5edf5}
.knn-neighbors{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}
.knn-neighbor{background:#0d1926;border:1px solid #24364a;border-radius:9px;padding:10px;display:grid;grid-template-columns:1fr auto;gap:4px}
.knn-neighbor small{font-size:9px;color:#8196ab}.knn-neighbor b{font-size:11px}.knn-neighbor .ret{grid-column:2;grid-row:1/3;align-self:center;font-size:12px;font-weight:800}
.knn-disclaimer{font-size:9px;line-height:1.55;color:#788da3;margin:14px 0 0;padding:11px;border:1px solid #1d2d3d;border-radius:9px}
@media(max-width:560px){#knnPanel{padding-left:11px;padding-right:11px}.knn-controls{grid-template-columns:1fr 1fr}.knn-hero{grid-template-columns:1fr}.knn-grid{grid-template-columns:1fr}.knn-neighbors{grid-template-columns:1fr 1fr}.knn-signal strong{font-size:23px}}
`;
const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
const button=$("#knnOpen")||document.createElement("button");button.id="knnOpen";button.textContent="KNN MARKET INTELLIGENCE";button.type="button";button.setAttribute("aria-label","KNN Market Intelligence panelini aç");/* Ana kapsayıcının stacking context katmanından çıkar: fixed buton doğrudan body altında olmalı. */if(button.parentElement!==document.body)document.body.appendChild(button);
const panel=document.createElement("section");panel.id="knnPanel";panel.innerHTML=`
<div class="knn-wrap">
<header class="knn-head"><b>KNN MARKET INTELLIGENCE</b><button id="knnClose">KAPAT ✕</button></header>
<div class="knn-controls">
<label>PARİTE<select id="knnSymbol">${symbols.map(s=>'<option value="'+s+'">'+s.replace("USDT"," / USDT")+'</option>').join("")}</select></label>
<label>ZAMAN DİLİMİ<select id="knnTf"><option value="15m">15 DAKİKA</option><option value="1h">1 SAAT</option><option value="4h">4 SAAT</option><option value="1d">1 GÜN</option><option value="1w">1 HAFTA</option></select></label>
<label>K KOMŞU<select id="knnK"><option>5</option><option selected>10</option><option>20</option><option>30</option></select></label>
<label>TAHMİN UFUKU<select id="knnH"><option>3</option><option selected>5</option><option>10</option><option>20</option></select></label>
</div>
<div class="knn-actions"><button class="knn-btn" id="knnRun">ANALİZİ HESAPLA</button><button class="knn-btn" id="knnDistance">LORENTZIAN</button></div>
<div class="knn-status" id="knnStatus">Analiz için parite ve zaman dilimini seçin.</div>
<div class="knn-hero">
<div class="knn-card"><div class="knn-signal"><div><small>MODEL SINIFLANDIRMASI</small><br><strong id="knnSignal" class="knn-neutral">—</strong></div><small id="knnPrice">—</small></div><div class="knn-probs" id="knnProbs"></div></div>
<div class="knn-card"><div class="knn-section"><h3>MODEL ÖZETİ</h3><div class="knn-metrics">
<div class="knn-metric"><small>GEÇMİŞ ÖRNEK</small><b id="knnTrain">—</b></div>
<div class="knn-metric"><small>OY AĞIRLIĞI</small><b id="knnVote">—</b></div>
<div class="knn-metric"><small>ORT. GETİRİ</small><b id="knnMean">—</b></div>
</div><div class="knn-metrics">
<div class="knn-metric"><small>BACKTEST DOĞRULUK</small><b id="knnAcc">—</b></div>
<div class="knn-metric"><small>YÖN DOĞRULUĞU</small><b id="knnDir">—</b></div>
<div class="knn-metric"><small>TEST ÖRNEĞİ</small><b id="knnSamples">—</b></div>
</div></div></div>
</div>
<div class="knn-grid">
<div class="knn-card knn-section"><h3>K DEĞERİ DUYARLILIK TESTİ</h3><div id="knnSensitivity"></div></div>
<div class="knn-card knn-section"><h3>MESAFE YÖNTEMİ KARŞILAŞTIRMASI</h3><div id="knnDistances"></div><div id="knnContext" class="knn-section"></div></div>
</div>
<div class="knn-card knn-section"><h3>EN YAKIN 20 GEÇMİŞ BENZERLİK</h3><div id="knnNeighbors" class="knn-neighbors"></div></div>
<div class="knn-disclaimer" id="knnDisclaimer">Komşu oyları kalibre edilmiş olasılık değildir. Geçmiş test sonuçları gelecekteki performansı garanti etmez. OI ve funding güncel bağlam verisidir; tarihsel eğitim vektörüne dahil değildir.</div>
</div>`;
document.body.appendChild(panel);
let distance="lorentzian",busy=false;
function status(s){$("#knnStatus").textContent=s}
function cls(s){return s==="LONG"?"knn-long":s==="SHORT"?"knn-short":"knn-neutral"}
function pct(v){return v==null?"—":(v*100).toFixed(1)+"%"}
function render(d){
 $("#knnSignal").textContent=d.signal;$("#knnSignal").className=cls(d.signal);
 $("#knnPrice").textContent=num(d.currentClose,4)+" USDT";
 $("#knnTrain").textContent=num(d.trainingExamples,0);$("#knnVote").textContent=pct(d.voteShare);
 $("#knnMean").textContent=pct(d.expectedForwardReturnMean);
 $("#knnAcc").textContent=pct(d.backtest.accuracy);$("#knnDir").textContent=pct(d.backtest.directionalAccuracy);$("#knnSamples").textContent=num(d.backtest.samples,0);
 $("#knnProbs").innerHTML=["LONG","SHORT","NEUTRAL"].map(k=>'<div class="knn-prob"><span>'+k+'</span><div class="knn-track"><div class="knn-fill '+(k==="SHORT"?"short":k==="NEUTRAL"?"neutral":"")+'" style="width:'+((d.probabilities[k]||0)*100)+'%"></div></div><b>'+pct(d.probabilities[k])+'</b></div>').join("");
 $("#knnSensitivity").innerHTML=d.kSensitivity.map(x=>'<div class="knn-krow"><span>K = '+x.k+'</span><b class="'+cls(x.signal)+'">'+x.signal+' · '+pct(x.voteShare)+'</b></div>').join("");
 $("#knnDistances").innerHTML=d.distanceComparison.map(x=>'<div class="knn-krow"><span>'+x.method.toUpperCase()+'</span><b class="'+cls(x.signal)+'">'+x.signal+'</b></div>').join("");
 const c=d.marketContext||{};$("#knnContext").innerHTML='<h3>VADELİ PİYASA BAĞLAMI</h3><div class="knn-krow"><span>Açık pozisyon</span><b>'+num(c.openInterestContracts,2)+'</b></div><div class="knn-krow"><span>Funding</span><b>'+pct(c.fundingRate)+'</b></div><div class="knn-krow"><span>Long/Short hesap oranı</span><b>'+num(c.longShortAccountRatio,3)+'</b></div>';
 $("#knnNeighbors").innerHTML=d.neighbors.slice(0,20).map(x=>'<div class="knn-neighbor"><small>'+date(x.time)+'</small><b>'+x.outcome+'</b><span class="ret '+cls(x.outcome)+'">'+pct(x.forwardReturn)+'</span></div>').join("");
 $("#knnDisclaimer").textContent=(d.limitations||[]).join(" ")+" | "+d.backtest.note;
 status(d.candlesUsed+" kapanmış mum · "+d.trainingExamples+" eğitim örneği · Son kapanış: "+date(d.candleCloseTime)+(d.cached?" · Önbellek":""));
}
async function run(){
 if(busy)return;busy=true;$("#knnRun").disabled=true;status("Binance geçmiş mumları alınıyor, göstergeler ve benzerlikler hesaplanıyor…");
 const q=new URLSearchParams({symbol:$("#knnSymbol").value,timeframe:$("#knnTf").value,k:$("#knnK").value,horizon:$("#knnH").value,distance,history:"2500"});
 try{const r=await fetch(API+"?"+q.toString(),{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Analiz başarısız");render(d)}
 catch(e){status("HATA: "+e.message)}
 finally{busy=false;$("#knnRun").disabled=false}
}
button.type="button";
button.style.position="fixed";button.style.zIndex="2147483646";button.style.pointerEvents="auto";button.style.touchAction="manipulation";
let lastOpenAt=0;
function openKnn(e){
 if(e){e.preventDefault();e.stopPropagation();}
 const now=Date.now();if(now-lastOpenAt<500)return;lastOpenAt=now;
 panel.classList.add("show");panel.style.display="block";panel.style.zIndex="2147483647";
 const sym=$("#symbol")?.value||"BTCUSDT";if(symbols.includes(sym))$("#knnSymbol").value=sym;
 run();
}
button.onclick=openKnn;
button.addEventListener("pointerdown",openKnn,{capture:true});
button.addEventListener("touchstart",openKnn,{capture:true,passive:false});
document.addEventListener("pointerdown",e=>{if(e.target&&e.target.closest&&e.target.closest("#knnOpen"))openKnn(e)},true);
document.addEventListener("touchstart",e=>{if(e.target&&e.target.closest&&e.target.closest("#knnOpen"))openKnn(e)}, {capture:true,passive:false});
document.addEventListener("click",e=>{if(e.target&&e.target.closest&&e.target.closest("#knnOpen"))openKnn(e)},true);
$("#knnClose").addEventListener("click",()=>panel.classList.remove("show"));
$("#knnRun").addEventListener("click",run);
$("#knnDistance").addEventListener("click",()=>{distance=distance==="lorentzian"?"euclidean":"lorentzian";$("#knnDistance").textContent=distance.toUpperCase();run()});
["knnSymbol","knnTf","knnK","knnH"].forEach(id=>$("#"+id).addEventListener("change",run));
})();