// Records each demo project by running this app under the demo's conditions and saving the project it leaves behind
// to site/demos/<id>.json. Real-model demos download the original models and take minutes (Clips alone ~6 min).
// Usage: node tools/record-demos.mjs [id ...]   (default: every demo without a recording; --all re-records all)
import fs from 'node:fs';
import path from 'node:path';
import {start,root,loadExample,audit,waitIdle} from '../tests/lib/harness.mjs';
import {DEMOS} from '../site/pipeline/demos.js';

const args=process.argv.slice(2),file=id=>path.join(root,'demos',`${id}.json`);
const todo=DEMOS.filter(d=>d.record&&(args.includes(d.id)||(!args.some(a=>!a.startsWith('--'))&&(args.includes('--all')||!fs.existsSync(file(d.id))))));
fs.mkdirSync(path.join(root,'demos'),{recursive:true});
const h=await start({cache:true}),{page,base}=h;
try{
  for(const d of todo){
    const t0=Date.now();console.log(`▶ ${d.id}`);
    // A fresh page per demo: a hash-only goto would keep the previous demo's state.
    await page.goto('about:blank');await page.goto(base+'#/grid');await loadExample(page,d.example);
    await page.locator('#workflow').selectOption(d.workflow??'full');
    // Activate the demo's conditions without loading its (possibly missing) recording.
    await page.evaluate(id=>{document.querySelector('#demo').value=id;},d.id);
    await page.locator('#laya').setChecked(!!d.record.laya);
    const {run,stage,cancel}=d.record;
    if(run==='analyze')await page.locator('#analyze').click();
    else{await page.evaluate(id=>{location.hash=`#/graph/${id}`;},stage);await page.waitForFunction(id=>document.querySelector('.node[aria-pressed="true"]')?.dataset.stage===id&&!document.querySelector('#stage-detail').hidden,stage);await page.locator(`#stage-detail [data-run="${run}"]`).click();}
    if(cancel){await page.waitForFunction(id=>document.querySelector('#status').textContent.includes(`${id}: running`),stage);await page.waitForTimeout(1500);await page.locator('#cancel').click();}
    await page.waitForFunction(()=>document.querySelector('#analyze').disabled,null,{timeout:5000}).catch(()=>{});
    await waitIdle(page,1800000);
    if(d.record.export){await page.locator('#export').click();await waitIdle(page,600000);if(!await page.evaluate(()=>window.lastExport))throw Error(`${d.id}: export failed\n${await audit(page)}`);}
    const log=await audit(page);
    if(/pipeline: needs attention/.test(log))throw Error(`${d.id}: run needs attention\n${log}`);
    if(!log.includes(`demo: active — ${d.label}`))throw Error(`${d.id}: the run did not start\n${log}`);
    await page.locator('#project').click();
    const project=await page.evaluate(async()=>{const a=[...document.querySelectorAll('#downloads a')].find(x=>x.download==='pipeline-project.json');return (await fetch(a.href)).json();});
    const sourceSeconds=Number((await page.locator('#source-status').textContent()).match(/· ([\d.]+) seconds/)[1]);
    const exported=await page.evaluate(()=>window.lastExport??null);
    const saved={demo:d.id,label:d.label,date:new Date().toISOString(),example:d.example,sourceSeconds,recordedWith:d.faults||d.force?`injected faults: ${Object.keys(d.faults??{clips:1}).join(', ')}; every other stage ran its real model`:'real models only',
      plan:project.plan,words:project.words,results:project.results,audit:project.audit,export:exported,errors:h.errors.splice(0)};
    fs.writeFileSync(file(d.id),JSON.stringify(saved,null,1)+'\n');
    console.log(`  saved demos/${d.id}.json · ${saved.audit.length} audit entries · ${Math.round((Date.now()-t0)/1000)} s`);
  }
}finally{await h.close();}
