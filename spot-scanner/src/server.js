import http from "node:http";
import { URL } from "node:url";
import { Journal } from "./store.js";
import { SpotScanner } from "./engine.js";

const PORT=Number(process.env.PORT||8090), HOST=process.env.HOST||"0.0.0.0";
const journal=new Journal(process.env.DATA_DIR||"./data");
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const token=process.env.TELEGRAM_BOT_TOKEN, allowedChat=String(process.env.TELEGRAM_CHAT_ID||"");
async function telegram(text, chat=allowedChat) {
  if(!token||!chat) return;
  const res=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chat,text,parse_mode:"HTML",disable_web_page_preview:true})});
  if(!res.ok) console.error("Telegram send failed",res.status,await res.text());
}
const scanner=new SpotScanner({journal,onAlert:async r=>{
  const m=r.windows.s10;
  await telegram("🔎 <b>SPOT SCANNER — "+(r.class==="strong"?"GÜÇLÜ ERKEN ADAY":"ERKEN ADAY")+"</b>\n<b>"+esc(r.symbol)+"</b>\nPuan: <b>"+r.score+"/100</b>\nFiyat: "+r.price+"\nTPS Z: "+r.z.tps.value.toFixed(2)+"\nCVD 10s: "+Math.round(m.cvd).toLocaleString("en-US")+" USDT\nBuy Ratio: "+m.buyRatio.toFixed(1)+"%\nIntensity Z: "+r.z.intensity.value.toFixed(2)+"\nSpread: "+(r.spreadPct??0).toFixed(4)+"%\nAbsorpsiyon: "+r.absorption.type+"\nDurum: İzle — otomatik işlem yapılmaz");
}});
await journal.init();

const json=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"});res.end(JSON.stringify(data));};
const fmtSignal=r=>"<b>"+esc(r.symbol)+"</b> — "+r.score+"/100 — "+r.price+" — "+r.absorption.type;
async function handleTelegramCommand(message) {
  const chat=String(message.chat?.id||"");
  if(allowedChat && chat!==allowedChat) return;
  const [command,...args]=String(message.text||"").trim().split(/\s+/);
  const cmd=(command||"").split("@")[0].toLowerCase();
  if(cmd==="/start"||cmd==="/help") return telegram(
    "<b>PROJECT 7 — SPOT SCANNER</b>\n/durum — bağlantı durumu\n/tarama — anlık sıralama\n/erken — erken adaylar\n/coin BTCUSDT — coin ölçümleri\n/performans — sinyal sonuçları",chat);
  if(cmd==="/durum") {
    const s=scanner.status();
    return telegram("<b>SPOT SCANNER DURUM</b>\nBağlantı: "+(s.connected?"Bağlı":"Bağlantı bekleniyor")+"\nParite: "+s.universeSize+"\nSinyal: "+s.signals+"\nSon veri: "+(s.lastMessageAt?new Date(s.lastMessageAt).toISOString():"Henüz yok"),chat);
  }
  if(cmd==="/tarama"||cmd==="/erken") {
    const rows=cmd==="/tarama"?await scanner.scan():journal.recent(30);
    const list=(Array.isArray(rows)?rows:[]).filter(r=>cmd==="/tarama"?r.class!=="normal":true).slice(0,10);
    return telegram("<b>"+(cmd==="/tarama"?"ANLIK TARAMA":"SON ERKEN SİNYALLER")+"</b>\n"+(list.length?list.map(fmtSignal).join("\n"):"Şu anda eşik üstü aday yok."),chat);
  }
  if(cmd==="/coin") {
    const symbol=(args[0]||"").toUpperCase();
    if(!/^[A-Z0-9]{4,20}$/.test(symbol)) return telegram("Kullanım: /coin BTCUSDT",chat);
    const r=scanner.metrics(symbol),m=r.windows.s10;
    return telegram("<b>"+esc(symbol)+"</b>\nPuan: "+r.score+"/100\nFiyat: "+r.price+"\nTPS Z: "+r.z.tps.value.toFixed(2)+"\nCVD 10s: "+Math.round(m.cvd)+" USDT\nBuy Ratio: "+m.buyRatio.toFixed(1)+"%\nIntensity Z: "+r.z.intensity.value.toFixed(2)+"\nSpread: "+(r.spreadPct??0).toFixed(4)+"%\nAbsorpsiyon: "+r.absorption.type+"\nBaseline: "+(r.baselineReady?"Hazır":"Isınıyor"),chat);
  }
  if(cmd==="/performans") {
    const p=journal.performance();
    return telegram("<b>SİNYAL PERFORMANSI</b>\nToplam: "+p.totalSignals+"\n60 dk sonucu oluşan: "+p.maturedSignals+"\nPozitif 60 dk: "+p.positive60m+"\nPozitif oran: "+(p.hitRate60mPct??"—")+"%\nOrtalama getiri: "+(p.averageReturn60mPct??"—")+"%\nOrtalama MFE: "+(p.averageMfePct??"—")+"%\nOrtalama MAE: "+(p.averageMaePct??"—")+"%",chat);
  }
}
let updateOffset=0, polling=false;
async function pollTelegram() {
  if(!token||polling) return;
  polling=true;
  while(true) {
    try {
      const url="https://api.telegram.org/bot"+token+"/getUpdates?timeout=25&offset="+updateOffset;
      const res=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if(!res.ok) throw new Error("Telegram polling HTTP "+res.status);
      const data=await res.json();
      if(data.ok) for(const update of data.result||[]) {
        updateOffset=update.update_id+1;
        if(update.message?.text) await handleTelegramCommand(update.message);
      }
    } catch(e) { console.error("Telegram polling:",e.message); await new Promise(r=>setTimeout(r,3000)); }
  }
}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url||"/","http://localhost"), path=u.pathname;
  if(req.method==="OPTIONS"){res.writeHead(204,{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"});return res.end();}
  if(req.method==="GET"&&path==="/health") return json(res,200,{ok:true,...scanner.status()});
  if(req.method==="GET"&&path==="/api/status") return json(res,200,scanner.status());
  if(req.method==="GET"&&path==="/api/universe") return json(res,200,{symbols:scanner.symbols,updatedAt:scanner.universeUpdatedAt});
  if(req.method==="GET"&&path==="/api/signals") return json(res,200,journal.recent(Math.min(200,Number(u.searchParams.get("limit")||30))));
  if(req.method==="GET"&&path==="/api/performance") return json(res,200,journal.performance());
  if(req.method==="GET"&&path.startsWith("/api/metrics/")) {
    const symbol=decodeURIComponent(path.split("/").at(-1)).toUpperCase();
    if(!/^[A-Z0-9]{4,20}$/.test(symbol)) return json(res,400,{error:"Invalid symbol"});
    return json(res,200,scanner.metrics(symbol));
  }
  if(req.method==="POST"&&path==="/api/scan") return json(res,200,{results:await scanner.scan()});
  if(req.method==="GET"&&path==="/") {res.writeHead(200,{"content-type":"text/plain; charset=utf-8"});return res.end("Project 7 Spot Scanner API");}
  return json(res,404,{error:"Not found"});
});
server.listen(PORT,HOST,()=>console.log("Project 7 Spot Scanner listening on "+HOST+":"+PORT));
pollTelegram();
await scanner.start();
process.on("SIGTERM",()=>{scanner.stop();server.close();process.exit(0);});
process.on("SIGINT",()=>{scanner.stop();server.close();process.exit(0);});
