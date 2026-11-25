import http from "node:http";
import { URL } from "node:url";
import { Journal } from "./store.js";
import { SpotScanner } from "./engine.js";

const PORT=Number(process.env.PORT||8090), HOST=process.env.HOST||"0.0.0.0";
const journal=new Journal(process.env.DATA_DIR||"./data");
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
async function telegram(text) {
  const token=process.env.TELEGRAM_BOT_TOKEN, chat=process.env.TELEGRAM_CHAT_ID;
  if(!token||!chat) return;
  const res=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chat,text,parse_mode:"HTML",disable_web_page_preview:true})});
  if(!res.ok) console.error("Telegram send failed",res.status);
}
const scanner=new SpotScanner({journal,onAlert:async r=>{
  const m=r.windows.s10;
  await telegram("🔎 <b>SPOT SCANNER — "+(r.class==="strong"?"GÜÇLÜ ERKEN ADAY":"ERKEN ADAY")+"</b>\n<b>"+esc(r.symbol)+"</b>\nPuan: <b>"+r.score+"/100</b>\nFiyat: "+r.price+"\nTPS Z: "+r.z.tps.value.toFixed(2)+"\nCVD 10s: "+Math.round(m.cvd).toLocaleString("en-US")+" USDT\nBuy Ratio: "+m.buyRatio.toFixed(1)+"%\nIntensity Z: "+r.z.intensity.value.toFixed(2)+"\nSpread: "+(r.spreadPct??0).toFixed(4)+"%\nAbsorpsiyon: "+r.absorption.type+"\nDurum: İzle — otomatik işlem yapılmaz");
}});
await journal.init();
const json=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"});res.end(JSON.stringify(data));};
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
await scanner.start();
process.on("SIGTERM",()=>{scanner.stop();server.close();});
process.on("SIGINT",()=>{scanner.stop();server.close();});
