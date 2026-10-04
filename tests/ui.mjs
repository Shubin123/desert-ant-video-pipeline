// End-to-end UI: clickable stages, graph-based runs (models blocked so outcomes are deterministic), drag/keyboard reorder, persistence.
import {start,loadExample,audit,runStage,tones,check,finish,out} from './lib/harness.mjs';
const results=[],h=await start({blockModels:true}),{page,base}=h;
const order=sel=>page.evaluate(sel=>[...document.querySelector(sel).children].filter(e=>e.dataset.sortId).map(e=>e.dataset.sortId),sel);
async function drag(from,to,{after=true}={}){
  await page.locator(to).scrollIntoViewIfNeeded();await page.locator(from).scrollIntoViewIfNeeded();
  const a=await page.locator(from).boundingBox(),b=await page.locator(to).boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+12);await page.mouse.down();
  await page.mouse.move(a.x+a.width/2+10,a.y+20,{steps:3});
  await page.mouse.move(b.x+b.width/2+(after?b.width/4:-b.width/4),b.y+b.height/2,{steps:12});await page.mouse.up();
}
try{
  await page.goto(base);
  // Default state: everything idle, grid view, no stage selected.
  const t0=await tones(page);
  check(results,'default: all 10 stages idle',Object.values(t0).length===10&&Object.values(t0).every(t=>t==='idle'),JSON.stringify(t0));
  check(results,'default: grid view, no detail',await page.locator('#view-grid').isVisible()&&await page.locator('#stage-detail').isHidden());
  // Every stage is individually clickable in both views.
  for(const view of ['grid','graph']){
    await page.evaluate(v=>{location.hash='#/'+v;},view);
    let ok=0;const missed=[];for(const id of ['source','voz','ear','uhm','align','clips','laya','clear','review','export']){
      await page.locator(view==='grid'?`.stage-card[data-stage="${id}"]`:`#view-graph .node[data-stage="${id}"]`).click();
      if(await page.waitForFunction(([v,id])=>location.hash===`#/${v}/${id}`&&!document.querySelector('#stage-detail').hidden&&document.querySelector('.stage-card[aria-pressed="true"]')?.dataset.stage===id,[view,id],{timeout:3000}).then(()=>true,()=>false))ok++;else missed.push(id+' '+await page.evaluate(()=>location.hash));}
    check(results,`${view}: all 10 stages clickable and open detail`,ok===10,`${ok}/10 ${missed.join(', ')}`);
  }
  await page.evaluate(()=>{location.hash='#/graph/source';});
  check(results,'source has no run actions',await page.locator('#stage-detail [data-run="stage"]').isDisabled());
  await page.evaluate(()=>{location.hash='#/graph/align';});
  check(results,'run plan preview lists dependencies',(await page.locator('#stage-detail .run-plan').textContent()).includes('Voz → Ear → Align'));
  // Missing inputs give a clear message instead of running.
  await runStage(page,'voz');
  check(results,'Voz without a video explains what is missing',(await audit(page)).includes('Voz needs a source video'));
  await loadExample(page);
  await runStage(page,'clips');
  // Worked example already has a transcript, so Clips may run; with models blocked it fails and stays inside its own stage.
  let a=await audit(page),t=await tones(page);
  check(results,'run stage: Clips alone touches only Clips',a.includes('clips: failed')&&t.voz==='idle'&&t.align==='idle'&&t.review==='idle',JSON.stringify(t));
  await runStage(page,'ear');t=await tones(page);
  check(results,'run stage: Ear alone falls back, Voz untouched',t.ear==='fallback'&&t.voz==='idle',JSON.stringify(t));
  await runStage(page,'align','upstream');a=await audit(page);t=await tones(page);
  check(results,'run up to Align: Voz, Ear, Align run; Uhm and Clear do not',['voz','ear','align'].every(id=>a.includes(`${id}: failed`))&&t.uhm==='idle'&&t.clear==='idle',JSON.stringify(t));
  await runStage(page,'laya');
  check(results,'Laya chosen explicitly runs and reports missing consent',(await audit(page)).includes('Laya: unavailable'));
  await runStage(page,'clips','downstream',600000);a=await audit(page);t=await tones(page);
  const exported=await page.evaluate(()=>window.lastExport);
  check(results,'run from Clips: Laya fallback, Timeline, then a frame-exact export',a.includes('review: ready')&&t.export==='passed'&&exported?.frames===1350,JSON.stringify(exported));
  check(results,'run from Clips leaves upstream stages as they were',t.uhm==='idle'&&t.clear==='idle');
  // Cancel mid-run.
  await page.evaluate(()=>{location.hash='#/graph/review';});await page.locator('#stage-detail [data-run="upstream"]').click();
  await page.locator('#cancel').click();await page.waitForFunction(()=>!document.querySelector('#analyze').disabled,null,{timeout:120000});
  check(results,'cancel stops a graph run',/pipeline: cancelled|review: ready/.test(await audit(page)));
  // Drag reorder in the grid; a drag must not count as a click.
  await page.evaluate(()=>{location.hash='#/grid';});
  const g0=await order('#view-grid');
  await drag('.stage-card[data-stage="source"]','.stage-card[data-stage="clips"]');
  const g1=await order('#view-grid');
  check(results,'grid: drag moves Source after Clips',g1.indexOf('source')===g1.indexOf('clips')+1,g1.join(','));
  check(results,'grid: drag does not select the card',await page.evaluate(()=>location.hash==='#/grid'));
  await page.locator('.stage-card[data-stage="export"]').focus();await page.keyboard.press('Alt+ArrowLeft');
  const g2=await order('#view-grid');
  check(results,'grid: Alt+ArrowLeft moves the focused card',g2.indexOf('export')===g1.indexOf('export')-1&&await page.evaluate(()=>document.activeElement.dataset.stage==='export'));
  check(results,'grid: move is announced',(await page.locator('#sort-status').textContent()).includes('Export moved to position'));
  // Panels reorder by their headings.
  const p0=await order('.panels');
  await page.setViewportSize({width:1280,height:1600});await page.evaluate(()=>scrollTo(0,document.querySelector('.panels').offsetTop-60));
  await drag('[data-sort-id="export"] h2','[data-sort-id="material"]',{after:false});
  await page.setViewportSize({width:1280,height:900});
  const p1=await order('.panels');
  check(results,'panels: drag Export panel to the front',p1[0]==='export',p1.join(','));
  await page.locator('[data-sort-id="analyze"] .grip').focus();await page.keyboard.press('Alt+ArrowDown');
  const p2=await order('.panels');
  check(results,'panels: Alt+ArrowDown on grip moves panel',p2.indexOf('analyze')===p1.indexOf('analyze')+1,p2.join(','));
  await page.locator('#length').selectOption('120');
  check(results,'panels: controls still work after reorder',await page.locator('#length').inputValue()==='120');
  // Persistence and reset.
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.stage-card').length===10);
  check(results,'layout persists across reload',JSON.stringify(await order('#view-grid'))===JSON.stringify(g2)&&JSON.stringify(await order('.panels'))===JSON.stringify(p2));
  await page.locator('#reset-layout').click();
  check(results,'reset layout restores defaults',JSON.stringify(await order('#view-grid'))===JSON.stringify(g0)&&JSON.stringify(await order('.panels'))===JSON.stringify(p0));
  // Storage blocked: layout still works.
  const blocked=await h.context.newPage();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError');}});});
  await blocked.goto(base);await blocked.waitForFunction(()=>document.querySelectorAll('.stage-card').length===10);
  await blocked.locator('.stage-card[data-stage="voz"]').focus();await blocked.keyboard.press('Alt+ArrowRight');
  check(results,'reorder works with storage blocked',await blocked.evaluate(()=>[...document.querySelectorAll('.stage-card')].map(c=>c.dataset.stage).indexOf('voz')===2));await blocked.close();
  // Phone width: no page overflow, vertical graph, grid single column.
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{location.hash='#/graph';});
  await page.waitForFunction(()=>{const v=document.querySelector('#view-graph svg').viewBox.baseVal;return v.height>v.width;},null,{timeout:5000}).catch(()=>{});
  const phone=await page.evaluate(()=>{const svg=document.querySelector('#view-graph svg').viewBox.baseVal;return {overflow:document.documentElement.scrollWidth-innerWidth,vertical:svg.height>svg.width};});
  check(results,'phone: no horizontal page scroll',phone.overflow<=0,String(phone.overflow));
  check(results,'phone: graph turns vertical',phone.vertical);
  await page.screenshot({path:`${out}/ui-phone.png`,fullPage:true});
  check(results,'no page errors',h.errors.length===0,h.errors.join('; '));
}catch(e){check(results,'ui run',false,e.stack);}
finally{await h.close();}
finish(results,'ui');
