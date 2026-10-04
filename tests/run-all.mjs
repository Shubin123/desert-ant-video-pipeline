// Runs every suite in order and prints a summary. FULL=1 adds the real-model suites (large downloads, several minutes).
import {spawnSync} from 'node:child_process';
const suites=[
  ['unit','tests/unit.mjs'],['integration','tests/integration.mjs'],['render (FFmpeg fallback)','tests/render.mjs'],['smoke','tests/smoke.mjs'],['model contracts e2e','tests/contracts.mjs'],['workflow editor e2e','tests/editor.mjs'],['ui e2e','tests/ui.mjs'],
  ['browser e2e (Laya + export)','tests/browser.mjs'],['voice-over e2e','tests/voice.mjs'],['failover e2e','tests/failover.mjs'],
  ...(process.env.FULL?[['real models per stage','tests/stages.mjs'],['real full pipeline','tests/browser.mjs',{FULL_PIPELINE:'1'}]]:[]),
];
const summary=[];
for(const [name,file,env] of suites){
  const t0=Date.now();console.log(`\n▶ ${name}`);
  const r=spawnSync(process.execPath,[file],{stdio:'inherit',env:{...process.env,...env}});
  summary.push({suite:name,result:r.status===0?'pass':'FAIL',seconds:Math.round((Date.now()-t0)/1000)});
}
console.log('\n');console.table(summary);
if(!process.env.FULL)console.log('Real-model suites skipped. Run FULL=1 npm run test:all to include them.');
process.exitCode=summary.some(s=>s.result!=='pass')?1:0;
