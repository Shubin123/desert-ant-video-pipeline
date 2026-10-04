import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(new URL('../site/',import.meta.url).pathname);
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.mp4':'video/mp4','.svg':'image/svg+xml'};
const TONE={running:'running',passed:'passed','fallback passed':'passed',loaded:'passed',ready:'passed',imported:'fallback',fallback:'fallback',skipped:'fallback','needs review':'review',failed:'failed',unavailable:'failed'};
const ALIAS={Laya:'laya','worked example':'source',example:'source',input:'source',transcript:'voz',timeline:'review'};
// Every stage's tone in both views must match the last audit line for that stage.
async function checkViews(page,label){
 const audit=await page.locator('#status').textContent(),expected={};
 for(const line of audit.split('\n')){const m=line.match(/^(.+?): (.+?) — /);if(!m)continue;const id=ALIAS[m[1]]??m[1];if(TONE[m[2]])expected[id]=TONE[m[2]];}
 const tones=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.stage-card')].map(c=>[c.dataset.stage,[c.dataset.tone,document.querySelector(`.node[data-stage="${c.dataset.stage}"]`)?.dataset.tone]])));
 if(Object.keys(tones).length!==10)throw Error(`${label}: expected 10 stage cards`);
 for(const [id,[grid,graph]] of Object.entries(tones)){if(grid!==graph)throw Error(`${label}: ${id} grid ${grid} vs graph ${graph}`);if(expected[id]&&grid!==expected[id])throw Error(`${label}: ${id} shows ${grid}, audit says ${expected[id]}`);}
 return tones;
}
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
 if(await page.locator('#view-grid').isHidden()||await page.locator('#view-graph').isVisible())throw Error('Grid should be the default view');
 await checkViews(page,'example loaded');
 await page.locator('[data-route="graph"]').click();await page.waitForFunction(()=>location.hash==='#/graph'&&document.querySelector('#view-grid').hidden);
 const shape=await page.evaluate(()=>({nodes:document.querySelectorAll('#view-graph .node').length,edges:document.querySelectorAll('#view-graph .edge').length,failover:document.querySelectorAll('#view-graph .edge.failover').length}));
 if(shape.nodes!==10||shape.edges!==13||shape.failover!==2)throw Error('Unexpected graph shape '+JSON.stringify(shape));
 await page.locator('#view-graph .node[data-stage="clips"]').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>location.hash==='#/graph/clips'&&!document.querySelector('#stage-detail').hidden&&document.querySelector('#stage-detail h3').textContent.startsWith('Clips'));
 await page.locator('#stage-detail .close').click();await page.waitForFunction(()=>document.querySelector('#stage-detail').hidden&&location.hash==='#/graph');
 await page.goto(base+'#/grid/source');await page.waitForFunction(()=>!document.querySelector('#stage-detail').hidden&&document.querySelector('.stage-card[data-stage="source"]').getAttribute('aria-pressed')==='true');
 await page.goBack();await page.waitForFunction(()=>location.hash==='#/graph'&&document.querySelector('#view-grid').hidden);
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);if(overflow>0)throw Error(`Page overflows by ${overflow}px at ${width}px`);}
 console.log(JSON.stringify({ui:'grid/graph routing, deep links, keyboard, detail panel, no overflow',graph:shape}));
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
 if((await checkViews(page,'after export')).export[0]!=='passed')throw Error('Export stage not marked passed');
 console.log(JSON.stringify({browserExport:exported,verifiedSeconds:probe.format.duration,verifiedFrames:video.nb_read_frames,errors}));
 if(process.env.FULL_PIPELINE){
  await page.locator('#analyze').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('review: ready')||document.querySelector('#status').textContent.includes('pipeline: needs attention'),null,{timeout:1800000});
  const audit=await page.locator('#status').textContent(),results=await page.locator('#results').textContent(),views=await checkViews(page,'full pipeline');
  fs.writeFileSync(path.join(root,'pipeline-browser-verification.json'),JSON.stringify({date:new Date().toISOString(),audit,stageViews:views,results:JSON.parse(results),errors},null,2));
  console.log(JSON.stringify({fullPipeline:audit,errors}));
  if(!audit.includes('review: ready'))throw Error('Full pipeline did not complete');
 }
 if(errors.length)throw Error('Page errors: '+errors.join('; '));
 await page.screenshot({path:'test-output/pipeline.png',fullPage:true});
}finally{await browser.close();await new Promise(r=>server.close(r));}

