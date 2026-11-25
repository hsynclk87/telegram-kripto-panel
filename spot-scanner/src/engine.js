import WebSocket from "ws";
import { zScore, pctChange, clamp, weightedScore } from "./math.js";

const REST = process.env.BINANCE_REST_URL || "https://api.binance.com";
const WS = process.env.BINANCE_WS_URL || "wss://stream.binance.com:9443/stream";
const n = (v) => Number(v || 0);
const now = () => Date.now();

export class SpotScanner {
  constructor({ journal, onAlert = async () => {} }) {
    this.journal = journal; this.onAlert = onAlert;
    this.symbols = []; this.states = new Map(); this.sockets = []; this.reconnectTimers = new Set();
    this.lastAlert = new Map(); this.connected = false; this.startedAt = now();
    this.universeUpdatedAt = null; this.lastMessageAt = null; this.reconnectTimer = null;
    this.scanTimer = null; this.outcomeTimer = null; this.stopping = false;
    this.universeSize = Number(process.env.UNIVERSE_SIZE || 100);
    this.minVolume = Number(process.env.MIN_QUOTE_VOLUME_USDT || 1000000);
    this.cooldown = Number(process.env.ALERT_COOLDOWN_MS || 900000);
    this.earlyThreshold = Number(process.env.EARLY_SCORE_THRESHOLD || 55);
    this.strongThreshold = Number(process.env.STRONG_SCORE_THRESHOLD || 70);
    this.maxMove = Number(process.env.MAX_1M_PRICE_CHANGE_PCT || 0.8);
  }
  state(symbol) {
    if (!this.states.has(symbol)) this.states.set(symbol, {
      trades: [], book: null, depth: null, price: 0, baseline: [], lastSampleAt: 0,
      lastSignalAt: 0, lastCvd: 0, samples: []
    });
    return this.states.get(symbol);
  }
  async refreshUniverse() {
    const [infoRes, tickRes] = await Promise.all([
      fetch(REST + "/api/v3/exchangeInfo"), fetch(REST + "/api/v3/ticker/24hr")
    ]);
    if (!infoRes.ok || !tickRes.ok) throw new Error("Binance universe HTTP error");
    const info = await infoRes.json(), tickers = await tickRes.json();
    const eligible = new Set(info.symbols.filter(s => s.status === "TRADING" && s.quoteAsset === "USDT" && s.isSpotTradingAllowed && !/(UP|DOWN|BULL|BEAR)USDT$/.test(s.symbol)).map(s => s.symbol));
    this.symbols = tickers.filter(t => eligible.has(t.symbol) && n(t.quoteVolume) >= this.minVolume)
      .sort((a,b) => n(b.quoteVolume) - n(a.quoteVolume)).slice(0, this.universeSize).map(t => t.symbol.toLowerCase());
    this.universeUpdatedAt = now();
    return this.symbols;
  }
  connect() {
    if (this.stopping || !this.symbols.length) return;
    for (const timer of this.reconnectTimers) clearTimeout(timer);
    this.reconnectTimers.clear();
    for (const socket of this.sockets) {
      socket.removeAllListeners();
      try { socket.terminate(); } catch {}
    }
    this.sockets = [];
    const streams = this.symbols.flatMap(s => [s+"@aggTrade", s+"@bookTicker", s+"@depth5@100ms"]);
    // Keep combined-stream URLs short and isolate reconnects by chunk.
    for (let i=0;i<streams.length;i+=50) this.connectChunk(streams.slice(i,i+50));
  }
  connectChunk(streams) {
    if (this.stopping || !streams.length) return;
    const socket = new WebSocket(WS + "?streams=" + streams.join("/"));
    this.sockets = this.sockets.filter(s => s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING);
    this.sockets.push(socket);
    socket.on("open", () => { this.connected = true; });
    socket.on("message", raw => {
      this.lastMessageAt = now();
      try { const packet = JSON.parse(raw.toString()); this.handle(packet.data); } catch {}
    });
    socket.on("close", () => {
      this.connected = this.sockets.some(s => s.readyState === WebSocket.OPEN);
      this.scheduleReconnect(streams);
    });
    socket.on("error", () => { this.connected = this.sockets.some(s => s.readyState === WebSocket.OPEN); });
  }
  scheduleReconnect(streams) {
    if (this.stopping) return;
    const timer=setTimeout(() => {
      this.reconnectTimers.delete(timer);
      this.connectChunk(streams);
    },3000);
    this.reconnectTimers.add(timer);
  }
  handle(d) {
    if (!d?.s) return;
    const symbol = d.s.toUpperCase(), st = this.state(symbol), t = now();
    if (d.e === "aggTrade") {
      const qty = n(d.q), price = n(d.p), notional = qty * price;
      const buyerIsMaker = Boolean(d.m);
      st.trades.push({ ts: t, price, notional, buy: !buyerIsMaker });
      st.price = price;
      const cutoff = t - 65000;
      while (st.trades.length && st.trades[0].ts < cutoff) st.trades.shift();
    } else if (d.e === "bookTicker" || (typeof d.b === "string" && typeof d.a === "string" && d.B !== undefined)) {
      const bid = n(d.b), ask = n(d.a), bidQty = n(d.B), askQty = n(d.A);
      st.book = { bid, ask, bidQty, askQty, spreadPct: bid > 0 && ask > 0 ? (ask - bid) / ((ask + bid) / 2) * 100 : 0, ts: t };
    } else if (d.e === "depthUpdate" || d.lastUpdateId) {
      const bids = d.bids || d.b || [], asks = d.asks || d.a || [];
      st.depth = { bids: bids.map(x => [n(x[0]),n(x[1])]), asks: asks.map(x => [n(x[0]),n(x[1])]), ts: t };
    }
  }
  windowMetrics(st, seconds) {
    const cutoff = now() - seconds * 1000, rows = st.trades.filter(x => x.ts >= cutoff);
    const buys = rows.filter(x => x.buy).reduce((s,x)=>s+x.notional,0);
    const sells = rows.filter(x => !x.buy).reduce((s,x)=>s+x.notional,0);
    const prices = rows.map(x=>x.price);
    const first = prices[0] || st.price, last = prices.at(-1) || st.price;
    return { count: rows.length, tps: rows.length / seconds, buys, sells, volume: buys+sells, cvd: buys-sells,
      buyRatio: buys+sells ? buys/(buys+sells)*100 : 50, avgTrade: rows.length ? (buys+sells)/rows.length : 0,
      priceChangePct: pctChange(first,last), firstPrice:first, lastPrice:last };
  }
  absorption(st, m10) {
    if (!st.book || !m10.volume) return { type:"none", confidence:0 };
    const book = st.depth;
    const bidDepth = book?.bids?.reduce((s,x)=>s+x[0]*x[1],0) ?? st.book.bid*st.book.bidQty;
    const askDepth = book?.asks?.reduce((s,x)=>s+x[0]*x[1],0) ?? st.book.ask*st.book.askQty;
    const depthTotal = bidDepth+askDepth;
    const obi = depthTotal ? (bidDepth-askDepth)/depthTotal : 0;
    const buyStall = m10.cvd > 0 && m10.priceChangePct < 0.04 && askDepth > bidDepth*1.15;
    const sellStall = m10.cvd < 0 && m10.priceChangePct > -0.04 && bidDepth > askDepth*1.15;
    if (buyStall) return { type:"seller_absorbing_buys", confidence:clamp(Math.abs(m10.cvd)/Math.max(m10.volume,1),0,1), obi };
    if (sellStall) return { type:"buyers_absorbing_sells", confidence:clamp(Math.abs(m10.cvd)/Math.max(m10.volume,1),0,1), obi };
    return { type:"none", confidence:0, obi };
  }
  metrics(symbol) {
    const st = this.state(symbol), m5=this.windowMetrics(st,5), m10=this.windowMetrics(st,10), m30=this.windowMetrics(st,30), m60=this.windowMetrics(st,60);
    const book=st.book;
    const sample = { tps:m10.tps, volume:m10.volume, count:m10.count, spread:book?.spreadPct ?? 0 };
    if (now()-st.lastSampleAt >= 5000 && m10.count > 0) {
      st.baseline.push(sample); if (st.baseline.length>60) st.baseline.shift(); st.lastSampleAt=now();
    }
    const zTps=zScore(m10.tps,st.baseline.map(x=>x.tps));
    const zVol=zScore(m10.volume,st.baseline.map(x=>x.volume));
    const zCount=zScore(m10.count,st.baseline.map(x=>x.count));
    const zIntensity={value:zVol.ready&&zCount.ready?zVol.value-zCount.value:0,ready:zVol.ready&&zCount.ready};
    const avgSpread=st.baseline.length?st.baseline.reduce((s,x)=>s+x.spread,0)/st.baseline.length:0;
    const spreadCompression=avgSpread>0&&book?clamp((avgSpread-book.spreadPct)/avgSpread,-1,1):0;
    const absorption=this.absorption(st,m10);
    const cvdAcceleration=m10.cvd-m30.cvd/3;
    const maxMove=Math.abs(m60.priceChangePct);
    const parts=[
      {weight:15,score:clamp((zTps.value-1)/3,0,1)},
      {weight:20,score:clamp((m10.cvd>0?m10.cvd/Math.max(m10.volume,1):0)*2,0,1)},
      {weight:10,score:clamp((m10.buyRatio-50)/25,0,1)},
      {weight:15,score:clamp((zIntensity.value-0.5)/3,0,1)},
      {weight:10,score:clamp(spreadCompression*2,0,1)},
      {weight:10,score:clamp(((absorption.obi??0)+1)/2,0,1)},
      {weight:15,score:clamp((absorption.type==="buyers_absorbing_sells"?absorption.confidence:0),0,1)},
      {weight:5,score:clamp(1-maxMove/this.maxMove,0,1)}
    ];
    const score=weightedScore(parts);
    return { symbol, price:st.price, score, class:score>=this.strongThreshold?"strong":score>=this.earlyThreshold?"early":"normal",
      windows:{s5:m5,s10:m10,s30:m30,s60:m60}, z:{tps:zTps,intensity:zIntensity,volume:zVol,count:zCount},
      spreadPct:book?.spreadPct??null, spreadCompressionPct:spreadCompression*100,
      orderBookImbalance:absorption.obi??null, absorption, cvdAcceleration,
      baselineReady:zTps.ready&&zIntensity.ready, updatedAt:now() };
  }
  async scan() {
    const results=this.symbols.map(s=>this.metrics(s)).sort((a,b)=>b.score-a.score);
    for (const r of results) {
      if (!r.baselineReady || r.class==="normal" || Math.abs(r.windows.s60.priceChangePct)>this.maxMove) continue;
      const last=this.lastAlert.get(r.symbol)||0;
      if (now()-last<this.cooldown) continue;
      this.lastAlert.set(r.symbol,now());
      const row={type:"signal",id:r.symbol+"-"+now(),createdAt:now(),...r,outcomes:{maturedAt:null}};
      await this.journal.add(row);
      await this.onAlert(row);
    }
    await this.updateOutcomes();
    return results;
  }
  async updateOutcomes() {
    const marks=[5,15,30,60];
    for (const row of this.journal.rows) {
      if (row.type!=="signal") continue;
      const st=this.state(row.symbol), age=now()-row.createdAt;
      row.outcomes ??= { marks:{}, highPrice:row.price, lowPrice:row.price, mfePct:0, maePct:0 };
      row.outcomes.marks ??= {};
      if (st.price>0) {
        row.outcomes.highPrice=Math.max(row.outcomes.highPrice||row.price,st.price);
        row.outcomes.lowPrice=Math.min(row.outcomes.lowPrice||row.price,st.price);
        row.outcomes.mfePct=Math.max(0,pctChange(row.price,row.outcomes.highPrice));
        row.outcomes.maePct=Math.min(0,pctChange(row.price,row.outcomes.lowPrice));
      }
      for (const minute of marks) {
        if (age<minute*60000 || row.outcomes.marks[minute]) continue;
        try {
          const res=await fetch(REST+"/api/v3/ticker/price?symbol="+row.symbol);
          if(!res.ok) continue;
          const current=n((await res.json()).price);
          const mark={type:"mark",signalId:row.id,symbol:row.symbol,minute,createdAt:now(),price:current,
            returnPct:pctChange(row.price,current),highPrice:Math.max(row.outcomes.highPrice||row.price,current),
            lowPrice:Math.min(row.outcomes.lowPrice||row.price,current),mfePct:Math.max(row.outcomes.mfePct||0,pctChange(row.price,current)),
            maePct:Math.min(row.outcomes.maePct||0,pctChange(row.price,current))};
          await this.journal.add(mark);
        } catch(e) { console.error("outcome",row.symbol,e.message); }
      }
    }
  }
  async start() {
    await this.refreshUniverse(); this.connect();
    this.scanTimer=setInterval(()=>this.scan().catch(e=>console.error("scan",e.message)),Number(process.env.SCAN_INTERVAL_MS||5000));
    setInterval(()=>this.refreshUniverse().then(()=>this.connect()).catch(e=>console.error("universe",e.message)),3600000);
  }
  status() { return { service:"project-7-spot-scanner",connected:this.connected,universeSize:this.symbols.length,universeUpdatedAt:this.universeUpdatedAt,lastMessageAt:this.lastMessageAt,uptimeMs:now()-this.startedAt,signals:this.journal.rows.filter(x=>x.type==="signal").length }; }
  stop() { this.stopping=true; clearInterval(this.scanTimer); for(const timer of this.reconnectTimers) clearTimeout(timer); this.reconnectTimers.clear(); for(const socket of this.sockets) socket.close(); }
}
