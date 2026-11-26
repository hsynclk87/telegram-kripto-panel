import test from "node:test";
import assert from "node:assert/strict";
import { calc, ema, pivots, divergences, normalizeKlines, clusterSignals, defs, directionalIds, directionalDefs } from "../public/analysis-core.js";

function syntheticRows(length=220){
 return Array.from({length},(_,i)=>{
  const close=100+i*.08+Math.sin(i/4)*2+Math.sin(i/13)*1.4;
  const open=close-Math.sin(i/3)*.7;
  const high=Math.max(open,close)+.8+Math.abs(Math.sin(i))*0.2;
  const low=Math.min(open,close)-.8-Math.abs(Math.cos(i))*.2;
  const volume=1000+(i%17)*37;
  const quoteVolume=volume*close;
  return {t:(i+1)*900000,o:open,h:high,l:low,c:close,v:volume,closeTime:(i+1)*900000+899999,quoteVolume,trades:100+i,tb:volume*.54,takerBuyQuoteVolume:quoteVolume*.54};
 });
}
function rawKline(row){return [row.t,String(row.o),String(row.h),String(row.l),String(row.c),String(row.v),row.closeTime,String(row.quoteVolume),String(row.trades),String(row.tb),String(row.takerBuyQuoteVolume),String(row.quoteVolume-row.takerBuyQuoteVolume)];}

test("indicator inventory is exactly eight directional and two context indicators",()=>{
 assert.equal(defs.length,10);
 assert.equal(directionalIds.size,8);
 assert.equal(directionalDefs.length,8);
});

test("EMA uses an SMA seed and Wilder RSI handles flat markets",()=>{
 assert.deepEqual(ema([1,2,3,4],3),[null,null,2,3]);
 const flat=Array.from({length:40},()=>({c:100,h:101,l:99,v:10}));
 const rsi=calc("rsi",flat);
 assert.equal(rsi[14],50);
 assert.equal(rsi.at(-1),50);
});

test("Wilder RSI matches the published 14-period reference example",()=>{
 const closes=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28];
 const rows=closes.map(c=>({c,h:c+1,l:c-1,v:100}));
 assert.ok(Math.abs(calc("rsi",rows)[14]-70.464)<0.01);
});

test("Wilder ATR and ADX use the expected 14-period seed positions",()=>{
 const flat=Array.from({length:40},()=>({c:100,h:101,l:99,v:10}));
 const atr=calc("atr",flat);
 assert.equal(atr[13],null);
 assert.equal(atr[14],2);
 const trend=Array.from({length:50},(_,i)=>({c:100+i,h:102+i*2,l:99+i,v:10}));
 const adx=calc("adx",trend);
 assert.equal(adx[26],null);
 assert.ok(Math.abs(adx[27]-100)<1e-8);
});

test("signal clustering only combines same direction and nearby pivots",()=>{
 const items=[
  {id:"rsi",tf:"1h",side:"bull",index:101,time:1010},
  {id:"mfi",tf:"1h",side:"bull",index:103,time:1030},
  {id:"cci",tf:"1h",side:"bull",index:99,time:990},
  {id:"rsi",tf:"1h",side:"bull",index:100,time:1000},
  {id:"macd",tf:"1h",side:"bear",index:101,time:1010},
  {id:"obv",tf:"4h",side:"bull",index:101,time:1010}
 ];
 const groups=clusterSignals(items,3);
 const nearby=groups.find(g=>g.tf==="1h"&&g.side==="bull");
 assert.ok(nearby);
 assert.deepEqual(nearby.items.map(x=>x.id).sort(),["mfi","rsi"]);
 assert.equal(groups.length,4);
});

test("MFI returns a neutral value for a fully flat market",()=>{
 const rows=Array.from({length:40},()=>({c:100,h:101,l:99,v:10}));
 const mfi=calc("mfi",rows);
 assert.equal(mfi[14],50);
 assert.equal(mfi.at(-1),50);
});

