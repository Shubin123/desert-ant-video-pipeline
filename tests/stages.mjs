// Real models, one at a time from the graph: each stage is started on its own with "Run stage" and must complete real inference.
// Then Timeline and Export run from the graph. Writes site/stage-browser-verification.json.
import fs from 'node:fs';
import path from 'node:path';
import {start,root,loadExample,audit,runStage,tones,check,finish} from './lib/harness.mjs';
const results=[],report={date:new Date().toISOString(),stages:{}},h=await start(),{page,base}=h;
try{
  await page.goto(base+'#/graph');await loadExample(page);
  for(const id of ['voz','ear','uhm','align','clips','clear']){
    const before=(await audit(page)).split('\n').length,t0=Date.now();
    await runStage(page,id,'stage',1200000);
    const lines=(await audit(page)).split('\n').slice(before).filter(l=>l.startsWith(id+':')),tone=(await tones(page))[id];
    report.stages[id]={tone,seconds:Math.round((Date.now()-t0)/1000),log:lines};
    check(results,`${id}: real inference from the graph`,tone==='passed'&&lines.some(l=>l.startsWith(`${id}: passed — Real model inference completed`)),lines.at(-1));
  }
  const align=report.stages.align.log.find(l=>/words refined/.test(l));if(align)report.stages.align.repair=align;
  await runStage(page,'review');check(results,'Timeline from the graph',(await tones(page)).review==='passed');
  await runStage(page,'export','stage',600000);const exported=await page.evaluate(()=>window.lastExport);
  check(results,'Export from the graph is frame-exact',exported?.frames===1350&&exported?.seconds===45,JSON.stringify(exported));
  report.export=exported;report.results=JSON.parse(await page.locator('#results').textContent());delete report.results.transcript;
  report.errors=h.errors;check(results,'no page errors',h.errors.length===0,h.errors.join('; '));
  fs.writeFileSync(path.join(root,'stage-browser-verification.json'),JSON.stringify(report,null,2));
}catch(e){check(results,'stages run',false,e.stack);}
finally{await h.close();}
finish(results,'stages');
