// Shared browser-test harness: static server for site/, system Chrome, error collection.
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
export const root=path.resolve(new URL('../../site/',import.meta.url).pathname);
export const out=path.resolve('test-output');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.mp4':'video/mp4','.svg':'image/svg+xml','.md':'text/markdown','.wav':'audio/wav'};

export async function start({viewport={width:1280,height:900},blockModels=false}={}){
  const requests=[];
  const server=http.createServer((req,res)=>{
    const name=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname)),file=name.endsWith('/')?name+'index.html':name;
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.stat(file,(error,stat)=>{requests.push({url:req.url,status:error?404:200});if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Length',stat.size);fs.createReadStream(file).pipe(res);});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=process.env.PIPELINE_URL||`http://127.0.0.1:${server.address().port}/`;
  const browser=await chromium.launch({channel:'chrome',headless:!process.env.HEADED,args:['--autoplay-policy=no-user-gesture-required','--disk-cache-size=1']});
  const context=await browser.newContext({acceptDownloads:true,viewport});
  const page=await context.newPage(),errors=[],consoleErrors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  if(blockModels)await page.route('**/models/*/runtime.js',r=>r.abort('failed'));
  const close=async()=>{await browser.close();await new Promise(r=>server.close(r));};
  return {base,browser,context,page,errors,consoleErrors,requests,close};
}

export async function loadExample(page,id='2b'){
  await page.locator(`[data-example="${id}"]`).click();
  await page.waitForFunction(s=>document.querySelector('#timeline').value.includes(`"seconds": ${s}`),id==='2b'?45:120,{timeout:60000});
}
export const audit=page=>page.locator('#status').textContent();
export const waitIdle=(page,timeout=600000)=>page.waitForFunction(()=>![...document.querySelectorAll('#analyze,#export')].some(b=>b.disabled),null,{timeout});
export async function runStage(page,id,mode='stage',timeout=600000){
  await page.evaluate(id=>{location.hash=`#/graph/${id}`;},id);
  await page.waitForFunction(id=>!document.querySelector('#stage-detail').hidden&&document.querySelector('#stage-detail h3').textContent.toLowerCase().startsWith(id==='review'?'timeline':id),id);
  await page.locator(`#stage-detail [data-run="${mode}"]`).click();
  await page.waitForFunction(()=>document.querySelector('#analyze').disabled,null,{timeout:5000}).catch(()=>{});
  await waitIdle(page,timeout);
}
export const tones=page=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.stage-card')].map(c=>[c.dataset.stage,c.dataset.tone])));
export function check(results,name,ok,detail=''){results.push({name,ok:!!ok,detail});console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?' — '+detail:''}`);}
export function finish(results,label){const failed=results.filter(r=>!r.ok);console.log(`${label}: ${results.length-failed.length}/${results.length} passed`);if(failed.length)process.exitCode=1;return failed.length===0;}