test("directional and context indicators return finite bounded values",()=>{
 const rows=syntheticRows();
 for(const id of ["rsi","stochrsi","mfi","cci","obv","macd","cmf","adx","atr","vwap","relvol"]){
  const values=calc(id,rows);
  assert.equal(values.length,rows.length,id+" length");
  assert.ok(values.some(Number.isFinite),id+" should produce values");
  assert.ok(values.filter(Number.isFinite).every(Number.isFinite),id+" should not emit non-finite numbers");
 }
 for(const id of ["rsi","stochrsi","mfi","adx"]){
  assert.ok(calc(id,rows).filter(Number.isFinite).every(x=>x>=0&&x<=100),id+" range");
 }
 assert.ok(calc("cmf",rows).filter(Number.isFinite).every(x=>x>=-1.000001&&x<=1.000001));
 assert.ok(calc("atr",rows).filter(Number.isFinite).every(x=>x>0));
});

test("relative volume compares the current closed candle with the previous 20 candles",()=>{
 const rows=syntheticRows(25).map((r,i)=>({...r,v:i===24?2000:1000}));
 const value=calc("relvol",rows).at(-1);
 assert.equal(value,2);
});

test("confirmed pivot engine identifies regular bullish and bearish divergences",()=>{
 const price=Array(32).fill(10),osc=Array(32).fill(50);
 price[5]=5;price[15]=4;osc[5]=20;osc[15]=30;
 assert.ok(divergences(price,osc).some(x=>x.type==="Pozitif"));
 const price2=Array(32).fill(10),osc2=Array(32).fill(50);
 price2[5]=20;price2[15]=22;osc2[5]=80;osc2[15]=70;
 assert.ok(divergences(price2,osc2).some(x=>x.type==="Negatif"));
});

test("pivot engine detects hidden bullish and bearish divergences",()=>{
 const p=Array(32).fill(10),o=Array(32).fill(50);
 p[5]=5;p[15]=6;o[5]=30;o[15]=20;
 assert.ok(divergences(p,o).some(x=>x.type==="Gizli pozitif"));
 const p2=Array(32).fill(10),o2=Array(32).fill(50);
 p2[5]=22;p2[15]=20;o2[5]=70;o2[15]=80;
 assert.ok(divergences(p2,o2).some(x=>x.type==="Gizli negatif"));
});

test("pivot engine does not treat equal-price plateaus as repeated pivots",()=>{
 const values=Array(20).fill(10);values[8]=4;
 assert.deepEqual(pivots(values,"low").map(x=>x.i),[8]);
});

test("kline normalization sorts, deduplicates, validates and excludes the open candle",()=>{
 const rows=syntheticRows(110);
 const raw=[...rows.map(rawKline),rawKline(rows[0])];
 raw[109][6]=2000000000;
 const normalized=normalizeKlines(raw,1000000000);
 assert.equal(normalized.length,109);
 assert.ok(normalized.every(x=>x.closeTime<1000000000));
 assert.ok(normalized.every((x,i)=>i===0||x.t>normalized[i-1].t));
});

test("kline normalization rejects missing intervals and stale feed data",()=>{
 const rows=syntheticRows(110);
 const interval=900000;
 const withGap=rows.filter((_,i)=>i!==50).map(rawKline);
 assert.throws(()=>normalizeKlines(withGap,rows.at(-1).closeTime+1,interval),/zaman boşluğu/);
 const now=rows.at(-1).closeTime+interval*3;
 assert.throws(()=>normalizeKlines(rows.map(rawKline),now,interval),/güncel değil/);
});

test("kline normalization rejects a conflicting duplicate candle",()=>{
 const rows=syntheticRows(105).map(rawKline);
 const duplicate=rows[20].slice();duplicate[4]=String(Number(duplicate[4])+1);
 rows.push(duplicate);
 assert.throws(()=>normalizeKlines(rows,1000000000),/Çakışan mükerrer mum/);
});

test("kline normalization rejects impossible OHLC and taker-volume data",()=>{
 const rows=syntheticRows(105).map(rawKline);
 rows[10][2]="1";
 assert.throws(()=>normalizeKlines(rows,1000000000),/OHLCV tutarsızlığı/);
 const rows2=syntheticRows(105).map(rawKline);
 rows2[12][10]=String(Number(rows2[12][7])*1.5);
 assert.throws(()=>normalizeKlines(rows2,1000000000),/OHLCV tutarsızlığı/);
});
