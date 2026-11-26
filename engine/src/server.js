import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeKnn } from "./knn.js";
const PORT=Number(process.env.PORT||8080),HOST=process.env.HOST||"0.0.0.0";
const INDEX=resolve(fileURLToPath(new URL("../public/index.html",import.meta.url)));
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, HEAD, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store"};
function send(res,status,data){res.writeHead(status,{...cors,"Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data))}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url||"/","http://localhost"),path=url.pathname;
 if(req.method==="OPTIONS"){res.writeHead(204,cors);return res.end()}
 if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,{error:"Method Not Allowed"});
 if(path==="/health")return send(res,200,{ok:true,service:"telegram-live-price-mini-app",modules:["knn-market-intelligence"]});
 if(path==="/api/knn"){try{return send(res,200,await analyzeKnn({symbol:url.searchParams.get("symbol")||"BTCUSDT",timeframe:url.searchParams.get("timeframe")||"15m",k:url.searchParams.get("k")||10,horizon:url.searchParams.get("horizon")||5,distanceType:url.searchParams.get("distance")||"lorentzian",history:url.searchParams.get("history")||2500}))}catch(e){return send(res,400,{error:e.message||"KNN analysis failed"})}}
 if(path!=="/"&&path!=="/index.html")return send(res,404,{error:"Not Found"});
 try{const html=await readFile(INDEX);res.writeHead(200,{...cors,"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, no-cache, must-revalidate"});return req.method==="HEAD"?res.end():res.end(html)}
 catch(e){return send(res,500,{error:"Mini App yüklenemedi: "+e.message})}
});
server.listen(PORT,HOST,()=>console.log("Telegram analysis engine listening on "+HOST+":"+PORT));
