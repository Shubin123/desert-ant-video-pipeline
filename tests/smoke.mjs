// Smoke: the app boots cleanly, every local asset and module loads, every model runtime and CDN dependency resolves.
// PIPELINE_URL=https://shubin123.github.io/desert-ant-video-pipeline/ smoke-tests the deployed site instead.
import fs from 'node:fs';
import path from 'node:path';
import {start,root,check,finish} from './lib/harness.mjs';
const results=[],h=await start(),{page,base}=h;
try{
  const response=await page.goto(base);
  check(results,'index responds 200',response.status()===200);
  check(results,'title',await page.title()==='Desert Ant · Video pipeline');
  await page.waitForFunction(()=>document.querySelectorAll('.stage-card').length===10&&document.querySelectorAll('#view-graph .node').length===10);
  check(results,'grid and graph mount 10 stages',true);
  check(results,'18 model demo links',await page.locator('#models a').count()===18);
  const modules=['app.js','export.js','failover.js','runner.js','pipeline/graph.js','pipeline/engine.js','pipeline/steps.js','pipeline/workflow.js','pipeline/demos.js','pipeline/words.js','ui/status.js','ui/grid.js','ui/graph.js','ui/router.js','ui/sortable.js'];
  const imported=await page.evaluate(async list=>{const out={};for(const m of list){try{const mod=m==='runner.js'||m==='app.js'?null:await import('./'+m);out[m]=mod?Object.keys(mod).length:'entry';}catch(e){out[m]='ERR '+e.message;}}return out;},modules);
  for(const [m,v] of Object.entries(imported))check(results,`module ${m} imports`,!String(v).startsWith('ERR'),String(v));
  const links=await page.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>!/^(https?:|#|mailto:)/.test(h)));
  for(const href of new Set(links)){const r=await page.request.get(new URL(href,base).href);check(results,`link ${href}`,r.ok(),String(r.status()));}
  for(const f of ['verification.json','media-verification.json','voiceover-browser-verification.json','failover-browser-verification.json','pipeline-browser-verification.json','examples/1b.json','examples/2b.json']){let ok=false;try{JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));ok=true;}catch{}check(results,`${f} is valid JSON`,ok);}
  // Runner realm: import map parses and every model runtime module exposes load().
  // Opened top-level, the runner would message itself; silence that so only imports are exercised.
  await page.addInitScript(()=>{if(location.pathname.endsWith('runner.html'))window.postMessage=()=>{};});
  await page.goto(base+'runner.html?model=none&nonce=smoke');
  const runtimes=await page.evaluate(async()=>{const map=JSON.parse(document.querySelector('script[type=importmap]').textContent),out={};for(const id of ['voz','ear','uhm','align','clips','clear']){try{const m=await import(`./models/${id}/runtime.js`);out[id]=typeof m.load;}catch(e){out[id]='ERR '+e.message;}}return {imports:Object.values(map.imports),scoped:Object.values(map.scopes??{}).flatMap(Object.values),out};});
  for(const [id,v] of Object.entries(runtimes.out))check(results,`runtime ${id} exposes load()`,v==='function',v);
  for(const url of new Set([...runtimes.imports,...runtimes.scoped])){let status=0;try{status=(await fetch(url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(20000)})).status;}catch(e){status=e.message;}check(results,`CDN ${url.replace('https://','')}`,status===200,String(status));}
  const local=h.requests.filter(r=>r.status!==200);
  check(results,'no failed local requests',local.length===0,local.map(r=>r.url).join(', '));
  check(results,'no page errors',h.errors.length===0,h.errors.join('; '));
  check(results,'no console errors',h.consoleErrors.length===0,h.consoleErrors.join('; '));
}catch(e){check(results,'smoke run',false,e.message);}
finally{await h.close();}
finish(results,'smoke');
