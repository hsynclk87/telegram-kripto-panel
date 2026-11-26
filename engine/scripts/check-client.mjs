import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const renderPath=new URL("../public/index.html",import.meta.url);
const pagesPath=new URL("../../index.html",import.meta.url);
const render=readFileSync(renderPath,"utf8");
const pages=readFileSync(pagesPath,"utf8");
const ids=[...render.matchAll(/\\bid="([^"]+)"/g)].map(match=>match[1]);
const idSet=new Set(ids);
const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
const references=[...render.matchAll(/\\$\\(['"]([^'"]+)['"]\\)/g)].map(match=>match[1]);
const missing=[...new Set(references.filter(id=>!idSet.has(id)))];
if(duplicates.length)throw new Error("Duplicate HTML IDs: "+duplicates.join(", "));
if(missing.length)throw new Error("JavaScript references missing HTML IDs: "+missing.join(", "));
if((render.match(/<style>/g)||[]).length!==1)throw new Error("Expected one consolidated stylesheet");
console.log("DOM ID and stylesheet audit: OK");
for(const [name,html] of [["Render",render],["GitHub Pages",pages]]){
 const matches=[...html.matchAll(/<script type="module">([\\s\\S]*?)<\\/script>/g)];
 if(matches.length!==2)throw new Error(name+" expected two isolated JavaScript modules, found "+matches.length);
 for(let i=0;i<matches.length;i++){
  const temp=join(tmpdir(),"matrix-mini-app-"+name.toLowerCase().replace(/\\s+/g,"-")+"-"+i+".mjs");
  writeFileSync(temp,matches[i][1]);
  const result=spawnSync(process.execPath,["--check",temp],{stdio:"inherit"});
  try{unlinkSync(temp);}catch{}
  if(result.status!==0)process.exit(result.status||1);
 }
 console.log(name+" module syntax: OK");
}
const expected=render
 .replaceAll("from './analysis-core.js'","from 'https://telegram-kripto-analysis-engine.onrender.com/analysis-core.js'")
 .replaceAll("const API_ORIGIN=''","const API_ORIGIN='https://telegram-kripto-analysis-engine.onrender.com'");
if(expected!==pages)throw new Error("GitHub Pages frontend has drifted from the canonical Render frontend");
if(pages.includes("knn-ui.js")||pages.includes("oscillator-lab.js"))throw new Error("Legacy indicator scripts are still referenced by GitHub Pages");
console.log("Render and GitHub Pages frontend parity: OK");
