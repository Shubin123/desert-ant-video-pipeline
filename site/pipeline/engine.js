import {NODES,order} from './graph.js';

// Runs steps in dependency order. A step is {needs?(ctx), when?(ctx), run(ctx)}:
// needs returns a message when its inputs are missing; when lets a stage sit out (Laya only runs after a Clips failure).
// `only` limits the run to a set of stage ids; `target` is the stage the user chose, which always runs.
export async function runPipeline(steps,ctx,{nodes=NODES,only,target,onSkip}={}){
  const plan=order(nodes).filter(n=>steps[n.id]&&(!only||only.has(n.id)));
  if(target&&!steps[target])throw Error(`${nodes.find(n=>n.id===target)?.label??target} cannot be run on its own`);
  for(const node of plan){
    const step=steps[node.id];
    ctx.signal?.throwIfAborted();
    if(node.id!==target&&step.when&&!step.when(ctx)){onSkip?.(node.id);continue;}
    const missing=step.needs?.(ctx);
    if(missing)throw Error(`${node.label} needs ${missing}`);
    await step.run(ctx);
  }
  return plan.map(n=>n.id);
}
