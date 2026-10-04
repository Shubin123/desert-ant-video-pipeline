import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(new URL('../site/',import.meta.url).pathname);
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.mp4':'video/mp4','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const name=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));const file=name.endsWith('/')?name+'index.html':name;if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(error,stat)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Length',stat.size);fs.createReadStream(file).pipe(res);});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.PIPELINE_URL||`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--disk-cache-size=1']});
const context=await browser.newContext({acceptDownloads:true});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await page.goto(base);
 await page.locator('[data-example="2b"]').click();
 await page.waitForFunction(()=>document.querySelector('#timeline').value.includes('"seconds": 45'),null,{timeout:60000});
 await page.locator('#validate').click();
 if(!await page.locator('#status').textContent().then(s=>s.includes('1350 frames')))throw Error('Timeline validation failed');
 await page.locator('#laya').check();
 await page.locator('#fallback').click();
 await page.waitForFunction(()=>/Laya: (fallback passed|needs review|unavailable)/.test(document.querySelector('#status').textContent),null,{timeout:150000});
 const laya=await page.locator('#status').textContent();
 if(!laya.includes('Laya: fallback passed')&&!laya.includes('Laya: needs review'))throw Error(laya);
 console.log(JSON.stringify({laya}));
 // Restore curated edit before checking exact MP4 output.
 await page.locator('[data-example="2b"]').click();
 await page.waitForFunction(()=>document.querySelector('#timeline').value.includes('"hold": 50'),null,{timeout:60000});
 await page.locator('#export').click();
 await page.waitForFunction(()=>window.lastExport||document.querySelector('#status').textContent.includes('needs attention'),null,{timeout:300000});
 const exported=await page.evaluate(()=>window.lastExport);
 if(!exported)throw Error(await page.locator('#status').textContent());
 const downloadPromise=page.waitForEvent('download');await page.locator('#downloads a').first().click();const download=await downloadPromise;fs.mkdirSync('test-output',{recursive:true});const destination=path.resolve('test-output/browser-export-45s.mp4');await download.saveAs(destination);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',destination]));const video=probe.streams.find(s=>s.codec_type==='video');
 if(Number(probe.format.duration)!==45||Number(video.nb_read_frames)!==1350)throw Error('Browser export is not exact');
 console.log(JSON.stringify({browserExport:exported,verifiedSeconds:probe.format.duration,verifiedFrames:video.nb_read_frames,errors}));
 if(process.env.FULL_PIPELINE){
  await page.locator('#analyze').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('review: ready')||document.querySelector('#status').textContent.includes('pipeline: needs attention'),null,{timeout:1800000});
  const audit=await page.locator('#status').textContent(),results=await page.locator('#results').textContent();
  fs.writeFileSync(path.join(root,'pipeline-browser-verification.json'),JSON.stringify({date:new Date().toISOString(),audit,results:JSON.parse(results),errors},null,2));
  console.log(JSON.stringify({fullPipeline:audit,errors}));
  if(!audit.includes('review: ready'))throw Error('Full pipeline did not complete');
 }
 await page.screenshot({path:'test-output/pipeline.png',fullPage:true});
}finally{await browser.close();await new Promise(r=>server.close(r));}

