import {chromium} from 'playwright';import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(new URL('../site/',import.meta.url).pathname),out=path.resolve('test-output');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}const ext=path.extname(f);res.setHeader('Content-Type',ext==='.js'?'text/javascript':ext==='.html'?'text/html':ext==='.json'?'application/json':ext==='.mp4'?'video/mp4':'application/octet-stream');fs.createReadStream(f).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--disk-cache-size=1']}),page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('[data-example="2b"]').click();await page.waitForFunction(()=>document.querySelector('#timeline').value.includes('"seconds": 45'),null,{timeout:60000});
 await page.route('**/models/*/runtime.js',route=>route.abort('failed'));
 await page.locator('#laya').check();
 // The replayed recording already holds a finished run; only lines from this live run count.
 const before=(await page.locator('#status').textContent()).split('\n').length;await page.locator('#analyze').click();
 await page.waitForFunction(n=>{const l=document.querySelector('#status').textContent.split('\n').slice(n);return l.some(x=>x.startsWith('review: ready')||x.startsWith('pipeline: needs attention'));},before,{timeout:180000});
 const audit=(await page.locator('#status').textContent()).split('\n').slice(before).join('\n');
 for(const id of ['voz','ear','uhm','align','clips','clear'])if(!audit.includes(`${id}: failed`))throw Error('Missing failed stage '+id);
 if(!audit.includes('review: ready')||!audit.includes('Laya: needs review')&&!audit.includes('Laya: fallback passed'))throw Error(audit);
 const result={date:new Date().toISOString(),test:'Intentional runtime-download failures, not model inference',allSixStageFailuresHandled:true,realLayaDecision:true,audit,errors};
 fs.writeFileSync(`${root}/failover-browser-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}


