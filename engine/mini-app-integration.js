(() => {
  "use strict";
  const STORAGE_KEY = "kt_engine_url";
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d = 2) => Number.isFinite(Number(v)) ? Number(v).toLocaleString("tr-TR", { maximumFractionDigits: d }) : "—";
  const money = (v) => { const n = Number(v); if (!Number.isFinite(n)) return "—"; const a = Math.abs(n); return a >= 1e9 ? (n/1e9).toFixed(2)+"B" : a >= 1e6 ? (n/1e6).toFixed(2)+"M" : a >= 1e3 ? (n/1e3).toFixed(1)+"K" : fmt(n,0); };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const signalLabel = (s) => ({BUY:"AL",SELL:"SAT",WAIT:"BEKLE",INSUFFICIENT_DATA:"VERİ BEKLENİYOR"}[s] || s || "—");
  const signalClass = (s) => s === "BUY" ? "ep-buy" : s === "SELL" ? "ep-sell" : "ep-neutral";
  function mount() {
    if ($("enginePanel")) return;
    const style = document.createElement("style");
    style.textContent = [
      "#enginePanel{margin:12px 0 14px;background:var(--card,#171c23);border:1px solid var(--line,#263040);border-radius:12px;padding:12px}",
      "#enginePanel .ep-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}",
      "#enginePanel .ep-title{font-weight:700;font-size:14px}",
      "#enginePanel .ep-muted{font-size:11px;color:var(--muted,#8a94a3)}",
      "#enginePanel .ep-config{display:flex;gap:6px;margin:10px 0}",
      "#enginePanel input{min-width:0;flex:1;background:#0e1116;color:var(--text,#e6e9ee);border:1px solid var(--line,#263040);border-radius:7px;padding:8px;font-size:12px}",
      "#enginePanel button{white-space:nowrap}",
      "#enginePanel .ep-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}",
      "#enginePanel .ep-box{background:#10151c;border:1px solid #263040;border-radius:8px;padding:9px;min-width:0}",
      "#enginePanel .ep-box b{display:block;font-size:15px;margin-top:4px;overflow-wrap:anywhere}",
      "#enginePanel .ep-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}",
      "#enginePanel .ep-table td{padding:7px 3px;border-bottom:1px solid #222a36}",
      "#enginePanel .ep-table tr:last-child td{border:0}",
      "#enginePanel .ep-right{text-align:right;font-variant-numeric:tabular-nums}",
      "#enginePanel .ep-buy{color:#34d399}#enginePanel .ep-sell{color:#f87171}#enginePanel .ep-neutral{color:#8a94a3}",
      "#enginePanel .ep-section{font-size:11px;color:var(--muted,#8a94a3);text-transform:uppercase;letter-spacing:.4px;margin-top:14px}",
      "#enginePanel .ep-status{display:flex;gap:9px;flex-wrap:wrap;margin-top:8px}",
      "#enginePanel .ep-status span{font-size:11px;color:var(--muted,#8a94a3)}",
      "#enginePanel .ep-status .ok{color:#34d399}#enginePanel .ep-status .bad{color:#f87171}",
      "@media(min-width:760px){#enginePanel .ep-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}"
    ].join("");
    document.head.appendChild(style);
    const panel = document.createElement("section");
    panel.id = "enginePanel";
    panel.innerHTML = '<div class="ep-head"><div class="ep-title">CANLI ANALİZ MOTORU</div><span id="epConnection" class="ep-muted">Sunucu adresi bekleniyor</span></div>' +
      '<div class="ep-config"><input id="epUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://analiz-servisi.onrender.com" aria-label="Analiz motoru sunucu adresi"><button id="epSave" type="button">Bağlan</button></div>' +
      '<div class="ep-muted">Motor sunucusu adresini bir kez girip kaydedin. Bu adres olmadan Mini App, bağımsız analiz servisine erişemez.</div>' +
      '<div id="epExchanges" class="ep-status"></div><div class="ep-grid">' +
      '<div class="ep-box"><span class="ep-muted">BTC fiyatı</span><b id="epPrice">—</b></div>' +
      '<div class="ep-box"><span class="ep-muted">BTC motor sinyali</span><b id="epSignal">—</b></div>' +
      '<div class="ep-box"><span class="ep-muted">Sinyal skoru</span><b id="epScore">—</b></div>' +
      '<div class="ep-box"><span class="ep-muted">Veri kalitesi</span><b id="epQuality">—</b></div></div>' +
      '<div class="ep-section">Coin analizleri</div><table id="epAnalysis" class="ep-table"><tbody><tr><td class="ep-muted">Bağlantı bekleniyor</td></tr></tbody></table>' +
      '<div class="ep-section">Hacim ve destek / direnç sinyalleri</div><table id="epMarketSignals" class="ep-table"><tbody><tr><td class="ep-muted">Veri bekleniyor</td></tr></tbody></table>' +
      '<div class="ep-section">Canlı emir defteri</div><select id="epBookSymbol" aria-label="Emir defteri coin seçimi" style="margin-top:7px;background:#10151c;color:inherit;border:1px solid #263040;border-radius:7px;padding:7px;width:100%"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option><option>BNBUSDT</option><option>XRPUSDT</option><option>DOGEUSDT</option></select><div class="ep-muted" id="epBookUpdated">WebSocket bekleniyor</div><table id="epOrderBook" class="ep-table"><tbody><tr><td class="ep-muted">Emir defteri bekleniyor</td></tr></tbody></table>' +
      '<div class="ep-section">Canlı balina işlemleri</div><div class="ep-muted" id="epWhaleUpdated">WebSocket bekleniyor</div><table id="epWhales" class="ep-table"><tbody><tr><td class="ep-muted">Bağlantı bekleniyor</td></tr></tbody></table>' +
      '<div class="ep-section">Son likidasyonlar</div><table id="epLiquidations" class="ep-table"><tbody><tr><td class="ep-muted">Bağlantı bekleniyor</td></tr></tbody></table>' +
      '<div class="ep-muted" id="epUpdated" style="margin-top:9px">Henüz veri alınmadı.</div>';
    const tabs = document.querySelector("nav.tabs");
    if (tabs) tabs.insertAdjacentElement("afterend", panel); else document.body.insertBefore(panel, document.body.firstChild);
    $("epUrl").value = localStorage.getItem(STORAGE_KEY) || new URLSearchParams(location.search).get("engine") || "";
    $("epSave").addEventListener("click", connectFromInput);
    $("epBookSymbol").addEventListener("change", drawOrderBook);
    $("epUrl").addEventListener("keydown", e => { if (e.key === "Enter") connectFromInput(); });
    if ($("epUrl").value.trim()) connectFromInput();
  }
  let baseUrl = "", socket = null, reconnectTimer = null, pollTimer = null, reconnectDelay = 1000;
  function setConnection(text, ok = false) { const el=$("epConnection"); if (!el) return; el.textContent=text; el.className="ep-muted "+(ok?"ep-buy":""); }
  function normalizeUrl(raw) {
    const u = new URL(raw);
    if (!["http:","https:"].includes(u.protocol)) throw new Error("Adres http veya https olmalı.");
    if (location.protocol === "https:" && u.protocol !== "https:") throw new Error("HTTPS Mini App, HTTPS analiz adresi gerektirir.");
    return u.origin;
  }
  function connectFromInput() {
    try { baseUrl=normalizeUrl($("epUrl").value.trim()); }
    catch(e) { setConnection(e.message); return; }
    localStorage.setItem(STORAGE_KEY,baseUrl);
    if(socket) socket.close(); clearTimeout(reconnectTimer); clearInterval(pollTimer);
    connectSocket(); refresh(); pollTimer=setInterval(refresh,15000);
  }
  function connectSocket() {
    if(!baseUrl) return;
    const url=baseUrl.replace(/^https:/,"wss:").replace(/^http:/,"ws:")+"/stream";
    try { socket=new WebSocket(url); } catch(e) { setConnection("WebSocket açılamadı"); scheduleReconnect(); return; }
    socket.addEventListener("open",()=>{reconnectDelay=1000;setConnection("Canlı bağlantı açık",true);});
    socket.addEventListener("message",e=>{
      try {
        const p=JSON.parse(e.data);
        if(p.type==="snapshot") renderSnapshot(p.data);
        else if(p.type==="analysis") renderAnalysis(p.data);
        else if(p.type==="marketSignals") renderMarketSignals(p.data);
        else if(p.type==="market") renderLiveMarket(p.data);
        else if(p.type==="trade") renderLiveTrade(p.data);
        else if(p.type==="whale") prependLiveWhale(p.data);
        else if(p.type==="liquidation") prependLiveLiquidation(p.data);
        else if(p.type==="connection") renderExchangeStatus({[p.data.exchange]:p.data});
      } catch(_) {}
    });
    socket.addEventListener("close",()=>{setConnection("Canlı bağlantı kesildi; yeniden deneniyor");scheduleReconnect();});
    socket.addEventListener("error",()=>setConnection("WebSocket bağlantı hatası"));
  }
  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer=setTimeout(()=>{if(socket) socket.close();connectSocket();reconnectDelay=Math.min(reconnectDelay*2,30000);},reconnectDelay);
  }
  async function api(path) {
    const r=await fetch(baseUrl+path,{headers:{Accept:"application/json"},cache:"no-store"});
    if(!r.ok) throw new Error("API HTTP "+r.status);
    return r.json();
  }
  async function refresh() {
    if(!baseUrl) return;
    try {
      const [health,snapshot,whales,liqs]=await Promise.all([
        api("/api/v1/health"),api("/api/v1/snapshot"),api("/api/v1/whales?limit=12"),api("/api/v1/liquidations?limit=12")
      ]);
      renderExchangeStatus(health.exchanges);renderSnapshot(snapshot);renderWhales(whales);renderLiquidations(liqs);
      setConnection("API bağlı · "+Math.floor(health.uptimeSeconds||0)+" sn çalışma",true);
      $("epUpdated").textContent="Son veri: "+new Date().toLocaleTimeString("tr-TR");
    } catch(e) { setConnection("API erişilemiyor: "+e.message); }
  }
  function renderExchangeStatus(exchanges) {
    if(!exchanges) return;
    $("epExchanges").innerHTML=Object.entries(exchanges).map(([k,v])=>'<span class="'+(v.connected?"ok":"bad")+'">'+
      (k==="binanceSpot"?"Binance Spot":k==="binanceFutures"?"Binance Futures":k==="bybitLinear"?"Bybit":esc(k))+": "+(v.connected?"Bağlı":"Kesik")+"</span>").join("");
  }
  function renderSnapshot(s) {
    if(!s) return;renderExchangeStatus(s.exchanges);
    const m=s.markets||{},btc=m.BTCUSDT||{};
    const p=btc.binanceFutures?.lastPrice||btc.binanceSpot?.lastPrice||btc.bybitLinear?.lastPrice||btc.binanceFutures?.candle1m?.close||btc.binanceSpot?.candle1m?.close;
    if(p!=null) $("epPrice").textContent=fmt(p,Number(p)<1?6:2)+" USDT";
    renderAnalysis(s.analysis||[]);renderMarketSignals(s.marketSignals||[]);
    if(s.latestWhales) renderWhales(s.latestWhales);
    if(s.latestLiquidations) renderLiquidations(s.latestLiquidations);
    if(m.BTCUSDT) {
      renderLiveMarket({symbol:"BTCUSDT",exchange:"binanceSpot",...m.BTCUSDT.binanceSpot});
      renderLiveMarket({symbol:"BTCUSDT",exchange:"binanceFutures",...m.BTCUSDT.binanceFutures});
      renderLiveMarket({symbol:"BTCUSDT",exchange:"bybitLinear",...m.BTCUSDT.bybitLinear});
    }
  }
  function renderAnalysis(items) {
    if(!Array.isArray(items)) return;
    const btc=items.find(x=>x.symbol==="BTCUSDT");
    if(btc){$("epSignal").textContent=signalLabel(btc.signal);$("epSignal").className=signalClass(btc.signal);$("epScore").textContent=fmt(btc.score,0)+" / 100";$("epQuality").textContent=btc.quality||"—";}
    $("epAnalysis").innerHTML=items.map(x=>"<tr><td>"+esc(x.symbol)+"</td><td class='"+signalClass(x.signal)+"'>"+esc(signalLabel(x.signal))+"</td><td class='ep-right'>"+fmt(x.score,0)+"</td><td class='ep-right'>"+esc(x.quality||"—")+"</td></tr>").join("")||'<tr><td class="ep-muted">Analiz verisi yok</td></tr>';
  }
  function renderMarketSignals(items) {
    if(!Array.isArray(items)) return;
    $("epMarketSignals").innerHTML=items.map(x=>{
      const flags=[];
      if(x.breakout) flags.push("Hacimli yukarı kırılım");
      if(x.breakdown) flags.push("Hacimli aşağı kırılım");
      if(x.abnormalVolume) flags.push("Anormal hacim");
      if(!flags.length) flags.push(x.status==="READY"?"Belirgin kırılım yok":"Isınıyor");
      return "<tr><td>"+esc(x.symbol)+"</td><td>"+esc(flags.join(" · "))+"</td><td class='ep-right'>D: "+fmt(x.support,2)+"</td><td class='ep-right'>R: "+fmt(x.resistance,2)+"</td></tr>";
    }).join("")||'<tr><td class="ep-muted">Piyasa sinyali yok</td></tr>';
  }
  let liveWhales=[], liveLiquidations=[];
  const exchangeLabel = (x) => x==="binanceSpot"?"Binance Spot":x==="binanceFutures"?"Binance Futures":x==="bybitLinear"?"Bybit":x||"—";
  function renderWhales(items) {
    if(!Array.isArray(items)) return;
    liveWhales=items.slice(0,50);
    drawWhales();
  }
  function drawWhales() {
    $("epWhales").innerHTML=liveWhales.slice(0,12).map(x=>"<tr><td>"+esc(x.symbol)+" · "+esc(x.exchange||"—")+"</td><td class='"+(x.side==="BUY"?"ep-buy":"ep-sell")+"'>"+esc(x.side||"—")+"</td><td class='ep-right'>"+money(x.quoteValue)+" USDT</td></tr>").join("")||'<tr><td class="ep-muted">Henüz eşik üstü işlem yok</td></tr>';
  }
  function prependLiveWhale(item) {
    if(!item) return;
    liveWhales=[item,...liveWhales.filter(x=>!(x.timestamp===item.timestamp&&x.symbol===item.symbol&&x.exchange===item.exchange&&x.quoteValue===item.quoteValue))].slice(0,50);
    drawWhales();
    const el=$("epWhaleUpdated"); if(el) el.textContent="Son balina olayı: "+new Date().toLocaleTimeString("tr-TR",{hour12:false});
  }
  function renderLiquidations(items) {
    if(!Array.isArray(items)) return;
    liveLiquidations=items.slice(0,50);
    drawLiquidations();
  }
  function drawLiquidations() {
    $("epLiquidations").innerHTML=liveLiquidations.slice(0,12).map(x=>"<tr><td>"+esc(x.symbol)+" · "+esc(x.exchange||"—")+"</td><td>"+esc(x.side||"—")+"</td><td class='ep-right'>"+money(x.quoteValue)+" USDT</td></tr>").join("")||'<tr><td class="ep-muted">Henüz likidasyon verisi yok</td></tr>';
  }
  function prependLiveLiquidation(item) {
    if(!item) return;
    liveLiquidations=[item,...liveLiquidations].slice(0,50);
    drawLiquidations();
  }
  function renderLiveTrade(trade) {
    if(!trade || trade.symbol!=="BTCUSDT") return;
    $("epPrice").textContent=fmt(trade.price,Number(trade.price)<1?6:2)+" USDT";
  }
  const books={};
  function renderLiveMarket(data) {
    if(!data || !data.symbol) return;
    if(data.bids || data.asks) {
      books[data.symbol]=books[data.symbol]||{};
      books[data.symbol][data.exchange]=data;
      if(data.symbol===selectedBookSymbol()) drawOrderBook();
    }
    if(data.symbol==="BTCUSDT" && data.candle1m?.close) {
      $("epPrice").textContent=fmt(data.candle1m.close,2)+" USDT";
    }
  }
  function selectedBookSymbol() { return $("epBookSymbol")?.value || "BTCUSDT"; }
  function drawOrderBook() {
    const selected=selectedBookSymbol();
    const symbolBooks=books[selected]||{};
    const rows=[];
    for(const key of ["binanceSpot","binanceFutures","bybitLinear"]) {
      const book=symbolBooks[key];
      if(!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) continue;
      const bids=book.bids.slice().sort((a,b)=>b[0]-a[0]).slice(0,5);
      const asks=book.asks.slice().sort((a,b)=>a[0]-b[0]).slice(0,5);
      const bidQty=bids.reduce((sum,x)=>sum+Number(x[1]||0),0);
      const askQty=asks.reduce((sum,x)=>sum+Number(x[1]||0),0);
      const total=bidQty+askQty;
      const imbalance=total>0?((bidQty-askQty)/total*100):0;
      rows.push("<tr><td colspan='3'><b>"+exchangeLabel(key)+"</b> · Defter dengesi: <span class='"+(imbalance>=0?"ep-buy":"ep-sell")+"'>"+fmt(imbalance,1)+"%</span></td></tr>");
      rows.push("<tr><td class='ep-sell'>SATIŞ</td><td class='ep-right'>Fiyat</td><td class='ep-right'>Miktar</td></tr>");
      asks.slice().reverse().forEach(x=>rows.push("<tr><td class='ep-sell'>ASK</td><td class='ep-right'>"+fmt(x[0],2)+"</td><td class='ep-right'>"+fmt(x[1],5)+"</td></tr>"));
      rows.push("<tr><td class='ep-buy'>ALIŞ</td><td class='ep-right'>Fiyat</td><td class='ep-right'>Miktar</td></tr>");
      bids.forEach(x=>rows.push("<tr><td class='ep-buy'>BID</td><td class='ep-right'>"+fmt(x[0],2)+"</td><td class='ep-right'>"+fmt(x[1],5)+"</td></tr>"));
    }
    $("epOrderBook").innerHTML=rows.join("")||'<tr><td class="ep-muted">Emir defteri verisi bekleniyor</td></tr>';
    $("epBookUpdated").textContent=selected+" · Son defter güncellemesi: "+new Date().toLocaleTimeString("tr-TR",{hour12:false});
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",mount); else mount();
})();