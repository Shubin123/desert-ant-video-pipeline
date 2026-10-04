import {NODES,order} from './graph.js';

// Runs each step in dependency order. A step is {when?(ctx), run(ctx)}; nodes without a step are display-only.
export async function runPipeline(steps,ctx,{nodes=NODES,onSkip}={}){
  for(const node of order(nodes)){
    const step=steps[node.id];
    if(!step)continue;
    ctx.signal?.throwIfAborted();
    if(step.when&&!step.when(ctx)){onSkip?.(node.id);continue;}
    await step.run(ctx);
  }
}
