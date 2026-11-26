import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const match=html.match(/<script type="module">([\\s\\S]*?)<\\/script>/);
if(!match)throw new Error("Browser module script not found in index.html");
const temp=join(tmpdir(),"matrix-mini-app-client-check.mjs");
writeFileSync(temp,match[1]);
const result=spawnSync(process.execPath,["--check",temp],{stdio:"inherit"});
try{unlinkSync(temp);}catch{}
if(result.status!==0)process.exit(result.status||1);
console.log("Browser module syntax: OK");
