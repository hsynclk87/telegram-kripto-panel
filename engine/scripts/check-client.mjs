import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const renderPath=new URL("../public/index.html",import.meta.url);
const pagesPath=new URL("../../index.html",import.meta.url);
const render=readFileSync(renderPath,"utf8");
const pages=readFileSync(pagesPath,"utf8");
const files=[["Render",render],["GitHub Pages",pages]];
const ids=[...render.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
const idSet=new Set(ids);
const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
const references=[...render.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(match=>match[1]);
const missing=[...new Set(references.filter(id=>!idSet.has(id)))];
if(duplicates.length)throw new Error("Duplicate HTML IDs: "+duplicates.join(", "));
if(missing.length)throw new Error("JavaScript references missing HTML IDs: "+missing.join(", "));
if((render.match(/<style>/g)||[]).length!==1)throw new Error("Expected one consolidated stylesheet");
console.log("DOM ID and stylesheet audit: OK");
for(const [name,html] of files){
 const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 if(!match)throw new Error(name+" browser module script not found");
 const temp=join(tmpdir(),"matrix-mini-app-"+name.toLowerCase().replace(/\s+/g,"-")+".mjs");
 writeFileSync(temp,match[1]);
 const result=spawnSync(process.execPath,["--check",temp],{stdio:"inherit"});
 try{unlinkSync(temp);}catch{}
 if(result.status!==0)process.exit(result.status||1);
 console.log(name+" module syntax: OK");
}
const expected=render
 .replace("from './analysis-core.js'","from 'https://telegram-kripto-analysis-engine.onrender.com/analysis-core.js'")
 .replace("(()=>{'use strict';","const API_ORIGIN='https://telegram-kripto-analysis-engine.onrender.com';\n(()=>{'use strict';")
 .replace("const url='/api/klines?","const url=API_ORIGIN+'/api/klines?")
 .replace("fetch('/api/market-context?","fetch(API_ORIGIN+'/api/market-context?");
if(expected!==pages)throw new Error("GitHub Pages frontend has drifted from the canonical Render frontend");
if(pages.includes("knn-ui.js")||pages.includes("oscillator-lab.js"))throw new Error("Legacy indicator scripts are still referenced by GitHub Pages");
console.log("Render and GitHub Pages frontend parity: OK");
